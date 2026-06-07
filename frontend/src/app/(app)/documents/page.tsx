"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileText, Info, Plus, RefreshCcw, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, DetailDrawer, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type ArchiveItem = { idArchive: number; archive_name: string };
type DependencyItem = { idDependency: number; code: string; name: string; status: string };
type SeriesItem = { idSeries: number; dependency_id?: number; code: string; name: string };
type SubseriesItem = { idSubseries: number; ps610IdSeries: number; name: string; retention_years: number };
type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string; ps930IdArchive: number };
type FolderItem = { idFolder: number; folder_code: string; folder_name: string; ps950IdExpedient: number };
type MetadataField = { key: string; label: string; required: boolean; type?: string };
type DocumentType = { idDocumentType: number; type_code: string; name: string; required_metadata: string[]; optional_metadata: string[]; metadata_schema?: MetadataField[]; sector?: string; series_id?: number; subseries_id?: number; icon?: string; color?: string; template_sector?: string; status: string };
type DocumentItem = { idDocument: number; document_name: string; document_type: string; version: number; status: string; files_count: number; archive_id?: number; expedient_id?: number; folder_id?: number; subseries_id?: number; folio_start?: number; folio_end?: number; metadata: Record<string, unknown> };
type FileItem = { idFile: number; original_name: string; content_type: string; checksum: string; size_bytes: number; url: string; version?: number; trace_id?: string };
type VersionInfo = { current_version: number; history: Array<{ action: string; user: string; date: string; details: unknown }>; files: Array<{ idFile: number; version: number; original_name: string; checksum: string; uploaded_at: string; trace_id?: string }> };

const steps = ["Archivo", "Dependencia", "Serie", "Subserie", "Expediente", "Carpeta", "Documento", "Folios", "Archivo digital", "Confirmacion"];

function metadataLabel(value: string) {
  return value.replaceAll("_", " ");
}

function asNumber(value: string) {
  return value ? Number(value) : null;
}

export default function DocumentsPage() {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [archiveId, setArchiveId] = useState("");
  const [dependencyId, setDependencyId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [subseriesId, setSubseriesId] = useState("");
  const [expedientId, setExpedientId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folioStart, setFolioStart] = useState("");
  const [folioCount, setFolioCount] = useState("");
  const [metadataValues, setMetadataValues] = useState<Record<string, string>>({});
  const [createdDocumentId, setCreatedDocumentId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const dependencies = useQuery({ queryKey: ["trd-dependencies"], queryFn: async () => (await api.get<DependencyItem[]>("/trd/dependencies")).data });
  const series = useQuery({ queryKey: ["trd-series"], queryFn: async () => (await api.get<SeriesItem[]>("/trd/series")).data });
  const subseries = useQuery({ queryKey: ["trd-subseries"], queryFn: async () => (await api.get<SubseriesItem[]>("/trd/subseries")).data });
  const documentTypes = useQuery({ queryKey: ["document-types", subseriesId], queryFn: async () => (await api.get<DocumentType[]>(`/documents/types${subseriesId ? `?subseries_id=${subseriesId}` : ""}`)).data });
  const expedients = useQuery({ queryKey: ["expedients", archiveId], queryFn: async () => (await api.get<ExpedientItem[]>(`/archives/expedients${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const folders = useQuery({ queryKey: ["folders", expedientId], queryFn: async () => (await api.get<FolderItem[]>(`/archives/folders${expedientId ? `?expedient_id=${expedientId}` : ""}`)).data });
  const documents = useQuery({ queryKey: ["documents", archiveId, expedientId, folderId], queryFn: async () => (await api.get<DocumentItem[]>(`/documents?limit=100${archiveId ? `&archive_id=${archiveId}` : ""}${expedientId ? `&expedient_id=${expedientId}` : ""}${folderId ? `&folder_id=${folderId}` : ""}`)).data });
  const files = useQuery({ queryKey: ["document-files", selectedDocument?.idDocument ?? createdDocumentId], enabled: Boolean(selectedDocument?.idDocument ?? createdDocumentId), queryFn: async () => (await api.get<FileItem[]>(`/documents/${selectedDocument?.idDocument ?? createdDocumentId}/files`)).data });
  const versions = useQuery({ queryKey: ["document-versions", selectedDocument?.idDocument], enabled: Boolean(selectedDocument), queryFn: async () => (await api.get<VersionInfo>(`/documents/${selectedDocument?.idDocument}/versions`)).data });

  const filteredSeries = useMemo(() => (series.data ?? []).filter((item) => !dependencyId || item.dependency_id === Number(dependencyId)), [dependencyId, series.data]);
  const filteredSubseries = useMemo(() => (subseries.data ?? []).filter((item) => !seriesId || item.ps610IdSeries === Number(seriesId)), [seriesId, subseries.data]);
  const selectedType = useMemo(() => documentTypes.data?.find((item) => item.type_code === documentType), [documentType, documentTypes.data]);
  const requiredMetadata = useMemo(() => selectedType?.required_metadata ?? [], [selectedType]);
  const optionalMetadata = useMemo(() => selectedType?.optional_metadata ?? [], [selectedType]);
  const metadataFields = useMemo<MetadataField[]>(() => {
    if (selectedType?.metadata_schema?.length) return selectedType.metadata_schema;
    return [...requiredMetadata.map((key) => ({ key, label: metadataLabel(key), required: true, type: "text" })), ...optionalMetadata.map((key) => ({ key, label: metadataLabel(key), required: false, type: "text" }))];
  }, [optionalMetadata, requiredMetadata, selectedType]);
  const metadataKeys = useMemo(() => metadataFields.map((item) => item.key), [metadataFields]);
  const folioEnd = useMemo(() => {
    const start = Number(folioStart);
    const count = Number(folioCount);
    return start > 0 && count > 0 ? start + count - 1 : null;
  }, [folioCount, folioStart]);

  const contextItems = [
    { label: "Archivo", value: archives.data?.find((item) => String(item.idArchive) === archiveId)?.archive_name },
    { label: "Dependencia", value: dependencies.data?.find((item) => String(item.idDependency) === dependencyId)?.name },
    { label: "Serie", value: filteredSeries.find((item) => String(item.idSeries) === seriesId)?.name },
    { label: "Subserie", value: filteredSubseries.find((item) => String(item.idSubseries) === subseriesId)?.name },
    { label: "Expediente", value: expedients.data?.find((item) => String(item.idExpedient) === expedientId)?.expedient_code },
    { label: "Carpeta", value: folders.data?.find((item) => String(item.idFolder) === folderId)?.folder_code },
    { label: "Tipo", value: selectedType?.name }
  ];

  const stepErrors = (() => {
    const errors: string[][] = [[], [], [], [], [], [], [], [], [], []];
    if (!archiveId) errors[0].push("Selecciona el archivo autorizado donde vive el documento.");
    if (!dependencyId) errors[1].push("Selecciona la dependencia productora documental.");
    if (!seriesId) errors[2].push("Selecciona la serie TRD.");
    if (!subseriesId) errors[3].push("Selecciona la subserie TRD.");
    if (!expedientId) errors[4].push("Selecciona el expediente.");
    if (!folderId) errors[5].push("Selecciona la carpeta del expediente.");
    if (documentName.trim().length < 3) errors[6].push("Escribe un nombre documental claro.");
    if (!documentType) errors[6].push("Selecciona una tipologia documental.");
    for (const key of requiredMetadata) {
      if (!metadataValues[key]?.trim()) errors[6].push(`Completa el metadato obligatorio: ${metadataLabel(key)}.`);
    }
    if ((folioStart && !folioCount) || (!folioStart && folioCount)) errors[7].push("Para foliar, diligencia folio inicial y cantidad de folios.");
    if (folioStart && Number(folioStart) < 1) errors[7].push("El folio inicial debe ser mayor a cero.");
    if (folioCount && Number(folioCount) < 1) errors[7].push("La cantidad de folios debe ser mayor a cero.");
    return errors;
  })();

  const canContinue = stepErrors[step].length === 0;
  const metadata = useMemo(() => Object.fromEntries(Object.entries(metadataValues).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])), [metadataValues]);

  const create = useMutation({
    mutationFn: async () => api.post<DocumentItem>("/documents", {
      document_name: documentName.trim(),
      document_type: documentType,
      archive_id: Number(archiveId),
      expedient_id: Number(expedientId),
      folder_id: Number(folderId),
      subseries_id: Number(subseriesId),
      folio_start: asNumber(folioStart),
      folio_end: folioEnd,
      metadata,
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
      setMessage(apiError.response?.data?.detail ?? "No fue posible crear el documento. Revisa contexto, folios o metadatos.");
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
    onError: () => setMessage("No fue posible cargar el archivo. Revisa formato, tamano y permisos.")
  });

  function submitDocument(event: FormEvent) {
    event.preventDefault();
    if (stepErrors.flat().length) {
      const firstInvalid = stepErrors.findIndex((items) => items.length);
      setStep(Math.max(firstInvalid, 0));
      setMessage(stepErrors[firstInvalid][0]);
      return;
    }
    create.mutate();
  }

  function submitFile(event: FormEvent) {
    event.preventDefault();
    upload.mutate();
  }

  function nextStep() {
    if (!canContinue) {
      setMessage(stepErrors[step][0]);
      return;
    }
    setMessage("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function resetWizard() {
    setStep(0);
    setDocumentName("");
    setDocumentType("");
    setArchiveId("");
    setDependencyId("");
    setSeriesId("");
    setSubseriesId("");
    setExpedientId("");
    setFolderId("");
    setFolioStart("");
    setFolioCount("");
    setMetadataValues({});
    setFile(null);
    setCreatedDocumentId(null);
  }

  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Documentos</span></div>
      <PageTitle title="Documentos" description="Crea documentos dentro de archivo, TRD, expediente y carpeta. El archivo digital es opcional." action={<button className="ghost" onClick={() => documents.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("Selecciona") || message.startsWith("Completa") ? "error" : "status"}>{message}</span></div> : null}

      <div className="document-workspace">
        <section className="card document-wizard">
          <div className="wizard-steps document-steps">
            {steps.map((item, index) => (
              <button className={`wizard-step ${step === index ? "active" : ""} ${index < step ? "done" : ""}`} type="button" key={item} onClick={() => {
                const firstInvalid = stepErrors.findIndex((items, stepIndex) => stepIndex < index && items.length);
                if (firstInvalid >= 0) {
                  setStep(firstInvalid);
                  setMessage(stepErrors[firstInvalid][0]);
                  return;
                }
                setStep(index);
              }}>
                <span>{index < step ? <CheckCircle2 size={16} /> : index + 1}</span><strong>{item}</strong>
              </button>
            ))}
          </div>

          <div className="wizard-body">
            <header className="document-step-header">
              <h2>{steps[step]}</h2>
              {stepErrors[step].length ? <span className="badge badge-warning"><AlertCircle size={14} /> Falta informacion</span> : <span className="badge badge-success"><CheckCircle2 size={14} /> Listo</span>}
            </header>
            {stepErrors[step].length ? <div className="validation-panel">{stepErrors[step].map((item) => <span key={item}>{item}</span>)}</div> : null}

            {step === 0 ? <label>Archivo<select value={archiveId} onChange={(event) => { setArchiveId(event.target.value); setExpedientId(""); setFolderId(""); }} required><option value="">Seleccionar archivo autorizado</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label> : null}
            {step === 1 ? <label>Dependencia<select value={dependencyId} onChange={(event) => { setDependencyId(event.target.value); setSeriesId(""); setSubseriesId(""); }} required><option value="">Seleccionar dependencia productora</option>{dependencies.data?.map((item) => <option key={item.idDependency} value={item.idDependency}>{item.code} - {item.name}</option>)}</select></label> : null}
            {step === 2 ? <label>Serie TRD<select value={seriesId} onChange={(event) => { setSeriesId(event.target.value); setSubseriesId(""); }} required><option value="">Seleccionar serie</option>{filteredSeries.map((item) => <option key={item.idSeries} value={item.idSeries}>{item.code} - {item.name}</option>)}</select></label> : null}
            {step === 3 ? <label>Subserie TRD<select value={subseriesId} onChange={(event) => setSubseriesId(event.target.value)} required><option value="">Seleccionar subserie</option>{filteredSubseries.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name} / {item.retention_years} anos</option>)}</select></label> : null}
            {step === 4 ? <label>Expediente<select value={expedientId} onChange={(event) => { setExpedientId(event.target.value); setFolderId(""); }} required><option value="">Seleccionar expediente</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label> : null}
            {step === 5 ? <label>Carpeta<select value={folderId} onChange={(event) => setFolderId(event.target.value)} required><option value="">Seleccionar carpeta</option>{folders.data?.map((item) => <option key={item.idFolder} value={item.idFolder}>{item.folder_code} - {item.folder_name}</option>)}</select></label> : null}
            {step === 6 ? (
              <div className="form-grid">
                <div className="form-row-2">
                  <label>Nombre documental<input value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="Ej: Contrato firmado Nicolas Ramirez" required /></label>
                  <label>Tipo documental<select value={documentType} onChange={(event) => { setDocumentType(event.target.value); setMetadataValues({}); }} required><option value="">Seleccionar tipologia</option>{documentTypes.data?.map((item) => <option key={item.idDocumentType} value={item.type_code}>{item.name}{item.sector ? ` / ${item.sector}` : ""}</option>)}</select></label>
                </div>
                {selectedType ? <div className="document-type-chip" style={{ borderColor: selectedType.color ?? undefined }}>
                  <span className="status" style={{ color: selectedType.color ?? undefined }}>{selectedType.sector ?? "general"}</span>
                  <strong>{selectedType.name}</strong>
                  <p className="muted">AMBAR generara los campos propios de esta tipologia. Obligatorios: {requiredMetadata.length || "ninguno"}.</p>
                </div> : null}
                <div className="context-help">
                  <Info size={18} />
                  <p><strong>Metadatos</strong> son datos extra para buscar y controlar documentos, por ejemplo numero de contrato, tercero o fecha. No son obligatorios salvo que la tipologia lo pida.</p>
                </div>
                {metadataKeys.length ? (
                  <div className="metadata-grid">
                    {metadataFields.map((field) => (
                      <label key={field.key}>{field.label}{field.required ? " *" : ""}
                        <input type={field.type === "date" || field.key.includes("fecha") ? "date" : field.type === "number" || field.key.includes("valor") || field.key.includes("salario") ? "number" : "text"} value={metadataValues[field.key] ?? ""} onChange={(event) => setMetadataValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                      </label>
                    ))}
                  </div>
                ) : <p className="muted">Esta tipologia no exige metadatos. Continuemos sin llenar datos tecnicos innecesarios.</p>}
              </div>
            ) : null}
            {step === 7 ? (
              <div className="form-grid">
                <div className="context-help">
                  <Info size={18} />
                  <p><strong>Folios</strong> son las hojas numeradas del documento fisico. Si el documento es solo digital o aun no esta foliado, puedes dejarlo vacio y foliar despues.</p>
                </div>
                <div className="form-row-2">
                  <label>Folio inicial<input type="number" min="1" value={folioStart} onChange={(event) => setFolioStart(event.target.value)} placeholder="Ej: 1" /></label>
                  <label>Cantidad de folios<input type="number" min="1" value={folioCount} onChange={(event) => setFolioCount(event.target.value)} placeholder="Ej: 5" /></label>
                </div>
                <div className="profile-summary">
                  <strong>{folioEnd ? `Resultado: folios ${folioStart} al ${folioEnd}` : "Sin foliacion por ahora"}</strong>
                  <p>{folioEnd ? "El sistema guardara folio inicial, folio final y total." : "El documento quedara como fisico/sin foliar y podra corregirse desde Foliacion."}</p>
                </div>
              </div>
            ) : null}
            {step === 8 ? (
              <div className="card compact">
                <h3>Registro documental</h3>
                <p className="muted">Primero crea el registro. Despues puedes cargar archivo digital o dejarlo como documento fisico.</p>
                {createdDocumentId ? <StatusBadge value={`Documento #${createdDocumentId}`} tone="success" /> : <button type="button" disabled={create.isPending} onClick={submitDocument}><Plus size={17} /> Crear registro documental</button>}
                <form className="form-grid" onSubmit={submitFile}>
                  <label>Archivo digital opcional<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.tif,.tiff,.zip,.mp4,.txt,.xml" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
                  <button disabled={upload.isPending || !file || !createdDocumentId}><Upload size={17} /> Cargar al repositorio</button>
                </form>
              </div>
            ) : null}
            {step === 9 ? <div className="grid"><MetricCard label="Documento" value={createdDocumentId ?? selectedDocument?.idDocument ?? "-"} tone="success" /><MetricCard label="Version" value={selectedDocument?.version ?? "actualizada"} /><MetricCard label="Archivos digitales" value={files.data?.length ?? 0} tone={(files.data?.length ?? 0) ? "success" : "warning"} /><button className="ghost" type="button" onClick={resetWizard}>Nuevo flujo documental</button></div> : null}
            {step < 8 ? <div className="wizard-actions"><button className="ghost" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Anterior</button><button type="button" onClick={nextStep}>Continuar</button></div> : null}
          </div>
        </section>

        <section className="card table-card document-side-panel">
          <div className="document-context-card">
            <h3>Contexto de creacion</h3>
            <div className="checklist">
              {contextItems.map((item) => <span className={item.value ? "badge badge-success" : "badge badge-neutral"} key={item.label}>{item.label}: {item.value ?? "pendiente"}</span>)}
            </div>
          </div>
          {documents.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!documents.isLoading && !documents.data?.length ? <EmptyState icon={<FileText size={20} />} title="Sin documentos" description="Selecciona contexto o crea el primer registro documental del expediente." /> : null}
          <DataTable><table><thead><tr><th>Documento</th><th>Tipo</th><th>Contexto</th><th>Folios</th><th>Version</th><th>Archivos</th></tr></thead><tbody>{documents.data?.map((item) => <tr key={item.idDocument} onClick={() => setSelectedDocument(item)}><td><strong>{item.document_name}</strong><br /><span className="muted">{item.status}</span></td><td>{item.document_type}</td><td>EXP {item.expedient_id} / CAR {item.folder_id}</td><td>{item.folio_start && item.folio_end ? `${item.folio_start}-${item.folio_end}` : "Sin foliar"}</td><td>v{item.version}</td><td>{item.files_count}</td></tr>)}</tbody></table></DataTable>
        </section>
      </div>

      <DetailDrawer open={Boolean(selectedDocument)} onClose={() => setSelectedDocument(null)} title={selectedDocument?.document_name ?? "Documento"} subtitle={selectedDocument ? `${selectedDocument.document_type} / v${selectedDocument.version}` : undefined}>
        {selectedDocument ? <div className="grid">
          <div className="module-grid"><MetricCard label="Archivo" value={selectedDocument.archive_id ?? "-"} /><MetricCard label="Expediente" value={selectedDocument.expedient_id ?? "-"} /><MetricCard label="Carpeta" value={selectedDocument.folder_id ?? "-"} /><MetricCard label="Archivos" value={selectedDocument.files_count} /></div>
          <section className="card compact"><h3>Metadatos</h3>{Object.keys(selectedDocument.metadata ?? {}).length ? <pre>{JSON.stringify(selectedDocument.metadata ?? {}, null, 2)}</pre> : <p className="muted">Este documento no tiene metadatos adicionales.</p>}</section>
          <section className="card compact"><h3>Archivos digitales</h3>{files.data?.map((item) => <a className="status" href={item.url} target="_blank" key={item.idFile}><Download size={14} /> v{item.version} {item.original_name}</a>)}</section>
          <section className="card compact"><h3>Historial de versiones</h3>{versions.isLoading ? <LoadingSkeleton rows={3} /> : versions.data?.history.map((item, index) => <p className="muted" key={`${item.action}-${index}`}>{item.date?.slice(0, 16)} / {item.action} / {item.user}</p>)}</section>
        </div> : null}
      </DetailDrawer>
    </>
  );
}
