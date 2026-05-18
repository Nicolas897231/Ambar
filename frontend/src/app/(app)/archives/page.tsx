"use client";

import { FormEvent, useState } from "react";
import { Building2, Plus, RefreshCcw, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ArchiveItem = { idArchive: number; archive_code: string; archive_name: string; archive_type: string; status: string; physical_location?: string; box_count: number; expedient_count: number; document_count: number };

export default function ArchivesPage() {
  const client = useQueryClient();
  const [archiveCode, setArchiveCode] = useState("");
  const [archiveName, setArchiveName] = useState("");
  const [archiveType, setArchiveType] = useState("gestion");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const [selectedArchive, setSelectedArchive] = useState("");
  const [identification, setIdentification] = useState("");
  const [accessLevel, setAccessLevel] = useState("read");
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const create = useMutation({
    mutationFn: async () => api.post("/archives", { archive_code: archiveCode, archive_name: archiveName, archive_type: archiveType, physical_location: physicalLocation || null, capacity_units: 0 }),
    onSuccess: () => { setArchiveCode(""); setArchiveName(""); setPhysicalLocation(""); client.invalidateQueries({ queryKey: ["archives"] }); }
  });
  const grant = useMutation({
    mutationFn: async () => api.post(`/archives/${selectedArchive}/users`, { identification, access_level: accessLevel }),
    onSuccess: () => { setIdentification(""); client.invalidateQueries({ queryKey: ["archives"] }); }
  });
  function submitArchive(event: FormEvent) { event.preventDefault(); create.mutate(); }
  function submitAccess(event: FormEvent) { event.preventDefault(); grant.mutate(); }
  return (
    <>
      <div className="breadcrumbs"><span>Custodia Documental</span><span>Archivos</span></div>
      <PageTitle title="Archivos" description="Archivos de gestion, centrales, historicos y satelite con segregacion por sede." action={<button className="ghost" onClick={() => archives.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Nuevo archivo</h2>
          <form className="form-grid" onSubmit={submitArchive}>
            <label>Codigo<input value={archiveCode} onChange={(event) => setArchiveCode(event.target.value)} placeholder="ARCH-CALI-GESTION" required /></label>
            <label>Nombre<input value={archiveName} onChange={(event) => setArchiveName(event.target.value)} placeholder="Archivo Gestion RRHH Cali" required /></label>
            <label>Tipo<select value={archiveType} onChange={(event) => setArchiveType(event.target.value)}><option value="gestion">Gestion</option><option value="central">Central</option><option value="historico">Historico</option><option value="satelite">Satelite</option></select></label>
            <label>Ubicacion fisica<input value={physicalLocation} onChange={(event) => setPhysicalLocation(event.target.value)} /></label>
            <button disabled={create.isPending}><Plus size={17} /> Crear archivo</button>
          </form>
          <h2>Acceso por archivo</h2>
          <form className="form-grid" onSubmit={submitAccess}>
            <label>Archivo<select value={selectedArchive} onChange={(event) => setSelectedArchive(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
            <label>Identificacion usuario<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
            <label>Nivel<select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value)}><option value="read">Lectura</option><option value="operate">Operar</option><option value="admin">Administrador archivo</option></select></label>
            <button disabled={grant.isPending}><ShieldCheck size={17} /> Asignar acceso</button>
          </form>
        </section>
        <section className="card table-card">
          <table>
            <thead><tr><th>Archivo</th><th>Tipo</th><th>Ubicacion</th><th>Expedientes</th><th>Docs</th><th>Cajas</th><th>Estado</th></tr></thead>
            <tbody>{archives.data?.map((item) => <tr key={item.idArchive}><td><Building2 size={16} /> {item.archive_name}<br /><span className="muted">{item.archive_code}</span></td><td>{item.archive_type}</td><td>{item.physical_location}</td><td>{item.expedient_count}</td><td>{item.document_count}</td><td>{item.box_count}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
