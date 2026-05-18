"use client";

import { RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

export default function Page() {
  const query = useQuery({ queryKey: ["loans"], queryFn: async () => (await api.get("/archives/kardex")).data });
  const rows = Array.isArray(query.data) ? query.data : [];
  return <><div className="breadcrumbs"><span>Custodia Documental</span><span>Prestamos</span></div><PageTitle title="Prestamos" description="Prestamos documentales activos, vencidos, retornados y evidencias." action={<button className="ghost" onClick={() => query.refetch()}><RefreshCcw size={17} /> Actualizar</button>} /><section className="card"><div className="toolbar space-between"><span className="status">Registros: {rows.length}</span><span className="muted">Modulo conectado a la base SGDEA.</span></div><pre style={{ whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 420 }}>{JSON.stringify(query.data ?? {}, null, 2)}</pre></section></>;
}
