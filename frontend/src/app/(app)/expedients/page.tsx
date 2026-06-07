"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, FilePlus2, FolderKanban, GitBranch, MapPin, Plus, RefreshCcw, Route, Send, ShieldCheck, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type ArchiveItem = { idArchive: number; archive_name: string };
type SeriesItem = { idSeries: number; code: string; name: string };
type SubseriesItem = { idSubseries: number; ps610IdSeries: number; name: string };
type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string; expedient_type: string; status: string; ps930IdArchive: number; document_count: number; folio_count: number; physical_location?: string; digital_location?: string };
type ComplianceItem = { key: string; label: string; status: "complete" | "warning" | "error" | "pending"; message: string; critical: boolean };
type DocumentTypeSummary = { used: Array<{ type_code: string; name: string; count: number; color?: string }>; required: Array<{ type_code: string; name: string; icon?: string; color?: string }>; missing_required: string[]; duplicates: string[]; metadata_incomplete: Array<{ document_id: number; document_name: string; document_type: string; missing_metadata: string[] }> };
type ExpedientInconsistencies = { missing_documents: string[]; missing_required_types: string[]; metadata_incomplete: DocumentTypeSummary["metadata_incomplete"]; duplicate_types: string[]; foliation_duplicates: unknown[]; foliation_gaps: Array<{ from: number; to: number }> };
type Compliance = { status: string; ready_to_close: boolean; checklist: ComplianceItem[]; missing_documents: string[]; document_types?: DocumentTypeSummary; inconsistencies?: ExpedientInconsistencies; foliation: FoliationReport; active_loans: number; pending_transfers: number };
type FoliationReport = { status: string; ranges: Array<{ document_id: number; document_name: string; start: number; end: number; total: number; folder_id: number }>; unfoliated: Array<{ idDocument: number; document_name: string; folder_id: number }>; duplicates: unknown[]; gaps: Array<{ from: number; to: number }>; total_folios: number };
type ExpedientDetail = ExpedientItem & { archive_id: number; archive_name?: string; series?: { code: string; name: string } | null; subseries?: { name: string; retention_years: number } | null; responsible_identification?: string; custodian?: string; folders_count: number; documents_count: number; folios_count: number; compliance_status: string; ready_to_close: boolean; document_types?: DocumentTypeSummary; inconsistencies?: ExpedientInconsistencies; closure?: { closed_at: string; closed_by: string; observation?: string } | null };
type TreeDocument = { id: number; type: "document"; name: string; document_type: string; folio_start?: number; folio_end?: number; folio_total?: number; support: string; status: string; version: number; has_digital_file: boolean };
type TreeFolder = { id: number; type: "folder"; code: string; name: string; status: string; documents_count: number; folios_count: number; box_id?: number; physical_location?: string; children: TreeDocument[] };
type ExpedientTree = { id: number; code: string; name: string; status: string; children: TreeFolder[] };
type LoanItem = { idLoan: number; entity_type: string; entity_id: number; status: string; requested_by: string; due_at?: string; observations?: string };
type TransferItem = { idBatchItem: number; batch_id: number; batch_code?: string; entity_type: string; entity_id: number; status: string; origin_archive_id?: number; destination_archive_id?: number; rejection_reason?: string; observation?: string };
type KardexItem = { idMovement: number; event_type: string; entity_type: string; entity_id: number; new_status: string; observation?: string; rejection_reason?: string; created_at?: string };
type AuditItem = { idAudit: number; action: string; module: string; entity?: string; entity_id?: string; created_at?: string };
type LocationSummary = { physical_location?: string; digital_location?: string; folders: Array<{ folder_id: number; folder_code: string; folder_name: string; physical_location?: string; box_code?: string; shelf_code?: string; shelf_location?: string }> };

const tabs = ["Resumen", "Arbol", "Documentos", "Tipologias", "Inconsistencias", "Foliacion", "Ubicacion", "Transferencias", "Prestamos", "FUID", "Kardex", "Auditoria", "Cumplimiento"];

function statusTone(status: string) {
  if (["active", "complete", "ready_to_close", "accepted", "closed"].includes(status)) return "success";
  if (["under_review", "warning", "pending", "pending_review", "partially_received"].includes(status)) return "warning";
  if (["locked", "disposed", "error", "rejected", "overdue", "incomplete"].includes(status)) return "danger";
  if (["transferred", "archived"].includes(status)) return "info";
  return "neutral";
}

function itemIcon(status: string) {
  if (status === "complete") return <CheckCircle2 size={16} />;
  if (status === "error") return <XCircle size={16} />;
  return <AlertTriangle size={16} />;
}

export default function ExpedientsPage() {
  const client = useQueryClient();
  const [archiveId, setArchiveId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("administrativo");
  const [seriesId, setSeriesId] = useState("");
  const [subseriesId, setSubseriesId] = useState("");
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState<ExpedientItem | null>(null);
  const [activeTab, setActiveTab] = useState("Resumen");
  const [selectedNode, setSelectedNode] = useState<TreeFolder | TreeDocument | null>(null);
  const [message, setMessage] = useState("");

  const detailId = detail?.idExpedient;
  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const series = useQuery({ queryKey: ["trd-series"], queryFn: async () => (await api.get<SeriesItem[]>("/trd/series")).data });
  const subseries = useQuery({ queryKey: ["trd-subseries"], queryFn: async () => (await api.get<SubseriesItem[]>("/trd/subseries")).data });
  const expedients = useQuery({ queryKey: ["expedients", archiveId], queryFn: async () => (await api.get<ExpedientItem[]>(`/archives/expedients${archiveId ? `?archive_id=${archiveId}` : ""}`)).data });
  const detailQuery = useQuery({ queryKey: ["expedient-detail", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<ExpedientDetail>(`/archives/expedients/${detailId}/detail`)).data });
  const tree = useQuery({ queryKey: ["expedient-tree", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<ExpedientTree>(`/archives/expedients/${detailId}/tree`)).data });
  const compliance = useQuery({ queryKey: ["expedient-compliance", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<Compliance>(`/archives/expedients/${detailId}/compliance`)).data });
  const foliation = useQuery({ queryKey: ["expedient-foliation", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<FoliationReport>(`/archives/expedients/${detailId}/foliation`)).data });
  const locations = useQuery({ queryKey: ["expedient-locations", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<LocationSummary>(`/archives/expedients/${detailId}/locations`)).data });
  const loans = useQuery({ queryKey: ["expedient-loans", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<LoanItem[]>(`/archives/expedients/${detailId}/related-loans`)).data });
  const transfers = useQuery({ queryKey: ["expedient-transfers", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<TransferItem[]>(`/archives/expedients/${detailId}/related-transfers`)).data });
  const kardex = useQuery({ queryKey: ["expedient-kardex", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<KardexItem[]>(`/kardex/entities/expedient/${detailId}/timeline`)).data });
  const audit = useQuery({ queryKey: ["expedient-audit", detailId], enabled: Boolean(detailId), queryFn: async () => (await api.get<AuditItem[]>(`/archives/expedients/${detailId}/audit`)).data, retry: false });
  const fuid = useQuery({ queryKey: ["fuid"], queryFn: async () => (await api.get<Array<{ idFuid: number; fuid_code: string; ps950IdExpedient?: number; folio_total: number; status?: string }>>("/archives/fuid")).data });

  const create = useMutation({
    mutationFn: async () => api.post("/archives/expedients", { archive_id: Number(archiveId), expedient_code: code, expedient_name: name, expedient_type: type, series_id: Number(seriesId), subseries_id: Number(subseriesId) }),
    onSuccess: () => { setCode(""); setName(""); setMessage("Expediente vivo creado."); client.invalidateQueries({ queryKey: ["expedients"] }); },
    onError: () => setMessage("No fue posible crear el expediente. Revisa archivo autorizado y codigo unico.")
  });
  const closeExpedient = useMutation({
    mutationFn: async () => api.post(`/archives/expedients/${detailId}/close`, { observation: "Cierre inteligente desde expediente vivo" }),
    onSuccess: () => {
      setMessage("Expediente cerrado con Kardex y auditoria.");
      client.invalidateQueries({ queryKey: ["expedients"] });
      client.invalidateQueries({ queryKey: ["expedient-detail", detailId] });
      client.invalidateQueries({ queryKey: ["expedient-kardex", detailId] });
    },
    onError: (error: unknown) => {
      const response = error as { response?: { data?: { detail?: unknown } } };
      const detailMessage = typeof response.response?.data?.detail === "string" ? response.response.data.detail : "Este expediente no esta listo para cierre.";
      setMessage(detailMessage);
    }
  });

  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return (expedients.data ?? []).filter((item) => `${item.expedient_name} ${item.expedient_code} ${item.expedient_type} ${item.physical_location ?? ""}`.toLowerCase().includes(term));
  }, [expedients.data, filter]);
  const archiveName = (id: number) => archives.data?.find((item) => item.idArchive === id)?.archive_name ?? `Archivo ${id}`;
  const filteredSubseries = (subseries.data ?? []).filter((item) => !seriesId || item.ps610IdSeries === Number(seriesId));
  const currentFuid = (fuid.data ?? []).filter((item) => item.ps950IdExpedient === detailId);
  const detailData = detailQuery.data;
  const typeSummary = detailData?.document_types ?? compliance.data?.document_types;
  const inconsistencies = detailData?.inconsistencies ?? compliance.data?.inconsistencies;
  const documents = tree.data?.children.flatMap((folder) => folder.children.map((document) => ({ ...document, folder_code: folder.code, folder_name: folder.name }))) ?? [];
  const totals = useMemo(() => ({
    active: filtered.filter((item) => item.status === "active").length,
    docs: filtered.reduce((acc, item) => acc + item.document_count, 0),
    folios: filtered.reduce((acc, item) => acc + item.folio_count, 0)
  }), [filtered]);

  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  function openDetail(item: ExpedientItem) {
    setDetail(item);
    setActiveTab("Resumen");
    setSelectedNode(null);
  }

  return (
    <>
      <Breadcrumbs items={["Gestion Documental", "Expedientes"]} />
      <PageHeader title="Expedientes vivos" eyebrow="Unidad documental" description="Expedientes con archivo, TRD, carpetas, documentos, folios, custodia, Kardex y cierre inteligente." action={<button className="ghost" onClick={() => expedients.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("Este") ? "error" : "status"}>{message}</span></div> : null}

      <div className="grid metrics">
        <MetricCard label="Expedientes filtrados" value={filtered.length} tone="info" />
        <MetricCard label="Activos" value={totals.active} tone="success" />
        <MetricCard label="Documentos asociados" value={totals.docs} />
        <MetricCard label="Folios registrados" value={totals.folios} tone="warning" />
      </div>

      <div className="split expedient-layout">
        <section className="card"><h2>Nuevo expediente</h2><form className="form-grid" onSubmit={submit}>
          <label>Archivo<select value={archiveId} onChange={(event) => setArchiveId(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select></label>
          <label>Codigo expediente<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="EXP-RRHH-0001" required /></label>
          <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}><option value="laboral">Laboral</option><option value="juridico">Juridico</option><option value="contable">Contable</option><option value="administrativo">Administrativo</option><option value="contractual">Contractual</option><option value="hibrido">Hibrido</option><option value="electronico">Electronico</option><option value="fisico">Fisico</option></select></label>
          <label>Serie TRD<select value={seriesId} onChange={(event) => { setSeriesId(event.target.value); setSubseriesId(""); }} required><option value="">Seleccionar</option>{series.data?.map((item) => <option key={item.idSeries} value={item.idSeries}>{item.code} - {item.name}</option>)}</select></label>
          <label>Subserie TRD<select value={subseriesId} onChange={(event) => setSubseriesId(event.target.value)} required><option value="">Seleccionar</option>{filteredSubseries.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label>
          <p className="muted">La ubicacion fisica del expediente se calcula desde las carpetas asignadas a cajas. No se escribe manualmente.</p>
          <button disabled={create.isPending}><Plus size={17} /> Crear expediente</button>
        </form></section>

        <section className="grid">
          <FilterBar><select value={archiveId} onChange={(event) => setArchiveId(event.target.value)}><option value="">Todos los archivos</option>{archives.data?.map((item) => <option key={item.idArchive} value={item.idArchive}>{item.archive_name}</option>)}</select><input placeholder="Buscar por codigo, nombre, tipo o ubicacion" value={filter} onChange={(event) => setFilter(event.target.value)} /></FilterBar>
          {expedients.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!expedients.isLoading && filtered.length === 0 ? <EmptyState icon={<FolderKanban size={20} />} title="No hay expedientes en este archivo" description="Crea un expediente o cambia el filtro de archivo para revisar otra custodia." /> : null}
          <div className="expedient-list">
            {filtered.map((item) => (
              <button className="expedient-row" key={item.idExpedient} type="button" onClick={() => openDetail(item)}>
                <div className="expedient-tree"><FolderKanban size={18} /><span /></div>
                <div><strong>{item.expedient_name}</strong><span className="muted">{item.expedient_code} - {archiveName(item.ps930IdArchive)}</span></div>
                <StatusBadge value={item.expedient_type} tone="info" />
                <span>{item.document_count} docs</span>
                <span>{item.folio_count} folios</span>
                <StatusBadge value={item.status} tone={statusTone(item.status)} />
              </button>
            ))}
          </div>
          <DataTable><table><thead><tr><th>Expediente</th><th>Tipo</th><th>Archivo</th><th>Documentos</th><th>Folios</th><th>Estado</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.idExpedient} onClick={() => openDetail(item)}><td><strong>{item.expedient_name}</strong><br /><span className="muted">{item.expedient_code}</span></td><td>{item.expedient_type}</td><td>{archiveName(item.ps930IdArchive)}</td><td>{item.document_count}</td><td>{item.folio_count}</td><td><StatusBadge value={item.status} tone={statusTone(item.status)} /></td></tr>)}</tbody></table></DataTable>
        </section>
      </div>

      <DetailDrawer open={Boolean(detail)} title={detailData?.expedient_name ?? detail?.expedient_name ?? "Expediente"} subtitle={detailData?.expedient_code ?? detail?.expedient_code} onClose={() => setDetail(null)}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {detail ? <>
          <div className="toolbar wrap">
            <StatusBadge value={detailData?.status ?? detail.status} tone={statusTone(detailData?.status ?? detail.status)} />
            <StatusBadge value={detailData?.expedient_type ?? detail.expedient_type} tone="info" />
            <StatusBadge value={detailData?.archive_name ?? archiveName(detail.ps930IdArchive)} />
            <StatusBadge value={detailData?.compliance_status ?? "pending"} tone={statusTone(detailData?.compliance_status ?? "pending")} />
          </div>
          <div className="grid metrics drawer-metrics">
            <MetricCard label="Carpetas" value={detailData?.folders_count ?? tree.data?.children.length ?? 0} />
            <MetricCard label="Documentos" value={detailData?.documents_count ?? detail.document_count} />
            <MetricCard label="Folios" value={detailData?.folios_count ?? detail.folio_count} tone={foliation.data?.status === "complete" ? "success" : "warning"} />
            <MetricCard label="Tipologias usadas" value={typeSummary?.used.length ?? 0} tone="info" />
          </div>
          <div className="toolbar wrap">
            <Link className="ghost" href={`/folders?expedient=${detail.idExpedient}`}><GitBranch size={16} /> Agregar carpeta</Link>
            <Link className="ghost" href={`/documents?expedient=${detail.idExpedient}`}><FilePlus2 size={16} /> Agregar documento</Link>
            <Link className="ghost" href={`/foliation?expedient=${detail.idExpedient}`}><ShieldCheck size={16} /> Foliar</Link>
            <Link className="ghost" href={`/transfer-batches?expedient=${detail.idExpedient}`}><Send size={16} /> Transferir</Link>
            <Link className="ghost" href={`/loans?expedient=${detail.idExpedient}`}><Route size={16} /> Prestar</Link>
            <button type="button" disabled={closeExpedient.isPending || detailData?.status === "closed"} onClick={() => closeExpedient.mutate()}><CheckCircle2 size={16} /> Cerrar expediente</button>
          </div>
          <div className="tabbar scroll-tabs">{tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>

          {activeTab === "Resumen" ? <section className="grid">
            <article className="card compact"><h3>Contexto archivistico</h3><p className="muted">Archivo: {detailData?.archive_name ?? archiveName(detail.ps930IdArchive)}</p><p className="muted">Serie: {detailData?.series ? `${detailData.series.code} - ${detailData.series.name}` : "Sin serie"}</p><p className="muted">Subserie: {detailData?.subseries?.name ?? "Sin subserie"}</p><p className="muted">Custodio: {detailData?.custodian ?? "Pendiente"}</p></article>
            <article className="card compact"><h3>Ubicacion</h3><p className="muted">Fisica: {detailData?.physical_location ?? "Sin registrar"}</p><p className="muted">Digital: {detailData?.digital_location ?? "Repositorio pendiente"}</p></article>
            <section className="timeline"><TimelineEvent state="Expediente" tone="success" title="Unidad documental viva" description="El detalle consolida documentos, carpetas, folios, custodia y trazabilidad." /><TimelineEvent state="Cierre" tone={detailData?.ready_to_close ? "success" : "warning"} title={detailData?.ready_to_close ? "Listo para cierre operativo" : "Tiene pendientes antes de cerrar"} description={detailData?.ready_to_close ? "El checklist no tiene bloqueos criticos." : "Revisa cumplimiento, foliacion, prestamos y transferencias."} /></section>
          </section> : null}

          {activeTab === "Arbol" ? <section className="grid">
            {!tree.data?.children.length ? <EmptyState icon={<FolderKanban size={20} />} title="No hay carpetas" description="Agrega carpetas para organizar los documentos del expediente." /> : null}
            {tree.data?.children.map((folder) => <article className="card compact" key={folder.id}><div className="toolbar space-between"><button className="ghost" type="button" onClick={() => setSelectedNode(folder)}><FolderKanban size={16} /> {folder.code} - {folder.name}</button><StatusBadge value={folder.status} tone={statusTone(folder.status)} /></div><p className="muted">{folder.documents_count} documentos - {folder.folios_count} folios - Caja {folder.box_id ?? "sin caja"}</p><div className="grid">{folder.children.map((document) => <button className="expedient-row" type="button" key={document.id} onClick={() => setSelectedNode(document)}><FilePlus2 size={16} /><span>{document.name}</span><StatusBadge value={document.document_type} tone="info" /><span>{document.folio_start ?? "-"}-{document.folio_end ?? "-"}</span><StatusBadge value={document.has_digital_file ? "digital" : document.support} /></button>)}</div></article>)}
            {selectedNode ? <article className="card compact"><h3>Detalle seleccionado</h3><pre>{JSON.stringify(selectedNode, null, 2)}</pre></article> : null}
          </section> : null}

          {activeTab === "Documentos" ? <DataTable><table><thead><tr><th>Documento</th><th>Carpeta</th><th>Tipo</th><th>Folios</th><th>Soporte</th><th>Estado</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td>{document.name}</td><td>{document.folder_code}</td><td>{document.document_type}</td><td>{document.folio_start ?? "-"} - {document.folio_end ?? "-"}</td><td>{document.has_digital_file ? "Digital" : document.support}</td><td><StatusBadge value={document.status} tone={statusTone(document.status)} /></td></tr>)}</tbody></table></DataTable> : null}

          {activeTab === "Tipologias" ? <section className="grid">
            <div className="grid metrics"><MetricCard label="Usadas" value={typeSummary?.used.length ?? 0} /><MetricCard label="Esperadas por subserie" value={typeSummary?.required.length ?? 0} /><MetricCard label="Faltantes" value={typeSummary?.missing_required.length ?? 0} tone={(typeSummary?.missing_required.length ?? 0) ? "warning" : "success"} /></div>
            <article className="card compact"><h3>Tipologias utilizadas</h3><div className="checklist">{typeSummary?.used.length ? typeSummary.used.map((item) => <span className="badge badge-info" style={{ borderColor: item.color ?? undefined }} key={item.type_code}>{item.name}: {item.count}</span>) : <span className="muted">Este expediente todavia no tiene tipologias documentales usadas.</span>}</div></article>
            <article className="card compact"><h3>Tipologias esperadas</h3><div className="checklist">{typeSummary?.required.length ? typeSummary.required.map((item) => <span className={typeSummary.missing_required.includes(item.type_code) ? "badge badge-warning" : "badge badge-success"} key={item.type_code}>{item.name}</span>) : <span className="muted">La subserie no tiene tipologias obligatorias configuradas.</span>}</div></article>
          </section> : null}

          {activeTab === "Inconsistencias" ? <section className="grid">
            <div className="grid metrics"><MetricCard label="Docs faltantes" value={inconsistencies?.missing_documents.length ?? 0} tone={(inconsistencies?.missing_documents.length ?? 0) ? "warning" : "success"} /><MetricCard label="Metadatos pendientes" value={inconsistencies?.metadata_incomplete.length ?? 0} tone={(inconsistencies?.metadata_incomplete.length ?? 0) ? "warning" : "success"} /><MetricCard label="Saltos foliacion" value={inconsistencies?.foliation_gaps.length ?? 0} tone={(inconsistencies?.foliation_gaps.length ?? 0) ? "danger" : "success"} /></div>
            {inconsistencies?.missing_required_types.length ? <article className="card compact"><h3>Tipologias faltantes</h3><p className="muted">{inconsistencies.missing_required_types.join(", ")}</p></article> : null}
            {inconsistencies?.metadata_incomplete.length ? <article className="card compact"><h3>Metadatos incompletos</h3>{inconsistencies.metadata_incomplete.map((item) => <p className="muted" key={item.document_id}>{item.document_name}: falta {item.missing_metadata.join(", ")}</p>)}</article> : null}
            {!inconsistencies?.missing_documents.length && !inconsistencies?.missing_required_types.length && !inconsistencies?.metadata_incomplete.length && !inconsistencies?.foliation_gaps.length ? <EmptyState title="Sin inconsistencias criticas" description="El expediente no presenta faltantes documentales ni metadatos obligatorios pendientes." /> : null}
          </section> : null}

          {activeTab === "Foliacion" ? <section className="grid">
            <MetricCard label="Estado foliacion" value={foliation.data?.status ?? "pendiente"} tone={statusTone(foliation.data?.status ?? "pending")} />
            <MetricCard label="Total folios" value={foliation.data?.total_folios ?? 0} />
            <MetricCard label="Sin foliar" value={foliation.data?.unfoliated.length ?? 0} tone={(foliation.data?.unfoliated.length ?? 0) ? "warning" : "success"} />
            <MetricCard label="Saltos / duplicados" value={`${foliation.data?.gaps.length ?? 0}/${foliation.data?.duplicates.length ?? 0}`} tone={(foliation.data?.gaps.length || foliation.data?.duplicates.length) ? "danger" : "success"} />
            <DataTable><table><thead><tr><th>Documento</th><th>Inicio</th><th>Final</th><th>Total</th></tr></thead><tbody>{foliation.data?.ranges.map((item) => <tr key={item.document_id}><td>{item.document_name}</td><td>{item.start}</td><td>{item.end}</td><td>{item.total}</td></tr>)}</tbody></table></DataTable>
          </section> : null}

          {activeTab === "Ubicacion" ? <section className="grid">
            <article className="card compact"><h3>Expediente</h3><p className="muted">Fisica: {locations.data?.physical_location ?? "Sin registrar"}</p><p className="muted">Digital: {locations.data?.digital_location ?? "Sin registrar"}</p></article>
            {locations.data?.folders.map((item) => <article className="card compact" key={item.folder_id}><h3><MapPin size={16} /> {item.folder_code}</h3><p>{item.folder_name}</p><p className="muted">Caja: {item.box_code ?? "sin caja"} - Estanteria: {item.shelf_code ?? "sin estanteria"}</p><p className="muted">{item.physical_location ?? item.shelf_location ?? "Ubicacion pendiente"}</p></article>)}
          </section> : null}

          {activeTab === "Transferencias" ? <DataTable><table><thead><tr><th>Lote</th><th>Unidad</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Observacion</th></tr></thead><tbody>{transfers.data?.map((item) => <tr key={item.idBatchItem}><td>{item.batch_code ?? item.batch_id}</td><td>{item.entity_type} #{item.entity_id}</td><td>{item.origin_archive_id}</td><td>{item.destination_archive_id}</td><td><StatusBadge value={item.status} tone={statusTone(item.status)} /></td><td>{item.observation ?? item.rejection_reason ?? ""}</td></tr>)}</tbody></table></DataTable> : null}

          {activeTab === "Prestamos" ? <DataTable><table><thead><tr><th>Prestamo</th><th>Unidad</th><th>Solicitante</th><th>Vence</th><th>Estado</th></tr></thead><tbody>{loans.data?.map((item) => <tr key={item.idLoan}><td>{item.idLoan}</td><td>{item.entity_type} #{item.entity_id}</td><td>{item.requested_by}</td><td>{item.due_at?.slice(0, 10) ?? "Sin fecha"}</td><td><StatusBadge value={item.status} tone={statusTone(item.status)} /></td></tr>)}</tbody></table></DataTable> : null}

          {activeTab === "FUID" ? <section className="grid">{currentFuid.length === 0 ? <EmptyState icon={<Archive size={20} />} title="FUID pendiente" description="Genera el FUID desde Inventario/FUID cuando el expediente este listo." action={<Link className="ghost" href={`/fuid?expedient=${detail.idExpedient}`}>Abrir FUID</Link>} /> : currentFuid.map((item) => <article className="card compact" key={item.idFuid}><h3>{item.fuid_code}</h3><p className="muted">{item.folio_total} folios inventariados</p><Link className="ghost" href="/fuid">Ver inventario</Link></article>)}</section> : null}

          {activeTab === "Kardex" ? <section className="timeline">{kardex.data?.length ? kardex.data.map((item) => <TimelineEvent key={item.idMovement} state={item.new_status} tone={statusTone(item.new_status)} title={item.event_type} description={item.observation ?? item.rejection_reason ?? "Movimiento documental registrado"} meta={item.created_at?.slice(0, 10)} />) : <EmptyState title="Sin movimientos Kardex" description="Este expediente todavia no tiene trazabilidad Kardex." />}</section> : null}

          {activeTab === "Auditoria" ? <DataTable><table><thead><tr><th>Evento</th><th>Modulo</th><th>Entidad</th><th>Fecha</th></tr></thead><tbody>{audit.data?.map((item) => <tr key={item.idAudit}><td>{item.action}</td><td>{item.module}</td><td>{item.entity} {item.entity_id}</td><td>{item.created_at?.slice(0, 16)}</td></tr>)}</tbody></table></DataTable> : null}

          {activeTab === "Cumplimiento" ? <section className="grid">
            <div className="grid metrics"><MetricCard label="Estado" value={compliance.data?.status ?? "pendiente"} tone={statusTone(compliance.data?.status ?? "pending")} /><MetricCard label="Prestamos activos" value={compliance.data?.active_loans ?? 0} tone={(compliance.data?.active_loans ?? 0) ? "danger" : "success"} /><MetricCard label="Transferencias pendientes" value={compliance.data?.pending_transfers ?? 0} tone={(compliance.data?.pending_transfers ?? 0) ? "danger" : "success"} /></div>
            {compliance.data?.checklist.map((item) => <article className="card compact" key={item.key}><div className="toolbar space-between"><strong>{itemIcon(item.status)} {item.label}</strong><StatusBadge value={item.status} tone={statusTone(item.status)} /></div><p className="muted">{item.message}</p></article>)}
          </section> : null}
        </> : null}
      </DetailDrawer>
    </>
  );
}
