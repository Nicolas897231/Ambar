"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type UserItem = { identification: string; name: string; email: string; status: string; roles: string[] };

export default function UsersPage() {
  const client = useQueryClient();
  const [identification, setIdentification] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState("ChangeMe123!");
  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<UserItem[]>("/users")).data });
  const create = useMutation({
    mutationFn: async () => api.post("/users", { identification, name, email, password, role_names: [role], company_id: "default", location_id: 1 }),
    onSuccess: () => {
      setIdentification(""); setName(""); setEmail("");
      client.invalidateQueries({ queryKey: ["users"] });
    }
  });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="Usuarios" description="RBAC, roles, permisos y estado de usuarios." />
      <div className="split">
        <section className="card">
          <h2>Nuevo usuario</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Identificacion<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password inicial<input value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label>Rol<select value={role} onChange={(event) => setRole(event.target.value)}><option value="viewer">Viewer</option><option value="archive_assistant">Archive Assistant</option><option value="archive_admin">Archive Admin</option><option value="auditor">Auditor</option></select></label>
            <button><Plus size={17} /> Crear usuario</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Usuario</th><th>Email</th><th>Estado</th><th>Roles</th></tr></thead>
            <tbody>{users.data?.map((item) => <tr key={item.identification}><td>{item.name}</td><td>{item.email}</td><td><span className="status">{item.status}</span></td><td>{item.roles.join(", ")}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
