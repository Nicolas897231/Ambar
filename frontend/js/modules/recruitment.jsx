const { useState: rcS } = React;

const PIPE_COLS = [
  { key: "postulado", name: "Postulado", color: "var(--muted)" },
  { key: "entrevista", name: "Entrevista", color: "var(--viz-amber)" },
  { key: "prueba", name: "Prueba tecnica", color: "var(--viz-violet)" },
  { key: "aprobado", name: "Aprobado", color: "var(--ok)" },
  { key: "contratado", name: "Contratado", color: "var(--viz-indigo)" },
  { key: "rechazado", name: "Descartado", color: "var(--danger)" },
];

function normalizeCandidate(c, i) {
  const status = String(c.status || c.stage || "postulado").toLowerCase();
  return {
    id: c.idCandidate || c.id || i,
    name: c.full_name || c.name || "Candidato",
    role: c.vacancy_title || c.position_name || c.applied_position || "Vacante",
    city: c.city || "-",
    exp: c.experience || "-",
    edu: c.education || "-",
    score: c.score || c.match_score || 0,
    col: PIPE_COLS.find(p => status.includes(p.key))?.key || "postulado",
    color: ["var(--viz-sky)", "var(--viz-amber)", "var(--viz-violet)", "var(--viz-teal)"][i % 4]
  };
}

function CandidateCard({ c, onClick }) {
  return (
    <div className="kcard" onClick={onClick}>
      <div className="t-avatar"><Avatar size="sm" name={c.name} color={c.color} /><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{c.name}</div><small className="muted">{c.role}</small></div></div>
      <div className="pipe-card-tags"><span className="tag-soft"><Icon name="map-pin" size={10} />{c.city}</span><span className="tag-soft">{c.exp}</span></div>
      <div className="row between" style={{ marginTop: 8 }}><span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>Afinidad</span><b className="mono" style={{ fontSize: "var(--fs-2xs)" }}>{c.score}%</b></div>
    </div>
  );
}

function RecruitmentPage({ user, navigate }) {
  const [tab, setTab] = rcS("pipeline");
  const [sel, setSel] = rcS(null);
  const [q, setQ] = rcS("");
  const { data: rawCandidates } = useLiveData(() => AmbarAPI.endpoints.candidates(), [], []);
  const { data: rawVacancies } = useLiveData(() => AmbarAPI.endpoints.vacancies(), [], []);
  const candidates = AmbarAPI.listFrom(rawCandidates).map(normalizeCandidate);
  const vacancies = AmbarAPI.listFrom(rawVacancies);
  const talents = candidates.filter(c => !q || (c.name + c.role + c.city).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Talento Humano</div><h1>Reclutamiento y Seleccion</h1><p className="lead">Vacantes y candidatos reales desde RRHH. El expediente candidato evoluciona a laboral al contratar.</p></div><div className="page-actions"><Button variant="ghost" icon="external-link" onClick={() => navigate("empleo")}>Ver portal publico</Button>{can(user, ["recruit.manage"]) && <Button icon="plus">Nueva vacante</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Vacantes activas" value={vacancies.length} icon="briefcase" tone="brand" accent />
        <Metric label="Candidatos en proceso" value={candidates.filter(c => !["contratado", "rechazado"].includes(c.col)).length} icon="users" tone="info" accent />
        <Metric label="Contratados" value={candidates.filter(c => c.col === "contratado").length} icon="user-check" tone="ok" accent />
        <Metric label="Descartados" value={candidates.filter(c => c.col === "rechazado").length} icon="user-x" tone="danger" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "pipeline", label: "Pipeline de seleccion", icon: "workflow" }, { key: "vacancies", label: "Vacantes", icon: "briefcase" }, { key: "talents", label: "Base de talentos", icon: "database" }]} />
      {tab === "pipeline" && (
        <div className="kanban an-rise">
          {PIPE_COLS.map(col => { const items = candidates.filter(c => c.col === col.key); return (
            <div key={col.key} className="kcol"><div className="kcol-head"><span className="k-tag" style={{ background: col.color }} /><span className="k-name">{col.name}</span><span className="k-count">{items.length}</span></div>
              <div className="kcol-body">{items.map(c => <CandidateCard key={c.id} c={c} onClick={() => setSel(c)} />)}{items.length === 0 && <div className="muted" style={{ textAlign: "center", padding: "var(--s4)", fontSize: "var(--fs-xs)" }}>Sin candidatos</div>}</div>
            </div>); })}
        </div>
      )}
      {tab === "vacancies" && (
        <div className="grid cols-2 stagger">
          {vacancies.length === 0 && <Card><Empty icon="briefcase" title="Sin vacantes">No hay vacantes registradas.</Empty></Card>}
          {vacancies.map((v, i) => (<Card key={v.idVacancy || v.id || i} interactive style={{ "--i": i }} className="vacancy-card">
            <div className="row between"><div><h3 style={{ fontSize: "var(--fs-md)" }}>{v.title || v.name}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{v.department_name || v.area || "-"} · {v.contract_type || v.type || "-"}</p></div><Badge tone={v.status === "active" || v.status === "Activa" ? "success" : "warning"} dot>{v.status || "active"}</Badge></div>
          </Card>))}
        </div>
      )}
      {tab === "talents" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)", gap: "var(--s3)" }}>
            <div className="search-box grow"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, profesion o ciudad..." /></div>
          </div>
          {talents.length === 0 ? <Empty icon="database" title="Sin candidatos">No hay candidatos reales para estos filtros.</Empty> : (
            <div className="table-scroll"><table className="tbl"><thead><tr><th>Candidato</th><th>Aspira a</th><th>Ciudad</th><th>Experiencia</th><th>Formacion</th><th>Afinidad</th></tr></thead><tbody>
              {talents.map(c => (<tr key={c.id} className="clickable" onClick={() => setSel(c)}><td><div className="t-avatar"><Avatar size="sm" name={c.name} color={c.color} /><span className="cell-strong">{c.name}</span></div></td><td>{c.role}</td><td>{c.city}</td><td>{c.exp}</td><td className="muted">{c.edu}</td><td>{c.score}%</td></tr>))}
            </tbody></table></div>
          )}
        </Card>
      )}
      {sel && (
        <Drawer title={sel.name} sub={`Aspira a: ${sel.role}`} onClose={() => setSel(null)} headExtra={<Badge tone="brand">Afinidad {sel.score}%</Badge>}>
          <div className="profile-head" style={{ padding: 0, marginBottom: "var(--s4)" }}><span className="avatar xl" style={{ background: sel.color }}>{window.initialsOf(sel.name)}</span><div className="ph-meta"><h2 style={{ fontSize: "var(--fs-xl)" }}>{sel.name}</h2><p className="muted">{sel.role} · {sel.city}</p></div></div>
          <div className="grid cols-2" style={{ gap: "var(--s4)" }}>{[["Experiencia", sel.exp], ["Formacion", sel.edu], ["Ciudad", sel.city], ["Etapa actual", PIPE_COLS.find(p => p.key === sel.col)?.name]].map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
          <Empty icon="folder-kanban" title="Documentos bajo demanda">Los documentos reales del candidato se consultan desde su expediente documental.</Empty>
        </Drawer>
      )}
    </>
  );
}

window.RecruitmentPage = RecruitmentPage;
