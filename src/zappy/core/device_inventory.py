import pandas as pd
import ipaddress
import sqlite3
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

# Constants
DEVICE_TYPES = [
    "Audio", "Video", "Audiovisual", "Control",
    "Intercom", "Networking", "Security", "Surveillance", "Access Control"
]

MULTICAST_LABELS = ["Audio", "Video", "AUX", "Streaming"]


# Validators
def validate_job_id(value: str) -> bool:
    """
    Returns True if value matches exact format:
    - J followed by exactly 4 digits
    - J followed by 4 digits with a dash and 2 optional digits

    Args:
        value (str): Job ID as read from the CSV file

    Returns:
        bool: Returns True if passed, False if in incorrect format
    """
    if not value or not isinstance(value, str):
        return False
    value = value.strip().upper()
    pattern = r"^J\d{4}(-\d{2})?$"
    return bool(re.fullmatch(pattern, value))


def validate_ip(ip: str) -> bool:
    """
    Returns True only for RFC 1918 private IPs.

    Args:
        ip (str): IPv4 address as read the from CSV file

    Returns:
        bool: Returns True if passed, False if in incorrect format
    """
    try:
        ip_obj = ipaddress.IPv4Address(ip)
        return ip_obj.is_private
    except ipaddress.AddressValueError:
        return False
    
    
def validate_subnet_mask(mask: str) -> bool:
    """
    Returns True if subnet mask is contiguous or fits a valid format

    Args:
        mask (str): Subnet mask read from the CSV file

    Returns:
        bool: Returns True if passed, False if in incorrect format
    """
    if not mask or not isinstance(mask, str):
        return False
    try:
        ipaddress.IPv4Network(f"0.0.0.0/{mask}", strict=True)
        return True
    except (ipaddress.AddressValueError, ipaddress.NetmaskValueError, ValueError):
        return False
        
    
def validate_mac(mac: str) -> bool:
    """
    Returns True if subnet mask fits a valid format

    Args:
        mac (str): MAC address read from the CSV file
    Returns:
        bool: Returns True if passed, False if in incorrect format
    """
    return bool(re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", mac.lower()))


def validate_multicast_address(multicast: str) -> bool:
    """
    Returns True if multicast addressing is in a valid IPv4 address format within the multicast range

    Args:
        multicast (str): Multicast address read for the CSV file

    Returns:
        bool: Returns True if passed, False if in incorrect format
    """
    try:
        ip_obj = ipaddress.IPv4Address(multicast)
        return ip_obj.is_multicast
    except ipaddress.AddressValueError:
        return False


def validate_serial_number(val: Any) -> bool:
    """
    Returns True if serial number is present in field

    Args:
        port (Any): Serial number as read from CSV file

    Returns:
        bool: Returns True if passed, False if any but a string of integer
    """
    if pd.isna(val):
        return False
    s = str(val).strip()
    return bool(s)

    
@dataclass
class ValidationResult:
    valid: bool
    errors: List[str]
    
    
class DeviceInventory:
    REQUIRED_COLUMNS = [
        "job_id", "job_property", "device_name", "device_location", "device_type","ip_address", "mac_address", "subnet_mask", "default_gateway", "serial_number"
    ]
    
    OPTIONAL_COLUMNS= [
        "dns_1", "dns_2", "notes"
    ]
    
    def __init__(self, csv_path: Optional[Path] = None):
        self.df: Optional[pd.DataFrame] = None
        self.errors: List[str] = []
        if csv_path:
            self.load_and_validate(csv_path)
            
    def load_and_validate(self, csv_path: Path) -> ValidationResult:
        """
        Loads CSV and validates every row against the desired specs

        Args:
            csv_path (Path): CSV file being validated

        Returns:
            ValidationResult: Returns the ValidationResult class if the validation has passed or failed and all the errors found
        """
        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            return ValidationResult(False, [f"Failed to read CSV: {e}"])
        
        self.errors = []
        valid = True
        
        # --- Column Validation ---
        missing = [col for col in self.REQUIRED_COLUMNS if col not in df.columns]
        if missing:
            self.errors.append(f"Missing required columns: {', '.join(missing)}")
            return ValidationResult(False, self.errors)  # ← EARLY RETURN

        # === Add optional columns ===
        for col in self.OPTIONAL_COLUMNS:
            if col not in df.columns:
                df[col] = ""
        
        df = df.fillna("")

        # === Now safe to validate rows ===
        for idx, row in df.iterrows():
            row_errors = []
            
            # Required fields in row
            for col in self.REQUIRED_COLUMNS:
                if pd.isna(row[col]) or str(row[col]).strip() == "":
                    row_errors.append(f"Row {idx+2}: {col} is required")
                    
            # --- Job ID Validation ---
            if not validate_job_id(str(row.get("job_id", ""))):
                row_errors.append(f"Row {idx+2}: 'job_id' must be JXXXX or JXXXX-XX format")
                
            # --- IP Address Validation ---
            for field in ["ip_address", "subnet_mask", "default_gateway"]:
                if not validate_ip(str(row.get(field, ""))):
                    row_errors.append(f"Row {idx+2}: Invalid IPv4 address in '{field}'")
            
            # --- Subnet Mask Validation ---
            if not validate_subnet_mask(str(row.get("subnet_mask"))):
                row_errors.append(f"Row {idx+2}: Invalid subnet mask address in 'subnet_mask'")
                
            # --- MAC Address Validation ---
            if not validate_mac(str(row.get("mac_address", ""))):
                row_errors.append(f"Row {idx+2}: Invalid MAC address (use aa:bb:cc:dd:ee:ff)")
                
            # --- Serial Number Validation ---
            if not validate_serial_number(row.get("serial_number")):
                row_errors.append(f"Row {idx+2}: 'serial_number' required")
            
            # --- Device Type Validation ---
            dt = str(row.get("device_type", ""))
            if dt and dt not in DEVICE_TYPES:
                row_errors.append(f"Row {idx+2}: 'device_type' must be one of: {', '.join(DEVICE_TYPES)}")
                    
            if row_errors:
                self.errors.extend(row_errors)
                valid = False
                
        if valid:
            self.df = df
        return ValidationResult(valid, self.errors)
    
    def get_ips(self) -> List[str]:
        """
        Returns a list of IP addresses from the loaded CSV 

        Returns:
            List[str]: List of IP addresses
        """
        return self.df["ip_address"].astype(str).tolist() if self.df is not None else []
    
    def get_ips_with_names(self) -> List[dict]:
        """
        Returns a list of IP addresses plus the location and the device name that it is associated with from the loaded CSV 

        Returns:
            List[dict]: List of IP addresses with its associated device and location
        """
        if self.df is None:
            return []
        return [
            {
                "ip": str(row["ip_address"]),
                "device": f"{row['job_id']} - {row['device_name']} ({row['device_location']})"
            }
            for _, row in self.df.iterrows()
        ]
    
    def get_ips_with_details(self) -> List[dict]:
        """
        Returns a list of IP addresses plus all the device information associated with from the loaded CSV

        Returns:
            List[dict]: List of IP addresses with its all of the device information
        """
        if self.df is None:
            return []
    
        return [
            {
                "job_id": str(row["job_id"]),
                "device": str(row["device_name"]).strip() or "Unnamed",
                "ip": str(row["ip_address"]),
                "location": str(row["device_location"]).strip(),
                "type": str(row.get("device_type", "")).strip()
            }
            for _, row in self.df.iterrows()
        ]
    
    def get_display_df(self) -> pd.DataFrame:
        """
        Return only the columns we want to show to the Streamlit UI.
        
        Returns:
            pd.Dataframe: A dataframe object that has all the information from the load CSV
        """
        if self.df is None:
            return pd.DataFrame()
        cols = [
            "job_property", "device_name", "device_location", "device_type",
            "ip_address", "mac_address", "subnet_mask", "default_gateway", "serial_number"
        ]
        return self.df[cols].copy()
    
    def save_to_db(self, db_path: str = "zappy.db", table_name: str = "devices", replace: bool = True) -> bool:
        """
        Save the validated DataFrame to SQLite.
        - db_path: Path to the DB file (default: zappy.db in project root).
        - table_name: Table name (default: 'devices').
        - replace: If True, drop and recreate the table; if False, append.
        Returns True if successful.
        """
        if self.df is None:
            return False

        try:
            conn = sqlite3.connect(db_path)
            if replace:
                self.df.to_sql(table_name, conn, if_exists='replace', index=False)
            else:
                self.df.to_sql(table_name, conn, if_exists='append', index=False)
            conn.close()
            return True
        except Exception as e:
            return False
    
    def export_troubleshoot_csv(self) -> str:
        return self.df.to_csv(index=False) if self.df is not None else ""
        