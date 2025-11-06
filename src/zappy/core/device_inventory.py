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
    return bool(re.fullmatch(r"J\d{4}", value))

def validate_ip(ip: str) -> bool:
    try:
        ipaddress.IPv4Address(ip)
        return True
    except ipaddress.AddressValueError:
        return False
    
def validate_mac(mac: str) -> bool:
    return bool(re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", mac.lower()))