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

export default function TrdPage() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "series";
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [subName, setSubName] = useState("");
  const [years, setYears] = useState(5);
  const series = useQuery({ queryKey: ["trd-series"], queryFn: async () => (await api.get<Series[]>("/trd/series")).data });
  const subseries = useQuery({ queryKey: ["trd-subseries"], queryFn: async () => (await api.get<Subseries[]>("/trd/subseries")).data });
  const createSeries = useMutation({ mutationFn: async () => api.post("/trd/series", { code, name }), onSuccess: () => { setCode(""); setName(""); client.invalidateQueries({ queryKey: ["trd-series"] }); } });
  const createSubseries = useMutation({ mutationFn: async () => api.post("/trd/subseries", { series_id: Number(seriesId), name: subName, retention_years: years }), onSuccess: () => { setSubName(""); client.invalidateQueries({ queryKey: ["trd-subseries"] }); } });
  function submitSeries(event: FormEvent) { event.preventDefault(); createSeries.mutate(); }
  function submitSubseries(event: FormEvent) { event.preventDefault(); createSubseries.mutate(); }
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
          <h2>Serie</h2>
          <form className="form-grid" onSubmit={submitSeries}>
            <label>Codigo<input value={code} onChange={(event) => setCode(event.target.value)} required /></label>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <button><Plus size={17} /> Crear serie</button>
          </form>
          <h2>Subserie</h2>
          <form className="form-grid" onSubmit={submitSubseries}>
            <label>Serie<select value={seriesId} onChange={(event) => setSeriesId(event.target.value)} required><option value="">Seleccionar</option>{series.data?.map((item) => <option key={item.idSeries} value={item.idSeries}>{item.code} - {item.name}</option>)}</select></label>
            <label>Nombre<input value={subName} onChange={(event) => setSubName(event.target.value)} required /></label>
            <label>Retencion anos<input type="number" min={1} value={years} onChange={(event) => setYears(Number(event.target.value))} /></label>
            <button><Plus size={17} /> Crear subserie</button>
          </form>
        </section>
        <section className="card table-card">
          {view === "series" ? (
            <table>
              <thead><tr><th>Codigo</th><th>Serie</th></tr></thead>
              <tbody>{series.data?.map((item) => <tr key={item.idSeries}><td>{item.code}</td><td>{item.name}</td></tr>)}</tbody>
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
