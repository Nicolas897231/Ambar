/* ============================================================
   AMBAR — Inteligencia: Auditoría
   ============================================================ */
const { useState: auS } = React;

const AUDIT = [
  { user: "Camila Restrepo", act: "Modificó permisos del rol", obj: "Auxiliar de Archivo", mod: "Seguridad", res: "ok", time: "2026-06-03 10:42", ip: "190.85.x.x" },
  { user: "Jorge Villa", act: "Descargó documento", obj: "DOC-2026-0481", mod: "Documentos", res: "ok", time: "2026-06-03 10:22", ip: "190.85.x.x" },
  { user: "Laura Mejía", act: "Validó OCR", obj: "DG-2030", mod: "Digitalización", res: "ok", time: "2026-06-03 09:58", ip: "10.0.x.x" },
  { user: "Diana Ortiz", act: "Intento de acceso denegado", obj: "Módulo Seguridad", mod: "Seguridad", res: "deny", time: "2026-06-03 09:15", ip: "10.0.x.x" },
  { user: "Andrés Gómez", act: "Cerró lote de transferencia", obj: "FUID-2026-014", mod: "Transferencias", res: "ok", time: "2026-06-02 17:30", ip: "190.85.x.x" },
  { user: "Sistema", act: "Generó alerta automática", obj: "Examen médico vencido", mod: "Notificaciones", res: "ok", time: "2026-06-02 06:00", ip: "—" },
  { user: "Ricardo Salas", act: "Creó empleado", obj: "Mariana Ruiz", mod: "RRHH", res: "ok", time: "2026-06-01 14:10", ip: "190.85.x.x" },
  { user: "Marta Lozano", act: "Radicó correspondencia", obj: "RAD-ENT-2026-0912", mod: "Correspondencia", res: "ok", time: "2026-06-01 08:41", ip: "190.85.x.x" },
];

function AuditPage() {
  const [q, setQ] = auS("");
  const [mod, setMod] = auS("");
  const rows = AUDIT.filter(a => (!q || (a.user + a.act + a.obj).toLowerCase().includes(q.toLowerCase())) && (!mod || a.mod === mod));
  const mods = [...new Set(AUDIT.map(a => a.mod))];
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Inteligencia</div><h1>Auditoría</h1><p className="lead">Cada acción queda registrada: quién la hizo, qué, cuándo, desde dónde y con qué resultado. Trazabilidad completa estilo control de versiones.</p></div><div className="page-actions"><Button variant="ghost" icon="download">Exportar log</Button></div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Eventos hoy" value={1284} icon="history" tone="brand" accent />
        <Metric label="Accesos denegados" value={3} icon="shield" tone="danger" accent foot="últimas 24h" />
        <Metric label="Descargas" value={142} icon="download" tone="info" accent />
        <Metric label="Usuarios conectados" value={17} icon="users" tone="ok" accent />
      </div>
      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)", gap: "var(--s3)" }}>
          <div className="search-box grow"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por usuario, acción u objeto…" /></div>
          <select value={mod} onChange={e => setMod(e.target.value)} style={{ width: 180 }}><option value="">Todos los módulos</option>{mods.map(m => <option key={m}>{m}</option>)}</select>
        </div>
        <div style={{ padding: "var(--s5) var(--s5) var(--s5) var(--s6)" }}>
          <div className="timeline">
            {rows.map((a, i) => (
              <div key={i} className={`tl-item ${a.res === "deny" ? "danger" : "ok"}`}>
                <div className="tl-dot"><Icon name={a.res === "deny" ? "lock" : a.user === "Sistema" ? "bot" : "user"} size={13} /></div>
                <div className="tl-body">
                  <div className="row between wrap"><div className="tl-title"><b>{a.user}</b> · {a.act} <span style={{ color: "var(--brand)" }}>{a.obj}</span></div><span className="mono faint" style={{ fontSize: "var(--fs-xs)" }}>{a.time}</span></div>
                  <div className="row gap2" style={{ marginTop: 4 }}><Badge tone="outline">{a.mod}</Badge><Badge tone={a.res === "deny" ? "danger" : "success"} dot>{a.res === "deny" ? "Denegado" : "Exitoso"}</Badge><span className="mono faint" style={{ fontSize: "var(--fs-2xs)" }}>IP {a.ip}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
window.AuditPage = AuditPage;
