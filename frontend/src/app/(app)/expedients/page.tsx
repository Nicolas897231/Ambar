"use client";

import { FormEvent, useState } from "react";
import { FolderKanban, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ArchiveItem = { idArchive: number; archive_name: string };
type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string; expedient_type: string; status: string; ps930IdArchive: number; document_count: number; folio_count: number; physical_location?: string };

export default function ExpedientsPage() {
  const client = useQueryClient();
  const [archiveId, setArchiveId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("administrativo");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const expedients = useQuery({ queryKey: ["expedients", archiveId], queryFn: async () => (await api.get<ExpedientItem[]>(`/archives/expedients${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const create = useMutation({ mutationFn: async () => api.post("/archives/expedients", { archive_id: Number(archiveId), expedient_code: code, expedient_name: name, expedient_type: type, physical_location: physicalLocation || null }), onSuccess: () => { setCode(""); setName(""); client.invalidateQueries({ queryKey: ["expedients"] }); } });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Expedientes</span></div>
      <PageTitle title="Expedientes" description="Expedientes vivos asociados a archivo, TRD, carpetas, folios e historial." action={<button className="ghost" onClick={() => expedients.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card"><h2>Nuevo expediente</h2><form className="form-grid" onSubmit={submit}>
          <label>Archivo<select value={archiveId} onChange={(event) => setArchiveId(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <label>Codigo expediente<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="EXP-RRHH-0001" required /></label>
          <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}><option value="laboral">Laboral</option><option value="juridico">Juridico</option><option value="contable">Contable</option><option value="administrativo">Administrativo</option><option value="contratos">Contratos</option><option value="hibrido">Hibrido</option><option value="electronico">Electronico</option></select></label>
          <label>Ubicacion fisica<input value={physicalLocation} onChange={(event) => setPhysicalLocation(event.target.value)} /></label>
          <button disabled={create.isPending}><Plus size={17} /> Crear expediente</button>
        </form></section>
        <section className="card table-card"><table><thead><tr><th>Expediente</th><th>Tipo</th><th>Archivo</th><th>Documentos</th><th>Folios</th><th>Estado</th></tr></thead><tbody>{expedients.data?.map((item) => <tr key={item.idExpedient}><td><FolderKanban size={16} /> {item.expedient_name}<br /><span className="muted">{item.expedient_code}</span></td><td>{item.expedient_type}</td><td>{item.ps930IdArchive}</td><td>{item.document_count}</td><td>{item.folio_count}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody></table></section>
      </div>
    </>
  );
}
