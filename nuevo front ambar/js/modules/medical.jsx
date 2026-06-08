/* ============================================================
   AMBAR — Talento Humano: Exámenes Médicos (SST)
   ============================================================ */
const { useState: meS } = React;

const EXAMS = [
  { emp: "Carlos Daza", type: "Periódico", ips: "Colmédica Ocupacional", result: "Apto", date: "2025-03-10", next: "2026-03-10", state: "Vencido", color: "var(--viz-teal)" },
  { emp: "Mariana Ruiz", type: "Ingreso", ips: "SURA SST", result: "Apto", date: "2026-06-01", next: "2027-06-01", state: "Vigente", color: "var(--viz-rose)" },
  { emp: "Juan Pérez", type: "Periódico", ips: "Colmédica Ocupacional", result: "Apto c/ restricción", date: "2025-07-15", next: "2026-07-15", state: "Próximo", color: "var(--viz-amber)" },
  { emp: "Sara López", type: "Ingreso", ips: "SURA SST", result: "Apto", date: "2025-01-20", next: "2026-01-20", state: "Vencido", color: "var(--viz-indigo)" },
  { emp: "Diego Torres", type: "Reintegro", ips: "Positiva", result: "Apto c/ restricción", date: "2026-05-20", next: "—", state: "Vigente", color: "var(--viz-green)" },
  { emp: "Andrea Niño", type: "Periódico", ips: "Colmédica Ocupacional", result: "Apto", date: "2026-02-01", next: "2027-02-01", state: "Vigente", color: "var(--viz-gold)" },
  { emp: "Pedro Gómez", type: "Retiro", ips: "SURA SST", result: "Apto", date: "2026-04-30", next: "—", state: "Vigente", color: "var(--viz-violet)" },
];
const EX_STATE = { Vigente: "success", Próximo: "warning", Vencido: "danger" };
const EX_TYPE = { Ingreso: "info", Periódico: "brand", Reintegro: "warning", Retiro: "neutral" };

function MedicalPage({ user }) {
  const [tab, setTab] = meS("Todos");
  const rows = EXAMS.filter(e => tab === "Todos" || e.state === tab);
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const examDays = { 10: 1, 15: 1, 20: 2 };
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano · SST</div><h1>Exámenes Médicos Ocupacionales</h1><p className="lead">Controla los exámenes de ingreso, periódicos, de reintegro y retiro conforme a la normativa colombiana, con alertas automáticas 30 días antes del vencimiento.</p></div><div className="page-actions">{can(user, ["medical.manage"]) && <Button icon="plus">Programar examen</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Exámenes vigentes" value={196} icon="check-circle" tone="ok" accent />
        <Metric label="Próximos a vencer" value={5} icon="clock" tone="warn" accent foot="30 días" />
        <Metric label="Vencidos" value={2} icon="alert-triangle" tone="danger" accent foot="acción urgente" />
        <Metric label="Con restricción" value={8} icon="stethoscope" tone="info" accent />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 300px", gap: "var(--s4)" }}>
        <div className="col gap4">
          <Tabs value={tab} onChange={setTab} tabs={[{ key: "Todos", label: "Todos" }, { key: "Vigente", label: "Vigentes" }, { key: "Próximo", label: "Por vencer" }, { key: "Vencido", label: "Vencidos" }]} />
          <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>IPS</th><th>Resultado</th><th>Realizado</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
            {rows.map((e, i) => (<tr key={i} className="clickable"><td><div className="t-avatar"><Avatar size="sm" name={e.emp} color={e.color} />{e.emp}</div></td><td><Badge tone={EX_TYPE[e.type]}>{e.type}</Badge></td><td className="muted" style={{ fontSize: "var(--fs-sm)" }}>{e.ips}</td><td>{e.result.includes("restricción") ? <Badge tone="warning" icon="alert-triangle">{e.result}</Badge> : <Badge tone="success">{e.result}</Badge>}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{e.date}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: e.state === "Vencido" ? "var(--danger)" : e.state === "Próximo" ? "var(--warn)" : "var(--muted)" }}>{e.next}</td><td><Badge tone={EX_STATE[e.state]} dot>{e.state}</Badge></td><td><Button variant="subtle" size="sm" icon="download" /></td></tr>))}
          </tbody></table></div></Card>
        </div>
        <div className="col gap4">
          <Card pad="sm" className="an-rise"><CardHead title="Junio 2026" sub="Exámenes programados" />
            <div className="cal">{["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} className="ch">{d}</div>)}
              {Array.from({ length: 0 }).map((_, i) => <div key={"e" + i} />)}
              {days.map(d => <div key={d} className={`cd${examDays[d] ? " has" : ""}${d === 3 ? " today" : ""}`}>{d}</div>)}
            </div>
          </Card>
          <Card pad="sm" className="an-rise" style={{ background: "var(--warn-bg)" }}>
            <div className="row gap2" style={{ marginBottom: 8 }}><Icon name="bell" size={18} style={{ color: "var(--warn)" }} /><b>Alertas activas</b></div>
            <div className="col gap2">
              {[["Carlos Daza", "Periódico vencido"], ["Sara López", "Ingreso vencido"], ["Juan Pérez", "Vence en 12 días"]].map(([n, m], i) => (<div key={i} className="row gap2" style={{ fontSize: "var(--fs-sm)", padding: "5px 0", borderBottom: i < 2 ? "1px solid color-mix(in oklab,var(--warn) 20%, transparent)" : "" }}><Avatar size="sm" name={n} color="var(--viz-amber)" /><div className="grow"><div style={{ fontWeight: 600 }}>{n}</div><small className="muted">{m}</small></div></div>))}
            </div>
          </Card>
          <Card pad="sm" className="an-rise"><CardHead title="Por tipo" /><Donut size={140} thickness={18} centerValue="211" centerLabel="exámenes" data={[{ label: "Periódico", value: 120 }, { label: "Ingreso", value: 58 }, { label: "Reintegro", value: 18 }, { label: "Retiro", value: 15 }]} /></Card>
        </div>
      </div>
    </>
  );
}

window.MedicalPage = MedicalPage;
