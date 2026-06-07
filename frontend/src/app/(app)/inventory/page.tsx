"use client";

import { useMemo, useState } from "react";
import { Archive, Boxes, FileBox, RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type LocationSummary = { archives: number; shelves: number; boxes: number; full_boxes: number; available_boxes: number; folders_without_box: number; documents_without_location: number; by_archive: Array<{ archive_id: number; archive_name: string; capacity_boxes: number; boxes: number; occupancy_percent: number; folders_without_box: number }> };
type BoxNode = { idBox: number; box_code: string; box_name?: string; current_folders: number; current_documents: number; occupancy_percent: number; status: string; location_path?: string; folders: Array<{ idFolder: number; folder_code: string; folder_name: string; documents_count: number; location_path?: string }> };
type ShelfNode = { idShelf: number; shelf_code: string; shelf_name: string; boxes: BoxNode[] };
type ArchiveTree = { archive_id: number; archive_name: string; archive_code: string; shelves: ShelfNode[]; boxes_without_shelf: BoxNode[] };

function tone(percent: number) {
  if (percent >= 90) return "danger" as const;
  if (percent >= 71) return "warning" as const;
  return "success" as const;
}

export default function InventoryPage() {
  const [archiveId, setArchiveId] = useState("");
  const [detail, setDetail] = useState<BoxNode | null>(null);
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const summary = useQuery({ queryKey: ["inventory-summary", archiveId], queryFn: async () => (await api.get<LocationSummary>(`/archives/locations/summary${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const tree = useQuery({ queryKey: ["inventory-tree", archiveId], queryFn: async () => (await api.get<ArchiveTree[]>(`/archives/locations/tree${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const boxes = useMemo(() => (tree.data ?? []).flatMap((archive) => [...archive.shelves.flatMap((shelf) => shelf.boxes), ...archive.boxes_without_shelf]), [tree.data]);

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Inventarios"]} />
      <PageHeader
        title="Inventario vivo"
        eyebrow="Control operativo"
        description="Inventario por archivo, caja, carpeta y documento con ocupacion, inconsistencias y ruta fisica."
        action={<button className="ghost" type="button" onClick={() => { summary.refetch(); tree.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>}
      />
      <FilterBar><select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos los archivos</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></FilterBar>

      <section className="metrics">
        <MetricCard label="Archivos" value={summary.data?.archives ?? 0} tone="info" />
        <MetricCard label="Cajas" value={summary.data?.boxes ?? 0} />
        <MetricCard label="Cajas llenas" value={summary.data?.full_boxes ?? 0} tone={(summary.data?.full_boxes ?? 0) ? "warning" : "success"} />
        <MetricCard label="Disponibles" value={summary.data?.available_boxes ?? 0} tone="success" />
        <MetricCard label="Carpetas sin caja" value={summary.data?.folders_without_box ?? 0} tone={(summary.data?.folders_without_box ?? 0) ? "danger" : "success"} />
        <MetricCard label="Docs sin ubicacion" value={summary.data?.documents_without_location ?? 0} tone={(summary.data?.documents_without_location ?? 0) ? "danger" : "success"} />
      </section>

      <section className="module-grid">
        {summary.data?.by_archive.map((item) => <article className="card compact" key={item.archive_id}><strong><Archive size={16} /> {item.archive_name}</strong><p className="muted">{item.boxes} cajas / capacidad {item.capacity_boxes || "sin limite"}</p><StatusBadge value={`${item.occupancy_percent}% ocupacion`} tone={tone(item.occupancy_percent)} /></article>)}
      </section>

      <section className="card">
        <div className="toolbar space-between"><h2>Cajas inventariadas</h2><StatusBadge value={boxes.length} tone="info" /></div>
        {summary.isLoading || tree.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!summary.isLoading && !tree.isLoading && boxes.length === 0 ? <EmptyState icon={<Boxes size={20} />} title="Sin cajas inventariadas" description="Crea cajas y asigna carpetas para activar el inventario vivo." /> : null}
        <DataTable>
          <table>
            <thead><tr><th>Caja</th><th>Ruta</th><th>Carpetas</th><th>Documentos</th><th>Ocupacion</th><th>Estado</th></tr></thead>
            <tbody>{boxes.map((box) => <tr key={box.idBox} onClick={() => setDetail(box)}><td>{box.box_code}<br /><span className="muted">{box.box_name}</span></td><td>{box.location_path ?? "Sin ruta"}</td><td>{box.current_folders}</td><td>{box.current_documents}</td><td>{box.occupancy_percent}%</td><td><StatusBadge value={box.status} tone={tone(box.occupancy_percent)} /></td></tr>)}</tbody>
          </table>
        </DataTable>
      </section>

      <DetailDrawer open={Boolean(detail)} title={detail?.box_code ?? "Caja"} subtitle={detail?.location_path} onClose={() => setDetail(null)}>
        {detail ? <section className="grid">
          <div className="grid metrics"><MetricCard label="Carpetas" value={detail.current_folders} /><MetricCard label="Documentos" value={detail.current_documents} /><MetricCard label="Ocupacion" value={`${detail.occupancy_percent}%`} tone={tone(detail.occupancy_percent)} /></div>
          <DataTable><table><thead><tr><th>Carpeta</th><th>Documentos</th><th>Ruta</th></tr></thead><tbody>{detail.folders.map((folder) => <tr key={folder.idFolder}><td><FileBox size={15} /> {folder.folder_code}<br /><span className="muted">{folder.folder_name}</span></td><td>{folder.documents_count}</td><td>{folder.location_path ?? detail.location_path}</td></tr>)}</tbody></table></DataTable>
        </section> : null}
      </DetailDrawer>
    </>
  );
}
