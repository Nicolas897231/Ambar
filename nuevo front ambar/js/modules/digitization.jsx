const { useState: dgS } = React;

const DG_COLS = [
  { key: "pending", name: "Pendiente", color: "var(--muted)" },
  { key: "scanned", name: "Escaneado", color: "var(--viz-sky)" },
  { key: "processing", name: "OCR procesando", color: "var(--viz-amber)" },
  { key: "validated", name: "Validado", color: "var(--viz-indigo)" },
  { key: "archived", name: "Archivado", color: "var(--ok)" },
];

function normalizeOcrJob(j, i) {
  return {
    id: j.job_code || j.idJob || j.id || `OCR-${i + 1}`,
    name: j.document_name || j.file_name || j.name || "Documento",
    folios: j.pages || j.folios || 0,
    op: j.operator_name || j.created_by || "AMBAR",
    pri: j.priority || "normal",
    col: j.status || "pending",
    confidence: j.confidence || 0,
  };
}

function DigitizationPage({ user }) {
  const [tab, setTab] = dgS("queue");
  const { data: rawJobs, loading } = useLiveData(() => AmbarAPI.endpoints.ocrJobs(), [], []);
  const jobs = AmbarAPI.listFrom(rawJobs).map(normalizeOcrJob);
  const total = jobs.length;
  const today = jobs.filter(j => j.created_at && String(j.created_at).startsWith(new Date().toISOString().slice(0, 10))).length;
  const avg = total ? Math.round(jobs.reduce((a, b) => a + (b.confidence || 0), 0) / total) : 0;
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestion Documental</div><h1>Digitalizacion y OCR</h1><p className="lead">Cola OCR conectada a backend. Los resultados se muestran solo si existen trabajos reales.</p></div>
        <div className="page-actions"><Button icon="scan-line" onClick={() => setTab("scan")}>Nuevo escaneo</Button></div>
      </div>
      <div className="statstrip an-rise">
        <div><div className="ss-n">{jobs.filter(j => j.col === "pending").length}</div><div className="ss-l">En cola</div></div>
        <div><div className="ss-n">{today}</div><div className="ss-l">Escaneados hoy</div></div>
        <div><div className="ss-n">{avg}%</div><div className="ss-l">Confianza OCR media</div></div>
        <div><div className="ss-n">{total}</div><div className="ss-l">Trabajos totales</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "queue", label: "Cola de digitalizacion", icon: "list-checks" }, { key: "scan", label: "Escaneo", icon: "scan-line" }]} />
      {tab === "queue" && (loading ? <Skeleton lines={8} /> : (
        <div className="kanban an-rise">
          {DG_COLS.map(col => {
            const items = jobs.filter(it => String(it.col).toLowerCase() === col.key);
            return (
              <div key={col.key} className="kcol">
                <div className="kcol-head"><span className="k-tag" style={{ background: col.color }} /><span className="k-name">{col.name}</span><span className="k-count">{items.length}</span></div>
                <div className="kcol-body">
                  {items.map(it => (
                    <div key={it.id} className="kcard">
                      <div className="row between"><span className="mono faint" style={{ fontSize: "var(--fs-2xs)" }}>{it.id}</span><Badge tone="outline">{it.pri}</Badge></div>
                      <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)", margin: "6px 0" }}>{it.name}</div>
                      <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-xs)" }}><Icon name="file" size={11} style={{ verticalAlign: -1 }} /> {it.folios} folios</span><Avatar size="sm" name={it.op} color="var(--viz-teal)" /></div>
                      {it.confidence > 0 && <div style={{ marginTop: 8 }}><Meter value={it.confidence} /></div>}
                    </div>
                  ))}
                  {items.length === 0 && <div className="muted" style={{ textAlign: "center", padding: "var(--s5)", fontSize: "var(--fs-xs)" }}>Sin documentos</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {tab === "scan" && (
        <Card className="an-rise">
          <CardHead title="Subida OCR" sub="La carga real debe pasar por el servicio documental/MinIO." icon="upload-cloud" />
          <div className="uploader" style={{ padding: "var(--s9)" }}><Icon name="upload-cloud" size={36} /><div style={{ marginTop: 10, fontWeight: 700, fontSize: "var(--fs-md)" }}>Selecciona archivos para enviar al backend</div><small className="faint">Sin datos precargados. El trabajo se registrara cuando exista endpoint de procesamiento OCR.</small></div>
        </Card>
      )}
    </>
  );
}

window.DigitizationPage = DigitizationPage;
