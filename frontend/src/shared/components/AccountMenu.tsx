import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Button } from "antd";
import { createPortal } from "react-dom";
import { listenForProfileAvatarChange, PROFILE_AVATAR_OPTIONS, readProfileAvatar } from "../profile/profileAvatar";

interface AccountMenuProps {
    onEditProfile: () => void;
}

export function AccountMenu({ onEditProfile }: AccountMenuProps) {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuPosition, setMenuPosition] = useState({ top: 12, left: 12 });
    const [profileAvatarId, setProfileAvatarId] = useState(() => user ? readProfileAvatar(user.id) : null);
    const selectedAvatar = PROFILE_AVATAR_OPTIONS.find((option) => option.id === profileAvatarId);

    useEffect(() => listenForProfileAvatarChange((userId) => {
        if (userId === user?.id) setProfileAvatarId(readProfileAvatar(userId));
    }), [user?.id]);

    const openMenu = () => {
        const bounds = buttonRef.current?.getBoundingClientRect();
        if (bounds) {
            setMenuPosition({
                top: Math.max(12, Math.min(bounds.top - 122, window.innerHeight - 180)),
                left: Math.max(12, Math.min(bounds.right + 10, window.innerWidth - 232)),
            });
        }
        setIsOpen((open) => !open);
    };

    useEffect(() => {
        const closeMenu = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node) && !dropdownRef.current?.contains(event.target as Node)) {
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
                ref={buttonRef}
                className="account-button"
                type="default"
                aria-label="Open profile menu"
                title="Profile"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={openMenu}
            >
                <span className="account-avatar" aria-hidden="true">
                    {selectedAvatar
                        ? <selectedAvatar.Icon />
                        : (user?.fullName?.trim().charAt(0) || "A").toUpperCase()}
                </span>
            </Button>

            {isOpen && createPortal(
                <div ref={dropdownRef} className="account-dropdown account-dropdown-viewport" role="menu" style={menuPosition}>
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
                </div>,
                document.body
            )}
        </div>
    );
}
