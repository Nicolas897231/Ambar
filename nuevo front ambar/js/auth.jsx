/* ============================================================
   AMBAR — Autenticación: login multi-usuario, MFA, recuperación
   ============================================================ */
const SESSION_KEY = "ambar.session.v1";
const THEME_KEY = "ambar.theme.v1";

window.getSession = () => { try { const id = +localStorage.getItem(SESSION_KEY); return USERS.find(u => u.id === id) || null; } catch { return null; } };
window.setSession = (u) => localStorage.setItem(SESSION_KEY, String(u.id));
window.clearSession = () => localStorage.removeItem(SESSION_KEY);
window.getTheme = () => localStorage.getItem(THEME_KEY) || "light";
window.setTheme = (t) => { localStorage.setItem(THEME_KEY, t); document.documentElement.setAttribute("data-theme", t); };

function AuthBackdrop() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e) => {
      const cx = (e.clientX / window.innerWidth - 0.5), cy = (e.clientY / window.innerHeight - 0.5);
      el.querySelectorAll(".parallax").forEach((p, i) => {
        const d = (i + 1) * 14;
        p.style.transform = `translate(${cx * d}px, ${cy * d}px)`;
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return (
    <div ref={ref} className="auth-bg">
      <div className="orb parallax" style={{ background: "var(--amber-400)", width: 460, height: 460, top: "-12%", left: "-6%" }} />
      <div className="orb parallax" style={{ background: "var(--viz-indigo)", width: 380, height: 380, bottom: "-14%", left: "18%", opacity: .5 }} />
      <div className="orb parallax" style={{ background: "var(--amber-600)", width: 300, height: 300, top: "30%", right: "-4%", opacity: .4 }} />
      <div className="auth-grid-overlay" />
    </div>
  );
}

function DemoUserPicker({ onPick }) {
  return (
    <div className="col" style={{ gap: "var(--s2)" }}>
      <div className="row gap2" style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", fontWeight: 600 }}>
        <Icon name="sparkles" size={13} style={{ color: "var(--brand)" }} /> Acceso rápido demo — un clic para entrar como…
      </div>
      <div className="demo-users">
        {USERS.map(u => (
          <button key={u.id} className="demo-user" onClick={() => onPick(u)} type="button">
            <span className="avatar sm" style={{ background: u.color }}>{u.initials}</span>
            <span className="col" style={{ gap: 0, alignItems: "flex-start", minWidth: 0 }}>
              <span className="du-name">{u.name.split(" ")[0]}</span>
              <span className="du-role">{ROLES[u.role].name}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ onAuth }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mfa, setMfa] = useState("");
  const [stage, setStage] = useState("creds"); // creds | mfa
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("login"); // login | recover | activate
  const [theme, setThemeS] = useState(getTheme());

  const toggleTheme = () => { const t = theme === "light" ? "dark" : "light"; setThemeS(t); setTheme(t); };

  const quickPick = (u) => { setEmail(u.email); setPass("ambar"); setError(""); setStage("creds"); };

  const submitCreds = (e) => {
    e && e.preventDefault();
    setError(""); setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const u = USERS.find(x => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || pass !== u.pass) { setError("Credenciales inválidas. Prueba con la contraseña: ambar"); return; }
      if (u.mfa) { setPending(u); setStage("mfa"); } else { onAuth(u); }
    }, 520);
  };
  const submitMfa = (e) => {
    e && e.preventDefault();
    setError(""); setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mfa.length !== 6) { setError("Ingresa los 6 dígitos del código."); return; }
      onAuth(pending); // demo: cualquier código de 6 dígitos
    }, 520);
  };

  return (
    <div className="auth-page">
      <AuthBackdrop />
      <button className="icon-btn auth-theme" onClick={toggleTheme} title="Cambiar tema" style={{ color: "var(--side-text)" }}>
        <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
      </button>

      {/* Panel marca */}
      <div className="auth-brandpanel">
        <div className="row gap2" style={{ marginBottom: "auto" }}>
          <div className="side-logo" style={{ width: 44, height: 44 }}><Icon name="folder-kanban" size={24} /></div>
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
          <div className="floaty" style={{ animationDelay: "0s" }}><Icon name="file-check" size={16} /> Contrato laboral · v3</div>
          <div className="floaty" style={{ animationDelay: "1.2s" }}><Icon name="package-check" size={16} /> Caja CAJ-00128 · Pasillo B</div>
          <div className="floaty" style={{ animationDelay: "0.6s" }}><Icon name="stethoscope" size={16} /> Examen periódico · Vigente</div>
        </div>
      </div>

      {/* Panel formulario */}
      <div className="auth-formpanel">
        <div className="auth-card an-scale">
          {view === "login" && (
            <>
              <div className="auth-mobile-brand"><div className="side-logo"><Icon name="folder-kanban" size={22} /></div><b>AMBAR</b></div>
              {stage === "creds" ? (
                <>
                  <h2>Bienvenido de nuevo</h2>
                  <p className="muted" style={{ marginBottom: "var(--s5)" }}>Ingresa con tu cuenta corporativa para continuar.</p>
                  <form onSubmit={submitCreds} className="col" style={{ gap: "var(--s4)" }}>
                    <Field label="Correo corporativo">
                      <div className="input-icon"><Icon name="mail" size={16} /><input type="email" value={email} placeholder="nombre@ambar.co" onChange={e => setEmail(e.target.value)} required /></div>
                    </Field>
                    <Field label="Contraseña">
                      <div className="input-icon"><Icon name="lock" size={16} />
                        <input type={showPass ? "text" : "password"} value={pass} placeholder="••••••••" onChange={e => setPass(e.target.value)} required style={{ paddingRight: 40 }} />
                        <button type="button" className="pass-toggle" onClick={() => setShowPass(s => !s)} tabIndex={-1}><Icon name={showPass ? "eye-off" : "eye"} size={16} /></button>
                      </div>
                    </Field>
                    {error && <div className="auth-error an-fall"><Icon name="alert-circle" size={15} /> {error}</div>}
                    <div className="row between" style={{ fontSize: "var(--fs-sm)" }}>
                      <label className="check"><input type="checkbox" defaultChecked /> Recordarme</label>
                      <a className="auth-link" onClick={() => setView("recover")}>¿Olvidaste tu contraseña?</a>
                    </div>
                    <Button size="lg" className="btn-block shine" type="submit" disabled={loading} icon={loading ? null : "log-in"}>
                      {loading ? "Validando…" : "Ingresar"}
                    </Button>
                  </form>
                  <div className="auth-divider"><span>o</span></div>
                  <DemoUserPicker onPick={quickPick} />
                  <p className="muted" style={{ textAlign: "center", fontSize: "var(--fs-xs)", marginTop: "var(--s4)" }}>
                    ¿Cuenta nueva? <a className="auth-link" onClick={() => setView("activate")}>Activa tu cuenta</a>
                  </p>
                </>
              ) : (
                <div className="an-scale">
                  <button className="auth-back" onClick={() => { setStage("creds"); setError(""); }}><Icon name="chevron-left" size={16} /> Volver</button>
                  <div className="mfa-badge pulse"><Icon name="fingerprint" size={26} /></div>
                  <h2>Verificación en dos pasos</h2>
                  <p className="muted" style={{ marginBottom: "var(--s5)" }}>Hola {pending?.name.split(" ")[0]}, ingresa el código de 6 dígitos de tu app autenticadora.</p>
                  <form onSubmit={submitMfa} className="col" style={{ gap: "var(--s4)" }}>
                    <input className="mfa-input mono" value={mfa} onChange={e => setMfa(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" autoFocus />
                    {error && <div className="auth-error an-fall"><Icon name="alert-circle" size={15} /> {error}</div>}
                    <Button size="lg" className="btn-block" type="submit" disabled={loading} icon="shield-check">{loading ? "Verificando…" : "Verificar e ingresar"}</Button>
                    <p className="muted" style={{ textAlign: "center", fontSize: "var(--fs-xs)" }}>Demo: cualquier código de 6 dígitos funciona.</p>
                  </form>
                </div>
              )}
            </>
          )}
          {view === "recover" && <RecoverView onBack={() => setView("login")} />}
          {view === "activate" && <ActivateView onBack={() => setView("login")} />}
        </div>
        <p className="auth-foot">AMBAR © 2026 · Cali, Colombia · <a className="auth-link">Privacidad</a> · <a className="auth-link">Soporte</a></p>
      </div>
    </div>
  );
}

function RecoverView({ onBack }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="an-scale">
      <button className="auth-back" onClick={onBack}><Icon name="chevron-left" size={16} /> Volver al login</button>
      {!sent ? (
        <>
          <div className="mfa-badge"><Icon name="key-round" size={24} /></div>
          <h2>Recuperar contraseña</h2>
          <p className="muted" style={{ marginBottom: "var(--s5)" }}>Te enviaremos un enlace seguro para restablecer tu contraseña.</p>
          <form onSubmit={e => { e.preventDefault(); setSent(true); }} className="col" style={{ gap: "var(--s4)" }}>
            <Field label="Correo corporativo"><div className="input-icon"><Icon name="mail" size={16} /><input type="email" placeholder="nombre@ambar.co" required /></div></Field>
            <Button size="lg" className="btn-block" type="submit" icon="send">Enviar enlace de recuperación</Button>
          </form>
        </>
      ) : (
        <div className="col center an-scale" style={{ gap: "var(--s3)", textAlign: "center", padding: "var(--s4) 0" }}>
          <div className="mfa-badge" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="check-circle" size={26} /></div>
          <h2>Revisa tu correo</h2>
          <p className="muted">Si la cuenta existe, recibirás un enlace para restablecer tu contraseña en los próximos minutos.</p>
          <Button variant="ghost" onClick={onBack} icon="arrow-left">Volver al inicio</Button>
        </div>
      )}
    </div>
  );
}

function ActivateView({ onBack }) {
  const [step, setStep] = useState(0);
  return (
    <div className="an-scale">
      <button className="auth-back" onClick={onBack}><Icon name="chevron-left" size={16} /> Volver al login</button>
      <div className="mfa-badge"><Icon name="user-check" size={24} /></div>
      <h2>Activa tu cuenta</h2>
      <p className="muted" style={{ marginBottom: "var(--s5)" }}>Tu administrador te creó un usuario. Defínelo en 2 pasos.</p>
      <div style={{ marginBottom: "var(--s5)" }}><Stepper steps={["Verificar", "Contraseña"]} current={step} /></div>
      {step === 0 ? (
        <form onSubmit={e => { e.preventDefault(); setStep(1); }} className="col" style={{ gap: "var(--s4)" }}>
          <Field label="Código de invitación" help="Lo recibiste en tu correo de bienvenida."><input className="mono" placeholder="AMBAR-XXXX-XXXX" defaultValue="AMBAR-7K2P-9XQ4" /></Field>
          <Button size="lg" className="btn-block" type="submit" iconRight="arrow-right">Continuar</Button>
        </form>
      ) : (
        <form onSubmit={e => { e.preventDefault(); onBack(); }} className="col" style={{ gap: "var(--s4)" }}>
          <Field label="Nueva contraseña"><div className="input-icon"><Icon name="lock" size={16} /><input type="password" placeholder="Mínimo 8 caracteres" /></div></Field>
          <Field label="Confirmar contraseña"><div className="input-icon"><Icon name="lock" size={16} /><input type="password" placeholder="Repite la contraseña" /></div></Field>
          <Button size="lg" className="btn-block" type="submit" icon="check">Activar y entrar</Button>
        </form>
      )}
    </div>
  );
}

Object.assign(window, { LoginScreen });
