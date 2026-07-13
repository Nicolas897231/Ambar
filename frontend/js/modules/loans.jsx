/* ============================================================
   AMBAR - Archivo & Custodia: Prestamos Documentales
   ============================================================ */
const { useState: loS } = React;

const LOANS = [];
const LOAN_STATE = { Activo: "info", Vencido: "danger", Devuelto: "success", Solicitado: "warning", active: "info", overdue: "danger", returned: "success", draft: "warning" };
const LOAN_FLOW = ["Solicitud", "Aprobacion", "Entrega", "Devolucion", "Cierre"];

function normalizeLoanState(state) {
  const s = String(state || "").toLowerCase();
  if (s === "active" || s === "due_today") return "Activo";
  if (s === "overdue") return "Vencido";
  if (s === "returned") return "Devuelto";
  return state || "Activo";
}

function mapLoans(items) {
  return window.AmbarAPI.listFrom(items).map((item, i) => ({
    rawId: item.idLoan || item.id || item.loan_id,
    id: item.loan_code || item.code || `PRE-${i + 1}`,
    doc: item.entity_label || item.document_name || item.expedient_name || item.entity_type || "Unidad documental",
    who: item.requester_name || item.requested_by || item.borrower_name || "Solicitante",
    area: item.requester_area || item.area || item.archive_name || "Archivo",
    out: item.loan_date ? String(item.loan_date).slice(0, 10) : item.created_at ? String(item.created_at).slice(0, 10) : "-",
    due: item.expected_return_date ? String(item.expected_return_date).slice(0, 10) : "-",
    state: normalizeLoanState(item.status_label || item.status || "Activo"),
  }));
}

function RequestLoan({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = loS({ entity_type: "expedient", entity_id: "", archive_id: "", requested_by: "", requester_area: "", due_at: "", reason: "" });
  const liveArchives = window.useLiveData(() => window.AmbarAPI.endpoints.archives().then(window.AmbarAPI.listFrom), [], []);
  const liveExpedients = window.useLiveData(() => window.AmbarAPI.endpoints.expedients().then(window.AmbarAPI.listFrom), [], []);
  const liveFolders = window.useLiveData(() => window.AmbarAPI.endpoints.folders().then(window.AmbarAPI.listFrom), [], []);
  const liveBoxes = window.useLiveData(() => window.AmbarAPI.endpoints.boxes().then(window.AmbarAPI.listFrom), [], []);
  const liveDocuments = window.useLiveData(() => window.AmbarAPI.endpoints.documents().then(window.AmbarAPI.listFrom), [], []);
  const archives = liveArchives.data;
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const entitySource = {
    document: liveDocuments.data.map((item) => ({ id: item.idDocument || item.id, archiveId: item.ps930IdArchive || item.archive_id, label: `${item.document_name || item.name || "Documento"} (${item.document_type || item.type || "sin tipo"})` })),
    folder: liveFolders.data.map((item) => ({ id: item.idFolder || item.id, archiveId: item.ps930IdArchive || item.archive_id, label: `${item.folder_code || item.code || "CAR"} - ${item.folder_name || item.name || "Carpeta"}` })),
    expedient: liveExpedients.data.map((item) => ({ id: item.idExpedient || item.id, archiveId: item.ps930IdArchive || item.archive_id, label: `${item.expedient_code || item.code || "EXP"} - ${item.expedient_name || item.name || "Expediente"}` })),
    box: liveBoxes.data.map((item) => ({ id: item.idBox || item.id, archiveId: item.ps930IdArchive || item.archive_id, label: `${item.box_code || item.code || "Caja"} - ${item.status || "activa"}` })),
  };
  const entityOptions = (entitySource[payload.entity_type] || []).filter((item) => !payload.archive_id || !item.archiveId || Number(item.archiveId) === Number(payload.archive_id));
  const changeArchive = (value) => setPayload((current) => ({ ...current, archive_id: value, entity_id: "" }));
  const changeType = (value) => setPayload((current) => ({ ...current, entity_type: value, entity_id: "" }));
  const submit = async () => {
    if (!payload.entity_id || !payload.archive_id || !payload.requested_by.trim() || !payload.due_at || !payload.reason.trim()) {
      toast("Selecciona archivo, unidad documental, solicitante, fecha y motivo.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    try {
      const created = await window.AmbarAPI.post("/archives/loans", {
        entity_type: payload.entity_type,
        entity_id: Number(payload.entity_id),
        archive_id: Number(payload.archive_id),
        requested_by: payload.requested_by.trim(),
        requester_area: payload.requester_area.trim() || null,
        due_at: payload.due_at ? `${payload.due_at}T23:59:00` : null,
        reason: payload.reason.trim(),
      });
      toast("Prestamo registrado en backend.", { tone: "ok", title: "Prestamo creado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el prestamo.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Solicitar prestamo documental" sub="Salida temporal controlada de documento, carpeta, expediente o caja" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="send" onClick={submit}>Enviar solicitud</Button></>}>
      <div className="col gap4">
        <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
          <Field label="Archivo custodio" required><select value={payload.archive_id} onChange={(e) => changeArchive(e.target.value)}><option value="">Seleccionar archivo</option>{archives.map((archive) => <option key={archive.idArchive || archive.id} value={archive.idArchive || archive.id}>{archive.name || archive.archive_name || archive.code}</option>)}</select></Field>
          <Field label="Tipo de unidad" required><select value={payload.entity_type} onChange={(e) => changeType(e.target.value)}><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option></select></Field>
          <Field label="Unidad documental" required><select value={payload.entity_id} onChange={(e) => setField("entity_id", e.target.value)}><option value="">Seleccionar unidad</option>{entityOptions.map((item) => <option key={`${payload.entity_type}-${item.id}`} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="Fecha esperada de devolucion" required><input type="date" value={payload.due_at} onChange={(e) => setField("due_at", e.target.value)} /></Field>
          <Field label="Solicitante" required><input value={payload.requested_by} onChange={(e) => setField("requested_by", e.target.value)} placeholder="Nombre de quien solicita" maxLength={160} /></Field>
          <Field label="Area solicitante"><input value={payload.requester_area} onChange={(e) => setField("requester_area", e.target.value)} placeholder="Dependencia o area" maxLength={120} /></Field>
        </div>
        <Field label="Motivo" required><textarea value={payload.reason} onChange={(e) => setField("reason", e.target.value)} placeholder="Para que se requiere la unidad documental" /></Field>
        <div className="page-intro" style={{ background: "var(--info-bg)" }}><span className="pi-ico" style={{ background: "var(--info)" }}><Icon name="info" size={16} /></span><div><h4>Flujo del prestamo</h4><p>Solicitud, aprobacion, entrega con evidencia, devolucion y cierre. AMBAR genera alertas y Kardex cuando aplica.</p></div></div>
      </div>
    </Modal>
  );
}

function LoansPage({ user }) {
  const toast = useToast();
  const [tab, setTab] = loS("active");
  const [req, setReq] = loS(false);
  const liveLoans = window.useLiveData(() => window.AmbarAPI.endpoints.loans().then(mapLoans), [], []);
  const loans = liveLoans.data;
  const lower = value => String(value || "").toLowerCase();
  const filtered = loans.filter(l => tab === "active" ? lower(l.state).includes("activo") : tab === "overdue" ? lower(l.state).includes("venc") : tab === "history" ? lower(l.state).includes("devuelto") : true);
  const active = loans.filter(l => lower(l.state).includes("activo")).length;
  const overdue = loans.filter(l => lower(l.state).includes("venc")).length;
  const returned = loans.filter(l => lower(l.state).includes("devuelto")).length;
  const returnLoan = async (loan) => {
    if (!loan.rawId) {
      toast("El prestamo no trae id interno desde backend para registrar devolucion.", { tone: "danger", title: "Falta identificador" });
      return;
    }
    try {
      const returnedLoan = await window.AmbarAPI.post(`/archives/loans/${loan.rawId}/return`, { observations: "Devolucion registrada desde la bandeja operacional." });
      liveLoans.setData((current) => (current || []).map((item) => item.rawId === loan.rawId ? mapLoans([returnedLoan])[0] : item));
      toast("La devolucion quedo registrada en backend.", { tone: "ok", title: "Prestamo devuelto" });
    } catch (err) {
      toast(err.message || "No fue posible registrar la devolucion.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Archivo & Custodia</div><h1>Prestamos Documentales</h1><p className="lead">Controla la salida temporal de unidades documentales: solicitud, aprobacion, entrega, devolucion y cierre.</p></div><div className="page-actions"><Button icon="plus" onClick={() => setReq(true)}>Solicitar prestamo</Button></div></div>
      <div className="page-intro an-rise"><span className="pi-ico"><Icon name="route" size={18} /></span><div className="grow"><h4>Flujo del prestamo</h4><div className="row wrap" style={{ gap: 0, marginTop: 6 }}>{LOAN_FLOW.map((s, i, a) => (<React.Fragment key={s}><span className="tag-soft">{i + 1}. {s}</span>{i < a.length - 1 && <Icon name="arrow-right" size={13} style={{ color: "var(--faint)", margin: "0 6px" }} />}</React.Fragment>))}</div></div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Prestamos activos" value={active} icon="package-check" tone="info" accent />
        <Metric label="Vencidos" value={overdue} icon="alert-triangle" tone="danger" accent foot="requieren devolucion" />
        <Metric label="Por vencer" value={loans.filter(l => lower(l.state).includes("hoy")).length} icon="clock" tone="warn" accent />
        <Metric label="Devueltos" value={returned} icon="check-circle" tone="ok" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "active", label: "Activos", icon: "package-check" }, { key: "overdue", label: "Vencidos", icon: "alert-triangle" }, { key: "history", label: "Historial", icon: "history" }, { key: "all", label: "Todos" }]} />
      <Card flush className="an-rise">
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Codigo</th><th>Unidad documental</th><th>Solicitante</th><th>Area</th><th>Salida</th><th>Devolucion</th><th>Estado</th><th></th></tr></thead><tbody>
          {filtered.length === 0 && <tr><td colSpan="8"><Empty icon="package-check" title="Sin prestamos">No hay prestamos reales para este filtro.</Empty></td></tr>}
          {filtered.map(l => (<tr key={l.id}><td className="cell-mono">{l.id}</td><td className="cell-strong">{l.doc}</td><td><div className="t-avatar"><Avatar size="sm" name={l.who} color="var(--viz-indigo)" />{l.who}</div></td><td>{l.area}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{l.out}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: lower(l.state).includes("venc") ? "var(--danger)" : "var(--muted)", fontWeight: lower(l.state).includes("venc") ? 700 : 400 }}>{l.due}</td><td><Badge tone={LOAN_STATE[l.state] || "info"} dot>{l.state}</Badge></td><td>{lower(l.state).includes("activo") || lower(l.state).includes("venc") ? <Button variant="ghost" size="sm" icon="check" onClick={() => returnLoan(l)}>Devolver</Button> : <span className="tag-soft">Cerrado</span>}</td></tr>))}
        </tbody></table></div>
        {filtered.length === 0 && <Empty icon="package-check" title="Sin prestamos en esta vista">No hay registros que coincidan con el filtro seleccionado.</Empty>}
      </Card>
      {req && <RequestLoan onClose={() => setReq(false)} onCreated={(created) => liveLoans.setData((current) => [mapLoans([created])[0], ...(current || [])])} />}
    </>
  );
}

window.LoansPage = LoansPage;
