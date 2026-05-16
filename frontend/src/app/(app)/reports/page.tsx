"use client";

import { Download, FileSpreadsheet, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ReportJob = {
  idJob: number;
  report_type: string;
  status: string;
  generated_file: string | null;
  created_at: string;
};

const reportTypes = [
  { key: "operational", label: "Operativo" },
  { key: "executive", label: "Ejecutivo" },
  { key: "audit", label: "Auditoria" },
  { key: "compliance", label: "Cumplimiento" },
  { key: "hr", label: "RRHH" }
];

export default function ReportsPage() {
  const client = useQueryClient();
  const jobs = useQuery({
    queryKey: ["reports"],
    queryFn: async () => (await api.get<ReportJob[]>("/reports/jobs")).data
  });
  const create = useMutation({
    mutationFn: async (report_type: string) => api.post("/reports/jobs", { report_type }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["reports"] })
  });
  const download = useMutation({
    mutationFn: async (id: number) => (await api.get<{ download_url: string }>(`/reports/jobs/${id}/download`)).data,
    onSuccess: (data) => alert(`Archivo generado: ${data.download_url}`)
  });

  return (
    <>
      <PageTitle
        title="Reportes"
        description="Reportes operativos, ejecutivos, auditoria, cumplimiento y RRHH."
        action={
          <button className="ghost" type="button" onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
            <RefreshCcw size={17} /> Actualizar
          </button>
        }
      />

      <section className="card">
        <div className="toolbar">
          {reportTypes.map((type) => (
            <button
              key={type.key}
              className="ghost"
              type="button"
              onClick={() => create.mutate(type.key)}
              disabled={create.isPending}
            >
              <FileSpreadsheet size={16} /> {type.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        {jobs.isLoading ? <p className="muted">Cargando reportes...</p> : null}
        {jobs.isError ? <p className="status danger">No se pudieron cargar los reportes.</p> : null}
        <table>
          <thead>
            <tr><th>ID</th><th>Tipo</th><th>Estado</th><th>Creado</th><th>Accion</th></tr>
          </thead>
          <tbody>
            {jobs.data?.map((item) => (
              <tr key={item.idJob}>
                <td>{item.idJob}</td>
                <td>{item.report_type}</td>
                <td><span className="status">{item.status}</span></td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>
                  <button className="ghost" type="button" onClick={() => download.mutate(item.idJob)}>
                    <Download size={16} /> Descargar
                  </button>
                </td>
              </tr>
            ))}
            {jobs.data?.length === 0 ? (
              <tr><td colSpan={5}>No hay reportes generados.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}