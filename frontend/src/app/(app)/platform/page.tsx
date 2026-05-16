"use client";

import { RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { MetricCard } from "@/components/ui/metric-card";
import { PageTitle } from "@/components/ui/page-title";

type Platform = {
  node: string;
  environment: string;
  database: string;
  redis: string;
  opensearch: string;
  rabbitmq: string;
  minio: string;
  failed_report_jobs: number;
  requests_recorded: number;
  errors_recorded: number;
  cache_ttl_seconds: number;
};

export default function PlatformPage() {
  const query = useQuery({ queryKey: ["platform"], queryFn: async () => (await api.get<Platform>("/platform/technical-dashboard")).data });
  const data = query.data;
  return (
    <>
      <PageTitle title="Dashboard tecnico" description="Estado de servicios, cache, busqueda, errores y nodo activo." action={<button className="ghost" onClick={() => query.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="grid metrics">
        <MetricCard label="Nodo" value={data?.node ?? "..."} />
        <MetricCard label="Base de datos" value={data?.database ?? "..."} tone={data?.database === "ok" ? "ok" : "danger"} />
        <MetricCard label="Redis" value={data?.redis ?? "..."} tone={data?.redis === "ok" ? "ok" : "warn"} />
        <MetricCard label="OpenSearch" value={data?.opensearch ?? "..."} />
      </div>
      <div className="grid metrics">
        <MetricCard label="Requests" value={data?.requests_recorded ?? 0} />
        <MetricCard label="Errores 5xx" value={data?.errors_recorded ?? 0} tone={(data?.errors_recorded ?? 0) > 0 ? "danger" : "ok"} />
        <MetricCard label="Jobs fallidos" value={data?.failed_report_jobs ?? 0} tone={(data?.failed_report_jobs ?? 0) > 0 ? "danger" : "ok"} />
        <MetricCard label="TTL cache" value={`${data?.cache_ttl_seconds ?? 0}s`} />
      </div>
      <section className="card">
        <table>
          <thead><tr><th>Componente</th><th>Estado</th></tr></thead>
          <tbody>
            <tr><td>RabbitMQ</td><td><span className="status">{data?.rabbitmq}</span></td></tr>
            <tr><td>MinIO</td><td><span className="status">{data?.minio}</span></td></tr>
            <tr><td>Ambiente</td><td><span className="status">{data?.environment}</span></td></tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
