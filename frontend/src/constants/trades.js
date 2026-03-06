export const TRADES = [
  { key: "av",               label: "Audio / Visual" },
  { key: "security",         label: "Security Systems" },
  { key: "access_control",   label: "Access Control" },
  { key: "surveillance",     label: "Surveillance / CCTV" },
  { key: "fire_alarm",       label: "Fire Alarm" },
  { key: "smart_home",       label: "Smart Home" },
  { key: "home_theater",     label: "Home Theater" },
  { key: "lighting_control", label: "Lighting Control" },
  { key: "shade_control",    label: "Shade Control" },
  { key: "automation",       label: "Custom Automation" },
  { key: "networking",       label: "Networking / Low Voltage" },
  { key: "live_sound",       label: "Live Sound" },
  { key: "live_video",       label: "Live Video" },
  { key: "staging_rigging",  label: "Staging & Rigging" },
  { key: "other",            label: "Other" },
];

/** Map of key → label for quick lookup */
export const TRADE_LABEL = Object.fromEntries(TRADES.map((t) => [t.key, t.label]));
