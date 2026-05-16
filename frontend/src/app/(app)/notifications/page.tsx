"use client";

import { Check, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Notification = { idNotification: number; message: string; module?: string; type?: string; status?: string; read_status?: boolean; action_url: string | null; created_at: string };

export default function NotificationsPage() {
  const client = useQueryClient();
  const basic = useQuery({ queryKey: ["notifications"], queryFn: async () => (await api.get<Notification[]>("/notifications")).data });
  const advanced = useQuery({ queryKey: ["advanced-notifications"], queryFn: async () => (await api.get<Notification[]>("/notifications/advanced")).data });
  const readBasic = useMutation({ mutationFn: async (id: number) => api.patch(`/notifications/${id}/read`), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  const readAdvanced = useMutation({ mutationFn: async (id: number) => api.patch(`/notifications/advanced/${id}/read`), onSuccess: () => client.invalidateQueries({ queryKey: ["advanced-notifications"] }) });
  const rows = [...(advanced.data ?? []), ...(basic.data ?? [])];
  return (
    <>
      <PageTitle title="Notificaciones" description="Alertas accionables de workflows, RRHH, transferencias, reportes y vencimientos." action={<button className="ghost" onClick={() => { basic.refetch(); advanced.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>} />
      <section className="card">
        <table>
          <thead><tr><th>Modulo</th><th>Mensaje</th><th>Estado</th><th>Fecha</th><th>Accion</th></tr></thead>
          <tbody>{rows.map((item) => {
            const isAdvanced = Boolean(item.module);
            return <tr key={`${isAdvanced ? "a" : "b"}-${item.idNotification}`}><td>{item.module ?? item.type ?? "in_app"}</td><td>{item.message}</td><td><span className="status">{item.status ?? (item.read_status ? "read" : "pending")}</span></td><td>{new Date(item.created_at).toLocaleString()}</td><td><button className="ghost" onClick={() => isAdvanced ? readAdvanced.mutate(item.idNotification) : readBasic.mutate(item.idNotification)}><Check size={16} /> Revisar</button></td></tr>;
          })}</tbody>
        </table>
      </section>
    </>
  );
}