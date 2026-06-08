/* ============================================================
   AMBAR — Archivo & Custodia: Transferencias (lotes + FUID)
   ============================================================ */
const { useState: trS } = React;

const BATCHES = [
  { id: "FUID-2026-014", from: "Archivo de Gestión", to: "Archivo Central", items: 42, state: "Aceptada", date: "2026-05-28", by: "Andrés Gómez" },
  { id: "FUID-2026-015", from: "Archivo de Gestión", to: "Archivo Central", items: 31, state: "En tránsito", date: "2026-06-01", by: "Andrés Gómez" },
  { id: "FUID-2026-016", from: "Archivo Central", to: "Archivo Histórico", items: 58, state: "Borrador", date: "2026-06-03", by: "Laura Mejía" },
  { id: "FUID-2026-013", from: "Sede Bogotá", to: "Archivo Central", items: 19, state: "Rechazada", date: "2026-05-20", by: "Andrés Gómez" },
];
const BATCH_STATE = { Aceptada: "success", "En tránsito": "info", Borrador: "warning", Rechazada: "danger" };
const TR_STEPS = ["Seleccionar", "Generar FUID", "Validar", "Transferir", "Recibir", "Cerrar lote"];

function TransferWizard({ onClose }) {
  const toast = useToast();
  const [step, setStep] = trS(0);
  const expedients = ["EXP-EMP-0098 · Carlos Daza", "EXP-CON-0410 · Contrato obra civil", "EXP-PRC-0021 · Proceso disciplinario", "EXP-EMP-0142 · Juan Pérez"];
  const [picked, setPicked] = trS({ 0: true, 1: true });
  const count = Object.values(picked).filter(Boolean).length;
  const next = () => { if (step < 5) setStep(step + 1); else { toast("Lote de transferencia cerrado", { tone: "ok", title: "FUID-2026-017 archivado" }); onClose(); } };
  return (
    <Modal lg wide title="Asistente de transferencia documental" sub="Traslada expedientes entre archivos de forma ordenada y trazable" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><div className="row gap2">{step > 0 && <Button variant="secondary" icon="arrow-left" onClick={() => setStep(step - 1)}>Atrás</Button>}<Button icon={step < 5 ? "arrow-right" : "check"} onClick={next}>{step < 5 ? "Siguiente paso" : "Cerrar lote"}</Button></div></>}>
      <div style={{ marginBottom: "var(--s5)", overflowX: "auto" }}><Stepper steps={TR_STEPS} current={step} /></div>
      <div className="wizard-body">
        {step === 0 && (<div className="col gap4">
          <div className="page-intro"><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>Paso 1 · Selecciona qué transferir</h4><p>El sistema sugiere los expedientes que cumplieron su tiempo de retención en el archivo de gestión.</p></div></div>
          <div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Archivo origen"><select>{window.ARCHIVES.map(a => <option key={a}>{a}</option>)}</select></Field><Field label="Archivo destino"><select defaultValue="Archivo Central Cali">{window.ARCHIVES.map(a => <option key={a}>{a}</option>)}</select></Field></div>
          <div className="col gap2">{expedients.map((e, i) => (<label key={i} className="list-row" style={{ cursor: "pointer" }}><input type="checkbox" checked={!!picked[i]} onChange={ev => setPicked(p => ({ ...p, [i]: ev.target.checked }))} style={{ width: 16 }} /><span className="grow mono" style={{ fontSize: "var(--fs-sm)" }}>{e}</span><Badge tone="warning">Retención cumplida</Badge></label>))}</div>
        </div>)}
        {step === 1 && (<div className="col gap4">
          <div className="page-intro"><span className="pi-ico"><Icon name="clipboard" size={18} /></span><div><h4>Paso 2 · Formato Único de Inventario Documental</h4><p>AMBAR genera el FUID automáticamente con el detalle de lo que se transfiere.</p></div></div>
          <Card flush><table className="tbl"><thead><tr><th>N°</th><th>Expediente</th><th>Folios</th><th>Fechas extremas</th><th>Soporte</th></tr></thead><tbody>{expedients.filter((_, i) => picked[i]).map((e, i) => (<tr key={i}><td className="mono">{i + 1}</td><td className="cell-strong">{e}</td><td className="mono">{[24, 34, 6, 14][i]}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>2024 – 2026</td><td><Badge tone="info">Físico+Digital</Badge></td></tr>))}</tbody></table></Card>
          <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{count} expedientes · {count * 19} folios aprox.</span><Button variant="ghost" size="sm" icon="download">Descargar FUID (PDF)</Button></div>
        </div>)}
        {step === 2 && (<div className="col center gap4" style={{ padding: "var(--s6)" }}><div className="mfa-badge" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="check-circle" size={26} /></div><h3>Validación completa</h3><p className="muted" style={{ textAlign: "center", maxWidth: "46ch" }}>El archivo receptor revisó el FUID. {count} expedientes verificados, sin inconsistencias. Listo para el traslado físico.</p><div className="row gap2"><Badge tone="success" icon="check">FUID válido</Badge><Badge tone="success" icon="check">Folios verificados</Badge><Badge tone="success" icon="check">Sin duplicados</Badge></div></div>)}
        {step === 3 && (<div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="route" size={18} /></span><div><h4>Paso 4 · Traslado físico</h4><p>Registra el despacho. El Kardex se actualiza con el movimiento de salida.</p></div></div><div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Responsable del traslado"><input defaultValue="Laura Mejía" /></Field><Field label="Fecha de despacho"><input type="date" defaultValue="2026-06-03" /></Field><Field label="N° de cajas embaladas"><input type="number" defaultValue="3" /></Field><Field label="Transportadora / medio"><input placeholder="Mensajería interna" /></Field></div><label className="check"><input type="checkbox" defaultChecked /> Confirmo que las cajas fueron revisadas y embaladas correctamente</label></div>)}
        {step === 4 && (<div className="col gap4"><div className="page-intro"><span className="pi-ico"><Icon name="package-check" size={18} /></span><div><h4>Paso 5 · Recepción ítem por ítem</h4><p>El archivo receptor acepta, rechaza o marca como parcial cada expediente.</p></div></div>{expedients.filter((_, i) => picked[i]).map((e, i) => (<div key={i} className="list-row"><Icon name="folder" size={16} style={{ color: "var(--muted)" }} /><span className="grow mono" style={{ fontSize: "var(--fs-sm)" }}>{e}</span><div className="segmented"><button className="active">Aceptar</button><button>Parcial</button><button>Rechazar</button></div></div>))}</div>)}
        {step === 5 && (<div className="col center gap4" style={{ padding: "var(--s6)" }}><div className="mfa-badge pulse"><Icon name="archive" size={26} /></div><h3>Cierre del lote</h3><p className="muted" style={{ textAlign: "center", maxWidth: "46ch" }}>Al cerrar, AMBAR actualiza la ubicación de los {count} expedientes al Archivo Central y registra todo en el Kardex. Esta acción es idempotente: reintentar no duplica el cierre.</p><Card pad="sm" style={{ width: "100%" }}><div className="dl"><dt>Lote</dt><dd className="mono">FUID-2026-017</dd><dt>Expedientes</dt><dd>{count} aceptados</dd><dt>Nueva ubicación</dt><dd>Archivo Central</dd></div></Card></div>)}
      </div>
    </Modal>
  );
}

function TransfersPage({ user }) {
  const [wiz, setWiz] = trS(false);
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Archivo & Custodia</div><h1>Transferencias Documentales</h1><p className="lead">Traslada expedientes entre archivos (gestión → central → histórico) con un flujo guiado de 6 pasos, FUID automático y recepción controlada.</p></div><div className="page-actions">{can(user, ["transfer.batch_manage", "document.transfer"]) && <Button icon="plus" onClick={() => setWiz(true)}>Nueva transferencia</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Transferencias activas" value={6} icon="route" tone="brand" accent foot="en curso" />
        <Metric label="En tránsito" value={2} icon="package-check" tone="info" accent foot="esperando recepción" />
        <Metric label="Aceptadas (mes)" value={11} icon="check-circle" tone="ok" accent trend="+3" trendDir="up" />
        <Metric label="Rechazadas" value={1} icon="alert-triangle" tone="danger" accent foot="requiere revisión" />
      </div>
      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}><b>Lotes de transferencia</b><div className="search-box"><Icon name="search" size={16} /><input placeholder="Buscar lote FUID…" /></div></div>
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Lote FUID</th><th>Origen</th><th>Destino</th><th>Ítems</th><th>Estado</th><th>Fecha</th><th>Responsable</th><th></th></tr></thead><tbody>
          {BATCHES.map(b => (<tr key={b.id} className="clickable"><td className="cell-mono cell-strong">{b.id}</td><td>{b.from}</td><td className="row gap2"><Icon name="arrow-right" size={13} style={{ color: "var(--faint)" }} />{b.to}</td><td className="mono">{b.items}</td><td><Badge tone={BATCH_STATE[b.state]} dot>{b.state}</Badge></td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{b.date}</td><td>{b.by}</td><td><Button variant="subtle" size="sm" icon="chevron-right" /></td></tr>))}
        </tbody></table></div>
      </Card>
      {wiz && <TransferWizard onClose={() => setWiz(false)} />}
    </>
  );
}

window.TransfersPage = TransfersPage;
