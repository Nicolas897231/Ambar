"use client";

import { RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { MetricCard } from "@/components/ui/metric-card";
import { PageTitle } from "@/components/ui/page-title";

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

export default function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get<Dashboard>("/analytics/dashboard")).data });
  const advanced = useQuery({ queryKey: ["advanced-dashboard"], queryFn: async () => (await api.get<AdvancedDashboard>("/analytics/advanced")).data });
  const data = dashboard.data;
  const ops = advanced.data;
  return (
    <>
      <PageTitle
        title="Dashboard ejecutivo"
        description="Riesgo, cumplimiento, workflows, tareas, RRHH y custodia operativa."
        action={<button className="ghost" onClick={() => { dashboard.refetch(); advanced.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>}
      />
      <div className="grid metrics">
        <MetricCard label="Riesgo documental" value={ops?.risk_level ?? data?.risk_level ?? "..."} tone={(ops?.risk_level ?? data?.risk_level) === "Alto" ? "danger" : (ops?.risk_level ?? data?.risk_level) === "Medio" ? "warn" : "ok"} />
        <MetricCard label="Documentos" value={data?.total_documents ?? 0} />
        <MetricCard label="Workflows activos" value={ops?.active_workflows ?? 0} tone="warn" />
        <MetricCard label="Cumplimiento TRD" value={`${data?.trd_compliance ?? 0}%`} tone="ok" />
      </div>
      <div className="grid metrics">
        <MetricCard label="Tareas pendientes" value={ops?.pending_tasks ?? 0} tone="warn" />
        <MetricCard label="SLA vencidos" value={ops?.overdue_tasks ?? 0} tone="danger" />
        <MetricCard label="Lotes activos" value={ops?.active_transfer_batches ?? 0} />
        <MetricCard label="Empleados activos" value={ops?.employees ?? 0} />
      </div>
      <div className="grid metrics">
        <MetricCard label="Expedientes incompletos" value={data?.incomplete_documents ?? 0} tone="danger" />
        <MetricCard label="Contratos activos" value={ops?.active_contracts ?? 0} />
        <MetricCard label="Actividad diaria" value={data?.activity_daily ?? 0} />
        <MetricCard label="Notificaciones" value={data?.unread_notifications ?? 0} />
      </div>
      <section className="card">
        <h2>Distribucion por estado</h2>
        <table>
          <thead><tr><th>Estado</th><th>Cantidad</th></tr></thead>
          <tbody>
            {Object.entries(data?.documents_by_status ?? {}).map(([status, count]) => (
              <tr key={status}><td>{status}</td><td>{count}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}