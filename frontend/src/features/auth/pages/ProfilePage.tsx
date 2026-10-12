import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import { App as AntdApp, Button, Input, Modal } from "antd";
import { WarningFilled } from "@ant-design/icons";
import { executeNuke, NUKE_CONFIRMATION_PHRASE } from "../api/adminApi";
import { PROFILE_AVATAR_OPTIONS, readProfileAvatar, saveProfileAvatar, type ProfileAvatarId } from "../../../shared/profile/profileAvatar";

interface ProfilePageProps {
    onBack: () => void;
}

export function ProfilePage({ onBack }: ProfilePageProps) {
    const { user, updateProfile, logout } = useAuth();
    const { notification } = AntdApp.useApp();
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";
    const [fullName, setFullName] = useState(user?.fullName ?? "");
    const [email, setEmail] = useState(user?.email ?? "");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [profileAvatarId, setProfileAvatarId] = useState<ProfileAvatarId | null>(() => user ? readProfileAvatar(user.id) : null);
    const [isNukeModalOpen, setIsNukeModalOpen] = useState(false);
    const [isFinalNukeModalOpen, setIsFinalNukeModalOpen] = useState(false);
    const [nukeConfirmationText, setNukeConfirmationText] = useState("");
    const [isNukeExecuting, setIsNukeExecuting] = useState(false);
    const [isNukeAnimating, setIsNukeAnimating] = useState(false);

    useEffect(() => {
        if (!isNukeAnimating) return;
        const timeoutId = window.setTimeout(() => {
            setIsNukeAnimating(false);
            logout();
        }, 1600);
        return () => window.clearTimeout(timeoutId);
    }, [isNukeAnimating, logout]);

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

    const handleNukeConfirmation = () => {
        setNukeConfirmationText("");
        setIsFinalNukeModalOpen(true);
    };

    const handleNukeExecution = async () => {
        if (nukeConfirmationText !== NUKE_CONFIRMATION_PHRASE) return;

        setIsNukeExecuting(true);
        try {
            await executeNuke(nukeConfirmationText);
            setIsFinalNukeModalOpen(false);
            setIsNukeModalOpen(false);
            setIsNukeAnimating(true);
            notification.success({
                placement: "topRight",
                message: "Nuke complete",
                description: "The configured application data has been removed."
            });
        } catch (nukeError) {
            notification.error({
                placement: "topRight",
                message: "Nuke request failed",
                description: nukeError instanceof Error ? nukeError.message : "Could not execute the nuke script."
            });
        } finally {
            setIsNukeExecuting(false);
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

                {isAdmin && (
                    <section className="profile-danger-zone" aria-labelledby="profile-danger-zone-title">
                        <div className="profile-danger-zone-heading">
                            <div>
                                <h3 id="profile-danger-zone-title">Danger zone</h3>
                                <p>Administrative database action</p>
                            </div>
                            <span className="profile-danger-zone-badge">Admin only</span>
                        </div>
                        <p className="profile-danger-zone-description">
                            Permanently clear application data while preserving the database structure. This also removes users and role assignments.
                        </p>
                        <Button
                            danger
                            icon={<span aria-hidden="true" className="profile-bomb-icon">💣</span>}
                            onClick={() => setIsNukeModalOpen(true)}
                        >
                            Nuke application data
                        </Button>
                    </section>
                )}
            </section>

            {isAdmin && (
                <Modal
                    className="profile-nuke-modal"
                    title={(
                        <span className="profile-nuke-modal-title">
                            <WarningFilled aria-hidden="true" />
                            Confirm destructive action
                        </span>
                    )}
                    open={isNukeModalOpen}
                    okText="Continue to final warning"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true, icon: <WarningFilled /> }}
                    onOk={handleNukeConfirmation}
                    onCancel={() => {
                        setIsFinalNukeModalOpen(false);
                        setIsNukeModalOpen(false);
                    }}
                    mask={{ closable: false }}
                    keyboard={false}
                    closable={false}
                >
                    <div className="profile-nuke-warning" role="alert">
                        <p>
                            Running <code>db/utils/Nuke.sql</code> truncates the configured application tables, including users, roles, transactions, uploads, and audit logs. It restarts identity sequences while preserving the database structure.
                        </p>
                        <p>
                            This cannot be undone. The next step requires the exact confirmation phrase before the API runs.
                        </p>
                    </div>

                    <Modal
                        className="profile-nuke-final-modal"
                        title={(
                            <span className="profile-nuke-modal-title">
                                <WarningFilled aria-hidden="true" />
                                Final confirmation — all data will be deleted
                            </span>
                        )}
                        open={isFinalNukeModalOpen}
                        zIndex={1100}
                        okText="Delete all data"
                        cancelText="Go back"
                        okButtonProps={{
                            danger: true,
                            icon: <span aria-hidden="true">💣</span>,
                            disabled: nukeConfirmationText !== NUKE_CONFIRMATION_PHRASE
                        }}
                        confirmLoading={isNukeExecuting}
                        onOk={handleNukeExecution}
                        onCancel={() => setIsFinalNukeModalOpen(false)}
                        mask={{ closable: false }}
                        keyboard={false}
                        closable={false}
                    >
                        <div className="profile-nuke-warning" role="alert">
                            <p>There is no recovery action in this application. The request immediately truncates the configured database tables.</p>
                            <label className="profile-nuke-confirmation-label" htmlFor="nuke-confirmation-text">
                                Type <strong>DELETE ALL DATA</strong> to enable the destructive action.
                            </label>
                            <Input
                                id="nuke-confirmation-text"
                                autoComplete="off"
                                value={nukeConfirmationText}
                                onChange={(event) => setNukeConfirmationText(event.target.value)}
                                placeholder="DELETE ALL DATA"
                            />
                        </div>
                    </Modal>
                </Modal>
            )}

            {isNukeAnimating && (
                <div className="nuke-explosion-overlay" role="status" aria-live="polite">
                    <div className="nuke-explosion-art" aria-hidden="true">
                        <span className="nuke-explosion-flash" />
                        <span className="nuke-explosion-core" />
                        <span className="nuke-explosion-smoke" />
                        {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
                    </div>
                    <div className="nuke-explosion-message">
                        <strong>BOOM!</strong>
                        <span>Application data cleared</span>
                    </div>
                </div>
            )}
        </main>
    );
}
