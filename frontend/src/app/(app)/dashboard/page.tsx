"use client";

import Link from "next/link";
import { AlertTriangle, Bell, ClipboardList, FileWarning, RefreshCcw, Route, TimerReset } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { EmptyState, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type Dashboard = {
  total_documents: number;
  pending_transfers: number;
  incomplete_documents: number;
  expired_documents: number;
  active_users: number;
  activity_daily: number;
  trd_compliance: number;
  unread_notifications: number;
  risk_level: string;
  documents_by_status: Record<string, number>;
};

type AdvancedDashboard = {
  active_workflows: number;
  pending_tasks: number;
  overdue_tasks: number;
  active_transfer_batches: number;
  employees: number;
  active_contracts: number;
  operational_load: number;
  risk_level: string;
};

function riskTone(value?: string) {
  if (value === "Alto") return "danger";
  if (value === "Medio") return "warning";
  return "success";
}

export default function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get<Dashboard>("/analytics/dashboard")).data });
  const advanced = useQuery({ queryKey: ["advanced-dashboard"], queryFn: async () => (await api.get<AdvancedDashboard>("/analytics/advanced")).data });
  const data = dashboard.data;
  const ops = advanced.data;
  const loading = dashboard.isLoading || advanced.isLoading;
  const risk = ops?.risk_level ?? data?.risk_level ?? "Bajo";

  return (
    <>
      <PageHeader
        eyebrow="Operacion documental"
        title="Dashboard operacional"
        description="Prioriza vencimientos, custodia, transferencias, TRD y tareas que requieren accion."
        action={<button className="ghost" onClick={() => { dashboard.refetch(); advanced.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>}
      />

      {loading ? <LoadingSkeleton rows={4} /> : null}

      <div className="grid metrics">
        <MetricCard label="Riesgo documental" value={risk} tone={riskTone(risk)} cta="Revisar alertas" href="/audit" />
        <MetricCard label="Documentos custodiados" value={data?.total_documents ?? 0} tone="info" cta="Ver repositorio" href="/repository" />
        <MetricCard label="Tareas pendientes" value={ops?.pending_tasks ?? 0} tone={(ops?.pending_tasks ?? 0) > 0 ? "warning" : "success"} cta="Abrir bandeja" href="/tasks" />
        <MetricCard label="SLA vencidos" value={ops?.overdue_tasks ?? 0} tone={(ops?.overdue_tasks ?? 0) > 0 ? "danger" : "success"} cta="Gestionar hoy" href="/tasks" />
      </div>

      <div className="grid metrics">
        <MetricCard label="Transferencias activas" value={ops?.active_transfer_batches ?? data?.pending_transfers ?? 0} tone="warning" cta="Ver transferencias" href="/transfer-batches" />
        <MetricCard label="Expedientes incompletos" value={data?.incomplete_documents ?? 0} tone={(data?.incomplete_documents ?? 0) > 0 ? "danger" : "success"} cta="Completar metadata" href="/expedients" />
        <MetricCard label="Cumplimiento TRD" value={`${data?.trd_compliance ?? 0}%`} tone="success" cta="Ver TRD" href="/trd" />
        <MetricCard label="Notificaciones" value={data?.unread_notifications ?? 0} tone={(data?.unread_notifications ?? 0) > 0 ? "warning" : "neutral"} cta="Revisar centro" href="/notifications" />
      </div>

      <div className="split dashboard-split">
        <section className="card">
          <div className="toolbar space-between"><h2>Atencion requerida</h2><StatusBadge value={risk} tone={riskTone(risk)} /></div>
          <div className="timeline">
            {(ops?.overdue_tasks ?? 0) > 0 ? <TimelineEvent state="Vencido" tone="danger" title="Tareas con SLA vencido" description="Hay aprobaciones o revisiones que ya superaron el tiempo objetivo." meta={<Link href="/tasks">Abrir tareas</Link>} /> : null}
            {(data?.incomplete_documents ?? 0) > 0 ? <TimelineEvent state="Incompleto" tone="warning" title="Expedientes o documentos incompletos" description="Faltan folios, metadata o contexto archivistico obligatorio." meta={<Link href="/documents">Corregir</Link>} /> : null}
            {(data?.unread_notifications ?? 0) > 0 ? <TimelineEvent state="Pendiente" tone="info" title="Notificaciones accionables" description="Revisa tareas, transferencias, recepciones o alertas TRD pendientes." meta={<Link href="/notifications">Ver centro</Link>} /> : null}
            {!ops?.overdue_tasks && !data?.incomplete_documents && !data?.unread_notifications ? <EmptyState icon={<ClipboardList size={20} />} title="Operacion estable" description="No hay alertas criticas en este momento." /> : null}
          </div>
        </section>

        <section className="card">
          <div className="toolbar space-between"><h2>Estado documental</h2><StatusBadge value={`${data?.activity_daily ?? 0} hoy`} tone="info" /></div>
          {Object.keys(data?.documents_by_status ?? {}).length === 0 ? <EmptyState icon={<FileWarning size={20} />} title="Sin distribucion disponible" description="Cuando existan documentos, veras su estado operativo aqui." /> : null}
          <div className="data-table">
            <table>
              <thead><tr><th>Estado</th><th>Cantidad</th><th>Accion</th></tr></thead>
              <tbody>
                {Object.entries(data?.documents_by_status ?? {}).map(([status, count]) => (
                  <tr key={status}><td><StatusBadge value={status} /></td><td>{count}</td><td><Link className="inline-link" href="/documents">Ver documentos</Link></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="module-grid">
        <Link className="module-card" href="/kardex"><Route size={20} /><strong>Kardex vivo</strong><span className="muted">Movimientos, recepciones, rechazos y prestamos.</span></Link>
        <Link className="module-card" href="/tasks"><TimerReset size={20} /><strong>Bandeja operativa</strong><span className="muted">Aprobaciones, rechazos y SLA documental.</span></Link>
        <Link className="module-card" href="/notifications"><Bell size={20} /><strong>Alertas</strong><span className="muted">Centro de notificaciones accionables.</span></Link>
        <Link className="module-card" href="/audit"><AlertTriangle size={20} /><strong>Auditoria</strong><span className="muted">Eventos sensibles y trazabilidad de acceso.</span></Link>
      </section>
    </>
  );
}
