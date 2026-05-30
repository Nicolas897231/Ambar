"use client";

import { useMemo, useState } from "react";
import { Archive, Boxes, FolderKanban, MapPin, RefreshCcw, Route } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type LocationSummary = { archives: number; shelves: number; boxes: number; full_boxes: number; available_boxes: number; folders_without_box: number; documents_without_location: number; recent_movements: number; by_archive: Array<{ archive_id: number; archive_name: string; capacity_boxes: number; boxes: number; occupancy_percent: number; folders_without_box: number }> };
type BoxNode = { idBox: number; box_code: string; box_name?: string; current_folders: number; current_documents: number; occupancy_percent: number; status: string; location_path?: string; folders: Array<{ idFolder: number; folder_code: string; folder_name: string; documents_count: number; location_path?: string }> };
type ShelfNode = { idShelf: number; shelf_code: string; shelf_name: string; floor?: string | null; module?: string | null; bay?: string | null; current_boxes: number; capacity_boxes: number; occupancy_percent: number; status: string; boxes: BoxNode[] };
type ArchiveTree = { archive_id: number; archive_name: string; archive_code: string; shelves: ShelfNode[]; boxes_without_shelf: BoxNode[] };
type Unassigned = { boxes_without_shelf: BoxNode[]; folders_without_box: Array<{ idFolder: number; folder_code: string; folder_name: string; archive_id: number; expedient_id: number }>; documents_without_location: Array<{ idDocument: number; document_name: string; archive_id: number; folder_id?: number }>; expedients_without_location: Array<{ idExpedient: number; expedient_code: string; expedient_name: string; archive_id: number }> };
type Movement = { idMovement: number; movement_type: string; entity_type: string; entity_id: number; status: string; observations?: string; created_at?: string; metadata_json?: { origin_location?: string; destination_location?: string } };

function tone(value: string) {
  if (["active", "available", "accepted"].includes(value)) return "success";
  if (["full", "reserved", "pending"].includes(value)) return "warning";
  if (["inactive", "damaged", "rejected"].includes(value)) return "danger";
  return "neutral";
}

export default function LocationsPage() {
  const [archiveId, setArchiveId] = useState("");
  const [tab, setTab] = useState("Resumen");
  const [detail, setDetail] = useState<BoxNode | null>(null);
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const summary = useQuery({ queryKey: ["locations-summary", archiveId], queryFn: async () => (await api.get<LocationSummary>(`/archives/locations/summary${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const tree = useQuery({ queryKey: ["locations-tree", archiveId], queryFn: async () => (await api.get<ArchiveTree[]>(`/archives/locations/tree${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const unassigned = useQuery({ queryKey: ["locations-unassigned", archiveId], queryFn: async () => (await api.get<Unassigned>(`/archives/locations/unassigned${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const movements = useQuery({ queryKey: ["locations-movements", archiveId], queryFn: async () => (await api.get<Movement[]>(`/archives/locations/movements${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const loading = summary.isLoading || tree.isLoading;
  const totals = summary.data;
  const archiveOptions = archives.data ?? [];
  const allBoxes = useMemo(() => (tree.data ?? []).flatMap((archive) => [...archive.shelves.flatMap((shelf) => shelf.boxes), ...archive.boxes_without_shelf]), [tree.data]);

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Ubicaciones"]} />
      <PageHeader title="Ubicaciones fisicas" eyebrow="Custodia operativa" description="Mapa fisico de archivos, estanterias, cajas, carpetas y documentos con Kardex automatico." action={<button className="ghost" onClick={() => { summary.refetch(); tree.refetch(); unassigned.refetch(); movements.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>} />
      <FilterBar><select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos los archivos</option>{archiveOptions.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></FilterBar>
      {loading ? <LoadingSkeleton rows={5} /> : null}
      <div className="grid metrics">
        <MetricCard label="Archivos" value={totals?.archives ?? 0} tone="info" />
        <MetricCard label="Estanterias" value={totals?.shelves ?? 0} />
        <MetricCard label="Cajas" value={totals?.boxes ?? 0} tone="warning" />
        <MetricCard label="Cajas llenas" value={totals?.full_boxes ?? 0} tone={(totals?.full_boxes ?? 0) ? "warning" : "success"} />
        <MetricCard label="Carpetas sin caja" value={totals?.folders_without_box ?? 0} tone={(totals?.folders_without_box ?? 0) ? "danger" : "success"} />
        <MetricCard label="Docs sin ubicacion" value={totals?.documents_without_location ?? 0} tone={(totals?.documents_without_location ?? 0) ? "danger" : "success"} />
      </div>
      <div className="tabbar scroll-tabs">{["Resumen", "Mapa fisico", "Cajas", "Sin ubicacion", "Movimientos"].map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>

      {tab === "Resumen" ? <section className="grid">
        {totals?.by_archive.map((item) => <article className="card compact" key={item.archive_id}><div className="toolbar space-between"><strong><Archive size={16} /> {item.archive_name}</strong><StatusBadge value={`${item.occupancy_percent}%`} tone={item.occupancy_percent > 85 ? "warning" : "success"} /></div><p className="muted">{item.boxes} cajas / capacidad {item.capacity_boxes || "sin limite"}</p><p className="muted">{item.folders_without_box} carpetas sin caja</p></article>)}
      </section> : null}

      {tab === "Mapa fisico" ? <section className="grid">
        {tree.data?.map((archive) => <article className="card compact" key={archive.archive_id}><h3><Archive size={16} /> {archive.archive_name}</h3>{archive.shelves.map((shelf) => <div className="card compact" key={shelf.idShelf}><div className="toolbar space-between"><div><strong>{shelf.shelf_code} - {shelf.shelf_name}</strong><p className="muted">{[shelf.floor, shelf.module, shelf.bay].filter(Boolean).join(" / ") || "Topografia pendiente"}</p></div><StatusBadge value={`${shelf.current_boxes}/${shelf.capacity_boxes || "-"}`} tone={shelf.occupancy_percent > 85 ? "warning" : "success"} /></div>{shelf.boxes.length === 0 ? <p className="muted">Sin cajas asignadas.</p> : shelf.boxes.map((box) => <button className="expedient-row" type="button" key={box.idBox} onClick={() => setDetail(box)}><Boxes size={16} /><span>{box.box_code}</span><span>{box.current_folders} carpetas</span><span>{box.current_documents} docs</span><StatusBadge value={box.status} tone={tone(box.status)} /></button>)}</div>)}{archive.boxes_without_shelf.length ? <div className="card compact"><strong>Cajas sin estanteria</strong>{archive.boxes_without_shelf.map((box) => <button className="expedient-row" type="button" key={box.idBox} onClick={() => setDetail(box)}><Boxes size={16} /><span>{box.box_code}</span><StatusBadge value="sin estanteria" tone="warning" /></button>)}</div> : null}</article>)}
      </section> : null}

      {tab === "Cajas" ? <DataTable><table><thead><tr><th>Caja</th><th>Ruta</th><th>Carpetas</th><th>Documentos</th><th>Ocupacion</th><th>Estado</th></tr></thead><tbody>{allBoxes.map((box) => <tr key={box.idBox} onClick={() => setDetail(box)}><td>{box.box_code}<br /><span className="muted">{box.box_name}</span></td><td>{box.location_path ?? "Sin ruta"}</td><td>{box.current_folders}</td><td>{box.current_documents}</td><td>{box.occupancy_percent}%</td><td><StatusBadge value={box.status} tone={tone(box.status)} /></td></tr>)}</tbody></table></DataTable> : null}

      {tab === "Sin ubicacion" ? <section className="grid">
        <article className="card compact"><h3>Cajas sin estanteria</h3>{unassigned.data?.boxes_without_shelf.length ? unassigned.data.boxes_without_shelf.map((item) => <p key={item.idBox} className="muted">{item.box_code} - {item.box_name}</p>) : <EmptyState title="Sin pendientes" description="Todas las cajas tienen estanteria." />}</article>
        <article className="card compact"><h3>Carpetas sin caja</h3>{unassigned.data?.folders_without_box.length ? unassigned.data.folders_without_box.map((item) => <p key={item.idFolder} className="muted">{item.folder_code} - {item.folder_name}</p>) : <EmptyState title="Sin pendientes" description="Todas las carpetas estan ubicadas." />}</article>
        <article className="card compact"><h3>Documentos sin ubicacion</h3>{unassigned.data?.documents_without_location.length ? unassigned.data.documents_without_location.map((item) => <p key={item.idDocument} className="muted">{item.document_name}</p>) : <EmptyState title="Sin pendientes" description="Todos los documentos heredan ubicacion." />}</article>
      </section> : null}

      {tab === "Movimientos" ? <section className="timeline">{movements.data?.length ? movements.data.map((item) => <TimelineEvent key={item.idMovement} state={item.status} tone={tone(item.status)} title={item.movement_type} description={item.observations ?? item.metadata_json?.destination_location ?? "Movimiento fisico registrado"} meta={item.created_at?.slice(0, 16)} />) : <EmptyState icon={<Route size={20} />} title="Sin movimientos fisicos" description="Cuando se muevan cajas o carpetas, apareceran aqui." />}</section> : null}

      <DetailDrawer open={Boolean(detail)} title={detail?.box_code ?? "Caja"} subtitle={detail?.location_path} onClose={() => setDetail(null)}>
        {detail ? <section className="grid">
          <div className="grid metrics"><MetricCard label="Carpetas" value={detail.current_folders} /><MetricCard label="Documentos" value={detail.current_documents} /><MetricCard label="Ocupacion" value={`${detail.occupancy_percent}%`} tone={detail.occupancy_percent > 85 ? "warning" : "success"} /></div>
          <article className="card compact"><h3>Contenido</h3>{detail.folders.length ? detail.folders.map((folder) => <p key={folder.idFolder} className="muted"><FolderKanban size={14} /> {folder.folder_code} - {folder.folder_name} ({folder.documents_count} docs)</p>) : <p className="muted">Caja sin carpetas.</p>}</article>
          <p className="muted"><MapPin size={14} /> {detail.location_path ?? "Sin ubicacion completa"}</p>
        </section> : null}
      </DetailDrawer>
    </>
  );
}
