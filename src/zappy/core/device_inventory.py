import pandas as pd
import ipaddress
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

# --- Enums / Choices ---
DEVICE_TYPES = [
    "Audio", "Video", "Audiovisual", "Control",
    "Intercom", "Security", "Surveillance", "Access Control"
]

MULTICAST_LABELS = ["Audio", "Video", "AUX", "Streaming"]

