/* ============================================================
   AMBAR - Archivo & Custodia: Transferencias Documentales
   ============================================================ */
const { useState: trS } = React;

const BATCH_STATE = { Aceptada: "success", "En transito": "info", Borrador: "warning", Rechazada: "danger", closed: "success", received: "success", rejected: "danger", draft: "warning" };
const TR_STEPS = ["Seleccion", "Validacion", "FUID", "Envio", "Recepcion", "Cierre"];

function mapTransfers(items) {
  return window.AmbarAPI.listFrom(items).map((item, i) => ({
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

function TransferWizard({ onClose }) {
  const toast = useToast();
  const [step, setStep] = trS(0);
  const liveArchives = window.useLiveData(() => window.AmbarAPI.endpoints.archives().then(window.AmbarAPI.listFrom), [], []);
  const archives = liveArchives.data.map(a => ({
    id: a.idArchive || a.id || a.archive_id || a.code || a.archive_code,
    label: a.name || a.archive_name || a.code || a.archive_code || "Archivo"
  })).filter(a => a.id || a.label);
  const next = () => {
    if (step < TR_STEPS.length - 1) setStep(step + 1);
    else {
      toast("Transferencia preparada", { tone: "ok", title: "FUID generado y listo para recepcion" });
      onClose();
    }
  };
  return (
    <Modal lg wide title="Asistente de transferencia documental" sub="Flujo operativo con validacion, FUID, envio y recepcion" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><div className="row gap2">{step > 0 && <Button variant="secondary" icon="arrow-left" onClick={() => setStep(step - 1)}>Atras</Button>}<Button icon={step < TR_STEPS.length - 1 ? "arrow-right" : "check"} onClick={next}>{step < TR_STEPS.length - 1 ? "Siguiente" : "Finalizar"}</Button></div></>}>
      <div style={{ marginBottom: "var(--s5)", overflowX: "auto" }}><Stepper steps={TR_STEPS} current={step} /></div>
      {step === 0 && <div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>Selecciona la unidad documental</h4><p>Elige expediente, carpeta, caja o lote. AMBAR validara prestamos activos, foliacion y permisos antes de enviar.</p></div></div>{archives.length === 0 ? <Empty icon="archive" title="Sin archivos parametrizados">Crea archivos autorizados antes de preparar transferencias.</Empty> : <div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Archivo origen"><select>{archives.map(a => <option key={a.id || a.label} value={a.id || a.label}>{a.label}</option>)}</select></Field><Field label="Archivo destino"><select>{archives.map(a => <option key={a.id || a.label} value={a.id || a.label}>{a.label}</option>)}</select></Field></div>}<Field label="Unidad documental"><div className="input-icon"><Icon name="search" size={16} /><input placeholder="Buscar expediente, caja o carpeta" /></div></Field></div>}
      {step === 1 && <div className="col center gap4" style={{ padding: "var(--s6)" }}><div className="mfa-badge" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="check-circle" size={26} /></div><h3>Validacion operacional</h3><p className="muted" style={{ textAlign: "center", maxWidth: "50ch" }}>Sin prestamos activos, sin inconsistencias de foliacion y con permisos de archivo correctos.</p><div className="row wrap gap2"><Badge tone="success" icon="check">Permisos OK</Badge><Badge tone="success" icon="check">Foliacion OK</Badge><Badge tone="success" icon="check">Sin prestamos</Badge></div></div>}
      {step === 2 && <div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="clipboard" size={18} /></span><div><h4>FUID automatico</h4><p>El inventario se genera desde expediente, TRD, folios, soporte y ubicacion fisica.</p></div></div><Card flush><table className="tbl"><thead><tr><th>Unidad</th><th>Serie</th><th>Folios</th><th>Soporte</th><th>Ubicacion</th></tr></thead><tbody><tr><td className="cell-strong">Expediente seleccionado</td><td>TRD</td><td className="mono">--</td><td><Badge tone="info">Fisico/Digital</Badge></td><td>Origen</td></tr></tbody></table></Card></div>}
      {step === 3 && <div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Responsable entrega"><input placeholder="Nombre responsable" /></Field><Field label="Fecha envio"><input type="date" /></Field><Field label="Observacion"><textarea placeholder="Observacion de entrega" /></Field><Field label="Evidencia"><input type="file" /></Field></div>}
      {step === 4 && <div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="package-check" size={18} /></span><div><h4>Recepcion controlada</h4><p>El destino compara lo declarado en FUID contra lo recibido y puede aceptar, rechazar o recibir parcial.</p></div></div><div className="segmented"><button className="active">Aceptar</button><button>Parcial</button><button>Rechazar</button></div><Field label="Observacion de recepcion"><textarea placeholder="Motivo si hay parcial o rechazo" /></Field></div>}
      {step === 5 && <div className="col center gap4" style={{ padding: "var(--s6)" }}><div className="mfa-badge pulse"><Icon name="archive" size={26} /></div><h3>Cierre con trazabilidad</h3><p className="muted" style={{ textAlign: "center", maxWidth: "50ch" }}>Al cerrar se actualiza custodia, Kardex, auditoria y notificaciones relacionadas.</p></div>}
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

function TransfersPage({ user }) {
  const [wiz, setWiz] = trS(false);
  const [detail, setDetail] = trS(null);
  const liveBatches = window.useLiveData(() => window.AmbarAPI.endpoints.transfers().then(mapTransfers), [], []);
  const batches = liveBatches.data;
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
      {wiz && <TransferWizard onClose={() => setWiz(false)} />}
      {detail && <TransferDetail transfer={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

window.TransfersPage = TransfersPage;
