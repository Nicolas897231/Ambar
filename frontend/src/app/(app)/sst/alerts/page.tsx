"use client";

import Link from "next/link";
import { Activity, RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Alert = { employee: string; full_name: string; department: string; alert: string; priority: "low" | "normal" | "high" | "critical" };

export default function SstAlertsPage() {
  const alerts = useQuery({ queryKey: ["sst-alerts"], queryFn: async () => (await api.get<Alert[]>("/hr/sst/alerts")).data });
  const items = alerts.data ?? [];
  return (
    <>
      <PageTitle title="Alertas SST" description="Pendientes documentales SST que bloquean cumplimiento laboral." action={<button className="ghost" onClick={() => alerts.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <section className="metrics">
        <MetricCard label="Alertas activas" value={items.length} tone={items.length ? "warning" : "success"} />
        <MetricCard label="Criticas" value={items.filter((item) => item.priority === "critical").length} tone="danger" />
        <MetricCard label="Altas" value={items.filter((item) => item.priority === "high").length} tone="warning" />
        <MetricCard label="Fuente" value="Checklist" tone="neutral" />
      </section>
      <section className="card">
        <div className="toolbar space-between"><h2><Activity size={18} /> Pendientes SST</h2><StatusBadge value="accionable" tone={items.length ? "warning" : "success"} /></div>
        {alerts.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!alerts.isLoading && !items.length ? <EmptyState icon={<Activity size={20} />} title="Todo al dia" description="No hay alertas SST pendientes para los empleados activos." /> : null}
        {items.length ? (
          <DataTable>
            <table>
              <thead><tr><th>Empleado</th><th>Dependencia</th><th>Alerta</th><th>Prioridad</th><th>Accion</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.employee}-${item.alert}`}>
                    <td>{item.full_name}</td>
                    <td>{item.department}</td>
                    <td>{item.alert}</td>
                    <td><StatusBadge value={item.priority} tone={item.priority === "critical" ? "danger" : "warning"} /></td>
                    <td><Link className="inline-link" href={`/hr?view=expedients&employee=${item.employee}`}>Abrir expediente</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : null}
      </section>
    </>
  );
}
