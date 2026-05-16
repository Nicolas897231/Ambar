"use client";

import { RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Audit = { idAudit: number; action: string; module: string; entity: string | null; entity_id: string | null; ps405Identification: string | null; ip_address: string | null; created_at: string };

export default function AuditPage() {
  const query = useQuery({ queryKey: ["audit"], queryFn: async () => (await api.get<Audit[]>("/audit/logs")).data });
  return (
    <>
      <PageTitle title="Auditoria" description="Trazabilidad de acciones, seguridad y cambios de registros." action={<button className="ghost" onClick={() => query.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <section className="card">
        <table>
          <thead><tr><th>Fecha</th><th>Modulo</th><th>Accion</th><th>Entidad</th><th>Usuario</th><th>IP</th></tr></thead>
          <tbody>{query.data?.map((item) => <tr key={item.idAudit}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.module}</td><td>{item.action}</td><td>{item.entity ?? "-"} {item.entity_id ?? ""}</td><td>{item.ps405Identification ?? "-"}</td><td>{item.ip_address ?? "-"}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
