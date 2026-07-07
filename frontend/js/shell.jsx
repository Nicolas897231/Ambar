const ROUTE_TITLES = {
  dashboard: ["Principal", "Dashboard"], expedients: ["Gestión Documental", "Expedientes"], documents: ["Gestión Documental", "Documentos"],
  digitization: ["Gestión Documental", "Digitalización"], trd: ["Gestión Documental", "TRD & Retención"],
  archive: ["Archivo & Custodia", "Archivo Físico"], transfers: ["Archivo & Custodia", "Transferencias"], loans: ["Archivo & Custodia", "Préstamos"],
  correspondence: ["Archivo & Custodia", "Correspondencia"], hr: ["Talento Humano", "Empleados"], medical: ["Talento Humano", "Exámenes Médicos"],
  recruitment: ["Talento Humano", "Reclutamiento"], reports: ["Inteligencia", "Reportes & BI"], audit: ["Inteligencia", "Auditoría"],
  security: ["Administración", "Seguridad"], settings: ["Administración", "Configuración"],
};
Object.assign(ROUTE_TITLES, {
  repository: ["Gestión Documental", "Repositorio"],
  foliation: ["Gestión Documental", "Foliación"],
  documentSearch: ["Gestión Documental", "Búsqueda documental"],
});

function cleanShellText(value) {
  return String(value || "")
    .replaceAll("GestiÃ³n", "Gestión").replaceAll("DigitalizaciÃ³n", "Digitalización")
    .replaceAll("RetenciÃ³n", "Retención").replaceAll("FÃ­sico", "Físico")
    .replaceAll("PrÃ©stamos", "Préstamos").replaceAll("ExÃ¡menes", "Exámenes")
    .replaceAll("MÃ©dicos", "Médicos").replaceAll("AuditorÃ­a", "Auditoría")
    .replaceAll("AdministraciÃ³n", "Administración").replaceAll("ConfiguraciÃ³n", "Configuración")
    .replaceAll("BÃºsqueda", "Búsqueda").replaceAll("FoliaciÃ³n", "Foliación")
    .replaceAll("menÃº", "menú").replaceAll("mÃ³dulo", "módulo").replaceAll("sesiÃ³n", "sesión")
    .replaceAll("NavegaciÃ³n", "Navegación").replaceAll("rÃ¡pida", "rápida")
    .replaceAll("MenÃº", "Menú").replaceAll("mÃ³dulos", "módulos")
    .replaceAll("operaciÃ³n", "operación").replaceAll("AtrÃ¡s", "Atrás");
}

Object.keys(ROUTE_TITLES).forEach(key => {
  ROUTE_TITLES[key] = ROUTE_TITLES[key].map(cleanShellText);
});

function Sidebar({ user, route, onNavigate, collapsed, setCollapsed, onOpenUserMenu }) {
  const [q, setQ] = useState("");
  const role = roleMeta(user);
  const [open, setOpen] = useState(() => {
    const o = {}; NAV.forEach(g => o[g.label] = true); return o;
  });
  const visible = useMemo(() => NAV.map(g => ({
    ...g,
    items: g.items.filter(it => can(user, it.perms) && (!q || (g.label + " " + it.label).toLowerCase().includes(q.toLowerCase())))
  })).filter(g => g.items.length), [user, q]);

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <button className="icon-btn" style={{ color: "var(--side-muted)", display: collapsed ? "grid" : "none" }} onClick={() => setCollapsed(false)} aria-label="Expandir menú lateral"><Icon name="menu" size={18} /></button>
        <div className="side-logo" onClick={() => onNavigate("dashboard")} style={{ cursor: "pointer" }}><Icon name="folder-kanban" size={22} /></div>
        <div className="b-text grow">
          <div className="b-name">AMBAR</div>
          <div className="b-sub">SGDEA Enterprise</div>
        </div>
        <button className="icon-btn" style={{ color: "var(--side-muted)" }} onClick={() => setCollapsed(c => !c)} title="Contraer menu" aria-label="Contraer menú lateral"><Icon name="chevron-left" size={18} /></button>
      </div>

      <div className="side-search" data-tour="search">
        <Icon name="search" size={15} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar modulo..." aria-label="Buscar módulo en menú lateral" />
      </div>

      <nav className="side-nav" data-tour="nav">
        {visible.map(g => (
          <div key={g.label} className={`nav-group${open[g.label] ? " open" : ""}`}>
            <button className="nav-grp-btn" onClick={() => setOpen(o => ({ ...o, [g.label]: !o[g.label] }))} title={g.label}>
              <Icon name={g.icon} size={17} className="g-ico" />
              <span className="g-label grow" style={{ textAlign: "left" }}>{g.label}</span>
              <Icon name="chevron-down" size={14} className="chev" />
            </button>
            {open[g.label] && (
              <div className="nav-items">
                {g.items.map(it => (
                  <button key={it.key} className={`nav-link${route === it.key ? " active" : ""}`} onClick={() => onNavigate(it.key)} title={it.label}>
                    <Icon name={it.icon} size={16} className="l-ico" />
                    <span className="l-label grow" style={{ textAlign: "left" }}>{it.label}</span>
                    {it.badge && <span className={`l-badge${route === it.key ? "" : " muted-badge"}`}>{it.badge}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="side-user" onClick={onOpenUserMenu} data-tour="user">
          <span className="avatar" style={{ background: user.color }}>{user.initials}</span>
          <div className="su-meta"><div className="su-name truncate">{user.name}</div><div className="su-role truncate">{role.name}</div></div>
          <Icon name="chevron-up" size={15} className="su-chev" style={{ color: "var(--side-muted)" }} />
        </div>
      </div>
    </aside>
  );
}

function CommandPalette({ user, onNavigate, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const items = useMemo(() => {
    const list = [];
    NAV.forEach(g => g.items.forEach(it => can(user, it.perms) && list.push({ ...it, group: g.label })));
    return q ? list.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : list;
  }, [q, user]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal cmdk" role="dialog" aria-modal="true" style={{ top: "16%", transform: "translate(-50%,0)", padding: 0, width: "min(620px, calc(100vw - 32px))" }}>
        <div className="cmdk-input"><Icon name="search" size={18} /><input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar modulo en AMBAR..." aria-label="Buscar en AMBAR" /><span className="kbd">esc</span></div>
        <div className="cmdk-list">
          {items.length === 0 && <div className="muted" style={{ padding: "var(--s5)", textAlign: "center" }}>Sin modulos para "{q}".</div>}
          {items.map((it, i) => (
            <button key={i} className="cmdk-item" onClick={() => { onNavigate(it.key); onClose(); }}>
              <Icon name={it.icon} size={17} style={{ color: "var(--muted)" }} />
              <span className="grow" style={{ textAlign: "left" }}>{it.label}</span>
              <span className="cmdk-grp">{it.group}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function UserMenu({ user, onClose, onLogout, theme, toggleTheme }) {
  const currentRole = roleMeta(user);
  return (
    <>
      <div className="scrim" style={{ background: "transparent", backdropFilter: "none" }} onClick={onClose} />
      <div className="usermenu an-fall">
        <div className="um-head">
          <span className="avatar lg" style={{ background: user.color }}>{user.initials}</span>
          <div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{user.name}</div><div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{user.email}</div><div style={{ marginTop: 4 }}><Badge tone="brand">{currentRole.name}</Badge></div></div>
        </div>
        <div className="divider" />
        <button className="um-item" onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} size={16} /> Modo {theme === "light" ? "oscuro" : "claro"}</button>
        <button className="um-item danger" onClick={onLogout}><Icon name="log-out" size={16} /> Cerrar sesión</button>
      </div>
    </>
  );
}

function Tour({ onDone }) {
  const steps = [
    { sel: '[data-tour="nav"]', title: "Menú por permisos", body: "El backend controla tu rol y el frontend solo muestra los módulos autorizados." },
    { sel: '[data-tour="search"]', title: "Navegación rápida", body: "Filtra módulos sin salir de la operación actual." },
    { sel: '[data-tour="globalsearch"]', title: "Búsqueda universal", body: "Pulsa / para abrir el buscador de módulos." },
    { sel: '[data-tour="notif"]', title: "Alertas accionables", body: "Las notificaciones vienen del backend y llevan al contexto real." },
    { sel: '[data-tour="user"]', title: "Cuenta y tema", body: "Consulta tu sesión, cambia tema y cierra sesión de forma segura." },
  ];
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  useEffect(() => {
    const el = document.querySelector(steps[i].sel);
    if (el) { const r = el.getBoundingClientRect(); setRect(r); }
    else setRect(null);
  }, [i]);
  const s = steps[i];
  const pos = rect ? { top: Math.min(rect.bottom + 12, window.innerHeight - 180), left: Math.min(Math.max(rect.left, 16), window.innerWidth - 340) } : { top: "40%", left: "50%" };
  return (
    <div className="tour-layer">
      {rect && <div className="tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className="tour-pop an-scale" style={pos}>
        <div className="row between" style={{ marginBottom: 6 }}><Badge tone="brand">{i + 1} / {steps.length}</Badge><button className="icon-btn btn-sm" onClick={onDone} aria-label="Cerrar tour guiado"><Icon name="x" size={15} /></button></div>
        <h3 style={{ fontSize: "var(--fs-md)" }}>{s.title}</h3>
        <p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>{s.body}</p>
        <div className="row between" style={{ marginTop: "var(--s4)" }}>
          <button className="auth-link" onClick={onDone} style={{ fontSize: "var(--fs-sm)" }}>Saltar</button>
          <div className="row gap2">
            {i > 0 && <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}>Atras</Button>}
            <Button size="sm" onClick={() => i < steps.length - 1 ? setI(i + 1) : onDone()} iconRight={i < steps.length - 1 ? "arrow-right" : "check"}>{i < steps.length - 1 ? "Siguiente" : "Entendido"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShell({ user, route, onNavigate, onLogout, theme, toggleTheme, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showCmd, setShowCmd] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [tour, setTour] = useState(() => !localStorage.getItem("ambar.tour.done"));
  const crumbs = ROUTE_TITLES[route] || ["AMBAR", route];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); setShowCmd(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowCmd(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const endTour = () => { setTour(false); localStorage.setItem("ambar.tour.done", "1"); };

  return (
    <div className={`app-shell${collapsed ? " collapsed" : ""}`}>
      <Sidebar user={user} route={route} onNavigate={onNavigate} collapsed={collapsed} setCollapsed={setCollapsed} onOpenUserMenu={() => setShowUser(true)} />
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="crumbs"><span>{crumbs[0]}</span><Icon name="chevron-right" size={14} className="c-sep" /><span className="c-cur">{crumbs[1]}</span></div>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setShowCmd(true)} data-tour="globalsearch">
              <Icon name="search" size={16} /><span className="gs-text">Buscar en AMBAR...</span><span className="kbd">/</span>
            </button>
            <div style={{ position: "relative" }} data-tour="notif">
              <button className="icon-btn" onClick={() => setShowNotif(s => !s)} title="Notificaciones" aria-label="Abrir notificaciones"><Icon name="bell" size={18} /></button>
              {showNotif && <NotifPanel onClose={() => setShowNotif(false)} onNavigate={(r) => { onNavigate(r); setShowNotif(false); }} />}
            </div>
            <button className="icon-btn" onClick={toggleTheme} title="Cambiar tema" aria-label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button>
            <button className="icon-btn" onClick={() => setTour(true)} title="Tour guiado" aria-label="Iniciar tour guiado"><Icon name="circle-help" size={18} /></button>
            <button className="avatar" style={{ background: user.color, marginLeft: 4, cursor: "pointer", border: "none" }} onClick={() => setShowUser(true)} title={user.name}>{user.initials}</button>
          </div>
        </header>
        <div id="main-content" className="content route-enter" key={route}>{children}</div>
      </div>

      {showCmd && <CommandPalette user={user} onNavigate={onNavigate} onClose={() => setShowCmd(false)} />}
      {showUser && <UserMenu user={user} onClose={() => setShowUser(false)} onLogout={onLogout} theme={theme} toggleTheme={toggleTheme} />}
      {tour && <Tour onDone={endTour} />}
    </div>
  );
}

function NotifPanel({ onClose, onNavigate }) {
  const { data, loading } = useLiveData(() => AmbarAPI.endpoints.notifications(), [], []);
  const notifications = AmbarAPI.listFrom(data);
  const routeFor = (n) => {
    const url = n.action_url || "";
    const match = url.match(/#\/?([^/?#]+)/) || url.match(/\/([^/?#]+)$/);
    return match?.[1] || n.module || "dashboard";
  };
  return (
    <>
      <div className="scrim" style={{ background: "transparent", backdropFilter: "none" }} onClick={onClose} />
      <div className="pop">
        <div className="pop-head"><strong>Notificaciones</strong><Badge tone={notifications.length ? "danger" : "ok"}>{notifications.length}</Badge></div>
        {loading && <div style={{ padding: "var(--s4)" }}><Skeleton lines={3} /></div>}
        {!loading && notifications.length === 0 && <Empty icon="bell" title="Sin notificaciones">Todo esta al dia para tu usuario.</Empty>}
        {notifications.slice(0, 8).map((n) => (
          <div key={n.id || n.idNotification || n.title} className="noti" onClick={() => onNavigate(routeFor(n))}>
            <span className="n-dot"><Icon name="bell" size={17} /></span>
            <div className="n-body">
              <div className="n-title">{n.title || "Notificacion"}</div>
              <div className="n-msg">{n.message || n.module || "Requiere revision operativa."}</div>
              <div className="n-time">{n.created_at ? new Date(n.created_at).toLocaleString("es-CO") : ""}</div>
            </div>
          </div>
        ))}
        <button className="cmdk-item" style={{ width: "100%", justifyContent: "center", padding: "var(--s3)" }} onClick={() => onNavigate("dashboard")}>Ir al centro operacional <Icon name="arrow-right" size={14} /></button>
      </div>
    </>
  );
}

Object.assign(window, { AppShell });
