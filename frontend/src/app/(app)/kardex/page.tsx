"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Plus, RefreshCcw, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ArchiveItem = { idArchive: number; archive_name: string };
type Movement = { idMovement: number; movement_type: string; entity_type: string; entity_id: number; ps930OriginArchiveId?: number; ps930DestinationArchiveId?: number; status: string; reason?: string; observations?: string; created_at?: string };

export default function KardexPage() {
  const client = useQueryClient();
  const [entityType, setEntityType] = useState("folder");
  const [entityId, setEntityId] = useState("");
  const [originArchiveId, setOriginArchiveId] = useState("");
  const [destinationArchiveId, setDestinationArchiveId] = useState("");
  const [observations, setObservations] = useState("");
  const [rejectionReason, setRejectionReason] = useState("incompleto");
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const movements = useQuery({ queryKey: ["kardex"], queryFn: async () => (await api.get<Movement[]>("/archives/kardex")).data });
  const create = useMutation({ mutationFn: async () => api.post("/archives/kardex", { movement_type: "transfer", entity_type: entityType, entity_id: Number(entityId), origin_archive_id: Number(originArchiveId), destination_archive_id: Number(destinationArchiveId), observations }), onSuccess: () => { setEntityId(""); setObservations(""); client.invalidateQueries({ queryKey: ["kardex"] }); } });
  const decide = useMutation({ mutationFn: async ({ id, status, reason }: { id: number; status: string; reason?: string }) => api.patch(`/archives/kardex/${id}/decision`, { status, reason, observations: reason }), onSuccess: () => client.invalidateQueries({ queryKey: ["kardex"] }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  const archiveName = (id?: number) => archives.data?.find((item) => item.idArchive === id)?.archive_name ?? (id ? `Archivo ${id}` : "N/A");
  return (
    <>
      <div className="breadcrumbs"><span>Custodia Documental</span><span>Kardex</span></div>
      <PageTitle title="Kardex" description="Timeline cronologico de transferencias, recepciones, rechazos, prestamos y movimientos." action={<button className="ghost" onClick={() => movements.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card"><h2>Nueva transferencia</h2><form className="form-grid" onSubmit={submit}>
          <label>Entidad<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="folder">Carpeta</option><option value="document">Documento</option><option value="box">Caja</option><option value="expedient">Expediente</option><option value="batch">Lote</option></select></label>
          <label>ID entidad<input type="number" min="1" value={entityId} onChange={(event) => setEntityId(event.target.value)} required /></label>
          <label>Archivo origen<select value={originArchiveId} onChange={(event) => setOriginArchiveId(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <label>Archivo destino<select value={destinationArchiveId} onChange={(event) => setDestinationArchiveId(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <label>Observaciones<textarea value={observations} onChange={(event) => setObservations(event.target.value)} /></label>
          <button disabled={create.isPending}><Plus size={17} /> Crear movimiento</button>
        </form><label>Motivo rechazo<select value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)}><option value="incompleto">Incompleto</option><option value="faltan_folios">Faltan folios</option><option value="inventario_inconsistente">Inventario inconsistente</option><option value="dano_fisico">Dano fisico</option><option value="foliacion_incorrecta">Foliacion incorrecta</option><option value="documentacion_invalida">Documentacion invalida</option></select></label></section>
        <section className="card"><div className="timeline">{movements.data?.map((item) => <article className="timeline-item" key={item.idMovement}><div className="timeline-state"><span className="status">{item.status}</span><strong>{item.movement_type}</strong><span className="muted">#{item.idMovement}</span></div><div className="timeline-body"><h3>{archiveName(item.ps930OriginArchiveId)} {" -> "} {archiveName(item.ps930DestinationArchiveId)}</h3><p>{item.entity_type} #{item.entity_id}</p>{item.observations ? <p className="muted">{item.observations}</p> : null}{item.reason ? <p className="error">Motivo: {item.reason}</p> : null}<div className="toolbar"><button className="ghost" onClick={() => decide.mutate({ id: item.idMovement, status: "accepted" })}><CheckCircle2 size={16} /> Aceptar</button><button className="ghost danger" onClick={() => decide.mutate({ id: item.idMovement, status: "rejected", reason: rejectionReason })}><XCircle size={16} /> Rechazar</button></div></div></article>)}</div></section>
      </div>
    </>
  );
}
