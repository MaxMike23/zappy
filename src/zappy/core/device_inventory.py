import pandas as pd
import ipaddress
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


def validate_multicast_port(port: Any) -> bool:
    """
    Returns True if port is recognized as any available port between 1025 and 65000

    Args:
        port (Any): Port number as read from CSV file

    Returns:
        bool: Returns True if passed, False if not in range of available ports
    """
    try:
        p = int(port)
        return 1025 <= p <= 65000
    except (ValueError, TypeError):
        return False

    
@dataclass
class ValidationResult:
    valid: bool
    errors: List[str]
    
    
class DeviceInventory:
    REQUIRED_COLUMNS = [
        "job_id", "job_property", "device_name", "device_locations", "ip_adddress", "mac_address", "subnet_mask", "default_gateway", "serial_number"
    ]
    
    OPTIONAL_BUT_DEFAULT_TRUE = [
        "product_number", "device_type", "admin_username", "admin_password"
    ]
    
    def __init__(self, csv_path: Optional[Path] = None):
        self.df: Optional[pd.DataFrame] = None
        self.errors: List[str] = []
        if csv_path:
            self.load_and_validate(csv_path)
            
    def load_and_validate(self, csv_path: Path) -> ValidationResult:
        """Load CSV and validate every row against the desired specs"""
        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            return ValidationResult(False, [f"Failed to read CSV: {e}"])
        
        self.errors = []
        valid = True
        
        # --- Column Validation ---
        missing_cols = [col for col in self.REQUIRED_COLUMNS if col not in df.columns]
        if missing_cols:
            self.errors.append(f"Missing required columns: {','.join(missing_cols)}")
            valid = False
            
        # Add missing optional columns
        for col in self.OPTIONAL_BUT_DEFAULT_TRUE + ["dns_1", "dns_2", "notes"]:
            if col not in df.columns:
                df[col] = ""
                
        # --- Row-by-row validation ---
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
            
            # --- Device Type Validation ---
            dt = str(row.get("device_type", ""))
            if dt and dt not in DEVICE_TYPES:
                row_errors.append(f"Row {idx+2}: 'device_type' must be one of: {', '.join(DEVICE_TYPES)}")
                
            # --- Multicast 1 Validation ---
            if pd.notna(row.get("multicast_address_1")) and str(row["multicast_address_1"]).strip():
                if validate_ip(str(row["multicast_address_1"])):
                    if not validate_multicast_address(str(row["multicast_address_1"])):
                        row_errors.append(f"Row {idx+2}: Invalid multicast address in 'multicast_address_1'")
                if not validate_ip(str(row["multicast_address_1"])):
                    row_errors.append(f"Row {idx+2}: Invalid multicast address in 'multicast_address_1'")
                if not validate_multicast_port(row.get("multicast_port_1")):
                    row_errors.append(f"Row {idx+2}: multicast_port_1 must be 1025–65000")
                label = str(row.get("multicast_label_1", ""))
                if label not in MULTICAST_LABELS:
                    row_errors.append(f"Row {idx+2}: multicast_label_1 invalid")        
            
            # --- Multicast 2 Validation ---
            if pd.notna(row.get("multicast_address_2")) and str(row["multicast_address_2"]).strip():
                if validate_ip(str(row["multicast_address_2"])):
                    if not validate_multicast_address(str(row["multicast_address_2"])):
                        row_errors.append(f"Row {idx+2}: Invalid multicast address in 'multicast_address_2'")
                if not validate_ip(str(row["multicast_address_2"])):
                    row_errors.append(f"Row {idx+2}: Invalid multicast address in 'multicast_address_2'")
                if not validate_multicast_port(row.get("multicast_port_2")):
                    row_errors.append(f"Row {idx+2}: multicast_port_2 must be 1025–65000")
                label = str(row.get("multicast_label_2", ""))
                if label not in MULTICAST_LABELS:
                    row_errors.append(f"Row {idx+2}: multicast_label_2 invalid")
                    
            if row_errors:
                self.errors.extend(row_errors)
                valid = False
                
        if valid:
            self.df = df
        return ValidationResult(valid, self.errors)
    
    def get_ips(self) -> List[str]:
        if self.df is None:
            return
        return self.df["ip_address"].astype(str).tolist()
    
    def export_troubleshoot_csv(self) -> str:
        if self.df is None:
            return ""
        return self.df.to_csv(index=False)
        