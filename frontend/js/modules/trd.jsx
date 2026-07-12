/* ============================================================
   AMBAR - Gestion Documental: TRD & Retencion
   ============================================================ */
const { useState: tdS } = React;

function normalizeDisposition(value) {
  const raw = String(value || "").trim();
  const map = { CT: "Conservacion total", E: "Eliminacion", S: "Seleccion", MT: "Medio tecnologico" };
  return map[raw] || raw || "Conservacion total";
}

function mapTrdRows(items) {
  return (items || []).map((item, i) => ({
    id: item.idSeries || item.series_id || item.id || i,
    code: item.series_code || item.code || String(i + 1).padStart(3, "0"),
    name: item.series_name || item.name || item.subseries_name || "Serie documental",
    sub: Array.isArray(item.subseries)
      ? item.subseries.map(s => s.subseries_name || s.name || s.code).filter(Boolean)
      : item.subseries_name ? [item.subseries_name] : [],
    gestion: item.retention_management_years ?? item.management_retention_years ?? item.gestion ?? 0,
    central: item.retention_central_years ?? item.central_retention_years ?? item.central ?? 0,
    final: normalizeDisposition(item.final_disposition || item.disposition || item.disposition_final),
  }));
}

function dispositionTone(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("elimin")) return "danger";
  if (v.includes("sele")) return "warning";
  return "success";
}

function CreateSeriesModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({ code: "", name: "", description: "", dependency_id: "", status: "active" });
  const { data: depsRaw } = useLiveData(() => AmbarAPI.endpoints.trdDependencies(), [], []);
  const dependencies = AmbarAPI.listFrom(depsRaw);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    const missing = [];
    if (!payload.name.trim()) missing.push("nombre");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Serie incompleta" });
      return;
    }
    try {
      const body = { ...payload, dependency_id: payload.dependency_id ? Number(payload.dependency_id) : null };
      const created = await AmbarAPI.post("/trd/series", body);
      toast("Serie creada en la TRD.", { tone: "ok", title: "TRD actualizada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la serie.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal title="Nueva serie documental" sub="La serie queda gobernada por una dependencia TRD." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear serie</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" help="AMBAR genera este código automáticamente al guardar la serie."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input maxLength={160} value={payload.name} onChange={e => setField("name", e.target.value)} placeholder="Historias laborales" /></Field>
        <Field label="Dependencia"><select value={payload.dependency_id} onChange={e => setField("dependency_id", e.target.value)}><option value="">Usar dependencia por defecto</option>{dependencies.map(d => <option key={d.idDependency || d.id} value={d.idDependency || d.id}>{d.name || d.code}</option>)}</select></Field>
        <Field label="Estado"><select value={payload.status} onChange={e => setField("status", e.target.value)}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripcion"><textarea value={payload.description} maxLength={500} onChange={e => setField("description", e.target.value)} placeholder="Alcance documental de esta serie" /></Field></div>
      </div>
    </Modal>
  );
}

function CreateDependencyModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({ code: "", name: "", description: "", status: "active" });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    if (!payload.name.trim()) {
      toast("El nombre es obligatorio. El código lo puede generar AMBAR.", { tone: "danger", title: "Dependencia incompleta" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/trd/dependencies", payload);
      toast("Dependencia creada para gobernar series documentales.", { tone: "ok", title: "TRD actualizada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la dependencia.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal title="Nueva dependencia" sub="Toda serie debe pertenecer a una dependencia funcional." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear dependencia</Button></>}>
      <div className="grid cols-2">
        <Field label="Código" help="AMBAR genera este código automáticamente al guardar la dependencia."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input value={payload.name} maxLength={160} onChange={e => setField("name", e.target.value)} placeholder="Talento Humano" /></Field>
        <Field label="Estado"><select value={payload.status} onChange={e => setField("status", e.target.value)}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripcion"><textarea value={payload.description} maxLength={500} onChange={e => setField("description", e.target.value)} placeholder="Funcion documental de la dependencia" /></Field></div>
      </div>
    </Modal>
  );
}

function TRDPage({ user }) {
  const [tab, setTab] = tdS("series");
  const [creating, setCreating] = tdS(false);
  const [creatingDep, setCreatingDep] = tdS(false);
  const liveSeries = window.useLiveData(
    () => window.AmbarAPI.endpoints.trdEditor().then(value => mapTrdRows(window.AmbarAPI.listFrom(value, ["rows", "items", "results"]))),
    [],
    []
  );
  const liveDependencies = window.useLiveData(() => window.AmbarAPI.endpoints.trdDependencies(), [], []);
  const series = liveSeries.data;
  const dependencies = window.AmbarAPI.listFrom(liveDependencies.data);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestion Documental</div>
          <h1>TRD & Retencion</h1>
          <p className="lead">Tabla de Retencion Documental: define cuanto tiempo se conserva cada tipo de documento y su disposicion final.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="download" onClick={() => AmbarAPI.download("/trd/export?format=csv", "TRD_AMBAR.csv")}>Exportar TRD</Button>
          {can(user, ["trd.manage"]) && <Button variant="ghost" icon="building" onClick={() => setCreatingDep(true)}>Nueva dependencia</Button>}
          {can(user, ["trd.manage"]) && <Button icon="plus" onClick={() => setCreating(true)}>Nueva serie</Button>}
        </div>
      </div>
      <div className="page-intro an-rise">
        <span className="pi-ico"><Icon name="table" size={18} /></span>
        <div>
          <h4>Que es la TRD</h4>
          <p>Es el instrumento que organiza dependencias, series, subseries y tipologias. AMBAR la usa como motor para clasificar documentos, calcular retencion y preparar transferencias.</p>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "dependencies", label: "Dependencias", icon: "building" }, { key: "series", label: "Series y subseries", icon: "table" }, { key: "retention", label: "Retencion", icon: "clock" }, { key: "disposition", label: "Disposicion final", icon: "package-check" }]} />

      {tab === "dependencies" && (
        <Card flush className="an-rise">
          {liveDependencies.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={5} /></div> : dependencies.length === 0 ? <Empty icon="building" title="Sin dependencias">Crea dependencias antes de estructurar series documentales.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Codigo</th><th>Dependencia</th><th>Estado</th><th>Descripcion</th></tr></thead>
                <tbody>{dependencies.map(dep => <tr key={dep.idDependency || dep.id}>
                  <td className="cell-mono cell-strong">{dep.code}</td>
                  <td className="cell-strong">{dep.name}</td>
                  <td><Badge tone={dep.status === "active" ? "success" : "neutral"}>{dep.status}</Badge></td>
                  <td className="muted">{dep.description || "-"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "series" && (
        <Card flush className="an-rise">
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Codigo</th><th>Serie documental</th><th>Subseries</th><th>Disposicion final</th></tr></thead>
              <tbody>
                {series.map(s => (
                  <tr key={s.code}>
                    <td className="cell-mono cell-strong">{s.code}</td>
                    <td className="cell-strong">{s.name}</td>
                    <td><div className="row wrap gap2">{(s.sub || []).map(x => <span key={x} className="tag-soft">{x}</span>)}</div></td>
                    <td><Badge tone={dispositionTone(s.final)}>{s.final}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "retention" && (
        <Card flush className="an-rise">
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Codigo</th><th>Serie</th><th>Archivo de Gestion</th><th>Archivo Central</th><th>Retencion total</th></tr></thead>
              <tbody>
                {series.map(s => (
                  <tr key={s.code}>
                    <td className="cell-mono">{s.code}</td>
                    <td className="cell-strong">{s.name}</td>
                    <td><Badge tone="info">{s.gestion} anos</Badge></td>
                    <td><Badge tone="brand">{s.central} anos</Badge></td>
                    <td className="mono">{Number(s.gestion || 0) + Number(s.central || 0)} anos</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "disposition" && (
        <div className="grid cols-3 stagger">
          {[["Conservacion total", "success", "shield-check", "Documentos con valor historico que se conservan permanentemente."], ["Seleccion", "warning", "filter", "Se conserva una muestra representativa; el resto se elimina."], ["Eliminacion", "danger", "trash", "Documentos sin valor secundario, eliminables tras su retencion legal."]].map(([t, tn, ic, d], i) => (
            <Card key={t} style={{ "--i": i }}>
              <div className="row gap2" style={{ marginBottom: "var(--s2)" }}>
                <span className="m-icon" style={{ background: `var(--${tn === "success" ? "ok" : tn === "warning" ? "warn" : "danger"}-bg)`, color: `var(--${tn === "success" ? "ok" : tn === "warning" ? "warn" : "danger"})` }}><Icon name={ic} size={18} /></span>
                <h3 style={{ fontSize: "var(--fs-md)" }}>{t}</h3>
              </div>
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>{d}</p>
              <div className="divider" />
              <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Series con esta disposicion</span><Badge tone={tn}>{series.filter(s => s.final === t).length}</Badge></div>
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateSeriesModal onClose={() => setCreating(false)} onCreated={(created) => liveSeries.setData(current => [mapTrdRows([created])[0], ...(current || [])])} />}
      {creatingDep && <CreateDependencyModal onClose={() => setCreatingDep(false)} onCreated={(created) => liveDependencies.setData(current => [created, ...(current || [])])} />}
    </>
  );
}
window.TRDPage = TRDPage;
