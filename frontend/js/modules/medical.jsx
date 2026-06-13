const { useState: meS } = React;

const EX_STATE = { Vigente: "success", Proximo: "warning", active: "success", overdue: "danger", Vencido: "danger" };
const EX_TYPE = { Ingreso: "info", Periodico: "brand", Reintegro: "warning", Retiro: "neutral" };

function normalizeExam(e, i) {
  return {
    id: e.idIncident || e.idExam || e.id || i,
    emp: e.employee_name || e.full_name || e.employee || e.ps1010Identification || "Empleado",
    type: e.incident_type || e.exam_type || e.type || "Examen",
    ips: e.provider || e.ips || "-",
    result: e.result || e.status_result || "-",
    date: e.incident_date ? String(e.incident_date).slice(0, 10) : e.created_at ? String(e.created_at).slice(0, 10) : "-",
    next: e.due_date ? String(e.due_date).slice(0, 10) : e.next_exam_date ? String(e.next_exam_date).slice(0, 10) : "-",
    state: e.status_label || e.status || "Vigente",
  };
}

function ExamModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = meS({ identification: "", incident_type: "examen_ingreso", description: "" });
  const { data: employeesRaw } = useLiveData(() => AmbarAPI.endpoints.employees(), [], []);
  const employees = AmbarAPI.listFrom(employeesRaw);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const submit = async () => {
    if (!payload.identification || !payload.description.trim()) {
      toast("Selecciona empleado y registra la observacion del examen.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    try {
      const created = await AmbarAPI.post(`/hr/employees/${encodeURIComponent(payload.identification)}/incidents`, { incident_type: payload.incident_type, description: payload.description });
      toast("Examen registrado en SST.", { tone: "ok", title: "SST actualizado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible registrar el examen.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Programar examen" sub="El registro queda como incidente SST asociado al empleado." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Registrar examen</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Empleado" required><select value={payload.identification} onChange={e => setField("identification", e.target.value)}><option value="">Seleccionar empleado</option>{employees.map(e => <option key={e.identification} value={e.identification}>{e.full_name || e.name} - {e.identification}</option>)}</select></Field>
        <Field label="Tipo examen"><select value={payload.incident_type} onChange={e => setField("incident_type", e.target.value)}><option value="examen_ingreso">Ingreso</option><option value="examen_periodico">Periodico</option><option value="examen_retiro">Retiro</option><option value="certificado_medico">Certificado medico</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Observacion / proveedor" required><textarea value={payload.description} onChange={e => setField("description", e.target.value)} placeholder="IPS, fecha programada, resultado o condicion de seguimiento" /></Field></div>
      </div>
    </Modal>
  );
}

function MedicalPage({ user }) {
  const [tab, setTab] = meS("Todos");
  const [creating, setCreating] = meS(false);
  const liveExams = useLiveData(() => AmbarAPI.endpoints.medicalExams(), [], []);
  const { data: rawAlerts } = useLiveData(() => AmbarAPI.endpoints.sstAlerts(), [], []);
  const exams = AmbarAPI.listFrom(liveExams.data).map(normalizeExam);
  const alerts = AmbarAPI.listFrom(rawAlerts);
  const rows = exams.filter(e => tab === "Todos" || String(e.state).toLowerCase().includes(tab.toLowerCase()));
  const overdue = exams.filter(e => String(e.state).toLowerCase().includes("venc") || String(e.state).toLowerCase().includes("overdue")).length;
  const next = exams.filter(e => String(e.state).toLowerCase().includes("prox") || String(e.state).toLowerCase().includes("due")).length;
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano - SST</div><h1>Examenes Medicos Ocupacionales</h1><p className="lead">Registros SST conectados al backend. No se muestran examenes ni alertas ficticias.</p></div><div className="page-actions">{can(user, ["medical.manage"]) && <Button icon="plus" onClick={() => setCreating(true)}>Programar examen</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Examenes registrados" value={exams.length} icon="stethoscope" tone="ok" accent />
        <Metric label="Proximos a vencer" value={next} icon="clock" tone="warn" accent />
        <Metric label="Vencidos" value={overdue} icon="alert-triangle" tone="danger" accent />
        <Metric label="Alertas activas" value={alerts.length} icon="bell" tone="info" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "Todos", label: "Todos" }, { key: "Vigente", label: "Vigentes" }, { key: "Proximo", label: "Por vencer" }, { key: "Vencido", label: "Vencidos" }]} />
      <Card flush className="an-rise">
        {liveExams.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={6} /></div> : rows.length === 0 ? <Empty icon="stethoscope" title="Sin examenes">No hay examenes reales para este filtro.</Empty> : (
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>IPS</th><th>Resultado</th><th>Realizado</th><th>Vence</th><th>Estado</th></tr></thead><tbody>
            {rows.map((e) => (<tr key={e.id}><td><div className="t-avatar"><Avatar size="sm" name={e.emp} color="var(--viz-amber)" />{e.emp}</div></td><td><Badge tone={EX_TYPE[e.type] || "outline"}>{e.type}</Badge></td><td>{e.ips}</td><td>{e.result}</td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{e.date}</td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{e.next}</td><td><Badge tone={EX_STATE[e.state] || "neutral"} dot>{e.state}</Badge></td></tr>))}
          </tbody></table></div>
        )}
      </Card>
      {creating && <ExamModal onClose={() => setCreating(false)} onCreated={(created) => liveExams.setData(current => [created, ...(current || [])])} />}
    </>
  );
}

window.MedicalPage = MedicalPage;
