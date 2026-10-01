import "./Login.css";
import { useNavigate } from "react-router-dom";

function Login() {
    const navigate = useNavigate();

    async function handleLogin(e) {
        e.preventDefault();

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

            console.log("Login response:", data);

            if (response.ok && data.success) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));

                if (data.user.role === "admin") {
                    navigate("/admin");
                } else if (data.user.role === "developer") {
                    navigate("/developer");
                } else {
                    navigate("/tester");
                }
            } else {
                console.log("Login failed:", data.message);
            }
        } catch (error) {
            console.error("Login error:", error);
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
                    >
                        Login
                    </button>
                </form>

            </div>
        </div>
    );
}

export default Login;

