"use client";

import { FormEvent, useState } from "react";
import { Play, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Workflow = { idWorkflow: number; workflow_name: string; module: string; active: boolean };

export default function WorkflowsPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [module, setModule] = useState("documents");
  const [workflowId, setWorkflowId] = useState("");
  const [entityType, setEntityType] = useState("document");
  const [entityId, setEntityId] = useState("");
  const workflows = useQuery({ queryKey: ["workflows"], queryFn: async () => (await api.get<Workflow[]>("/workflows")).data });
  const create = useMutation({ mutationFn: async () => api.post("/workflows", { workflow_name: name, module }), onSuccess: () => { setName(""); client.invalidateQueries({ queryKey: ["workflows"] }); } });
  const start = useMutation({ mutationFn: async () => api.post(`/workflows/${workflowId}/start`, { entity_type: entityType, entity_id: entityId, assignee_identification: "1000000000" }), onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }) });
  function submitCreate(event: FormEvent) { event.preventDefault(); create.mutate(); }
  function submitStart(event: FormEvent) { event.preventDefault(); start.mutate(); }
  return (
    <>
      <PageTitle title="Workflows" description="Flujos de aprobacion, instancias y automatizacion documental." action={<button className="ghost" onClick={() => workflows.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Nuevo workflow</h2>
          <form className="form-grid" onSubmit={submitCreate}>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Modulo<input value={module} onChange={(event) => setModule(event.target.value)} required /></label>
            <button><Plus size={17} /> Crear</button>
          </form>
          <h2>Iniciar instancia</h2>
          <form className="form-grid" onSubmit={submitStart}>
            <label>Workflow<select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} required><option value="">Seleccionar</option>{workflows.data?.map((item) => <option key={item.idWorkflow} value={item.idWorkflow}>{item.workflow_name}</option>)}</select></label>
            <label>Entidad<input value={entityType} onChange={(event) => setEntityType(event.target.value)} required /></label>
            <label>ID entidad<input value={entityId} onChange={(event) => setEntityId(event.target.value)} required /></label>
            <button><Play size={17} /> Iniciar</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Workflow</th><th>Modulo</th><th>Estado</th></tr></thead>
            <tbody>{workflows.data?.map((item) => <tr key={item.idWorkflow}><td>{item.workflow_name}</td><td>{item.module}</td><td><span className="status">{item.active ? "activo" : "inactivo"}</span></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
