const { useState: auS, useMemo: auM } = React;

function AuditPage() {
  const [q, setQ] = auS("");
  const [mod, setMod] = auS("");
  const { data: rawAudit, loading } = useLiveData(() => AmbarAPI.endpoints.audit(), [], []);
  const { data: summary } = useLiveData(() => AmbarAPI.endpoints.auditSummary(), {}, []);
  const rows = AmbarAPI.listFrom(rawAudit, ["logs", "items", "results"]);
  const normalized = rows.map((a, i) => ({
    id: a.id || a.idAudit || i,
    user: a.user_name || a.user_id || a.ps405Identification || "Sistema",
    act: a.action || a.event_type || "evento",
    obj: a.entity_label || a.entity_type || a.module || "-",
    mod: a.module || "plataforma",
    res: a.result || "success",
    sev: a.severity || "info",
    ip: a.ip_address || "-",
    time: a.created_at ? new Date(a.created_at).toLocaleString("es-CO") : "",
  }));
  const filtered = auM(() => normalized.filter(a => (!q || (a.user + a.act + a.obj).toLowerCase().includes(q.toLowerCase())) && (!mod || a.mod === mod)), [normalized, q, mod]);
  const mods = [...new Set(normalized.map(a => a.mod))];
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Inteligencia</div><h1>Auditoria</h1><p className="lead">Eventos reales registrados por backend: quien hizo que, cuando, desde donde y con que resultado.</p></div><div className="page-actions"><Button as="a" href="/api/v1/audit/export?format=csv" variant="ghost" icon="download">Exportar CSV</Button></div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Eventos filtrados" value={filtered.length} icon="history" tone="brand" accent />
        <Metric label="Accesos denegados" value={summary.denied || summary.denied_events || 0} icon="shield" tone="danger" accent />
        <Metric label="Eventos criticos" value={summary.critical || summary.critical_events || 0} icon="alert-triangle" tone="danger" accent />
        <Metric label="Exportaciones" value={summary.exports || summary.export_events || 0} icon="download" tone="info" accent />
      </div>
      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)", gap: "var(--s3)" }}>
          <div className="search-box grow"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por usuario, accion u objeto..." /></div>
          <select value={mod} onChange={e => setMod(e.target.value)} style={{ width: 180 }}><option value="">Todos los modulos</option>{mods.map(m => <option key={m}>{m}</option>)}</select>
        </div>
        <div style={{ padding: "var(--s5) var(--s5) var(--s5) var(--s6)" }}>
          {loading ? <Skeleton lines={8} /> : filtered.length === 0 ? <Empty icon="shield-check" title="Sin eventos">No hay eventos de auditoria para estos filtros.</Empty> : (
            <div className="timeline">
              {filtered.map((a) => (
                <div key={a.id} className={`tl-item ${a.res === "denied" || a.res === "failed" ? "danger" : "ok"}`}>
                  <div className="tl-dot"><Icon name={a.res === "denied" ? "lock" : "user"} size={13} /></div>
                  <div className="tl-body">
                    <div className="row between wrap"><div className="tl-title"><b>{a.user}</b> · {a.act} <span style={{ color: "var(--brand)" }}>{a.obj}</span></div><span className="mono faint" style={{ fontSize: "var(--fs-xs)" }}>{a.time}</span></div>
                    <div className="row gap2" style={{ marginTop: 4 }}><Badge tone="outline">{a.mod}</Badge><Badge tone={a.res === "denied" || a.res === "failed" ? "danger" : "success"} dot>{a.res}</Badge><Badge tone={a.sev === "critical" ? "danger" : a.sev === "warning" ? "warning" : "outline"}>{a.sev}</Badge><span className="mono faint" style={{ fontSize: "var(--fs-2xs)" }}>IP {a.ip}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

window.AuditPage = AuditPage;
