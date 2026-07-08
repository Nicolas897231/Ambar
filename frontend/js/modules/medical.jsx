const { useState: meS } = React;

const EX_STATE = { Vigente: "success", Proximo: "warning", active: "success", overdue: "danger", Vencido: "danger", programado: "info", realizado: "success" };
const EX_TYPE = { Ingreso: "info", Periodico: "brand", Reintegro: "warning", Retiro: "neutral" };

function humanizeExam(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseExamDescription(description) {
  const text = String(description || "");
  const lines = text.split("\n");
  const get = (label) => {
    const line = lines.find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return line ? line.split(":").slice(1).join(":").trim() : "";
  };
  return {
    ips: get("IPS"),
    scheduled: get("Fecha programada"),
    result: get("Resultado"),
    note: lines.filter((line) => !/^(IPS|Fecha programada|Resultado):/i.test(line)).join("\n").trim(),
  };
}

function normalizeExam(e, i) {
  const parsed = parseExamDescription(e.description);
  return {
    id: e.idIncident || e.idExam || e.id || i,
    emp: e.employee_name || e.full_name || e.employee || e.ps1010Identification || "Empleado",
    type: e.incident_type || e.exam_type || e.type || "Examen",
    ips: e.provider || e.ips || parsed.ips || "-",
    result: e.result || e.status_result || parsed.result || "-",
    date: parsed.scheduled || (e.incident_date ? String(e.incident_date).slice(0, 10) : e.created_at ? String(e.created_at).slice(0, 10) : "-"),
    next: e.due_date ? String(e.due_date).slice(0, 10) : e.next_exam_date ? String(e.next_exam_date).slice(0, 10) : "-",
    state: e.status_label || e.status || parsed.result || "Programado",
    note: parsed.note || e.description || "",
  };
}

function ExamModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = meS({
    identification: "",
    incident_type: "examen_ingreso",
    provider: "",
    scheduled_date: new Date().toISOString().slice(0, 10),
    result: "programado",
    description: "",
  });
  const { data: employeesRaw } = useLiveData(() => AmbarAPI.endpoints.employees(), [], []);
  const employees = AmbarAPI.listFrom(employeesRaw);
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const missing = [];
    if (!payload.identification) missing.push("empleado");
    if (!payload.provider.trim()) missing.push("IPS o proveedor");
    if (!payload.scheduled_date) missing.push("fecha programada");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Examen incompleto" });
      return;
    }
    try {
      const description = [
        `IPS: ${payload.provider.trim()}`,
        `Fecha programada: ${payload.scheduled_date}`,
        `Resultado: ${payload.result}`,
        payload.description.trim(),
      ].filter(Boolean).join("\n");
      const created = await AmbarAPI.post(`/hr/employees/${encodeURIComponent(payload.identification)}/incidents`, { incident_type: payload.incident_type, description });
      toast("Examen registrado en SST.", { tone: "ok", title: "SST actualizado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible registrar el examen.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Programar examen" sub="Seguimiento interno de SST asociado al empleado. No integra IPS todavía." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Registrar examen</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Empleado" required><select value={payload.identification} onChange={(event) => setField("identification", event.target.value)}><option value="">Seleccionar empleado</option>{employees.map((employee) => <option key={employee.identification} value={employee.identification}>{employee.full_name || employee.name} - {employee.identification}</option>)}</select></Field>
        <Field label="Tipo de examen"><select value={payload.incident_type} onChange={(event) => setField("incident_type", event.target.value)}><option value="examen_ingreso">Ingreso</option><option value="examen_periodico">Periódico</option><option value="examen_retiro">Retiro</option><option value="certificado_medico">Certificado médico</option></select></Field>
        <Field label="IPS o proveedor" required><input value={payload.provider} onChange={(event) => setField("provider", event.target.value)} placeholder="Ej. Colmedica" /></Field>
        <Field label="Fecha programada" required><input type="date" value={payload.scheduled_date} onChange={(event) => setField("scheduled_date", event.target.value)} /></Field>
        <Field label="Resultado"><select value={payload.result} onChange={(event) => setField("result", event.target.value)}><option value="programado">Programado</option><option value="realizado">Realizado</option><option value="pendiente_resultado">Pendiente resultado</option><option value="restriccion">Con restricción</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Observación"><textarea value={payload.description} onChange={(event) => setField("description", event.target.value)} placeholder="Condición de seguimiento, recomendación o novedad SST" /></Field></div>
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
  const rows = exams.filter((exam) => tab === "Todos" || String(exam.state).toLowerCase().includes(tab.toLowerCase()));
  const overdue = exams.filter((exam) => String(exam.state).toLowerCase().includes("venc") || String(exam.state).toLowerCase().includes("overdue")).length;
  const next = exams.filter((exam) => String(exam.state).toLowerCase().includes("prox") || String(exam.state).toLowerCase().includes("due") || String(exam.state).toLowerCase().includes("programado")).length;
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano - SST</div><h1>Exámenes Médicos Ocupacionales</h1><p className="lead">Programación y seguimiento interno conectados al backend. No se muestran exámenes ni alertas ficticias.</p></div><div className="page-actions">{can(user, ["medical.manage"]) && <Button icon="plus" onClick={() => setCreating(true)}>Programar examen</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Exámenes registrados" value={exams.length} icon="stethoscope" tone="ok" accent />
        <Metric label="Próximos a vencer" value={next} icon="clock" tone="warn" accent />
        <Metric label="Vencidos" value={overdue} icon="alert-triangle" tone="danger" accent />
        <Metric label="Alertas activas" value={alerts.length} icon="bell" tone="info" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "Todos", label: "Todos" }, { key: "Vigente", label: "Vigentes" }, { key: "Proximo", label: "Por vencer" }, { key: "Vencido", label: "Vencidos" }]} />
      <Card flush className="an-rise">
        {liveExams.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={6} /></div> : rows.length === 0 ? <Empty icon="stethoscope" title="Sin exámenes">No hay exámenes reales para este filtro.</Empty> : (
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>IPS</th><th>Resultado</th><th>Programado</th><th>Vence</th><th>Estado</th></tr></thead><tbody>
            {rows.map((exam) => (<tr key={exam.id}><td><div className="t-avatar"><Avatar size="sm" name={exam.emp} color="var(--viz-amber)" />{exam.emp}</div></td><td><Badge tone={EX_TYPE[exam.type] || "outline"}>{humanizeExam(exam.type)}</Badge></td><td>{exam.ips}</td><td>{exam.result}</td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{exam.date}</td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{exam.next}</td><td><Badge tone={EX_STATE[exam.state] || "neutral"} dot>{exam.state}</Badge></td></tr>))}
          </tbody></table></div>
        )}
      </Card>
      {creating && <ExamModal onClose={() => setCreating(false)} onCreated={(created) => liveExams.setData((current) => [created, ...(current || [])])} />}
    </>
  );
}

window.MedicalPage = MedicalPage;
