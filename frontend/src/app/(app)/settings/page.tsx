"use client";

import Link from "next/link";
import { FilePenLine, Link2, PlugZap, ServerCog, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Platform = { environment: string; database: string; redis: string; rabbitmq: string; minio: string; opensearch: string; failed_report_jobs: number; errors_recorded: number };

export default function SettingsPage() {
  const platform = useQuery({ queryKey: ["settings-platform"], queryFn: async () => (await api.get<Platform>("/platform/technical-dashboard")).data });
  const data = platform.data;
  return (
    <>
      <PageTitle title="Configuracion" description="Capacidades transversales de plataforma sin volverlas protagonistas de la operacion diaria." action={<Link className="ghost" href="/platform">Acerca de AMBAR</Link>} />
      <section className="metrics">
        <MetricCard label="Ambiente" value={data?.environment ?? "..."} tone="neutral" />
        <MetricCard label="Base de datos" value={data?.database ?? "..."} tone={data?.database === "ok" ? "success" : "warning"} />
        <MetricCard label="Redis" value={data?.redis ?? "..."} tone={data?.redis === "ok" ? "success" : "warning"} />
        <MetricCard label="Errores" value={data?.errors_recorded ?? 0} tone={(data?.errors_recorded ?? 0) ? "danger" : "success"} />
      </section>
      {platform.isLoading ? <LoadingSkeleton rows={4} /> : null}
      <section className="workspace-grid">
        <article className="workspace-card"><div className="toolbar space-between"><strong><PlugZap size={17} /> Integraciones</strong><StatusBadge value="transversal" tone="neutral" /></div><p className="muted">Conectores externos para capacidades futuras.</p><Link className="inline-link" href="/integrations">Abrir integraciones</Link></article>
        <article className="workspace-card"><div className="toolbar space-between"><strong><Link2 size={17} /> Webhooks</strong><StatusBadge value="controlado" tone="neutral" /></div><p className="muted">Eventos salientes con seguridad y auditoria.</p><Link className="inline-link" href="/webhooks">Abrir webhooks</Link></article>
        <article className="workspace-card"><div className="toolbar space-between"><strong><FilePenLine size={17} /> Firmas</strong><StatusBadge value="capacidad" tone="info" /></div><p className="muted">Firma simple y preparacion de firma avanzada sin contaminar documentos.</p><Link className="inline-link" href="/signatures">Abrir firmas</Link></article>
        <article className="workspace-card"><div className="toolbar space-between"><strong><Workflow size={17} /> Automatizacion</strong><StatusBadge value="operacional" tone="neutral" /></div><p className="muted">Flujos internos de tareas y notificaciones accionables.</p><Link className="inline-link" href="/workflows">Abrir automatizacion</Link></article>
        <article className="workspace-card"><div className="toolbar space-between"><strong><ServerCog size={17} /> Estado tecnico</strong><StatusBadge value={data?.minio === "ok" ? "ok" : "revisar"} tone={data?.minio === "ok" ? "success" : "warning"} /></div><p className="muted">API, Redis, RabbitMQ, MinIO y OpenSearch.</p><Link className="inline-link" href="/platform">Ver estado</Link></article>
      </section>
    </>
  );
}
