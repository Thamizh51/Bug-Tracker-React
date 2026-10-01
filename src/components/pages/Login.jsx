import "./Login.css";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

function Login() {
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            const response = await fetch("http://localhost:8000/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    email: e.target.email.value,
                    password: e.target.password.value,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                const rolePath = {
                    admin: "/admin",
                    developer: "/developer",
                    tester: "/tester",
                }[String(data.user?.role || "").toLowerCase()];

                if (!rolePath) {
                    setError("This account does not have a supported dashboard role.");
                    return;
                }

                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));
                navigate(rolePath, { replace: true });
            } else {
                setError(data.message || "Unable to sign in. Check your credentials and try again.");
            }
        } catch {
            setError("Could not reach the server. Check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">

                <div className="login-header">
                    <h1>Bug Tracker</h1>
                    <p>Sign in to manage your bugs</p>
                </div>

                <form
                    className="login-form"
                    onSubmit={handleLogin}
                >
                    {error && <p className="login-error" role="alert">{error}</p>}

                    <div className="form-group">
                        <label htmlFor="email">
                            Email
                        </label>

                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="Enter your email"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">
                            Password
                        </label>

                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Signing in..." : "Login"}
                    </button>
                </form>

            </div>
        </div>
    );
}

export default Login;

