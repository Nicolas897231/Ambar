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
  const toast = useToast();
  const [tab, setTab] = dgS("queue");
  const [ocrPayload, setOcrPayload] = dgS({ document_id: "", engine: "tesseract-compatible" });
  const jobsLive = useLiveData(() => AmbarAPI.endpoints.ocrJobs(), [], []);
  const { data: rawJobs, loading } = jobsLive;
  const { data: docsRaw } = useLiveData(() => AmbarAPI.endpoints.documents(), [], []);
  const jobs = AmbarAPI.listFrom(rawJobs).map(normalizeOcrJob);
  const documents = AmbarAPI.listFrom(docsRaw);
  const total = jobs.length;
  const today = jobs.filter(j => j.created_at && String(j.created_at).startsWith(new Date().toISOString().slice(0, 10))).length;
  const avg = total ? Math.round(jobs.reduce((a, b) => a + (b.confidence || 0), 0) / total) : 0;
  const submitOcr = async () => {
    if (!ocrPayload.document_id) {
      toast("Selecciona un documento registrado para enviar a OCR.", { tone: "danger", title: "Falta documento" });
      return;
    }
    try {
      await AmbarAPI.post("/ocr/jobs", { document_id: Number(ocrPayload.document_id), engine: ocrPayload.engine });
      toast("Trabajo OCR creado y procesado por backend.", { tone: "ok", title: "OCR registrado" });
      jobsLive.setData(await AmbarAPI.endpoints.ocrJobs());
      setTab("queue");
      setOcrPayload({ document_id: "", engine: "tesseract-compatible" });
    } catch (err) {
      toast(err.message || "No fue posible crear el trabajo OCR.", { tone: "danger", title: "OCR bloqueado" });
    }
  };
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestion Documental</div><h1>Digitalizacion y OCR</h1><p className="lead">Convierte documentos fisicos en digitales: selecciona un documento registrado, envia el trabajo a OCR y valida resultados reales del backend.</p></div>
        <div className="page-actions"><Button icon="scan-line" onClick={() => setTab("scan")}>Nuevo escaneo</Button></div>
      </div>
      <div className="statstrip an-rise">
        <div><div className="ss-n">{jobs.filter(j => j.col === "pending").length}</div><div className="ss-l">En cola</div></div>
        <div><div className="ss-n">{today}</div><div className="ss-l">Escaneados hoy</div></div>
        <div><div className="ss-n">{avg}%</div><div className="ss-l">Confianza OCR media</div></div>
        <div><div className="ss-n">{total}</div><div className="ss-l">Trabajos totales</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "queue", label: "Cola de digitalizacion", icon: "list-checks" }, { key: "scan", label: "Nuevo OCR", icon: "scan-line" }]} />
      <div className="info-callout" style={{ marginBottom: "var(--s4)" }}><Icon name="info" size={16} /><p>La cola muestra trabajos OCR reales por estado. Un trabajo OCR toma un documento registrado, extrae texto si hay archivo escaneado y deja el resultado listo para busqueda y validacion.</p></div>
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
                  {items.length === 0 && <div className="muted" style={{ textAlign: "center", padding: "var(--s5)", fontSize: "var(--fs-xs)" }}>Sin trabajos en este estado</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {tab === "scan" && (
        <Card className="an-rise">
          <CardHead title="Nuevo trabajo OCR" sub="Selecciona un documento ya registrado. El archivo digital se carga y versiona desde Documentos/Repositorio." icon="scan-line" />
          <div className="grid cols-2">
            <Field label="Documento" required>
              <select value={ocrPayload.document_id} onChange={e => setOcrPayload(p => ({ ...p, document_id: e.target.value }))}>
                <option value="">Seleccionar documento</option>
                {documents.map(doc => <option key={doc.idDocument || doc.id} value={doc.idDocument || doc.id}>{doc.document_name || doc.name}</option>)}
              </select>
            </Field>
            <Field label="Motor OCR">
              <select value={ocrPayload.engine} onChange={e => setOcrPayload(p => ({ ...p, engine: e.target.value }))}>
                <option value="tesseract-compatible">Tesseract compatible</option>
                <option value="metadata-index">Indice por metadatos</option>
              </select>
            </Field>
          </div>
          <div className="grid cols-2" style={{ marginTop: "var(--s4)" }}>
            <Card pad="sm" style={{ background: "var(--panel-2)" }}><CardHead title="Tesseract compatible" sub="Para PDF escaneado o imagen. Intenta leer texto desde el archivo digital y calcula confianza OCR." icon="scan-text" /></Card>
            <Card pad="sm" style={{ background: "var(--panel-2)" }}><CardHead title="Indice por metadatos" sub="Para documentos sin OCR real. Indexa nombre, tipologia y metadatos para que aparezcan en busqueda." icon="tags" /></Card>
          </div>
          <div className="page-actions" style={{ marginTop: "var(--s5)" }}>
            <Button variant="ghost" onClick={() => setTab("queue")}>Cancelar</Button>
            <Button icon="scan-line" onClick={submitOcr} disabled={!can(user, ["ocr.manage"])}>Crear trabajo OCR</Button>
          </div>
        </Card>
      )}
    </>
  );
}

window.DigitizationPage = DigitizationPage;
