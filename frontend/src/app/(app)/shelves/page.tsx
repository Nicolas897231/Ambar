"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type ShelfItem = { idShelf: number; archive_id: number; shelf_code: string; shelf_name: string; aisle?: string; floor?: string; module?: string; bay?: string; body?: string; level?: string; capacity_boxes: number; current_boxes: number; occupancy_percent: number; status: string; physical_location?: string; topographic_path?: string };

const aisles = ["A", "B", "C", "D", "E", "F"];
const shelfNumbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const bodies = ["A", "B", "C", "D"];
const levels = ["1", "2", "3", "4", "5", "6"];

function tone(status: string) {
  if (["active", "available"].includes(status)) return "success";
  if (["full", "reserved"].includes(status)) return "warning";
  if (["inactive", "damaged"].includes(status)) return "danger";
  return "neutral";
}

export default function ShelvesPage() {
  const client = useQueryClient();
  const [archiveId, setArchiveId] = useState("");
  const [code, setCode] = useState("1");
  const [name, setName] = useState("");
  const [aisle, setAisle] = useState("A");
  const [body, setBody] = useState("A");
  const [level, setLevel] = useState("1");
  const [capacity, setCapacity] = useState("20");
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const shelves = useQuery({ queryKey: ["shelves", archiveId], queryFn: async () => (await api.get<ShelfItem[]>(`/archives/shelves${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const create = useMutation({
    mutationFn: async () => api.post("/archives/shelves", { archive_id: Number(archiveId), shelf_code: code, shelf_name: name || `Estanteria ${code}`, aisle, body, level, capacity_boxes: Number(capacity) }),
    onSuccess: () => { setCode("1"); setName(""); client.invalidateQueries({ queryKey: ["shelves"] }); }
  });
  const totals = useMemo(() => ({ shelves: shelves.data?.length ?? 0, boxes: (shelves.data ?? []).reduce((acc, item) => acc + item.current_boxes, 0), full: (shelves.data ?? []).filter((item) => item.status === "full").length }), [shelves.data]);
  const archiveName = (id: number) => archives.data?.find((item) => item.idArchive === id)?.archive_name ?? `Archivo ${id}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Estanterias"]} />
      <PageHeader title="Topografia documental" eyebrow="Mapa fisico" description="Configura pasillos, estanterias, modulos y entrepanos por archivo. Las cajas heredan esta ruta." action={<button className="ghost" onClick={() => shelves.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="grid metrics"><MetricCard label="Estanterias" value={totals.shelves} /><MetricCard label="Cajas ubicadas" value={totals.boxes} tone="info" /><MetricCard label="Llenas" value={totals.full} tone={totals.full ? "warning" : "success"} /></div>
      <div className="split">
        <section className="card"><h2>Nueva ubicacion topografica</h2><form className="form-grid" onSubmit={submit}>
          <label>Archivo<select value={archiveId} onChange={(event) => setArchiveId(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <label>Pasillo<select value={aisle} onChange={(event) => setAisle(event.target.value)}>{aisles.map((item) => <option key={item} value={item}>Pasillo {item}</option>)}</select></label>
          <label>Estanteria<select value={code} onChange={(event) => setCode(event.target.value)}>{shelfNumbers.map((item) => <option key={item} value={item}>Estanteria {item}</option>)}</select></label>
          <label>Cuerpo<select value={body} onChange={(event) => setBody(event.target.value)}>{bodies.map((item) => <option key={item} value={item}>Cuerpo {item}</option>)}</select></label>
          <label>Nivel<select value={level} onChange={(event) => setLevel(event.target.value)}>{levels.map((item) => <option key={item} value={item}>Nivel {item}</option>)}</select></label>
          <label>Nombre operativo<input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Estanteria ${code}`} /></label>
          <label>Capacidad cajas<input type="number" min={0} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <p className="muted">La ruta se arma con selecciones. No se escribe ubicacion manual.</p>
          <button disabled={create.isPending}><Plus size={16} /> Crear ubicacion</button>
        </form></section>
        <section className="grid">
          <FilterBar><select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos los archivos</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></FilterBar>
          {shelves.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!shelves.isLoading && shelves.data?.length === 0 ? <EmptyState icon={<Archive size={20} />} title="No hay estanterias" description="Crea estanterias para ubicar cajas y controlar capacidad." /> : null}
          <DataTable><table><thead><tr><th>Ruta topografica</th><th>Archivo</th><th>Cajas</th><th>Ocupacion</th><th>Estado</th></tr></thead><tbody>{shelves.data?.map((item) => <tr key={item.idShelf}><td>{item.topographic_path ?? `Pasillo ${item.aisle ?? "-"} / Estanteria ${item.shelf_code} / Cuerpo ${item.body ?? item.module ?? "-"} / Nivel ${item.level ?? item.bay ?? "-"}`}<br /><span className="muted">{item.shelf_name}</span></td><td>{archiveName(item.archive_id)}</td><td>{item.current_boxes}/{item.capacity_boxes || "-"}</td><td>{item.occupancy_percent}%</td><td><StatusBadge value={item.status} tone={tone(item.status)} /></td></tr>)}</tbody></table></DataTable>
        </section>
      </div>
    </>
  );
}
