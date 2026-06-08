/* ============================================================
   AMBAR — Gestión Documental: TRD & Retención
   ============================================================ */
const { useState: tdS } = React;

const SERIES = [
  { code: "100", name: "Actas", sub: ["Actas de comité directivo", "Actas de junta"], gestion: 2, central: 8, final: "Conservación total" },
  { code: "200", name: "Contratos", sub: ["Contratos laborales", "Contratos de prestación", "Contratos de obra"], gestion: 5, central: 15, final: "Conservación total" },
  { code: "300", name: "Historias Laborales", sub: ["Hoja de vida", "Afiliaciones", "Novedades"], gestion: 5, central: 80, final: "Conservación total" },
  { code: "400", name: "Correspondencia", sub: ["Comunicaciones oficiales recibidas", "Comunicaciones enviadas"], gestion: 2, central: 3, final: "Eliminación" },
  { code: "500", name: "Informes", sub: ["Informes de gestión", "Informes financieros"], gestion: 2, central: 5, final: "Selección" },
];

function TRDPage({ user }) {
  const [tab, setTab] = tdS("series");
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Gestión Documental</div><h1>TRD & Retención</h1><p className="lead">Tabla de Retención Documental: define cuánto tiempo se conserva cada tipo de documento y su disposición final (conservar, eliminar o seleccionar).</p></div><div className="page-actions">{can(user, ["trd.manage"]) && <Button icon="plus">Nueva serie</Button>}</div></div>
      <div className="page-intro an-rise"><span className="pi-ico"><Icon name="table" size={18} /></span><div><h4>¿Qué es la TRD?</h4><p>Es el instrumento que organiza los documentos en series y subseries, y establece sus tiempos de retención en cada archivo y qué hacer al final de su ciclo de vida. AMBAR la usa para calcular vencimientos y transferencias automáticamente.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "series", label: "Series & Subseries", icon: "table" }, { key: "retention", label: "Retención", icon: "clock" }, { key: "disposition", label: "Disposición final", icon: "package-check" }]} />
      {tab === "series" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Código</th><th>Serie documental</th><th>Subseries</th><th>Disposición final</th></tr></thead><tbody>
          {SERIES.map(s => (<tr key={s.code}><td className="cell-mono cell-strong">{s.code}</td><td className="cell-strong">{s.name}</td><td><div className="row wrap gap2">{s.sub.map(x => <span key={x} className="tag-soft">{x}</span>)}</div></td><td><Badge tone={s.final === "Eliminación" ? "danger" : s.final === "Selección" ? "warning" : "success"}>{s.final}</Badge></td></tr>))}
        </tbody></table></div></Card>
      )}
      {tab === "retention" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Código</th><th>Serie</th><th>Archivo de Gestión</th><th>Archivo Central</th><th>Retención total</th></tr></thead><tbody>
          {SERIES.map(s => (<tr key={s.code}><td className="cell-mono">{s.code}</td><td className="cell-strong">{s.name}</td><td><Badge tone="info">{s.gestion} años</Badge></td><td><Badge tone="brand">{s.central} años</Badge></td><td className="mono">{s.gestion + s.central} años</td></tr>))}
        </tbody></table></div></Card>
      )}
      {tab === "disposition" && (
        <div className="grid cols-3 stagger">
          {[["Conservación total", "success", "shield-check", "Documentos con valor histórico que se conservan permanentemente."], ["Selección", "warning", "filter", "Se conserva una muestra representativa; el resto se elimina."], ["Eliminación", "danger", "trash", "Documentos sin valor secundario, eliminables tras su retención legal."]].map(([t, tn, ic, d], i) => (
            <Card key={t} style={{ "--i": i }}><div className="row gap2" style={{ marginBottom: "var(--s2)" }}><span className="m-icon" style={{ background: `var(--${tn === "success" ? "ok" : tn === "warning" ? "warn" : "danger"}-bg)`, color: `var(--${tn === "success" ? "ok" : tn === "warning" ? "warn" : "danger"})` }}><Icon name={ic} size={18} /></span><h3 style={{ fontSize: "var(--fs-md)" }}>{t}</h3></div><p className="muted" style={{ fontSize: "var(--fs-sm)" }}>{d}</p><div className="divider" /><div className="row between"><span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Series con esta disposición</span><Badge tone={tn}>{SERIES.filter(s => s.final === t).length}</Badge></div></Card>
          ))}
          <Card style={{ gridColumn: "1 / -1" }} className="an-rise"><div className="page-intro" style={{ background: "var(--danger-bg)", border: "none" }}><span className="pi-ico" style={{ background: "var(--danger)" }}><Icon name="alert-triangle" size={16} /></span><div><h4>Disposición final requiere aprobación múltiple</h4><p>La eliminación de documentos genera un acta de baja que debe ser aprobada por el Jefe de Archivo y refrendada por el Comité. Cada acción queda en auditoría — nunca se elimina sin rastro.</p></div></div></Card>
        </div>
      )}
    </>
  );
}
window.TRDPage = TRDPage;
