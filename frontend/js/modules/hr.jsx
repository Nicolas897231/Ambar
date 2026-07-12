/* ============================================================
   AMBAR - Talento Humano: Empleados, Cargos, Contratos
   ============================================================ */
const { useState: hrS } = React;

const EMP_STATE = { Activo: "success", active: "success", Vacaciones: "info", Incapacidad: "warning", Retirado: "neutral" };

function humanizeHR(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeEmployee(item, i) {
  return {
    id: item.identification || item.employee_code || `EMP-${i + 1}`,
    name: item.full_name || item.name || item.employee_name || "Empleado",
    pos: item.position_name || item.position || item.job_title || "Cargo sin asignar",
    area: item.department_name || item.department || item.area || "Dependencia",
    state: item.status || "Activo",
    contract: item.contract_type || "Indefinido",
    start: item.hire_date ? String(item.hire_date).slice(0, 10) : item.start_date ? String(item.start_date).slice(0, 10) : "-",
    compliance: item.compliance_percent || item.document_compliance || 0,
    color: ["var(--viz-violet)", "var(--viz-amber)", "var(--viz-teal)", "var(--viz-rose)", "var(--viz-sky)"][i % 5]
  };
}

function EmployeeProfile({ emp, onClose, navigate }) {
  const [tab, setTab] = hrS("info");
  const toast = useToast();
  const timelineLive = useLiveData(() => AmbarAPI.endpoints.employeeTimeline(emp.id), { files: [], contracts: [], incidents: [] }, [emp.id]);
  const complianceLive = useLiveData(() => AmbarAPI.endpoints.employeeCompliance(emp.id), { items: [], missing_files: [], compliance: emp.compliance }, [emp.id]);
  const timeline = timelineLive.data || { files: [], contracts: [], incidents: [] };
  const compliance = complianceLive.data || {};
  const files = AmbarAPI.listFrom(timeline.files);
  const contracts = AmbarAPI.listFrom(timeline.contracts);
  const incidents = AmbarAPI.listFrom(timeline.incidents);
  const exams = incidents.filter((item) => String(item.incident_type || "").startsWith("examen_") || String(item.incident_type || "").includes("certificado_medico"));
  const changes = incidents.filter((item) => String(item.incident_type || "").includes("cargo_change"));
  const tabs = [{ key: "info", label: "Información", icon: "user" }, { key: "documents", label: "Documentos", icon: "folder-kanban" }, { key: "contracts", label: "Contratos", icon: "file-text" }, { key: "medical", label: "Exámenes médicos", icon: "stethoscope" }, { key: "changes", label: "Historial de cargos", icon: "history" }, { key: "novelty", label: "Novedades", icon: "flag" }];
  const registerContract = async () => {
    const contract_type = window.prompt("Tipo de contrato");
    if (!contract_type) return;
    const start = window.prompt("Fecha inicio (AAAA-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!start) return;
    const end = window.prompt("Fecha fin (opcional, AAAA-MM-DD)", "");
    try {
      const created = await AmbarAPI.post(`/hr/employees/${encodeURIComponent(emp.id)}/contracts`, { contract_type, start_date: new Date(start).toISOString(), end_date: end ? new Date(end).toISOString() : null, status: "active" });
      toast("Contrato registrado en el historial laboral.", { tone: "ok", title: "Contrato creado" });
      timelineLive.setData((current) => ({ ...(current || {}), contracts: [created, ...((current && current.contracts) || [])] }));
    } catch (err) {
      toast(err.message || "No fue posible registrar el contrato.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Drawer wide title={emp.name} sub={emp.pos} onClose={onClose} headExtra={<Badge tone={EMP_STATE[emp.state] || "neutral"} dot>{emp.state}</Badge>}>
      <div className="profile-head" style={{ padding: 0, marginBottom: "var(--s5)" }}>
        <span className="avatar xl" style={{ background: emp.color }}>{window.initialsOf(emp.name)}</span>
        <div className="ph-meta">
          <h2>{emp.name}</h2>
          <p className="muted">{emp.pos} - {emp.area}</p>
          <div className="row gap2" style={{ marginTop: 8 }}><Badge tone="brand" icon="hash">{emp.id}</Badge><Badge tone="outline">{emp.contract}</Badge><Badge tone="outline">Desde {emp.start}</Badge></div>
        </div>
        <div className="col center"><Gauge value={compliance.compliance ?? emp.compliance} label="Expediente" tone={(compliance.compliance ?? emp.compliance) >= 90 ? "var(--ok)" : "var(--warn)"} /></div>
      </div>
      <Card className="workspace-actions" pad="sm">
        <div className="row between wrap" style={{ gap: "var(--s3)" }}>
          <div>
            <h3 style={{ fontSize: "var(--fs-md)" }}>Vista 360 laboral</h3>
            <p className="muted" style={{ marginTop: 4 }}>Desde aqui puedes revisar documentos, contratos, examenes, novedades y trazabilidad sin duplicar archivos.</p>
          </div>
          <Badge tone={(compliance.compliance ?? emp.compliance) >= 90 ? "success" : "warning"}>{compliance.compliance ?? emp.compliance}% documental</Badge>
        </div>
        <div className="quick-actions compact">
          <button className="quick-action" onClick={() => setTab("documents")}><Icon name="folder-kanban" size={16} /><span>Documentos</span></button>
          <button className="quick-action" onClick={() => setTab("contracts")}><Icon name="file-text" size={16} /><span>Contratos</span></button>
          <button className="quick-action" onClick={() => setTab("medical")}><Icon name="stethoscope" size={16} /><span>Examenes</span></button>
          <button className="quick-action" onClick={() => setTab("changes")}><Icon name="history" size={16} /><span>Cargos</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("expedients")}><Icon name="folder-kanban" size={16} /><span>Expediente</span></button>
        </div>
      </Card>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "info" && (<div className="grid cols-2" style={{ gap: "var(--s4)" }}>{[["Identificación", emp.id], ["Cargo", emp.pos], ["Área / dependencia", emp.area], ["Tipo de contrato", emp.contract], ["Fecha de ingreso", emp.start], ["Estado", emp.state]].map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>)}
      {tab === "documents" && (<div className="col gap3">
        {(compliance.items || []).length > 0 && <Card><CardHead title="Checklist documental" sub={`${compliance.compliance || 0}% completo`} icon="list-checks" /><div className="grid cols-2">{compliance.items.map((item) => <Badge key={item.file_type} tone={item.complete ? "success" : "warning"} dot>{humanizeHR(item.file_type)}</Badge>)}</div></Card>}
        {files.length === 0 ? <Empty icon="folder-kanban" title="Sin documentos laborales">Los documentos se vinculan desde Gestión Documental para no duplicar archivos.</Empty> : <Card flush><div className="table-scroll"><table className="tbl"><thead><tr><th>Tipo</th><th>Documento</th><th>Fecha</th></tr></thead><tbody>{files.map((file) => <tr key={file.idEmployeeFile || file.file_type}><td>{humanizeHR(file.file_type)}</td><td className="mono">{file.ps520IdDocument}</td><td>{file.upload_date ? String(file.upload_date).slice(0, 10) : "-"}</td></tr>)}</tbody></table></div></Card>}
        <Button variant="ghost" className="btn-block" icon="folder-kanban" onClick={() => navigate && navigate("expedients")}>Abrir expedientes laborales</Button>
      </div>)}
      {tab === "contracts" && (<div className="col gap3"><div className="row between"><b>Historial contractual</b><Button size="sm" icon="plus" onClick={registerContract}>Registrar contrato</Button></div>{contracts.length === 0 ? <Empty icon="file-text" title="Sin contratos">Registra contratos, prórrogas, otrosíes o liquidaciones asociados al empleado.</Empty> : <Card flush><div className="table-scroll"><table className="tbl"><thead><tr><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>{contracts.map((contract) => <tr key={contract.idContract}><td>{contract.contract_type}</td><td>{String(contract.start_date || "-").slice(0, 10)}</td><td>{contract.end_date ? String(contract.end_date).slice(0, 10) : "-"}</td><td><Badge tone={contract.status === "active" ? "success" : "neutral"} dot>{contract.status}</Badge></td></tr>)}</tbody></table></div></Card>}</div>)}
      {tab === "medical" && (<div className="col gap2">{exams.length === 0 ? <Empty icon="stethoscope" title="Sin exámenes cargados">Programa y consulta seguimiento desde SST.</Empty> : exams.map((exam) => <Card key={exam.idIncident}><div className="row between"><b>{humanizeHR(exam.incident_type)}</b><span className="muted">{String(exam.created_at || "-").slice(0, 10)}</span></div><p className="muted">{exam.description}</p></Card>)}<Button variant="ghost" className="btn-block" icon="stethoscope" onClick={() => navigate && navigate("medical")}>Ver módulo SST</Button></div>)}
      {tab === "changes" && (changes.length === 0 ? <Empty icon="history" title="Sin cambios de cargo">Los ascensos o traslados quedarán aquí con auditoría.</Empty> : <div className="timeline">{changes.map((item) => <div className="tl-item" key={item.idIncident}><span className="tl-dot" /><div><b>Cambio de cargo</b><p>{item.description}</p><small>{String(item.created_at || "-").slice(0, 10)}</small></div></div>)}</div>)}
      {tab === "novelty" && (incidents.filter((item) => !exams.includes(item) && !changes.includes(item)).length === 0 ? <Empty icon="history" title="Sin novedades">No hay novedades laborales registradas para este empleado.</Empty> : incidents.filter((item) => !exams.includes(item) && !changes.includes(item)).map((item) => <Card key={item.idIncident}><b>{humanizeHR(item.incident_type)}</b><p className="muted">{item.description}</p></Card>))}
    </Drawer>
  );
}

function EmployeeModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = hrS({ identification: "", full_name: "", employee_code: "", position: "", department: "", hire_date: new Date().toISOString().slice(0, 10) });
  const { data: positionsRaw } = useLiveData(() => AmbarAPI.endpoints.positions(), [], []);
  const { data: depsRaw } = useLiveData(() => AmbarAPI.endpoints.departments(), [], []);
  const positions = AmbarAPI.listFrom(positionsRaw);
  const departments = AmbarAPI.listFrom(depsRaw);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const submit = async () => {
    const missing = ["identification", "full_name", "position", "department", "hire_date"].filter(k => !String(payload[k] || "").trim());
    if (missing.length) {
      toast(`Faltan campos obligatorios: ${missing.join(", ")}.`, { tone: "danger", title: "Empleado incompleto" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/hr/employees", { ...payload, hire_date: new Date(payload.hire_date).toISOString() });
      toast("Empleado creado en RRHH.", { tone: "ok", title: "Empleado creado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el empleado.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Nuevo empleado" sub="RRHH crea la persona laboral; el acceso al sistema se gestiona desde Seguridad." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear empleado</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Identificación" required><input inputMode="numeric" maxLength={12} value={payload.identification} onChange={e => setField("identification", e.target.value.replace(/\D/g, ""))} placeholder="1234567890" /></Field>
        <Field label="Código empleado" help="Opcional. Si lo dejas vacío AMBAR lo genera."><input maxLength={40} value={payload.employee_code} onChange={e => setField("employee_code", e.target.value)} placeholder="Automático" /></Field>
        <Field label="Nombre completo" required><input maxLength={180} value={payload.full_name} onChange={e => setField("full_name", e.target.value.replace(/[0-9]/g, ""))} placeholder="Nombre y apellidos" /></Field>
        <Field label="Fecha de ingreso" required><input type="date" value={payload.hire_date} onChange={e => setField("hire_date", e.target.value)} /></Field>
        <Field label="Cargo" required><select value={payload.position} onChange={e => setField("position", e.target.value)}><option value="">Seleccionar cargo</option>{positions.map(p => <option key={p.idPosition || p.id || p.name} value={p.name || p.position_name}>{p.name || p.position_name}</option>)}</select></Field>
        <Field label="Dependencia" required><select value={payload.department} onChange={e => setField("department", e.target.value)}><option value="">Seleccionar dependencia</option>{departments.map(d => <option key={d.idDepartment || d.id || d.name} value={d.name || d.department_name}>{d.name || d.department_name}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function PositionModal({ onClose, onCreated, departments }) {
  const toast = useToast();
  const [payload, setPayload] = hrS({ position_code: "", name: "", level: "operativo", department: "", description: "", required_documents: "hoja_vida\ncontrato_firmado\nexamen_ingreso", suggested_permissions: "" });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const submit = async () => {
    if (!payload.name.trim() || !payload.department.trim()) {
      toast("Nombre y dependencia son obligatorios. El código lo puede generar AMBAR.", { tone: "danger", title: "Cargo incompleto" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/hr/positions", {
        ...payload,
        required_documents: payload.required_documents.split("\n").map((item) => item.trim()).filter(Boolean),
        suggested_permissions: payload.suggested_permissions.split("\n").map((item) => item.trim()).filter(Boolean),
      });
      toast("Perfil de cargo creado.", { tone: "ok", title: "Cargo creado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el cargo.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Nuevo perfil de cargo" sub="Los cargos alimentan usuarios, empleados y checklist documental." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear cargo</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" help="Opcional. Si lo dejas vacío AMBAR lo genera."><input maxLength={40} value={payload.position_code} onChange={e => setField("position_code", e.target.value)} placeholder="Automático" /></Field>
        <Field label="Nombre" required><input maxLength={120} value={payload.name} onChange={e => setField("name", e.target.value)} placeholder="Analista documental" /></Field>
        <Field label="Nivel"><select value={payload.level} onChange={e => setField("level", e.target.value)}>{["operativo", "tecnico", "profesional", "coordinacion", "direccion"].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Dependencia" required><select value={payload.department} onChange={e => setField("department", e.target.value)}><option value="">Seleccionar dependencia</option>{departments.map(d => <option key={d.idDepartment || d.id || d.name} value={d.name || d.department_name}>{d.name || d.department_name}</option>)}</select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripción"><textarea maxLength={500} value={payload.description} onChange={e => setField("description", e.target.value)} /></Field></div>
        <Field label="Documentos obligatorios" help="Uno por línea"><textarea value={payload.required_documents} onChange={e => setField("required_documents", e.target.value)} /></Field>
        <Field label="Permisos sugeridos" help="Uno por línea"><textarea value={payload.suggested_permissions} onChange={e => setField("suggested_permissions", e.target.value)} placeholder={"document.read\nhr.view"} /></Field>
      </div>
    </Modal>
  );
}

function DepartmentModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = hrS({ department_code: "", name: "", responsible_identification: "" });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const submit = async () => {
    if (!payload.name.trim()) {
      toast("El nombre es obligatorio. El código lo puede generar AMBAR.", { tone: "danger", title: "Dependencia incompleta" });
      return;
    }
    try {
      const body = { ...payload, responsible_identification: payload.responsible_identification || null };
      const created = await AmbarAPI.post("/hr/departments", body);
      toast("Dependencia creada.", { tone: "ok", title: "Dependencia creada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la dependencia.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Nueva dependencia" sub="La dependencia organiza cargos y expedientes laborales." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear dependencia</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" help="Opcional. Si lo dejas vacío AMBAR lo genera."><input maxLength={40} value={payload.department_code} onChange={e => setField("department_code", e.target.value)} placeholder="Automático" /></Field>
        <Field label="Nombre" required><input maxLength={120} value={payload.name} onChange={e => setField("name", e.target.value)} placeholder="Talento Humano" /></Field>
        <Field label="Responsable"><input inputMode="numeric" maxLength={12} value={payload.responsible_identification} onChange={e => setField("responsible_identification", e.target.value.replace(/\D/g, ""))} placeholder="Identificación" /></Field>
      </div>
    </Modal>
  );
}

function HRPage({ user, navigate }) {
  const [tab, setTab] = hrS("employees");
  const [q, setQ] = hrS("");
  const [sel, setSel] = hrS(null);
  const [modal, setModal] = hrS("");
  const canManage = can(user, ["hr.manage"]);
  const liveEmployees = window.useLiveData(() => window.AmbarAPI.endpoints.employees().then(items => items.map(normalizeEmployee)), [], []);
  const livePositions = window.useLiveData(() => window.AmbarAPI.endpoints.positions().then(window.AmbarAPI.listFrom), [], []);
  const liveDepartments = window.useLiveData(() => window.AmbarAPI.endpoints.departments().then(window.AmbarAPI.listFrom), [], []);
  const liveContracts = window.useLiveData(() => window.AmbarAPI.endpoints.expiringContracts().then(window.AmbarAPI.listFrom), [], []);
  const employees = liveEmployees.data;
  const rows = employees.filter(e => !q || (e.name + e.pos + e.area).toLowerCase().includes(q.toLowerCase()));
  const exportRows = () => {
    const byTab = tab === "positions" ? livePositions.data : tab === "departments" ? liveDepartments.data : tab === "contracts" ? liveContracts.data : employees;
    downloadCSV(`rrhh-${tab}`, byTab);
  };

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano</div><h1>Recursos Humanos</h1><p className="lead">Administra el ciclo de vida de tus colaboradores: datos, contratos, expediente documental, exámenes médicos y novedades, todo conectado al archivo.</p></div><div className="page-actions">{canManage && <><Button variant="ghost" icon="download" onClick={exportRows}>Exportar</Button><Button icon="user-plus" onClick={() => setModal("employee")}>Nuevo empleado</Button></>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Empleados activos" value={employees.filter(e => String(e.state).toLowerCase().includes("active") || String(e.state).toLowerCase().includes("activo")).length} icon="users" tone="brand" accent />
        <Metric label="Contratos por vencer" value={liveContracts.data.length} icon="file-clock" tone="danger" accent foot="próximos 30 días" />
        <Metric label="Expedientes incompletos" value={employees.filter(e => (e.compliance || 0) < 100).length} icon="folder-kanban" tone="warn" accent />
        <Metric label="Cargos configurados" value={livePositions.data.length} icon="briefcase" tone="ok" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "employees", label: "Empleados", icon: "users" }, { key: "positions", label: "Perfiles de cargo", icon: "briefcase" }, { key: "contracts", label: "Contratos", icon: "file-text" }, { key: "departments", label: "Dependencias", icon: "building" }]} />
      {tab === "employees" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}><div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar empleado por nombre, cargo o area..." /></div></div>
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Cargo</th><th>Área</th><th>Contrato</th><th>Ingreso</th><th>Expediente</th><th>Estado</th><th></th></tr></thead><tbody>
            {rows.map(e => (<tr key={e.id} className="clickable" onClick={() => setSel(e)}><td><div className="t-avatar"><Avatar name={e.name} color={e.color} /><div><div className="cell-strong">{e.name}</div><small className="muted mono">{e.id}</small></div></div></td><td>{e.pos}</td><td><span className="tag-soft">{e.area}</span></td><td>{e.contract}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{e.start}</td><td style={{ minWidth: 120 }}><Meter value={e.compliance} tone={e.compliance >= 90 ? "ok" : e.compliance >= 70 ? "warn" : "danger"} showLabel /></td><td><Badge tone={EMP_STATE[e.state] || "neutral"} dot>{e.state}</Badge></td><td onClick={ev => ev.stopPropagation()}><Button variant="subtle" size="sm" icon="chevron-right" onClick={() => setSel(e)} /></td></tr>))}
          </tbody></table></div>
        </Card>
      )}
      {tab === "positions" && (
        <div className="grid cols-3 stagger">
          {livePositions.data.map((p, i) => { const required = (p.required_documents && p.required_documents.items) || []; return (<Card key={p.idPosition || p.id || p.name} interactive style={{ "--i": i }}>
            <div className="row between" style={{ marginBottom: "var(--s3)" }}><span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name="briefcase" size={18} /></span><Badge tone="outline">{p.count || 0} ocupados</Badge></div>
            <h3 style={{ fontSize: "var(--fs-md)" }}>{p.name || p.position_name}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{p.department_name || p.department || "Sin dependencia"}</p>
            <div className="divider" /><div className="dl"><dt>Nivel</dt><dd>{p.level || "-"}</dd><dt>Documentos</dt><dd>{required.length}</dd><dt>Estado</dt><dd>{p.status || "active"}</dd></div>
          </Card>); })}
          {canManage && <Card interactive onClick={() => setModal("position")} className="col center" style={{ justifyContent: "center", borderStyle: "dashed", minHeight: 200, color: "var(--muted)" }}><Icon name="plus" size={28} /><b style={{ marginTop: 8 }}>Nuevo perfil de cargo</b></Card>}
        </div>
      )}
      {tab === "contracts" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>
          {liveContracts.data.map(c => { const employee = employees.find(e => e.id === c.ps1010Identification || e.id === c.identification); const employeeName = employee?.name || c.employee_name || c.ps1010Identification || "Empleado"; return <tr key={c.idContract || c.id || `${employeeName}-${c.start_date}`}><td><div className="t-avatar"><Avatar size="sm" name={employeeName} color={employee?.color || "var(--viz-violet)"} />{employeeName}</div></td><td><Badge tone="info">{c.contract_type || c.type || "Contrato"}</Badge></td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{c.start_date ? String(c.start_date).slice(0, 10) : "-"}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--warn)" }}>{c.end_date ? String(c.end_date).slice(0, 10) : "-"}</td><td><Badge tone="warning" dot>{c.status || "Por vencer"}</Badge></td></tr>; })}
          {liveContracts.data.length === 0 && <tr><td colSpan="5"><Empty icon="file-clock" title="Sin contratos por vencer">No hay contratos próximos a vencer en la base de datos.</Empty></td></tr>}
        </tbody></table></div></Card>
      )}
      {tab === "departments" && (
        <div className="col gap4">
          {canManage && <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-sm)" }}>Dependencias laborales reales</span><Button icon="plus" onClick={() => setModal("department")}>Nueva dependencia</Button></div>}
          <div className="grid cols-3 stagger">
            {liveDepartments.data.length === 0 && <Card><Empty icon="building" title="Sin dependencias">No hay dependencias creadas en RRHH.</Empty></Card>}
            {liveDepartments.data.map((d, i) => { const name = d.name || d.department_name; const c = employees.filter(e => e.area === name).length; return <Card key={d.idDepartment || d.id || name} interactive style={{ "--i": i }}><div className="row between"><div className="row gap2"><Icon name="building" size={18} style={{ color: "var(--brand)" }} /><b>{name}</b></div><Badge tone="brand">{c}</Badge></div><div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 6 }}>Responsable: {d.responsible_name || d.responsible || "Sin asignar"}</div></Card>; })}
          </div>
        </div>
      )}
      {sel && <EmployeeProfile emp={sel} onClose={() => setSel(null)} navigate={navigate} />}
      {modal === "employee" && <EmployeeModal onClose={() => setModal("")} onCreated={(created) => liveEmployees.setData(current => [normalizeEmployee(created, 0), ...(current || [])])} />}
      {modal === "position" && <PositionModal departments={liveDepartments.data} onClose={() => setModal("")} onCreated={(created) => livePositions.setData(current => [created, ...(current || [])])} />}
      {modal === "department" && <DepartmentModal onClose={() => setModal("")} onCreated={(created) => liveDepartments.setData(current => [created, ...(current || [])])} />}
    </>
  );
}

window.HRPage = HRPage;
