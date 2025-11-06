import pytest


def test_device_types_constant():
    from zappy.core.device_inventory import DEVICE_TYPES
    assert "Audio" in DEVICE_TYPES
    assert len(DEVICE_TYPES) == 9

def test_multicast_labels_constants():
    from zappy.core.device_inventory import MULTICAST_LABELS
    assert "Audio" in MULTICAST_LABELS
    assert len(MULTICAST_LABELS) == 4