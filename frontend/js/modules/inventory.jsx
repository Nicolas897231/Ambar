/* ============================================================
   AMBAR - Archivo & Custodia: Inventarios vivos
   ============================================================ */
const { useState: invS } = React;

function InventoryPage({ navigate }) {
  const [q, setQ] = invS("");
  const { data: summary, loading: loadingSummary } = useLiveData(() => AmbarAPI.endpoints.locationsSummary(), {}, []);
  const { data: rawBoxes, loading: loadingBoxes } = useLiveData(() => AmbarAPI.endpoints.boxes(), [], []);
  const { data: rawUnassigned } = useLiveData(() => AmbarAPI.endpoints.locationsUnassigned(), {}, []);
  const boxes = AmbarAPI.listFrom(rawBoxes);
  const filtered = boxes.filter((box) => {
    const text = `${box.box_code || ""} ${box.box_name || ""} ${box.location_path || ""}`.toLowerCase();
    return text.includes(q.toLowerCase());
  });
  const unassignedTotal = (rawUnassigned.folders_without_box || []).length
    + (rawUnassigned.expedients_without_location || []).length
    + (rawUnassigned.documents_without_location || []).length
    + (rawUnassigned.boxes_without_shelf || []).length;
  const exportCsv = () => {
    const lines = ["codigo,nombre,archivo,ubicacion,carpetas,documentos,ocupacion,estado"];
    boxes.forEach((box) => lines.push([
      box.box_code || "",
      box.box_name || "",
      box.archive_name || box.archive_id || "",
      box.location_path || "",
      box.current_folders || 0,
      box.current_documents || 0,
      box.occupancy_percent || 0,
      box.status || "",
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")));
    downloadFile("inventario-cajas.csv", lines.join("\n"), "text/csv;charset=utf-8");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Archivo & Custodia</div>
          <h1>Inventarios</h1>
          <p className="lead">Inventario vivo de cajas, ocupación y unidades sin ubicación. No se muestran registros ficticios.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="download" onClick={exportCsv} disabled={!boxes.length}>Exportar CSV</Button>
          <Button icon="warehouse" onClick={() => navigate && navigate("archive")}>Ver archivo físico</Button>
        </div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="Archivos" value={summary.archives || 0} icon="warehouse" tone="brand" accent />
        <Metric label="Cajas" value={summary.boxes || 0} icon="boxes" tone="info" accent />
        <Metric label="Carpetas sin caja" value={summary.folders_without_box || 0} icon="folder" tone="warn" accent />
        <Metric label="Pendientes de ubicación" value={unassignedTotal} icon="alert-triangle" tone={unassignedTotal ? "danger" : "ok"} accent />
      </div>
      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar caja, archivo o ruta física..." /></div>
          <Badge tone="outline">{filtered.length} cajas</Badge>
        </div>
        {loadingSummary || loadingBoxes ? <Skeleton rows={8} /> : filtered.length === 0 ? (
          <Empty icon="boxes" title="Sin inventario">Aún no hay cajas reales para inventariar o el filtro no tiene resultados.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Caja</th><th>Archivo</th><th>Ruta física</th><th>Carpetas</th><th>Documentos</th><th>Ocupación</th><th>Estado</th></tr></thead>
              <tbody>{filtered.map((box) => (
                <tr key={box.idBox}>
                  <td className="cell-mono cell-strong">{box.box_code}</td>
                  <td>{box.archive_name || box.archive_id}</td>
                  <td className="mono compact-path">{box.location_path || "Sin ubicación topográfica"}</td>
                  <td>{box.current_folders || 0}</td>
                  <td>{box.current_documents || 0}</td>
                  <td><Meter value={box.occupancy_percent || 0} tone={(box.occupancy_percent || 0) >= 90 ? "danger" : (box.occupancy_percent || 0) >= 71 ? "warn" : "ok"} /></td>
                  <td><Badge tone={box.status === "full" ? "danger" : "success"} dot>{box.status || "active"}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

window.InventoryPage = InventoryPage;
