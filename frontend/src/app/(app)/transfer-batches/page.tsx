"use client";

import { FormEvent, useMemo, useState } from "react";
import { Boxes, CheckCircle2, PackagePlus, RefreshCcw, Search, Truck } from "lucide-react";
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
  StatusBadge,
  TimelineEvent
} from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string; archive_code: string; archive_type: string };
type Batch = {
  idBatch: number;
  batch_code: string;
  origin_location: number;
  destination_location: number;
  origin_archive_id?: number | null;
  destination_archive_id?: number | null;
  origin_archive_name?: string | null;
  destination_archive_name?: string | null;
  fuid_id?: number | null;
  fuid_code?: string | null;
  items_count?: number;
  status: string;
  created_at?: string;
};
type BatchItem = { idBatchItem: number; entity_type: string; entity_id: number; status: string; folio_total: number; metadata_json?: { name?: string } };

const transitions: Record<string, string[]> = {
  pending: ["approved", "rejected"],
  approved: ["packed", "rejected"],
  packed: ["shipped", "rejected"],
  shipped: ["partially_received", "received", "rejected"],
  partially_received: ["received", "closed", "rejected"],
  received: ["closed"],
  rejected: [],
  closed: []
};

function batchTone(status: string) {
  if (["received", "closed"].includes(status)) return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (["shipped", "partially_received"].includes(status)) return "info" as const;
  return "warning" as const;
}

export default function TransferBatchesPage() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Batch | null>(null);
  const [notes, setNotes] = useState("");
  const [entityType, setEntityType] = useState("document");
  const [entityId, setEntityId] = useState("");

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const batches = useQuery({ queryKey: ["transfer-batches"], queryFn: async () => (await api.get<Batch[]>("/transfer-batches")).data });
  const items = useQuery({
    queryKey: ["transfer-batches", selected?.idBatch, "items"],
    enabled: Boolean(selected),
    queryFn: async () => (await api.get<BatchItem[]>(`/transfer-batches/${selected?.idBatch}/items`)).data
  });

  const create = useMutation({
    mutationFn: async () => api.post("/transfer-batches", { batch_code: code, origin_archive_id: Number(origin), destination_archive_id: Number(destination) }),
    onSuccess: () => {
      setCode("");
      setOrigin("");
      setDestination("");
      client.invalidateQueries({ queryKey: ["transfer-batches"] });
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ batch, status }: { batch: Batch; status: string }) => api.patch(`/transfer-batches/${batch.idBatch}/status`, { status, notes: notes || undefined }),
    onSuccess: () => {
      setNotes("");
      client.invalidateQueries({ queryKey: ["transfer-batches"] });
      client.invalidateQueries({ queryKey: ["custody-dashboard"] });
    }
  });

  const addItem = useMutation({
    mutationFn: async (batch: Batch) => api.post(`/transfer-batches/${batch.idBatch}/items`, { entity_type: entityType, entity_id: Number(entityId) }),
    onSuccess: () => {
      setEntityId("");
      client.invalidateQueries({ queryKey: ["transfer-batches"] });
      client.invalidateQueries({ queryKey: ["transfer-batches", selected?.idBatch, "items"] });
    }
  });

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (batches.data ?? []).filter((item) => !text || `${item.batch_code} ${item.status} ${item.origin_archive_name ?? item.origin_location} ${item.destination_archive_name ?? item.destination_location}`.toLowerCase().includes(text));
  }, [batches.data, search]);

  const pending = (batches.data ?? []).filter((item) => ["pending", "approved", "packed", "shipped"].includes(item.status)).length;
  const received = (batches.data ?? []).filter((item) => ["received", "closed"].includes(item.status)).length;
  const rejected = (batches.data ?? []).filter((item) => item.status === "rejected").length;

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Transferencias"]} />
      <PageHeader
        eyebrow="Lotes documentales"
        title="Transferencias"
        description="Gestiona lotes documentales con flujo de aprobacion, empaque, envio, recepcion parcial, rechazo y cierre."
        action={<button className="ghost" type="button" onClick={() => batches.refetch()}><RefreshCcw size={17} /> Actualizar</button>}
      />

      <section className="metrics">
        <MetricCard label="Lotes activos" value={pending} tone="warning" cta="En flujo operacional" />
        <MetricCard label="Recibidos o cerrados" value={received} tone="success" cta="Custodia destino" />
        <MetricCard label="Rechazados" value={rejected} tone="danger" cta="Requieren correccion" />
      </section>

      <div className="split">
        <section className="card">
          <h2>Nuevo lote documental</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Codigo<input value={code} onChange={(event) => setCode(event.target.value)} required placeholder="LT-2026-001" /></label>
            <label>Archivo origen<select value={origin} onChange={(event) => setOrigin(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_code} - {item.archive_name}</option>)}</select></label>
            <label>Archivo destino<select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_code} - {item.archive_name}</option>)}</select></label>
            <button disabled={create.isPending}><PackagePlus size={17} /> Crear lote</button>
          </form>
          <EmptyState icon={<Boxes size={20} />} title="Transferencia por lote" description="Usa lotes para mover carpetas o documentos con evidencia y recepcion controlada." />
        </section>

        <section className="card">
          <FilterBar>
            <label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lote, estado, origen..." /></span></label>
          </FilterBar>
          {batches.isLoading ? <LoadingSkeleton rows={4} /> : null}
          {!batches.isLoading && rows.length === 0 ? <EmptyState icon={<Truck size={20} />} title="No hay transferencias" description="Crea un lote documental para iniciar el flujo de custodia." /> : null}
          <DataTable>
            <table>
              <thead><tr><th>Lote</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Creado</th><th>Accion</th></tr></thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.idBatch}>
                    <td>{item.batch_code}</td>
                    <td>{item.origin_archive_name ?? `Ubicacion ${item.origin_location}`}</td>
                    <td>{item.destination_archive_name ?? `Ubicacion ${item.destination_location}`}</td>
                    <td><StatusBadge value={item.fuid_code ? `${item.status} / FUID` : item.status} tone={batchTone(item.status)} /></td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString("es-CO") : "-"}</td>
                    <td><button className="ghost" type="button" onClick={() => setSelected(item)}>Gestionar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>
      </div>

      <section className="card">
        <h2>Flujo operativo</h2>
        <div className="timeline">
          {["pending", "approved", "packed", "shipped", "received", "closed"].map((state) => (
            <TimelineEvent key={state} state={state} tone={batchTone(state)} title={state} description="Estado documental controlado con auditoria, notificacion y evidencia cuando aplica." />
          ))}
        </div>
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.batch_code : "Transferencia"}
        subtitle={selected ? `${selected.origin_archive_name ?? selected.origin_location} -> ${selected.destination_archive_name ?? selected.destination_location}` : undefined}
      >
        {selected ? (
          <div className="form-grid">
            <div className="module-grid">
              <MetricCard label="Origen" value={selected.origin_archive_name ?? selected.origin_location} />
              <MetricCard label="Destino" value={selected.destination_archive_name ?? selected.destination_location} />
              <MetricCard label="Estado" value={selected.status} tone={batchTone(selected.status)} />
              <MetricCard label="FUID" value={selected.fuid_code ?? "pendiente"} tone={selected.fuid_code ? "success" : "warning"} />
            </div>
            <section className="card">
              <h3>Agregar unidad documental</h3>
              <form className="form-grid" onSubmit={(event) => { event.preventDefault(); addItem.mutate(selected); }}>
                <label>Tipo<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option></select></label>
                <label>ID entidad<input value={entityId} onChange={(event) => setEntityId(event.target.value)} required inputMode="numeric" placeholder="ID interno" /></label>
                <button disabled={addItem.isPending}><PackagePlus size={16} /> Agregar al lote</button>
              </form>
            </section>
            <label>Notas de gestion<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Inventario validado, faltan folios..." /></label>
            <div className="toolbar">
              {transitions[selected.status]?.map((next) => (
                <button key={next} className={next === "rejected" ? "ghost" : undefined} type="button" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ batch: selected, status: next })}>
                  <CheckCircle2 size={16} /> {next}
                </button>
              ))}
            </div>
            <section className="card">
              <div className="toolbar space-between"><h3>Unidades del lote</h3><StatusBadge value={items.data?.length ?? 0} tone="info" /></div>
              {items.isLoading ? <LoadingSkeleton rows={3} /> : null}
              {!items.isLoading && (items.data?.length ?? 0) === 0 ? <EmptyState title="Sin unidades asociadas" description="Agrega documentos, carpetas, expedientes o cajas para generar FUID y transferencia real." /> : null}
              {items.data?.map((item) => (
                <div className="toolbar space-between" key={item.idBatchItem}>
                  <span className="muted">{item.entity_type} #{item.entity_id} {item.metadata_json?.name ? `- ${item.metadata_json.name}` : ""}</span>
                  <StatusBadge value={`${item.status} / ${item.folio_total} folios`} tone={batchTone(item.status)} />
                </div>
              ))}
            </section>
          </div>
        ) : null}
      </DetailDrawer>
    </>
  );
}
