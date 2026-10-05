import { useAuth } from "../../app/AuthProvider";
import { AccountMenu } from "./AccountMenu";
import type { NavigationItem, View } from "../types/navigation";

type NavBarProps = {
    currentView: View;
    isAdmin: boolean;
    onViewChange: (view: View) => void;
    onEditProfile: () => void;
};

function NavBar({ currentView, isAdmin, onViewChange, onEditProfile }: NavBarProps) {
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
                <span className="app-navbar-brand">SchemeGuard AI</span>
                <div className="app-navbar-links">
                    {navigationItems.map((item) => (
                        <button
                            key={item.view}
                            type="button"
                            className="app-navbar-link"
                            aria-current={item.active ? "page" : undefined}
                            onClick={() => onViewChange(item.view)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="app-navbar-actions">
                    <span className="app-navbar-welcome">Welcome, {user?.fullName}</span>
                    <AccountMenu onEditProfile={onEditProfile} />
                </div>
            </div>
        </nav>
    );
}

export default NavBar;
