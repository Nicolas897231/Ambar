"use client";

import { FormEvent, useMemo, useState } from "react";
import { Boxes, MoveRight, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type ShelfItem = { idShelf: number; archive_id: number; shelf_code: string; shelf_name: string; aisle?: string | null; module?: string | null; bay?: string | null; body?: string | null; level?: string | null; topographic_path?: string | null };
type BoxItem = { idBox: number; archive_id: number; archive_name?: string; shelf_id?: number; shelf_code?: string; box_code: string; box_name?: string; capacity_folders: number; current_folders: number; current_documents: number; occupancy_percent: number; status: string; location_path?: string };
type BoxContents = { box: BoxItem; folders: Array<{ idFolder: number; folder_code: string; folder_name: string; documents_count: number; folio_count: number; location_path?: string }> };

function tone(status: string) {
  if (["active", "available"].includes(status)) return "success";
  if (["full", "reserved"].includes(status)) return "warning";
  if (["inactive", "damaged"].includes(status)) return "danger";
  return "neutral";
}

function shelfLabel(item: ShelfItem) {
  return item.topographic_path || [item.aisle ? `Pasillo ${item.aisle}` : null, `Estanteria ${item.shelf_code}`, item.body || item.module ? `Cuerpo ${item.body ?? item.module}` : null, item.level || item.bay ? `Nivel ${item.level ?? item.bay}` : null].filter(Boolean).join(" / ");
}

export default function BoxesPage() {
  const client = useQueryClient();
  const [archiveId, setArchiveId] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [boxName, setBoxName] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [moveShelfId, setMoveShelfId] = useState("");
  const [detail, setDetail] = useState<BoxItem | null>(null);
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const shelves = useQuery({ queryKey: ["shelves", archiveId], queryFn: async () => (await api.get<ShelfItem[]>(`/archives/shelves${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const boxes = useQuery({ queryKey: ["boxes", archiveId], queryFn: async () => (await api.get<BoxItem[]>(`/archives/boxes${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const contents = useQuery({ queryKey: ["box-contents", detail?.idBox], enabled: Boolean(detail), queryFn: async () => (await api.get<BoxContents>(`/archives/boxes/${detail?.idBox}/contents`)).data });
  const create = useMutation({
    mutationFn: async () => api.post("/archives/boxes", { archive_id: Number(archiveId), shelf_id: shelfId ? Number(shelfId) : null, box_code: boxCode, box_name: boxName || null, capacity_folders: Number(capacity) }),
    onSuccess: () => { setBoxCode(""); setBoxName(""); client.invalidateQueries({ queryKey: ["boxes"] }); }
  });
  const move = useMutation({
    mutationFn: async () => api.post(`/archives/boxes/${detail?.idBox}/move`, { shelf_id: Number(moveShelfId), observation: "Movimiento fisico desde AMBAR" }),
    onSuccess: () => { setMoveShelfId(""); client.invalidateQueries({ queryKey: ["boxes"] }); client.invalidateQueries({ queryKey: ["box-contents", detail?.idBox] }); }
  });
  const filteredShelves = (shelves.data ?? []).filter((item) => !archiveId || item.archive_id === Number(archiveId));
  const totals = useMemo(() => ({ boxes: boxes.data?.length ?? 0, full: (boxes.data ?? []).filter((item) => item.status === "full").length, folders: (boxes.data ?? []).reduce((acc, item) => acc + item.current_folders, 0) }), [boxes.data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Cajas"]} />
      <PageHeader title="Cajas fisicas" eyebrow="Ubicacion real" description="Crea, ubica y mueve cajas dentro del mismo archivo con Kardex y auditoria." action={<button className="ghost" onClick={() => boxes.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="grid metrics"><MetricCard label="Cajas" value={totals.boxes} /><MetricCard label="Llenas" value={totals.full} tone={totals.full ? "warning" : "success"} /><MetricCard label="Carpetas ubicadas" value={totals.folders} tone="info" /></div>
      <div className="split">
        <section className="card"><h2>Nueva caja</h2><form className="form-grid" onSubmit={submit}>
          <label>Archivo<select value={archiveId} onChange={(event) => { setArchiveId(event.target.value); setShelfId(""); }} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <label>Ubicacion topografica<select value={shelfId} onChange={(event) => setShelfId(event.target.value)} required><option value="">Seleccionar ruta</option>{filteredShelves.map((item) => <option key={item.idShelf} value={item.idShelf}>{shelfLabel(item)} - {item.shelf_name}</option>)}</select></label>
          <label>Codigo<input value={boxCode} onChange={(event) => setBoxCode(event.target.value)} placeholder="BX-2026-0001" required /></label>
          <label>Nombre<input value={boxName} onChange={(event) => setBoxName(event.target.value)} /></label>
          <label>Capacidad carpetas<input type="number" min={0} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <button disabled={create.isPending}><Plus size={16} /> Crear caja</button>
        </form></section>
        <section className="grid">
          <FilterBar><select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos los archivos</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></FilterBar>
          {boxes.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!boxes.isLoading && boxes.data?.length === 0 ? <EmptyState icon={<Boxes size={20} />} title="No hay cajas" description="Crea la primera caja para empezar a ubicar carpetas." /> : null}
          <DataTable><table><thead><tr><th>Caja</th><th>Archivo</th><th>Ruta fisica</th><th>Carpetas</th><th>Ocupacion</th><th>Estado</th></tr></thead><tbody>{boxes.data?.map((item) => <tr key={item.idBox} onClick={() => setDetail(item)}><td>{item.box_code}<br /><span className="muted">{item.box_name}</span></td><td>{item.archive_name}</td><td>{item.location_path ?? "Sin ruta"}</td><td>{item.current_folders}/{item.capacity_folders || "-"}</td><td>{item.occupancy_percent}%</td><td><StatusBadge value={item.status} tone={tone(item.status)} /></td></tr>)}</tbody></table></DataTable>
        </section>
      </div>
      <DetailDrawer open={Boolean(detail)} title={detail?.box_code ?? "Caja"} subtitle={detail?.location_path} onClose={() => setDetail(null)}>
        {detail ? <section className="grid">
          <div className="grid metrics"><MetricCard label="Carpetas" value={detail.current_folders} /><MetricCard label="Documentos" value={detail.current_documents} /><MetricCard label="Ocupacion" value={`${detail.occupancy_percent}%`} tone={detail.occupancy_percent > 85 ? "warning" : "success"} /></div>
          <div className="card compact"><h3>Mover caja</h3><div className="toolbar"><select value={moveShelfId} onChange={(event) => setMoveShelfId(event.target.value)}><option value="">Seleccionar ruta</option>{filteredShelves.map((item) => <option key={item.idShelf} value={item.idShelf}>{shelfLabel(item)} - {item.shelf_name}</option>)}</select><button disabled={!moveShelfId || move.isPending} onClick={() => move.mutate()}><MoveRight size={16} /> Mover</button></div><p className="muted">Si el destino pertenece a otro archivo, AMBAR lo bloquea y pide transferencia documental.</p></div>
          <DataTable><table><thead><tr><th>Carpeta</th><th>Documentos</th><th>Folios</th><th>Ruta</th></tr></thead><tbody>{contents.data?.folders.map((item) => <tr key={item.idFolder}><td>{item.folder_code}<br /><span className="muted">{item.folder_name}</span></td><td>{item.documents_count}</td><td>{item.folio_count}</td><td>{item.location_path}</td></tr>)}</tbody></table></DataTable>
        </section> : null}
      </DetailDrawer>
    </>
  );
}
