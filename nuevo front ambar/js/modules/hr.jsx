/* ============================================================
   AMBAR — Talento Humano: Empleados, Cargos, Contratos
   ============================================================ */
const { useState: hrS } = React;

const EMPLOYEES = [
  { id: "1.144.082.001", name: "Carlos Daza", pos: "Coordinador de Operaciones", area: "Operaciones", state: "Activo", contract: "Indefinido", start: "2021-03-01", compliance: 90, color: "var(--viz-teal)" },
  { id: "1.144.082.002", name: "Mariana Ruiz", pos: "Analista Comercial", area: "Comercial", state: "Activo", contract: "Indefinido", start: "2026-06-01", compliance: 62, color: "var(--viz-rose)" },
  { id: "1.144.082.003", name: "Juan Pérez", pos: "Auxiliar de Bodega", area: "Operaciones", state: "Activo", contract: "Fijo", start: "2024-08-15", compliance: 86, color: "var(--viz-amber)" },
  { id: "1.144.082.004", name: "Sara López", pos: "Desarrolladora Full Stack", area: "TI", state: "Activo", contract: "Indefinido", start: "2025-01-20", compliance: 100, color: "var(--viz-indigo)" },
  { id: "1.144.082.005", name: "Pedro Gómez", pos: "Contador", area: "Financiera", state: "Vacaciones", contract: "Indefinido", start: "2019-11-04", compliance: 94, color: "var(--viz-violet)" },
  { id: "1.144.082.006", name: "Lucía Marín", pos: "Abogada Senior", area: "Jurídica", state: "Activo", contract: "Indefinido", start: "2022-07-12", compliance: 78, color: "var(--viz-sky)" },
  { id: "1.144.082.007", name: "Diego Torres", pos: "Mensajero", area: "Operaciones", state: "Incapacidad", contract: "Fijo", start: "2023-02-28", compliance: 88, color: "var(--viz-green)" },
  { id: "1.144.082.008", name: "Andrea Niño", pos: "Jefe de Compras", area: "Compras", state: "Activo", contract: "Indefinido", start: "2020-05-18", compliance: 96, color: "var(--viz-gold)" },
];
const EMP_STATE = { Activo: "success", Vacaciones: "info", Incapacidad: "warning", Retirado: "neutral" };

const POSITIONS = [
  { name: "Desarrollador Full Stack", area: "TI", count: 4, exp: "3+ años", edu: "Ing. Sistemas" },
  { name: "Analista Comercial", area: "Comercial", count: 6, exp: "2+ años", edu: "Admin / Mercadeo" },
  { name: "Coordinador de Operaciones", area: "Operaciones", count: 2, exp: "5+ años", edu: "Ing. Industrial" },
  { name: "Abogado Senior", area: "Jurídica", count: 3, exp: "4+ años", edu: "Derecho" },
  { name: "Contador", area: "Financiera", count: 2, exp: "3+ años", edu: "Contaduría" },
];

function EmployeeProfile({ emp, onClose, navigate }) {
  const [tab, setTab] = hrS("info");
  const tabs = [{ key: "info", label: "Información", icon: "user" }, { key: "contracts", label: "Contratos", icon: "file-text" }, { key: "expedient", label: "Expediente", icon: "folder-kanban" }, { key: "medical", label: "Exámenes médicos", icon: "stethoscope" }, { key: "novelty", label: "Novedades", icon: "flag" }];
  return (
    <Drawer wide title={emp.name} sub={emp.pos} onClose={onClose} headExtra={<Badge tone={EMP_STATE[emp.state]} dot>{emp.state}</Badge>}>
      <div className="profile-head" style={{ padding: 0, marginBottom: "var(--s5)" }}>
        <span className="avatar xl" style={{ background: emp.color }}>{window.initialsOf(emp.name)}</span>
        <div className="ph-meta">
          <h2>{emp.name}</h2>
          <p className="muted">{emp.pos} · {emp.area}</p>
          <div className="row gap2" style={{ marginTop: 8 }}><Badge tone="brand" icon="hash">{emp.id}</Badge><Badge tone="outline">{emp.contract}</Badge><Badge tone="outline">Desde {emp.start}</Badge></div>
        </div>
        <div className="col center"><Gauge value={emp.compliance} label="Expediente" tone={emp.compliance >= 90 ? "var(--ok)" : "var(--warn)"} /></div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "info" && (<div className="grid cols-2" style={{ gap: "var(--s4)" }}>{[["Cédula", emp.id], ["Cargo", emp.pos], ["Área / Dependencia", emp.area], ["Tipo de contrato", emp.contract], ["Fecha de ingreso", emp.start], ["Estado", emp.state], ["EPS", "Sura"], ["Fondo de pensión", "Porvenir"], ["Jefe inmediato", "Andrés Gómez"], ["Salario", "$ 3.200.000"]].map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>)}
      {tab === "contracts" && (<div className="timeline">{[["file-check", "Contrato " + emp.contract, "Vigente desde " + emp.start, "ok"], ["file-text", "Otrosí — cambio de cargo", "2024-01-15", "brand"], ["file-text", "Contrato inicial a término fijo", "2021-03-01", ""]].map(([ic, t, m, tn], i) => <div key={i} className={`tl-item ${tn}`}><div className="tl-dot"><Icon name={ic} size={13} /></div><div className="tl-body"><div className="tl-title">{t}</div><div className="tl-meta">{m}</div></div></div>)}</div>)}
      {tab === "expedient" && (<><div className="page-intro" style={{ marginBottom: "var(--s4)" }}><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>Expediente laboral vinculado</h4><p>Todos los documentos del empleado viven en su expediente del módulo de archivo.</p></div></div><div className="col gap2">{["Hoja de vida.pdf", "Contrato firmado.pdf", "Certificaciones.zip", "Cédula.jpg"].map((f, i) => { const k = f.split(".")[1]; const [c, lbl] = FILE_KINDS[k] || FILE_KINDS.pdf; return <div key={f} className="list-row"><span className="filebadge"><span className="fb-ico" style={{ background: c }}>{lbl}</span></span><span className="grow" style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{f}</span><Badge tone="success" dot>Cargado</Badge></div>; })}</div><Button variant="ghost" className="btn-block" icon="folder-kanban" style={{ marginTop: "var(--s3)" }} onClick={() => navigate && navigate("expedients")}>Abrir expediente completo</Button></>)}
      {tab === "medical" && (<div className="col gap2">{[["Ingreso", "Apto", "2021-03-01", "success"], ["Periódico", "Apto", "2025-03-10", "success"], ["Periódico", "Próximo", "2026-03-10", "warning"]].map(([t, r, d, tn], i) => <div key={i} className="list-row"><Icon name="stethoscope" size={18} style={{ color: "var(--brand)" }} /><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Examen de {t}</div><small className="muted">{d}</small></div><Badge tone={tn}>{r}</Badge></div>)}<Button variant="ghost" className="btn-block" icon="stethoscope" style={{ marginTop: 6 }} onClick={() => navigate && navigate("medical")}>Ver módulo SST</Button></div>)}
      {tab === "novelty" && (<div className="timeline">{[["award", "Felicitación por desempeño", "2026-04-12", "ok"], ["flag", "Cambio de cargo a Coordinador", "2024-01-15", "brand"], ["calendar", "Licencia no remunerada (3 días)", "2023-09-01", ""]].map(([ic, t, m, tn], i) => <div key={i} className={`tl-item ${tn}`}><div className="tl-dot"><Icon name={ic} size={13} /></div><div className="tl-body"><div className="tl-title">{t}</div><div className="tl-meta">{m}</div></div></div>)}</div>)}
    </Drawer>
  );
}

function HRPage({ user, navigate }) {
  const [tab, setTab] = hrS("employees");
  const [q, setQ] = hrS("");
  const [sel, setSel] = hrS(null);
  const canManage = can(user, ["hr.manage"]);
  const rows = EMPLOYEES.filter(e => !q || (e.name + e.pos + e.area).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano</div><h1>Recursos Humanos</h1><p className="lead">Administra el ciclo de vida de tus colaboradores: datos, contratos, expediente documental, exámenes médicos y novedades — todo conectado al archivo.</p></div><div className="page-actions">{canManage && <><Button variant="ghost" icon="download">Exportar</Button><Button icon="user-plus">Nuevo empleado</Button></>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Empleados activos" value={248} icon="users" tone="brand" accent trend="+4" trendDir="up" />
        <Metric label="Contratos por vencer" value={7} icon="file-clock" tone="danger" accent foot="próximos 30 días" />
        <Metric label="Expedientes incompletos" value={18} icon="folder-kanban" tone="warn" accent />
        <Metric label="Rotación (año)" value={6.4} suffix="%" decimals={1} icon="trending-down" tone="ok" accent trendDir="down" trend="-1.2pts" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "employees", label: "Empleados", icon: "users" }, { key: "positions", label: "Perfiles de cargo", icon: "briefcase" }, { key: "contracts", label: "Contratos", icon: "file-text" }, { key: "departments", label: "Dependencias", icon: "building" }]} />
      {tab === "employees" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}><div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar empleado por nombre, cargo o área…" /></div></div>
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Cargo</th><th>Área</th><th>Contrato</th><th>Ingreso</th><th>Expediente</th><th>Estado</th><th></th></tr></thead><tbody>
            {rows.map(e => (<tr key={e.id} className="clickable" onClick={() => setSel(e)}><td><div className="t-avatar"><Avatar name={e.name} color={e.color} /><div><div className="cell-strong">{e.name}</div><small className="muted mono">{e.id}</small></div></div></td><td>{e.pos}</td><td><span className="tag-soft">{e.area}</span></td><td>{e.contract}</td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{e.start}</td><td style={{ minWidth: 120 }}><Meter value={e.compliance} tone={e.compliance >= 90 ? "ok" : e.compliance >= 70 ? "warn" : "danger"} showLabel /></td><td><Badge tone={EMP_STATE[e.state]} dot>{e.state}</Badge></td><td onClick={ev => ev.stopPropagation()}><Button variant="subtle" size="sm" icon="chevron-right" onClick={() => setSel(e)} /></td></tr>))}
          </tbody></table></div>
        </Card>
      )}
      {tab === "positions" && (
        <div className="grid cols-3 stagger">
          {POSITIONS.map((p, i) => (<Card key={p.name} interactive style={{ "--i": i }}>
            <div className="row between" style={{ marginBottom: "var(--s3)" }}><span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name="briefcase" size={18} /></span><Badge tone="outline">{p.count} ocupados</Badge></div>
            <h3 style={{ fontSize: "var(--fs-md)" }}>{p.name}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{p.area}</p>
            <div className="divider" /><div className="dl"><dt>Experiencia</dt><dd>{p.exp}</dd><dt>Formación</dt><dd>{p.edu}</dd></div>
            <div className="row wrap gap2" style={{ marginTop: "var(--s3)" }}>{["Liderazgo", "Comunicación", "Análisis"].map(c => <span key={c} className="tag-soft">{c}</span>)}</div>
          </Card>))}
          {canManage && <Card interactive className="col center" style={{ justifyContent: "center", borderStyle: "dashed", minHeight: 200, color: "var(--muted)" }}><Icon name="plus" size={28} /><b style={{ marginTop: 8 }}>Nuevo perfil de cargo</b></Card>}
        </div>
      )}
      {tab === "contracts" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Empleado</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>
          {EMPLOYEES.map(e => { const fin = e.contract === "Fijo" ? "2026-08-15" : "Indefinido"; const soon = e.contract === "Fijo"; return <tr key={e.id}><td><div className="t-avatar"><Avatar size="sm" name={e.name} color={e.color} />{e.name}</div></td><td><Badge tone={e.contract === "Indefinido" ? "success" : "info"}>{e.contract}</Badge></td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{e.start}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: soon ? "var(--warn)" : "var(--muted)" }}>{fin}</td><td>{soon ? <Badge tone="warning" dot>Por vencer</Badge> : <Badge tone="success" dot>Vigente</Badge>}</td></tr>; })}
        </tbody></table></div></Card>
      )}
      {tab === "departments" && (
        <div className="grid cols-3 stagger">{window.AREAS.map((a, i) => { const c = EMPLOYEES.filter(e => e.area === a).length + (i * 7 % 40); return <Card key={a} interactive style={{ "--i": i }}><div className="row between"><div className="row gap2"><Icon name="building" size={18} style={{ color: "var(--brand)" }} /><b>{a}</b></div><Badge tone="brand">{c}</Badge></div><div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 6 }}>Jefe: {["Andrés Gómez", "Ricardo Salas", "Lucía Marín"][i % 3]}</div></Card>; })}</div>
      )}
      {sel && <EmployeeProfile emp={sel} onClose={() => setSel(null)} navigate={navigate} />}
    </>
  );
}

window.HRPage = HRPage;
