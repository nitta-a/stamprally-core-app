import { CssBaseline, createTheme, Tab, Tabs, ThemeProvider } from "@mui/material";
import type { AdminRallyConfig } from "@stamprally/core";
import { MuiAdminRallyEditor, MuiRallyViewer } from "@stamprally/mui";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const initialConfig: AdminRallyConfig = {
  id: "mui-demo",
  version: "1",
  title: { en: "MUI Stamp Rally", ja: "MUIスタンプラリー" },
  description: {
    en: "A small viewer and editor integration.",
    ja: "ViewerとEditorの統合サンプルです。",
  },
  spots: [
    {
      id: "station",
      orderIndex: 0,
      name: { en: "Station", ja: "駅" },
      conditions: [{ type: "passcode", code: "" }],
    },
    {
      id: "park",
      orderIndex: 1,
      name: { en: "Park", ja: "公園" },
      conditions: [{ type: "passcode", code: "" }],
    },
  ],
  rewards: [
    {
      id: "drink",
      title: "A drink",
      type: "in_person",
      redemptionMethod: "view_only",
      requiredStampCount: 2,
    },
  ],
};

function App() {
  const [config, setConfig] = useState(initialConfig);
  const [tab, setTab] = useState(0);
  const theme = useMemo(
    () => createTheme({ palette: { mode: "dark", primary: { main: "#8bd3dd" } } }),
    [],
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)}>
          <Tab label="Viewer" />
          <Tab label="Editor" />
        </Tabs>
        {tab === 0 ? (
          <MuiRallyViewer config={config} sx={{ mt: 3 }} />
        ) : (
          <MuiAdminRallyEditor config={config} onChange={setConfig} sx={{ mt: 3 }} />
        )}
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("Root element was not found.");
createRoot(root).render(<App />);
