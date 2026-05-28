"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Plus, RefreshCcw, Save, ShieldCheck, Trash2, UserRoundCog } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type UserItem = {
  identification: string;
  name: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
};

type RoleItem = {
  idRole: number;
  role_name: string;
  description: string;
  permissions: string[];
};

function roleLabel(value: string) {
  return value.replaceAll("_", " ");
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg ?? String(item)).join(". ");
  }
  return fallback;
}

export default function UsersPage() {
  const client = useQueryClient();
  const [identification, setIdentification] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const users = useQuery({
    queryKey: ["users", includeInactive],
    queryFn: async () => (await api.get<UserItem[]>(`/users?include_inactive=${includeInactive}`)).data
  });
  const roles = useQuery({ queryKey: ["users", "roles"], queryFn: async () => (await api.get<RoleItem[]>("/users/roles")).data });

  const createUser = useMutation({
    mutationFn: async () => api.post("/users", { identification, name, email, password, role_names: [role], company_id: "default", location_id: 1 }),
    onSuccess: () => {
      setIdentification("");
      setName("");
      setEmail("");
      setPassword("");
      setMessage("Usuario creado correctamente.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => setMessage(apiErrorMessage(error, "No fue posible crear el usuario. Revisa identificacion, email, password y rol."))
  });

  const updateUserRole = useMutation({
    mutationFn: async ({ user, nextRole }: { user: UserItem; nextRole: string }) => api.patch(`/users/${user.identification}`, { role_names: [nextRole] }),
    onSuccess: () => {
      setMessage("Rol del usuario actualizado.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible actualizar el rol del usuario.")
  });

  const deactivateUser = useMutation({
    mutationFn: async (user: UserItem) => api.delete(`/users/${user.identification}`),
    onSuccess: () => {
      setMessage("Usuario desactivado. Se conserva para auditoria y no podra ingresar.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible desactivar el usuario.")
  });

  function submitUser(event: FormEvent) {
    event.preventDefault();
    createUser.mutate();
  }

  return (
    <>
      <PageTitle
        title="Usuarios"
        description="Alta, roles asignados y desactivacion segura sin borrar trazabilidad."
        action={
          <div className="toolbar">
            <Link className="button-link ghost-link" href="/roles"><UserRoundCog size={17} /> Administrar roles</Link>
            <button className="ghost" type="button" onClick={() => users.refetch()}><RefreshCcw size={17} /> Actualizar</button>
          </div>
        }
      />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}
      <div className="split users-layout">
        <section className="card">
          <h2>Nuevo usuario</h2>
          <form className="form-grid" onSubmit={submitUser}>
            <label>Identificacion<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password inicial<input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} placeholder="Minimo 12, mayuscula, minuscula, numero y simbolo" /></label>
            <label>Rol
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {(roles.data ?? []).map((item) => <option key={item.idRole} value={item.role_name}>{roleLabel(item.role_name)}</option>)}
              </select>
            </label>
            <button disabled={createUser.isPending}><Plus size={17} /> Crear usuario</button>
          </form>
        </section>

        <section className="card table-card">
          <div className="toolbar space-between">
            <h2>Usuarios</h2>
            <label className="inline-check">
              <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
              Mostrar inactivos
            </label>
          </div>
          <table>
            <thead><tr><th>Usuario</th><th>Email</th><th>Estado</th><th>Rol</th><th>Permisos</th><th>Acciones</th></tr></thead>
            <tbody>
              {users.data?.map((item) => {
                const draftRole = userRoleDrafts[item.identification] ?? item.roles[0] ?? "viewer";
                return (
                  <tr key={item.identification}>
                    <td><strong>{item.name}</strong><br /><span className="muted">{item.identification}</span></td>
                    <td>{item.email}</td>
                    <td><span className={`status ${item.status !== "active" ? "danger-status" : ""}`}>{item.status}</span></td>
                    <td>
                      <select value={draftRole} onChange={(event) => setUserRoleDrafts((current) => ({ ...current, [item.identification]: event.target.value }))}>
                        {(roles.data ?? []).map((roleItem) => <option key={roleItem.idRole} value={roleItem.role_name}>{roleLabel(roleItem.role_name)}</option>)}
                      </select>
                    </td>
                    <td><span className="status"><ShieldCheck size={14} /> {item.permissions.includes("*") ? "Todos" : item.permissions.length}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="ghost" type="button" onClick={() => updateUserRole.mutate({ user: item, nextRole: draftRole })}><Save size={15} /> Guardar</button>
                        {item.status === "active" ? <button className="ghost danger" type="button" onClick={() => deactivateUser.mutate(item)}><Trash2 size={15} /> Desactivar</button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.isLoading ? <p className="muted">Cargando usuarios...</p> : null}
        </section>
      </div>
    </>
  );
}
