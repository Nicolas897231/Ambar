"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Task = { idTask: number; task_name: string; status: string; due_date: string };

export default function TasksPage() {
  const client = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get<Task[]>("/workflows/tasks")).data });
  const action = useMutation({ mutationFn: async ({ id, status }: { id: number; status: string }) => api.patch(`/workflows/tasks/${id}`, { status, evidence: { source: "ui" } }), onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }) });
  return (
    <>
      <PageTitle title="Bandeja de tareas" description="Pendientes, aprobaciones, vencimientos y SLA operativos." />
      <section className="card">
        <table>
          <thead><tr><th>Tarea</th><th>Estado</th><th>Vence</th><th>Accion</th></tr></thead>
          <tbody>{tasks.data?.map((item) => <tr key={item.idTask}><td>{item.task_name}</td><td><span className="status">{item.status}</span></td><td>{new Date(item.due_date).toLocaleString()}</td><td className="toolbar"><button className="ghost" onClick={() => action.mutate({ id: item.idTask, status: "approved" })}><CheckCircle2 size={16} /> Aprobar</button><button className="ghost" onClick={() => action.mutate({ id: item.idTask, status: "rejected" })}><XCircle size={16} /> Rechazar</button></td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
