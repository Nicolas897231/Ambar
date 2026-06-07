"use client";

import { FormEvent, useState } from "react";
import { MapPinned, RefreshCcw, Route, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type Movement = {
  idMovement: number;
  movement_code: string;
  event_type: string;
  movement_type: string;
  entity_type: string;
  entity_id: number;
  origin_archive_id?: number | null;
  destination_archive_id?: number | null;
  action_by?: string | null;
  action_at?: string | null;
  new_status: string;
  status: string;
  observation?: string | null;
  rejection_reason?: string | null;
  evidence_url?: string | null;
};
type Trace = { entity_type: string; entity_id: number; current_archive_id?: number | null; current_status?: string | null; events: Movement[] };
type Summary = { documents: number; expedients: number; boxes: number; pending_transfers: number; pending_receptions: number; overdue_loans: number; recent_rejections: number; today_movements: number };

function tone(status: string) {
  if (["accepted", "received", "active", "closed", "returned"].includes(status)) return "success" as const;
  if (["rejected", "overdue", "cancelled"].includes(status)) return "danger" as const;
  if (["pending", "pending_review", "under_review", "partially_received"].includes(status)) return "warning" as const;
  return "info" as const;
}

function eventLabel(event: string) {
  const labels: Record<string, string> = {
    "document_created": "Documento creado",
    "file_uploaded": "Archivo digital cargado",
    "foliation_validated": "Foliacion validada",
    "transfer": "Transferencia documental",
    "fuid_generated": "FUID generado",
    "reception.item.accepted": "Recepcion aceptada",
    "reception.item.rejected": "Recepcion rechazada",
    "reception.item.partially_received": "Recepcion parcial",
    "custody.changed": "Cambio de custodia",
    "loan.created": "Prestamo creado",
    "loan.returned": "Devolucion registrada",
    "box.moved": "Caja movida",
    "folder.moved": "Carpeta movida",
    "location.assigned": "Ubicacion asignada"
  };
  return labels[event] ?? event.replaceAll(".", " ");
}

export default function TraceabilityPage() {
  const [archiveId, setArchiveId] = useState("");
  const [entityType, setEntityType] = useState("expedient");
  const [entityId, setEntityId] = useState("");
  const [submitted, setSubmitted] = useState<{ type: string; id: string } | null>(null);

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const summary = useQuery({ queryKey: ["traceability-summary"], queryFn: async () => (await api.get<Summary>("/kardex/summary")).data });
  const timeline = useQuery({
    queryKey: ["traceability-timeline", archiveId],
    queryFn: async () => (await api.get<Movement[]>("/kardex/timeline", { params: { archive_id: archiveId || undefined, limit: 80 } })).data
  });
  const trace = useQuery({
    queryKey: ["traceability-entity", submitted?.type, submitted?.id],
    enabled: Boolean(submitted?.id),
    queryFn: async () => (await api.get<Trace>(`/kardex/entities/${submitted?.type}/${submitted?.id}/trace`)).data
  });

  const archiveName = (id?: number | null) => archives.data?.find((item) => item.idArchive === id)?.archive_name ?? (id ? `Archivo ${id}` : "Sin archivo");
  const traceEvents = trace.data?.events ?? [];
  const events = traceEvents.length ? traceEvents : timeline.data ?? [];
  const current = trace.data?.events.at(-1);
  const latest = events.slice(0, 12);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (entityId.trim()) {
      setSubmitted({ type: entityType, id: entityId.trim() });
    }
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Trazabilidad"]} />
      <PageHeader
        title="Trazabilidad documental"
        eyebrow="Historia completa"
        description="Consulta donde esta una unidad documental, quien la tiene, que movimientos tuvo y que evidencia existe."
        action={<button className="ghost" type="button" onClick={() => { summary.refetch(); timeline.refetch(); trace.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>}
      />

      <section className="metrics">
        <MetricCard label="Documentos" value={summary.data?.documents ?? 0} tone="success" />
        <MetricCard label="Expedientes" value={summary.data?.expedients ?? 0} />
        <MetricCard label="Transferencias pendientes" value={summary.data?.pending_transfers ?? 0} tone={(summary.data?.pending_transfers ?? 0) ? "warning" : "success"} />
        <MetricCard label="Recepciones pendientes" value={summary.data?.pending_receptions ?? 0} tone={(summary.data?.pending_receptions ?? 0) ? "warning" : "success"} />
        <MetricCard label="Prestamos vencidos" value={summary.data?.overdue_loans ?? 0} tone={(summary.data?.overdue_loans ?? 0) ? "danger" : "success"} />
      </section>

      <section className="card">
        <FilterBar>
          <label>Archivo<select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos los archivos</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <form className="toolbar" onSubmit={submit}>
            <label>Entidad<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option><option value="transfer">Transferencia</option><option value="loan">Prestamo</option></select></label>
            <label>ID<span className="input-icon"><Search size={15} /><input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="ID interno" inputMode="numeric" /></span></label>
            <button type="submit"><MapPinned size={16} /> Ver historia</button>
          </form>
        </FilterBar>
      </section>

      {submitted ? (
        <section className="module-grid">
          <MetricCard label="Entidad consultada" value={`${submitted.type} #${submitted.id}`} tone="info" />
          <MetricCard label="Archivo actual" value={trace.data?.current_archive_id ? archiveName(trace.data.current_archive_id) : "Sin movimiento"} />
          <MetricCard label="Estado actual" value={trace.data?.current_status ?? current?.new_status ?? "-"} tone={tone(trace.data?.current_status ?? current?.new_status ?? "")} />
          <MetricCard label="Eventos" value={trace.data?.events.length ?? 0} />
        </section>
      ) : null}

      <section className="dashboard-split">
        <article className="card">
          <div className="toolbar space-between"><h2>{submitted ? "Timeline de la entidad" : "Movimientos recientes"}</h2><StatusBadge value={events.length} tone="info" /></div>
          {trace.isLoading || timeline.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!trace.isLoading && !timeline.isLoading && events.length === 0 ? <EmptyState icon={<Route size={20} />} title="Sin trazabilidad visible" description="No hay movimientos para la entidad o filtro seleccionado." /> : null}
          <div className="timeline">
            {latest.map((item) => (
              <TimelineEvent
                key={item.idMovement}
                state={item.new_status}
                tone={tone(item.new_status)}
                title={`${eventLabel(item.event_type)} - ${item.entity_type} #${item.entity_id}`}
                description={`${archiveName(item.origin_archive_id)} -> ${archiveName(item.destination_archive_id)}${item.observation ? ` - ${item.observation}` : ""}${item.rejection_reason ? ` - Motivo: ${item.rejection_reason}` : ""}`}
                meta={item.action_at ? new Date(item.action_at).toLocaleString("es-CO") : item.movement_code}
              />
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Movimientos</h2>
          <DataTable>
            <table>
              <thead><tr><th>Evento</th><th>Entidad</th><th>Origen</th><th>Destino</th><th>Estado</th></tr></thead>
              <tbody>{events.map((item) => <tr key={item.idMovement}><td>{eventLabel(item.event_type)}</td><td>{item.entity_type} #{item.entity_id}</td><td>{archiveName(item.origin_archive_id)}</td><td>{archiveName(item.destination_archive_id)}</td><td><StatusBadge value={item.new_status} tone={tone(item.new_status)} /></td></tr>)}</tbody>
            </table>
          </DataTable>
        </article>
      </section>
    </>
  );
}
