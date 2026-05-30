"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Download, FileText, Plus, RefreshCcw, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, DetailDrawer, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type ArchiveItem = { idArchive: number; archive_name: string };
type SeriesItem = { idSeries: number; code: string; name: string };
type SubseriesItem = { idSubseries: number; ps610IdSeries: number; name: string; retention_years: number };
type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string; ps930IdArchive: number; ps610IdSeries?: number; ps612IdSubseries?: number };
type FolderItem = { idFolder: number; folder_code: string; folder_name: string; ps950IdExpedient: number };
type DocumentType = { idDocumentType: number; type_code: string; name: string; required_metadata: string[]; optional_metadata: string[]; status: string };
type DocumentItem = { idDocument: number; document_name: string; document_type: string; version: number; status: string; files_count: number; archive_id?: number; expedient_id?: number; folder_id?: number; subseries_id?: number; folio_start?: number; folio_end?: number; metadata: Record<string, unknown> };
type FileItem = { idFile: number; original_name: string; content_type: string; checksum: string; size_bytes: number; url: string; version?: number; trace_id?: string };
type VersionInfo = { current_version: number; history: Array<{ action: string; user: string; date: string; details: unknown }>; files: Array<{ idFile: number; version: number; original_name: string; checksum: string; uploaded_at: string; trace_id?: string }> };

const steps = ["Archivo", "Serie", "Subserie", "Expediente", "Carpeta", "Tipo", "Metadatos", "Foliacion", "Upload", "Confirmacion"];

export default function DocumentsPage() {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [archiveId, setArchiveId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [subseriesId, setSubseriesId] = useState("");
  const [expedientId, setExpedientId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folioStart, setFolioStart] = useState("");
  const [folioEnd, setFolioEnd] = useState("");
  const [metadataText, setMetadataText] = useState("{}");
  const [createdDocumentId, setCreatedDocumentId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const series = useQuery({ queryKey: ["trd-series"], queryFn: async () => (await api.get<SeriesItem[]>("/trd/series")).data });
  const subseries = useQuery({ queryKey: ["trd-subseries"], queryFn: async () => (await api.get<SubseriesItem[]>("/trd/subseries")).data });
  const documentTypes = useQuery({ queryKey: ["document-types"], queryFn: async () => (await api.get<DocumentType[]>("/documents/types")).data });
  const expedients = useQuery({ queryKey: ["expedients", archiveId], queryFn: async () => (await api.get<ExpedientItem[]>(`/archives/expedients${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const folders = useQuery({ queryKey: ["folders", expedientId], queryFn: async () => (await api.get<FolderItem[]>(`/archives/folders${expedientId ? `?expedient_id=${expedientId}` : ""}`)).data });
  const documents = useQuery({ queryKey: ["documents", archiveId, expedientId, folderId], queryFn: async () => (await api.get<DocumentItem[]>(`/documents?limit=100${archiveId ? `&archive_id=${archiveId}` : ""}${expedientId ? `&expedient_id=${expedientId}` : ""}${folderId ? `&folder_id=${folderId}` : ""}`)).data });
  const files = useQuery({ queryKey: ["document-files", selectedDocument?.idDocument ?? createdDocumentId], enabled: Boolean(selectedDocument?.idDocument ?? createdDocumentId), queryFn: async () => (await api.get<FileItem[]>(`/documents/${selectedDocument?.idDocument ?? createdDocumentId}/files`)).data });
  const versions = useQuery({ queryKey: ["document-versions", selectedDocument?.idDocument], enabled: Boolean(selectedDocument), queryFn: async () => (await api.get<VersionInfo>(`/documents/${selectedDocument?.idDocument}/versions`)).data });

  const filteredSubseries = useMemo(() => (subseries.data ?? []).filter((item) => !seriesId || item.ps610IdSeries === Number(seriesId)), [seriesId, subseries.data]);
  const allowedFolders = useMemo(() => folders.data ?? [], [folders.data]);
  const selectedType = documentTypes.data?.find((item) => item.type_code === documentType);
  const metadataKeys = [...(selectedType?.required_metadata ?? []), ...(selectedType?.optional_metadata ?? [])];
  const canContinue = [
    Boolean(archiveId),
    Boolean(seriesId),
    Boolean(subseriesId),
    Boolean(expedientId),
    Boolean(folderId),
    Boolean(documentType && documentName.trim().length >= 3),
    true,
    true,
    true,
    true
  ][step];

  function parsedMetadata() {
    try {
      return JSON.parse(metadataText || "{}");
    } catch {
      throw new Error("Los metadatos deben ser JSON valido.");
    }
  }

  const create = useMutation({
    mutationFn: async () => api.post<DocumentItem>("/documents", {
      document_name: documentName,
      document_type: documentType,
      archive_id: Number(archiveId),
      expedient_id: Number(expedientId),
      folder_id: Number(folderId),
      subseries_id: Number(subseriesId),
      folio_start: folioStart ? Number(folioStart) : null,
      folio_end: folioEnd ? Number(folioEnd) : null,
      metadata: parsedMetadata(),
      location_id: 1
    }),
    onSuccess: (response) => {
      setCreatedDocumentId(response.data.idDocument);
      setMessage("Registro documental creado. Puedes cargar archivo digital o dejarlo como documento fisico.");
      client.invalidateQueries({ queryKey: ["documents"] });
      setStep(8);
    },
    onError: (error) => {
      const apiError = error as { response?: { data?: { detail?: string } } };
      setMessage(apiError.response?.data?.detail ?? "No fue posible crear el documento. Revisa contexto documental y metadatos.");
    }
  });
  const upload = useMutation({
    mutationFn: async () => {
      const target = selectedDocument?.idDocument ?? createdDocumentId;
      if (!file || !target) return;
      const form = new FormData();
      form.append("file", file);
      return api.post(`/documents/${target}/files`, form);
    },
    onSuccess: () => {
      setFile(null);
      setMessage("Archivo digital cargado, versionado y disponible por URL firmada.");
      client.invalidateQueries({ queryKey: ["documents"] });
      client.invalidateQueries({ queryKey: ["document-files"] });
      setStep(9);
    },
    onError: () => setMessage("No fue posible cargar el archivo. Revisa MIME, tamano y permisos.")
  });

  function submitDocument(event: FormEvent) {
    event.preventDefault();
    try {
      create.mutate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Metadatos invalidos.");
    }
  }
  function submitFile(event: FormEvent) { event.preventDefault(); upload.mutate(); }
  function nextStep() {
    if (!canContinue) {
      setMessage("Completa la decision documental de este paso para continuar.");
      return;
    }
    setMessage("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }
  function resetWizard() {
    setStep(0);
    setDocumentName("");
    setDocumentType("");
    setSeriesId("");
    setSubseriesId("");
    setExpedientId("");
    setFolderId("");
    setFolioStart("");
    setFolioEnd("");
    setMetadataText("{}");
    setCreatedDocumentId(null);
  }

  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Documentos</span></div>
      <PageTitle title="Documentos" description="Flujo SGDEA: archivo, TRD, expediente, carpeta, metadatos, foliacion y repositorio digital." action={<button className="ghost" onClick={() => documents.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("Los") ? "error" : "status"}>{message}</span></div> : null}

      <div className="document-workspace">
        <section className="card document-wizard">
          <div className="wizard-steps document-steps">{steps.map((item, index) => <button className={`wizard-step ${step === index ? "active" : ""} ${index < step ? "done" : ""}`} type="button" key={item} onClick={() => setStep(index)}><span>{index < step ? <CheckCircle2 size={16} /> : index + 1}</span><strong>{item}</strong></button>)}</div>
          <div className="wizard-body">
            <h2>{steps[step]}</h2>
            {step === 0 ? <label>Archivo<select value={archiveId} onChange={(event) => { setArchiveId(event.target.value); setExpedientId(""); setFolderId(""); }} required><option value="">Seleccionar archivo autorizado</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label> : null}
            {step === 1 ? <label>Serie TRD<select value={seriesId} onChange={(event) => { setSeriesId(event.target.value); setSubseriesId(""); }} required><option value="">Seleccionar serie</option>{series.data?.map((item) => <option key={item.idSeries} value={item.idSeries}>{item.code} - {item.name}</option>)}</select></label> : null}
            {step === 2 ? <label>Subserie TRD<select value={subseriesId} onChange={(event) => setSubseriesId(event.target.value)} required><option value="">Seleccionar subserie</option>{filteredSubseries.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name} / {item.retention_years} anos</option>)}</select></label> : null}
            {step === 3 ? <label>Expediente<select value={expedientId} onChange={(event) => { setExpedientId(event.target.value); setFolderId(""); }} required><option value="">Seleccionar expediente</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label> : null}
            {step === 4 ? <label>Carpeta<select value={folderId} onChange={(event) => setFolderId(event.target.value)} required><option value="">Seleccionar carpeta</option>{allowedFolders.map((item) => <option key={item.idFolder} value={item.idFolder}>{item.folder_code} - {item.folder_name}</option>)}</select></label> : null}
            {step === 5 ? <div className="form-grid"><label>Nombre documental<input value={documentName} onChange={(event) => setDocumentName(event.target.value)} required /></label><label>Tipo documental<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} required><option value="">Seleccionar tipologia</option>{documentTypes.data?.map((item) => <option key={item.idDocumentType} value={item.type_code}>{item.name}</option>)}</select></label></div> : null}
            {step === 6 ? <div className="form-grid"><p className="muted">Metadatos esperados: {metadataKeys.length ? metadataKeys.join(", ") : "sin plantilla obligatoria"}</p><label>Metadatos JSON<textarea value={metadataText} onChange={(event) => setMetadataText(event.target.value)} rows={7} /></label></div> : null}
            {step === 7 ? <div className="form-row-2"><label>Folio inicial<input type="number" min="1" value={folioStart} onChange={(event) => setFolioStart(event.target.value)} /></label><label>Folio final<input type="number" min="1" value={folioEnd} onChange={(event) => setFolioEnd(event.target.value)} /></label></div> : null}
            {step === 8 ? <div className="card compact"><h3>Registro documental</h3><p className="muted">Crea el registro si aun no existe. Luego puedes cargar archivo digital o conservarlo como referencia fisica.</p>{createdDocumentId ? <StatusBadge value={`Documento #${createdDocumentId}`} tone="success" /> : <button type="button" disabled={create.isPending} onClick={(event) => submitDocument(event as unknown as FormEvent)}><Plus size={17} /> Crear registro documental</button>}<form className="form-grid" onSubmit={submitFile}><label>Archivo digital opcional<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.tif,.tiff,.zip,.mp4,.txt,.xml" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><button disabled={upload.isPending || !file || !createdDocumentId}><Upload size={17} /> Cargar al repositorio</button></form></div> : null}
            {step === 9 ? <div className="grid"><MetricCard label="Documento" value={createdDocumentId ?? selectedDocument?.idDocument ?? "-"} tone="success" /><MetricCard label="Version" value={selectedDocument?.version ?? "actualizada"} /><MetricCard label="Archivos digitales" value={files.data?.length ?? 0} tone={(files.data?.length ?? 0) ? "success" : "warning"} /><button className="ghost" type="button" onClick={resetWizard}>Nuevo flujo documental</button></div> : null}
            {step < 8 ? <div className="wizard-actions"><button className="ghost" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Anterior</button><button type="button" onClick={nextStep}>Continuar</button></div> : null}
          </div>
        </section>

        <section className="card table-card">
          {documents.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!documents.isLoading && !documents.data?.length ? <EmptyState icon={<FileText size={20} />} title="Sin documentos" description="Selecciona contexto o crea el primer registro documental del expediente." /> : null}
          <DataTable><table><thead><tr><th>Documento</th><th>Tipo</th><th>Contexto</th><th>Folios</th><th>Version</th><th>Archivos</th></tr></thead><tbody>{documents.data?.map((item) => <tr key={item.idDocument} onClick={() => setSelectedDocument(item)}><td><strong>{item.document_name}</strong><br /><span className="muted">{item.status}</span></td><td>{item.document_type}</td><td>EXP {item.expedient_id} / CAR {item.folder_id}</td><td>{item.folio_start && item.folio_end ? `${item.folio_start}-${item.folio_end}` : "Fisico/sin foliar"}</td><td>v{item.version}</td><td>{item.files_count}</td></tr>)}</tbody></table></DataTable>
        </section>
      </div>

      <DetailDrawer open={Boolean(selectedDocument)} onClose={() => setSelectedDocument(null)} title={selectedDocument?.document_name ?? "Documento"} subtitle={selectedDocument ? `${selectedDocument.document_type} / v${selectedDocument.version}` : undefined}>
        {selectedDocument ? <div className="grid">
          <div className="module-grid"><MetricCard label="Archivo" value={selectedDocument.archive_id ?? "-"} /><MetricCard label="Expediente" value={selectedDocument.expedient_id ?? "-"} /><MetricCard label="Carpeta" value={selectedDocument.folder_id ?? "-"} /><MetricCard label="Archivos" value={selectedDocument.files_count} /></div>
          <section className="card compact"><h3>Metadatos</h3><pre>{JSON.stringify(selectedDocument.metadata ?? {}, null, 2)}</pre></section>
          <section className="card compact"><h3>Archivos digitales</h3>{files.data?.map((item) => <a className="status" href={item.url} target="_blank" key={item.idFile}><Download size={14} /> v{item.version} {item.original_name}</a>)}</section>
          <section className="card compact"><h3>Historial de versiones</h3>{versions.isLoading ? <LoadingSkeleton rows={3} /> : versions.data?.history.map((item, index) => <p className="muted" key={`${item.action}-${index}`}>{item.date?.slice(0, 16)} / {item.action} / {item.user}</p>)}</section>
        </div> : null}
      </DetailDrawer>
    </>
  );
}
