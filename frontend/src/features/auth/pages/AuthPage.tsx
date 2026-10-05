import { useState } from "react";
import { LoginForm } from "../components/LoginForm";
import { RegisterForm } from "../components/RegisterForm";
import { Button } from "antd";

export function AuthPage() {
    const [mode, setMode] = useState<"login" | "register">("login");

    return (
        <main className="page">
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
                    <Button type={mode === "login" ? "primary" : "text"} className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</Button>
                    <Button type={mode === "register" ? "primary" : "text"} className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</Button>
                </div>
                {mode === "login" ? <LoginForm /> : <RegisterForm />}
            </section>
        </main>
    );
}
