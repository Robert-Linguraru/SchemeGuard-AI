import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Button } from "antd";

interface AccountMenuProps {
    onEditProfile: () => void;
}

export function AccountMenu({ onEditProfile }: AccountMenuProps) {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const hasPineappleAvatar = user?.email?.trim().toLowerCase() === "leo@gmail.com";
    const hasFlowerAvatar = user?.fullName?.trim().toLowerCase().startsWith("f") ?? false;
    const avatarClassName = hasPineappleAvatar
        ? "account-avatar account-avatar--pineapple"
        : hasFlowerAvatar
            ? "account-avatar account-avatar--flower"
            : "account-avatar";

    useEffect(() => {
        const closeMenu = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", closeMenu);
        return () => document.removeEventListener("mousedown", closeMenu);
    }, []);

    const handleEditProfile = () => {
        setIsOpen(false);
        onEditProfile();
    };

    return (
        <div className="account-menu" ref={menuRef}>
            <Button
                className="account-button"
                type="default"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setIsOpen((open) => !open)}
            >
                <span
                    className={avatarClassName}
                    aria-hidden="true"
                >
                    {hasPineappleAvatar ? (
                        <img className="account-avatar-image" src="/pineapple-avatar.png" alt="" />
                    ) : hasFlowerAvatar ? (
                        <img className="account-avatar-image" src="/flower-avatar.svg" alt="" />
                    ) : (
                        (user?.fullName?.trim().charAt(0) || "A").toUpperCase()
                    )}
                </span>
                <span>Account</span>
                <span className="account-chevron" aria-hidden="true" />
            </Button>

            {isOpen && (
                <div className="account-dropdown" role="menu">
                    <div className="account-summary">
                        <strong>{user?.fullName}</strong>
                        <span>{user?.email}</span>
                    </div>
                    <Button type="text" role="menuitem" onClick={handleEditProfile}>
                        Edit profile
                    </Button>
                    <Button type="text" role="menuitem" onClick={logout}>
                        Logout
                    </Button>
                </div>
            )}
        </div>
    );
}
