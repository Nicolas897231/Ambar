/* ============================================================
   AMBAR — Talento Humano: Reclutamiento y Selección
   ============================================================ */
const { useState: rcS } = React;

const PIPE_COLS = [
  { key: "post", name: "Postulado", color: "var(--muted)" },
  { key: "pre", name: "Preseleccionado", color: "var(--viz-sky)" },
  { key: "ent", name: "Entrevista", color: "var(--viz-amber)" },
  { key: "test", name: "Prueba técnica", color: "var(--viz-violet)" },
  { key: "val", name: "Validación", color: "var(--viz-indigo)" },
  { key: "hire", name: "Contratado", color: "var(--ok)" },
];
const CANDIDATES = [
  { name: "Sara López", role: "Full Stack", col: "test", city: "Cali", exp: "4 años", edu: "Ing. Sistemas", color: "var(--viz-indigo)", score: 92 },
  { name: "Mateo Ríos", role: "Full Stack", col: "ent", city: "Bogotá", exp: "3 años", edu: "Ing. Sistemas", color: "var(--viz-teal)", score: 84 },
  { name: "Valentina Cruz", role: "Comercial", col: "pre", city: "Medellín", exp: "2 años", edu: "Mercadeo", color: "var(--viz-rose)", score: 78 },
  { name: "Andrés Pinto", role: "Full Stack", col: "post", city: "Cali", exp: "5 años", edu: "Ing. Sistemas", color: "var(--viz-amber)", score: 88 },
  { name: "Laura Quintero", role: "Comercial", col: "post", city: "Cali", exp: "1 año", edu: "Admin", color: "var(--viz-violet)", score: 71 },
  { name: "Daniel Soto", role: "Contador", col: "val", city: "Cali", exp: "6 años", edu: "Contaduría", color: "var(--viz-green)", score: 90 },
  { name: "Camila Vega", role: "Full Stack", col: "ent", city: "Cali", exp: "2 años", edu: "Ing. Sistemas", color: "var(--viz-sky)", score: 80 },
  { name: "Julián Mora", role: "Comercial", col: "test", city: "Barranquilla", exp: "3 años", edu: "Mercadeo", color: "var(--viz-gold)", score: 82 },
];
const VACANCIES = [
  { title: "Desarrollador Full Stack", area: "TI", type: "Indefinido", cand: 5, state: "Activa", days: 12 },
  { title: "Analista Comercial", area: "Comercial", type: "Indefinido", cand: 3, state: "Activa", days: 8 },
  { title: "Contador Senior", area: "Financiera", type: "Indefinido", cand: 1, state: "Activa", days: 3 },
  { title: "Auxiliar de Bodega", area: "Operaciones", type: "Fijo", cand: 0, state: "Borrador", days: 0 },
];

function CandidateCard({ c, onClick }) {
  return (
    <div className="kcard" onClick={onClick}>
      <div className="t-avatar"><Avatar size="sm" name={c.name} color={c.color} /><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{c.name}</div><small className="muted">{c.role}</small></div></div>
      <div className="pipe-card-tags"><span className="tag-soft"><Icon name="map-pin" size={10} />{c.city}</span><span className="tag-soft">{c.exp}</span></div>
      <div className="row between" style={{ marginTop: 8 }}><span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>Afinidad</span><div className="row gap2"><div className="conf-bar" style={{ width: 44 }}><i style={{ width: c.score + "%", background: c.score >= 88 ? "var(--ok)" : c.score >= 78 ? "var(--warn)" : "var(--danger)" }} /></div><b className="mono" style={{ fontSize: "var(--fs-2xs)" }}>{c.score}</b></div></div>
    </div>
  );
}

function RecruitmentPage({ user, navigate }) {
  const [tab, setTab] = rcS("pipeline");
  const [sel, setSel] = rcS(null);
  const [q, setQ] = rcS("");
  const talents = CANDIDATES.filter(c => !q || (c.name + c.role + c.city).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano</div><h1>Reclutamiento y Selección</h1><p className="lead">Gestiona vacantes, candidatos y el pipeline de selección. Los perfiles quedan en la base de talentos para futuras oportunidades aunque no sean contratados.</p></div><div className="page-actions"><Button variant="ghost" icon="external-link" onClick={() => navigate("empleo")}>Ver portal público</Button>{can(user, ["recruit.manage"]) && <Button icon="plus">Nueva vacante</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Vacantes activas" value={6} icon="briefcase" tone="brand" accent trend="+2" trendDir="up" />
        <Metric label="Candidatos en proceso" value={84} icon="users" tone="info" accent trend="+19" trendDir="up" />
        <Metric label="Base de talentos" value={1240} icon="database" tone="brand" accent foot="perfiles disponibles" />
        <Metric label="Tiempo medio contratación" value={21} suffix=" d" icon="clock" tone="ok" accent trendDir="down" trend="-3d" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "pipeline", label: "Pipeline de selección", icon: "workflow" }, { key: "vacancies", label: "Vacantes", icon: "briefcase" }, { key: "talents", label: "Base de talentos", icon: "database" }]} />
      {tab === "pipeline" && (
        <div className="kanban an-rise">
          {PIPE_COLS.map(col => { const items = CANDIDATES.filter(c => c.col === col.key); return (
            <div key={col.key} className="kcol"><div className="kcol-head"><span className="k-tag" style={{ background: col.color }} /><span className="k-name">{col.name}</span><span className="k-count">{items.length}</span></div>
              <div className="kcol-body">{items.map(c => <CandidateCard key={c.name} c={c} onClick={() => setSel(c)} />)}{items.length === 0 && <div className="muted" style={{ textAlign: "center", padding: "var(--s4)", fontSize: "var(--fs-xs)" }}>—</div>}</div>
            </div>); })}
        </div>
      )}
      {tab === "vacancies" && (
        <div className="grid cols-2 stagger">
          {VACANCIES.map((v, i) => (<Card key={v.title} interactive style={{ "--i": i }} className="vacancy-card">
            <div className="row between"><div><h3 style={{ fontSize: "var(--fs-md)" }}>{v.title}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{v.area} · {v.type}</p></div><Badge tone={v.state === "Activa" ? "success" : "warning"} dot>{v.state}</Badge></div>
            <div className="row between" style={{ marginTop: "var(--s2)" }}><div className="row gap2"><Badge tone="brand" icon="users">{v.cand} candidatos</Badge>{v.days > 0 && <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Abierta hace {v.days} días</span>}</div><Button variant="ghost" size="sm" iconRight="arrow-right">Ver pipeline</Button></div>
          </Card>))}
        </div>
      )}
      {tab === "talents" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)", gap: "var(--s3)" }}>
            <div className="search-box grow"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, profesión o ciudad…" /></div>
            <div className="toolbar"><FilterChip label="Ciudad" icon="map-pin" /><FilterChip label="Profesión" icon="graduation-cap" /><FilterChip label="Experiencia" icon="briefcase" /></div>
          </div>
          <div className="table-scroll"><table className="tbl"><thead><tr><th>Candidato</th><th>Aspira a</th><th>Ciudad</th><th>Experiencia</th><th>Formación</th><th>Afinidad</th><th></th></tr></thead><tbody>
            {talents.map(c => (<tr key={c.name} className="clickable" onClick={() => setSel(c)}><td><div className="t-avatar"><Avatar size="sm" name={c.name} color={c.color} /><span className="cell-strong">{c.name}</span></div></td><td>{c.role}</td><td>{c.city}</td><td>{c.exp}</td><td className="muted">{c.edu}</td><td style={{ minWidth: 110 }}><Meter value={c.score} tone={c.score >= 88 ? "ok" : "warn"} showLabel /></td><td><Button variant="subtle" size="sm" icon="chevron-right" /></td></tr>))}
          </tbody></table></div>
        </Card>
      )}
      {sel && (
        <Drawer title={sel.name} sub={`Aspira a: ${sel.role}`} onClose={() => setSel(null)} headExtra={<Badge tone="brand">Afinidad {sel.score}%</Badge>}>
          <div className="profile-head" style={{ padding: 0, marginBottom: "var(--s4)" }}><span className="avatar xl" style={{ background: sel.color }}>{window.initialsOf(sel.name)}</span><div className="ph-meta"><h2 style={{ fontSize: "var(--fs-xl)" }}>{sel.name}</h2><p className="muted">{sel.role} · {sel.city}</p></div></div>
          <div className="grid cols-2" style={{ gap: "var(--s4)" }}>{[["Experiencia", sel.exp], ["Formación", sel.edu], ["Ciudad", sel.city], ["Etapa actual", PIPE_COLS.find(p => p.key === sel.col).name]].map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
          <div className="divider" />
          <CardHead title="Documentos del candidato" />
          <div className="col gap2">{["Hoja_de_vida.pdf", "Diploma.pdf", "Certificados.zip"].map(f => { const k = f.split(".")[1]; const [c, lbl] = FILE_KINDS[k] || FILE_KINDS.pdf; return <div key={f} className="list-row"><span className="filebadge"><span className="fb-ico" style={{ background: c }}>{lbl}</span></span><span className="grow" style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{f}</span><Button variant="subtle" size="sm" icon="eye" /></div>; })}</div>
          <div className="divider" />
          <CardHead title="Historial de selección" />
          <div className="timeline">{[["user-plus", "Postuló a la vacante", "2026-05-20", "ok"], ["check", "Preseleccionado", "2026-05-23", "brand"], ["user-check", "Entrevista RRHH — 4.2/5", "2026-05-27", "brand"], ["clock", "Prueba técnica pendiente", "—", ""]].map(([ic, t, m, tn], i) => <div key={i} className={`tl-item ${tn}`}><div className="tl-dot"><Icon name={ic} size={13} /></div><div className="tl-body"><div className="tl-title" style={{ fontSize: "var(--fs-sm)" }}>{t}</div><div className="tl-meta">{m}</div></div></div>)}</div>
          <div className="row gap2" style={{ marginTop: "var(--s4)" }}><Button className="grow" icon="arrow-right">Avanzar etapa</Button><Button variant="ghost" icon="user-check">Contratar</Button></div>
        </Drawer>
      )}
    </>
  );
}

window.RecruitmentPage = RecruitmentPage;
