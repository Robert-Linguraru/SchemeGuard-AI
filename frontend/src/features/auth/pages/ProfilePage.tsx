import { type FormEvent, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import { App as AntdApp, Button } from "antd";
import { PROFILE_AVATAR_OPTIONS, readProfileAvatar, saveProfileAvatar, type ProfileAvatarId } from "../../../shared/profile/profileAvatar";

interface ProfilePageProps {
    onBack: () => void;
}

export function ProfilePage({ onBack }: ProfilePageProps) {
    const { user, updateProfile } = useAuth();
    const { notification } = AntdApp.useApp();
    const [fullName, setFullName] = useState(user?.fullName ?? "");
    const [email, setEmail] = useState(user?.email ?? "");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [profileAvatarId, setProfileAvatarId] = useState<ProfileAvatarId | null>(() => user ? readProfileAvatar(user.id) : null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            await updateProfile({
                fullName: fullName.trim(),
                email: email.trim(),
                ...(password ? { password } : {})
            });
            if (user) saveProfileAvatar(user.id, profileAvatarId);
            setPassword("");
            notification.success({
                placement: "topRight",
                message: "Profile updated",
                description: "Your account details were saved successfully."
            });
        } catch (profileError) {
            setError(profileError instanceof Error ? profileError.message : "Could not update profile");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="dashboard profile-page">
            <div className="brand-decoration" aria-hidden="true">
                <span className="orb orb-blue orb-one"></span>
                <span className="orb orb-coral orb-two"></span>
                <span className="orb orb-white orb-three"></span>
                <span className="orb orb-blue orb-four"></span>
            </div>
            <section className="content">
                <div className="profile-heading">
                    <h2>Edit profile</h2>
                </div>

                <form className="profile-card" onSubmit={handleSubmit}>
                    <div className="profile-card-heading">
                        <div>
                            <h3>Personal information</h3>
                        </div>
                    </div>

                    <label>
                        Full name
                        <input
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            required
                            maxLength={150}
                        />
                    </label>
                    <label>
                        Email address
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            maxLength={320}
                        />
                    </label>

                    <fieldset className="profile-avatar-fieldset">
                        <legend>Profile icon</legend>
                        <div className="profile-avatar-options" role="radiogroup" aria-label="Profile icon">
                            {PROFILE_AVATAR_OPTIONS.map(({ id, label, Icon }) => (
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={profileAvatarId === id}
                                    className={`profile-avatar-option${profileAvatarId === id ? " selected" : ""}`}
                                    key={id}
                                    onClick={() => setProfileAvatarId(id)}
                                >
                                    <span><Icon /></span>
                                    <small>{label}</small>
                                </button>
                            ))}
                            <button
                                type="button"
                                role="radio"
                                aria-checked={profileAvatarId === null}
                                className={`profile-avatar-option${profileAvatarId === null ? " selected" : ""}`}
                                onClick={() => setProfileAvatarId(null)}
                            >
                                <span>{fullName.trim().charAt(0).toUpperCase() || "A"}</span>
                                <small>None</small>
                            </button>
                        </div>
                    </fieldset>

                    <div className="profile-divider" />
                    {error && <div className="form-error" role="alert">{error}</div>}
                    <div className="profile-card-heading">
                        <div>
                            <h3>Change password</h3>
                        </div>
                    </div>
                    <label>
                        New password
                        <div className="password-input">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                minLength={8}
                                placeholder="Leave blank to keep your current password"
                            />
                            <Button
                                type="text"
                                className="password-toggle"
                                onClick={() => setShowPassword((shown) => !shown)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? "Hide" : "Show"}
                            </Button>
                        </div>
                    </label>

                    <div className="profile-form-footer">
                        <Button type="primary" htmlType="submit" className="save-profile-button" disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save changes"}
                        </Button>
                    </div>
                </form>
            </section>
        </main>
    );
}
