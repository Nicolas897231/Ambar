"use client";

import { useMemo, useState } from "react";
import { Download, MapPinned, PackageCheck, RefreshCcw, Route, Search } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type Summary = { documents: number; folders: number; expedients: number; boxes: number; pending_transfers: number; pending_receptions: number; overdue_loans: number; today_movements: number; recent_rejections: number; fuid_inconsistencies: number; unfoliated_documents: number };
type Movement = {
  idMovement: number;
  movement_code: string;
  event_type: string;
  entity_type: string;
  entity_id: number;
  origin_archive_id?: number | null;
  destination_archive_id?: number | null;
  action_by?: string;
  action_at?: string;
  previous_status?: string | null;
  new_status: string;
  observation?: string | null;
  rejection_reason?: string | null;
  evidence_url?: string | null;
  metadata?: Record<string, unknown>;
};
type Trace = { entity_type: string; entity_id: number; current_archive_id?: number | null; current_status?: string | null; events: Movement[] };
type Balance = { archive_id: number; documents: number; folders: number; expedients: number; boxes: number; active_loans: number; transfers_in_transit: number; pending_reception_items: number; recent_rejected_items: number };

function tone(status: string) {
  if (["accepted", "received", "stored", "active", "closed", "returned"].includes(status)) return "success" as const;
  if (["rejected", "cancelled", "overdue"].includes(status)) return "danger" as const;
  if (["pending", "pending_reception", "pending_review", "in_transit", "under_review"].includes(status)) return "warning" as const;
  return "info" as const;
}

function label(event: string) {
  const labels: Record<string, string> = {
    "reception.item.accepted": "Unidad aceptada en recepcion",
    "reception.item.rejected": "Unidad rechazada en recepcion",
    "reception.item.partially_received": "Unidad recibida parcialmente",
    "reception.closed": "Recepcion cerrada",
    "custody.changed": "Cambio de custodia documental",
    "file_uploaded": "Archivo digital cargado",
    "document_created": "Documento creado",
    "foliation_validated": "Foliacion validada",
    "fuid_generated": "FUID generado",
    "loan": "Prestamo documental",
    "return": "Devolucion documental",
    "transfer": "Transferencia documental"
  };
  return labels[event] ?? event.replaceAll(".", " ");
}

export default function KardexPage() {
  const [tab, setTab] = useState("timeline");
  const [archiveId, setArchiveId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [movementType, setMovementType] = useState("");
  const [status, setStatus] = useState("");
  const [entityLookupType, setEntityLookupType] = useState("document");
  const [entityLookupId, setEntityLookupId] = useState("");
  const [selected, setSelected] = useState<Movement | null>(null);

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const summary = useQuery({ queryKey: ["kardex", "summary"], queryFn: async () => (await api.get<Summary>("/kardex/summary")).data });
  const timeline = useQuery({
    queryKey: ["kardex", "timeline", archiveId, entityType, movementType, status],
    queryFn: async () => (await api.get<Movement[]>("/kardex/timeline", { params: { archive_id: archiveId || undefined, entity_type: entityType || undefined, movement_type: movementType || undefined, status: status || undefined } })).data
  });
  const trace = useQuery({
    queryKey: ["kardex", "trace", entityLookupType, entityLookupId],
    enabled: Boolean(entityLookupId),
    queryFn: async () => (await api.get<Trace>(`/kardex/entities/${entityLookupType}/${entityLookupId}/trace`)).data
  });
  const balance = useQuery({
    queryKey: ["kardex", "balance", archiveId],
    enabled: Boolean(archiveId),
    queryFn: async () => (await api.get<Balance>(`/kardex/archive/${archiveId}/balance`)).data
  });

  const exportCsv = useMutation({
    mutationFn: async () => (await api.get("/kardex/export", { responseType: "blob", params: { archive_id: archiveId || undefined, entity_type: entityType || undefined, movement_type: movementType || undefined, status: status || undefined } })).data as Blob,
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ambar-kardex.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    }
  });

  const archiveName = (id?: number | null) => archives.data?.find((item) => item.idArchive === id)?.archive_name ?? (id ? `Archivo ${id}` : "Sin archivo");
  const rows = useMemo(() => timeline.data ?? [], [timeline.data]);

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Kardex"]} />
      <PageHeader title="Kardex documental" eyebrow="Mapa de vida documental" description="Trazabilidad profunda de custodia, ubicacion, recepciones, rechazos, prestamos, FUID y movimientos por entidad." action={<button className="ghost" onClick={() => { summary.refetch(); timeline.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>} />

      <section className="metrics">
        <MetricCard label="Documentos bajo custodia" value={summary.data?.documents ?? 0} tone="success" />
        <MetricCard label="Expedientes activos" value={summary.data?.expedients ?? 0} />
        <MetricCard label="Recepciones pendientes" value={summary.data?.pending_receptions ?? 0} tone={(summary.data?.pending_receptions ?? 0) ? "warning" : "success"} />
        <MetricCard label="Rechazos recientes" value={summary.data?.recent_rejections ?? 0} tone={(summary.data?.recent_rejections ?? 0) ? "danger" : "neutral"} />
      </section>

      <nav className="tabbar">
        {["resumen", "timeline", "entidad", "trazabilidad", "movimientos"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      <FilterBar>
        <label>Archivo<select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
        <label>Entidad<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="">Todas</option><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option><option value="batch">Transferencia</option></select></label>
        <label>Evento<input value={movementType} onChange={(event) => setMovementType(event.target.value)} placeholder="transfer, reception.item..." /></label>
        <label>Estado<input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="accepted, rejected..." /></label>
        <button type="button" onClick={() => exportCsv.mutate()}><Download size={16} /> Exportar</button>
      </FilterBar>

      {tab === "resumen" ? (
        <section className="module-grid">
          <MetricCard label="Carpetas" value={summary.data?.folders ?? 0} />
          <MetricCard label="Cajas" value={summary.data?.boxes ?? 0} />
          <MetricCard label="Transferencias pendientes" value={summary.data?.pending_transfers ?? 0} tone="warning" />
          <MetricCard label="Prestamos vencidos" value={summary.data?.overdue_loans ?? 0} tone={(summary.data?.overdue_loans ?? 0) ? "danger" : "success"} />
          <MetricCard label="Movimientos de hoy" value={summary.data?.today_movements ?? 0} tone="info" />
          <MetricCard label="Inconsistencias FUID" value={summary.data?.fuid_inconsistencies ?? 0} tone={(summary.data?.fuid_inconsistencies ?? 0) ? "warning" : "success"} />
          <MetricCard label="Documentos sin foliar" value={summary.data?.unfoliated_documents ?? 0} tone={(summary.data?.unfoliated_documents ?? 0) ? "warning" : "success"} />
          {balance.data ? <MetricCard label={`Saldo ${archiveName(balance.data.archive_id)}`} value={`${balance.data.documents} docs / ${balance.data.boxes} cajas`} tone="info" /> : <MetricCard label="Saldo por archivo" value="selecciona archivo" />}
        </section>
      ) : null}

      {tab === "timeline" || tab === "trazabilidad" ? (
        <section className="card">
          {timeline.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!timeline.isLoading && rows.length === 0 ? <EmptyState icon={<Route size={20} />} title="Sin movimientos registrados" description="Este filtro no tiene movimientos Kardex visibles para tus archivos autorizados." /> : null}
          <div className="timeline">
            {rows.map((item) => (
              <TimelineEvent
                key={item.idMovement}
                state={item.new_status}
                tone={tone(item.new_status)}
                title={`${label(item.event_type)} · ${item.entity_type} #${item.entity_id}`}
                description={`${archiveName(item.origin_archive_id)} -> ${archiveName(item.destination_archive_id)}${item.observation ? ` · ${item.observation}` : ""}${item.rejection_reason ? ` · Motivo: ${item.rejection_reason}` : ""}`}
                meta={item.action_at ? new Date(item.action_at).toLocaleString("es-CO") : item.movement_code}
                action={<button className="ghost" type="button" onClick={() => setSelected(item)}>Ver detalle</button>}
              />
            ))}
          </div>
        </section>
      ) : null}

      {tab === "entidad" ? (
        <section className="card">
          <FilterBar>
            <label>Tipo<select value={entityLookupType} onChange={(event) => setEntityLookupType(event.target.value)}><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option><option value="transfer">Transferencia</option><option value="loan">Prestamo</option></select></label>
            <label>ID<span className="input-icon"><Search size={15} /><input value={entityLookupId} onChange={(event) => setEntityLookupId(event.target.value)} placeholder="ID entidad" /></span></label>
          </FilterBar>
          {!entityLookupId ? <EmptyState icon={<MapPinned size={20} />} title="Busca una entidad" description="Consulta el Kardex de un documento, carpeta, expediente, caja, transferencia o prestamo." /> : null}
          {trace.isLoading ? <LoadingSkeleton rows={4} /> : null}
          {trace.data ? <MetricCard label="Custodia actual" value={trace.data.current_archive_id ? archiveName(trace.data.current_archive_id) : "Sin archivo"} tone="info" /> : null}
          <div className="timeline">
            {trace.data?.events.map((item) => <TimelineEvent key={item.idMovement} state={item.new_status} tone={tone(item.new_status)} title={label(item.event_type)} description={`${archiveName(item.origin_archive_id)} -> ${archiveName(item.destination_archive_id)}${item.observation ? ` · ${item.observation}` : ""}`} />)}
          </div>
        </section>
      ) : null}

      {tab === "movimientos" ? (
        <DataTable><table><thead><tr><th>Movimiento</th><th>Entidad</th><th>Origen</th><th>Destino</th><th>Usuario</th><th>Estado</th></tr></thead><tbody>{rows.map((item) => <tr key={item.idMovement}><td><PackageCheck size={15} /> {label(item.event_type)}</td><td>{item.entity_type} #{item.entity_id}</td><td>{archiveName(item.origin_archive_id)}</td><td>{archiveName(item.destination_archive_id)}</td><td>{item.action_by}</td><td><StatusBadge value={item.new_status} tone={tone(item.new_status)} /></td></tr>)}</tbody></table></DataTable>
      ) : null}

      <DetailDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? selected.movement_code : "Movimiento Kardex"} subtitle={selected ? `${selected.entity_type} #${selected.entity_id}` : undefined}>
        {selected ? <div className="form-grid"><MetricCard label="Evento" value={label(selected.event_type)} tone="info" /><MetricCard label="Estado" value={selected.new_status} tone={tone(selected.new_status)} /><MetricCard label="Usuario" value={selected.action_by ?? "-"} /><section className="card"><h3>Detalle operativo</h3><p className="muted">{selected.observation ?? "Sin observacion."}</p>{selected.rejection_reason ? <StatusBadge value={`Motivo: ${selected.rejection_reason}`} tone="danger" /> : null}{selected.evidence_url ? <a className="inline-link" href={selected.evidence_url}>Ver evidencia</a> : null}</section></div> : null}
      </DetailDrawer>
    </>
  );
}
