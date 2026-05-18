"use client";

import { FormEvent, useMemo, useState } from "react";
import { Download, Plus, RefreshCcw, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ArchiveItem = { idArchive: number; archive_name: string };
type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string; ps930IdArchive: number };
type FolderItem = { idFolder: number; folder_code: string; folder_name: string; ps950IdExpedient: number };
type DocumentItem = { idDocument: number; document_name: string; document_type: string; version: number; status: string; files_count: number; archive_id?: number; expedient_id?: number; folder_id?: number; folio_start?: number; folio_end?: number };
type FileItem = { idFile: number; original_name: string; content_type: string; checksum: string; size_bytes: number; url: string };

const documentTypes = ["acta", "contrato", "certificado", "oficio", "informe", "resolucion", "factura", "historia_laboral", "soporte", "otro"];

export default function DocumentsPage() {
  const client = useQueryClient();
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("contrato");
  const [archiveId, setArchiveId] = useState("");
  const [expedientId, setExpedientId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folioStart, setFolioStart] = useState("");
  const [folioEnd, setFolioEnd] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const expedients = useQuery({ queryKey: ["expedients", archiveId], queryFn: async () => (await api.get<ExpedientItem[]>(`/archives/expedients${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const folders = useQuery({ queryKey: ["folders", expedientId], queryFn: async () => (await api.get<FolderItem[]>(`/archives/folders${expedientId ? `?expedient_id=${expedientId}` : ""}`)).data });
  const documents = useQuery({ queryKey: ["documents", archiveId, expedientId, folderId], queryFn: async () => (await api.get<DocumentItem[]>(`/documents?limit=100${archiveId ? `&archive_id=${archiveId}` : ""}${expedientId ? `&expedient_id=${expedientId}` : ""}${folderId ? `&folder_id=${folderId}` : ""}`)).data });
  const files = useQuery({ queryKey: ["document-files", selectedDocument], enabled: Boolean(selectedDocument), queryFn: async () => (await api.get<FileItem[]>(`/documents/${selectedDocument}/files`)).data });
  const allowedFolders = useMemo(() => folders.data ?? [], [folders.data]);
  const create = useMutation({
    mutationFn: async () => api.post("/documents", { document_name: documentName, document_type: documentType, archive_id: Number(archiveId), expedient_id: Number(expedientId), folder_id: Number(folderId), folio_start: folioStart ? Number(folioStart) : null, folio_end: folioEnd ? Number(folioEnd) : null, metadata: {}, location_id: 1 }),
    onSuccess: () => { setDocumentName(""); setFolioStart(""); setFolioEnd(""); client.invalidateQueries({ queryKey: ["documents"] }); }
  });
  const upload = useMutation({
    mutationFn: async () => { if (!file || !selectedDocument) return; const form = new FormData(); form.append("file", file); return api.post(`/documents/${selectedDocument}/files`, form); },
    onSuccess: () => { setFile(null); client.invalidateQueries({ queryKey: ["documents"] }); client.invalidateQueries({ queryKey: ["document-files"] }); }
  });
  function submitDocument(event: FormEvent) { event.preventDefault(); create.mutate(); }
  function submitFile(event: FormEvent) { event.preventDefault(); upload.mutate(); }
  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Documentos</span></div>
      <PageTitle title="Documentos" description="Radicacion documental con archivo, expediente, carpeta, folios y repositorio digital." action={<button className="ghost" onClick={() => documents.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Nuevo documento</h2>
          <form className="form-grid" onSubmit={submitDocument}>
            <label>Archivo<select value={archiveId} onChange={(event) => { setArchiveId(event.target.value); setExpedientId(""); setFolderId(""); }} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
            <label>Expediente<select value={expedientId} onChange={(event) => { setExpedientId(event.target.value); setFolderId(""); }} required><option value="">Seleccionar</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label>
            <label>Carpeta<select value={folderId} onChange={(event) => setFolderId(event.target.value)} required><option value="">Seleccionar</option>{allowedFolders.map((item) => <option key={item.idFolder} value={item.idFolder}>{item.folder_code} - {item.folder_name}</option>)}</select></label>
            <label>Nombre<input value={documentName} onChange={(event) => setDocumentName(event.target.value)} required /></label>
            <label>Tipo documental<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{documentTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <div className="form-row-2"><label>Folio inicial<input type="number" min="1" value={folioStart} onChange={(event) => setFolioStart(event.target.value)} /></label><label>Folio final<input type="number" min="1" value={folioEnd} onChange={(event) => setFolioEnd(event.target.value)} /></label></div>
            <button disabled={create.isPending}><Plus size={17} /> Crear documento</button>
          </form>
          <h2>Subir archivo digital</h2>
          <form className="form-grid" onSubmit={submitFile}>
            <label>Documento<select value={selectedDocument ?? ""} onChange={(event) => setSelectedDocument(Number(event.target.value))} required><option value="">Seleccionar</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <label>Archivo<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.tif,.tiff,.zip,.mp4,.txt,.xml" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
            <button disabled={upload.isPending}><Upload size={17} /> Cargar al repositorio</button>
          </form>
          {files.data?.length ? <div className="grid">{files.data.map((item) => <a className="status" href={item.url} target="_blank" key={item.idFile}><Download size={14} /> {item.original_name}</a>)}</div> : null}
        </section>
        <section className="card table-card">
          <table><thead><tr><th>Documento</th><th>Tipo</th><th>Archivo</th><th>Expediente</th><th>Carpeta</th><th>Folios</th><th>Archivos</th></tr></thead><tbody>{documents.data?.map((item) => <tr key={item.idDocument} onClick={() => setSelectedDocument(item.idDocument)}><td>{item.document_name}<br /><span className="muted">v{item.version} - {item.status}</span></td><td>{item.document_type}</td><td>{item.archive_id}</td><td>{item.expedient_id}</td><td>{item.folder_id}</td><td>{item.folio_start && item.folio_end ? `${item.folio_start}-${item.folio_end}` : "Sin foliar"}</td><td>{item.files_count}</td></tr>)}</tbody></table>
        </section>
      </div>
    </>
  );
}
