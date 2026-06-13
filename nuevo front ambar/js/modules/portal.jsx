const { useState: poS } = React;

function ApplyModal({ vacancy, onClose }) {
  const toast = useToast();
  const [form, setForm] = poS({ full_name: "", identification: "", email: "", phone: "", city: "", experience_summary: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.full_name.trim() || !form.identification.trim() || !form.email.trim()) {
      toast("Nombre, identificacion y correo son obligatorios.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    try {
      const payload = new FormData();
      payload.append("full_name", form.full_name.trim());
      payload.append("email", form.email.trim());
      if (form.phone.trim()) payload.append("phone", form.phone.trim());
      const observation = [
        form.identification.trim() ? `Identificacion: ${form.identification.trim()}` : "",
        form.city.trim() ? `Ciudad: ${form.city.trim()}` : "",
        form.experience_summary.trim()
      ].filter(Boolean).join("\n");
      if (observation) payload.append("observation", observation);
      await AmbarAPI.form(`/hr/public/vacancies/${vacancy.id}/apply`, payload);
      toast("Postulacion enviada al backend.", { tone: "ok", title: "Aplicacion recibida" });
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible enviar la postulacion.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal lg title={`Postularme · ${vacancy.title}`} sub="Tu informacion queda en la base de candidatos de AMBAR" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="send" onClick={submit}>Enviar postulacion</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Nombre completo" required><input value={form.full_name} onChange={e => set("full_name", e.target.value)} maxLength={160} /></Field>
        <Field label="Identificacion" required><input value={form.identification} onChange={e => set("identification", e.target.value.replace(/\D/g, "").slice(0, 15))} /></Field>
        <Field label="Correo" required><input type="email" value={form.email} onChange={e => set("email", e.target.value)} /></Field>
        <Field label="Telefono"><input value={form.phone} onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} /></Field>
        <Field label="Ciudad"><input value={form.city} onChange={e => set("city", e.target.value)} /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Experiencia resumida"><textarea value={form.experience_summary} onChange={e => set("experience_summary", e.target.value)} maxLength={1200} /></Field></div>
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
    city: v.city || "-",
    mode: v.work_mode || v.mode || "-",
    salary: v.salary_range || v.salary || "",
    status: v.status || "active"
  }));
  const toggle = () => { const t = theme === "light" ? "dark" : "light"; setTh(t); setTheme(t); };
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav className="portal-nav">
        <div className="row gap2"><div className="side-logo" style={{ width: 34, height: 34 }}><Icon name="folder-kanban" size={19} /></div><b style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-lg)" }}>AMBAR <span className="muted" style={{ fontWeight: 400 }}>· Empleo</span></b></div>
        <div className="row gap2"><button className="icon-btn" onClick={toggle}><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button><Button variant="ghost" icon="log-in" onClick={onBack}>{loggedIn ? "Volver al sistema" : "Acceso empleados"}</Button></div>
      </nav>
      <div className="portal-hero">
        <div style={{ position: "relative" }}>
          <Badge tone="brand" icon="sparkles">Portal publico</Badge>
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
                <div className="row between"><div className="row gap2"><span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name="briefcase" size={18} /></span><div><h3 style={{ fontSize: "var(--fs-md)" }}>{v.title}</h3><small className="muted">{v.area}</small></div></div><Badge tone={v.status === "active" ? "success" : "warning"} dot>{v.status}</Badge></div>
                <div className="row wrap gap2"><span className="tag-soft"><Icon name="map-pin" size={11} />{v.city}</span><span className="tag-soft">{v.mode}</span><span className="tag-soft">{v.type}</span>{v.salary && <span className="tag-soft mono">{v.salary}</span>}</div>
                <Button className="btn-block" icon="send" onClick={(e) => { e.stopPropagation(); setApply(v); }}>Postularme</Button>
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
