"use client";

import { FormEvent, useState } from "react";
import { PlugZap, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Integration = { idIntegration: number; integration_name: string; integration_type: string; status: string };

export default function IntegrationsPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("generic_rest");
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: async () => (await api.get<Integration[]>("/integrations")).data });
  const create = useMutation({ mutationFn: async () => api.post("/integrations", { integration_name: name, integration_type: type, config_data: { mode: "queued" } }), onSuccess: () => { setName(""); client.invalidateQueries({ queryKey: ["integrations"] }); } });
  const sync = useMutation({ mutationFn: async (id: number) => api.post(`/integrations/${id}/sync`, { entity_type: "document", entity_id: "manual", payload: { source: "ui" } }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="Integraciones ERP/API" description="Adapters desacoplados para ERP, nomina, RRHH y sistemas externos." action={<button className="ghost" onClick={() => integrations.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Nueva integracion</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}><option value="generic_rest">Generic REST</option><option value="sap">SAP</option><option value="odoo">Odoo</option><option value="dynamics">Dynamics</option><option value="siigo">SIIGO</option><option value="payroll">Payroll</option></select></label>
            <button><PlugZap size={17} /> Crear</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Accion</th></tr></thead>
            <tbody>{integrations.data?.map((item) => <tr key={item.idIntegration}><td>{item.integration_name}</td><td>{item.integration_type}</td><td><span className="status">{item.status}</span></td><td><button className="ghost" onClick={() => sync.mutate(item.idIntegration)}>Sincronizar</button></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
