import ipaddress
from zappy.core.device_inventory import *
from typing import Optional, Union, Tuple, Dict, Any, List


def subnet_mask_to_cidr(subnet_mask: str) -> Tuple[int, bool]:
    """
    Converts a dotted decimal subnet mask to CIDR notation

    Args:
        subnet_mask (str): The subnet mask in dotted decimal format (e.g., "255.255.255.0").

    Returns:
        int: The CIDR value (e.g., 24 for "255.255.255.0") and a boolean if valid
    """
    cidr = 0
    try:
        ipaddress.IPv4Network(f"0.0.0.0/{subnet_mask}", strict=True)
        for octet in subnet_mask.split('.'):
            cidr += bin(int(octet)).count("1")
        return cidr, True
    except ValueError:
        return cidr, False
    
    
def cidr_to_subnet_mask(cidr_prefix: Union[int, str]) -> str:
    """
    Converts CIDR notation to a dotted decimal subnet mask

    Args:
        cidr_prefix (int): CIDR Notation number based on reserved bits (e.g. 24 from 192.168.1.0/24)

    Returns:
        str: The subnet mask in dotted decimal format (e.g., "255.255.255.0").
    """
    try:
        network = ipaddress.IPv4Network(f"0.0.0.0/{int(cidr_prefix)}")
        return str(network.netmask)
    except ValueError as e:
        return f"Error: Invalid CIDR prefix - {e}"