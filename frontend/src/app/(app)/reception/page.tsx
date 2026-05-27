"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSpreadsheet, RefreshCcw, Search, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Breadcrumbs,
  DataTable,
  DetailDrawer,
  EmptyState,
  FilterBar,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  StatusBadge
} from "@/components/ui/enterprise";

type Batch = {
  idBatch: number;
  batch_code: string;
  origin_archive_id?: number | null;
  destination_archive_id?: number | null;
  origin_archive_name?: string | null;
  destination_archive_name?: string | null;
  fuid_code?: string | null;
  items_count?: number;
  status: string;
  created_at?: string;
};

type ReceptionItem = {
  idBatchItem: number;
  batch_id: number;
  entity_type: string;
  entity_id: number;
  expected_quantity?: number | null;
  received_quantity?: number | null;
  expected_folios?: number | null;
  received_folios?: number | null;
  folio_total?: number | null;
  status: string;
  rejection_reason?: string | null;
  observation?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  metadata?: { name?: string };
};

type FuidComparison = {
  expected_units: number;
  received_units: number;
  expected_folios: number;
  received_folios: number;
  fuid?: { fuid_code: string; folio_total: number } | null;
  inconsistencies: { idBatchItem: number; entity_type: string; entity_id: number; status: string; reason?: string | null }[];
};

const reasons = [
  ["missing_folios", "Faltan folios"],
  ["incomplete_expedient", "Expediente incompleto"],
  ["fuid_mismatch", "Inconsistencia FUID"],
  ["damaged_physical_unit", "Unidad fisica danada"],
  ["wrong_box", "Caja incorrecta"],
  ["wrong_folder", "Carpeta incorrecta"],
  ["invalid_document", "Documento invalido"],
  ["wrong_support", "Soporte no corresponde"],
  ["location_mismatch", "Ubicacion incorrecta"],
  ["other", "Otro"]
];

function toneForStatus(status: string) {
  if (["accepted", "received", "closed"].includes(status)) return "success" as const;
  if (["rejected", "returned"].includes(status)) return "danger" as const;
  if (["partially_received", "under_review", "with_inconsistency"].includes(status)) return "info" as const;
  return "warning" as const;
}

function labelForStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendiente revision",
    pending_review: "Pendiente revision",
    accepted: "Aceptado",
    rejected: "Rechazado",
    partially_received: "Recibido parcial",
    returned: "Devuelto",
    with_inconsistency: "Con inconsistencia",
    under_review: "En revision",
    closed: "Cerrado"
  };
  return labels[status] ?? status;
}

export default function ReceptionPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReceptionItem | null>(null);
  const [reason, setReason] = useState("");
  const [observation, setObservation] = useState("");
  const [receivedQuantity, setReceivedQuantity] = useState("");
  const [receivedFolios, setReceivedFolios] = useState("");

  const batches = useQuery({
    queryKey: ["reception", "batches"],
    queryFn: async () => (await api.get<Batch[]>("/transfer-batches")).data
  });

  const batchId = selectedBatch?.idBatch;
  const items = useQuery({
    queryKey: ["reception", batchId, "items"],
    enabled: Boolean(batchId),
    queryFn: async () => (await api.get<ReceptionItem[]>(`/transfer-batches/${batchId}/reception/items`)).data
  });

  const comparison = useQuery({
    queryKey: ["reception", batchId, "fuid-comparison"],
    enabled: Boolean(batchId),
    queryFn: async () => (await api.get<FuidComparison>(`/transfer-batches/${batchId}/reception/fuid-comparison`)).data
  });

  const decide = useMutation({
    mutationFn: async ({ action, item }: { action: "accept" | "reject" | "partial"; item: ReceptionItem }) => {
      const payload = {
        observation: observation || undefined,
        rejection_reason: action === "reject" || action === "partial" ? reason || undefined : undefined,
        received_quantity: receivedQuantity ? Number(receivedQuantity) : undefined,
        received_folios: receivedFolios ? Number(receivedFolios) : undefined
      };
      return api.post(`/transfer-batches/${item.batch_id}/reception/items/${item.idBatchItem}/${action}`, payload);
    },
    onSuccess: () => {
      setReason("");
      setObservation("");
      setReceivedQuantity("");
      setReceivedFolios("");
      setSelectedItem(null);
      client.invalidateQueries({ queryKey: ["reception"] });
      client.invalidateQueries({ queryKey: ["transfer-batches"] });
      client.invalidateQueries({ queryKey: ["kardex"] });
      client.invalidateQueries({ queryKey: ["custody-dashboard"] });
    }
  });

  const closeReception = useMutation({
    mutationFn: async () => api.post(`/transfer-batches/${batchId}/reception/close`, { observation: "Recepcion cerrada desde AMBAR." }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["reception"] });
      client.invalidateQueries({ queryKey: ["transfer-batches"] });
    }
  });

  const batchRows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (batches.data ?? []).filter((item) => {
      if (!text) return true;
      return `${item.batch_code} ${item.origin_archive_name ?? ""} ${item.destination_archive_name ?? ""} ${item.status}`.toLowerCase().includes(text);
    });
  }, [batches.data, search]);

  const itemRows = useMemo(() => {
    return (items.data ?? [])
      .filter((item) => (status === "all" ? true : item.status === status))
      .filter((item) => (entityType === "all" ? true : item.entity_type === entityType));
  }, [entityType, items.data, status]);

  const pendingCount = (items.data ?? []).filter((item) => ["pending", "pending_review"].includes(item.status)).length;
  const acceptedCount = (items.data ?? []).filter((item) => item.status === "accepted").length;
  const rejectedCount = (items.data ?? []).filter((item) => item.status === "rejected").length;
  const partialCount = (items.data ?? []).filter((item) => item.status === "partially_received").length;

  function openItem(item: ReceptionItem) {
    setSelectedItem(item);
    setReason(item.rejection_reason ?? "");
    setObservation(item.observation ?? "");
    setReceivedQuantity(item.received_quantity?.toString() ?? "");
    setReceivedFolios(item.received_folios?.toString() ?? "");
  }

  function submitDecision(event: FormEvent<HTMLFormElement>, action: "accept" | "reject" | "partial") {
    event.preventDefault();
    if (!selectedItem) return;
    decide.mutate({ action, item: selectedItem });
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Recepcion"]} />
      <PageHeader
        eyebrow="Recepcion por item"
        title="Recepcion documental"
        description="Revisa transferencias mixtas unidad por unidad, compara FUID, acepta, rechaza o recibe parcialmente sin perder trazabilidad."
        action={<button className="ghost" type="button" onClick={() => { batches.refetch(); items.refetch(); comparison.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>}
      />

      <section className="metrics">
        <MetricCard label="Pendientes" value={pendingCount} tone="warning" cta="Revisar item" />
        <MetricCard label="Aceptados" value={acceptedCount} tone="success" cta="Custodia actualizada" />
        <MetricCard label="Rechazados" value={rejectedCount} tone="danger" cta="Origen notificado" />
        <MetricCard label="Parciales" value={partialCount} tone="info" cta="Con observacion" />
      </section>

      <div className="dashboard-split">
        <section className="card">
          <div className="toolbar space-between"><h2>Transferencias</h2><StatusBadge value={batchRows.length} tone="info" /></div>
          <FilterBar>
            <label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lote, archivo, estado..." /></span></label>
          </FilterBar>
          {batches.isLoading ? <LoadingSkeleton rows={4} /> : null}
          {!batches.isLoading && batchRows.length === 0 ? <EmptyState icon={<ClipboardCheck size={20} />} title="Sin transferencias para recibir" description="Las transferencias con archivo destino autorizado apareceran aqui." /> : null}
          <div className="expedient-list">
            {batchRows.map((batch) => (
              <button className={`expedient-row ${selectedBatch?.idBatch === batch.idBatch ? "active" : ""}`} type="button" key={batch.idBatch} onClick={() => setSelectedBatch(batch)}>
                <div>
                  <strong>{batch.batch_code}</strong>
                  <span>{batch.origin_archive_name ?? "-"} &rarr; {batch.destination_archive_name ?? "-"}</span>
                </div>
                <StatusBadge value={labelForStatus(batch.status)} tone={toneForStatus(batch.status)} />
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          {!selectedBatch ? <EmptyState icon={<ClipboardCheck size={20} />} title="Selecciona una transferencia" description="Abre un lote para revisar sus unidades documentales, FUID y estado de recepcion." /> : null}
          {selectedBatch ? (
            <>
              <div className="toolbar space-between">
                <div>
                  <h2>{selectedBatch.batch_code}</h2>
                  <p className="muted">{selectedBatch.origin_archive_name ?? "-"} &rarr; {selectedBatch.destination_archive_name ?? "-"}</p>
                </div>
                <button type="button" disabled={closeReception.isPending || pendingCount > 0 || !items.data?.length} onClick={() => closeReception.mutate()}><CheckCircle2 size={17} /> Cerrar recepcion</button>
              </div>

              <section className="module-grid">
                <MetricCard label="FUID" value={comparison.data?.fuid?.fuid_code ?? selectedBatch.fuid_code ?? "pendiente"} tone={comparison.data?.fuid ? "success" : "warning"} />
                <MetricCard label="Folios esperados" value={comparison.data?.expected_folios ?? 0} />
                <MetricCard label="Folios recibidos" value={comparison.data?.received_folios ?? 0} tone="info" />
              </section>

              <section className="card">
                <div className="toolbar space-between"><h3>Comparacion FUID</h3><StatusBadge value={`${comparison.data?.inconsistencies.length ?? 0} inconsistencias`} tone={(comparison.data?.inconsistencies.length ?? 0) ? "warning" : "success"} /></div>
                <p className="muted">Unidades esperadas: {comparison.data?.expected_units ?? 0} / recibidas: {comparison.data?.received_units ?? 0}</p>
                {comparison.data?.inconsistencies.slice(0, 3).map((item) => <p className="muted" key={item.idBatchItem}>{item.entity_type} #{item.entity_id}: {item.reason ?? item.status}</p>)}
              </section>

              <FilterBar>
                <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="pending_review">Pendientes</option><option value="accepted">Aceptados</option><option value="rejected">Rechazados</option><option value="partially_received">Parciales</option></select></label>
                <label>Tipo<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="all">Todos</option><option value="document">Documentos</option><option value="folder">Carpetas</option><option value="expedient">Expedientes</option><option value="box">Cajas</option></select></label>
              </FilterBar>

              {items.isLoading ? <LoadingSkeleton rows={4} /> : null}
              {!items.isLoading && itemRows.length === 0 ? <EmptyState icon={<FileSpreadsheet size={20} />} title="Sin items en este filtro" description="Cambia filtros o agrega unidades documentales al lote de transferencia." /> : null}
              <DataTable>
                <table>
                  <thead><tr><th>Unidad</th><th>Esperado</th><th>Recibido</th><th>Estado</th><th>Revisor</th><th>Accion</th></tr></thead>
                  <tbody>
                    {itemRows.map((item) => (
                      <tr key={item.idBatchItem}>
                        <td>{item.entity_type} #{item.entity_id}<br /><span className="muted">{item.metadata?.name}</span></td>
                        <td>{item.expected_quantity ?? 1} unidad / {item.expected_folios ?? item.folio_total ?? 0} folios</td>
                        <td>{item.received_quantity ?? 0} unidad / {item.received_folios ?? 0} folios</td>
                        <td><StatusBadge value={labelForStatus(item.status)} tone={toneForStatus(item.status)} /></td>
                        <td>{item.reviewed_by ?? "-"}</td>
                        <td><button className="ghost" type="button" onClick={() => openItem(item)}>Revisar item</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            </>
          ) : null}
        </section>
      </div>

      <DetailDrawer
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? `Revisar ${selectedItem.entity_type} #${selectedItem.entity_id}` : "Revisar item"}
        subtitle={selectedBatch?.batch_code}
      >
        {selectedItem ? (
          <div className="form-grid">
            <div className="module-grid">
              <MetricCard label="Estado" value={labelForStatus(selectedItem.status)} tone={toneForStatus(selectedItem.status)} />
              <MetricCard label="Folios esperados" value={selectedItem.expected_folios ?? selectedItem.folio_total ?? 0} />
              <MetricCard label="Folios recibidos" value={selectedItem.received_folios ?? 0} tone="info" />
            </div>
            <label>Cantidad recibida<input value={receivedQuantity} onChange={(event) => setReceivedQuantity(event.target.value)} inputMode="numeric" placeholder="1" /></label>
            <label>Folios recibidos<input value={receivedFolios} onChange={(event) => setReceivedFolios(event.target.value)} inputMode="numeric" placeholder={(selectedItem.expected_folios ?? selectedItem.folio_total ?? 0).toString()} /></label>
            <label>Observacion<input value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Inventario revisado, folios completos..." /></label>
            <label>Motivo de rechazo<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Seleccionar si aplica</option>{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <form className="toolbar" onSubmit={(event) => submitDecision(event, "accept")}>
              <button disabled={decide.isPending}><CheckCircle2 size={17} /> Aceptar unidad</button>
              <button className="ghost" type="button" disabled={decide.isPending} onClick={() => selectedItem && decide.mutate({ action: "partial", item: selectedItem })}>Recibir parcialmente</button>
              <button className="ghost" type="button" disabled={decide.isPending} onClick={() => selectedItem && decide.mutate({ action: "reject", item: selectedItem })}><XCircle size={17} /> Rechazar</button>
            </form>
          </div>
        ) : null}
      </DetailDrawer>
    </>
  );
}
