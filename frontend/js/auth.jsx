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
      } else if (err.status === 401) {
        setError("Correo o contraseña incorrectos. Verifica las credenciales del usuario.");
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
                <div className="row between" style={{ fontSize: "var(--fs-sm)" }}><label className="check" htmlFor="remember-session"><input id="remember-session" name="remember-session" type="checkbox" defaultChecked /> Recordarme</label><a className="auth-link" onClick={() => setView("recover")}>¿Olvidaste tu contraseña?</a></div>
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
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await window.AmbarAPI.forgotPassword(email.trim());
      setSent(true);
      toast(result?.message || "Si la cuenta existe, la clave fue restablecida a la identificacion.", { tone: "ok", title: "Recuperacion solicitada" });
    } catch (err) {
      setError(err.message || "No fue posible solicitar la recuperacion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="an-scale">
      <button className="auth-back" onClick={onBack}><Icon name="chevron-left" size={16} /> Volver al login</button>
      <div className="mfa-badge"><Icon name="key-round" size={24} /></div>
      <h2>Recuperar contraseña</h2>
      <p className="muted" style={{ marginBottom: "var(--s5)" }}>Escribe tu correo. Si la cuenta existe y esta activa, AMBAR restablecera la clave a tu numero de identificacion y te pedira crear una nueva al ingresar.</p>
      <form onSubmit={submit} className="col" style={{ gap: "var(--s4)" }}>
        <Field label="Correo corporativo" required><div className="input-icon"><Icon name="mail" size={16} /><input type="email" value={email} placeholder="nombre@empresa.com" onChange={e => setEmail(e.target.value)} required /></div></Field>
        {sent && <div className="context-help"><Icon name="shield-check" size={18} /><p>Revisa tu identificacion. Esa sera tu clave temporal hasta que la cambies en el proximo ingreso.</p></div>}
        {error && <div className="auth-error an-fall"><Icon name="alert-circle" size={15} /> {error}</div>}
        <Button size="lg" className="btn-block shine" type="submit" disabled={loading} icon="rotate-ccw">{loading ? "Procesando..." : "Restablecer clave"}</Button>
      </form>
      <div className="context-help" style={{ marginTop: "var(--s4)" }}><Icon name="shield-check" size={18} /><p>Por seguridad, el mensaje no confirma si el correo existe. La operacion queda auditada en backend.</p></div>
      <Button variant="ghost" onClick={onBack} icon="arrow-left">Volver al inicio</Button>
    </div>
  );
}

function PasswordChangeScreen({ user, onChanged, onLogout }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setThemeS] = useState(getTheme());

  const toggleTheme = () => { const t = theme === "light" ? "dark" : "light"; setThemeS(t); setTheme(t); };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Las claves no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const result = await window.AmbarAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast(result?.message || "Clave actualizada.", { tone: "ok", title: "Seguridad actualizada" });
      const freshUser = await window.AmbarAPI.validateSession();
      onChanged(freshUser);
    } catch (err) {
      setError(err.message || "No fue posible cambiar la clave.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthBackdrop />
      <button className="icon-btn auth-theme" onClick={toggleTheme} title="Cambiar tema" style={{ color: "var(--side-text)" }}>
        <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
      </button>
      <div className="auth-formpanel">
        <div className="auth-card an-scale">
          <div className="auth-mobile-brand"><div className="side-logo"><img src="/assets/ambar-logo.svg" alt="" /></div><b>AMBAR</b></div>
          <div className="mfa-badge"><Icon name="shield-check" size={24} /></div>
          <h2>Crea tu nueva clave</h2>
          <p className="muted" style={{ marginBottom: "var(--s5)" }}>Hola {user?.name || "usuario"}. Tu cuenta usa una clave temporal basada en la identificacion. Debes cambiarla para continuar.</p>
          <form onSubmit={submit} className="col" style={{ gap: "var(--s4)" }}>
            <Field label="Clave temporal actual" required><div className="input-icon"><Icon name="lock" size={16} /><input type="password" value={currentPassword} placeholder="Tu identificacion" onChange={e => setCurrentPassword(e.target.value)} required /></div></Field>
            <Field label="Nueva clave" required hint="Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo."><div className="input-icon"><Icon name="key-round" size={16} /><input type="password" value={newPassword} placeholder="Nueva clave segura" onChange={e => setNewPassword(e.target.value)} required /></div></Field>
            <Field label="Confirmar nueva clave" required><div className="input-icon"><Icon name="check-circle" size={16} /><input type="password" value={confirmPassword} placeholder="Repite la nueva clave" onChange={e => setConfirmPassword(e.target.value)} required /></div></Field>
            {error && <div className="auth-error an-fall"><Icon name="alert-circle" size={15} /> {error}</div>}
            <Button size="lg" className="btn-block shine" type="submit" disabled={loading} icon="shield-check">{loading ? "Guardando..." : "Actualizar clave y continuar"}</Button>
          </form>
          <div className="context-help" style={{ marginTop: "var(--s4)" }}><Icon name="info" size={18} /><p>AMBAR guarda la clave con hash seguro. Nunca se almacena ni se muestra en texto plano.</p></div>
          <Button variant="ghost" onClick={onLogout} icon="log-out">Salir</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen, PasswordChangeScreen });
