/* ============================================================
   AMBAR - Root: sesion, tema, router por hash
   ============================================================ */

function ComingSoon({ route }) {
  const t = (window.ROUTE_TITLES && window.ROUTE_TITLES[route]) || ["AMBAR", route];
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">{t[0]}</div><h1>{t[1]}</h1></div></div>
      <Card><Empty icon="layout" title="Modulo en construccion" action={<Badge tone="brand">Proxima fase</Badge>}>Esta pantalla forma parte del alcance completo y se esta construyendo por fases.</Empty></Card>
    </>
  );
}

function getRoute() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  if (h) return h;
  const path = location.pathname.replace(/^\/+|\/+$/g, "");
  if (path && path !== "index.html" && path !== "login") return path;
  return "dashboard";
}

function Root() {
  const [user, setUser] = useState(() => getSession());
  const [checkingSession, setCheckingSession] = useState(() => Boolean(getSession()));
  const [route, setRoute] = useState(getRoute());
  const [theme, setThemeState] = useState(getTheme());

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => {
    let alive = true;
    if (!window.AmbarAPI?.hasSession()) {
      setCheckingSession(false);
      return;
    }
    window.AmbarAPI.validateSession()
      .then((freshUser) => {
        if (!alive) return;
        if (!freshUser) {
          clearSession();
          setUser(null);
          if (!["empleo", "portal"].includes(getRoute())) location.hash = "";
          return;
        }
        setSession(freshUser);
        setUser(freshUser);
      })
      .catch(() => {
        if (!alive) return;
        clearSession();
        setUser(null);
        if (!["empleo", "portal"].includes(getRoute())) location.hash = "";
      })
      .finally(() => alive && setCheckingSession(false));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    const onExpired = () => {
      clearSession();
      setUser(null);
      if (!["empleo", "portal"].includes(getRoute())) location.hash = "";
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("ambar:session-expired", onExpired);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("ambar:session-expired", onExpired);
    };
  }, []);

  const navigate = useCallback((key) => { location.hash = "/" + key; setRoute(key); window.scrollTo(0, 0); }, []);
  const toggleTheme = () => { const t = theme === "light" ? "dark" : "light"; setThemeState(t); setTheme(t); };

  const onAuth = (u) => { setSession(u); setUser(u); navigate("dashboard"); };
  const onLogout = () => { clearSession(); setUser(null); location.hash = ""; };

  if (route === "empleo" || route === "portal") {
    return <JobPortal onBack={() => navigate(user ? "dashboard" : "dashboard")} loggedIn={!!user} />;
  }

  if (checkingSession) {
    return (
      <div className="auth-page">
        <AuthBackdrop />
        <div className="auth-formpanel">
          <div className="auth-card an-scale">
            <div className="mfa-badge pulse"><Icon name="shield-check" size={24} /></div>
            <h2>Verificando sesion</h2>
            <p className="muted">Estamos validando tu cookie segura antes de abrir AMBAR.</p>
            <Skeleton rows={3} />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen onAuth={onAuth} />;

  const PAGES = {
    dashboard: window.DashboardPage, expedients: window.ExpedientsPage, documents: window.DocumentsPage,
    repository: window.RepositoryPage, foliation: window.FoliationPage, documentSearch: window.DocumentSearchPage,
    digitization: window.DigitizationPage, trd: window.TRDPage, archive: window.ArchivePage,
    inventory: window.InventoryPage, kardex: window.KardexPage, transfers: window.TransfersPage,
    reception: window.ReceptionPage, fuid: window.FuidPage, loans: window.LoansPage, correspondence: window.CorrespondencePage,
    hr: window.HRPage, medical: window.MedicalPage, recruitment: window.RecruitmentPage,
    reports: window.ReportsPage, audit: window.AuditPage, security: window.SecurityPage, settings: window.SettingsPage,
  };
  const navItem = NAV.flatMap(g => g.items).find(i => i.key === route);
  const allowed = !navItem || can(user, navItem.perms);
  const Page = allowed ? (PAGES[route] || null) : null;

  return (
    <AppShell user={user} route={route} onNavigate={navigate} onLogout={onLogout} theme={theme} toggleTheme={toggleTheme}>
      {!allowed
        ? <Card><Empty icon="lock" title="Sin acceso a este modulo" action={<Button icon="arrow-left" onClick={() => navigate("dashboard")}>Ir al Dashboard</Button>}>Tu rol ({roleMeta(user).name}) no tiene permisos para ver esta seccion. Habla con tu administrador si crees que es un error.</Empty></Card>
        : (Page ? <ErrorBoundary key={route}><Page user={user} navigate={navigate} /></ErrorBoundary> : <ComingSoon route={route} />)}
    </AppShell>
  );
}

if (!window.JobPortal) window.JobPortal = function ({ onBack }) { return <div className="auth-page"><div className="auth-formpanel"><Empty icon="briefcase" title="Portal de empleo" action={<Button onClick={onBack}>Volver</Button>}>En construccion.</Empty></div></div>; };

Object.assign(window, { Root, ComingSoon });

const _root = ReactDOM.createRoot(document.getElementById("root"));
_root.render(<ToastProvider><ErrorBoundary><Root /></ErrorBoundary></ToastProvider>);

requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("anim-ready")));
