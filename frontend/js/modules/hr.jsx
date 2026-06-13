/* ============================================================
   AMBAR â€” Talento Humano: Empleados, Cargos, Contratos
   ============================================================ */
const { useState: hrS } = React;

const EMP_STATE = { Activo: "success", Vacaciones: "info", Incapacidad: "warning", Retirado: "neutral" };

function EmployeeProfile({ emp, onClose, navigate }) {
  const [tab, setTab] = hrS("info");
  const tabs = [{ key: "info", label: "InformaciÃ³n", icon: "user" }, { key: "contracts", label: "Contratos", icon: "file-text" }, { key: "expedient", label: "Expediente", icon: "folder-kanban" }, { key: "medical", label: "ExÃ¡menes mÃ©dicos", icon: "stethoscope" }, { key: "novelty", label: "Novedades", icon: "flag" }];
  return (
    <Drawer wide title={emp.name} sub={emp.pos} onClose={onClose} headExtra={<Badge tone={EMP_STATE[emp.state]} dot>{emp.state}</Badge>}>
      <div className="profile-head" style={{ padding: 0, marginBottom: "var(--s5)" }}>
        <span className="avatar xl" style={{ background: emp.color }}>{window.initialsOf(emp.name)}</span>
        <div className="ph-meta">
          <h2>{emp.name}</h2>
          <p className="muted">{emp.pos} Â· {emp.area}</p>
          <div className="row gap2" style={{ marginTop: 8 }}><Badge tone="brand" icon="hash">{emp.id}</Badge><Badge tone="outline">{emp.contract}</Badge><Badge tone="outline">Desde {emp.start}</Badge></div>
        </div>
        <div className="col center"><Gauge value={emp.compliance} label="Expediente" tone={emp.compliance >= 90 ? "var(--ok)" : "var(--warn)"} /></div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "info" && (<div className="grid cols-2" style={{ gap: "var(--s4)" }}>{[["Identificacion", emp.id], ["Cargo", emp.pos], ["Area / Dependencia", emp.area], ["Tipo de contrato", emp.contract], ["Fecha de ingreso", emp.start], ["Estado", emp.state]].map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>)}
      {tab === "contracts" && <Empty icon="file-text" title="Contratos no cargados">Los contratos deben consultarse desde el endpoint de contratos laborales cuando exista informacion para este empleado.</Empty>}
      {tab === "expedient" && (<><div className="page-intro" style={{ marginBottom: "var(--s4)" }}><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>Expediente laboral vinculado</h4><p>Abre el modulo documental para ver documentos reales asociados al expediente.</p></div></div><Button variant="ghost" className="btn-block" icon="folder-kanban" onClick={() => navigate && navigate("expedients")}>Abrir expedientes</Button></>)}
      {tab === "medical" && (<div className="col gap2"><Empty icon="stethoscope" title="Sin examenes cargados">No se muestran examenes ficticios. Consulta SST para registros reales.</Empty><Button variant="ghost" className="btn-block" icon="stethoscope" onClick={() => navigate && navigate("medical")}>Ver modulo SST</Button></div>)}
      {tab === "novelty" && <Empty icon="history" title="Sin novedades">No hay novedades laborales registradas para este empleado.</Empty>}
    </Drawer>
  );
}

function HRPage({ user, navigate }) {
  const [tab, setTab] = hrS("employees");
  const [q, setQ] = hrS("");
  const [sel, setSel] = hrS(null);
  const canManage = can(user, ["hr.manage"]);
  const liveEmployees = window.useLiveData(
    () => window.AmbarAPI.endpoints.employees().then(items => items.map((item, i) => ({
      id: item.identification || item.employee_code || `EMP-${i + 1}`,
      name: item.full_name || item.name || item.employee_name || "Empleado",
      pos: item.position_name || item.position || item.job_title || "Cargo sin asignar",
      area: item.department_name || item.department || item.area || "Dependencia",
      state: item.status || "Activo",
      contract: item.contract_type || "Indefinido",
      start: item.hire_date ? String(item.hire_date).slice(0, 10) : item.start_date ? String(item.start_date).slice(0, 10) : "-",
      compliance: item.compliance_percent || item.document_compliance || 0,
      color: ["var(--viz-violet)", "var(--viz-amber)", "var(--viz-teal)", "var(--viz-rose)", "var(--viz-sky)"][i % 5]
    }))),
    [],
    []
  );
  const livePositions = window.useLiveData(() => window.AmbarAPI.endpoints.positions().then(window.AmbarAPI.listFrom), [], []);
  const liveDepartments = window.useLiveData(() => window.AmbarAPI.endpoints.departments().then(window.AmbarAPI.listFrom), [], []);
  const liveContracts = window.useLiveData(() => window.AmbarAPI.endpoints.expiringContracts().then(window.AmbarAPI.listFrom), [], []);
  const employees = liveEmployees.data;
  const rows = employees.filter(e => !q || (e.name + e.pos + e.area).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano</div><h1>Recursos Humanos</h1><p className="lead">Administra el ciclo de vida de tus colaboradores: datos, contratos, expediente documental, exÃ¡menes mÃ©dicos y novedades â€” todo conectado al archivo.</p></div><div className="page-actions">{canManage && <><Button variant="ghost" icon="download">Exportar</Button><Button icon="user-plus">Nuevo empleado</Button></>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Empleados activos" value={employees.filter(e => String(e.state).toLowerCase().includes("active") || String(e.state).toLowerCase().includes("activo")).length} icon="users" tone="brand" accent trend="+4" trendDir="up" />
        <Metric label="Contratos por vencer" value={liveContracts.data.length} icon="file-clock" tone="danger" accent foot="proximos 30 dias" />
        <Metric label="Expedientes incompletos" value={employees.filter(e => (e.compliance || 0) < 100).length} icon="folder-kanban" tone="warn" accent />
        <Metric label="Cargos configurados" value={livePositions.data.length} icon="briefcase" tone="ok" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "employees", label: "Empleados", icon: "users" }, { key: "positions", label: "Perfiles de cargo", icon: "briefcase" }, { key: "contracts", label: "Contratos", icon: "file-text" }, { key: "departments", label: "Dependencias", icon: "building" }]} />
      {tab === "employees" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}><div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar empleado por nombre, cargo o Ã¡reaâ€¦" /></div></div>
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Cargo</th><th>Ãrea</th><th>Contrato</th><th>Ingreso</th><th>Expediente</th><th>Estado</th><th></th></tr></thead><tbody>
            {rows.map(e => (<tr key={e.id} className="clickable" onClick={() => setSel(e)}><td><div className="t-avatar"><Avatar name={e.name} color={e.color} /><div><div className="cell-strong">{e.name}</div><small className="muted mono">{e.id}</small></div></div></td><td>{e.pos}</td><td><span className="tag-soft">{e.area}</span></td><td>{e.contract}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{e.start}</td><td style={{ minWidth: 120 }}><Meter value={e.compliance} tone={e.compliance >= 90 ? "ok" : e.compliance >= 70 ? "warn" : "danger"} showLabel /></td><td><Badge tone={EMP_STATE[e.state]} dot>{e.state}</Badge></td><td onClick={ev => ev.stopPropagation()}><Button variant="subtle" size="sm" icon="chevron-right" onClick={() => setSel(e)} /></td></tr>))}
          </tbody></table></div>
        </Card>
      )}
      {tab === "positions" && (
        <div className="grid cols-3 stagger">
          {livePositions.data.length === 0 && <Card><Empty icon="briefcase" title="Sin cargos">No hay cargos creados en RRHH.</Empty></Card>}
          {livePositions.data.map((p, i) => (<Card key={p.idPosition || p.id || p.name} interactive style={{ "--i": i }}>
            <div className="row between" style={{ marginBottom: "var(--s3)" }}><span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name="briefcase" size={18} /></span><Badge tone="outline">{p.count} ocupados</Badge></div>
            <h3 style={{ fontSize: "var(--fs-md)" }}>{p.name || p.position_name}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{p.department_name || p.area || "Sin dependencia"}</p>
            <div className="divider" /><div className="dl"><dt>Nivel</dt><dd>{p.level || "-"}</dd><dt>Estado</dt><dd>{p.status || "active"}</dd></div>
          </Card>))}
          {canManage && <Card interactive className="col center" style={{ justifyContent: "center", borderStyle: "dashed", minHeight: 200, color: "var(--muted)" }}><Icon name="plus" size={28} /><b style={{ marginTop: 8 }}>Nuevo perfil de cargo</b></Card>}
        </div>
      )}
      {tab === "contracts" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>
          {liveContracts.data.map(c => {
            const employee = employees.find(e => e.id === c.ps1010Identification || e.id === c.identification);
            const employeeName = employee?.name || c.employee_name || c.ps1010Identification || "Empleado";
            return <tr key={c.idContract || c.id || `${employeeName}-${c.start_date}`}><td><div className="t-avatar"><Avatar size="sm" name={employeeName} color={employee?.color || "var(--viz-violet)"} />{employeeName}</div></td><td><Badge tone="info">{c.contract_type || c.type || "Contrato"}</Badge></td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{c.start_date ? String(c.start_date).slice(0, 10) : "-"}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--warn)" }}>{c.end_date ? String(c.end_date).slice(0, 10) : "-"}</td><td><Badge tone="warning" dot>{c.status || "Por vencer"}</Badge></td></tr>;
          })}
          {liveContracts.data.length === 0 && <tr><td colSpan="5"><Empty icon="file-clock" title="Sin contratos por vencer">No hay contratos próximos a vencer en la base de datos.</Empty></td></tr>}
        </tbody></table></div></Card>
      )}
      {tab === "departments" && (
        <div className="grid cols-3 stagger">
          {liveDepartments.data.length === 0 && <Card><Empty icon="building" title="Sin dependencias">No hay dependencias creadas en RRHH.</Empty></Card>}
          {liveDepartments.data.map((d, i) => { const name = d.name || d.department_name; const c = employees.filter(e => e.area === name).length; return <Card key={d.idDepartment || d.id || name} interactive style={{ "--i": i }}><div className="row between"><div className="row gap2"><Icon name="building" size={18} style={{ color: "var(--brand)" }} /><b>{name}</b></div><Badge tone="brand">{c}</Badge></div><div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 6 }}>Responsable: {d.responsible_name || d.responsible || "Sin asignar"}</div></Card>; })}
        </div>
      )}
      {sel && <EmployeeProfile emp={sel} onClose={() => setSel(null)} navigate={navigate} />}
    </>
  );
}

window.HRPage = HRPage;
