# pages/01_Device_List.py
import streamlit as st
import pandas as pd
from pathlib import Path
from zappy.core.device_inventory import DeviceInventory

st.set_page_config(page_title="Zappy – Device List", layout="wide")
st.title("Zappy Device List")
st.caption("Upload a CSV → instantly get a clean, filterable device table")

# -------------------------------------------------
# Sidebar – file upload
# -------------------------------------------------
with st.sidebar:
    st.header("Upload CSV")
    uploaded = st.file_uploader(
        "Drop your device list here",
        type=["csv"],
        help="Required columns: job_id, job_property, device_name, device_location, "
             "ip_address, mac_address, subnet_mask, default_gateway, device_type, serial_number"
    )

if not uploaded:
    st.info("Upload a CSV to start")
    st.stop()

# -------------------------------------------------
# Load & validate
# -------------------------------------------------
with st.spinner("Validating CSV…"):
    tmp = Path("temp_upload.csv")
    with open(tmp, "wb") as f:
        f.write(uploaded.getbuffer())
    inventory = DeviceInventory(tmp)

# -------------------------------------------------
# Show result
# -------------------------------------------------
if inventory.df is None:
    st.error("CSV failed validation")
    with st.expander("Show errors", expanded=True):
        for e in inventory.errors:
            st.error(e)
else:
    st.success(f"Loaded {len(inventory.df)} devices")
    df = inventory.get_display_df()

    # ---- Filters -------------------------------------------------
    col1, col2, col3 = st.columns(3)
    with col1:
        job_prop = st.multiselect(
            "Job Property",
            options=sorted(df["job_property"].unique()),
            default=[]
        )
    with col2:
        dev_type = st.multiselect(
            "Device Type",
            options=sorted(df["device_type"].unique()),
            default=[]
        )
    with col3:
        loc_contains = st.text_input("Location contains", placeholder="e.g. Lobby")

    # Apply filters
    if job_prop:
        df = df[df["job_property"].isin(job_prop)]
    if dev_type:
        df = df[df["device_type"].isin(dev_type)]
    if loc_contains:
        df = df[df["device_location"].str.contains(loc_contains, case=False, na=False)]

    # ---- Table ---------------------------------------------------
    st.dataframe(df.reset_index(drop=True), use_container_width=True, hide_index=True)

    # ---- One-click copy -------------------------------------------------
    copy_text = "\n".join(
        f"{r['ip_address']}\t # {r['device_name']} at {r['device_location']}"
        for _, r in df.iterrows()
    )
    st.download_button(
        "Download IPs as .txt",
        data=copy_text,
        file_name=f"basic_list_{pd.Timestamp.now():%Y%m%d}.txt",
        mime="text/plain"
    )

    # cleanup
    tmp.unlink(missing_ok=True)