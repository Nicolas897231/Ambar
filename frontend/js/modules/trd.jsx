/* ============================================================
   AMBAR - Gestion Documental: TRD & Retencion
   ============================================================ */
const { useState: tdS } = React;

const SERIES = [];

function normalizeDisposition(value) {
  const raw = String(value || "").trim();
  const map = { CT: "Conservacion total", E: "Eliminacion", S: "Seleccion", MT: "Medio tecnologico" };
  return map[raw] || raw || "Conservacion total";
}

function mapTrdRows(items) {
  return (items || []).map((item, i) => ({
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

function TRDPage({ user }) {
  const [tab, setTab] = tdS("series");
  const liveSeries = window.useLiveData(
    () => window.AmbarAPI.endpoints.trdEditor().then(value => mapTrdRows(window.AmbarAPI.listFrom(value, ["rows", "items", "results"]))),
    [],
    []
  );
  const series = liveSeries.data;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestion Documental</div>
          <h1>TRD & Retencion</h1>
          <p className="lead">Tabla de Retencion Documental: define cuanto tiempo se conserva cada tipo de documento y su disposicion final.</p>
        </div>
        <div className="page-actions">{can(user, ["trd.manage"]) && <Button icon="plus">Nueva serie</Button>}</div>
      </div>
      <div className="page-intro an-rise">
        <span className="pi-ico"><Icon name="table" size={18} /></span>
        <div>
          <h4>Que es la TRD</h4>
          <p>Es el instrumento que organiza dependencias, series, subseries y tipologias. AMBAR la usa como motor para clasificar documentos, calcular retencion y preparar transferencias.</p>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "series", label: "Series & Subseries", icon: "table" }, { key: "retention", label: "Retencion", icon: "clock" }, { key: "disposition", label: "Disposicion final", icon: "package-check" }]} />
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
          <Card style={{ gridColumn: "1 / -1" }} className="an-rise">
            <div className="page-intro" style={{ background: "var(--danger-bg)", border: "none" }}>
              <span className="pi-ico" style={{ background: "var(--danger)" }}><Icon name="alert-triangle" size={16} /></span>
              <div><h4>La disposicion final requiere trazabilidad</h4><p>La eliminacion o seleccion documental debe quedar auditada y asociada a la TRD. AMBAR nunca debe eliminar sin rastro.</p></div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
window.TRDPage = TRDPage;
