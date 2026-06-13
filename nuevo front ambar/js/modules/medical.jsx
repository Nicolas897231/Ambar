const { useState: meS } = React;

const EX_STATE = { Vigente: "success", Proximo: "warning", "Próximo": "warning", Vencido: "danger", active: "success", overdue: "danger" };
const EX_TYPE = { Ingreso: "info", Periodico: "brand", "Periódico": "brand", Reintegro: "warning", Retiro: "neutral" };

function normalizeExam(e, i) {
  return {
    id: e.idExam || e.id || i,
    emp: e.employee_name || e.full_name || e.employee || "Empleado",
    type: e.exam_type || e.type || "Examen",
    ips: e.provider || e.ips || "-",
    result: e.result || e.status_result || "-",
    date: e.exam_date ? String(e.exam_date).slice(0, 10) : e.created_at ? String(e.created_at).slice(0, 10) : "-",
    next: e.due_date ? String(e.due_date).slice(0, 10) : e.next_exam_date ? String(e.next_exam_date).slice(0, 10) : "-",
    state: e.status_label || e.status || "Vigente",
  };
}

function MedicalPage({ user }) {
  const [tab, setTab] = meS("Todos");
  const { data: rawExams, loading } = useLiveData(() => AmbarAPI.endpoints.medicalExams(), [], []);
  const { data: rawAlerts } = useLiveData(() => AmbarAPI.endpoints.sstAlerts(), [], []);
  const exams = AmbarAPI.listFrom(rawExams).map(normalizeExam);
  const alerts = AmbarAPI.listFrom(rawAlerts);
  const rows = exams.filter(e => tab === "Todos" || String(e.state).toLowerCase().includes(tab.toLowerCase()));
  const overdue = exams.filter(e => String(e.state).toLowerCase().includes("venc") || String(e.state).toLowerCase().includes("overdue")).length;
  const next = exams.filter(e => String(e.state).toLowerCase().includes("prox") || String(e.state).toLowerCase().includes("due")).length;
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano · SST</div><h1>Examenes Medicos Ocupacionales</h1><p className="lead">Registros SST conectados al backend. No se muestran examenes ni alertas ficticias.</p></div><div className="page-actions">{can(user, ["medical.manage"]) && <Button icon="plus">Programar examen</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Examenes registrados" value={exams.length} icon="stethoscope" tone="ok" accent />
        <Metric label="Proximos a vencer" value={next} icon="clock" tone="warn" accent />
        <Metric label="Vencidos" value={overdue} icon="alert-triangle" tone="danger" accent />
        <Metric label="Alertas activas" value={alerts.length} icon="bell" tone="info" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "Todos", label: "Todos" }, { key: "Vigente", label: "Vigentes" }, { key: "Proximo", label: "Por vencer" }, { key: "Vencido", label: "Vencidos" }]} />
      <Card flush className="an-rise">
        {loading ? <div style={{ padding: "var(--s5)" }}><Skeleton lines={6} /></div> : rows.length === 0 ? <Empty icon="stethoscope" title="Sin examenes">No hay examenes reales para este filtro.</Empty> : (
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>IPS</th><th>Resultado</th><th>Realizado</th><th>Vence</th><th>Estado</th></tr></thead><tbody>
            {rows.map((e) => (<tr key={e.id}><td><div className="t-avatar"><Avatar size="sm" name={e.emp} color="var(--viz-amber)" />{e.emp}</div></td><td><Badge tone={EX_TYPE[e.type] || "outline"}>{e.type}</Badge></td><td>{e.ips}</td><td>{e.result}</td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{e.date}</td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{e.next}</td><td><Badge tone={EX_STATE[e.state] || "neutral"} dot>{e.state}</Badge></td></tr>))}
          </tbody></table></div>
        )}
      </Card>
    </>
  );
}

window.MedicalPage = MedicalPage;
