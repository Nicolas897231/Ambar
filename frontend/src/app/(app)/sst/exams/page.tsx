"use client";

import { HeartPulse, RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Exam = { idIncident: number; ps1010Identification: string; incident_type: string; description: string; created_at: string };

export default function SstExamsPage() {
  const exams = useQuery({ queryKey: ["sst-exams"], queryFn: async () => (await api.get<Exam[]>("/hr/sst/exams")).data });
  const items = exams.data ?? [];
  return (
    <>
      <PageTitle title="Examenes SST" description="Control documental de examenes medicos laborales asociados al expediente del empleado." action={<button className="ghost" onClick={() => exams.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <section className="metrics">
        <MetricCard label="Examenes registrados" value={items.length} tone="info" />
        <MetricCard label="Ingreso" value={items.filter((item) => item.incident_type === "examen_ingreso").length} tone="success" />
        <MetricCard label="Periodicos" value={items.filter((item) => item.incident_type === "examen_periodico").length} tone="neutral" />
        <MetricCard label="Retiro" value={items.filter((item) => item.incident_type === "examen_retiro").length} tone="neutral" />
      </section>
      <section className="card">
        <div className="toolbar space-between"><h2><HeartPulse size={18} /> Registro documental SST</h2><StatusBadge value="RRHH" tone="info" /></div>
        {exams.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!exams.isLoading && !items.length ? <EmptyState icon={<HeartPulse size={20} />} title="Sin examenes registrados" description="Los examenes aparecen cuando se registran como novedades/incidencias documentales del empleado." /> : null}
        {items.length ? (
          <DataTable>
            <table>
              <thead><tr><th>Empleado</th><th>Tipo</th><th>Descripcion</th><th>Fecha</th></tr></thead>
              <tbody>{items.map((item) => <tr key={item.idIncident}><td>{item.ps1010Identification}</td><td>{item.incident_type}</td><td>{item.description}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody>
            </table>
          </DataTable>
        ) : null}
      </section>
    </>
  );
}
