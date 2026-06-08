/* ============================================================
   AMBAR — Portal Público de Empleo (diseño independiente)
   ============================================================ */
const { useState: poS } = React;

const PUB_VACANCIES = [
  { title: "Desarrollador Full Stack", area: "Tecnología", type: "Tiempo completo", city: "Cali", mode: "Híbrido", salary: "$ 5–7M", tags: ["React", "Node", "SQL"] },
  { title: "Analista Comercial", area: "Comercial", type: "Tiempo completo", city: "Medellín", mode: "Presencial", salary: "$ 3–4M", tags: ["Ventas", "CRM"] },
  { title: "Contador Senior", area: "Financiera", type: "Tiempo completo", city: "Cali", mode: "Híbrido", salary: "$ 4–5.5M", tags: ["NIIF", "Impuestos"] },
  { title: "Auxiliar de Archivo", area: "Gestión Documental", type: "Tiempo completo", city: "Cali", mode: "Presencial", salary: "$ 1.8–2.3M", tags: ["Archivo", "Digitalización"] },
];

function ApplyModal({ vacancy, onClose }) {
  const toast = useToast();
  const [step, setStep] = poS(0);
  return (
    <Modal lg title={`Postularme · ${vacancy.title}`} sub="Tu información queda en nuestra base de talentos para esta y futuras vacantes" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><div className="row gap2">{step > 0 && <Button variant="secondary" icon="arrow-left" onClick={() => setStep(step - 1)}>Atrás</Button>}<Button icon={step < 2 ? "arrow-right" : "send"} onClick={() => { if (step < 2) setStep(step + 1); else { toast("¡Postulación enviada! Te contactaremos pronto.", { tone: "ok", title: "Aplicación recibida" }); onClose(); } }}>{step < 2 ? "Continuar" : "Enviar postulación"}</Button></div></>}>
      <div style={{ marginBottom: "var(--s5)" }}><Stepper steps={["Datos personales", "Experiencia & estudios", "Documentos"]} current={step} /></div>
      <div className="wizard-body">
        {step === 0 && (<div className="grid cols-2" style={{ gap: "var(--s4)" }}><Field label="Nombre completo" required><input placeholder="Tu nombre" /></Field><Field label="Documento" required><input placeholder="C.C." /></Field><Field label="Correo" required><input type="email" placeholder="tu@correo.com" /></Field><Field label="Teléfono" required><input placeholder="+57 …" /></Field><Field label="Ciudad"><input placeholder="Cali" /></Field><Field label="¿Cómo te enteraste?"><select><option>LinkedIn</option><option>Página web</option><option>Referido</option><option>Otro</option></select></Field></div>)}
        {step === 1 && (<div className="col gap4"><Field label="Profesión / título" required><input placeholder="Ej. Ingeniero de Sistemas" /></Field><div className="grid cols-2" style={{ gap: "var(--s3)" }}><Field label="Años de experiencia"><input type="number" placeholder="3" /></Field><Field label="Nivel académico"><select><option>Profesional</option><option>Tecnólogo</option><option>Técnico</option><option>Posgrado</option></select></Field></div><Field label="Experiencia laboral" required><textarea placeholder="Cuéntanos brevemente tu experiencia relevante…" /></Field><Field label="Certificaciones (separadas por coma)"><input placeholder="Scrum, AWS, …" /></Field></div>)}
        {step === 2 && (<div className="col gap4"><div className="uploader"><Icon name="upload-cloud" size={28} /><div style={{ marginTop: 8, fontWeight: 600 }}>Sube tu hoja de vida</div><small className="faint">PDF · hasta 10 MB</small></div><div className="grid cols-2" style={{ gap: "var(--s3)" }}><div className="uploader" style={{ padding: "var(--s5)" }}><Icon name="award" size={20} /><div style={{ marginTop: 6, fontSize: "var(--fs-sm)", fontWeight: 600 }}>Diplomas</div></div><div className="uploader" style={{ padding: "var(--s5)" }}><Icon name="file-check" size={20} /><div style={{ marginTop: 6, fontSize: "var(--fs-sm)", fontWeight: 600 }}>Certificados</div></div></div><label className="check"><input type="checkbox" defaultChecked /> Autorizo el tratamiento de mis datos personales según la política de privacidad.</label></div>)}
      </div>
    </Modal>
  );
}

function JobPortal({ onBack, loggedIn }) {
  const [apply, setApply] = poS(null);
  const [theme, setTh] = poS(getTheme());
  const toggle = () => { const t = theme === "light" ? "dark" : "light"; setTh(t); setTheme(t); };
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav className="portal-nav">
        <div className="row gap2"><div className="side-logo" style={{ width: 34, height: 34 }}><Icon name="folder-kanban" size={19} /></div><b style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-lg)" }}>AMBAR <span className="muted" style={{ fontWeight: 400 }}>· Empleo</span></b></div>
        <div className="row gap2"><button className="icon-btn" onClick={toggle}><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></button><Button variant="ghost" icon="log-in" onClick={onBack}>{loggedIn ? "Volver al sistema" : "Acceso empleados"}</Button></div>
      </nav>
      <div className="portal-hero">
        <div className="auth-bg" style={{ position: "absolute" }}><div className="orb" style={{ background: "var(--amber-400)", width: 380, height: 380, top: "-30%", left: "10%", opacity: .35 }} /><div className="orb" style={{ background: "var(--viz-indigo)", width: 300, height: 300, top: "-10%", right: "8%", opacity: .3 }} /></div>
        <div style={{ position: "relative" }}>
          <Badge tone="brand" icon="sparkles">Estamos contratando</Badge>
          <h1 style={{ marginTop: "var(--s4)" }}>Construye tu carrera<br />con <span className="grad-text">nosotros</span></h1>
          <p className="muted" style={{ fontSize: "var(--fs-lg)", maxWidth: "52ch", margin: "var(--s4) auto 0" }}>Únete a un equipo que valora el talento. Regístrate una vez y postúlate a todas nuestras vacantes — tu perfil queda disponible para futuras oportunidades.</p>
          <div className="row" style={{ justifyContent: "center", marginTop: "var(--s6)", gap: "var(--s2)" }}><Button size="lg" icon="briefcase" onClick={() => document.getElementById("vac").scrollIntoView({ behavior: "smooth" })}>Ver vacantes</Button><Button size="lg" variant="secondary" icon="user-plus" onClick={() => setApply(PUB_VACANCIES[0])}>Crear mi perfil</Button></div>
        </div>
      </div>
      <div id="vac" style={{ maxWidth: 1000, margin: "0 auto", padding: "var(--s8) var(--s6)" }}>
        <div className="page-head" style={{ marginBottom: "var(--s5)" }}><div><h2 style={{ fontSize: "var(--fs-2xl)" }}>Vacantes abiertas</h2><p className="muted">{PUB_VACANCIES.length} oportunidades disponibles</p></div><div className="search-box"><Icon name="search" size={16} /><input placeholder="Buscar cargo o área…" /></div></div>
        <div className="grid cols-2 stagger">
          {PUB_VACANCIES.map((v, i) => (
            <Card key={v.title} interactive style={{ "--i": i }} className="vacancy-card" onClick={() => setApply(v)}>
              <div className="row between"><div className="row gap2"><span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name="briefcase" size={18} /></span><div><h3 style={{ fontSize: "var(--fs-md)" }}>{v.title}</h3><small className="muted">{v.area}</small></div></div><Badge tone="success" dot>Activa</Badge></div>
              <div className="row wrap gap2"><span className="tag-soft"><Icon name="map-pin" size={11} />{v.city}</span><span className="tag-soft">{v.mode}</span><span className="tag-soft">{v.type}</span><span className="tag-soft mono">{v.salary}</span></div>
              <div className="row wrap gap2">{v.tags.map(t => <Badge key={t} tone="outline">{t}</Badge>)}</div>
              <Button className="btn-block" icon="send" onClick={(e) => { e.stopPropagation(); setApply(v); }}>Postularme</Button>
            </Card>
          ))}
        </div>
      </div>
      <footer style={{ borderTop: "1px solid var(--line)", padding: "var(--s6)", textAlign: "center", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>AMBAR © 2026 · Cali, Colombia · Igualdad de oportunidades</footer>
      {apply && <ApplyModal vacancy={apply} onClose={() => setApply(null)} />}
    </div>
  );
}

window.JobPortal = JobPortal;
