/* ============================================================
   AMBAR - Archivo & Custodia: FUID operativo
   ============================================================ */
const { useState: fuidS } = React;

function fuidStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("reject")) return "danger";
  if (value.includes("partial") || value.includes("review") || value.includes("outdated")) return "warning";
  if (value.includes("accepted") || value.includes("closed")) return "success";
  return "info";
}

function FuidDetail({ item, onClose }) {
  const metadata = item.metadata || item.metadata_json || {};
  const rows = metadata.items || item.items || [];
  const [compare, setCompare] = fuidS(null);
  const [loadingCompare, setLoadingCompare] = fuidS(false);
  const loadCompare = async () => {
    setLoadingCompare(true);
    try {
      setCompare(await AmbarAPI.get(`/archives/fuid/${item.idFuid}/compare-reception`));
    } finally {
      setLoadingCompare(false);
    }
  };
  return (
    <Drawer wide title={item.fuid_code} sub={`Versión ${metadata.version || 1} - ${metadata.status || item.status || "generated"}`} onClose={onClose}
      headExtra={<Badge tone={fuidStatusTone(metadata.status || item.status)} dot>{metadata.status || item.status || "generated"}</Badge>}>
      <div className="grid cols-3" style={{ gap: "var(--s3)" }}>
        <Metric label="Ítems inventariados" value={rows.length} icon="clipboard" tone="brand" />
        <Metric label="Folios declarados" value={item.folio_total || metadata.folio_total || 0} icon="file-text" tone="info" />
        <Metric label="Inconsistencias" value={rows.filter((row) => (row.inconsistencies || []).length).length} icon="alert-triangle" tone="danger" />
      </div>
      <div className="row gap2 wrap" style={{ margin: "var(--s4) 0" }}>
        <Button icon="download" onClick={() => AmbarAPI.download(`/archives/fuid/${item.idFuid}/export?format=csv`, `${item.fuid_code}.csv`)}>Exportar CSV</Button>
        <Button variant="secondary" icon="git-branch" onClick={loadCompare} disabled={loadingCompare}>{loadingCompare ? "Comparando" : "Comparar recepción"}</Button>
      </div>
      {compare && (
        <Card pad="sm" style={{ marginBottom: "var(--s4)" }}>
          <CardHead title="Comparación contra recepción" sub="Declarado en FUID vs recibido realmente." icon="git-branch" />
          <div className="row wrap gap2">
            {Object.entries(compare.summary || {}).map(([key, value]) => <Badge key={key} tone={value ? "warning" : "success"}>{key}: {value}</Badge>)}
          </div>
        </Card>
      )}
      <Card pad="sm">
        <CardHead title="Registros FUID" sub="Inventario archivístico operativo asociado a expediente o transferencia." icon="clipboard" />
        {rows.length === 0 ? <Empty icon="clipboard" title="Sin registros">Este FUID aún no tiene ítems detallados.</Empty> : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>#</th><th>Unidad</th><th>Tipo</th><th>Serie</th><th>Folios</th><th>Ubicación</th><th>Estado</th></tr></thead>
              <tbody>{rows.map((row, index) => (
                <tr key={`${row.documentary_unit_type}-${row.documentary_unit_id}-${index}`}>
                  <td className="mono">{row.order_number || index + 1}</td>
                  <td className="cell-strong">{row.unit_title || row.unit_code || "Unidad documental"}</td>
                  <td>{row.documentary_unit_type}</td>
                  <td>{row.series_id || "-"}</td>
                  <td className="mono">{row.total_folios_declared || row.folio_total || 0}</td>
                  <td className="mono compact-path">{row.physical_location_path || "Sin ubicación"}</td>
                  <td><Badge tone={fuidStatusTone(row.status)} dot>{row.status || "generated"}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </Drawer>
  );
}

function FuidPage({ user }) {
  const [selected, setSelected] = fuidS(null);
  const [status, setStatus] = fuidS("");
  const { data: rawRows, loading } = useLiveData(() => AmbarAPI.get(`/archives/fuid${status ? `?status_filter=${encodeURIComponent(status)}` : ""}`), [], [status]);
  const rows = AmbarAPI.listFrom(rawRows);
  const inconsistencies = rows.reduce((acc, row) => {
    const meta = row.metadata || row.metadata_json || {};
    return acc + (meta.items || []).filter((item) => (item.inconsistencies || []).length).length;
  }, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Archivo & Custodia</div>
          <h1>FUID</h1>
          <p className="lead">Inventario único documental conectado a expedientes, transferencias, recepción, Kardex y auditoría.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="download" onClick={() => AmbarAPI.download("/archives/fuid.csv", "ambar-fuid.csv")} disabled={!rows.length}>Exportar listado</Button>
        </div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="FUID generados" value={rows.length} icon="clipboard" tone="brand" accent />
        <Metric label="Con transferencia" value={rows.filter((row) => row.transfer_id).length} icon="route" tone="info" accent />
        <Metric label="Con expediente" value={rows.filter((row) => row.expedient_id).length} icon="folder-kanban" tone="ok" accent />
        <Metric label="Inconsistencias" value={inconsistencies} icon="alert-triangle" tone="danger" accent />
      </div>
      <Card flush className="an-rise">
        <div className="row between wrap gap3" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
          <b>Inventarios FUID</b>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            <option value="generated">Generado</option>
            <option value="under_review">En revisión</option>
            <option value="accepted">Aceptado</option>
            <option value="partially_received">Parcial</option>
            <option value="rejected">Rechazado</option>
            <option value="closed">Cerrado</option>
            <option value="outdated">Desactualizado</option>
          </select>
        </div>
        {loading ? <Skeleton rows={8} /> : rows.length === 0 ? (
          <Empty icon="clipboard" title="Sin FUID">No hay inventarios FUID reales para este filtro.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Código</th><th>Archivo</th><th>Expediente</th><th>Transferencia</th><th>Versión</th><th>Folios</th><th>Estado</th><th></th></tr></thead>
              <tbody>{rows.map((row) => {
                const meta = row.metadata || row.metadata_json || {};
                return (
                  <tr key={row.idFuid} className="clickable" onClick={() => setSelected(row)}>
                    <td className="cell-mono cell-strong">{row.fuid_code}</td>
                    <td>{row.archive_id || "-"}</td>
                    <td>{row.expedient_id || "-"}</td>
                    <td>{row.transfer_id || "-"}</td>
                    <td className="mono">{meta.version || 1}</td>
                    <td className="mono">{row.folio_total || 0}</td>
                    <td><Badge tone={fuidStatusTone(meta.status || row.status)} dot>{meta.status || row.status || "generated"}</Badge></td>
                    <td><Button variant="subtle" size="sm" icon="chevron-right" onClick={(event) => { event.stopPropagation(); setSelected(row); }} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
      {selected && <FuidDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

window.FuidPage = FuidPage;
