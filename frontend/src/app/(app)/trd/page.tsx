"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Series = { idSeries: number; code: string; name: string };
type Subseries = { idSubseries: number; ps610IdSeries: number; name: string; retention_years: number };
type Disposition = { idDisposition: number; ps612IdSubseries: number; archive_management: number; archive_central: number; final_action: string };

export default function TrdPage() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "series";
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
  const [finalAction, setFinalAction] = useState("Conservacion total");
  const series = useQuery({ queryKey: ["trd-series"], queryFn: async () => (await api.get<Series[]>("/trd/series")).data });
  const subseries = useQuery({ queryKey: ["trd-subseries"], queryFn: async () => (await api.get<Subseries[]>("/trd/subseries")).data });
  const dispositions = useQuery({ queryKey: ["trd-dispositions"], queryFn: async () => (await api.get<Disposition[]>("/trd/dispositions")).data });
  const createSeries = useMutation({ mutationFn: async () => api.post("/trd/series", { code, name }), onSuccess: () => { setCode(""); setName(""); client.invalidateQueries({ queryKey: ["trd-series"] }); } });
  const createSubseries = useMutation({ mutationFn: async () => api.post("/trd/subseries", { series_id: Number(seriesId), name: subName, retention_years: years }), onSuccess: () => { setSubName(""); client.invalidateQueries({ queryKey: ["trd-subseries"] }); } });
  const updateRetention = useMutation({ mutationFn: async () => api.patch(`/trd/subseries/${retentionSubseriesId}/retention`, { retention_years: retentionYears }), onSuccess: () => client.invalidateQueries({ queryKey: ["trd-subseries"] }) });
  const createDisposition = useMutation({ mutationFn: async () => api.post("/trd/dispositions", { subseries_id: Number(dispositionSubseriesId), archive_management: managementYears, archive_central: centralYears, final_action: finalAction }), onSuccess: () => { client.invalidateQueries({ queryKey: ["trd-dispositions"] }); } });
  function submitSeries(event: FormEvent) { event.preventDefault(); createSeries.mutate(); }
  function submitSubseries(event: FormEvent) { event.preventDefault(); createSubseries.mutate(); }
  function submitRetention(event: FormEvent) { event.preventDefault(); updateRetention.mutate(); }
  function submitDisposition(event: FormEvent) { event.preventDefault(); createDisposition.mutate(); }
  const viewCopy: Record<string, { title: string; description: string }> = {
    series: { title: "Series TRD", description: "Gestiona las series documentales que estructuran la clasificacion archivistica." },
    subseries: { title: "Subseries TRD", description: "Administra subseries, tiempos de retencion y relacion con la serie." },
    retention: { title: "Retencion documental", description: "Consulta tiempos de retencion por subserie para control de cierre y transferencia." },
    disposition: { title: "Disposicion final", description: "Vista operativa para revisar disposicion final y reglas de conservacion." }
  };
  return (
    <>
      <PageTitle title={viewCopy[view]?.title ?? "TRD"} description={viewCopy[view]?.description ?? "Series, subseries, retencion y disposicion documental."} />
      <nav className="tabbar view-tabs">
        <Link className={view === "series" ? "active" : ""} href="/trd?view=series">Series</Link>
        <Link className={view === "subseries" ? "active" : ""} href="/trd?view=subseries">Subseries</Link>
        <Link className={view === "retention" ? "active" : ""} href="/trd?view=retention">Retencion</Link>
        <Link className={view === "disposition" ? "active" : ""} href="/trd?view=disposition">Disposicion final</Link>
      </nav>
      <div className="split">
        <section className="card form-panel">
          {view === "series" ? (
            <>
              <h2>Nueva serie</h2>
              <form className="form-grid" onSubmit={submitSeries}>
                <label>Codigo<input value={code} onChange={(event) => setCode(event.target.value)} required /></label>
                <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
                <button><Plus size={17} /> Crear serie</button>
              </form>
            </>
          ) : null}
          {view === "subseries" ? (
            <>
              <h2>Nueva subserie</h2>
              <form className="form-grid" onSubmit={submitSubseries}>
                <label>Serie<select value={seriesId} onChange={(event) => setSeriesId(event.target.value)} required><option value="">Seleccionar</option>{series.data?.map((item) => <option key={item.idSeries} value={item.idSeries}>{item.code} - {item.name}</option>)}</select></label>
                <label>Nombre<input value={subName} onChange={(event) => setSubName(event.target.value)} required /></label>
                <label>Retencion total inicial<input type="number" min={1} value={years} onChange={(event) => setYears(Number(event.target.value))} /></label>
                <button><Plus size={17} /> Crear subserie</button>
              </form>
            </>
          ) : null}
          {view === "retention" ? (
            <>
              <h2>Actualizar retencion</h2>
              <form className="form-grid" onSubmit={submitRetention}>
                <label>Subserie<select value={retentionSubseriesId} onChange={(event) => { setRetentionSubseriesId(event.target.value); const selected = subseries.data?.find((item) => String(item.idSubseries) === event.target.value); if (selected) setRetentionYears(selected.retention_years); }} required><option value="">Seleccionar</option>{subseries.data?.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label>
                <label>Anios de retencion total<input type="number" min={1} max={100} value={retentionYears} onChange={(event) => setRetentionYears(Number(event.target.value))} /></label>
                <button><Plus size={17} /> Guardar retencion</button>
              </form>
            </>
          ) : null}
          {view === "disposition" ? (
            <>
              <h2>Disposicion final</h2>
              <form className="form-grid" onSubmit={submitDisposition}>
                <label>Subserie<select value={dispositionSubseriesId} onChange={(event) => setDispositionSubseriesId(event.target.value)} required><option value="">Seleccionar</option>{subseries.data?.map((item) => <option key={item.idSubseries} value={item.idSubseries}>{item.name}</option>)}</select></label>
                <label>Archivo de gestion<input type="number" min={0} value={managementYears} onChange={(event) => setManagementYears(Number(event.target.value))} /></label>
                <label>Archivo central<input type="number" min={0} value={centralYears} onChange={(event) => setCentralYears(Number(event.target.value))} /></label>
                <label>Accion final<select value={finalAction} onChange={(event) => setFinalAction(event.target.value)}><option>Conservacion total</option><option>Seleccion</option><option>Eliminacion</option><option>Digitalizacion y conservacion</option></select></label>
                <button><Plus size={17} /> Registrar disposicion</button>
              </form>
            </>
          ) : null}
        </section>
        <section className="card table-card">
          {view === "series" ? (
            <table>
              <thead><tr><th>Codigo</th><th>Serie</th></tr></thead>
              <tbody>{series.data?.map((item) => <tr key={item.idSeries}><td>{item.code}</td><td>{item.name}</td></tr>)}</tbody>
            </table>
          ) : view === "disposition" ? (
            <table>
              <thead><tr><th>Subserie</th><th>Gestion</th><th>Central</th><th>Accion final</th></tr></thead>
              <tbody>{dispositions.data?.map((item) => <tr key={item.idDisposition}><td>{item.ps612IdSubseries}</td><td>{item.archive_management} anos</td><td>{item.archive_central} anos</td><td><span className="status">{item.final_action}</span></td></tr>)}</tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Subserie</th><th>Serie</th><th>Retencion</th><th>Vista</th></tr></thead>
              <tbody>{subseries.data?.map((item) => <tr key={item.idSubseries}><td>{item.name}</td><td>{item.ps610IdSeries}</td><td>{item.retention_years} anos</td><td><span className="status">{viewCopy[view]?.title ?? "TRD"}</span></td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
