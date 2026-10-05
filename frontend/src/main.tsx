import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import { App } from "./app/App";
import { AuthProvider } from "./app/AuthProvider";
import { ThemeProvider, useTheme } from "./app/ThemeProvider";
import "./styles/global.css";
import "./styles/auth.css";
import "./styles/dashboard.css";
import "./styles/rules.css";
import "./styles/profile.css";
import "./styles/entity-list.css";
import "./styles/theme.css";

function ThemedApplication() {
    const { theme } = useTheme();
    const isDark = theme === "dark";

    return (
        <ConfigProvider
            theme={{
                algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
                token: {
                    colorPrimary: "#f05d53",
                    colorInfo: isDark ? "#68b3e7" : "#397fa8",
                    colorBgBase: isDark ? "#172b3a" : "#eaf3f8",
                    colorBgLayout: isDark ? "#172b3a" : "#eaf3f8",
                    colorBgContainer: isDark ? "#203d50" : "#ffffff",
                    colorBgElevated: isDark ? "#203d50" : "#ffffff",
                    colorBorder: isDark ? "#3d6378" : "#cadce8",
                    colorText: isDark ? "#f4f7fa" : "#20384a",
                    colorTextSecondary: isDark ? "#a9bbc7" : "#60778a",
                    borderRadius: 9,
                    fontFamily: "Arial, sans-serif"
                }
            }}
        >
            <AntdApp>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </AntdApp>
        </ConfigProvider>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <ThemedApplication />
        </ThemeProvider>
    </StrictMode>
);
