/* ============================================================
   AMBAR - Gestión Documental: Foliación
   ============================================================ */

function foliationRowsFrom(value) {
  if (Array.isArray(value)) return value;
  return AmbarAPI.listFrom(value, ["folios", "items", "records", "data"]);
}

function FoliationPage({ user }) {
  const toast = useToast();
  const [expedientId, setExpedientId] = useState("");
  const [payload, setPayload] = useState({ document_id: "", folder_id: "", folio_start: "", folio_end: "", electronic_folios: 0, annexes: "" });
  const expedientsLive = useLiveData(() => AmbarAPI.endpoints.expedients(), [], []);
  const docsLive = useLiveData(() => expedientId ? AmbarAPI.get(`/documents?expedient_id=${encodeURIComponent(expedientId)}&limit=200`) : Promise.resolve([]), [], [expedientId]);
  const foldersLive = useLiveData(() => expedientId ? AmbarAPI.endpoints.folders(expedientId) : Promise.resolve([]), [], [expedientId]);
  const foliosLive = useLiveData(() => expedientId ? AmbarAPI.endpoints.expedientFoliation(expedientId) : Promise.resolve({ folios: [] }), { folios: [] }, [expedientId]);
  const expedients = AmbarAPI.listFrom(expedientsLive.data);
  const documents = AmbarAPI.listFrom(docsLive.data);
  const folders = AmbarAPI.listFrom(foldersLive.data);
  const folios = foliationRowsFrom(foliosLive.data);
  const totalFolios = folios.reduce((acc, row) => acc + Number(row.folio_total || row.total || 0), 0);
  const missing = documents.filter(doc => !folios.some(row => Number(row.document_id || row.ps520IdDocument) === Number(doc.idDocument || doc.id))).length;

  const setField = (key, value) => setPayload(prev => ({ ...prev, [key]: value }));
  const submit = async () => {
    if (!expedientId || !payload.document_id || !payload.folder_id || !payload.folio_start || !payload.folio_end) {
      toast("Selecciona expediente, documento, carpeta y rango de folios.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    try {
      await AmbarAPI.post("/archives/foliation", {
        document_id: Number(payload.document_id),
        expedient_id: Number(expedientId),
        folder_id: Number(payload.folder_id),
        folio_start: Number(payload.folio_start),
        folio_end: Number(payload.folio_end),
        electronic_folios: Number(payload.electronic_folios || 0),
        annexes: payload.annexes || null,
      });
      toast("Rango de folios registrado y auditado.", { tone: "ok", title: "Foliación actualizada" });
      setPayload({ document_id: "", folder_id: "", folio_start: "", folio_end: "", electronic_folios: 0, annexes: "" });
      foliosLive.setData(await AmbarAPI.endpoints.expedientFoliation(expedientId));
    } catch (err) {
      toast(err.message || "Revisa duplicados, saltos o contexto documental.", { tone: "danger", title: "No fue posible foliar" });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestión Documental</div>
          <h1>Foliación documental</h1>
          <p className="lead">Controla hojas numeradas por expediente. AMBAR valida duplicados, saltos, carpeta y contexto documental antes de guardar.</p>
        </div>
        <div className="page-actions"><Button variant="ghost" icon="refresh" onClick={() => expedientId && AmbarAPI.endpoints.expedientFoliation(expedientId).then(foliosLive.setData)}>Validar</Button></div>
      </div>

      <Card>
        <Field label="Expediente">
          <select value={expedientId} onChange={e => { setExpedientId(e.target.value); setPayload({ document_id: "", folder_id: "", folio_start: "", folio_end: "", electronic_folios: 0, annexes: "" }); }}>
            <option value="">Seleccionar expediente</option>
            {expedients.map(exp => <option key={exp.idExpedient || exp.id} value={exp.idExpedient || exp.id}>{exp.expedient_code || exp.code} - {exp.expedient_name || exp.name}</option>)}
          </select>
        </Field>
      </Card>

      <div className="grid cols-3">
        <Metric label="Documentos del expediente" value={documents.length} icon="file-text" tone="brand" accent />
        <Metric label="Total folios" value={totalFolios} icon="hash" tone="ok" accent />
        <Metric label="Pendientes por foliar" value={missing} icon="alert-triangle" tone={missing ? "warn" : "ok"} accent />
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Registrar foliación" sub="Selecciona, no escribas contexto manual" icon="list-checks" />
          {!expedientId ? <Empty icon="folder-kanban" title="Selecciona un expediente">El mapa de folios se carga cuando hay expediente activo.</Empty> : (
            <div className="grid cols-2">
              <Field label="Documento" required>
                <select value={payload.document_id} onChange={e => setField("document_id", e.target.value)}>
                  <option value="">Seleccionar documento</option>
                  {documents.map(doc => <option key={doc.idDocument || doc.id} value={doc.idDocument || doc.id}>{doc.document_name || doc.name}</option>)}
                </select>
              </Field>
              <Field label="Carpeta" required>
                <select value={payload.folder_id} onChange={e => setField("folder_id", e.target.value)}>
                  <option value="">Seleccionar carpeta</option>
                  {folders.map(folder => <option key={folder.idFolder || folder.id} value={folder.idFolder || folder.id}>{folder.folder_code || folder.code} - {folder.folder_name || folder.name}</option>)}
                </select>
              </Field>
              <Field label="Folio inicial" required><input type="number" min="1" value={payload.folio_start} onChange={e => setField("folio_start", e.target.value)} /></Field>
              <Field label="Folio final" required><input type="number" min="1" value={payload.folio_end} onChange={e => setField("folio_end", e.target.value)} /></Field>
              <Field label="Folios electrónicos"><input type="number" min="0" value={payload.electronic_folios} onChange={e => setField("electronic_folios", e.target.value)} /></Field>
              <Field label="Anexos"><input value={payload.annexes} onChange={e => setField("annexes", e.target.value)} placeholder="Opcional" /></Field>
              <div style={{ gridColumn: "1 / -1" }}><Button className="btn-block" icon="plus" onClick={submit} disabled={!can(user, ["document.update"])}>Registrar folios</Button></div>
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Mapa de folios" sub="Rangos reales guardados en backend" icon="hash" action={<Badge tone={missing ? "warning" : "success"}>{missing ? "Con pendientes" : "Íntegra"}</Badge>} />
          {foliosLive.loading ? <Skeleton rows={5} /> : folios.length === 0 ? <Empty icon="hash" title="Sin foliación">No hay rangos registrados para este expediente.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Documento</th><th>Carpeta</th><th>Inicio</th><th>Final</th><th>Total</th></tr></thead>
                <tbody>{folios.map(row => <tr key={row.idFoliation || `${row.document_id}-${row.folio_start}`}>
                  <td className="cell-strong">{row.document_name || row.ps520IdDocument || row.document_id}</td>
                  <td>{row.folder_code || row.ps952IdFolder || row.folder_id}</td>
                  <td>{row.folio_start}</td>
                  <td>{row.folio_end}</td>
                  <td>{row.folio_total || row.total || 0}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

window.FoliationPage = FoliationPage;
