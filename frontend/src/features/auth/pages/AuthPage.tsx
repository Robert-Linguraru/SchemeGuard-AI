import { LoginForm } from "../components/LoginForm";
import { RegisterForm } from "../components/RegisterForm";
import { useTheme } from "../../../app/ThemeProvider";
import { Button } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";

export function AuthPage({ mode = "login" }: { mode?: "login" | "register" }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <main className="page">
            <Button
                className="theme-toggle-button auth-theme-toggle"
                type="default"
                icon={theme === "dark" ? <SunOutlined /> : <MoonOutlined />}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                onClick={toggleTheme}
            />
            <div className="brand-decoration" aria-hidden="true">
                <span className="orb orb-blue orb-one"></span>
                <span className="orb orb-coral orb-two"></span>
                <span className="orb orb-white orb-three"></span>
                <span className="orb orb-blue orb-four"></span>
            </div>
            <section className="card">
                <div className="brand login-brand">
                    <span className="brand-mark">●</span>
                    <span className="brand-name">SchemeGuard AI</span>
                </div>
                <p className="subtitle">Interchange qualification workspace</p>
                <div className="tabs">
                    <Button type={mode === "login" ? "primary" : "text"} className={mode === "login" ? "active" : ""}><Link to="/login">Login</Link></Button>
                    <Button type={mode === "register" ? "primary" : "text"} className={mode === "register" ? "active" : ""}><Link to="/register">Create account</Link></Button>
                </div>
                {mode === "login" ? <LoginForm /> : <RegisterForm />}
            </section>
        </main>
    );
}
