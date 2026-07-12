const { useState: rcS } = React;

const PIPE_COLS = [
  { key: "postulado", name: "Postulado", color: "var(--muted)" },
  { key: "entrevista", name: "Entrevista", color: "var(--viz-amber)" },
  { key: "validacion", name: "Validación / prueba", color: "var(--viz-violet)" },
  { key: "aprobado", name: "Aprobado", color: "var(--ok)" },
  { key: "contratado", name: "Contratado", color: "var(--viz-indigo)" },
  { key: "rechazado", name: "Descartado", color: "var(--danger)" },
];

function normalizeCandidate(c, i) {
  const status = String(c.status || c.stage || "postulado").toLowerCase();
  return {
    id: c.idCandidate || c.id || i,
    name: c.full_name || c.name || "Candidato",
    email: c.email || "-",
    phone: c.phone || "-",
    role: c.vacancy_title || c.position_name || c.applied_position || c.position_applied || "Vacante",
    city: c.city || c.location || "-",
    exp: c.experience || "-",
    edu: c.education || "-",
    score: c.score || c.match_score || 0,
    status,
    hiredEmployee: c.hired_employee_id,
    observations: c.observations || {},
    col: PIPE_COLS.find((p) => status.includes(p.key))?.key || "postulado",
    color: ["var(--viz-sky)", "var(--viz-amber)", "var(--viz-violet)", "var(--viz-teal)"][i % 4],
  };
}

function CandidateCard({ c, onClick }) {
  return (
    <div className="kcard" onClick={onClick}>
      <div className="t-avatar">
        <Avatar size="sm" name={c.name} color={c.color} />
        <div className="grow">
          <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{c.name}</div>
          <small className="muted">{c.role}</small>
        </div>
      </div>
      <div className="pipe-card-tags">
        <span className="tag-soft"><Icon name="map-pin" size={10} />{c.city}</span>
        <span className="tag-soft">{c.exp}</span>
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>Afinidad</span>
        <b className="mono" style={{ fontSize: "var(--fs-2xs)" }}>{c.score}%</b>
      </div>
    </div>
  );
}

function VacancyModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = rcS({
    vacancy_code: "",
    title: "",
    department: "",
    contract_type: "",
    location: "",
    description: "",
    requirements: "",
    status: "open",
  });
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const missing = [];
    if (!payload.title.trim()) missing.push("nombre de la vacante");
    if (!payload.department.trim()) missing.push("dependencia");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Vacante incompleta" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/hr/vacancies", {
        vacancy_code: payload.vacancy_code.trim() || null,
        title: payload.title.trim(),
        department: payload.department.trim(),
        contract_type: payload.contract_type.trim() || null,
        location: payload.location.trim() || null,
        description: payload.description.trim() || null,
        requirements: payload.requirements.split("\n").map((item) => item.trim()).filter(Boolean),
        status: payload.status,
      });
      toast("Vacante creada y publicada en RRHH.", { tone: "ok", title: "Vacante lista" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la vacante.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Nueva vacante" sub="Se publica en el pipeline interno y en el portal público si queda abierta." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear vacante</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" help="Opcional. Si lo dejas vacío AMBAR lo genera."><input value={payload.vacancy_code} onChange={(e) => setField("vacancy_code", e.target.value)} placeholder="Automático" /></Field>
        <Field label="Estado"><select value={payload.status} onChange={(e) => setField("status", e.target.value)}><option value="open">Abierta</option><option value="paused">Pausada</option><option value="closed">Cerrada</option></select></Field>
        <Field label="Cargo / vacante" required><input value={payload.title} onChange={(e) => setField("title", e.target.value)} placeholder="Ej. Auxiliar de archivo" /></Field>
        <Field label="Dependencia" required><input value={payload.department} onChange={(e) => setField("department", e.target.value)} placeholder="Ej. Talento Humano" /></Field>
        <Field label="Tipo contrato"><input value={payload.contract_type} onChange={(e) => setField("contract_type", e.target.value)} placeholder="Indefinido, obra labor..." /></Field>
        <Field label="Ubicación"><input value={payload.location} onChange={(e) => setField("location", e.target.value)} placeholder="Cali, Bogotá, remoto..." /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripción"><textarea value={payload.description} onChange={(e) => setField("description", e.target.value)} /></Field></div>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Requisitos" help="Uno por línea"><textarea value={payload.requirements} onChange={(e) => setField("requirements", e.target.value)} placeholder={"Experiencia en archivo\nManejo de Excel\nAtención al detalle"} /></Field></div>
      </div>
    </Modal>
  );
}

function RecruitmentPage({ user, navigate }) {
  const toast = useToast();
  const [tab, setTab] = rcS("pipeline");
  const [sel, setSel] = rcS(null);
  const [q, setQ] = rcS("");
  const [creating, setCreating] = rcS(false);
  const liveCandidates = useLiveData(() => AmbarAPI.endpoints.candidates(), [], []);
  const liveVacancies = useLiveData(() => AmbarAPI.endpoints.vacancies(), [], []);
  const candidates = AmbarAPI.listFrom(liveCandidates.data).map(normalizeCandidate);
  const vacancies = AmbarAPI.listFrom(liveVacancies.data);
  const talents = candidates.filter((c) => !q || (c.name + c.role + c.city + c.email).toLowerCase().includes(q.toLowerCase()));
  const canManage = can(user, ["recruit.manage"]);

  const replaceCandidate = (updated) => {
    liveCandidates.setData((current) => AmbarAPI.listFrom(current).map((item) => {
      const id = item.idCandidate || item.id;
      return id === updated.idCandidate ? updated : item;
    }));
    setSel(normalizeCandidate(updated, 0));
  };

  const updateCandidateStatus = async (candidate, status) => {
    if (!canManage) return;
    try {
      const updated = await AmbarAPI.patch(`/hr/candidates/${candidate.id}/status`, {
        status,
        observation: `Cambio de etapa desde AMBAR a ${PIPE_COLS.find((p) => p.key === status)?.name || status}`,
      });
      replaceCandidate(updated);
      toast("Etapa del candidato actualizada.", { tone: "ok", title: "Pipeline actualizado" });
    } catch (err) {
      toast(err.message || "No fue posible actualizar el candidato.", { tone: "danger", title: "Error" });
    }
  };

  const hireCandidate = async (candidate) => {
    if (!canManage) return;
    if (candidate.col !== "aprobado" && candidate.col !== "validacion") {
      toast("Primero aprueba el candidato antes de contratar.", { tone: "danger", title: "Flujo incompleto" });
      return;
    }
    const identification = window.prompt("Identificación del nuevo empleado");
    if (!identification) return;
    try {
      const result = await AmbarAPI.post(`/hr/candidates/${candidate.id}/hire`, { identification: identification.replace(/\D/g, "") });
      if (result?.candidate) replaceCandidate(result.candidate);
      toast("Candidato contratado. El expediente laboral conserva sus documentos.", { tone: "ok", title: "Contratación lista" });
    } catch (err) {
      toast(err.message || "No fue posible contratar el candidato.", { tone: "danger", title: "Error" });
    }
  };

  const updateVacancyStatus = async (vacancy, status) => {
    if (!canManage) return;
    const id = vacancy.idVacancy || vacancy.id;
    try {
      const updated = await AmbarAPI.patch(`/hr/vacancies/${id}`, { status });
      liveVacancies.setData((current) => AmbarAPI.listFrom(current).map((item) => ((item.idVacancy || item.id) === id ? updated : item)));
      toast("Vacante actualizada.", { tone: "ok", title: "Cambio guardado" });
    } catch (err) {
      toast(err.message || "No fue posible actualizar la vacante.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Talento Humano</div>
          <h1>Reclutamiento y Selección</h1>
          <p className="lead">Vacantes y candidatos reales desde RRHH. El expediente candidato evoluciona a laboral al contratar.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="external-link" onClick={() => navigate("empleo")}>Ver portal público</Button>
          {canManage && <Button icon="plus" onClick={() => setCreating(true)}>Nueva vacante</Button>}
        </div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="Vacantes activas" value={vacancies.filter((v) => v.status === "open").length} icon="briefcase" tone="brand" accent />
        <Metric label="Candidatos en proceso" value={candidates.filter((c) => !["contratado", "rechazado"].includes(c.col)).length} icon="users" tone="info" accent />
        <Metric label="Contratados" value={candidates.filter((c) => c.col === "contratado").length} icon="user-check" tone="ok" accent />
        <Metric label="Descartados" value={candidates.filter((c) => c.col === "rechazado").length} icon="user-x" tone="danger" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "pipeline", label: "Pipeline de selección", icon: "workflow" }, { key: "vacancies", label: "Vacantes", icon: "briefcase" }, { key: "talents", label: "Base de talentos", icon: "database" }]} />
      {tab === "pipeline" && (
        <div className="kanban an-rise">
          {PIPE_COLS.map((col) => {
            const items = candidates.filter((c) => c.col === col.key);
            return (
              <div key={col.key} className="kcol">
                <div className="kcol-head"><span className="k-tag" style={{ background: col.color }} /><span className="k-name">{col.name}</span><span className="k-count">{items.length}</span></div>
                <div className="kcol-body">
                  {items.map((c) => <CandidateCard key={c.id} c={c} onClick={() => setSel(c)} />)}
                  {items.length === 0 && <div className="muted" style={{ textAlign: "center", padding: "var(--s4)", fontSize: "var(--fs-xs)" }}>Sin candidatos</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === "vacancies" && (
        <div className="grid cols-2 stagger">
          {vacancies.length === 0 && <Card><Empty icon="briefcase" title="Sin vacantes">No hay vacantes registradas.</Empty></Card>}
          {vacancies.map((v, i) => {
            const id = v.idVacancy || v.id || i;
            return (
              <Card key={id} interactive style={{ "--i": i }} className="vacancy-card">
                <div className="row between">
                  <div>
                    <h3 style={{ fontSize: "var(--fs-md)" }}>{v.title || v.name}</h3>
                    <p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{v.department_name || v.department || v.area || "-"} / {v.contract_type || v.type || "-"}</p>
                  </div>
                  <Badge tone={v.status === "open" ? "success" : v.status === "closed" ? "neutral" : "warning"} dot>{v.status || "open"}</Badge>
                </div>
                <p className="muted" style={{ marginTop: "var(--s3)" }}>{v.description || "Sin descripción registrada."}</p>
                {Array.isArray(v.requirements) && v.requirements.length > 0 && <div className="row wrap gap2" style={{ marginTop: "var(--s3)" }}>{v.requirements.slice(0, 5).map((item) => <span key={item} className="tag-soft">{item}</span>)}</div>}
                {canManage && <div className="row wrap gap2" style={{ marginTop: "var(--s4)" }}>
                  <Button size="sm" variant="ghost" onClick={() => updateVacancyStatus(v, "open")}>Abrir</Button>
                  <Button size="sm" variant="ghost" onClick={() => updateVacancyStatus(v, "paused")}>Pausar</Button>
                  <Button size="sm" variant="ghost" onClick={() => updateVacancyStatus(v, "closed")}>Cerrar</Button>
                  <Button size="sm" variant="ghost" onClick={() => updateVacancyStatus(v, "cancelled")}>Cancelar</Button>
                </div>}
              </Card>
            );
          })}
        </div>
      )}
      {tab === "talents" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)", gap: "var(--s3)" }}>
            <div className="search-box grow"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, profesión, correo o ciudad..." /></div>
          </div>
          {talents.length === 0 ? <Empty icon="database" title="Sin candidatos">No hay candidatos reales para estos filtros.</Empty> : (
            <div className="table-scroll"><table className="tbl"><thead><tr><th>Candidato</th><th>Aspira a</th><th>Ciudad</th><th>Correo</th><th>Teléfono</th><th>Etapa</th></tr></thead><tbody>
              {talents.map((c) => (<tr key={c.id} className="clickable" onClick={() => setSel(c)}><td><div className="t-avatar"><Avatar size="sm" name={c.name} color={c.color} /><span className="cell-strong">{c.name}</span></div></td><td>{c.role}</td><td>{c.city}</td><td>{c.email}</td><td>{c.phone}</td><td>{PIPE_COLS.find((p) => p.key === c.col)?.name}</td></tr>))}
            </tbody></table></div>
          )}
        </Card>
      )}
      {sel && (
        <Drawer title={sel.name} sub={`Aspira a: ${sel.role}`} onClose={() => setSel(null)} headExtra={<Badge tone="brand">Afinidad {sel.score}%</Badge>}>
          <div className="profile-head" style={{ padding: 0, marginBottom: "var(--s4)" }}><span className="avatar xl" style={{ background: sel.color }}>{window.initialsOf(sel.name)}</span><div className="ph-meta"><h2 style={{ fontSize: "var(--fs-xl)" }}>{sel.name}</h2><p className="muted">{sel.role} / {sel.city}</p></div></div>
          <div className="grid cols-2" style={{ gap: "var(--s4)" }}>{[["Correo", sel.email], ["Teléfono", sel.phone], ["Ciudad", sel.city], ["Etapa actual", PIPE_COLS.find((p) => p.key === sel.col)?.name]].map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
          {canManage && <div className="row wrap gap2" style={{ marginTop: "var(--s5)" }}>
            <Button variant="ghost" onClick={() => updateCandidateStatus(sel, "entrevista")}>Enviar a entrevista</Button>
            <Button variant="ghost" onClick={() => updateCandidateStatus(sel, "validacion")}>Enviar a validación</Button>
            <Button variant="ghost" onClick={() => updateCandidateStatus(sel, "aprobado")}>Aprobar</Button>
            <Button variant="ghost" onClick={() => updateCandidateStatus(sel, "rechazado")}>Descartar</Button>
            <Button icon="user-check" onClick={() => hireCandidate(sel)} disabled={!["aprobado", "validacion"].includes(sel.col)}>Contratar</Button>
          </div>}
          <Empty icon="folder-kanban" title="Expediente candidato">Al contratar, AMBAR convierte este registro en empleado y reutiliza los documentos sin duplicarlos.</Empty>
        </Drawer>
      )}
      {creating && <VacancyModal onClose={() => setCreating(false)} onCreated={(created) => liveVacancies.setData((current) => [created, ...(current || [])])} />}
    </>
  );
}

window.RecruitmentPage = RecruitmentPage;
