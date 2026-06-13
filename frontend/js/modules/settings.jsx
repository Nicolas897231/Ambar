const { useState: stS, useEffect: stE } = React;

const ACCENTS = [
  { name: "Ambar", v: ["oklch(0.64 0.145 58)", "oklch(0.72 0.155 64)", "oklch(0.44 0.095 48)"] },
  { name: "Indigo", v: ["oklch(0.55 0.16 270)", "oklch(0.62 0.17 272)", "oklch(0.4 0.12 270)"] },
  { name: "Esmeralda", v: ["oklch(0.58 0.13 160)", "oklch(0.66 0.14 162)", "oklch(0.4 0.1 160)"] },
];

function SettingsPage() {
  const [tab, setTab] = stS("appearance");
  const [accent, setAccent] = stS(0);
  const [radius, setRadius] = stS(8);
  const toast = useToast();
  const { data: platform } = useLiveData(() => AmbarAPI.endpoints.platform(), {}, []);

  stE(() => {
    const r = document.documentElement;
    const a = ACCENTS[accent];
    r.style.setProperty("--brand", a.v[0]); r.style.setProperty("--brand-bright", a.v[1]); r.style.setProperty("--brand-ink", a.v[2]);
    r.style.setProperty("--brand-ghost", `color-mix(in oklab, ${a.v[1]} 16%, transparent)`);
    r.style.setProperty("--r-md", radius + "px"); r.style.setProperty("--r-lg", (radius + 4) + "px");
  }, [accent, radius]);

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Administracion</div><h1>Configuracion</h1><p className="lead">Preferencias visuales locales y estado tecnico real del backend.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "appearance", label: "Apariencia", icon: "sparkles" }, { key: "system", label: "Estado sistema", icon: "server-cog" }, { key: "integrations", label: "Integraciones", icon: "plug-zap" }, { key: "signatures", label: "Firmas", icon: "pen-line" }]} />
      {tab === "appearance" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: "var(--s4)" }}>
          <div className="col gap4">
            <Card className="an-rise"><CardHead title="Color de acento" icon="sparkles" />
              <div className="row wrap gap2">{ACCENTS.map((a, i) => (<button key={a.name} className={`role-list-item${accent === i ? " active" : ""}`} style={{ width: "auto" }} onClick={() => setAccent(i)}><span className="role-swatch" style={{ background: a.v[0], height: 24, width: 24, borderRadius: 8 }} /><span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{a.name}</span></button>))}</div>
            </Card>
            <Card className="an-rise"><CardHead title="Radio de esquinas" sub={`${radius}px`} icon="layout" /><input type="range" min="4" max="14" value={radius} onChange={e => setRadius(+e.target.value)} style={{ accentColor: "var(--brand)" }} /></Card>
            <Card className="an-rise"><CardHead title="Tema" icon="moon" /><Segmented options={[{ value: "light", label: "Claro", icon: "sun" }, { value: "dark", label: "Oscuro", icon: "moon" }]} value={getTheme()} onChange={v => { setTheme(v); toast("Tema actualizado", { tone: "ok" }); }} /></Card>
          </div>
          <Card className="an-rise" style={{ position: "sticky", top: 80, alignSelf: "start" }}><CardHead title="Vista previa" /><div className="col gap4"><Button className="btn-block">Boton primario</Button><Metric label="KPI de ejemplo" value={12} icon="sparkles" tone="brand" accent /><Meter value={72} showLabel /></div></Card>
        </div>
      )}
      {tab === "system" && (
        <Card className="an-rise"><CardHead title="Estado tecnico" sub="Respuesta real del backend" icon="server-cog" />
          <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--fs-xs)" }}>{JSON.stringify(platform || {}, null, 2)}</pre>
        </Card>
      )}
      {tab === "integrations" && <Card><Empty icon="plug-zap" title="Sin integraciones reales">No hay integraciones registradas por backend para listar en esta pantalla.</Empty></Card>}
      {tab === "signatures" && <Card><Empty icon="pen-line" title="Sin solicitudes de firma">No hay solicitudes de firma reales para mostrar.</Empty></Card>}
    </>
  );
}

window.SettingsPage = SettingsPage;
