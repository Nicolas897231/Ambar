/* ============================================================
   AMBAR — Inteligencia: Reportes & BI
   ============================================================ */
const { useState: reS } = React;

function ReportsPage({ user }) {
  const [scope, setScope] = reS("doc");
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Inteligencia</div><h1>Reportes & BI</h1><p className="lead">Tableros visuales para la toma de decisiones. Filtra por área de negocio, programa envíos automáticos y exporta a PDF o Excel.</p></div><div className="page-actions"><Button variant="ghost" icon="calendar">Programar</Button><Button variant="ghost" icon="download">Excel</Button><Button icon="printer">Exportar PDF</Button></div></div>
      <div className="row between wrap" style={{ gap: "var(--s3)" }}>
        <Segmented options={[{ value: "doc", label: "Gestión Documental", icon: "file-text" }, { value: "archive", label: "Archivo Físico", icon: "warehouse" }, { value: "hr", label: "RRHH", icon: "briefcase" }, { value: "recruit", label: "Reclutamiento", icon: "user-plus" }]} value={scope} onChange={setScope} />
        <div className="row gap2"><span className="tag-soft"><Icon name="calendar" size={12} /> Año 2026</span><FilterChip label="Todas las sedes" icon="building" /></div>
      </div>

      {scope === "doc" && (<>
        <div className="grid cols-4 stagger">
          <Metric label="Documentos registrados" value={48230} icon="file-text" tone="brand" accent trend="+8.2%" trendDir="up" />
          <Metric label="Digitalizados" value={39817} icon="scan-line" tone="info" accent trend="+12%" trendDir="up" />
          <Metric label="Cumplimiento TRD" value={94} suffix="%" icon="shield-check" tone="ok" accent />
          <Metric label="Consultas (mes)" value={9120} icon="search" tone="brand" accent trend="+5%" trendDir="up" />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          <Card className="an-rise"><CardHead title="Documentos registrados vs digitalizados" sub="Comparativo mensual 2026" icon="bar-chart" /><BarChart multi data={[[4100, 3200], [4300, 3500], [4200, 3600], [4800, 4100], [5100, 4400], [5400, 4900]]} labels={["Ene", "Feb", "Mar", "Abr", "May", "Jun"]} height={240} /><div className="row gap4" style={{ marginTop: "var(--s3)", justifyContent: "center" }}><span className="row gap2" style={{ fontSize: "var(--fs-sm)" }}><span className="heat" style={{ background: "var(--viz-amber)" }} />Registrados</span><span className="row gap2" style={{ fontSize: "var(--fs-sm)" }}><span className="heat" style={{ background: "var(--viz-teal)" }} />Digitalizados</span></div></Card>
          <Card className="an-rise"><CardHead title="Documentos por área" icon="pie-chart" /><Donut centerValue="48k" centerLabel="total" data={[{ label: "RRHH", value: 14200 }, { label: "Jurídica", value: 11800 }, { label: "Financiera", value: 9600 }, { label: "Operaciones", value: 7800 }, { label: "Otras", value: 4830 }]} /></Card>
        </div>
      </>)}

      {scope === "archive" && (<>
        <div className="grid cols-4 stagger">
          <Metric label="Cajas archivadas" value={1287} icon="boxes" tone="brand" accent />
          <Metric label="Ocupación media" value={76} suffix="%" icon="warehouse" tone="warn" accent />
          <Metric label="Transferencias (mes)" value={11} icon="route" tone="info" accent />
          <Metric label="Físico vs digital" value={83} suffix="%" icon="scan-line" tone="ok" accent foot="con copia digital" />
        </div>
        <div className="grid cols-2">
          <Card className="an-rise"><CardHead title="Ocupación por archivo" icon="warehouse" /><BarsH items={[{ label: "Archivo de Gestión", value: 64 }, { label: "Archivo Central", value: 88 }, { label: "Archivo Histórico", value: 71 }]} valueFmt={v => v + "%"} /></Card>
          <Card className="an-rise"><CardHead title="Transferencias por estado" icon="route" /><Donut centerValue="34" centerLabel="lotes" data={[{ label: "Aceptadas", value: 22, color: "var(--ok)" }, { label: "En tránsito", value: 8, color: "var(--viz-sky)" }, { label: "Rechazadas", value: 4, color: "var(--danger)" }]} /></Card>
        </div>
      </>)}

      {scope === "hr" && (<>
        <div className="grid cols-4 stagger">
          <Metric label="Empleados activos" value={248} icon="users" tone="brand" accent />
          <Metric label="Contratos por vencer" value={7} icon="file-clock" tone="danger" accent />
          <Metric label="Exámenes vigentes" value={93} suffix="%" icon="stethoscope" tone="ok" accent />
          <Metric label="Rotación anual" value={6.4} suffix="%" decimals={1} icon="trending-down" tone="ok" accent trendDir="down" />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          <Card className="an-rise"><CardHead title="Empleados por área" icon="bar-chart" /><BarChart data={[78, 52, 34, 28, 21, 18, 17]} labels={["Oper.", "Com.", "Fin.", "TI", "RRHH", "Jur.", "Compras"]} color="var(--viz-rose)" height={230} /></Card>
          <Card className="an-rise"><CardHead title="Contratos por tipo" icon="pie-chart" /><Donut centerValue="248" centerLabel="empleados" data={[{ label: "Indefinido", value: 186 }, { label: "Término fijo", value: 44 }, { label: "Prestación", value: 18 }]} /></Card>
        </div>
      </>)}

      {scope === "recruit" && (<>
        <div className="grid cols-4 stagger">
          <Metric label="Vacantes activas" value={6} icon="briefcase" tone="brand" accent />
          <Metric label="Candidatos" value={84} icon="users" tone="info" accent />
          <Metric label="Tiempo medio contratación" value={21} suffix=" d" icon="clock" tone="ok" accent trendDir="down" />
          <Metric label="Tasa de aceptación" value={68} suffix="%" icon="user-check" tone="ok" accent />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          <Card className="an-rise"><CardHead title="Embudo de selección" sub="Candidatos por etapa" icon="workflow" /><BarChart data={[84, 52, 31, 19, 11, 8]} labels={["Post.", "Pre.", "Entr.", "Prueba", "Valid.", "Contr."]} color="var(--viz-indigo)" height={230} /></Card>
          <Card className="an-rise"><CardHead title="Fuentes de reclutamiento" icon="pie-chart" /><Donut centerValue="84" centerLabel="candidatos" data={[{ label: "LinkedIn", value: 38 }, { label: "Portal web", value: 26 }, { label: "Referidos", value: 14 }, { label: "Otros", value: 6 }]} /></Card>
        </div>
      </>)}

      <Card className="an-rise"><CardHead title="Reportes programados" sub="Se generan y envían automáticamente" icon="calendar" action={<Button variant="ghost" size="sm" icon="plus">Nuevo</Button>} />
        <div className="col gap2">{[["Indicadores documentales", "Mensual · 1er día", "PDF → Gerencia"], ["Vencimientos RRHH", "Semanal · Lunes", "Excel → RRHH"], ["Ocupación de archivo", "Trimestral", "PDF → Jefe Archivo"]].map(([n, f, d], i) => (<div key={i} className="list-row"><Icon name="calendar" size={18} style={{ color: "var(--brand)" }} /><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{n}</div><small className="muted">{f} · {d}</small></div><Badge tone="success" dot>Activo</Badge><Button variant="subtle" size="sm" icon="more-horizontal" /></div>))}</div>
      </Card>
    </>
  );
}
window.ReportsPage = ReportsPage;
