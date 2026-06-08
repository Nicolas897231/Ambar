/* ============================================================
   AMBAR — Archivo & Custodia: Préstamos Documentales
   ============================================================ */
const { useState: loS } = React;

const LOANS = [
  { id: "PRE-2026-088", doc: "Expediente Juan Pérez", who: "Jorge Villa", area: "Gerencia", out: "2026-05-30", due: "2026-06-04", state: "Activo" },
  { id: "PRE-2026-087", doc: "Contrato obra civil", who: "María Jurídica", area: "Jurídica", out: "2026-05-25", due: "2026-06-02", state: "Vencido" },
  { id: "PRE-2026-086", doc: "Factura proveedor #4821", who: "Ana Financiera", area: "Financiera", out: "2026-05-28", due: "2026-06-08", state: "Activo" },
  { id: "PRE-2026-085", doc: "Acta comité directivo", who: "Jorge Villa", area: "Gerencia", out: "2026-05-15", due: "2026-05-22", state: "Devuelto" },
  { id: "PRE-2026-084", doc: "Hoja de vida C. Daza", who: "Diana Ortiz", area: "RRHH", out: "2026-05-10", due: "2026-05-30", state: "Devuelto" },
  { id: "PRE-2026-083", doc: "Pólizas 2025", who: "Ana Financiera", area: "Financiera", out: "2026-04-28", due: "2026-05-12", state: "Devuelto" },
];
const LOAN_STATE = { Activo: "info", Vencido: "danger", Devuelto: "success", Solicitado: "warning" };
const LOAN_FLOW = ["Solicitud", "Aprobación", "Entrega", "Devolución", "Cierre"];

function RequestLoan({ onClose }) {
  const toast = useToast();
  return (
    <Modal title="Solicitar préstamo de documento" sub="Pide la salida temporal de un documento físico" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="send" onClick={() => { toast("Solicitud enviada al Jefe de Archivo", { tone: "ok", title: "PRE-2026-089 creada" }); onClose(); }}>Enviar solicitud</Button></>}>
      <div className="col gap4">
        <Field label="Documento o expediente" required help="Busca por nombre o código"><div className="input-icon"><Icon name="search" size={16} /><input placeholder="Ej. Expediente Juan Pérez" /></div></Field>
        <div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Área solicitante"><select>{window.AREAS.map(a => <option key={a}>{a}</option>)}</select></Field><Field label="Fecha de devolución" required><input type="date" defaultValue="2026-06-10" /></Field></div>
        <Field label="Motivo de la consulta" required><textarea placeholder="Indica para qué necesitas el documento…" /></Field>
        <div className="page-intro" style={{ background: "var(--info-bg)" }}><span className="pi-ico" style={{ background: "var(--info)" }}><Icon name="info" size={16} /></span><div><h4>Flujo del préstamo</h4><p>Solicitud → Aprobación del Jefe de Archivo → Entrega con constancia → Devolución → Cierre. Recibirás alertas antes del vencimiento.</p></div></div>
      </div>
    </Modal>
  );
}

function LoansPage({ user }) {
  const [tab, setTab] = loS("active");
  const [req, setReq] = loS(false);
  const filtered = LOANS.filter(l => tab === "active" ? l.state === "Activo" : tab === "overdue" ? l.state === "Vencido" : tab === "history" ? l.state === "Devuelto" : true);
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Archivo & Custodia</div><h1>Préstamos Documentales</h1><p className="lead">Controla la salida temporal de documentos físicos: solicitud, aprobación, entrega, devolución y cierre — con alertas automáticas de vencimiento y registro en el Kardex.</p></div><div className="page-actions"><Button icon="plus" onClick={() => setReq(true)}>Solicitar préstamo</Button></div></div>
      <div className="page-intro an-rise"><span className="pi-ico"><Icon name="route" size={18} /></span><div className="grow"><h4>Flujo del préstamo</h4><div className="row wrap" style={{ gap: 0, marginTop: 6 }}>{LOAN_FLOW.map((s, i, a) => (<React.Fragment key={s}><span className="tag-soft">{i + 1}. {s}</span>{i < a.length - 1 && <Icon name="arrow-right" size={13} style={{ color: "var(--faint)", margin: "0 6px" }} />}</React.Fragment>))}</div></div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Préstamos activos" value={23} icon="package-check" tone="info" accent />
        <Metric label="Vencidos" value={3} icon="alert-triangle" tone="danger" accent foot="requieren devolución" />
        <Metric label="Por vencer (3 días)" value={5} icon="clock" tone="warn" accent />
        <Metric label="Devueltos (mes)" value={47} icon="check-circle" tone="ok" accent trend="+12%" trendDir="up" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "active", label: "Activos", icon: "package-check" }, { key: "overdue", label: "Vencidos", icon: "alert-triangle" }, { key: "history", label: "Historial", icon: "history" }, { key: "all", label: "Todos" }]} />
      <Card flush className="an-rise">
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Código</th><th>Documento</th><th>Solicitante</th><th>Área</th><th>Salida</th><th>Devolución</th><th>Estado</th><th></th></tr></thead><tbody>
          {filtered.map(l => (<tr key={l.id} className="clickable"><td className="cell-mono">{l.id}</td><td className="cell-strong">{l.doc}</td><td><div className="t-avatar"><Avatar size="sm" name={l.who} color="var(--viz-indigo)" />{l.who}</div></td><td>{l.area}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{l.out}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: l.state === "Vencido" ? "var(--danger)" : "var(--muted)", fontWeight: l.state === "Vencido" ? 700 : 400 }}>{l.due}</td><td><Badge tone={LOAN_STATE[l.state]} dot>{l.state}</Badge></td><td>{l.state === "Activo" || l.state === "Vencido" ? <Button variant="ghost" size="sm" icon="check">Devolver</Button> : <Button variant="subtle" size="sm" icon="chevron-right" />}</td></tr>))}
        </tbody></table></div>
        {filtered.length === 0 && <Empty icon="package-check" title="Sin préstamos en esta vista">No hay registros que coincidan con el filtro seleccionado.</Empty>}
      </Card>
      {req && <RequestLoan onClose={() => setReq(false)} />}
    </>
  );
}

window.LoansPage = LoansPage;
