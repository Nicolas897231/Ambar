/* ============================================================
   AMBAR — Root: sesión, tema, router por hash
   ============================================================ */

function ComingSoon({ route }) {
  const t = (window.ROUTE_TITLES && window.ROUTE_TITLES[route]) || ["AMBAR", route];
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">{t[0]}</div><h1>{t[1]}</h1></div></div>
      <Card><Empty icon="layout" title="Módulo en construcción" action={<Badge tone="brand">Próxima fase</Badge>}>Esta pantalla forma parte del alcance completo y se está construyendo por fases.</Empty></Card>
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
  const [route, setRoute] = useState(getRoute());
  const [theme, setThemeState] = useState(getTheme());

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((key) => { location.hash = "/" + key; setRoute(key); window.scrollTo(0, 0); }, []);
  const toggleTheme = () => { const t = theme === "light" ? "dark" : "light"; setThemeState(t); setTheme(t); };

  const onAuth = (u) => { setSession(u); setUser(u); navigate("dashboard"); };
  const onLogout = () => { clearSession(); setUser(null); location.hash = ""; };
  const onSwitchUser = (u) => { setSession(u); setUser(u); navigate("dashboard"); };

  // Public job portal lives outside the auth shell
  if (route === "empleo" || route === "portal") {
    return <JobPortal onBack={() => navigate(user ? "dashboard" : "dashboard")} loggedIn={!!user} />;
  }

  if (!user) return <LoginScreen onAuth={onAuth} />;

  const PAGES = {
    dashboard: window.DashboardPage, expedients: window.ExpedientsPage, documents: window.DocumentsPage,
    digitization: window.DigitizationPage, trd: window.TRDPage, archive: window.ArchivePage,
    transfers: window.TransfersPage, loans: window.LoansPage, correspondence: window.CorrespondencePage,
    hr: window.HRPage, medical: window.MedicalPage, recruitment: window.RecruitmentPage,
    reports: window.ReportsPage, audit: window.AuditPage, security: window.SecurityPage, settings: window.SettingsPage,
  };
  // Guard: route must be permitted for the user
  const navItem = NAV.flatMap(g => g.items).find(i => i.key === route);
  const allowed = !navItem || can(user, navItem.perms);
  const Page = allowed ? (PAGES[route] || null) : null;

  return (
    <AppShell user={user} route={route} onNavigate={navigate} onLogout={onLogout} onSwitchUser={onSwitchUser} theme={theme} toggleTheme={toggleTheme}>
      {!allowed
        ? <Card><Empty icon="lock" title="Sin acceso a este módulo" action={<Button icon="arrow-left" onClick={() => navigate("dashboard")}>Ir al Dashboard</Button>}>Tu rol ({ROLES[user.role].name}) no tiene permisos para ver esta sección. Habla con tu administrador si crees que es un error.</Empty></Card>
        : (Page ? <Page user={user} navigate={navigate} /> : <ComingSoon route={route} />)}
    </AppShell>
  );
}

// Fallback portal stub if module not loaded yet
if (!window.JobPortal) window.JobPortal = function ({ onBack }) { return <div className="auth-page"><div className="auth-formpanel"><Empty icon="briefcase" title="Portal de empleo" action={<Button onClick={onBack}>Volver</Button>}>En construcción.</Empty></div></div>; };

Object.assign(window, { Root, ComingSoon });

const _root = ReactDOM.createRoot(document.getElementById("root"));
_root.render(<ToastProvider><Root /></ToastProvider>);

// Enable entrance animations only after first paint (kept off in frozen/print
// contexts so content is always visible by default).
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("anim-ready")));
