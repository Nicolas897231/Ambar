const { useState: auS, useMemo: auM } = React;

function buildAuditQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  });
  return params.toString();
}

function safeAuditJson(value) {
  if (!value || typeof value !== "object") return null;
  const blocked = ["password", "token", "secret", "hash", "authorization", "cookie"];
  const sanitize = (input) => {
    if (Array.isArray(input)) return input.map(sanitize);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input).map(([key, val]) => {
      const lower = key.toLowerCase();
      return [key, blocked.some((word) => lower.includes(word)) ? "[protegido]" : sanitize(val)];
    }));
  };
  return JSON.stringify(sanitize(value), null, 2);
}

function normalizeAuditRow(item, index) {
  return {
    id: item.id || item.idAudit || index,
    user: item.user_name || item.user_id || item.ps405Identification || "Sistema",
    action: item.action || item.event_type || "evento",
    entity: item.entity_label || item.entity_type || item.module || "-",
    entityType: item.entity_type || item.entity || "-",
    entityId: item.entity_id || item.id_entity || "-",
    module: item.module || "plataforma",
    result: item.result || "success",
    severity: item.severity || "info",
    ip: item.ip_address || "-",
    userAgent: item.user_agent || "-",
    requestId: item.request_id || "-",
    oldValues: item.old_values || item.before || null,
    newValues: item.new_values || item.after || null,
    createdAt: item.created_at || item.timestamp || null,
  };
}

function AuditDetailDrawer({ event, onClose }) {
  if (!event) return null;
  const oldJson = safeAuditJson(event.oldValues);
  const newJson = safeAuditJson(event.newValues);
  return (
    <Drawer title="Detalle de auditoria" sub={`${event.module} / ${event.action}`} onClose={onClose} wide>
      <div className="detail-grid">
        <Info label="Usuario" value={event.user} />
        <Info label="Resultado" value={event.result} />
        <Info label="Severidad" value={event.severity} />
        <Info label="IP" value={event.ip} />
        <Info label="Entidad" value={`${event.entityType} ${event.entityId}`} />
        <Info label="Request ID" value={event.requestId} />
      </div>
      <div className="divider" />
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Card pad="sm">
          <CardHead title="Antes" icon="history" />
          {oldJson ? <pre className="json-box">{oldJson}</pre> : <p className="muted">Sin valores anteriores registrados.</p>}
        </Card>
        <Card pad="sm">
          <CardHead title="Despues" icon="check-circle" />
          {newJson ? <pre className="json-box">{newJson}</pre> : <p className="muted">Sin valores nuevos registrados.</p>}
        </Card>
      </div>
    </Drawer>
  );
}

function AuditPage() {
  const toast = useToast();
  const [filters, setFilters] = auS({ q: "", module: "", severity: "", result: "", date_from: "", date_to: "" });
  const [selected, setSelected] = auS(null);
  const query = auM(() => buildAuditQuery(filters), [filters]);
  const { data: rawAudit, loading } = useLiveData(() => AmbarAPI.endpoints.audit(query), [], [query]);
  const { data: summary } = useLiveData(() => AmbarAPI.endpoints.auditSummary(), {}, []);
  const rows = AmbarAPI.listFrom(rawAudit, ["logs", "items", "results"]).map(normalizeAuditRow);
  const modules = auM(() => [...new Set(rows.map((item) => item.module).filter(Boolean))].sort(), [rows]);
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const exportAudit = async (format) => {
    try {
      await AmbarAPI.endpoints.auditExport(query, format);
      toast(`Auditoria exportada en ${format.toUpperCase()}.`, { tone: "ok", title: "Exportacion lista" });
    } catch (err) {
      toast(err.message || "No fue posible exportar auditoria.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Inteligencia</div>
          <h1>Auditoria</h1>
          <p className="lead">Eventos reales del backend: quien hizo que, cuando, desde donde y con que resultado.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="download" onClick={() => exportAudit("csv")}>Exportar CSV</Button>
          <Button variant="ghost" icon="download" onClick={() => exportAudit("xlsx")}>Exportar Excel</Button>
        </div>
      </div>

      <div className="grid cols-4 stagger">
        <Metric label="Eventos listados" value={rows.length} icon="history" tone="brand" accent />
        <Metric label="Accesos denegados" value={summary.denied || summary.denied_events || 0} icon="shield" tone="danger" accent />
        <Metric label="Eventos criticos" value={summary.critical || summary.critical_events || 0} icon="alert-triangle" tone="danger" accent />
        <Metric label="Exportaciones" value={summary.exports || summary.export_events || 0} icon="download" tone="info" accent />
      </div>

      <Card flush className="an-rise">
        <div className="audit-filters">
          <div className="search-box grow"><Icon name="search" size={16} /><input value={filters.q} onChange={(e) => updateFilter("q", e.target.value)} placeholder="Buscar por usuario, accion o entidad" /></div>
          <select value={filters.module} onChange={(e) => updateFilter("module", e.target.value)}><option value="">Todos los modulos</option>{modules.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={filters.severity} onChange={(e) => updateFilter("severity", e.target.value)}><option value="">Toda severidad</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
          <select value={filters.result} onChange={(e) => updateFilter("result", e.target.value)}><option value="">Todo resultado</option><option value="success">Success</option><option value="denied">Denied</option><option value="failed">Failed</option></select>
          <input type="date" value={filters.date_from} onChange={(e) => updateFilter("date_from", e.target.value)} aria-label="Fecha desde" />
          <input type="date" value={filters.date_to} onChange={(e) => updateFilter("date_to", e.target.value)} aria-label="Fecha hasta" />
        </div>
        <div style={{ padding: "var(--s5) var(--s5) var(--s5) var(--s6)" }}>
          {loading ? <Skeleton rows={8} /> : rows.length === 0 ? <Empty icon="shield-check" title="Sin eventos">No hay eventos de auditoria para estos filtros.</Empty> : (
            <div className="timeline">
              {rows.map((item) => (
                <button key={item.id} className={`tl-item audit-event ${item.result === "denied" || item.result === "failed" ? "danger" : "ok"}`} onClick={() => setSelected(item)}>
                  <div className="tl-dot"><Icon name={item.result === "denied" ? "lock" : "user"} size={13} /></div>
                  <div className="tl-body">
                    <div className="row between wrap">
                      <div className="tl-title"><b>{item.user}</b> / {item.action} <span style={{ color: "var(--brand)" }}>{item.entity}</span></div>
                      <span className="mono faint" style={{ fontSize: "var(--fs-xs)" }}>{item.createdAt ? new Date(item.createdAt).toLocaleString("es-CO") : "-"}</span>
                    </div>
                    <div className="row gap2 wrap" style={{ marginTop: 4 }}>
                      <Badge tone="outline">{item.module}</Badge>
                      <Badge tone={item.result === "denied" || item.result === "failed" ? "danger" : "success"} dot>{item.result}</Badge>
                      <Badge tone={item.severity === "critical" ? "danger" : item.severity === "warning" ? "warning" : "outline"}>{item.severity}</Badge>
                      <span className="mono faint" style={{ fontSize: "var(--fs-2xs)" }}>IP {item.ip}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>
      <AuditDetailDrawer event={selected} onClose={() => setSelected(null)} />
    </>
  );
}

window.AuditPage = AuditPage;
