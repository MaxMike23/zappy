import pytest


def test_subnet_mask_to_cidr():
    from zappy.core.networking_tools import subnet_mask_to_cidr
    assert subnet_mask_to_cidr("255.255.255.0") == (24, True)
    assert subnet_mask_to_cidr("255.0.0.0") == (8, True)
    assert subnet_mask_to_cidr("255.255.128.0") == (17, True)
    assert subnet_mask_to_cidr("252.0.0.0") == (6, True)
    
    invalid_conversion = (0, False)
    assert subnet_mask_to_cidr("100.0.0.1") == invalid_conversion
    assert subnet_mask_to_cidr("ABC") == invalid_conversion
    assert subnet_mask_to_cidr("") == invalid_conversion
    assert subnet_mask_to_cidr("255.255.256.0") == invalid_conversion
    
    
def test_cidr_to_subnet_mask():
    from zappy.core.networking_tools import cidr_to_subnet_mask
    assert cidr_to_subnet_mask(6) == "252.0.0.0"
    assert cidr_to_subnet_mask(17) == "255.255.128.0"
    assert cidr_to_subnet_mask("24") == "255.255.255.0"
    assert cidr_to_subnet_mask("8") == "255.0.0.0"
    
    error_message = "Error: Invalid CIDR prefix -"
    assert cidr_to_subnet_mask("ABC") in error_message
    assert cidr_to_subnet_mask(100) in error_message
    assert cidr_to_subnet_mask("") in error_message
    assert cidr_to_subnet_mask("120") in error_message
