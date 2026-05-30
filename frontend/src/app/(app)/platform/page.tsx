"use client";

import { Activity, Database, FileCheck2, RefreshCcw, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
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

function serviceTone(value?: string) {
  return value === "ok" ? "success" as const : value ? "warning" as const : "neutral" as const;
}

export default function PlatformPage() {
  const query = useQuery({ queryKey: ["platform"], queryFn: async () => (await api.get<Platform>("/platform/technical-dashboard")).data });
  const data = query.data;
  const services = [
    ["API", "ok"],
    ["PostgreSQL/MySQL", data?.database],
    ["Redis", data?.redis],
    ["RabbitMQ", data?.rabbitmq],
    ["MinIO/S3", data?.minio],
    ["OpenSearch", data?.opensearch]
  ];

  return (
    <>
      <PageTitle title="AMBAR" description="Plataforma SGDEA Enterprise para operacion documental, seguridad, trazabilidad y custodia." action={<button className="ghost" onClick={() => query.refetch()}><RefreshCcw size={17} /> Actualizar estado</button>} />

      <section className="platform-hero card">
        <div>
          <span className="eyebrow">Acerca de</span>
          <h2>Infraestructura archivistica enterprise moderna</h2>
          <p className="muted">AMBAR combina operacion documental, permisos por archivo, auditoria, repositorio seguro y trazabilidad para soportar un SGDEA empresarial compacto y listo para crecer.</p>
          <div className="inline-actions">
            <StatusBadge value="Ley 594" tone="success" />
            <StatusBadge value="AGN" tone="success" />
            <StatusBadge value="SGDEA" tone="info" />
            <StatusBadge value="TRD/FUID preparado" tone="neutral" />
          </div>
        </div>
        <div className="platform-signal">
          <Sparkles size={26} />
          <strong>AMBAR 2.0</strong>
          <span>Fundacion operacional enterprise</span>
        </div>
      </section>

      <section className="metrics">
        <MetricCard label="Nodo activo" value={data?.node ?? "..."} tone="info" />
        <MetricCard label="Ambiente" value={data?.environment ?? "..."} tone="neutral" />
        <MetricCard label="Requests" value={data?.requests_recorded ?? 0} tone="neutral" />
        <MetricCard label="Errores 5xx" value={data?.errors_recorded ?? 0} tone={(data?.errors_recorded ?? 0) > 0 ? "danger" : "success"} />
      </section>

      <div className="workspace-grid">
        <section className="card">
          <h2><FileCheck2 size={18} /> Cumplimiento</h2>
          <div className="checklist">
            {["Ley 594", "AGN", "SGDEA", "TRD", "FUID", "Auditoria"].map((item) => <span className="status" key={item}><ShieldCheck size={14} /> {item}</span>)}
          </div>
        </section>
        <section className="card">
          <h2><Workflow size={18} /> Arquitectura</h2>
          <div className="checklist">
            {["FastAPI", "React/Next.js", "PostgreSQL/MySQL", "Redis", "RabbitMQ", "MinIO/S3"].map((item) => <span className="status" key={item}>{item}</span>)}
          </div>
        </section>
        <section className="card">
          <h2><Database size={18} /> Diferenciales</h2>
          <div className="checklist">
            {["Velocidad operacional", "Multiarchivo", "Trazabilidad", "Seguridad por accion", "Auditoria exportable"].map((item) => <span className="status" key={item}>{item}</span>)}
          </div>
        </section>
      </div>

      <section className="card" id="security">
        <div className="toolbar space-between"><h2><Activity size={18} /> Estado sistema</h2><StatusBadge value={query.isFetching ? "actualizando" : "monitoreado"} tone={query.isFetching ? "info" : "success"} /></div>
        {query.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!query.isLoading ? (
          <div className="service-grid">
            {services.map(([label, state]) => <article className="service-card" key={label ?? "service"}><strong>{label}</strong><StatusBadge value={state ?? "sin dato"} tone={serviceTone(state)} /></article>)}
          </div>
        ) : null}
        {!query.isLoading && !data ? <EmptyState title="Sin telemetria" description="No fue posible leer el estado tecnico en este momento." /> : null}
      </section>
    </>
  );
}
