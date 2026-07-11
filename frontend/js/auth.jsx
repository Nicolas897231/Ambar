/* ============================================================
   AMBAR — Autenticación real conectada al backend
   ============================================================ */
const THEME_KEY = "ambar.theme.v1";

window.getSession = () => {
  try {
    if (!window.AmbarAPI?.hasSession()) return null;
    const raw = localStorage.getItem("ambar_current_user");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
window.setSession = (u) => localStorage.setItem("ambar_current_user", JSON.stringify(u));
window.clearSession = () => window.AmbarAPI?.clearSession();
window.getTheme = () => localStorage.getItem(THEME_KEY) || "light";
window.setTheme = (t) => { localStorage.setItem(THEME_KEY, t); document.documentElement.setAttribute("data-theme", t); };

function AuthBackdrop() {
  return (
    <div className="auth-bg">
      <div className="orb" style={{ background: "var(--amber-400)", width: 460, height: 460, top: "-12%", left: "-6%" }} />
      <div className="orb" style={{ background: "var(--viz-indigo)", width: 380, height: 380, bottom: "-14%", left: "18%", opacity: .5 }} />
      <div className="auth-grid-overlay" />
    </div>
  );
}

function LoginScreen({ onAuth }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mfa, setMfa] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("login");
  const [theme, setThemeS] = useState(getTheme());

  const toggleTheme = () => { const t = theme === "light" ? "dark" : "light"; setThemeS(t); setTheme(t); };

  const submitCreds = async (e) => {
    e && e.preventDefault();
    setError(""); setLoading(true);
    try {
      const user = await window.AmbarAPI.login(email.trim(), pass, needsMfa ? mfa : null);
      onAuth(user);
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("mfa") || err.message === "MFA code required") {
        setNeedsMfa(true);
        setError("Ingresa el código MFA configurado para este usuario.");
      } else if (err.status === 404) {
        setError("El frontend no encuentra el API. Revisa API_PROXY_TARGET o el gateway.");
      } else {
        setError("Credenciales inválidas o servicio no disponible.");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <AuthBackdrop />
      <button className="icon-btn auth-theme" onClick={toggleTheme} title="Cambiar tema" style={{ color: "var(--side-text)" }}>
        <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
      </button>

      <div className="auth-brandpanel">
        <div className="row gap2" style={{ marginBottom: "auto" }}>
          <div className="side-logo" style={{ width: 44, height: 44 }}><img src="/assets/ambar-logo.svg" alt="" /></div>
          <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "#fff", letterSpacing: ".02em" }}>AMBAR</div><div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>SGDEA Enterprise</div></div>
        </div>
        <div className="auth-hero">
          <h1>Toda la memoria<br />de tu empresa,<br /><span className="grad-text">en un solo lugar.</span></h1>
          <p>Gestión documental, archivo físico, expedientes, talento humano y reclutamiento — organizados, trazables y seguros.</p>
          <div className="auth-feats">
            {[["scan-line", "Digitalización con OCR e indexación"], ["map-pin", "Ubicación física exacta del documento"], ["shield-check", "Roles, permisos y auditoría completa"]].map(([ic, tx]) => (
              <div key={tx} className="row gap2"><span className="af-ico"><Icon name={ic} size={15} /></span><span>{tx}</span></div>
            ))}
          </div>
        </div>
        <div className="auth-cards">
          <div className="floaty"><Icon name="file-check" size={16} /> Contrato laboral · versión vigente</div>
          <div className="floaty"><Icon name="package-check" size={16} /> Caja CAJ-00128 · Pasillo B</div>
        </div>
      </div>

      <div className="auth-formpanel">
        <div className="auth-card an-scale">
          {view === "recover" ? <RecoverView onBack={() => setView("login")} /> : (
            <>
              <div className="auth-mobile-brand"><div className="side-logo"><img src="/assets/ambar-logo.svg" alt="" /></div><b>AMBAR</b></div>
              <h2>Bienvenido de nuevo</h2>
              <p className="muted" style={{ marginBottom: "var(--s5)" }}>Ingresa con tu cuenta corporativa para continuar.</p>
              <form onSubmit={submitCreds} className="col" style={{ gap: "var(--s4)" }}>
                <Field label="Correo corporativo"><div className="input-icon"><Icon name="mail" size={16} /><input type="email" value={email} placeholder="nombre@empresa.com" onChange={e => setEmail(e.target.value)} required /></div></Field>
                <Field label="Contraseña"><div className="input-icon"><Icon name="lock" size={16} /><input type={showPass ? "text" : "password"} value={pass} placeholder="••••••••" onChange={e => setPass(e.target.value)} required style={{ paddingRight: 40 }} /><button type="button" className="pass-toggle" onClick={() => setShowPass(s => !s)} tabIndex={-1}><Icon name={showPass ? "eye-off" : "eye"} size={16} /></button></div></Field>
                {needsMfa && <Field label="Código MFA"><input className="mfa-input mono" value={mfa} onChange={e => setMfa(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" /></Field>}
                {error && <div className="auth-error an-fall"><Icon name="alert-circle" size={15} /> {error}</div>}
                <div className="row between" style={{ fontSize: "var(--fs-sm)" }}><label className="check"><input type="checkbox" defaultChecked /> Recordarme</label><a className="auth-link" onClick={() => setView("recover")}>¿Olvidaste tu contraseña?</a></div>
                <Button size="lg" className="btn-block shine" type="submit" disabled={loading} icon={needsMfa ? "key-round" : "log-in"}>{loading ? "Validando…" : needsMfa ? "Validar MFA" : "Ingresar"}</Button>
              </form>
              <div className="auth-divider"><span>Acceso público</span></div>
              <Button as="a" href="/#/empleo" variant="secondary" className="btn-block" icon="briefcase">Portal de empleo</Button>
            </>
          )}
        </div>
        <p className="auth-foot">AMBAR © 2026 · Cali, Colombia · SGDEA Enterprise</p>
      </div>
    </div>
  );
}

function RecoverView({ onBack }) {
  return (
    <div className="an-scale">
      <button className="auth-back" onClick={onBack}><Icon name="chevron-left" size={16} /> Volver al login</button>
      <div className="mfa-badge"><Icon name="key-round" size={24} /></div>
      <h2>Recuperar contraseña</h2>
      <p className="muted" style={{ marginBottom: "var(--s5)" }}>La recuperación por correo queda lista para activar cuando se configure SMTP. Mientras tanto, el administrador restablece la clave desde Seguridad → Usuarios.</p>
      <div className="context-help"><Icon name="shield-check" size={18} /><p>Este flujo evita restablecimientos inseguros y deja trazabilidad de la operación.</p></div>
      <Button variant="ghost" onClick={onBack} icon="arrow-left">Volver al inicio</Button>
    </div>
  );
}

Object.assign(window, { LoginScreen });
