"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardList, ExternalLink, Play, RefreshCcw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "@/components/ui/enterprise";

type Task = {
  idTask: number;
  task_name: string;
  title?: string;
  description?: string | null;
  module?: string | null;
  archive_id?: number | null;
  assigned_to: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  priority: string;
  status: string;
  due_date: string;
  completed_at?: string | null;
  resolution_note?: string | null;
  action_url?: string | null;
};
type Summary = { pending: number; overdue: number; completed: number; rejected: number; critical: number };

const tabs = [
  { value: "active", label: "Mis pendientes" },
  { value: "overdue", label: "Vencidas" },
  { value: "completed", label: "Finalizadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "all", label: "Historial" }
];

function tone(value: string) {
  if (["overdue", "rejected", "critical"].includes(value)) return "danger" as const;
  if (["pending", "in_progress", "in_review", "high"].includes(value)) return "warning" as const;
  if (["completed", "approved"].includes(value)) return "success" as const;
  return "neutral" as const;
}

export default function TasksPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [resolution, setResolution] = useState("");
  const tasks = useQuery({ queryKey: ["tasks", status], queryFn: async () => (await api.get<Task[]>("/workflows/tasks", { params: { status } })).data });
  const summary = useQuery({ queryKey: ["tasks-summary"], queryFn: async () => (await api.get<Summary>("/workflows/tasks/summary")).data });
  const detail = useQuery({ queryKey: ["task-detail", selected?.idTask], enabled: Boolean(selected), queryFn: async () => (await api.get<Task>(`/workflows/tasks/${selected?.idTask}`)).data });
  const current = detail.data ?? selected;
  const action = useMutation({
    mutationFn: async ({ id, actionName, note }: { id: number; actionName: "start" | "complete" | "reject" | "cancel"; note?: string }) => {
      const payload = actionName === "reject" ? { status: "rejected", evidence: { reason: note }, resolution_note: note } : { evidence: { note }, resolution_note: note };
      return api.post(`/workflows/tasks/${id}/${actionName}`, payload);
    },
    onSuccess: () => {
      setResolution("");
      client.invalidateQueries({ queryKey: ["tasks"] });
      client.invalidateQueries({ queryKey: ["tasks-summary"] });
      client.invalidateQueries({ queryKey: ["task-detail"] });
      client.invalidateQueries({ queryKey: ["shell", "notifications"] });
    }
  });
  const checkOverdue = useMutation({ mutationFn: async () => api.post("/workflows/tasks/check-overdue"), onSuccess: () => { client.invalidateQueries({ queryKey: ["tasks"] }); client.invalidateQueries({ queryKey: ["tasks-summary"] }); } });

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (tasks.data ?? []).filter((item) => !text || `${item.task_name} ${item.module} ${item.status} ${item.related_entity_type}`.toLowerCase().includes(text));
  }, [tasks.data, search]);

  function rejectTask(task: Task) {
    const reason = window.prompt("Motivo del rechazo");
    if (!reason?.trim()) return;
    action.mutate({ id: task.idTask, actionName: "reject", note: reason.trim() });
  }

  return (
    <>
      <Breadcrumbs items={["Inicio", "Bandeja operativa"]} />
      <PageHeader
        eyebrow="Trabajo pendiente"
        title="Bandeja de tareas"
        description="Tareas operativas de recepcion, prestamos, FUID, expedientes, ubicaciones y flujos documentales."
        action={<div className="inline-actions"><button className="ghost" onClick={() => checkOverdue.mutate()}><ClipboardList size={17} /> Revisar vencidas</button><button className="ghost" onClick={() => tasks.refetch()}><RefreshCcw size={17} /> Actualizar</button></div>}
      />

      <section className="metrics">
        <MetricCard label="Pendientes" value={summary.data?.pending ?? 0} tone={(summary.data?.pending ?? 0) ? "warning" : "success"} />
        <MetricCard label="Vencidas" value={summary.data?.overdue ?? 0} tone={(summary.data?.overdue ?? 0) ? "danger" : "success"} />
        <MetricCard label="Criticas" value={summary.data?.critical ?? 0} tone={(summary.data?.critical ?? 0) ? "danger" : "neutral"} />
        <MetricCard label="Finalizadas" value={summary.data?.completed ?? 0} tone="success" />
      </section>

      <section className="card">
        <FilterBar>
          <div className="inline-actions">{tabs.map((tab) => <button key={tab.value} className={status === tab.value ? "secondary" : "ghost"} type="button" onClick={() => setStatus(tab.value)}>{tab.label}</button>)}</div>
          <label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Modulo, entidad, estado..." /></span></label>
        </FilterBar>
        {tasks.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!tasks.isLoading && rows.length === 0 ? <EmptyState icon={<ClipboardList size={20} />} title="No hay tareas pendientes" description="Todo esta al dia para esta bandeja." /> : null}
        <DataTable>
          <table>
            <thead><tr><th>Tarea</th><th>Modulo</th><th>Entidad</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {rows.map((item) => {
                const actionable = ["pending", "in_progress", "in_review", "overdue"].includes(item.status);
                return (
                  <tr key={item.idTask}>
                    <td><strong>{item.task_name}</strong><p className="muted">{item.description ?? "Tarea operativa AMBAR"}</p></td>
                    <td>{item.module ?? "workflow"}</td>
                    <td>{item.related_entity_type ? `${item.related_entity_type} #${item.related_entity_id}` : "-"}</td>
                    <td>{new Date(item.due_date).toLocaleString("es-CO")}</td>
                    <td><StatusBadge value={item.status} tone={tone(item.status)} /></td>
                    <td className="inline-actions">
                      <button className="ghost" onClick={() => setSelected(item)}>Detalle</button>
                      {item.action_url ? <Link className="ghost" href={item.action_url}>Abrir <ExternalLink size={14} /></Link> : null}
                      {actionable ? <button className="ghost" onClick={() => action.mutate({ id: item.idTask, actionName: "complete", note: "Resuelta desde bandeja operativa." })}><CheckCircle2 size={16} /> Resolver</button> : null}
                      {actionable ? <button className="ghost danger" onClick={() => rejectTask(item)}><XCircle size={16} /> Rechazar</button> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      </section>

      <DetailDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={current?.task_name ?? "Tarea"} subtitle={current ? `${current.module ?? "workflow"} - ${current.status}` : undefined}>
        {current ? (
          <div className="form-grid">
            <div className="module-grid">
              <MetricCard label="Prioridad" value={current.priority} tone={tone(current.priority)} />
              <MetricCard label="Estado" value={current.status} tone={tone(current.status)} />
              <MetricCard label="Vence" value={new Date(current.due_date).toLocaleString("es-CO")} />
            </div>
            <section className="card"><h3>Contexto</h3><p className="muted">{current.description ?? "Sin descripcion adicional."}</p>{current.action_url ? <Link className="inline-link" href={current.action_url}>Abrir entidad <ExternalLink size={14} /></Link> : null}</section>
            {["pending", "in_progress", "in_review", "overdue"].includes(current.status) ? (
              <section className="card">
                <h3>Resolver</h3>
                <label>Nota de resolucion<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Describe que se corrigio o que queda pendiente" /></label>
                <div className="inline-actions">
                  <button onClick={() => action.mutate({ id: current.idTask, actionName: "start", note: "Tarea tomada en gestion." })}><Play size={16} /> Iniciar</button>
                  <button onClick={() => action.mutate({ id: current.idTask, actionName: "complete", note: resolution || "Tarea completada." })}><CheckCircle2 size={16} /> Completar</button>
                  <button className="ghost danger" onClick={() => rejectTask(current)}><XCircle size={16} /> Rechazar</button>
                </div>
              </section>
            ) : <EmptyState icon={<CheckCircle2 size={20} />} title="Tarea cerrada" description={current.resolution_note ?? "La tarea salio de pendientes y queda en historial."} />}
          </div>
        ) : null}
      </DetailDrawer>
    </>
  );
}
