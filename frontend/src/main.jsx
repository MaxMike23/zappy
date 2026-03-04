import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global reset — swap for Tailwind or a CSS framework later
const globalStyles = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 0; }
  a { color: inherit; }
`;

const styleEl = document.createElement("style");
styleEl.textContent = globalStyles;
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
