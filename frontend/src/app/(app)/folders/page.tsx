"use client";

import { FormEvent, useState } from "react";
import { FileBox, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ExpedientItem = { idExpedient: number; expedient_name: string; expedient_code: string };
type FolderItem = { idFolder: number; folder_code: string; folder_name: string; ps950IdExpedient: number; ps930IdArchive: number; document_count: number; folio_count: number; status: string; physical_location?: string };

export default function FoldersPage() {
  const client = useQueryClient();
  const [expedientId, setExpedientId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const expedients = useQuery({ queryKey: ["expedients"], queryFn: async () => (await api.get<ExpedientItem[]>("/archives/expedients")).data });
  const folders = useQuery({ queryKey: ["folders", expedientId], queryFn: async () => (await api.get<FolderItem[]>(`/archives/folders${expedientId ? `?expedient_id=${expedientId}` : ""}`)).data });
  const create = useMutation({ mutationFn: async () => api.post("/archives/folders", { expedient_id: Number(expedientId), folder_code: code, folder_name: name, physical_location: physicalLocation || null }), onSuccess: () => { setCode(""); setName(""); client.invalidateQueries({ queryKey: ["folders"] }); } });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Carpetas</span></div>
      <PageTitle title="Carpetas" description="Carpetas fisicas o electronicas dentro de expedientes vivos." action={<button className="ghost" onClick={() => folders.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card"><h2>Nueva carpeta</h2><form className="form-grid" onSubmit={submit}>
          <label>Expediente<select value={expedientId} onChange={(event) => setExpedientId(event.target.value)} required><option value="">Seleccionar</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label>
          <label>Codigo carpeta<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="CARP-001" required /></label>
          <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Ubicacion fisica<input value={physicalLocation} onChange={(event) => setPhysicalLocation(event.target.value)} /></label>
          <button disabled={create.isPending}><Plus size={17} /> Crear carpeta</button>
        </form></section>
        <section className="card table-card"><table><thead><tr><th>Carpeta</th><th>Expediente</th><th>Documentos</th><th>Folios</th><th>Ubicacion</th><th>Estado</th></tr></thead><tbody>{folders.data?.map((item) => <tr key={item.idFolder}><td><FileBox size={16} /> {item.folder_name}<br /><span className="muted">{item.folder_code}</span></td><td>{item.ps950IdExpedient}</td><td>{item.document_count}</td><td>{item.folio_count}</td><td>{item.physical_location}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody></table></section>
      </div>
    </>
  );
}
