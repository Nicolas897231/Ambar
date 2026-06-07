"use client";

import { FormEvent, useState } from "react";
import { FileBox, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ExpedientItem = { idExpedient: number; expedient_name: string; expedient_code: string; ps930IdArchive: number };
type FolderItem = { idFolder: number; folder_code: string; folder_name: string; ps950IdExpedient: number; ps930IdArchive: number; document_count: number; folio_count: number; status: string; physical_location?: string };
type BoxItem = { idBox: number; archive_id: number; box_code: string; box_name?: string; location_path?: string; current_folders: number; capacity_folders: number };

export default function FoldersPage() {
  const client = useQueryClient();
  const [expedientId, setExpedientId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [boxId, setBoxId] = useState("");
  const expedients = useQuery({ queryKey: ["expedients"], queryFn: async () => (await api.get<ExpedientItem[]>("/archives/expedients")).data });
  const selectedExpedient = expedients.data?.find((item) => String(item.idExpedient) === expedientId);
  const boxes = useQuery({
    queryKey: ["boxes-for-folder", selectedExpedient?.ps930IdArchive],
    enabled: Boolean(selectedExpedient?.ps930IdArchive),
    queryFn: async () => (await api.get<BoxItem[]>(`/archives/boxes?archive_id=${selectedExpedient?.ps930IdArchive}`)).data
  });
  const folders = useQuery({ queryKey: ["folders", expedientId], queryFn: async () => (await api.get<FolderItem[]>(`/archives/folders${expedientId ? `?expedient_id=${expedientId}` : ""}`)).data });
  const create = useMutation({
    mutationFn: async () => api.post("/archives/folders", { expedient_id: Number(expedientId), folder_code: code, folder_name: name, box_id: Number(boxId) }),
    onSuccess: () => { setCode(""); setName(""); setBoxId(""); client.invalidateQueries({ queryKey: ["folders"] }); client.invalidateQueries({ queryKey: ["boxes"] }); }
  });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Carpetas</span></div>
      <PageTitle title="Carpetas" description="Carpetas fisicas o electronicas dentro de expedientes vivos." action={<button className="ghost" onClick={() => folders.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card"><h2>Nueva carpeta</h2><form className="form-grid" onSubmit={submit}>
          <label>Expediente<select value={expedientId} onChange={(event) => { setExpedientId(event.target.value); setBoxId(""); }} required><option value="">Seleccionar</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label>
          <label>Codigo carpeta<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="CARP-001" required /></label>
          <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Unidad de conservacion<select value={boxId} onChange={(event) => setBoxId(event.target.value)} required><option value="">Seleccionar caja</option>{boxes.data?.map((item) => <option key={item.idBox} value={item.idBox}>{item.box_code} - {item.location_path ?? "Ruta pendiente"} ({item.current_folders}/{item.capacity_folders || "-"})</option>)}</select></label>
          {expedientId && !boxes.isLoading && boxes.data?.length === 0 ? <p className="error">Este archivo no tiene cajas disponibles. Crea una caja antes de ubicar carpetas.</p> : <p className="muted">La carpeta no maneja ubicacion escrita: hereda la ruta fisica de la caja seleccionada.</p>}
          <button disabled={create.isPending}><Plus size={17} /> Crear carpeta</button>
        </form></section>
        <section className="card table-card"><table><thead><tr><th>Carpeta</th><th>Expediente</th><th>Documentos</th><th>Folios</th><th>Ubicacion heredada</th><th>Estado</th></tr></thead><tbody>{folders.data?.map((item) => <tr key={item.idFolder}><td><FileBox size={16} /> {item.folder_name}<br /><span className="muted">{item.folder_code}</span></td><td>{item.ps950IdExpedient}</td><td>{item.document_count}</td><td>{item.folio_count}</td><td>{item.physical_location ?? "Caja pendiente"}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody></table></section>
      </div>
    </>
  );
}
