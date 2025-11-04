import streamlit as st
from zappy.core.device_inventory import DeviceInventory, DEVICE_TYPES, MULTICAST_LABELS
from pathlib import Path

st.set_page_config(page_title="IP Access", layout="wide")
st.title("Quick IP Access & Troubleshooting")

uploaded_file = st.file_uploader("Upload `device_list.csv`", type="csv")

if uploaded_file:
    # Save temp file
    temp_path = Path("temp_device_list.csv")
    temp_path.write_bytes(uploaded_file.getvalue())

    inventory = DeviceInventory()
    result = inventory.load_and_validate(temp_path)

    if not result.valid:
        st.error("CSV validation failed:")
        for err in result.errors[:10]:  # Show first 10
            st.write(f"- {err}")
        if len(result.errors) > 10:
            st.write(f"... and {len(result.errors) - 10} more.")
        st.stop()

    st.success(f"Loaded {len(inventory.df)} devices from {uploaded_file.name}")

    # --- Tabs ---
    tab1, tab2, tab3 = st.tabs(["Full Table", "Quick IPs", "Export & Summary"])

    with tab1:
        st.dataframe(inventory.df, use_container_width=True)

    with tab2:
        ips = inventory.get_ips()
        ip_text = "\n".join(ips)
        st.code(ip_text, language="text")
        st.button("Copy All IPs to Clipboard", on_click=lambda: st.write("Copied!"), key="copy_ips")

    with tab3:
        csv_data = inventory.export_troubleshoot_csv()
        st.download_button(
            "Download Full CSV",
            csv_data,
            "device_list_validated.csv",
            "text/csv"
        )
        col1, col2 = st.columns(2)
        col1.metric("Total Devices", len(inventory.df))
        col2.metric("Unique IPs", inventory.df["ip_address"].nunique())

else:
    st.info("Upload your `device_list.csv` to begin.")
    with st.expander("CSV Template & Rules"):
        st.markdown("""
        ### Required Columns
        - `job_id` → `J1001`  
        - `job_property`, `device_name`, `device_location` → text  
        - `ip_address`, `subnet_mask`, `default_gateway` → IPv4  
        - `mac_address` → `aa:bb:cc:dd:ee:ff` (lowercase)

        ### Optional (but default required)
        - `product_number`, `device_type`, `serial_number`, `admin_username`, `admin_password`

        ### Conditional
        - If `multicast_address_1` is set → `multicast_label_1`, `multicast_port_1` required  
        - Port must be 1025–65000
        """)