import { useAuth } from "../../app/AuthProvider";
import { AccountMenu } from "./AccountMenu";
import type { NavigationItem, View } from "../types/navigation";
import { Button } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import type { ThemeMode } from "../../app/ThemeProvider";

type NavBarProps = {
    currentView: View;
    isAdmin: boolean;
    onViewChange: (view: View) => void;
    onEditProfile: () => void;
    theme: ThemeMode;
    onToggleTheme: () => void;
};

function NavBar({ currentView, isAdmin, onViewChange, onEditProfile, theme, onToggleTheme }: NavBarProps) {
    const { user } = useAuth();
    const navigationItems: NavigationItem[] = [
        {
            view: "dashboard",
            label: "CSV uploads",
            active: currentView === "dashboard" || currentView === "upload-details",
        },
        {
            view: "analysis-dashboard",
            label: "Analytics",
            active: currentView === "analysis-dashboard",
        },
        {
            view: "card-schemes",
            label: "Card schemes",
            active: currentView === "card-schemes",
        },
        ...(isAdmin
            ? [
                  {
                      view: "rules" as const,
                      label: "Rules",
                      active:
                          currentView === "rules" ||
                          currentView === "upload" ||
                          currentView === "details",
                  },
              ]
            : []),
    ];

    return (
        <nav className="app-navbar" aria-label="Main navigation">
            <div className="app-navbar-inner">
                <span className="app-navbar-brand">
                    <img className="app-navbar-logo" src="/schemeguard-mark.svg" alt="" aria-hidden="true" />
                    <span>SchemeGuard AI</span>
                </span>
                <div className="app-navbar-links">
                    {navigationItems.map((item) => (
                        <Button
                            key={item.view}
                            type="text"
                            className="app-navbar-link"
                            aria-current={item.active ? "page" : undefined}
                            onClick={() => onViewChange(item.view)}
                        >
                            {item.label}
                        </Button>
                    ))}
                </div>
                <div className="app-navbar-actions">
                    <span className="app-navbar-welcome">Welcome, {user?.fullName}</span>
                    <AccountMenu onEditProfile={onEditProfile} />
                    <Button
                        className="theme-toggle-button"
                        type="default"
                        icon={theme === "dark" ? <SunOutlined /> : <MoonOutlined />}
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                        title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                        onClick={onToggleTheme}
                    />
                </div>
            </div>
        </nav>
    );
}

export default NavBar;
