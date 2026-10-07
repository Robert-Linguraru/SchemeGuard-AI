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
import "./styles/operations-ui.css";
import "./styles/agent-layout.css";
import "./styles/analytics-polish.css";

function ThemedApplication() {
    const { theme } = useTheme();
    const isDark = theme === "dark";

    return (
        <ConfigProvider
            theme={{
                algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
                token: {
                    colorPrimary: "#FF5640",
                    colorInfo: isDark ? "#D1D5D7" : "#47555F",
                    colorBgBase: isDark ? "#192B37" : "#E8EAEB",
                    colorBgLayout: isDark ? "#192B37" : "#E8EAEB",
                    colorBgContainer: isDark ? "#30404B" : "#FFFFFF",
                    colorBgElevated: isDark ? "#30404B" : "#FFFFFF",
                    colorBorder: isDark ? "#5E6A73" : "#D1D5D7",
                    colorText: isDark ? "#FFFFFF" : "#192B37",
                    colorTextSecondary: isDark ? "#D1D5D7" : "#5E6A73",
                    borderRadius: 12,
                    fontFamily: '"Dava Sans", Arial, sans-serif'
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
