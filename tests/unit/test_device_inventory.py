import pytest


def test_device_types_constant():
    from zappy.core.device_inventory import DEVICE_TYPES
    assert "Audio" in DEVICE_TYPES
    assert "Networking" in DEVICE_TYPES
    assert len(DEVICE_TYPES) == 9


def test_multicast_labels_constants():
    from zappy.core.device_inventory import MULTICAST_LABELS
    assert "Audio" in MULTICAST_LABELS
    assert len(MULTICAST_LABELS) == 4
    
    
def test_validate_job_id():
    from zappy.core.device_inventory import validate_job_id
    assert validate_job_id("J1001") is True
    assert validate_job_id("J1023-01") is True
    assert validate_job_id("J2023") is True
    
    assert validate_job_id("J12345") is False
    assert validate_job_id("K1001") is False
    assert validate_job_id("") is False
    
    
def test_validate_ip():
    from zappy.core.device_inventory import validate_ip
    assert validate_ip("192.168.1.1") is True
    assert validate_ip("10.0.0.1") is True
    assert validate_ip("172.20.10.15") is True
    assert validate_ip("127.0.0.1") is True
    assert validate_ip("10.15.0.1") is True
    
    assert validate_ip("10.0.0.256") is False
    assert validate_ip("267.1.280.260") is False
    assert validate_ip("8.8.8.8") is False
    assert validate_ip("not.an.ip") is False
    assert validate_ip("223.0.113.23") is False
    
    
def test_validate_subnet_mask():
    from zappy.core.device_inventory import validate_subnet_mask
    assert validate_subnet_mask("255.255.255.0") is True
    assert validate_subnet_mask("255.0.0.0") is True
    assert validate_subnet_mask("255.128.0.0") is True
    assert validate_subnet_mask("255.255.248.0") is True
    
    assert validate_subnet_mask("255.1.0.1") is False
    assert validate_subnet_mask("255.255.196.0") is False
    assert validate_subnet_mask("abc.def.255.0") is False
    assert validate_subnet_mask("ef:b9:rt.yu") is False
    
    
def test_validate_mac():
    from zappy.core.device_inventory import validate_mac
    assert validate_mac("aa:bb:cc:dd:ee:ff") is True
    assert validate_mac("AA:BU:CC:DD:EE:F4") is False
    assert validate_mac("aa:bb:cg:dd:ee:ff") is False
    assert validate_mac("AA:BI:CC:DD:EE:FF") is False