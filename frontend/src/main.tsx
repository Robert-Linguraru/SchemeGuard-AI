import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme as antdTheme } from "antd";
import { App } from "./app/App";
import { AuthProvider } from "./app/AuthProvider";
import "./styles/global.css";
import "./styles/auth.css";
import "./styles/dashboard.css";
import "./styles/rules.css";
import "./styles/profile.css";
import "./styles/entity-list.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ConfigProvider
            theme={{
                algorithm: antdTheme.darkAlgorithm,
                token: {
                    colorPrimary: "#68b3e7",
                    colorInfo: "#68b3e7",
                    colorBgBase: "#172b3a",
                    colorBgContainer: "#203d50",
                    colorBgElevated: "#203d50",
                    colorBorder: "#3d6378",
                    colorText: "#ffffff",
                    colorTextSecondary: "#a9bbc7",
                    borderRadius: 10,
                    fontFamily: "Arial, sans-serif",
                },
            }}
        >
            <AuthProvider>
                <App />
            </AuthProvider>
        </ConfigProvider>
    </StrictMode>
);
