/* ============================================================
   AMBAR - Archivo & Custodia: Prestamos Documentales
   ============================================================ */
const { useState: loS } = React;

const LOANS = [
  { id: "PRE-2026-088", doc: "Expediente Juan Perez", who: "Jorge Villa", area: "Gerencia", out: "2026-05-30", due: "2026-06-04", state: "Activo" },
  { id: "PRE-2026-087", doc: "Contrato obra civil", who: "Maria Juridica", area: "Juridica", out: "2026-05-25", due: "2026-06-02", state: "Vencido" },
  { id: "PRE-2026-086", doc: "Factura proveedor #4821", who: "Ana Financiera", area: "Financiera", out: "2026-05-28", due: "2026-06-08", state: "Activo" },
  { id: "PRE-2026-085", doc: "Acta comite directivo", who: "Jorge Villa", area: "Gerencia", out: "2026-05-15", due: "2026-05-22", state: "Devuelto" },
];
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
  return (items || []).map((item, i) => ({
    id: item.loan_code || item.code || `PRE-${i + 1}`,
    doc: item.entity_label || item.document_name || item.expedient_name || item.entity_type || "Unidad documental",
    who: item.requester_name || item.borrower_name || "Solicitante",
    area: item.requester_area || item.area || item.archive_name || "Archivo",
    out: item.loan_date ? String(item.loan_date).slice(0, 10) : item.created_at ? String(item.created_at).slice(0, 10) : "-",
    due: item.expected_return_date ? String(item.expected_return_date).slice(0, 10) : "-",
    state: normalizeLoanState(item.status_label || item.status || "Activo"),
  }));
}

function RequestLoan({ onClose }) {
  const toast = useToast();
  return (
    <Modal title="Solicitar prestamo documental" sub="Salida temporal controlada de documento, carpeta, expediente o caja" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="send" onClick={() => { toast("Solicitud enviada al archivo", { tone: "ok", title: "Prestamo creado" }); onClose(); }}>Enviar solicitud</Button></>}>
      <div className="col gap4">
        <Field label="Unidad documental" required help="Busca por nombre o codigo"><div className="input-icon"><Icon name="search" size={16} /><input placeholder="Ej. Expediente Juan Perez" /></div></Field>
        <div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Area solicitante"><select>{(window.AREAS || ["Archivo"]).map(a => <option key={a}>{a}</option>)}</select></Field><Field label="Fecha esperada de devolucion" required><input type="date" /></Field></div>
        <Field label="Motivo" required><textarea placeholder="Para que se requiere la unidad documental" /></Field>
        <div className="page-intro" style={{ background: "var(--info-bg)" }}><span className="pi-ico" style={{ background: "var(--info)" }}><Icon name="info" size={16} /></span><div><h4>Flujo del prestamo</h4><p>Solicitud, aprobacion, entrega con evidencia, devolucion y cierre. AMBAR genera alertas y Kardex cuando aplica.</p></div></div>
      </div>
    </Modal>
  );
}

function LoansPage({ user }) {
  const [tab, setTab] = loS("active");
  const [req, setReq] = loS(false);
  const liveLoans = window.useLiveData(() => window.AmbarAPI.endpoints.loans().then(mapLoans), LOANS, []);
  const loans = liveLoans.data;
  const lower = value => String(value || "").toLowerCase();
  const filtered = loans.filter(l => tab === "active" ? lower(l.state).includes("activo") : tab === "overdue" ? lower(l.state).includes("venc") : tab === "history" ? lower(l.state).includes("devuelto") : true);
  const active = loans.filter(l => lower(l.state).includes("activo")).length;
  const overdue = loans.filter(l => lower(l.state).includes("venc")).length;
  const returned = loans.filter(l => lower(l.state).includes("devuelto")).length;

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
          {filtered.map(l => (<tr key={l.id} className="clickable"><td className="cell-mono">{l.id}</td><td className="cell-strong">{l.doc}</td><td><div className="t-avatar"><Avatar size="sm" name={l.who} color="var(--viz-indigo)" />{l.who}</div></td><td>{l.area}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{l.out}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: lower(l.state).includes("venc") ? "var(--danger)" : "var(--muted)", fontWeight: lower(l.state).includes("venc") ? 700 : 400 }}>{l.due}</td><td><Badge tone={LOAN_STATE[l.state] || "info"} dot>{l.state}</Badge></td><td>{lower(l.state).includes("activo") || lower(l.state).includes("venc") ? <Button variant="ghost" size="sm" icon="check">Devolver</Button> : <Button variant="subtle" size="sm" icon="chevron-right" />}</td></tr>))}
        </tbody></table></div>
        {filtered.length === 0 && <Empty icon="package-check" title="Sin prestamos en esta vista">No hay registros que coincidan con el filtro seleccionado.</Empty>}
      </Card>
      {req && <RequestLoan onClose={() => setReq(false)} />}
    </>
  );
}

window.LoansPage = LoansPage;
