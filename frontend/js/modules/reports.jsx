const { useState: reS } = React;

const REPORT_TYPES = [
  { value: "operational", label: "Operacional" },
  { value: "executive", label: "Ejecutivo" },
  { value: "audit", label: "Auditoría" },
  { value: "compliance", label: "Cumplimiento" },
  { value: "hr", label: "Talento humano" },
];

function ReportJobsTable({ jobs, loading, onDownload }) {
  if (loading) return <div style={{ padding: "var(--s5)" }}><Skeleton rows={5} /></div>;
  if (!jobs.length) {
    return (
      <Empty icon="calendar" title="Sin reportes generados" action={null}>
        Genera un reporte desde esta pantalla. AMBAR lo registra, lo audita y lo deja listo para descarga.
      </Empty>
    );
  }
  return (
    <div className="table-scroll">
      <table className="tbl">
        <thead><tr><th>Reporte</th><th>Estado</th><th>Solicitado</th><th>Finalizado</th><th>Acción</th></tr></thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.idJob || job.id}>
              <td><span className="cell-strong">{REPORT_TYPES.find((item) => item.value === job.report_type)?.label || job.report_type}</span></td>
              <td><Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning"} dot>{job.status}</Badge></td>
              <td className="mono muted" style={{ fontSize: "var(--fs-xs)" }}>{String(job.created_at || "-").slice(0, 19).replace("T", " ")}</td>
              <td className="mono muted" style={{ fontSize: "var(--fs-xs)" }}>{String(job.completed_at || "-").slice(0, 19).replace("T", " ")}</td>
              <td>
                <Button size="sm" variant="ghost" icon="download" disabled={job.status !== "completed"} onClick={() => onDownload(job)}>
                  Descargar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsPage({ user }) {
  const [scope, setScope] = reS("doc");
  const [reportType, setReportType] = reS("operational");
  const [busy, setBusy] = reS("");
  const toast = useToast();
  const liveDashboard = useLiveData(() => AmbarAPI.endpoints.dashboard(), {}, []);
  const liveAdvanced = useLiveData(() => AmbarAPI.endpoints.dashboardAdvanced(), {}, []);
  const liveBi = useLiveData(() => AmbarAPI.endpoints.biDashboard(), {}, []);
  const liveJobs = useLiveData(() => AmbarAPI.endpoints.reportsJobs(), [], []);
  const dashboard = liveDashboard.data || {};
  const advanced = liveAdvanced.data || {};
  const bi = liveBi.data || {};
  const jobs = AmbarAPI.listFrom(liveJobs.data, ["jobs", "items", "results"]);
  const docsByStatus = dashboard.documents_by_status || {};
  const statusItems = Object.entries(docsByStatus).map(([label, value]) => ({ label, value }));
  const canRequestReports = can(user, ["report.request"]);
  const canRefreshBi = can(user, ["bi.refresh"]);

  const refreshBi = async () => {
    setBusy("bi");
    try {
      await AmbarAPI.endpoints.biRefresh();
      const updated = await AmbarAPI.endpoints.biDashboard();
      liveBi.setData(updated);
      toast("Indicadores gerenciales actualizados.", { tone: "ok", title: "BI actualizado" });
    } catch (err) {
      toast(err.message || "No fue posible actualizar BI.", { tone: "danger", title: "Error" });
    } finally {
      setBusy("");
    }
  };

  const createReport = async () => {
    if (!canRequestReports) {
      toast("Tu perfil no tiene permiso para generar reportes.", { tone: "danger", title: "Acceso restringido" });
      return;
    }
    setBusy("report");
    try {
      const created = await AmbarAPI.post("/reports/jobs", { report_type: reportType });
      liveJobs.setData((current) => [created, ...AmbarAPI.listFrom(current, ["jobs", "items", "results"])]);
      toast("Reporte generado y auditado.", { tone: "ok", title: "Reporte listo" });
    } catch (err) {
      toast(err.message || "No fue posible generar el reporte.", { tone: "danger", title: "Error" });
    } finally {
      setBusy("");
    }
  };

  const downloadReport = async (job) => {
    try {
      await AmbarAPI.endpoints.reportDownload(job.idJob || job.id);
      toast("Descarga iniciada.", { tone: "ok", title: "Reporte CSV" });
    } catch (err) {
      toast(err.message || "No fue posible descargar el reporte.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Inteligencia</div>
          <h1>Reportes y BI</h1>
          <p className="lead">Indicadores reales conectados a la base de datos, reportes auditados y tablero gerencial sin datos simulados.</p>
        </div>
        <div className="page-actions">
          <select value={reportType} onChange={(event) => setReportType(event.target.value)} disabled={!canRequestReports}>
            {REPORT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <Button icon="download" onClick={createReport} disabled={!canRequestReports || busy === "report"}>
            Generar reporte
          </Button>
          <Button variant="ghost" icon="refresh" onClick={refreshBi} disabled={!canRefreshBi || busy === "bi"}>
            Actualizar BI
          </Button>
        </div>
      </div>

      <Segmented options={[
        { value: "doc", label: "Gestión documental", icon: "file-text" },
        { value: "archive", label: "Archivo físico", icon: "warehouse" },
        { value: "hr", label: "Talento humano", icon: "briefcase" },
        { value: "bi", label: "BI ejecutivo", icon: "bar-chart" },
      ]} value={scope} onChange={setScope} />

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
        <Metric label="Préstamos activos" value={dashboard.active_loans || 0} icon="package-check" tone="warn" accent />
        <Metric label="Préstamos vencidos" value={dashboard.overdue_loans || 0} icon="clock" tone="danger" accent />
        <Metric label="Transferencias pendientes" value={dashboard.pending_transfers || 0} icon="route" tone="info" accent />
      </div>)}

      {scope === "hr" && (<div className="grid cols-4 stagger">
        <Metric label="Empleados" value={advanced.employees || 0} icon="users" tone="brand" accent />
        <Metric label="Contratos activos" value={advanced.active_contracts || 0} icon="file-check" tone="ok" accent />
        <Metric label="Tareas pendientes" value={advanced.pending_tasks || 0} icon="list-checks" tone="warn" accent />
        <Metric label="Carga operacional" value={advanced.operational_load || 0} icon="activity" tone="info" accent />
      </div>)}

      {scope === "bi" && (<>
        <div className="grid cols-4 stagger">
          <Metric label="Documentos" value={bi.documents || 0} icon="file-text" tone="brand" accent />
          <Metric label="Tareas pendientes" value={bi.pending_tasks || 0} icon="list-checks" tone="warn" accent />
          <Metric label="OCR completado" value={bi.ocr_success_rate || 0} suffix="%" icon="scan-line" tone="info" accent />
          <Metric label="Riesgo operativo" value={bi.risk_level || "Sin dato"} icon="alert-triangle" tone={bi.risk_level === "Alto" ? "danger" : bi.risk_level === "Medio" ? "warn" : "ok"} accent />
        </div>
        <Card className="an-rise"><CardHead title="Lectura ejecutiva" sub="Calculada desde documentos, tareas, OCR, firmas, integraciones y auditoría." icon="activity" /><div className="grid cols-3">
          <Metric label="Empleados" value={bi.employees || 0} icon="users" tone="brand" />
          <Metric label="Firmas pendientes" value={bi.signatures_pending || 0} icon="pen-line" tone="warn" />
          <Metric label="Integraciones fallidas" value={bi.failed_integrations || 0} icon="plug-zap" tone={bi.failed_integrations ? "danger" : "ok"} />
        </div></Card>
      </>)}

      <Card flush className="an-rise">
        <div className="row between wrap" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
          <CardHead title="Reportes generados" sub="Jobs reales creados desde backend y auditados por usuario." icon="calendar" />
          <Badge tone="outline">{jobs.length} reportes</Badge>
        </div>
        <ReportJobsTable jobs={jobs} loading={liveJobs.loading} onDownload={downloadReport} />
      </Card>
    </>
  );
}

window.ReportsPage = ReportsPage;
