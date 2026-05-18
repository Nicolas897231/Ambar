"use client";

import { RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Dashboard = { archives: number; documents: number; expedients: number; pending_movements: number; overdue_loans: number; by_archive: { idArchive: number; archive_name: string; documents: number; expedients: number; boxes: number }[] };

export default function CustodyPage() {
  const dashboard = useQuery({ queryKey: ["custody-dashboard"], queryFn: async () => (await api.get<Dashboard>("/archives/dashboard")).data });
  return <><div className="breadcrumbs"><span>Custodia Documental</span><span>Dashboard</span></div><PageTitle title="Dashboard custodia" description="Indicadores operativos por archivo, sede y flujo documental." action={<button className="ghost" onClick={() => dashboard.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
    <section className="kpi-band"><div className="kpi"><span>Archivos</span><strong>{dashboard.data?.archives ?? 0}</strong></div><div className="kpi"><span>Documentos</span><strong>{dashboard.data?.documents ?? 0}</strong></div><div className="kpi"><span>Expedientes</span><strong>{dashboard.data?.expedients ?? 0}</strong></div><div className="kpi"><span>Movimientos pendientes</span><strong>{dashboard.data?.pending_movements ?? 0}</strong></div><div className="kpi"><span>Prestamos vencidos</span><strong>{dashboard.data?.overdue_loans ?? 0}</strong></div></section>
    <section className="card table-card"><table><thead><tr><th>Archivo</th><th>Documentos</th><th>Expedientes</th><th>Cajas</th></tr></thead><tbody>{dashboard.data?.by_archive.map((item) => <tr key={item.idArchive}><td>{item.archive_name}</td><td>{item.documents}</td><td>{item.expedients}</td><td>{item.boxes}</td></tr>)}</tbody></table></section></>;
}
