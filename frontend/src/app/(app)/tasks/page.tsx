"use client";

import { CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Task = { idTask: number; task_name: string; status: string; due_date: string };

const tabs = [
  { value: "active", label: "Mis pendientes" },
  { value: "approved", label: "Aprobadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "all", label: "Todas" }
];

export default function TasksPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState("active");
  const [message, setMessage] = useState("");
  const tasks = useQuery({ queryKey: ["tasks", status], queryFn: async () => (await api.get<Task[]>(`/workflows/tasks?status=${status}`)).data });
  const action = useMutation({
    mutationFn: async ({ id, nextStatus, reason }: { id: number; nextStatus: string; reason?: string }) => api.patch(`/workflows/tasks/${id}`, { status: nextStatus, evidence: { source: "ui", reason } }),
    onSuccess: (_data, variables) => {
      setMessage(variables.nextStatus === "approved" ? "Tarea aprobada correctamente." : "Tarea rechazada y retirada de pendientes.");
      client.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => setMessage("No fue posible actualizar la tarea.")
  });

  function rejectTask(id: number) {
    const reason = window.prompt("Motivo del rechazo");
    if (!reason?.trim()) {
      setMessage("El rechazo exige motivo.");
      return;
    }
    action.mutate({ id, nextStatus: "rejected", reason: reason.trim() });
  }

  return (
    <>
      <PageTitle title="Bandeja de tareas" description="Pendientes, aprobaciones, vencimientos y SLA operativos." action={<button className="ghost" onClick={() => tasks.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}
      <section className="card">
        <div className="toolbar">
          {tabs.map((tab) => <button key={tab.value} className={status === tab.value ? "secondary" : "ghost"} type="button" onClick={() => setStatus(tab.value)}>{tab.label}</button>)}
        </div>
      </section>
      <section className="card">
        <table>
          <thead><tr><th>Tarea</th><th>Estado</th><th>Vence</th><th>Accion</th></tr></thead>
          <tbody>
            {tasks.data?.map((item) => {
              const actionable = ["pending", "in_progress", "overdue"].includes(item.status);
              return (
                <tr key={item.idTask}>
                  <td>{item.task_name}</td>
                  <td><span className="status">{item.status}</span></td>
                  <td>{new Date(item.due_date).toLocaleString()}</td>
                  <td className="toolbar">
                    {actionable ? (
                      <>
                        <button className="ghost" onClick={() => action.mutate({ id: item.idTask, nextStatus: "approved" })}><CheckCircle2 size={16} /> Aprobar</button>
                        <button className="ghost danger" onClick={() => rejectTask(item.idTask)}><XCircle size={16} /> Rechazar</button>
                      </>
                    ) : <span className="muted">Cerrada</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tasks.isLoading && !tasks.data?.length ? <p className="muted">No hay tareas en esta bandeja.</p> : null}
      </section>
    </>
  );
}
