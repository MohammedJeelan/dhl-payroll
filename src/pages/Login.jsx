import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/app/upload", { replace: true });
    } catch (err) {
      setError(err.message || "Couldn't sign in. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-route" aria-hidden="true">
        <svg viewBox="0 0 1200 300" preserveAspectRatio="none">
          <path
            id="route-path"
            d="M -50 250 C 250 40, 550 320, 850 90 S 1150 40, 1300 60"
            fill="none"
            stroke="url(#route-grad)"
            strokeWidth="2"
            strokeDasharray="6 10"
          />
          <defs>
            <linearGradient id="route-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffc72c" stopOpacity="0" />
              <stop offset="50%" stopColor="#ffc72c" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle r="4.5" fill="#ffc72c" className="route-dot">
            <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
              <mpath href="#route-path" />
            </animateMotion>
          </circle>
        </svg>
      </div>

      <div className="waybill">
        <div className="waybill-top">
          <div className="waybill-brand">
            <span className="waybill-mark">M</span>
            <div>
              <div className="waybill-title">DHL Express</div>
              <div className="waybill-subtitle">Payroll control · DHL Express ops</div>
            </div>
          </div>
          <div className="waybill-barcode" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} style={{ width: (i * 7) % 3 === 0 ? 3 : 1 }} />
            ))}
          </div>
        </div>

        <form className="waybill-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@vilcart.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="waybill-error">{error}</div>}

          <button type="submit" className="waybill-submit" disabled={loading}>
            {loading ? "Verifying…" : "Sign in"}
          </button>
        </form>

        <div className="waybill-foot">
          <span>ORIGIN: FIRESTORE</span>
          <span>ROUTE: DHLEXPRESSUSERS</span>
        </div>
      </div>
    </div>
  );
}
