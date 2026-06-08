/* ============================================================
   AMBAR — App Shell (sidebar por permisos, topbar, búsqueda global, tour)
   ============================================================ */

const NOTIFS = [
  { id: 1, icon: "file-clock", tone: "warn", title: "3 contratos por vencer", msg: "Vencen en los próximos 30 días en RRHH.", time: "Hace 12 min", route: "hr" },
  { id: 2, icon: "stethoscope", tone: "danger", title: "Examen médico vencido", msg: "Carlos Daza — examen periódico venció ayer.", time: "Hace 1 h", route: "medical" },
  { id: 3, icon: "package-check", tone: "info", title: "Préstamo próximo a vencer", msg: "Expediente Juan Pérez — devolución mañana.", time: "Hace 3 h", route: "loans" },
  { id: 4, icon: "user-plus", tone: "brand", title: "5 candidatos sin revisar", msg: "Vacante Desarrollador Full Stack.", time: "Hoy 09:14", route: "recruitment" },
  { id: 5, icon: "scan-line", tone: "warn", title: "12 documentos sin digitalizar", msg: "Cola de digitalización por encima del umbral.", time: "Ayer", route: "digitization" },
];

const ROUTE_TITLES = {
  dashboard: ["Principal", "Dashboard"], expedients: ["Gestión Documental", "Expedientes"], documents: ["Gestión Documental", "Documentos"],
  digitization: ["Gestión Documental", "Digitalización"], trd: ["Gestión Documental", "TRD & Retención"],
  archive: ["Archivo & Custodia", "Archivo Físico"], transfers: ["Archivo & Custodia", "Transferencias"], loans: ["Archivo & Custodia", "Préstamos"],
  correspondence: ["Archivo & Custodia", "Correspondencia"], hr: ["Talento Humano", "Empleados"], medical: ["Talento Humano", "Exámenes Médicos"],
  recruitment: ["Talento Humano", "Reclutamiento"], reports: ["Inteligencia", "Reportes & BI"], audit: ["Inteligencia", "Auditoría"],
  security: ["Administración", "Seguridad"], settings: ["Administración", "Configuración"],
};

function Sidebar({ user, route, onNavigate, collapsed, setCollapsed, onOpenUserMenu }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => {
    const o = {}; NAV.forEach(g => o[g.label] = true); return o;
  });
  const visible = useMemo(() => NAV.map(g => ({ ...g, items: g.items.filter(it => can(user, it.perms) && (!q || (g.label + " " + it.label).toLowerCase().includes(q.toLowerCase()))) })).filter(g => g.items.length), [user, q]);

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <button className="icon-btn" style={{ color: "var(--side-muted)", display: collapsed ? "grid" : "none" }} onClick={() => setCollapsed(false)}><Icon name="menu" size={18} /></button>
        <div className="side-logo" onClick={() => onNavigate("dashboard")} style={{ cursor: "pointer" }}><Icon name="folder-kanban" size={22} /></div>
        <div className="b-text grow">
          <div className="b-name">AMBAR</div>
          <div className="b-sub">SGDEA Enterprise</div>
        </div>
        <button className="icon-btn" style={{ color: "var(--side-muted)" }} onClick={() => setCollapsed(c => !c)} title="Contraer menú"><Icon name="chevron-left" size={18} /></button>
      </div>

      <div className="side-search" data-tour="search">
        <Icon name="search" size={15} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar módulo…" />
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
          <div className="su-meta"><div className="su-name truncate">{user.name}</div><div className="su-role truncate">{ROLES[user.role].name}</div></div>
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
    const extra = [
      { key: "documents", label: "Buscar: Contrato Laboral Juan Pérez", icon: "file-text", group: "Resultados" },
      { key: "archive", label: "Ubicación: Caja CAJ-00128", icon: "map-pin", group: "Resultados" },
      { key: "hr", label: "Empleado: Carlos Daza", icon: "user", group: "Resultados" },
    ];
    const all = [...list, ...extra];
    return q ? all.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : list;
  }, [q, user]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal cmdk" role="dialog" aria-modal="true" style={{ top: "16%", transform: "translate(-50%,0)", padding: 0, width: "min(620px, calc(100vw - 32px))" }}>
        <div className="cmdk-input"><Icon name="search" size={18} /><input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar expediente, caja, empleado, módulo…" /><span className="kbd">esc</span></div>
        <div className="cmdk-list">
          {items.length === 0 && <div className="muted" style={{ padding: "var(--s5)", textAlign: "center" }}>Sin resultados para “{q}”.</div>}
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

function UserMenu({ user, onClose, onLogout, onSwitchUser, theme, toggleTheme }) {
  return (
    <>
      <div className="scrim" style={{ background: "transparent", backdropFilter: "none" }} onClick={onClose} />
      <div className="usermenu an-fall">
        <div className="um-head">
          <span className="avatar lg" style={{ background: user.color }}>{user.initials}</span>
          <div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{user.name}</div><div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{user.email}</div><div style={{ marginTop: 4 }}><Badge tone="brand">{ROLES[user.role].name}</Badge></div></div>
        </div>
        <div className="divider" />
        <div className="um-section-label">Cambiar de usuario (demo)</div>
        <div className="um-users">
          {USERS.filter(u => u.id !== user.id).map(u => (
            <button key={u.id} className="um-user" onClick={() => { onSwitchUser(u); onClose(); }}>
              <span className="avatar sm" style={{ background: u.color }}>{u.initials}</span>
              <div className="grow" style={{ minWidth: 0, textAlign: "left" }}><div className="truncate" style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>{u.name}</div><div className="truncate muted" style={{ fontSize: 10 }}>{ROLES[u.role].name}</div></div>
            </button>
          ))}
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
    { sel: '[data-tour="nav"]', title: "Tu menú, según tu rol", body: "Solo verás los módulos a los que tienes permiso. Cada rol tiene una vista distinta." },
    { sel: '[data-tour="search"]', title: "Encuentra cualquier cosa", body: "Busca módulos aquí, o usa la búsqueda global del topbar para documentos, cajas y empleados." },
    { sel: '[data-tour="globalsearch"]', title: "Búsqueda universal", body: "Pulsa “/” en cualquier momento para abrir el buscador de comandos." },
    { sel: '[data-tour="notif"]', title: "Nunca pierdas un vencimiento", body: "Aquí llegan alertas de contratos, exámenes médicos, préstamos y más." },
    { sel: '[data-tour="user"]', title: "Tu cuenta y temas", body: "Cambia de usuario (demo), alterna claro/oscuro y cierra sesión desde aquí." },
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
        <div className="row between" style={{ marginBottom: 6 }}><Badge tone="brand">{i + 1} / {steps.length}</Badge><button className="icon-btn btn-sm" onClick={onDone}><Icon name="x" size={15} /></button></div>
        <h3 style={{ fontSize: "var(--fs-md)" }}>{s.title}</h3>
        <p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>{s.body}</p>
        <div className="row between" style={{ marginTop: "var(--s4)" }}>
          <button className="auth-link" onClick={onDone} style={{ fontSize: "var(--fs-sm)" }}>Saltar</button>
          <div className="row gap2">
            {i > 0 && <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}>Atrás</Button>}
            <Button size="sm" onClick={() => i < steps.length - 1 ? setI(i + 1) : onDone()} iconRight={i < steps.length - 1 ? "arrow-right" : "check"}>{i < steps.length - 1 ? "Siguiente" : "Entendido"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShell({ user, route, onNavigate, onLogout, onSwitchUser, theme, toggleTheme, children }) {
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
              <Icon name="search" size={16} /><span className="gs-text">Buscar en AMBAR…</span><span className="kbd">/</span>
            </button>
            <div style={{ position: "relative" }} data-tour="notif">
              <button className="icon-btn" onClick={() => setShowNotif(s => !s)} title="Notificaciones"><Icon name="bell" size={18} /><span className="ping" /></button>
              {showNotif && <NotifPanel onClose={() => setShowNotif(false)} onNavigate={(r) => { onNavigate(r); setShowNotif(false); }} />}
            </div>
            <button className="icon-btn" onClick={toggleTheme} title="Cambiar tema"><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button>
            <button className="icon-btn" onClick={() => setTour(true)} title="Tour guiado"><Icon name="circle-help" size={18} /></button>
            <button className="avatar" style={{ background: user.color, marginLeft: 4, cursor: "pointer", border: "none" }} onClick={() => setShowUser(true)} title={user.name}>{user.initials}</button>
          </div>
        </header>
        <div className="content route-enter" key={route}>{children}</div>
      </div>

      {showCmd && <CommandPalette user={user} onNavigate={onNavigate} onClose={() => setShowCmd(false)} />}
      {showUser && <UserMenu user={user} onClose={() => setShowUser(false)} onLogout={onLogout} onSwitchUser={onSwitchUser} theme={theme} toggleTheme={toggleTheme} />}
      {tour && <Tour onDone={endTour} />}
    </div>
  );
}

function NotifPanel({ onClose, onNavigate }) {
  const toneColors = { warn: ["var(--warn-bg)", "var(--warn)"], danger: ["var(--danger-bg)", "var(--danger)"], info: ["var(--info-bg)", "var(--info)"], brand: ["var(--brand-ghost)", "var(--brand)"] };
  return (
    <>
      <div className="scrim" style={{ background: "transparent", backdropFilter: "none" }} onClick={onClose} />
      <div className="pop">
        <div className="pop-head"><strong>Notificaciones</strong><Badge tone="danger">{NOTIFS.length} nuevas</Badge></div>
        {NOTIFS.map(n => {
          const [bg, fg] = toneColors[n.tone] || toneColors.brand;
          return (
            <div key={n.id} className="noti" onClick={() => onNavigate(n.route)}>
              <span className="n-dot" style={{ background: bg, color: fg }}><Icon name={n.icon} size={17} /></span>
              <div className="n-body"><div className="n-title">{n.title}</div><div className="n-msg">{n.msg}</div><div className="n-time">{n.time}</div></div>
            </div>
          );
        })}
        <button className="cmdk-item" style={{ width: "100%", justifyContent: "center", padding: "var(--s3)" }} onClick={() => onNavigate("dashboard")}>Ver todas <Icon name="arrow-right" size={14} /></button>
      </div>
    </>
  );
}

Object.assign(window, { AppShell });
