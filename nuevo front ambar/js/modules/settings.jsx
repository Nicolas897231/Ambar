/* ============================================================
   AMBAR — Administración: Configuración (incl. apariencia en vivo)
   ============================================================ */
const { useState: stS, useEffect: stE } = React;

const ACCENTS = [
  { name: "Ámbar", v: ["oklch(0.64 0.145 58)", "oklch(0.72 0.155 64)", "oklch(0.44 0.095 48)"] },
  { name: "Índigo", v: ["oklch(0.55 0.16 270)", "oklch(0.62 0.17 272)", "oklch(0.4 0.12 270)"] },
  { name: "Esmeralda", v: ["oklch(0.58 0.13 160)", "oklch(0.66 0.14 162)", "oklch(0.4 0.1 160)"] },
  { name: "Carmesí", v: ["oklch(0.56 0.18 18)", "oklch(0.64 0.19 20)", "oklch(0.4 0.13 16)"] },
  { name: "Océano", v: ["oklch(0.56 0.13 235)", "oklch(0.64 0.14 238)", "oklch(0.4 0.1 235)"] },
];
const FONTS = [
  { name: "Bricolage + Public Sans", disp: '"Bricolage Grotesque", sans-serif', body: '"Public Sans", sans-serif' },
  { name: "Public Sans (uniforme)", disp: '"Public Sans", sans-serif', body: '"Public Sans", sans-serif' },
  { name: "JetBrains Mono (display)", disp: '"JetBrains Mono", monospace', body: '"Public Sans", sans-serif' },
];

function SettingsPage({ user }) {
  const [tab, setTab] = stS("appearance");
  const [accent, setAccent] = stS(0);
  const [radius, setRadius] = stS(11);
  const [density, setDensity] = stS("normal");
  const [font, setFont] = stS(0);
  const toast = useToast();

  stE(() => {
    const r = document.documentElement;
    const a = ACCENTS[accent];
    r.style.setProperty("--brand", a.v[0]); r.style.setProperty("--brand-bright", a.v[1]); r.style.setProperty("--brand-ink", a.v[2]);
    r.style.setProperty("--brand-ghost", `color-mix(in oklab, ${a.v[1]} 16%, transparent)`);
    r.style.setProperty("--r-md", radius + "px"); r.style.setProperty("--r-lg", (radius + 5) + "px");
    r.style.setProperty("--font-display", FONTS[font].disp); r.style.setProperty("--font-body", FONTS[font].body);
  }, [accent, radius, font]);

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Administración</div><h1>Configuración</h1><p className="lead">Personaliza la plataforma: apariencia, integraciones, firmas digitales y automatizaciones. Todo el sistema visual está basado en variables, así que los cambios se aplican al instante.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "appearance", label: "Apariencia", icon: "sparkles" }, { key: "general", label: "General", icon: "settings" }, { key: "integrations", label: "Integraciones", icon: "plug-zap" }, { key: "signatures", label: "Firmas", icon: "pen-line" }, { key: "automation", label: "Automatización", icon: "zap" }]} />

      {tab === "appearance" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: "var(--s4)" }}>
          <div className="col gap4">
            <Card className="an-rise"><CardHead title="Color de acento" sub="Cambia la identidad de toda la plataforma en vivo" icon="sparkles" />
              <div className="row wrap gap2">{ACCENTS.map((a, i) => (<button key={a.name} className={`role-list-item${accent === i ? " active" : ""}`} style={{ width: "auto" }} onClick={() => setAccent(i)}><span className="role-swatch" style={{ background: a.v[0], height: 24, width: 24, borderRadius: 8 }} /><span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{a.name}</span></button>))}</div>
            </Card>
            <Card className="an-rise"><CardHead title="Tipografía" icon="file-text" />
              <div className="col gap2">{FONTS.map((f, i) => (<label key={f.name} className="list-row" style={{ cursor: "pointer" }}><input type="radio" name="font" checked={font === i} onChange={() => setFont(i)} style={{ width: 16 }} /><span className="grow" style={{ fontFamily: f.disp, fontWeight: 700, fontSize: "var(--fs-md)" }}>{f.name}</span></label>))}</div>
            </Card>
            <Card className="an-rise"><CardHead title="Radio de esquinas" sub={`${radius}px`} icon="layout" />
              <input type="range" min="0" max="20" value={radius} onChange={e => setRadius(+e.target.value)} style={{ accentColor: "var(--brand)" }} />
            </Card>
            <Card className="an-rise"><CardHead title="Tema" icon="moon" />
              <Segmented options={[{ value: "light", label: "Claro", icon: "sun" }, { value: "dark", label: "Oscuro", icon: "moon" }]} value={getTheme()} onChange={v => { setTheme(v); toast("Tema actualizado", { tone: "ok" }); }} />
            </Card>
          </div>
          <Card className="an-rise" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
            <CardHead title="Vista previa" />
            <div className="col gap4">
              <Button className="btn-block">Botón primario</Button>
              <div className="metric" style={{ minHeight: 0 }}><div className="m-top"><span className="m-label">KPI de ejemplo</span><span className="m-icon"><Icon name="sparkles" size={18} /></span></div><div className="m-value">12.480</div></div>
              <div className="row gap2"><Badge tone="brand">Etiqueta</Badge><Badge tone="success" dot>Activo</Badge></div>
              <Meter value={72} showLabel />
            </div>
          </Card>
        </div>
      )}

      {tab === "general" && (
        <div className="grid cols-2 stagger">
          <Card><CardHead title="Información de la organización" /><div className="col gap4"><Field label="Nombre"><input defaultValue="Empresa AMBAR S.A.S." /></Field><Field label="NIT"><input defaultValue="890.123.456-7" className="mono" /></Field><Field label="Sede principal"><select>{window.SEDES.map(s => <option key={s}>{s}</option>)}</select></Field></div></Card>
          <Card><CardHead title="Preferencias" /><div className="col gap4">{[["Idioma", "Español (Colombia)"], ["Zona horaria", "America/Bogotá"], ["Formato de fecha", "DD/MM/AAAA"]].map(([k, v]) => <Field key={k} label={k}><input defaultValue={v} /></Field>)}</div></Card>
        </div>
      )}

      {tab === "integrations" && (
        <div className="grid cols-3 stagger">
          {[["SAP", "ERP", true], ["Odoo", "ERP", false], ["Microsoft 365", "Productividad", true], ["Google Workspace", "Productividad", false], ["SIIGO", "Nómina", true], ["AWS Textract", "OCR", false]].map(([n, c, on], i) => (
            <Card key={n} style={{ "--i": i }}><div className="row between" style={{ marginBottom: "var(--s3)" }}><div className="row gap2"><span className="m-icon"><Icon name="plug-zap" size={18} /></span><div><b>{n}</b><div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{c}</div></div></div><Switch checked={on} onChange={() => { }} /></div><Badge tone={on ? "success" : "outline"} dot>{on ? "Conectado" : "Desconectado"}</Badge></Card>
          ))}
        </div>
      )}

      {tab === "signatures" && (<Card className="an-rise"><CardHead title="Firmas digitales" sub="Solicitudes y verificación de firmas" icon="pen-line" />
        <div className="col gap2">{[["Contrato Mariana Ruiz", "Pendiente de firma", "warning"], ["Otrosí Carlos Daza", "Firmado y verificado", "success"], ["Acta comité mayo", "Firmado y verificado", "success"]].map(([n, s, tn], i) => (<div key={i} className="list-row"><Icon name="pen-line" size={18} style={{ color: "var(--brand)" }} /><span className="grow" style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{n}</span><Badge tone={tn} dot>{s}</Badge></div>))}</div></Card>)}

      {tab === "automation" && (<div className="col gap4"><div className="page-intro an-rise"><span className="pi-ico"><Icon name="zap" size={18} /></span><div><h4>Reglas de automatización</h4><p>AMBAR ejecuta acciones automáticas cuando ocurren eventos. Las acciones críticas son idempotentes: reintentar no las duplica.</p></div></div>
        <Card className="an-rise"><div className="col gap2">{[["Contrato por vencer", "30 días antes → notificar RRHH y empleado", true], ["Examen médico vencido", "Al vencer → alerta SST", true], ["Expediente incompleto", "Al crear empleado → checklist", true], ["Caja al 85%", "Sugerir transferencia al Jefe de Archivo", true], ["Vacante sin candidatos", "5 días → recordar a RRHH", false]].map(([n, d, on], i) => (<div key={i} className="list-row"><Icon name="workflow" size={18} style={{ color: on ? "var(--brand)" : "var(--faint)" }} /><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{n}</div><small className="muted">{d}</small></div><Switch checked={on} onChange={() => { }} /></div>))}</div></Card></div>)}
    </>
  );
}
window.SettingsPage = SettingsPage;
