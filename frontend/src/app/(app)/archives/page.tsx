"use client";

import { FormEvent, useMemo, useState } from "react";
import { Building2, FolderKanban, Package, Plus, RefreshCcw, ShieldCheck, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_code: string; archive_name: string; archive_type: string; status: string; physical_location?: string; box_count: number; expedient_count: number; document_count: number; capacity_units?: number; custodian_identification?: string; responsible_identification?: string };

function archiveTone(status: string) {
  if (status === "active") return "success";
  if (status === "full" || status === "maintenance") return "warning";
  return "neutral";
}

export default function ArchivesPage() {
  const client = useQueryClient();
  const [archiveCode, setArchiveCode] = useState("");
  const [archiveName, setArchiveName] = useState("");
  const [archiveType, setArchiveType] = useState("gestion");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const [selectedArchive, setSelectedArchive] = useState("");
  const [identification, setIdentification] = useState("");
  const [accessLevel, setAccessLevel] = useState("read");
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState<ArchiveItem | null>(null);
  const [message, setMessage] = useState("");

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const create = useMutation({
    mutationFn: async () => api.post("/archives", { archive_code: archiveCode, archive_name: archiveName, archive_type: archiveType, physical_location: physicalLocation || null, capacity_units: 0 }),
    onSuccess: () => { setArchiveCode(""); setArchiveName(""); setPhysicalLocation(""); setMessage("Archivo creado correctamente."); client.invalidateQueries({ queryKey: ["archives"] }); },
    onError: () => setMessage("No fue posible crear el archivo. Revisa codigo unico y permisos.")
  });
  const grant = useMutation({
    mutationFn: async () => api.post(`/archives/${selectedArchive}/users`, { identification, access_level: accessLevel }),
    onSuccess: () => { setIdentification(""); setMessage("Acceso por archivo asignado."); client.invalidateQueries({ queryKey: ["archives"] }); },
    onError: () => setMessage("No fue posible asignar acceso. Verifica archivo, usuario y permisos.")
  });

  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (archives.data ?? []).filter((item) => `${item.archive_name} ${item.archive_code} ${item.archive_type} ${item.physical_location ?? ""}`.toLowerCase().includes(term));
  }, [archives.data, filter]);
  const totals = useMemo(() => ({
    archives: archives.data?.length ?? 0,
    documents: (archives.data ?? []).reduce((acc, item) => acc + item.document_count, 0),
    expedients: (archives.data ?? []).reduce((acc, item) => acc + item.expedient_count, 0),
    boxes: (archives.data ?? []).reduce((acc, item) => acc + item.box_count, 0)
  }), [archives.data]);

  function submitArchive(event: FormEvent) { event.preventDefault(); create.mutate(); }
  function submitAccess(event: FormEvent) { event.preventDefault(); grant.mutate(); }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Archivos"]} />
      <PageHeader title="Archivos" eyebrow="Segregacion por archivo" description="Archivos de gestion, centrales, historicos y satelite con permisos por usuario y trazabilidad operativa." action={<button className="ghost" onClick={() => archives.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") ? "error" : "status"}>{message}</span></div> : null}

      <div className="grid metrics">
        <MetricCard label="Archivos activos" value={totals.archives} tone="info" />
        <MetricCard label="Documentos custodiados" value={totals.documents} tone="success" />
        <MetricCard label="Expedientes" value={totals.expedients} />
        <MetricCard label="Cajas registradas" value={totals.boxes} tone="warning" />
      </div>

      <div className="split archive-layout">
        <section className="card">
          <h2>Nuevo archivo</h2>
          <form className="form-grid" onSubmit={submitArchive}>
            <label>Codigo<input value={archiveCode} onChange={(event) => setArchiveCode(event.target.value)} placeholder="ARCH-CALI-GESTION" required /></label>
            <label>Nombre<input value={archiveName} onChange={(event) => setArchiveName(event.target.value)} placeholder="Archivo Gestion RRHH Cali" required /></label>
            <label>Tipo<select value={archiveType} onChange={(event) => setArchiveType(event.target.value)}><option value="gestion">Gestion</option><option value="central">Central</option><option value="historico">Historico</option><option value="satelite">Satelite</option></select></label>
            <label>Ubicacion fisica<input value={physicalLocation} onChange={(event) => setPhysicalLocation(event.target.value)} /></label>
            <button disabled={create.isPending}><Plus size={17} /> Crear archivo</button>
          </form>
          <hr />
          <h2>Acceso por archivo</h2>
          <form className="form-grid" onSubmit={submitAccess}>
            <label>Archivo<select value={selectedArchive} onChange={(event) => setSelectedArchive(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
            <label>Identificacion usuario<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
            <label>Nivel<select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value)}><option value="read">Lectura</option><option value="operate">Operar</option><option value="admin">Administrador archivo</option></select></label>
            <button disabled={grant.isPending}><ShieldCheck size={17} /> Asignar acceso</button>
          </form>
        </section>

        <section className="grid">
          <FilterBar><input placeholder="Filtrar archivo, sede o codigo" value={filter} onChange={(event) => setFilter(event.target.value)} /></FilterBar>
          {archives.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!archives.isLoading && filtered.length === 0 ? <EmptyState icon={<Building2 size={20} />} title="No hay archivos para mostrar" description="Crea un archivo o revisa si tu usuario tiene acceso al archivo seleccionado." /> : null}
          <div className="archive-card-grid">
            {filtered.map((item) => {
              const capacity = item.capacity_units ? Math.min(100, Math.round((item.box_count / item.capacity_units) * 100)) : 0;
              return (
                <button className="archive-card" type="button" key={item.idArchive} onClick={() => setDetail(item)}>
                  <div className="toolbar space-between"><Building2 size={19} /><StatusBadge value={item.status} tone={archiveTone(item.status)} /></div>
                  <strong>{item.archive_name}</strong>
                  <span className="muted">{item.archive_code} · {item.archive_type}</span>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${capacity}%` }} /></div>
                  <div className="archive-stats"><span>{item.expedient_count} expedientes</span><span>{item.document_count} docs</span><span>{item.box_count} cajas</span></div>
                </button>
              );
            })}
          </div>
          <DataTable>
            <table>
              <thead><tr><th>Archivo</th><th>Tipo</th><th>Ubicacion</th><th>Expedientes</th><th>Docs</th><th>Cajas</th><th>Estado</th></tr></thead>
              <tbody>{filtered.map((item) => <tr key={item.idArchive}><td><strong>{item.archive_name}</strong><br /><span className="muted">{item.archive_code}</span></td><td>{item.archive_type}</td><td>{item.physical_location ?? "Sin ubicacion"}</td><td>{item.expedient_count}</td><td>{item.document_count}</td><td>{item.box_count}</td><td><StatusBadge value={item.status} tone={archiveTone(item.status)} /></td></tr>)}</tbody>
            </table>
          </DataTable>
        </section>
      </div>

      <DetailDrawer open={Boolean(detail)} title={detail?.archive_name ?? "Archivo"} subtitle={detail?.archive_code} onClose={() => setDetail(null)}>
        {detail ? <>
          <div className="grid metrics drawer-metrics"><MetricCard label="Expedientes" value={detail.expedient_count} /><MetricCard label="Documentos" value={detail.document_count} /><MetricCard label="Cajas" value={detail.box_count} /></div>
          <section className="card compact"><h3>Custodia</h3><p className="muted">Custodio: {detail.custodian_identification ?? "Sin asignar"}</p><p className="muted">Responsable: {detail.responsible_identification ?? "Sin asignar"}</p><p className="muted">Ubicacion: {detail.physical_location ?? "Sin registrar"}</p></section>
          <section className="timeline"><TimelineEvent state="Activo" tone="success" title="Archivo disponible" description="El backend filtra documentos, expedientes, cajas y kardex por los permisos de este archivo." /><TimelineEvent state="Accesos" tone="info" title="RBAC por archivo" description="Asigna usuarios desde este modulo para limitar operacion por sede o archivo." /></section>
          <div className="module-grid"><a className="module-card" href={`/expedients?archive=${detail.idArchive}`}><FolderKanban size={18} /><strong>Expedientes</strong></a><a className="module-card" href={`/boxes?archive=${detail.idArchive}`}><Package size={18} /><strong>Cajas</strong></a><a className="module-card" href={`/users`}><Users size={18} /><strong>Usuarios</strong></a></div>
        </> : null}
      </DetailDrawer>
    </>
  );
}
