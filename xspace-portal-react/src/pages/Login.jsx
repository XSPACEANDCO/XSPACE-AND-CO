import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getToken } from '../lib/api';
import { KEYS, setRaw } from '../lib/storage';
import { usePageClass } from '../hooks/usePageClass';
import { useTheme } from '../hooks/useTheme';
import './login.css';

/* Real authentication against the API. There is no public sign-up — accounts
   are created by a Founder or Core member who hands over the credentials.

   Partners are given a username; the internal team tend to type their email.
   The server matches either against both columns. */
export default function Login() {
  usePageClass('login');
  const [theme, toggleTheme] = useTheme('light');
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  /* Sidebar and route guards read the role synchronously, so the server's
     answer is mirrored into localStorage. It is only ever a copy of what the
     token already says — the API re-checks the role on every request, so
     editing it here buys nobody access to anything. */
  function rememberSession(user) {
    setRaw(KEYS.auth, '1');
    setRaw(KEYS.role, user.role);
    setRaw(KEYS.userId, user.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const out = await api.auth.login(identifier.trim(), password);
      rememberSession(out.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-login">
      <div
        className="toptoggle"
        role="button"
        tabIndex={0}
        onClick={toggleTheme}
        onKeyDown={(e) => e.key === 'Enter' && toggleTheme()}
      >
        {theme === 'dark' ? '🌙 Night' : '☀️ Day'}
      </div>

      <main className="center">
        <section className="card" role="main" aria-labelledby="brandTitle">
          <div className="brand" id="brandTitle">
            <div className="title">Xspace &amp; Co.</div>
            <div className="sub">Portal</div>
          </div>

          <div className="login-head">
            <h2>Login to continue</h2>
            <div className="hint">Sign in to your private workspace</div>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">
            <div>
              <label htmlFor="identifier">Username or email</label>
              <input
                id="identifier"
                name="username"
                type="text"
                placeholder="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Login to Portal'}
              </button>
            </div>

            <div className="small">Private Access • Accounts are created by the Xspace team</div>
          </form>

          <div className="small copyright">© {new Date().getFullYear()} Xspace &amp; Co.</div>
        </section>
      </main>
    </div>
  );
}
