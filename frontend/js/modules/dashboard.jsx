function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos dias" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function DashboardPage({ user, navigate }) {
  const { data: rawDashboard, loading } = useLiveData(() => AmbarAPI.endpoints.dashboard(), {}, []);
  const { data: rawAdvanced } = useLiveData(() => AmbarAPI.endpoints.dashboardAdvanced(), {}, []);
  const { data: rawNotifications } = useLiveData(() => AmbarAPI.endpoints.notifications(), [], []);
  const { data: rawTasks } = useLiveData(() => AmbarAPI.endpoints.tasks(), [], []);
  const dashboard = rawDashboard || {};
  const advanced = rawAdvanced || {};
  const notifications = AmbarAPI.listFrom(rawNotifications);
  const tasks = AmbarAPI.listFrom(rawTasks, ["tasks", "items", "results"]);
  const docsByStatus = dashboard.documents_by_status || {};
  const totalDocs = dashboard.total_documents || 0;
  const digitized = dashboard.digitalized_documents || 0;
  const physical = dashboard.physical_documents || Math.max(totalDocs - digitized, 0);
  const incomplete = dashboard.incomplete_documents || 0;
  const kpis = [
    { label: "Documentos registrados", value: totalDocs, icon: "file-text", tone: "brand", foot: "segun base documental", perms: ["document.read", "analytics.view"] },
    { label: "Documentos digitalizados", value: digitized, icon: "scan-line", tone: "info", foot: `${dashboard.digitization_percent || 0}% del total`, perms: ["ocr.manage", "analytics.view"] },
    { label: "Pendientes de digitalizar", value: incomplete, icon: "clock", tone: "warn", foot: "sin archivo digital", perms: ["ocr.manage", "analytics.view"] },
    { label: "Usuarios activos", value: dashboard.active_users || 0, icon: "users", tone: "brand", foot: "cuentas habilitadas", perms: ["users.manage", "analytics.view"] },
    { label: "Cajas archivadas", value: dashboard.archived_boxes || 0, icon: "boxes", tone: "info", foot: "en archivos autorizados", perms: ["archive.manage", "analytics.view"] },
    { label: "Prestamos activos", value: dashboard.active_loans || 0, icon: "package-check", tone: "warn", foot: `${dashboard.overdue_loans || 0} vencidos`, perms: ["document.transfer", "analytics.view"] },
    { label: "Tareas pendientes", value: advanced.pending_tasks || 0, icon: "list-checks", tone: "danger", foot: `${advanced.overdue_tasks || 0} vencidas`, perms: ["notification.read", "analytics.view"] },
    { label: "Transferencias pendientes", value: dashboard.pending_transfers || 0, icon: "route", tone: "brand", foot: "en proceso", perms: ["transfer.manage", "analytics.view"] },
  ].filter(k => can(user, k.perms)).slice(0, 8);
  const donutData = [
    { label: "Digitalizados", value: digitized, color: "var(--viz-teal)" },
    { label: "Solo fisicos", value: physical, color: "var(--viz-amber)" },
    { label: "Incompletos", value: incomplete, color: "var(--viz-rose)" },
  ].filter(x => x.value > 0);
  const statusItems = Object.entries(docsByStatus).map(([label, value]) => ({ label, value, color: "var(--brand)" }));

  return (
    <>
      <div className="dash-hero an-rise">
        <div className="row between wrap" style={{ alignItems: "flex-start", gap: "var(--s5)" }}>
          <div>
            <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
            <p>Centro operacional conectado al backend. Los indicadores reflejan la base de datos y permisos de tu usuario.</p>
          </div>
          <Button variant="secondary" icon="sparkles" onClick={() => navigate("reports")} style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.25)" }}>Ver reportes</Button>
        </div>
        <div className="dh-stats">
          <div className="dh-stat"><div className="n">{dashboard.digitization_percent || 0}%</div><div className="l">Digitalizacion global</div></div>
          <div className="dh-stat"><div className="n">{dashboard.trd_compliance || 0}%</div><div className="l">Cumplimiento TRD</div></div>
          <div className="dh-stat"><div className="n">{dashboard.activity_daily || 0}</div><div className="l">Eventos 24h</div></div>
          <div className="dh-stat"><div className="n">{advanced.employees || 0}</div><div className="l">Empleados activos</div></div>
        </div>
      </div>

      {loading ? <div className="grid cols-4"><Skeleton lines={3} /><Skeleton lines={3} /><Skeleton lines={3} /><Skeleton lines={3} /></div> : (
        <div className="grid cols-4 stagger">
          {kpis.map((k, i) => (
            <div key={k.label} style={{ "--i": i }}>
              <Metric label={k.label} value={k.value} icon={k.icon} tone={k.tone} foot={k.foot} accent />
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
        <Card className="an-rise">
          <CardHead title="Estado documental" sub="Distribucion por estado real" icon="bar-chart" />
          {statusItems.length ? <BarsH items={statusItems} valueFmt={v => window.fmtN(v)} /> : <Empty icon="file-text" title="Sin documentos">Aun no hay documentos registrados para graficar.</Empty>}
        </Card>
        <Card className="an-rise">
          <CardHead title="Fisico vs digital" sub="Cobertura documental" icon="pie-chart" />
          {donutData.length ? <Donut centerValue={window.fmtN(totalDocs)} centerLabel="documentos" data={donutData} /> : <Empty icon="pie-chart" title="Sin distribucion">No hay documentos suficientes para calcular cobertura.</Empty>}
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card className="an-rise">
          <CardHead title="Alertas recientes" sub="Notificaciones accionables" icon="bell" />
          {notifications.length === 0 ? <Empty icon="bell" title="Sin alertas">No hay notificaciones pendientes para tu usuario.</Empty> : (
            <div className="timeline">
              {notifications.slice(0, 8).map((n, i) => (
                <div key={n.id || i} className="tl-item brand">
                  <div className="tl-dot"><Icon name="bell" size={14} /></div>
                  <div className="tl-body"><div className="tl-title"><b>{n.title || "Notificacion"}</b> {n.message || ""}</div><div className="tl-meta">{n.created_at ? new Date(n.created_at).toLocaleString("es-CO") : n.module}</div></div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="an-rise">
          <CardHead title="Tareas pendientes" sub="Asignadas a ti" icon="list-checks" />
          {tasks.length === 0 ? <Empty icon="list-checks" title="Sin tareas">No hay tareas pendientes para tu usuario.</Empty> : (
            <div className="col" style={{ gap: "var(--s2)" }}>
              {tasks.slice(0, 8).map((t, i) => (
                <button key={t.id || i} className="list-row" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => navigate(t.module || "dashboard")}>
                  <span className="comp-check no" style={{ borderColor: "var(--line-strong)" }}></span>
                  <span className="grow" style={{ fontSize: "var(--fs-sm)" }}>{t.title || t.description || "Tarea operativa"}</span>
                  <Badge tone={t.status === "overdue" ? "danger" : "outline"}>{t.status || "pendiente"}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

window.DashboardPage = DashboardPage;
