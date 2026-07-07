/* ============================================================
   AMBAR - Archivo & Custodia: Recepción documental
   ============================================================ */
const { useState: recS } = React;

const RECEPTION_STATUSES = ["shipped", "under_review", "partially_received", "received", "rejected", "closed"];

function receptionTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("reject")) return "danger";
  if (value.includes("partial") || value.includes("review")) return "warning";
  if (value.includes("received") || value.includes("closed")) return "success";
  return "info";
}

function ReceptionDetail({ batch, onClose, onRefresh }) {
  const toast = useToast();
  const [note, setNote] = recS("");
  const [reason, setReason] = recS("fuid_mismatch");
  const [busy, setBusy] = recS(false);
  const { data: rawItems, loading } = useLiveData(() => AmbarAPI.endpoints.receptionItems(batch.idBatch), [], [batch.idBatch, busy]);
  const { data: comparison } = useLiveData(() => AmbarAPI.endpoints.receptionComparison(batch.idBatch), {}, [batch.idBatch, busy]);
  const items = AmbarAPI.listFrom(rawItems);
  const decide = async (item, action) => {
    setBusy(true);
    try {
      const payload = {
        observation: note || (action === "accept" ? "Unidad recibida conforme." : "Diferencia registrada por recepción."),
        rejection_reason: action === "reject" || action === "partial" ? reason : null,
        received_quantity: action === "accept" ? (item.expected_quantity || 1) : Math.max(0, (item.expected_quantity || 1) - 1),
        received_folios: action === "accept" ? (item.expected_folios || item.folio_total || 0) : 0,
      };
      await AmbarAPI.post(`/transfer-batches/${batch.idBatch}/reception/items/${item.idBatchItem}/${action}`, payload);
      toast("Recepción actualizada.", { tone: "ok", title: "Movimiento registrado" });
      onRefresh && onRefresh();
    } catch (err) {
      toast(err.message || "No fue posible actualizar la recepción.", { tone: "danger", title: "Error de recepción" });
    } finally {
      setBusy(false);
    }
  };
  const closeReception = async () => {
    setBusy(true);
    try {
      await AmbarAPI.post(`/transfer-batches/${batch.idBatch}/reception/close`, { observation: note || "Recepción cerrada." });
      toast("Recepción cerrada con Kardex y auditoría.", { tone: "ok", title: "Proceso cerrado" });
      onRefresh && onRefresh();
      onClose();
    } catch (err) {
      toast(err.message || "Hay ítems pendientes o falta FUID.", { tone: "danger", title: "No se puede cerrar" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer wide title={`Recepción ${batch.batch_code}`} sub={`${batch.origin_archive_name || "Origen"} -> ${batch.destination_archive_name || "Destino"}`} onClose={onClose}
      headExtra={<Badge tone={receptionTone(batch.status)} dot>{batch.status}</Badge>}>
      <div className="grid cols-3" style={{ gap: "var(--s3)" }}>
        <Metric label="Ítems" value={items.length} icon="package-check" tone="brand" />
        <Metric label="Inconsistencias" value={(comparison.summary?.inconsistencies || 0)} icon="alert-triangle" tone="danger" />
        <Metric label="Coincidencias" value={(comparison.summary?.match || 0)} icon="check-circle" tone="ok" />
      </div>
      <Card pad="sm" style={{ margin: "var(--s4) 0" }}>
        <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
          <Field label="Observación de recepción"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Faltan folios, caja con daño físico o recepción conforme." /></Field>
          <Field label="Motivo si hay rechazo o parcial"><select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="missing_folios">Faltan folios</option>
            <option value="incomplete_expedient">Expediente incompleto</option>
            <option value="fuid_mismatch">Inconsistencia FUID</option>
            <option value="damaged_physical_unit">Daño físico</option>
            <option value="wrong_box">Caja incorrecta</option>
            <option value="wrong_folder">Carpeta incorrecta</option>
            <option value="location_mismatch">Ubicación no coincide</option>
            <option value="other">Otro</option>
          </select></Field>
        </div>
      </Card>
      {loading ? <Skeleton rows={8} /> : items.length === 0 ? (
        <Empty icon="package-check" title="Sin ítems de recepción">Esta transferencia no tiene unidades documentales para revisar.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Unidad</th><th>Tipo</th><th>Folios declarados</th><th>Folios recibidos</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.idBatchItem}>
                <td className="cell-strong">{item.metadata?.name || `${item.entity_type} #${item.entity_id}`}</td>
                <td>{item.entity_type}</td>
                <td className="mono">{item.expected_folios || item.folio_total || 0}</td>
                <td className="mono">{item.received_folios || 0}</td>
                <td><Badge tone={receptionTone(item.status)} dot>{item.status}</Badge></td>
                <td className="row gap2 wrap">
                  <Button size="sm" variant="secondary" icon="check" onClick={() => decide(item, "accept")} disabled={busy}>Aceptar</Button>
                  <Button size="sm" variant="secondary" icon="alert-circle" onClick={() => decide(item, "partial")} disabled={busy}>Parcial</Button>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => decide(item, "reject")} disabled={busy}>Rechazar</Button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="divider" />
      <div className="row end">
        <Button icon="check-circle" onClick={closeReception} disabled={busy || !items.length}>Cerrar recepción</Button>
      </div>
    </Drawer>
  );
}

function ReceptionPage() {
  const [selected, setSelected] = recS(null);
  const [refreshKey, setRefreshKey] = recS(0);
  const [filter, setFilter] = recS("pending");
  const { data: rawBatches, loading } = useLiveData(() => AmbarAPI.endpoints.transfers(), [], [refreshKey]);
  const all = AmbarAPI.listFrom(rawBatches);
  const rows = all.filter((batch) => {
    if (filter === "all") return true;
    if (filter === "pending") return RECEPTION_STATUSES.includes(String(batch.status || "").toLowerCase()) && !["received", "closed"].includes(String(batch.status || "").toLowerCase());
    return String(batch.status || "").toLowerCase() === filter;
  });
  const pending = all.filter((batch) => ["shipped", "under_review", "partially_received"].includes(String(batch.status || "").toLowerCase())).length;
  const rejected = all.filter((batch) => String(batch.status || "").toLowerCase() === "rejected").length;
  const received = all.filter((batch) => ["received", "closed"].includes(String(batch.status || "").toLowerCase())).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Archivo & Custodia</div>
          <h1>Recepción documental</h1>
          <p className="lead">Bandeja operacional para validar lo declarado en FUID contra lo recibido realmente.</p>
        </div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="Pendientes" value={pending} icon="package-check" tone="warn" accent />
        <Metric label="Recibidas" value={received} icon="check-circle" tone="ok" accent />
        <Metric label="Rechazadas" value={rejected} icon="alert-triangle" tone="danger" accent />
        <Metric label="Lotes visibles" value={all.length} icon="route" tone="brand" accent />
      </div>
      <Tabs value={filter} onChange={setFilter} tabs={[
        { key: "pending", label: "Requiere revisión", icon: "alert-triangle", count: pending },
        { key: "received", label: "Recibidos", icon: "check-circle", count: received },
        { key: "rejected", label: "Rechazados", icon: "alert-triangle", count: rejected },
        { key: "all", label: "Todos", icon: "list-checks", count: all.length },
      ]} />
      <Card flush className="an-rise">
        {loading ? <Skeleton rows={8} /> : rows.length === 0 ? (
          <Empty icon="package-check" title="Sin recepciones">No hay lotes reales para este filtro.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Lote</th><th>Origen</th><th>Destino</th><th>Ítems</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
              <tbody>{rows.map((batch) => (
                <tr key={batch.idBatch} className="clickable" onClick={() => setSelected(batch)}>
                  <td className="cell-mono cell-strong">{batch.batch_code}</td>
                  <td>{batch.origin_archive_name || batch.origin_location || "-"}</td>
                  <td>{batch.destination_archive_name || batch.destination_location || "-"}</td>
                  <td className="mono">{batch.items_count || 0}</td>
                  <td><Badge tone={receptionTone(batch.status)} dot>{batch.status}</Badge></td>
                  <td className="mono muted">{batch.created_at ? String(batch.created_at).slice(0, 10) : "-"}</td>
                  <td><Button variant="subtle" size="sm" icon="chevron-right" onClick={(event) => { event.stopPropagation(); setSelected(batch); }} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {selected && <ReceptionDetail batch={selected} onClose={() => setSelected(null)} onRefresh={() => setRefreshKey((value) => value + 1)} />}
    </>
  );
}

window.ReceptionPage = ReceptionPage;
