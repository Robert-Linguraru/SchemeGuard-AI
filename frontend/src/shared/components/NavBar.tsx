import { AccountMenu } from "./AccountMenu";
import type { NavigationItem, View } from "../types/navigation";
import { Button, Tooltip } from "antd";
import {
    ApartmentOutlined,
    AppstoreOutlined,
    FolderOutlined,
    MoonOutlined,
    RobotOutlined,
    SafetyCertificateOutlined,
    SunOutlined,
    WalletOutlined,
} from "@ant-design/icons";
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
    const iconForView = (view: View) => {
        switch (view) {
            case "my-agent": return <RobotOutlined />;
            case "home-dashboard": return <AppstoreOutlined />;
            case "dashboard":
            case "upload-details": return <FolderOutlined />;
            case "analysis-dashboard": return <ApartmentOutlined />;
            case "card-schemes": return <WalletOutlined />;
            case "rules":
            case "upload":
            case "details": return <SafetyCertificateOutlined />;
            default: return <FolderOutlined />;
        }
    };
    const navigationItems: NavigationItem[] = [
        { view: "home-dashboard", label: "Home", active: currentView === "home-dashboard" },
        {
            view: "my-agent",
            label: "Chat",
            active: currentView === "my-agent",
        },
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
                <span className="app-navbar-brand" aria-label="SchemeGuard AI">
                    <img className="app-navbar-logo" src="/schemeguard-mark.svg" alt="" aria-hidden="true" />
                    <span>SchemeGuard AI</span>
                </span>
                <div className="app-navbar-links">
                    {navigationItems.map((item) => (
                        <Tooltip key={item.view} title={item.label} placement="right">
                            <Button
                                type="text"
                                className="app-navbar-link"
                                icon={iconForView(item.view)}
                                aria-label={item.label}
                                aria-current={item.active ? "page" : undefined}
                                title={item.label}
                                onClick={() => onViewChange(item.view)}
                            />
                        </Tooltip>
                    ))}
                </div>
                <div className="app-navbar-actions">
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
