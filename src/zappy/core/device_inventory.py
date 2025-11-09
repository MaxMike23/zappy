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
        
        