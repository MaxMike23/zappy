# pages/01_Device_List.py
import streamlit as st
import time
import pandas as pd
from pathlib import Path
from zappy.core.device_inventory import DeviceInventory

st.set_page_config(page_title="Zappy – Device List", layout="wide")
st.title("Zappy Device List")
st.caption("Upload a CSV → instantly get a clean, filterable device table")


# === Sidebar – file upload ===
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

# === Load & validate ===
with st.spinner("Validating CSV…"):
    tmp = Path("temp_upload.csv")
    with open(tmp, "wb") as f:
        f.write(uploaded.getbuffer())
    inventory = DeviceInventory(tmp)


# === Show result ===
if inventory.df is None:
    st.error("CSV failed validation")
    with st.expander("Show errors", expanded=True):
        for e in inventory.errors:
            st.error(e)
else:
    st.success(f"Loaded {len(inventory.df)} devices")
    df = inventory.get_display_df()

    # === Filters ===
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

    # === Filters ===
    filtered = df.copy()
    if job_prop:
        filtered = filtered[filtered["job_property"].isin(job_prop)]
    if dev_type:
        filtered = filtered[filtered["device_type"].isin(dev_type)]
    if loc_contains:
        filtered = filtered[filtered["device_location"].str.contains(loc_contains, case=False, na=False)]

    # === Table ===
    st.dataframe(filtered.reset_index(drop=True), use_container_width=True, hide_index=True)

    # === Downloads ===
    col_a, col_b = st.columns(2)
    txt_data = "\n".join([f"{row['ip_address']}  # {row['device_name']} ({row['device_location']})" for _, row in filtered.iterrows()])
    csv_data = filtered.to_csv(index=False).encode()

    with col_a:
        st.download_button("Download IPs (.txt)", data=txt_data, file_name=f"zappy_ips_{pd.Timestamp.now():%Y%m%d_%H%M}.txt", mime="text/plain")
    with col_b:
        st.download_button("Download Table (.csv)", data=csv_data, file_name=f"zappy_filtered_{pd.Timestamp.now():%Y%m%d_%H%M}.csv", mime="text/csv")

    # === Save Filtered to DB ===
    col_a, col_b = st.columns(2)
    
    with col_a:
        if st.button("Save Filtered to Local DB", type="secondary"):
            if inventory.save_to_db("database/zappy.db", replace=True):
                st.success("✅ Filtered dataset saved to local DB (zappy.db)")
            else:
                st.error("❌ Failed to save filtered dataset to local DB")
                
    with col_b:
        if st.button("Append Filtered to Local DB", type="secondary"):
            if inventory.save_to_db("database/zappy.db", replace=False):
                st.success("✅ Filtered dataset appended to local DB (zappy.db)")
            else:
                st.error("❌ Failed to append filtered dataset to local DB")

    # cleanup
    tmp.unlink(missing_ok=True)