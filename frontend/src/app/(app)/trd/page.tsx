"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, ClipboardList, Download, GitBranch, Plus, RefreshCcw, ShieldCheck, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DetailDrawer, EmptyState, LoadingSkeleton, MetricCard, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Series = { idSeries: number; code: string; name: string; description?: string };
type Subseries = { idSubseries: number; ps610IdSeries: number; name: string; retention_years: number };
type Disposition = { idDisposition: number; ps612IdSubseries: number; archive_management: number; archive_central: number; final_action: string };
type SeriesTree = Series & { subseries: Array<Subseries & { active_expedients: number; documents: number }> };
type Workspace = { series: Series; subseries: Subseries[]; kpis: { total_expedients: number; active_expedients: number; closed_expedients: number; total_documents: number; total_folders: number }; dispositions: Disposition[] };
type SubseriesWorkspace = { subseries: Subseries; series: Series; document_types: Array<{ type_code: string; name: string; sector?: string; required_metadata: string[] }>; expedients: unknown[]; documents: unknown[]; retention: { management_years: number; central_years: number; total_years: number; final_action: string }; audit: unknown[] };
type RetentionTimeline = { steps: Array<{ stage: string; years: number | null; description: string }> };
type TrdImportImpact = { rows: number; series_new: string[]; subseries_new: string[]; document_types_new: string[]; invalid_rows: Array<{ row: number; reason: string }>; can_import: boolean };

const viewCopy: Record<string, { title: string; description: string }> = {
  series: { title: "Series TRD", description: "Arbol documental con subseries, volumen, expedientes y cumplimiento." },
  subseries: { title: "Subseries TRD", description: "Workspace especializado por tipologias, expedientes, documentos y retencion." },
  retention: { title: "Retencion documental", description: "Linea de vida documental: gestion, central e historico." },
  disposition: { title: "Disposicion final", description: "Conservacion, seleccion, eliminacion, microfilmacion o digitalizacion." }
};

function dispositionTone(value: string) {
  if (value.toLowerCase().includes("elimin")) return "danger" as const;
  if (value.toLowerCase().includes("seleccion")) return "warning" as const;
  if (value.toLowerCase().includes("conserv")) return "success" as const;
  return "info" as const;
}

export default function TrdPage() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "series";
  const [drawer, setDrawer] = useState<"" | "series" | "subseries" | "retention" | "disposition">("");
  const [selectedSeries, setSelectedSeries] = useState<number | null>(null);
  const [selectedSubseries, setSelectedSubseries] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [subName, setSubName] = useState("");
  const [years, setYears] = useState(5);
  const [retentionSubseriesId, setRetentionSubseriesId] = useState("");
  const [retentionYears, setRetentionYears] = useState(5);
  const [dispositionSubseriesId, setDispositionSubseriesId] = useState("");
  const [managementYears, setManagementYears] = useState(2);
  const [centralYears, setCentralYears] = useState(5);
  const [finalAction, setFinalAction] = useState("conservacion total");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [impact, setImpact] = useState<TrdImportImpact | null>(null);
  const [templateSector, setTemplateSector] = useState("transporte");
  const [templateSubseriesId, setTemplateSubseriesId] = useState("");
  const [message, setMessage] = useState("");

  const series = useQuery({ queryKey: ["trd-series"], queryFn: async () => (await api.get<Series[]>("/trd/series")).data });
  const tree = useQuery({ queryKey: ["trd-series-tree"], queryFn: async () => (await api.get<SeriesTree[]>("/trd/series/tree")).data });
  const subseries = useQuery({ queryKey: ["trd-subseries"], queryFn: async () => (await api.get<Subseries[]>("/trd/subseries")).data });
  const dispositions = useQuery({ queryKey: ["trd-dispositions"], queryFn: async () => (await api.get<Disposition[]>("/trd/dispositions")).data });
  const workspace = useQuery({ queryKey: ["trd-series-workspace", selectedSeries], enabled: Boolean(selectedSeries), queryFn: async () => (await api.get<Workspace>(`/trd/series/${selectedSeries}/workspace`)).data });
  const subWorkspace = useQuery({ queryKey: ["trd-subseries-workspace", selectedSubseries], enabled: Boolean(selectedSubseries), queryFn: async () => (await api.get<SubseriesWorkspace>(`/trd/subseries/${selectedSubseries}/workspace`)).data });
  const timeline = useQuery({ queryKey: ["trd-retention-timeline", selectedSubseries], enabled: Boolean(selectedSubseries), queryFn: async () => (await api.get<RetentionTimeline>(`/trd/subseries/${selectedSubseries}/retention-timeline`)).data });

  const createSeries = useMutation({ mutationFn: async () => api.post("/trd/series", { code, name }), onSuccess: () => { setCode(""); setName(""); setDrawer(""); setMessage("Serie creada."); client.invalidateQueries({ queryKey: ["trd-series"] }); client.invalidateQueries({ queryKey: ["trd-series-tree"] }); } });
  const createSubseries = useMutation({ mutationFn: async () => api.post("/trd/subseries", { series_id: Number(seriesId), name: subName, retention_years: years }), onSuccess: () => { setSubName(""); setDrawer(""); setMessage("Subserie creada."); client.invalidateQueries({ queryKey: ["trd-subseries"] }); client.invalidateQueries({ queryKey: ["trd-series-tree"] }); } });
  const updateRetention = useMutation({ mutationFn: async () => api.patch(`/trd/subseries/${retentionSubseriesId}/retention`, { retention_years: retentionYears }), onSuccess: () => { setDrawer(""); setMessage("Retencion actualizada."); client.invalidateQueries({ queryKey: ["trd-subseries"] }); client.invalidateQueries({ queryKey: ["trd-retention-timeline"] }); } });
  const createDisposition = useMutation({ mutationFn: async () => api.post("/trd/dispositions", { subseries_id: Number(dispositionSubseriesId), archive_management: managementYears, archive_central: centralYears, final_action: finalAction }), onSuccess: () => { setDrawer(""); setMessage("Disposicion final registrada."); client.invalidateQueries({ queryKey: ["trd-dispositions"] }); } });
  const simulateImport = useMutation({
    mutationFn: async () => {
      if (!importFile) return null;
      const form = new FormData();
      form.append("file", importFile);
      return (await api.post<TrdImportImpact>("/trd/import/simulate", form)).data;
    },
    onSuccess: (data) => { setImpact(data ?? null); setMessage(data?.can_import ? "Simulacion lista. Puedes importar la TRD." : "La simulacion encontro filas por corregir."); }
  });
  const applyImport = useMutation({
    mutationFn: async () => {
      if (!importFile) return null;
      const form = new FormData();
      form.append("file", importFile);
      return api.post("/trd/import/apply", form);
    },
    onSuccess: () => { setMessage("TRD importada correctamente."); setImpact(null); setImportFile(null); series.refetch(); subseries.refetch(); tree.refetch(); dispositions.refetch(); }
  });
  const applyTemplate = useMutation({
    mutationFn: async () => api.post(`/documents/types/apply-template/${templateSector}?subseries_id=${templateSubseriesId}`),
    onSuccess: () => { setMessage("Plantilla sectorial aplicada a la subserie."); subWorkspace.refetch(); }
  });
  function submitSeries(event: FormEvent) { event.preventDefault(); createSeries.mutate(); }
  function submitSubseries(event: FormEvent) { event.preventDefault(); createSubseries.mutate(); }
  function submitRetention(event: FormEvent) { event.preventDefault(); updateRetention.mutate(); }
  function submitDisposition(event: FormEvent) { event.preventDefault(); createDisposition.mutate(); }

  const primaryAction = view === "series" ? "series" : view === "subseries" ? "subseries" : view === "retention" ? "retention" : "disposition";

  return (
    <>
      <PageTitle title={viewCopy[view]?.title ?? "TRD"} description={viewCopy[view]?.description ?? "Series, subseries, retencion y disposicion documental."} action={<div className="toolbar"><a className="button-link ghost-link" href="/api/v1/trd/export?format=xlsx"><Download size={17} /> Exportar</a><button onClick={() => setDrawer(primaryAction)}><Plus size={17} /> Crear / actualizar</button><button className="ghost" onClick={() => { series.refetch(); subseries.refetch(); tree.refetch(); }}><RefreshCcw size={17} /> Actualizar</button></div>} />
      <nav className="tabbar view-tabs">
        <Link className={view === "series" ? "active" : ""} href="/trd?view=series">Series</Link>
        <Link className={view === "subseries" ? "active" : ""} href="/trd?view=subseries">Subseries</Link>
        <Link className={view === "retention" ? "active" : ""} href="/trd?view=retention">Retencion</Link>
        <Link className={view === "disposition" ? "active" : ""} href="/trd?view=disposition">Disposicion final</Link>
      </nav>
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}

      <section className="card compact">
        <div className="toolbar">
          <label>Importar TRD CSV/XLSX<input type="file" accept=".csv,.xlsx" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImpact(null); }} /></label>
          <button className="ghost" disabled={!importFile || simulateImport.isPending} onClick={() => simulateImport.mutate()}><Upload size={16} /> Simular</button>
          <button disabled={!impact?.can_import || applyImport.isPending} onClick={() => applyImport.mutate()}><Upload size={16} /> Importar</button>
        </div>
        {impact ? <div className="module-grid"><MetricCard label="Filas" value={impact.rows} /><MetricCard label="Series nuevas" value={impact.series_new.length} /><MetricCard label="Subseries nuevas" value={impact.subseries_new.length} /><MetricCard label="Tipologias nuevas" value={impact.document_types_new.length} tone="info" /></div> : null}
        {impact?.invalid_rows.length ? <div className="validation-panel">{impact.invalid_rows.map((item) => <span key={item.row}>Fila {item.row}: {item.reason}</span>)}</div> : null}
        <div className="toolbar wrap">
          <label>Plantilla sectorial<select value={templateSector} onChange={(event) => setTemplateSector(event.target.value)}><option value="transporte">Transporte</option><option value="rrhh">RRHH</option><option value="juridico">Juridico</option><option value="contable">Contable</option><option value="salud">Salud</option><option value="educacion">Educacion</option><option value="gobierno">Gobierno</option><option value="constructora">Constructora</option><option value="general">General</option></select></label>
          <label>Subserie destino<select value={templateSubseriesId} onChange={(event) => setTemplateSubseriesId(event.target.value)}><option value="">Seleccionar subserie</option>{subseries.data?.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label>
          <button className="ghost" disabled={!templateSubseriesId || applyTemplate.isPending} onClick={() => applyTemplate.mutate()}><GitBranch size={16} /> Aplicar plantilla</button>
        </div>
      </section>

      {view === "series" ? <div className="trd-workspace">
        <section className="card">
          <h2><GitBranch size={18} /> Arbol documental</h2>
          {tree.isLoading ? <LoadingSkeleton rows={4} /> : null}
          <div className="org-tree">{tree.data?.map((item) => <article className="card compact" key={item.idSeries}><button className="ghost" onClick={() => setSelectedSeries(item.idSeries)}><strong>{item.code} - {item.name}</strong></button><div className="grid">{item.subseries.map((sub) => <button className="tree-node" key={sub.idSubseries} onClick={() => setSelectedSubseries(sub.idSubseries)}><span>{sub.name}</span><StatusBadge value={`${sub.active_expedients} exp`} /><StatusBadge value={`${sub.documents} docs`} /></button>)}</div></article>)}</div>
        </section>
        <section className="card">
          <h2>Workspace serie</h2>
          {!selectedSeries ? <EmptyState icon={<Archive size={20} />} title="Selecciona una serie" description="Abre una serie del arbol para ver volumen, expedientes y disposicion." /> : null}
          {workspace.isLoading ? <LoadingSkeleton rows={4} /> : null}
          {workspace.data ? <div className="grid"><div className="grid metrics"><MetricCard label="Expedientes" value={workspace.data.kpis.total_expedients} /><MetricCard label="Activos" value={workspace.data.kpis.active_expedients} tone="success" /><MetricCard label="Cerrados" value={workspace.data.kpis.closed_expedients} /><MetricCard label="Documentos" value={workspace.data.kpis.total_documents} tone="info" /></div>{workspace.data.subseries.map((item) => <article className="card compact" key={item.idSubseries}><strong>{item.name}</strong><p className="muted">Retencion total: {item.retention_years} anos</p></article>)}</div> : null}
        </section>
      </div> : null}

      {view === "subseries" ? <div className="trd-workspace">
        <section className="card table-card"><table><thead><tr><th>Subserie</th><th>Serie</th><th>Retencion</th></tr></thead><tbody>{subseries.data?.map((item) => <tr key={item.idSubseries} onClick={() => setSelectedSubseries(item.idSubseries)}><td>{item.name}</td><td>{item.ps610IdSeries}</td><td>{item.retention_years} anos</td></tr>)}</tbody></table></section>
        <section className="card">
          <h2>Workspace subserie</h2>
          {!selectedSubseries ? <EmptyState title="Selecciona una subserie" description="Consulta informacion, tipologias, expedientes, documentos, retencion y auditoria." /> : null}
          {subWorkspace.data ? <div className="grid"><div className="tabbar scroll-tabs"><button className="active">Informacion</button><button>Tipologias</button><button>Expedientes</button><button>Documentos</button><button>Retencion</button><button>Auditoria</button></div><MetricCard label="Expedientes" value={subWorkspace.data.expedients.length} /><MetricCard label="Documentos" value={subWorkspace.data.documents.length} /><MetricCard label="Tipologias" value={subWorkspace.data.document_types.length} tone="info" /><MetricCard label="Disposicion" value={subWorkspace.data.retention.final_action} tone={dispositionTone(subWorkspace.data.retention.final_action)} />{subWorkspace.data.document_types.map((item) => <article className="card compact" key={item.type_code}><strong>{item.name}</strong><p className="muted">{item.sector ?? "general"} / obligatorios: {item.required_metadata.join(", ") || "sin campos obligatorios"}</p></article>)}</div> : null}
        </section>
      </div> : null}

      {view === "retention" ? <section className="card">
        <div className="toolbar"><label>Subserie<select value={selectedSubseries ?? ""} onChange={(event) => setSelectedSubseries(Number(event.target.value))}><option value="">Seleccionar</option>{subseries.data?.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label></div>
        <div className="timeline">{timeline.data?.steps.map((item) => <TimelineEvent key={item.stage} state={item.stage} title={item.years === null ? "Disposicion final" : `${item.years} anos`} description={item.description} tone={item.stage === "Historico" ? "success" : "info"} />)}</div>
      </section> : null}

      {view === "disposition" ? <section className="card table-card"><table><thead><tr><th>Subserie</th><th>Gestion</th><th>Central</th><th>Accion final</th></tr></thead><tbody>{dispositions.data?.map((item) => <tr key={item.idDisposition}><td>{item.ps612IdSubseries}</td><td>{item.archive_management} anos</td><td>{item.archive_central} anos</td><td><StatusBadge value={item.final_action} tone={dispositionTone(item.final_action)} /></td></tr>)}</tbody></table></section> : null}

      <DetailDrawer open={Boolean(drawer)} onClose={() => setDrawer("")} title={drawer === "series" ? "Nueva serie" : drawer === "subseries" ? "Nueva subserie" : drawer === "retention" ? "Actualizar retencion" : "Disposicion final"}>
        {drawer === "series" ? <form className="form-grid" onSubmit={submitSeries}><label>Codigo<input value={code} onChange={(event) => setCode(event.target.value)} required /></label><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label><button><Plus size={17} /> Crear serie</button></form> : null}
        {drawer === "subseries" ? <form className="form-grid" onSubmit={submitSubseries}><label>Serie<select value={seriesId} onChange={(event) => setSeriesId(event.target.value)} required><option value="">Seleccionar</option>{series.data?.map((item) => <option key={item.idSeries} value={item.idSeries}>{item.code} - {item.name}</option>)}</select></label><label>Nombre<input value={subName} onChange={(event) => setSubName(event.target.value)} required /></label><label>Retencion total inicial<input type="number" min={1} value={years} onChange={(event) => setYears(Number(event.target.value))} /></label><button><Plus size={17} /> Crear subserie</button></form> : null}
        {drawer === "retention" ? <form className="form-grid" onSubmit={submitRetention}><label>Subserie<select value={retentionSubseriesId} onChange={(event) => { setRetentionSubseriesId(event.target.value); const selected = subseries.data?.find((item) => String(item.idSubseries) === event.target.value); if (selected) setRetentionYears(selected.retention_years); }} required><option value="">Seleccionar</option>{subseries.data?.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label><label>Anios de retencion total<input type="number" min={1} max={100} value={retentionYears} onChange={(event) => setRetentionYears(Number(event.target.value))} /></label><button><ClipboardList size={17} /> Guardar retencion</button></form> : null}
        {drawer === "disposition" ? <form className="form-grid" onSubmit={submitDisposition}><label>Subserie<select value={dispositionSubseriesId} onChange={(event) => setDispositionSubseriesId(event.target.value)} required><option value="">Seleccionar</option>{subseries.data?.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label><label>Archivo gestion<input type="number" min={0} value={managementYears} onChange={(event) => setManagementYears(Number(event.target.value))} /></label><label>Archivo central<input type="number" min={0} value={centralYears} onChange={(event) => setCentralYears(Number(event.target.value))} /></label><label>Accion final<select value={finalAction} onChange={(event) => setFinalAction(event.target.value)}><option value="conservacion total">Conservacion total</option><option value="eliminacion">Eliminacion</option><option value="seleccion">Seleccion</option><option value="microfilmacion">Microfilmacion</option><option value="digitalizacion">Digitalizacion</option></select></label><button><ShieldCheck size={17} /> Registrar disposicion</button></form> : null}
      </DetailDrawer>
    </>
  );
}
