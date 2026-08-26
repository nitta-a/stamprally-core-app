import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@stamprally/admin-ui/styles.css";
import "@stamprally/ui/styles.css";
import { App } from "./App.js";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
