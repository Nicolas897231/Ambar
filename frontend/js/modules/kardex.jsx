/* ============================================================
   AMBAR - Archivo & Custodia: Kardex documental
   ============================================================ */
const { useState: kdxS } = React;

function eventTone(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("reject") || text.includes("rejected") || text.includes("venc")) return "danger";
  if (text.includes("accepted") || text.includes("returned") || text.includes("closed")) return "success";
  if (text.includes("loan") || text.includes("transfer")) return "info";
  return "brand";
}

function eventLabel(value) {
  const map = {
    "transfer": "Transferencia",
    "reception.item.accepted": "Recepción aceptada",
    "reception.item.rejected": "Recepción rechazada",
    "reception.item.partially_received": "Recepción parcial",
    "reception.closed": "Recepción cerrada",
    "custody.changed": "Cambio de custodia",
    "location_change": "Cambio de ubicación",
    "loan.created": "Préstamo creado",
    "loan.returned": "Devolución",
    "fuid.generated": "FUID generado",
    "fuid.exported": "FUID exportado",
  };
  return map[value] || String(value || "Movimiento documental");
}

function KardexPage({ user }) {
  const [movementType, setMovementType] = kdxS("");
  const [entityType, setEntityType] = kdxS("");
  const [status, setStatus] = kdxS("");
  const [dateFrom, setDateFrom] = kdxS("");
  const [dateTo, setDateTo] = kdxS("");
  const [page, setPage] = kdxS(0);
  const pageSize = 10;
  const fromParam = dateFrom ? `${dateFrom}T00:00:00` : "";
  const toParam = dateTo ? `${dateTo}T23:59:59` : "";
  const query = [
    movementType && `movement_type=${encodeURIComponent(movementType)}`,
    entityType && `entity_type=${encodeURIComponent(entityType)}`,
    status && `status=${encodeURIComponent(status)}`,
    fromParam && `date_from=${encodeURIComponent(fromParam)}`,
    toParam && `date_to=${encodeURIComponent(toParam)}`,
    `skip=${page * pageSize}`,
    `limit=${pageSize}`,
  ].filter(Boolean).join("&");
  const exportQuery = [
    movementType && `movement_type=${encodeURIComponent(movementType)}`,
    entityType && `entity_type=${encodeURIComponent(entityType)}`,
    status && `status=${encodeURIComponent(status)}`,
    fromParam && `date_from=${encodeURIComponent(fromParam)}`,
    toParam && `date_to=${encodeURIComponent(toParam)}`,
  ].filter(Boolean).join("&");
  const { data: summary, loading: loadingSummary } = useLiveData(() => AmbarAPI.endpoints.kardexSummary(), {}, []);
  const { data: rawRows, loading } = useLiveData(() => AmbarAPI.get(`/kardex/timeline?${query}`), [], [movementType, entityType, status, dateFrom, dateTo, page]);
  const rows = AmbarAPI.listFrom(rawRows);
  const exportCsv = () => AmbarAPI.download(`/kardex/export${exportQuery ? `?${exportQuery}` : ""}`, "ambar-kardex.csv");
  const estimatedTotal = page * pageSize + rows.length + (rows.length === pageSize ? 1 : 0);
  const resetAnd = (setter) => (value) => { setPage(0); setter(value); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Archivo & Custodia</div>
          <h1>Kardex documental</h1>
          <p className="lead">Timeline de movimientos documentales: transferencias, recepción, préstamos, devoluciones, ubicación y custodia.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="download" onClick={exportCsv} disabled={!rows.length || !can(user, ["document.read"])}>Exportar CSV</Button>
        </div>
      </div>

      <div className="grid cols-4 stagger">
        <Metric label="Documentos" value={summary.documents || 0} icon="file-text" tone="brand" accent />
        <Metric label="Transferencias pendientes" value={summary.pending_transfers || 0} icon="route" tone="warn" accent />
        <Metric label="Préstamos vencidos" value={summary.overdue_loans || 0} icon="alert-triangle" tone="danger" accent />
        <Metric label="Movimientos hoy" value={summary.today_movements || 0} icon="history" tone="info" accent />
      </div>

      <Card className="an-rise">
        <div className="row between wrap gap3" style={{ marginBottom: "var(--s4)" }}>
          <CardHead title="Timeline operacional" sub="Cada evento viene filtrado por archivos autorizados del usuario." icon="history" />
          <div className="filter-bar">
            <select value={movementType} onChange={(event) => resetAnd(setMovementType)(event.target.value)}>
              <option value="">Todos los movimientos</option>
              <option value="transfer">Transferencias</option>
              <option value="reception.item.accepted">Recepción aceptada</option>
              <option value="reception.item.rejected">Recepción rechazada</option>
              <option value="custody.changed">Custodia</option>
              <option value="location_change">Ubicación</option>
            </select>
            <select value={entityType} onChange={(event) => resetAnd(setEntityType)(event.target.value)}>
              <option value="">Todas las unidades</option>
              <option value="document">Documento</option>
              <option value="folder">Carpeta</option>
              <option value="expedient">Expediente</option>
              <option value="box">Caja</option>
              <option value="batch">Transferencia</option>
            </select>
            <select value={status} onChange={(event) => resetAnd(setStatus)(event.target.value)}>
              <option value="">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="accepted">Aceptado</option>
              <option value="rejected">Rechazado</option>
              <option value="completed">Completado</option>
            </select>
            <input type="date" value={dateFrom} onChange={(event) => resetAnd(setDateFrom)(event.target.value)} aria-label="Fecha desde" />
            <input type="date" value={dateTo} onChange={(event) => resetAnd(setDateTo)(event.target.value)} aria-label="Fecha hasta" />
          </div>
        </div>
        {loading || loadingSummary ? <Skeleton rows={10} /> : rows.length === 0 ? (
          <Empty icon="history" title="Sin movimientos">No hay eventos Kardex reales para estos filtros.</Empty>
        ) : (
          <div className="timeline">
            {rows.map((row) => (
              <div className="tl-item" key={row.idMovement}>
                <span className="tl-dot" />
                <div className="tl-card">
                  <div className="row between gap3">
                    <div className="row gap2 wrap">
                      <Badge tone={eventTone(row.movement_type)} dot>{eventLabel(row.movement_type)}</Badge>
                      <b>{row.movement_code}</b>
                    </div>
                    <small className="muted">{row.created_at ? new Date(row.created_at).toLocaleString("es-CO") : ""}</small>
                  </div>
                  <p className="muted">{row.observation || "Movimiento registrado automáticamente."}</p>
                  <div className="row wrap gap2">
                    <Badge tone="outline">{row.entity_type} #{row.entity_id}</Badge>
                    {row.origin_archive_id && <Badge tone="outline">Origen {row.origin_archive_id}</Badge>}
                    {row.destination_archive_id && <Badge tone="outline">Destino {row.destination_archive_id}</Badge>}
                    {row.action_by && <Badge tone="outline">Usuario {row.action_by}</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pager page={page} pageSize={pageSize} total={estimatedTotal} onPage={setPage} label="movimientos" />
      </Card>
    </>
  );
}

window.KardexPage = KardexPage;
