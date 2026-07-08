const { useState: poS } = React;

function ApplyModal({ vacancy, onClose }) {
  const toast = useToast();
  const [form, setForm] = poS({
    full_name: "",
    identification: "",
    email: "",
    phone: "",
    city: "",
    education_level: "",
    last_position: "",
    salary_expectation: "",
    availability: "",
    linkedin: "",
    portfolio: "",
    experience_summary: "",
    consent: false,
    resume: null,
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const missing = [];
    if (!form.full_name.trim()) missing.push("nombre completo");
    if (!form.identification.trim()) missing.push("identificación");
    if (!form.email.trim()) missing.push("correo");
    if (!form.phone.trim()) missing.push("teléfono");
    if (!form.city.trim()) missing.push("ciudad");
    if (!form.resume) missing.push("hoja de vida");
    if (!form.consent) missing.push("autorización de datos");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Postulación incompleta" });
      return;
    }
    try {
      const payload = new FormData();
      payload.append("full_name", form.full_name.trim());
      payload.append("email", form.email.trim());
      payload.append("phone", form.phone.trim());
      payload.append("resume", form.resume);
      const observation = [
        `Identificación: ${form.identification.trim()}`,
        `Ciudad: ${form.city.trim()}`,
        form.education_level.trim() ? `Formación: ${form.education_level.trim()}` : "",
        form.last_position.trim() ? `Último cargo: ${form.last_position.trim()}` : "",
        form.salary_expectation.trim() ? `Aspiración salarial: ${form.salary_expectation.trim()}` : "",
        form.availability.trim() ? `Disponibilidad: ${form.availability.trim()}` : "",
        form.linkedin.trim() ? `LinkedIn: ${form.linkedin.trim()}` : "",
        form.portfolio.trim() ? `Portafolio: ${form.portfolio.trim()}` : "",
        form.experience_summary.trim(),
        "Autorizó tratamiento de datos personales para proceso de selección.",
      ].filter(Boolean).join("\n");
      payload.append("observation", observation);
      await AmbarAPI.form(`/hr/public/vacancies/${vacancy.id}/apply`, payload);
      toast("Postulación enviada a Talento Humano.", { tone: "ok", title: "Aplicación recibida" });
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible enviar la postulación.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal lg title={`Postularme · ${vacancy.title}`} sub="Tu información queda en la base real de candidatos de AMBAR" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="send" onClick={submit}>Enviar postulación</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Nombre completo" required><input value={form.full_name} onChange={(event) => set("full_name", event.target.value.replace(/[0-9]/g, ""))} maxLength={160} /></Field>
        <Field label="Identificación" required><input value={form.identification} onChange={(event) => set("identification", event.target.value.replace(/\D/g, "").slice(0, 15))} /></Field>
        <Field label="Correo" required><input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
        <Field label="Teléfono" required><input value={form.phone} onChange={(event) => set("phone", event.target.value.replace(/\D/g, "").slice(0, 10))} /></Field>
        <Field label="Ciudad" required><input value={form.city} onChange={(event) => set("city", event.target.value)} /></Field>
        <Field label="Hoja de vida PDF" required><input type="file" accept=".pdf,.doc,.docx" onChange={(event) => set("resume", event.target.files?.[0] || null)} /></Field>
        <Field label="Formación"><input value={form.education_level} onChange={(event) => set("education_level", event.target.value)} placeholder="Tecnólogo, profesional, especialización..." /></Field>
        <Field label="Último cargo"><input value={form.last_position} onChange={(event) => set("last_position", event.target.value)} /></Field>
        <Field label="Aspiración salarial"><input value={form.salary_expectation} onChange={(event) => set("salary_expectation", event.target.value)} /></Field>
        <Field label="Disponibilidad"><input value={form.availability} onChange={(event) => set("availability", event.target.value)} placeholder="Inmediata, 15 días..." /></Field>
        <Field label="LinkedIn"><input value={form.linkedin} onChange={(event) => set("linkedin", event.target.value)} /></Field>
        <Field label="Portafolio"><input value={form.portfolio} onChange={(event) => set("portfolio", event.target.value)} /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Experiencia resumida"><textarea value={form.experience_summary} onChange={(event) => set("experience_summary", event.target.value)} maxLength={1200} /></Field></div>
        <label className="check-card" style={{ gridColumn: "1 / -1" }}>
          <input type="checkbox" checked={form.consent} onChange={(event) => set("consent", event.target.checked)} />
          <span>Autorizo el tratamiento de mis datos personales para este proceso de selección.</span>
        </label>
      </div>
    </Modal>
  );
}

function JobPortal({ onBack, loggedIn }) {
  const [apply, setApply] = poS(null);
  const [theme, setTh] = poS(getTheme());
  const { data: rawVacancies, loading } = useLiveData(() => AmbarAPI.endpoints.publicVacancies(), [], []);
  const vacancies = AmbarAPI.listFrom(rawVacancies).map((v, i) => ({
    id: v.idVacancy || v.id || i,
    title: v.title || v.name || "Vacante",
    area: v.department || v.department_name || v.area || "-",
    type: v.contract_type || v.type || "-",
    city: v.location || v.city || "-",
    mode: v.work_mode || v.mode || "-",
    salary: v.salary_range || v.salary || "",
    status: v.status || "open",
    description: v.description || "",
    requirements: v.requirements || [],
  }));
  const toggle = () => { const next = theme === "light" ? "dark" : "light"; setTh(next); setTheme(next); };
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav className="portal-nav">
        <div className="row gap2"><div className="side-logo" style={{ width: 34, height: 34 }}><Icon name="folder-kanban" size={19} /></div><b style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-lg)" }}>AMBAR <span className="muted" style={{ fontWeight: 400 }}>· Empleo</span></b></div>
        <div className="row gap2"><button className="icon-btn" onClick={toggle}><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button><Button variant="ghost" icon="log-in" onClick={onBack}>{loggedIn ? "Volver al sistema" : "Acceso empleados"}</Button></div>
      </nav>
      <div className="portal-hero">
        <div style={{ position: "relative" }}>
          <Badge tone="brand" icon="sparkles">Portal público</Badge>
          <h1 style={{ marginTop: "var(--s4)" }}>Vacantes disponibles en AMBAR</h1>
          <p className="muted" style={{ fontSize: "var(--fs-lg)", maxWidth: "52ch", margin: "var(--s4) auto 0" }}>Consulta oportunidades reales publicadas por Talento Humano.</p>
        </div>
      </div>
      <div id="vac" style={{ maxWidth: 1000, margin: "0 auto", padding: "var(--s8) var(--s6)" }}>
        <div className="page-head" style={{ marginBottom: "var(--s5)" }}><div><h2 style={{ fontSize: "var(--fs-2xl)" }}>Vacantes abiertas</h2><p className="muted">{vacancies.length} oportunidades disponibles</p></div></div>
        {loading ? <Skeleton lines={6} /> : vacancies.length === 0 ? <Card><Empty icon="briefcase" title="Sin vacantes">No hay vacantes publicadas en este momento.</Empty></Card> : (
          <div className="grid cols-2 stagger">
            {vacancies.map((v, i) => (
              <Card key={v.id} interactive style={{ "--i": i }} className="vacancy-card" onClick={() => setApply(v)}>
                <div className="row between"><div className="row gap2"><span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name="briefcase" size={18} /></span><div><h3 style={{ fontSize: "var(--fs-md)" }}>{v.title}</h3><small className="muted">{v.area}</small></div></div><Badge tone={v.status === "open" ? "success" : "warning"} dot>{v.status}</Badge></div>
                {v.description && <p className="muted">{v.description}</p>}
                <div className="row wrap gap2"><span className="tag-soft"><Icon name="map-pin" size={11} />{v.city}</span><span className="tag-soft">{v.mode}</span><span className="tag-soft">{v.type}</span>{v.salary && <span className="tag-soft mono">{v.salary}</span>}</div>
                <Button className="btn-block" icon="send" onClick={(event) => { event.stopPropagation(); setApply(v); }}>Postularme</Button>
              </Card>
            ))}
          </div>
        )}
      </div>
      <footer style={{ borderTop: "1px solid var(--line)", padding: "var(--s6)", textAlign: "center", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>AMBAR © 2026 · Colombia</footer>
      {apply && <ApplyModal vacancy={apply} onClose={() => setApply(null)} />}
    </div>
  );
}

window.JobPortal = JobPortal;
