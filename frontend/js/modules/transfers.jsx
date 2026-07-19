/* ============================================================
   AMBAR - Archivo & Custodia: Transferencias Documentales
   ============================================================ */
const { useState: trS } = React;

const BATCH_STATE = { Aceptada: "success", "En transito": "info", Borrador: "warning", Rechazada: "danger", closed: "success", received: "success", rejected: "danger", draft: "warning" };
const TR_STEPS = ["Seleccion", "Validacion", "FUID", "Envio", "Recepcion", "Cierre"];

function transferUnitLabel(type) {
  return { expedient: "Expediente", folder: "Carpeta", box: "Caja", document: "Documento" }[type] || "Unidad";
}

function transferUnitContext(item) {
  const route = item.location_path || item.physical_location || item.physical_location_path;
  const archive = item.archive_name || item.archive || "";
  return [archive, route].filter(Boolean).join(" / ") || "Sin ruta fisica registrada";
}

function mapTransfers(items) {
  return window.AmbarAPI.listFrom(items).map((item, i) => ({
    idBatch: item.idBatch || item.id || null,
    id: item.batch_code || item.transfer_code || item.fuid_code || `TR-${i + 1}`,
    from: item.origin_archive_name || item.origin_name || item.from_archive || "Archivo origen",
    to: item.destination_archive_name || item.destination_name || item.to_archive || "Archivo destino",
    items: item.item_count || item.items_count || item.items || 0,
    state: item.status_label || item.status || "Borrador",
    date: item.created_at ? String(item.created_at).slice(0, 10) : item.transfer_date || "-",
    by: item.created_by_name || item.responsible_name || item.created_by || "AMBAR",
  }));
}

function toneForTransfer(state) {
  const s = String(state || "").toLowerCase();
  if (BATCH_STATE[state]) return BATCH_STATE[state];
  if (s.includes("reject") || s.includes("rech")) return "danger";
  if (s.includes("accept") || s.includes("received") || s.includes("cerr")) return "success";
  if (s.includes("draft") || s.includes("borr")) return "warning";
  return "info";
}

function TransferWizard({ onClose, onCreated }) {
  const toast = useToast();
  const [step, setStep] = trS(0);
  const [busy, setBusy] = trS(false);
  const [payload, setPayload] = trS({
    batch_code: "",
    origin_archive_id: "",
    destination_archive_id: "",
    entity_type: "expedient",
    entity_id: "",
  });
  const liveArchives = window.useLiveData(() => window.AmbarAPI.endpoints.archives().then(window.AmbarAPI.listFrom), [], []);
  const liveExpedients = window.useLiveData(() => window.AmbarAPI.endpoints.expedients().then(window.AmbarAPI.listFrom), [], []);
  const liveFolders = window.useLiveData(() => window.AmbarAPI.endpoints.folders().then(window.AmbarAPI.listFrom), [], []);
  const liveBoxes = window.useLiveData(() => window.AmbarAPI.endpoints.boxes().then(window.AmbarAPI.listFrom), [], []);
  const liveDocuments = window.useLiveData(() => window.AmbarAPI.endpoints.documents().then(window.AmbarAPI.listFrom), [], []);
  const archives = liveArchives.data.map(a => ({
    id: a.idArchive || a.id || a.archive_id,
    label: `${a.archive_name || a.name || a.archive_code || "Archivo"}${a.archive_code ? ` (${a.archive_code})` : ""}`
  })).filter(a => a.id);
  const entitySource = {
    expedient: liveExpedients.data.map(e => ({ id: e.idExpedient || e.id, label: `${e.expedient_code || e.code || e.idExpedient} - ${e.expedient_name || e.name || "Expediente"}`, archive_id: e.archive_id || e.ps930IdArchive, context: transferUnitContext(e) })),
    folder: liveFolders.data.map(f => ({ id: f.idFolder || f.id, label: `${f.folder_code || f.code || f.idFolder} - ${f.folder_name || f.name || "Carpeta"}`, archive_id: f.archive_id || f.ps930IdArchive, context: transferUnitContext(f) })),
    box: liveBoxes.data.map(b => ({ id: b.idBox || b.id, label: `${b.box_code || b.code || b.idBox} - ${b.box_name || b.status || "Caja"}`, archive_id: b.archive_id || b.ps930IdArchive, context: transferUnitContext(b) })),
    document: liveDocuments.data.map(d => ({ id: d.idDocument || d.id, label: `${d.document_code || d.code || d.idDocument} - ${d.document_name || d.title || "Documento"}`, archive_id: d.archive_id || d.ps930IdArchive, context: transferUnitContext(d) })),
  };
  const entityOptions = (entitySource[payload.entity_type] || []).filter(item => {
    if (!payload.origin_archive_id) return true;
    if (!item.archive_id) return true;
    return Number(item.archive_id) === Number(payload.origin_archive_id);
  });
  const selectedUnit = entityOptions.find(item => String(item.id) === String(payload.entity_id));
  const setField = (key, value) => setPayload(prev => ({ ...prev, [key]: value, ...(key === "entity_type" || key === "origin_archive_id" ? { entity_id: "" } : {}) }));

  const submit = async () => {
    const missing = [];
    if (!payload.origin_archive_id) missing.push("archivo origen");
    if (!payload.destination_archive_id) missing.push("archivo destino");
    if (!payload.entity_id) missing.push("unidad documental");
    if (payload.origin_archive_id && payload.destination_archive_id && Number(payload.origin_archive_id) === Number(payload.destination_archive_id)) missing.push("archivo destino diferente");
    if (missing.length) return toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Transferencia incompleta" });
    setBusy(true);
    try {
      const batch = await AmbarAPI.post("/transfer-batches", {
        batch_code: payload.batch_code.trim() || null,
        origin_archive_id: Number(payload.origin_archive_id),
        destination_archive_id: Number(payload.destination_archive_id),
      });
      await AmbarAPI.post(`/transfer-batches/${batch.idBatch}/items`, {
        entity_type: payload.entity_type,
        entity_id: Number(payload.entity_id),
      });
      try {
        await AmbarAPI.post(`/archives/fuid/from-transfer/${batch.idBatch}`, {});
        toast("Transferencia creada con FUID y Kardex.", { tone: "ok", title: "Proceso preparado" });
      } catch (fuidErr) {
        toast("El lote fue creado. El FUID queda pendiente de generacion o permiso.", { tone: "warn", title: "FUID pendiente" });
      }
      onCreated && onCreated(batch);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la transferencia.", { tone: "danger", title: "Validacion de transferencia" });
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    if (step < TR_STEPS.length - 1) setStep(step + 1);
    else submit();
  };
  return (
    <Modal lg wide title="Asistente de transferencia documental" sub="Flujo operativo con validacion, FUID, envio y recepcion" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><div className="row gap2">{step > 0 && <Button variant="secondary" icon="arrow-left" onClick={() => setStep(step - 1)}>Atras</Button>}<Button icon={step < TR_STEPS.length - 1 ? "arrow-right" : "check"} onClick={next} disabled={busy}>{step < TR_STEPS.length - 1 ? "Siguiente" : busy ? "Creando" : "Crear transferencia"}</Button></div></>}>
      <div style={{ marginBottom: "var(--s5)", overflowX: "auto" }}><Stepper steps={TR_STEPS} current={step} /></div>
      {step === 0 && <div className="col gap4">
        <div className="page-intro"><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>Selecciona la unidad documental</h4><p>Elige que se transfiere: expediente, carpeta, caja o documento. AMBAR valida prestamo activo, TRD, foliacion, archivo origen y permisos en backend.</p></div></div>
        {archives.length === 0 ? <Empty icon="archive" title="Sin archivos parametrizados">Crea archivos autorizados antes de preparar transferencias.</Empty> : <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
          <Field label="Codigo de lote" hint="AMBAR genera este codigo automaticamente al crear la transferencia."><AutoCodeInput /></Field>
          <Field label="Tipo de unidad"><select value={payload.entity_type} onChange={e => setField("entity_type", e.target.value)}><option value="expedient">Expediente</option><option value="folder">Carpeta</option><option value="box">Caja</option><option value="document">Documento</option></select></Field>
          <Field label="Archivo origen" required><select value={payload.origin_archive_id} onChange={e => setField("origin_archive_id", e.target.value)}><option value="">Seleccionar origen</option>{archives.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <Field label="Archivo destino" required><select value={payload.destination_archive_id} onChange={e => setField("destination_archive_id", e.target.value)}><option value="">Seleccionar destino</option>{archives.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <Field label="Unidad documental" required><select value={payload.entity_id} onChange={e => setField("entity_id", e.target.value)}><option value="">Seleccionar unidad</option>{entityOptions.map(item => <option key={item.id} value={item.id}>{item.label} / {item.context}</option>)}</select></Field>
          <Card pad="sm" style={{ background: "var(--panel-2)", gridColumn: "1 / -1" }}>
            <CardHead title={selectedUnit ? `${transferUnitLabel(payload.entity_type)} seleccionado` : "Que vas a transferir"} sub={selectedUnit ? selectedUnit.label : "Primero selecciona archivo origen y unidad documental."} icon="route" />
            <p className="muted" style={{ marginTop: 6 }}>{selectedUnit ? selectedUnit.context : "Si la unidad no tiene ruta fisica, puedes transferirla como registro documental, pero la recepcion debe validar el contexto antes de cerrar."}</p>
          </Card>
        </div>}
      </div>}
      {step === 1 && <div className="col center gap4" style={{ padding: "var(--s6)" }}><div className="mfa-badge" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="shield-check" size={26} /></div><h3>Validacion en backend</h3><p className="muted" style={{ textAlign: "center", maxWidth: "54ch" }}>Aqui AMBAR confirma permisos sobre origen y destino, que la unidad pertenece al archivo origen, que no esta prestada y que no tiene bloqueos criticos.</p><div className="row wrap gap2"><Badge tone="info" icon="shield-check">Permisos por archivo</Badge><Badge tone="info" icon="clipboard">TRD y FUID</Badge><Badge tone="info" icon="package-check">Recepcion controlada</Badge></div></div>}
      {step === 2 && <div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="clipboard" size={18} /></span><div><h4>FUID automatico</h4><p>El FUID es el inventario de entrega: unidad, TRD, folios, soporte, origen, destino y ubicacion fisica si existe.</p></div></div><Card flush><table className="tbl"><thead><tr><th>Lote</th><th>Unidad</th><th>Origen</th><th>Destino</th></tr></thead><tbody><tr><td className="cell-mono">{payload.batch_code || "Automatico al crear"}</td><td>{selectedUnit?.label || `${payload.entity_type} #${payload.entity_id || "-"}`}</td><td>{archives.find(a => String(a.id) === String(payload.origin_archive_id))?.label || "-"}</td><td>{archives.find(a => String(a.id) === String(payload.destination_archive_id))?.label || "-"}</td></tr></tbody></table></Card></div>}
      {step === 3 && <div className="grid cols-2" style={{ gap: "var(--s3)" }}><Card pad="sm"><CardHead title="Entrega" sub="Cuando el lote existe, se puede cargar evidencia de salida desde el detalle de transferencia." icon="paperclip" /></Card><Card pad="sm"><CardHead title="Kardex" sub="La creacion del lote deja movimiento y auditoria. Al recibir, el destino cierra la trazabilidad." icon="history" /></Card></div>}
      {step === 4 && <div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="package-check" size={18} /></span><div><h4>Recepcion controlada</h4><p>El archivo destino revisa lo declarado en FUID contra lo recibido. Puede aceptar, rechazar o recibir parcial desde la bandeja de recepcion.</p></div></div></div>}
      {step === 5 && <div className="col center gap4" style={{ padding: "var(--s6)" }}><div className="mfa-badge pulse"><Icon name="archive" size={26} /></div><h3>Listo para crear</h3><p className="muted" style={{ textAlign: "center", maxWidth: "50ch" }}>Al confirmar se crea el lote, se agrega la unidad, se intenta generar FUID y queda trazabilidad en Kardex y auditoria.</p></div>}
    </Modal>
  );
}

function TransferDetail({ transfer, onClose }) {
  return (
    <Drawer title={transfer.id} sub={`${transfer.from} -> ${transfer.to}`} onClose={onClose}
      headExtra={<Badge tone={toneForTransfer(transfer.state)} dot>{transfer.state}</Badge>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <div className="kv"><span className="k">Archivo origen</span><span className="v">{transfer.from}</span></div>
        <div className="kv"><span className="k">Archivo destino</span><span className="v">{transfer.to}</span></div>
        <div className="kv"><span className="k">Items declarados</span><span className="v mono">{transfer.items}</span></div>
        <div className="kv"><span className="k">Fecha</span><span className="v mono">{transfer.date}</span></div>
        <div className="kv"><span className="k">Responsable</span><span className="v">{transfer.by}</span></div>
      </div>
      <div className="divider" />
      <Card pad="sm" style={{ background: "var(--panel-2)" }}>
        <CardHead title="Trazabilidad" sub="Detalle conectado al registro de transferencia disponible en backend" icon="route" />
        <p className="muted">Abre Kardex o Recepcion para ver la validacion documental, FUID e inconsistencias asociadas.</p>
      </Card>
    </Drawer>
  );
}

function TransfersPage({ user, routeParams = {} }) {
  const [wiz, setWiz] = trS(false);
  const [detail, setDetail] = trS(null);
  const liveBatches = window.useLiveData(() => window.AmbarAPI.endpoints.transfers().then(mapTransfers), [], []);
  const batches = liveBatches.data;
  React.useEffect(() => {
    if (!routeParams.batch || !Array.isArray(batches) || batches.length === 0) return;
    const match = batches.find((batch) => String(batch.idBatch) === String(routeParams.batch) || String(batch.id) === String(routeParams.batch));
    if (match) setDetail(match);
  }, [routeParams.batch, batches]);
  const lower = value => String(value || "").toLowerCase();
  const activeCount = batches.filter(b => !["aceptada", "received", "closed", "cerrada"].includes(lower(b.state))).length;
  const transitCount = batches.filter(b => lower(b.state).includes("trans")).length;
  const rejectedCount = batches.filter(b => lower(b.state).includes("rech") || lower(b.state).includes("reject")).length;
  const acceptedCount = batches.filter(b => lower(b.state).includes("acept") || lower(b.state).includes("received")).length;

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Archivo & Custodia</div><h1>Transferencias Documentales</h1><p className="lead">Traslada expedientes entre archivos con validacion, FUID automatico, recepcion controlada y trazabilidad completa.</p></div><div className="page-actions">{can(user, ["transfer.batch_manage", "document.transfer"]) && <Button icon="plus" onClick={() => setWiz(true)}>Nueva transferencia</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Transferencias activas" value={activeCount} icon="route" tone="brand" accent foot="en curso" />
        <Metric label="En transito" value={transitCount} icon="package-check" tone="info" accent foot="esperando recepcion" />
        <Metric label="Aceptadas" value={acceptedCount} icon="check-circle" tone="ok" accent />
        <Metric label="Rechazadas" value={rejectedCount} icon="alert-triangle" tone="danger" accent foot="requiere revision" />
      </div>
      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}><b>Lotes de transferencia</b><div className="search-box"><Icon name="search" size={16} /><input placeholder="Buscar lote FUID..." /></div></div>
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Lote FUID</th><th>Origen</th><th>Destino</th><th>Items</th><th>Estado</th><th>Fecha</th><th>Responsable</th><th></th></tr></thead><tbody>
          {batches.map(b => (<tr key={b.id} className="clickable" onClick={() => setDetail(b)}><td className="cell-mono cell-strong">{b.id}</td><td>{b.from}</td><td className="row gap2"><Icon name="arrow-right" size={13} style={{ color: "var(--faint)" }} />{b.to}</td><td className="mono">{b.items}</td><td><Badge tone={toneForTransfer(b.state)} dot>{b.state}</Badge></td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{b.date}</td><td>{b.by}</td><td><Button variant="subtle" size="sm" icon="chevron-right" onClick={(event) => { event.stopPropagation(); setDetail(b); }} /></td></tr>))}
        </tbody></table></div>
      </Card>
      {wiz && <TransferWizard onClose={() => setWiz(false)} onCreated={(batch) => liveBatches.setData((current) => [...mapTransfers([batch]), ...(current || [])])} />}
      {detail && <TransferDetail transfer={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

window.TransfersPage = TransfersPage;
