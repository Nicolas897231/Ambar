"use client";

import Link from "next/link";
import { Bell, Check, ExternalLink, RefreshCcw, Search, ShieldAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "@/components/ui/enterprise";

type Notification = {
  idNotification: number;
  title?: string;
  message: string;
  module?: string;
  priority?: "low" | "normal" | "high" | "critical";
  status?: string;
  archive_name?: string | null;
  action_label?: string | null;
  action_url: string | null;
  created_at: string;
};
type Summary = { unread: number; action_required: number; critical: number; resolved: number; by_module: Record<string, number> };

function tone(value?: string) {
  if (value === "critical") return "danger" as const;
  if (value === "high") return "warning" as const;
  if (value === "resolved" || value === "dismissed") return "neutral" as const;
  return value === "action_required" ? "info" as const : "neutral" as const;
}

export default function NotificationsPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const notifications = useQuery({ queryKey: ["notifications", status, priority], queryFn: async () => (await api.get<Notification[]>("/notifications", { params: { status: status || undefined, priority: priority || undefined, include_resolved: status === "resolved" } })).data });
  const summary = useQuery({ queryKey: ["notifications-summary"], queryFn: async () => (await api.get<Summary>("/notifications/summary")).data });
  const mutate = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "read" | "resolve" | "dismiss" }) => api.post(`/notifications/${id}/${action}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["notifications"] });
      client.invalidateQueries({ queryKey: ["notifications-summary"] });
      client.invalidateQueries({ queryKey: ["shell", "notifications"] });
    }
  });
  const rebuild = useMutation({
    mutationFn: async () => api.post("/notifications/rebuild-operational-alerts"),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["notifications"] });
      client.invalidateQueries({ queryKey: ["notifications-summary"] });
      client.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (notifications.data ?? []).filter((item) => !text || `${item.title} ${item.message} ${item.module} ${item.archive_name}`.toLowerCase().includes(text));
  }, [notifications.data, search]);

  return (
    <>
      <Breadcrumbs items={["Plataforma", "Notificaciones"]} />
      <PageHeader
        eyebrow="Centro de trabajo"
        title="Notificaciones accionables"
        description="Pocas alertas, con contexto y accion directa para recepciones, prestamos, FUID, expedientes y tareas."
        action={<div className="inline-actions"><button className="ghost" type="button" onClick={() => rebuild.mutate()}><ShieldAlert size={17} /> Reconstruir alertas</button><button className="ghost" onClick={() => notifications.refetch()}><RefreshCcw size={17} /> Actualizar</button></div>}
      />

      <section className="metrics">
        <MetricCard label="Requieren accion" value={summary.data?.action_required ?? 0} tone={(summary.data?.action_required ?? 0) ? "warning" : "success"} cta="Abrir y resolver" />
        <MetricCard label="Criticas" value={summary.data?.critical ?? 0} tone={(summary.data?.critical ?? 0) ? "danger" : "success"} cta="Prioridad alta" />
        <MetricCard label="No leidas" value={summary.data?.unread ?? 0} tone={(summary.data?.unread ?? 0) ? "info" : "neutral"} cta="Centro limpio" />
        <MetricCard label="Resueltas" value={summary.data?.resolved ?? 0} tone="success" cta="Historial" />
      </section>

      <section className="card">
        <FilterBar>
          <label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Modulo, archivo, mensaje..." /></span></label>
          <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Activas</option><option value="action_required">Requiere accion</option><option value="read">Leidas</option><option value="resolved">Resueltas</option><option value="dismissed">Descartadas</option></select></label>
          <label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option><option value="critical">Critica</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label>
        </FilterBar>
        {notifications.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!notifications.isLoading && rows.length === 0 ? <EmptyState icon={<Bell size={20} />} title="Todo esta al dia" description="No hay alertas accionables con estos filtros." /> : null}
        <DataTable>
          <table>
            <thead><tr><th>Prioridad</th><th>Alerta</th><th>Modulo</th><th>Archivo</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.idNotification}>
                  <td><StatusBadge value={item.priority ?? "normal"} tone={tone(item.priority)} /></td>
                  <td><strong>{item.title ?? item.message}</strong><p className="muted">{item.message}</p></td>
                  <td>{item.module ?? "AMBAR"}</td>
                  <td>{item.archive_name ?? "-"}</td>
                  <td><StatusBadge value={item.status ?? "unread"} tone={tone(item.status)} /></td>
                  <td className="inline-actions">
                    {item.action_url ? <Link className="ghost" href={item.action_url}>{item.action_label ?? "Abrir"} <ExternalLink size={14} /></Link> : null}
                    <button className="ghost" onClick={() => mutate.mutate({ id: item.idNotification, action: "read" })}><Check size={15} /> Leida</button>
                    <button className="ghost" onClick={() => mutate.mutate({ id: item.idNotification, action: "resolve" })}>Resolver</button>
                    <button className="ghost danger" onClick={() => mutate.mutate({ id: item.idNotification, action: "dismiss" })}><XCircle size={15} /> Descartar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </section>
    </>
  );
}
