"use client";

import { RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { MetricCard } from "@/components/ui/metric-card";
import { PageTitle } from "@/components/ui/page-title";

type BiDashboard = {
  documents: number;
  employees: number;
  pending_tasks: number;
  ocr_total: number;
  ocr_success_rate: number;
  signatures_pending: number;
  failed_integrations: number;
  critical_audit_events: number;
  risk_level: string;
  main_bottleneck: string;
};

export default function BiPage() {
  const client = useQueryClient();
  const dashboard = useQuery({ queryKey: ["bi-dashboard"], queryFn: async () => (await api.get<BiDashboard>("/bi/executive-dashboard")).data });
  const refresh = useMutation({ mutationFn: async () => api.post("/bi/refresh"), onSuccess: () => client.invalidateQueries({ queryKey: ["bi-dashboard"] }) });
  const data = dashboard.data;
  return (
    <>
      <PageTitle title="BI avanzado" description="Inteligencia operacional, KPIs historicos, OCR, firmas e integraciones." action={<button className="ghost" onClick={() => refresh.mutate()}><RefreshCcw size={17} /> Refrescar BI</button>} />
      <div className="grid metrics">
        <MetricCard label="Riesgo" value={data?.risk_level ?? "..."} tone={data?.risk_level === "Alto" ? "danger" : data?.risk_level === "Medio" ? "warn" : "ok"} />
        <MetricCard label="Documentos" value={data?.documents ?? 0} />
        <MetricCard label="OCR procesados" value={data?.ocr_total ?? 0} />
        <MetricCard label="Precision OCR" value={`${data?.ocr_success_rate ?? 0}%`} tone="ok" />
      </div>
      <div className="grid metrics">
        <MetricCard label="Firmas pendientes" value={data?.signatures_pending ?? 0} tone="warn" />
        <MetricCard label="Integraciones fallidas" value={data?.failed_integrations ?? 0} tone={(data?.failed_integrations ?? 0) > 0 ? "danger" : "ok"} />
        <MetricCard label="Tareas pendientes" value={data?.pending_tasks ?? 0} />
        <MetricCard label="Eventos críticos" value={data?.critical_audit_events ?? 0} />
      </div>
      <section className="card">
        <h2>Cuello de botella principal</h2>
        <p>{data?.main_bottleneck ?? "Sin datos"}</p>
      </section>
    </>
  );
}
