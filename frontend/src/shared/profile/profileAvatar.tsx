import {
    BugOutlined,
    RocketOutlined,
    CoffeeOutlined,
    SmileOutlined,
    CrownOutlined,
    FireOutlined
} from "@ant-design/icons";

export const PROFILE_AVATAR_OPTIONS = [
    { id: "fire", label: "Fire", Icon: FireOutlined },
    { id: "smile", label: "Smile", Icon: SmileOutlined },
    { id: "rocket", label: "Rocket", Icon: RocketOutlined },
    { id: "crown", label: "Crown", Icon: CrownOutlined },
    { id: "bug", label: "Bug", Icon: BugOutlined },
    { id: "coffee", label: "Coffee", Icon: CoffeeOutlined },
] as const;

export type ProfileAvatarId = typeof PROFILE_AVATAR_OPTIONS[number]["id"];

const avatarChangedEvent = "schemeguard-profile-avatar-changed";
const storageKey = (userId: string) => `schemeguard-profile-avatar:${userId}`;

export function isProfileAvatarId(value: string | null): value is ProfileAvatarId {
    return PROFILE_AVATAR_OPTIONS.some((option) => option.id === value);
}

export function readProfileAvatar(userId: string): ProfileAvatarId | null {
    try {
        const saved = window.localStorage.getItem(storageKey(userId));
        return isProfileAvatarId(saved) ? saved : null;
    } catch {
        return null;
    }
}

export function saveProfileAvatar(userId: string, avatarId: ProfileAvatarId | null): void {
    try {
        if (avatarId) window.localStorage.setItem(storageKey(userId), avatarId);
        else window.localStorage.removeItem(storageKey(userId));
    } catch {
        // Keep profile editing usable if browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(avatarChangedEvent, { detail: { userId } }));
}

export function listenForProfileAvatarChange(callback: (userId: string) => void): () => void {
    const listener = (event: Event) => {
        const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
        if (userId) callback(userId);
    };
    window.addEventListener(avatarChangedEvent, listener);
    return () => window.removeEventListener(avatarChangedEvent, listener);
}
