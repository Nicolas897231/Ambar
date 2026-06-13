const { useState: reS } = React;

function ReportsPage() {
  const [scope, setScope] = reS("doc");
  const { data: dashboard } = useLiveData(() => AmbarAPI.endpoints.dashboard(), {}, []);
  const { data: advanced } = useLiveData(() => AmbarAPI.endpoints.dashboardAdvanced(), {}, []);
  const docsByStatus = dashboard.documents_by_status || {};
  const statusItems = Object.entries(docsByStatus).map(([label, value]) => ({ label, value }));
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Inteligencia</div><h1>Reportes & BI</h1><p className="lead">Indicadores conectados a la base de datos. No se muestran datos simulados.</p></div><div className="page-actions"><Button as="a" href="/api/v1/analytics/dashboard" variant="ghost" icon="download">JSON operacional</Button></div></div>
      <Segmented options={[{ value: "doc", label: "Gestion Documental", icon: "file-text" }, { value: "archive", label: "Archivo Fisico", icon: "warehouse" }, { value: "hr", label: "RRHH", icon: "briefcase" }]} value={scope} onChange={setScope} />

      {scope === "doc" && (<>
        <div className="grid cols-4 stagger">
          <Metric label="Documentos registrados" value={dashboard.total_documents || 0} icon="file-text" tone="brand" accent />
          <Metric label="Digitalizados" value={dashboard.digitalized_documents || 0} icon="scan-line" tone="info" accent />
          <Metric label="Cumplimiento TRD" value={dashboard.trd_compliance || 0} suffix="%" icon="shield-check" tone="ok" accent />
          <Metric label="Incompletos" value={dashboard.incomplete_documents || 0} icon="alert-triangle" tone="warn" accent />
        </div>
        <Card className="an-rise"><CardHead title="Documentos por estado" icon="bar-chart" />{statusItems.length ? <BarsH items={statusItems} valueFmt={window.fmtN} /> : <Empty icon="bar-chart" title="Sin datos">No hay documentos para graficar.</Empty>}</Card>
      </>)}

      {scope === "archive" && (<div className="grid cols-4 stagger">
        <Metric label="Cajas archivadas" value={dashboard.archived_boxes || 0} icon="boxes" tone="brand" accent />
        <Metric label="Prestamos activos" value={dashboard.active_loans || 0} icon="package-check" tone="warn" accent />
        <Metric label="Prestamos vencidos" value={dashboard.overdue_loans || 0} icon="clock" tone="danger" accent />
        <Metric label="Transferencias pendientes" value={dashboard.pending_transfers || 0} icon="route" tone="info" accent />
      </div>)}

      {scope === "hr" && (<div className="grid cols-4 stagger">
        <Metric label="Empleados" value={advanced.employees || 0} icon="users" tone="brand" accent />
        <Metric label="Contratos activos" value={advanced.active_contracts || 0} icon="file-check" tone="ok" accent />
        <Metric label="Tareas pendientes" value={advanced.pending_tasks || 0} icon="list-checks" tone="warn" accent />
        <Metric label="Carga operacional" value={advanced.operational_load || 0} icon="activity" tone="info" accent />
      </div>)}

      <Card className="an-rise">
        <CardHead title="Reportes programados" sub="Pendiente de configurar desde backend" icon="calendar" />
        <Empty icon="calendar" title="Sin programaciones">No hay reportes programados registrados en la base de datos.</Empty>
      </Card>
    </>
  );
}

window.ReportsPage = ReportsPage;
