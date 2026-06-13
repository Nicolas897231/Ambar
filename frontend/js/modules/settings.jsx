const { useState: stS, useEffect: stE } = React;

const ACCENTS = [
  { name: "Ambar", v: ["oklch(0.64 0.145 58)", "oklch(0.72 0.155 64)", "oklch(0.44 0.095 48)"] },
  { name: "Indigo", v: ["oklch(0.55 0.16 270)", "oklch(0.62 0.17 272)", "oklch(0.4 0.12 270)"] },
  { name: "Esmeralda", v: ["oklch(0.58 0.13 160)", "oklch(0.66 0.14 162)", "oklch(0.4 0.1 160)"] },
];

function statusTone(value) {
  const text = String(value || "").toLowerCase();
  if (["ok", "configured", "healthy", "ready", "active"].some((word) => text.includes(word))) return "success";
  if (["error", "failed", "down"].some((word) => text.includes(word))) return "danger";
  if (!value) return "neutral";
  return "warning";
}

function SystemStatus({ platform }) {
  const items = [
    ["API", platform.node || "ambar-api", "ok", "server"],
    ["Ambiente", platform.environment || "staging", platform.environment || "-", "settings"],
    ["Base de datos", platform.database || platform.mysql || "sin dato", platform.database || platform.mysql, "database"],
    ["Redis", platform.redis || "sin dato", platform.redis, "database"],
    ["RabbitMQ", platform.rabbitmq || "sin dato", platform.rabbitmq, "activity"],
    ["MinIO", platform.minio || "sin dato", platform.minio, "archive"],
    ["OpenSearch", platform.opensearch || "sin dato", platform.opensearch, "search"],
    ["Cache TTL", `${platform.cache_ttl_seconds ?? "-"} s`, platform.cache_ttl_seconds ? "ok" : "", "clock"],
  ];
  return (
    <div className="grid cols-4 stagger">
      {items.map(([label, value, toneValue, icon], index) => (
        <Card key={label} className="system-card" style={{ "--i": index }}>
          <div className="row between">
            <div className="m-icon"><Icon name={icon} size={18} /></div>
            <Badge tone={statusTone(toneValue)} dot>{toneValue || "sin dato"}</Badge>
          </div>
          <h3 style={{ marginTop: "var(--s4)", fontSize: "var(--fs-md)" }}>{label}</h3>
          <p className="muted mono" style={{ fontSize: "var(--fs-xs)", marginTop: 4, overflowWrap: "anywhere" }}>{String(value)}</p>
        </Card>
      ))}
      <Card className="an-rise" style={{ gridColumn: "1 / -1" }}>
        <CardHead title="Metricas tecnicas" sub="Valores reales reportados por backend" icon="activity" />
        <div className="grid cols-3">
          <Metric label="Solicitudes registradas" value={platform.requests_recorded || 0} icon="activity" tone="info" />
          <Metric label="Errores registrados" value={platform.errors_recorded || 0} icon="alert-triangle" tone={platform.errors_recorded ? "danger" : "ok"} />
          <Metric label="Jobs fallidos" value={platform.failed_report_jobs || 0} icon="alert-triangle" tone={platform.failed_report_jobs ? "danger" : "ok"} />
        </div>
      </Card>
    </div>
  );
}

function IntegrationModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = stS({ integration_name: "", integration_type: "generic_rest", config_data: "{}" });
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (payload.integration_name.trim().length < 3) {
      toast("Agrega un nombre de integracion.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    let configData = {};
    try {
      configData = payload.config_data.trim() ? JSON.parse(payload.config_data) : {};
    } catch {
      toast("La configuracion debe ser JSON valido.", { tone: "danger", title: "JSON invalido" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/integrations", {
        integration_name: payload.integration_name.trim(),
        integration_type: payload.integration_type,
        config_data: configData,
      });
      toast("Integracion registrada.", { tone: "ok", title: "Integracion lista" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la integracion.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Nueva integracion" sub="Registra el conector. La sincronizacion queda auditada por backend." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="plug-zap" onClick={submit}>Crear integracion</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Nombre" required><input value={payload.integration_name} onChange={(e) => setField("integration_name", e.target.value)} placeholder="ERP principal" /></Field>
        <Field label="Tipo"><select value={payload.integration_type} onChange={(e) => setField("integration_type", e.target.value)}><option value="generic_rest">REST generico</option><option value="sap">SAP</option><option value="odoo">Odoo</option><option value="dynamics">Dynamics</option><option value="netsuite">NetSuite</option><option value="siigo">Siigo</option><option value="helisa">Helisa</option><option value="payroll">Nomina</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Configuracion JSON"><textarea value={payload.config_data} onChange={(e) => setField("config_data", e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function SettingsPage() {
  const [tab, setTab] = stS("appearance");
  const [accent, setAccent] = stS(0);
  const [radius, setRadius] = stS(8);
  const [creatingIntegration, setCreatingIntegration] = stS(false);
  const toast = useToast();
  const { data: platform } = useLiveData(() => AmbarAPI.endpoints.platform(), {}, []);
  const liveIntegrations = useLiveData(() => AmbarAPI.endpoints.integrations(), [], []);
  const { data: rawSignatures } = useLiveData(() => AmbarAPI.endpoints.signatures(), [], []);
  const integrations = AmbarAPI.listFrom(liveIntegrations.data);
  const signatures = AmbarAPI.listFrom(rawSignatures);

  stE(() => {
    const root = document.documentElement;
    const accentValue = ACCENTS[accent];
    root.style.setProperty("--brand", accentValue.v[0]);
    root.style.setProperty("--brand-bright", accentValue.v[1]);
    root.style.setProperty("--brand-ink", accentValue.v[2]);
    root.style.setProperty("--brand-ghost", `color-mix(in oklab, ${accentValue.v[1]} 16%, transparent)`);
    root.style.setProperty("--r-md", radius + "px");
    root.style.setProperty("--r-lg", (radius + 4) + "px");
  }, [accent, radius]);

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Administracion</div><h1>Configuracion</h1><p className="lead">Preferencias visuales locales y estado tecnico real del backend.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "appearance", label: "Apariencia", icon: "sparkles" }, { key: "system", label: "Estado sistema", icon: "server-cog" }, { key: "integrations", label: "Integraciones", icon: "plug-zap" }, { key: "signatures", label: "Firmas", icon: "pen-line" }]} />
      {tab === "appearance" && (
        <div className="settings-grid">
          <div className="col gap4">
            <Card className="an-rise"><CardHead title="Color de acento" icon="sparkles" />
              <div className="row wrap gap2">{ACCENTS.map((item, index) => (<button key={item.name} className={`role-list-item${accent === index ? " active" : ""}`} style={{ width: "auto" }} onClick={() => setAccent(index)}><span className="role-swatch" style={{ background: item.v[0], height: 24, width: 24, borderRadius: 8 }} /><span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{item.name}</span></button>))}</div>
            </Card>
            <Card className="an-rise"><CardHead title="Radio de esquinas" sub={`${radius}px`} icon="layout" /><input type="range" min="4" max="14" value={radius} onChange={(e) => setRadius(+e.target.value)} style={{ accentColor: "var(--brand)" }} /></Card>
            <Card className="an-rise"><CardHead title="Tema" icon="moon" /><Segmented options={[{ value: "light", label: "Claro", icon: "sun" }, { value: "dark", label: "Oscuro", icon: "moon" }]} value={getTheme()} onChange={(value) => { setTheme(value); toast("Tema actualizado", { tone: "ok" }); }} /></Card>
          </div>
          <Card className="an-rise settings-preview"><CardHead title="Vista previa" /><div className="col gap4"><span className="btn btn-block" aria-hidden="true">Boton primario</span><Metric label="KPI de ejemplo" value={12} icon="sparkles" tone="brand" accent /><Meter value={72} showLabel /></div></Card>
        </div>
      )}
      {tab === "system" && <SystemStatus platform={platform || {}} />}
      {tab === "integrations" && (
        <Card flush className="an-rise">
          <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
            <CardHead title="Integraciones" sub="Conectores registrados en backend" icon="plug-zap" />
            <Button icon="plus" onClick={() => setCreatingIntegration(true)}>Crear integracion</Button>
          </div>
          {liveIntegrations.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={5} /></div> : integrations.length === 0 ? <Empty icon="plug-zap" title="Sin integraciones reales">No hay integraciones registradas por backend para listar en esta pantalla.</Empty> : (
            <div className="table-scroll"><table className="tbl"><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Creacion</th></tr></thead><tbody>{integrations.map((item) => <tr key={item.idIntegration || item.id}><td className="cell-strong">{item.integration_name}</td><td>{item.integration_type}</td><td><Badge tone={item.status === "active" ? "success" : "neutral"} dot>{item.status}</Badge></td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{String(item.created_at || "-").slice(0, 10)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      )}
      {tab === "signatures" && (
        <Card flush className="an-rise">
          {signatures.length === 0 ? <Empty icon="pen-line" title="Sin solicitudes de firma">No hay solicitudes de firma reales para mostrar.</Empty> : (
            <div className="table-scroll"><table className="tbl"><thead><tr><th>Documento</th><th>Firmante</th><th>Estado</th><th>Vence</th></tr></thead><tbody>{signatures.map((item) => <tr key={item.idRequest || item.id}><td>{item.ps520IdDocument || item.document_id}</td><td>{item.signer_identification}</td><td><Badge tone={item.status === "signed" ? "success" : "warning"} dot>{item.status}</Badge></td><td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{String(item.expires_at || "-").slice(0, 10)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      )}
      {creatingIntegration && <IntegrationModal onClose={() => setCreatingIntegration(false)} onCreated={(created) => liveIntegrations.setData((current) => [created, ...(current || [])])} />}
    </>
  );
}

window.SettingsPage = SettingsPage;
