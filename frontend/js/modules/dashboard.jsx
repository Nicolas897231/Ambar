function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dÃ­as";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatCount(value) {
  if (typeof window.fmtN === "function") return window.fmtN(value || 0);
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

function normalizeWidgetLayout(items, fallbackSize = "medium") {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((item, index) => {
      if (!item) return null;
      if (typeof item === "string") return { key: item, visible: true, order: index, size: fallbackSize };
      const key = String(item.key || "").trim();
      if (!key) return null;
      return {
        key,
        visible: item.visible !== false,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        size: item.size || fallbackSize,
      };
    })
    .filter(Boolean);
}

function metricRows(widget) {
  const data = widget?.data || {};
  const labels = {
    total_documents: "Documentos",
    digitalized_documents: "Digitalizados",
    incomplete_documents: "Incompletos",
    active_users: "Usuarios",
    archived_boxes: "Cajas",
    active_loans: "PrÃ©stamos",
    overdue_loans: "Vencidos",
    pending_transfers: "Transferencias",
    risk_level: "Riesgo",
    employees: "Empleados",
    active_contracts: "Contratos",
    active_workflows: "Flujos",
    pending_receptions: "Recepciones",
    overdue_tasks: "Vencidas",
    activity_daily: "Eventos",
    action_required: "AcciÃ³n requerida",
  };
  return Object.entries(data).map(([key, value]) => ({
    label: labels[key] || key.replace(/_/g, " "),
    value,
  }));
}

function dashboardQueue(dashboard, advanced, notifications, tasks, user) {
  const transferAlert = notifications.find((item) => {
    const type = String(item.type || "").toLowerCase();
    const module = String(item.module || "").toLowerCase();
    const entity = String(item.related_entity_type || "").toLowerCase();
    return entity === "transfer_batch" || module === "transfers" || type.includes("transfer") || type.includes("reception");
  });
  const loanAlert = notifications.find((item) => String(item.type || "").toLowerCase().includes("loan"));
  const taskAlert = tasks.find((item) => item.action_url || item.related_entity_type || item.module);
  const queue = [
    {
      key: "digitalize",
      title: "Digitalizar documentos pendientes",
      detail: `${dashboard.incomplete_documents || 0} registros sin archivo digital`,
      value: dashboard.incomplete_documents || 0,
      route: "digitization",
      action_url: "digitization?tab=queue",
      icon: "scan-line",
      tone: "warn",
      perms: ["ocr.manage", "analytics.view"],
    },
    {
      key: "transfer",
      title: "Revisar transferencias",
      detail: `${dashboard.pending_transfers || 0} transferencias en proceso`,
      value: dashboard.pending_transfers || 0,
      route: "transfers",
      action_url: transferAlert?.action_url || "transfers",
      icon: "route",
      tone: "brand",
      perms: ["transfer.manage", "transfer.batch_manage", "analytics.view"],
    },
    {
      key: "loan",
      title: "Gestionar prÃ©stamos vencidos",
      detail: `${dashboard.overdue_loans || 0} prÃ©stamos requieren devoluciÃ³n`,
      value: dashboard.overdue_loans || 0,
      route: "loans",
      action_url: loanAlert?.action_url || "loans",
      icon: "package-check",
      tone: "danger",
      perms: ["document.transfer", "transfer.manage", "analytics.view"],
    },
    {
      key: "tasks",
      title: "Cerrar tareas asignadas",
      detail: `${advanced.pending_tasks || 0} tareas pendientes, ${advanced.overdue_tasks || 0} vencidas`,
      value: advanced.pending_tasks || 0,
      route: "dashboard",
      action_url: taskAlert?.action_url || "dashboard",
      icon: "list-checks",
      tone: "info",
      perms: ["notification.read", "analytics.view"],
    },
    {
      key: "alerts",
      title: "Leer alertas accionables",
      detail: `${notifications.length || 0} notificaciones visibles para tu usuario`,
      value: notifications.length || 0,
      route: "dashboard",
      action_url: notifications[0]?.action_url || "dashboard",
      icon: "bell",
      tone: "brand",
      perms: ["notification.read", "analytics.view"],
    },
    {
      key: "operational_risk",
      title: "Revisar riesgo documental",
      detail: `Nivel ${String(dashboard.risk_level || "Bajo").toLowerCase()} para tu archivo`,
      value: dashboard.risk_level === "Bajo" ? 0 : 1,
      route: "reports",
      icon: "shield-alert",
      tone: "danger",
      perms: ["analytics.view"],
    },
  ];
  return queue.filter((item) => item.value > 0 && can(user, item.perms));
}

function quickActions(user) {
  const actions = [
    { label: "Registrar expediente", route: "expedients", icon: "folder-kanban", perms: ["document.create"] },
    { label: "Registrar documento", route: "documents", icon: "file-text", perms: ["document.create"] },
    { label: "Ubicar caja o carpeta", route: "archive", icon: "warehouse", perms: ["archive.manage", "document.read"] },
    { label: "Preparar transferencia", route: "transfers", icon: "route", perms: ["transfer.manage", "document.transfer"] },
    { label: "Consultar Kardex", route: "kardex", icon: "history", perms: ["document.read", "audit.view"] },
    { label: "Buscar documentos", route: "documentSearch", icon: "search", perms: ["search.query", "document.read"] },
  ];
  return actions.filter((item) => can(user, item.perms));
}

function widgetMapFrom(list) {
  const map = {};
  (list || []).forEach((item) => {
    if (item?.key) map[item.key] = item;
  });
  return map;
}

function renderWidgetBody(widget, navigate) {
  const bodyStyle = { minHeight: widget.size === "wide" ? 250 : 210 };
  if (widget.type === "metrics") {
    return (
      <Card className="an-rise" style={bodyStyle}>
        <CardHead title={widget.title} sub={widget.description} icon={widget.icon} />
        <div className="grid cols-4" style={{ gap: "var(--s3)" }}>
          {metricRows(widget).map((item) => (
            <div key={item.label} className="metric" style={{ minHeight: 108 }}>
              <div className="m-top"><span className="m-label">{item.label}</span></div>
              <div className="m-value">{typeof item.value === "number" ? formatCount(item.value) : String(item.value || "-")}</div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (widget.type === "bars") {
    return (
      <Card className="an-rise" style={bodyStyle}>
        <CardHead title={widget.title} sub={widget.description} icon={widget.icon} />
        {widget.data?.length ? (
          <BarsH items={widget.data} valueFmt={formatCount} />
        ) : (
          <Empty icon={widget.icon || "bar-chart"} title="Sin datos">No hay registros para graficar.</Empty>
        )}
      </Card>
    );
  }

  if (widget.type === "donut") {
    return (
      <Card className="an-rise" style={bodyStyle}>
        <CardHead title={widget.title} sub={widget.description} icon={widget.icon} />
        {widget.data?.length ? (
          <Donut centerValue={formatCount(widget.center_value || 0)} centerLabel={widget.center_label || "items"} data={widget.data} />
        ) : (
          <Empty icon={widget.icon || "pie-chart"} title="Sin distribuciÃ³n">No hay suficientes datos para calcular esta grÃ¡fica.</Empty>
        )}
      </Card>
    );
  }

  if (widget.type === "timeline") {
    return (
      <Card className="an-rise" style={bodyStyle}>
        <CardHead title={widget.title} sub={widget.description} icon={widget.icon} />
        {!widget.data?.length ? (
          <Empty icon={widget.icon || "bell"} title="Sin eventos">No hay registros recientes para mostrar.</Empty>
        ) : (
          <div className="timeline">
            {widget.data.slice(0, 8).map((item, index) => (
              <button
                type="button"
                key={item.id || index}
                className="tl-item brand"
                style={{ width: "100%", border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: item.action_url || item.route ? "pointer" : "default" }}
                onClick={() => navigate(item.action_url || item.route || item.module || "dashboard")}
              >
                <div className="tl-dot"><Icon name="bell" size={14} /></div>
                <div className="tl-body">
                  <div className="tl-title">
                    <b>{item.title || "NotificaciÃ³n"}</b> {item.message || item.description || ""}
                  </div>
                  <div className="tl-meta">
                    {item.created_at ? new Date(item.created_at).toLocaleString("es-CO") : item.module || "general"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="an-rise" style={bodyStyle}>
      <CardHead title={widget.title} sub={widget.description} icon={widget.icon} />
      {!widget.data?.length ? (
        <Empty icon={widget.icon || "list-checks"} title="Sin pendientes">No hay elementos para mostrar.</Empty>
      ) : (
        <div className="col" style={{ gap: "var(--s2)" }}>
          {widget.data.slice(0, 8).map((item, index) => (
            <button key={item.id || item.key || index} className="list-row" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => navigate(item.action_url || item.route || item.module || "dashboard")}>
              <span className="comp-check no" style={{ borderColor: "var(--line-strong)" }} />
              <span className="grow" style={{ fontSize: "var(--fs-sm)" }}>{item.title || item.label || item.description || "Elemento operativo"}</span>
              {item.status && <Badge tone={item.status === "overdue" ? "danger" : item.status === "completed" ? "success" : "outline"}>{item.status}</Badge>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function DashboardPage({ user, navigate }) {
  const toast = useToast();
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [selectedLayoutName, setSelectedLayoutName] = React.useState("operational");
  const [layoutNameDraft, setLayoutNameDraft] = React.useState("operational");
  const [makeDefault, setMakeDefault] = React.useState(true);
  const [draftLayout, setDraftLayout] = React.useState([]);
  const [savingLayout, setSavingLayout] = React.useState(false);
  const [layoutRevision, setLayoutRevision] = React.useState(0);
  const seededLayoutRef = React.useRef(false);

  const { data: rawDashboard, loading: loadingDashboard } = useLiveData(() => AmbarAPI.endpoints.dashboard(), {}, []);
  const { data: rawAdvanced, loading: loadingAdvanced } = useLiveData(() => AmbarAPI.endpoints.dashboardAdvanced(), {}, []);
  const { data: rawNotifications } = useLiveData(() => AmbarAPI.endpoints.notifications(), [], []);
  const { data: rawTasks } = useLiveData(() => AmbarAPI.endpoints.tasks(), [], []);
  const { data: rawLayouts, loading: loadingLayouts } = useLiveData(() => AmbarAPI.endpoints.dashboardLayouts(), { layouts: [] }, [layoutRevision]);
  const { data: rawTemplates } = useLiveData(() => AmbarAPI.endpoints.dashboardTemplates(), { templates: [] }, []);
  const { data: rawWidgetState, loading: loadingWidgets, setData: setWidgetState } = useLiveData(
    () => AmbarAPI.endpoints.dashboardWidgets(selectedLayoutName),
    { layout_name: selectedLayoutName, widgets: [], available_widgets: [], layout: [] },
    [selectedLayoutName]
  );

  const dashboard = rawDashboard || {};
  const advanced = rawAdvanced || {};
  const notifications = AmbarAPI.listFrom(rawNotifications);
  const tasks = AmbarAPI.listFrom(rawTasks, ["tasks", "items", "results"]);
  const savedLayouts = AmbarAPI.listFrom(rawLayouts, ["layouts"]);
  const templates = AmbarAPI.listFrom(rawTemplates, ["templates"]);
  const widgetState = rawWidgetState || { layout_name: selectedLayoutName, widgets: [], available_widgets: [], layout: [] };
  const availableWidgets = widgetState.available_widgets || [];
  const availableWidgetKeys = React.useMemo(() => new Set(availableWidgets.map((item) => item.key)), [availableWidgets]);
  const widgetCatalog = React.useMemo(() => widgetMapFrom(availableWidgets), [availableWidgets]);
  const dashboardTemplates = React.useMemo(
    () => templates.map((template) => ({
      ...template,
      widgets: normalizeWidgetLayout(template.widgets || []),
    })),
    [templates]
  );

  React.useEffect(() => {
    if (!savedLayouts.length || seededLayoutRef.current) return;
    const defaultLayout = savedLayouts.find((layout) => layout.is_default) || savedLayouts[0];
    if (defaultLayout?.layout_name) {
      setSelectedLayoutName(defaultLayout.layout_name);
      setLayoutNameDraft(defaultLayout.layout_name);
    }
    seededLayoutRef.current = true;
  }, [savedLayouts]);

  React.useEffect(() => {
    const source = widgetState.layout && widgetState.layout.length
      ? widgetState.layout
      : normalizeWidgetLayout(widgetState.widgets || availableWidgets);
    setDraftLayout(source.length ? source : normalizeWidgetLayout([
      { key: "operational_queue", visible: true, order: 0, size: "wide" },
      { key: "document_kpis", visible: true, order: 1, size: "wide" },
      { key: "document_status", visible: true, order: 2, size: "medium" },
      { key: "digitalization_mix", visible: true, order: 3, size: "medium" },
      { key: "alerts", visible: true, order: 4, size: "wide" },
      { key: "tasks", visible: true, order: 5, size: "medium" },
    ]));
    setLayoutNameDraft(widgetState.layout_name || selectedLayoutName);
  }, [widgetState, availableWidgets, selectedLayoutName]);

  const metrics = React.useMemo(() => ([
    { key: "documents", label: "Documentos registrados", value: dashboard.total_documents || 0, icon: "file-text", tone: "brand", foot: "segÃºn base documental", perms: ["document.read", "analytics.view"] },
    { key: "digitalized", label: "Documentos digitalizados", value: dashboard.digitalized_documents || 0, icon: "scan-line", tone: "info", foot: `${dashboard.digitization_percent || 0}% del total`, perms: ["ocr.manage", "analytics.view"] },
    { key: "pending_digital", label: "Pendientes de digitalizar", value: dashboard.incomplete_documents || 0, icon: "clock", tone: "warn", foot: "sin archivo digital", perms: ["ocr.manage", "analytics.view"] },
    { key: "users", label: "Usuarios activos", value: dashboard.active_users || 0, icon: "users", tone: "brand", foot: "cuentas habilitadas", perms: ["users.manage", "analytics.view"] },
    { key: "boxes", label: "Cajas archivadas", value: dashboard.archived_boxes || 0, icon: "boxes", tone: "info", foot: "en archivos autorizados", perms: ["archive.manage", "analytics.view"] },
    { key: "loans", label: "PrÃ©stamos activos", value: dashboard.active_loans || 0, icon: "package-check", tone: "warn", foot: `${dashboard.overdue_loans || 0} vencidos`, perms: ["document.transfer", "analytics.view"] },
    { key: "tasks", label: "Tareas pendientes", value: advanced.pending_tasks || 0, icon: "list-checks", tone: "danger", foot: `${advanced.overdue_tasks || 0} vencidas`, perms: ["notification.read", "analytics.view"] },
    { key: "transfers", label: "Transferencias pendientes", value: dashboard.pending_transfers || 0, icon: "route", tone: "brand", foot: "en proceso", perms: ["transfer.manage", "analytics.view"] },
  ]), [dashboard, advanced]);

  const queue = React.useMemo(() => dashboardQueue(dashboard, advanced, notifications, tasks, user), [dashboard, advanced, notifications, tasks, user]);
  const quick = React.useMemo(() => quickActions(user), [user]);
  const dashboardBusy = loadingDashboard || loadingAdvanced || loadingWidgets || loadingLayouts;

  const activeWidgets = React.useMemo(() => {
    const ordered = [...draftLayout]
      .filter((item) => item.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => {
        const widget = widgetCatalog[item.key];
        return widget ? { ...widget, size: item.size || widget.size || "medium", visible: true, order: item.order ?? 0 } : null;
      })
      .filter(Boolean);
    const known = new Set(ordered.map((item) => item.key));
    const extras = availableWidgets.filter((item) => !known.has(item.key));
    return [...ordered, ...extras];
  }, [draftLayout, widgetCatalog, availableWidgets]);

  const visibleLayouts = React.useMemo(
    () => [...savedLayouts].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default))),
    [savedLayouts]
  );

  const saveLayout = async () => {
    try {
      setSavingLayout(true);
      const normalized = normalizeWidgetLayout(draftLayout)
        .filter((item) => availableWidgetKeys.has(item.key))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item, index) => ({
          key: item.key,
          visible: item.visible !== false,
          order: index,
          size: item.size || "medium",
        }));
      const layout_name = String(layoutNameDraft || selectedLayoutName || "operational").trim() || "operational";
      const response = await AmbarAPI.endpoints.saveDashboardLayout({
        layout_name,
        widgets: normalized.map((item) => item.key),
        is_default: makeDefault || layout_name === "operational",
      });
      const responseWidgets = normalizeWidgetLayout(response?.widgets || normalized);
      setSelectedLayoutName(response?.layout_name || layout_name);
      setLayoutNameDraft(response?.layout_name || layout_name);
      setWidgetState((prev) => ({ ...prev, layout_name: response?.layout_name || layout_name, layout: responseWidgets, widgets: responseWidgets }));
      setLayoutRevision((value) => value + 1);
      toast("El tablero quedÃ³ guardado para tu usuario.", { tone: "ok", title: "Dashboard actualizado" });
      setCustomizeOpen(false);
    } catch (error) {
      toast(error.message || "No fue posible guardar el tablero.", { tone: "danger", title: "Error" });
    } finally {
      setSavingLayout(false);
    }
  };

  const toggleWidget = (key) => {
    setDraftLayout((current) => current.map((item) => (item.key === key ? { ...item, visible: item.visible === false ? true : false } : item)));
  };

  const moveWidget = (key, direction) => {
    setDraftLayout((current) => {
      const list = [...current].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const index = list.findIndex((item) => item.key === key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return current;
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      return list.map((item, idx) => ({ ...item, order: idx }));
    });
  };

  const applyLayout = (layoutName) => {
    setSelectedLayoutName(layoutName);
    setLayoutNameDraft(layoutName);
  };

  const applyTemplate = (template) => {
    if (!template) return;
    const normalized = normalizeWidgetLayout(template.widgets || []);
    setDraftLayout(normalized.length ? normalized : draftLayout);
    setLayoutNameDraft(template.layout_name || "operational");
    setMakeDefault(template.layout_name === "operational");
    setCustomizeOpen(true);
  };

  return (
    <>
      <div className="dash-hero an-rise">
        <div className="row between wrap" style={{ alignItems: "flex-start", gap: "var(--s5)" }}>
          <div>
            <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
            <p>Centro operacional conectado al backend. Los indicadores reflejan la base de datos y los permisos de tu usuario.</p>
          </div>
          <div className="row gap2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button variant="secondary" icon="layout-grid" onClick={() => setCustomizeOpen(true)} style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.25)" }}>
              Personalizar tablero
            </Button>
            <Button variant="secondary" icon="sparkles" onClick={() => navigate("reports")} style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.25)" }}>
              Ver reportes
            </Button>
          </div>
        </div>
        <div className="dh-stats">
          <div className="dh-stat"><div className="n">{dashboard.digitization_percent || 0}%</div><div className="l">Cobertura digital</div></div>
          <div className="dh-stat"><div className="n">{dashboard.trd_compliance || 0}%</div><div className="l">Cumplimiento TRD</div></div>
          <div className="dh-stat"><div className="n">{dashboard.activity_daily || 0}</div><div className="l">Eventos 24h</div></div>
          <div className="dh-stat"><div className="n">{advanced.employees || 0}</div><div className="l">Empleados activos</div></div>
        </div>
      </div>

      <Card className="an-rise" pad="sm" style={{ marginBottom: "var(--s4)" }}>
        <div className="row between wrap" style={{ gap: "var(--s3)" }}>
          <div>
            <strong style={{ display: "block", marginBottom: 4 }}>Tableros guardados</strong>
            <span className="sub">Puedes cambiar de tablero o guardar uno nuevo sin perder el operativo.</span>
          </div>
          <div className="row gap2 wrap">
            {visibleLayouts.length ? visibleLayouts.map((layout) => (
              <Button
                key={layout.layout_name}
                size="sm"
                variant={selectedLayoutName === layout.layout_name ? "primary" : "ghost"}
                icon={layout.is_default ? "star" : "layout-grid"}
                onClick={() => applyLayout(layout.layout_name)}
              >
                {layout.layout_name}
              </Button>
            )) : <Badge tone="outline">Solo tablero operativo</Badge>}
          </div>
        </div>
      </Card>

      {dashboardBusy ? (
        <div className="grid cols-4">
          <Skeleton rows={3} />
          <Skeleton rows={3} />
          <Skeleton rows={3} />
          <Skeleton rows={3} />
        </div>
      ) : (
        <div className="grid cols-4 stagger">
          {metrics.map((metric, index) => (
            can(user, metric.perms) ? (
              <div key={metric.key} style={{ "--i": index }}>
                <Metric label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone} foot={metric.foot} accent />
              </div>
            ) : null
          ))}
        </div>
      )}

      <div className="grid action-grid">
        <Card className="an-rise">
          <CardHead
            title="Trabajo para hoy"
            sub="Acciones reales calculadas con datos del backend"
            icon="list-checks"
            action={<Badge tone={queue.length ? "warning" : "success"}>{queue.length ? "Requiere acciÃ³n" : "Al dÃ­a"}</Badge>}
          />
          {queue.length === 0 ? (
            <Empty icon="check-circle" title="Sin pendientes crÃ­ticos">No hay vencimientos, transferencias ni tareas urgentes para tu usuario.</Empty>
          ) : (
            <div className="action-board">
              {queue.slice(0, 6).map((item) => (
                <button key={item.key} className={`action-item tone-${item.tone}`} onClick={() => navigate(item.route)}>
                  <span className="action-icon"><Icon name={item.icon} size={18} /></span>
                  <span className="grow">
                    <b>{item.title}</b>
                    <small>{item.detail}</small>
                  </span>
                  <Icon name="arrow-right" size={16} />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="an-rise">
          <CardHead title="Accesos rÃ¡pidos" sub="Rutas frecuentes segÃºn permisos" icon="sparkles" />
          <div className="quick-actions">
            {quick.map((item) => (
              <button key={item.route} className="quick-action" onClick={() => navigate(item.route)}>
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr", gap: "var(--s4)" }}>
        {activeWidgets.map((widget) => (
          <div key={widget.key} style={widget.size === "wide" ? { gridColumn: "1 / -1" } : null}>
            {renderWidgetBody(widget, navigate)}
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: "var(--s4)", marginTop: "var(--s4)" }}>
        <Card className="an-rise">
          <CardHead title="Alertas recientes" sub="Notificaciones accionables" icon="bell" />
          {notifications.length === 0 ? (
            <Empty icon="bell" title="Sin alertas">No hay notificaciones pendientes para tu usuario.</Empty>
          ) : (
            <div className="timeline">
              {notifications.slice(0, 8).map((item, index) => (
                <button
                  type="button"
                  key={item.id || index}
                  className="tl-item brand"
                  style={{ width: "100%", border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: item.action_url || item.route ? "pointer" : "default" }}
                  onClick={() => navigate(item.action_url || item.route || item.module || "dashboard")}
                >
                  <div className="tl-dot"><Icon name="bell" size={14} /></div>
                  <div className="tl-body">
                    <div className="tl-title"><b>{item.title || "NotificaciÃ³n"}</b> {item.message || ""}</div>
                    <div className="tl-meta">{item.created_at ? new Date(item.created_at).toLocaleString("es-CO") : item.module || "general"}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card className="an-rise">
          <CardHead title="Tareas pendientes" sub="Asignadas a ti" icon="list-checks" />
          {tasks.length === 0 ? (
            <Empty icon="list-checks" title="Sin tareas">No hay tareas pendientes para tu usuario.</Empty>
          ) : (
            <div className="col" style={{ gap: "var(--s2)" }}>
              {tasks.slice(0, 8).map((task, index) => (
                <button key={task.id || index} className="list-row" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => navigate(task.action_url || task.route || task.module || "dashboard")}>
                  <span className="comp-check no" style={{ borderColor: "var(--line-strong)" }} />
                  <span className="grow" style={{ fontSize: "var(--fs-sm)" }}>{task.title || task.description || "Tarea operativa"}</span>
                  <Badge tone={task.status === "overdue" ? "danger" : "outline"}>{task.status || "pendiente"}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {customizeOpen && (
        <Drawer
          title="Personalizar tablero"
          sub="Elige quÃ© widgets ver, ocultar o reordenar. TambiÃ©n puedes guardar un tablero nuevo."
          onClose={() => setCustomizeOpen(false)}
          wide
          headExtra={
            <Button variant="secondary" size="sm" icon="save" onClick={saveLayout} disabled={savingLayout}>
              {savingLayout ? "Guardando" : "Guardar"}
            </Button>
          }
        >
          <div className="col" style={{ gap: "var(--s4)" }}>
            <Card pad="sm">
              <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
                <Field label="Nombre del tablero" help="Si cambias el nombre, AMBAR guardarÃ¡ un tablero nuevo para tu usuario.">
                  <input value={layoutNameDraft} onChange={(e) => setLayoutNameDraft(e.target.value)} placeholder="operational, gerencia, archivo, rrhh..." />
                </Field>
                <Field label="Tablero predeterminado" help="Activa esta opciÃ³n si quieres que este sea el tablero que cargue por defecto.">
                  <div className="row" style={{ paddingTop: 8 }}>
                    <Switch checked={makeDefault} onChange={setMakeDefault} />
                    <span style={{ marginLeft: 12 }}>Usar como tablero principal</span>
                  </div>
                </Field>
              </div>
            </Card>

            <Empty icon="layout-grid" title="Tablero configurable">
              Usa una selecciÃ³n segura de widgets reales. AMBAR no permite mÃ©tricas libres ni consultas riesgosas.
            </Empty>

            <Card pad="sm">
              <CardHead title="Plantillas sugeridas" sub="Empieza desde un tablero pensado para el rol o Ã¡rea del usuario." icon="sparkles" />
              {dashboardTemplates.length === 0 ? (
                <Empty icon="layout-grid" title="Sin plantillas sugeridas">Este usuario no tiene una plantilla sugerida distinta al tablero operativo.</Empty>
              ) : (
                <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
                  {dashboardTemplates.map((template) => (
                    <div
                      key={template.layout_name}
                      role="button"
                      tabIndex={0}
                      className={`template-card${layoutNameDraft === template.layout_name ? " active" : ""}`}
                      onClick={() => applyTemplate(template)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          applyTemplate(template);
                        }
                      }}
                    >
                      <div className="row between" style={{ alignItems: "flex-start", gap: "var(--s3)" }}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: "block" }}>{template.title}</strong>
                          <small className="muted" style={{ display: "block", marginTop: 4 }}>{template.description}</small>
                        </div>
                        {template.recommended ? <Badge tone="success">Recomendada</Badge> : <Badge tone="outline">Plantilla</Badge>}
                      </div>
                      <div className="row gap2 wrap" style={{ marginTop: "var(--s3)" }}>
                        {(template.widgets || []).slice(0, 4).map((widget) => <Badge key={widget.key} tone="outline">{widget.key.replace(/_/g, " ")}</Badge>)}
                      </div>
                      <div className="row between" style={{ marginTop: "var(--s3)" }}>
                        <span className="sub">Usar como base para guardar un tablero nuevo.</span>
                        <Button size="sm" variant="ghost" icon="sparkles" onClick={() => applyTemplate(template)}>
                          Usar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="col" style={{ gap: "var(--s3)" }}>
              {(availableWidgets || []).map((widget, index) => {
                const current = draftLayout.find((item) => item.key === widget.key) || { key: widget.key, visible: true, order: index, size: widget.size || "medium" };
                return (
                  <Card key={widget.key} interactive pad="sm" style={{ display: "grid", gap: 10 }}>
                    <div className="row between wrap" style={{ gap: "var(--s3)" }}>
                      <div>
                        <strong>{widget.title}</strong>
                        <div className="sub">{widget.description}</div>
                      </div>
                      <Badge tone={current.visible ? "success" : "outline"}>{current.visible ? "Visible" : "Oculto"}</Badge>
                    </div>
                    <div className="row between wrap" style={{ gap: "var(--s2)" }}>
                      <div className="row gap2">
                        <Button size="sm" variant="ghost" icon="arrow-up" disabled={current.order === 0} onClick={() => moveWidget(widget.key, -1)}>Subir</Button>
                        <Button size="sm" variant="ghost" icon="arrow-down" disabled={current.order >= draftLayout.length - 1} onClick={() => moveWidget(widget.key, 1)}>Bajar</Button>
                      </div>
                      <Button size="sm" variant={current.visible ? "secondary" : "primary"} icon={current.visible ? "eye-off" : "eye"} onClick={() => toggleWidget(widget.key)}>
                        {current.visible ? "Ocultar" : "Mostrar"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}

window.DashboardPage = DashboardPage;
