import pytest
from pathlib import Path
from zappy.core.device_inventory import DeviceInventory


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
    assert validate_mac("AA:BB:CC:DD:EE:FF") is True
    assert validate_mac("00:1a:2b:3c:4d:5e") is True
    assert validate_mac("00:02:ab:cf:dd:aa") is True
    
    assert validate_mac("AA:BU:CC:DD:EE:F4") is False
    assert validate_mac("aa:bb:cg:dd:ee:ff") is False
    assert validate_mac("AA:CC:DD:EE:FF") is False
    assert validate_mac("") is False
    
    
def test_validate_multicast_address():
    from zappy.core.device_inventory import validate_multicast_address
    assert validate_multicast_address("224.0.0.1") is True
    assert validate_multicast_address("239.24.1.23") is True
    assert validate_multicast_address("225.1.1.1") is True
    assert validate_multicast_address("239.255.255.254") is True
    
    assert validate_multicast_address("192.168.1.1") is False
    assert validate_multicast_address("8.8.8.8") is False
    assert validate_multicast_address("invalid") is False
    assert validate_multicast_address("") is False
    
    
def test_validate_multicast_port():
    from zappy.core.device_inventory import validate_multicast_port
    assert validate_multicast_port(5000) is True
    assert validate_multicast_port("1025") is True
    assert validate_multicast_port(65000) is True
    assert validate_multicast_port(6700) is True
    
    assert validate_multicast_port(1024) is False
    assert validate_multicast_port(65001) is False
    assert validate_multicast_port("abc") is False
    assert validate_multicast_port(None) is False
    
    

@pytest.fixture
def valid_csv(tmp_path: Path) -> Path:
    content = """job_id,job_property,device_name,device_type,device_locations,ip_address,mac_address,subnet_mask,default_gateway,serial_number
J1001,Hotel,Router,Networking,Server Room,192.168.1.1,aa:bb:cc:dd:ee:ff,255.255.255.0,192.168.1.254,SN123
J1002,Office,Switch,Networking,Cabinet A,10.0.0.50,00:11:22:33:44:55,255.255.255.0,10.0.0.1,SN456
"""
    p = tmp_path / "valid.csv"
    p.write_text(content)
    return p


@pytest.fixture
def invalid_csv(tmp_path: Path) -> Path:
    content = """job_id,job_property,device_name,device_locations,ip_address,mac_address,subnet_mask,default_gateway
J1001,Hotel,Router,Room,8.8.8.8,aa:bb:cc:dd:ee:ff,255.255.255.1,192.168.1.254
J999,Office,,Cabinet,192.168.1.100,invalid-mac,255.255.255.0,203.0.113.1
"""
    p = tmp_path / "invalid.csv"
    p.write_text(content)
    return p


def test_load_valid_csv(valid_csv):
    inv = DeviceInventory(valid_csv)
    assert inv.df is not None
    assert len(inv.df) == 2
    assert len(inv.errors) == 0
    assert inv.get_ips() == ["192.168.1.1", "10.0.0.50"]
    assert inv.get_ips_with_names()[0] == {"ip": "192.168.1.1", "device": "J1001 - Router (Server Room)"}
    assert inv.get_ips_with_details()[0]["location"] == "Server Room"
    assert inv.get_ips_with_details()[1]["type"] == "Networking"


def test_load_invalid_csv(invalid_csv):
    inv = DeviceInventory(invalid_csv)
    result = inv.load_and_validate(invalid_csv)
    
    assert result.valid is False
    assert len(result.errors) >= 1
 
    assert "Missing required columns" in result.errors[0]
    assert inv.get_ips() == []
    assert inv.get_ips_with_names() == []
    assert inv.get_ips_with_details() == []
    assert inv.df is None
    

def test_missing_columns(tmp_path: Path):
    content = "job_id,ip_address\nJ1001,192.168.1.1"
    p = tmp_path / "missing.csv"
    p.write_text(content)
    
    inv = DeviceInventory()
    result = inv.load_and_validate(p)
    
    assert not result.valid
    assert "Missing required columns:" in result.errors[0]
    assert "device_name" in result.errors[0]