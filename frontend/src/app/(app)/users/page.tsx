"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, Plus, RefreshCcw, Save, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

type PermissionItem = {
  idPermission: number;
  permission_key: string;
  module: string;
  description: string;
};

const DEFAULT_PASSWORD = "ChangeMe123!";

function roleLabel(value: string) {
  return value.replaceAll("_", " ");
}

function moduleLabel(value: string) {
  const labels: Record<string, string> = {
    analytics: "Dashboard",
    audit: "Auditoria",
    auth: "Autenticacion",
    bi: "BI",
    document: "Documentos",
    hr: "RRHH",
    integration: "Integraciones",
    notification: "Notificaciones",
    ocr: "OCR",
    platform: "Plataforma",
    report: "Reportes",
    scheduler: "Programador",
    search: "Busqueda",
    signature: "Firmas",
    system: "Sistema",
    task: "Tareas",
    transfer: "Kardex y lotes",
    trd: "TRD",
    users: "Usuarios",
    webhook: "Webhooks",
    workflow: "Workflows"
  };
  return labels[value] ?? value;
}

export default function UsersPage() {
  const client = useQueryClient();
  const [identification, setIdentification] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | "new">("new");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const users = useQuery({
    queryKey: ["users", includeInactive],
    queryFn: async () => (await api.get<UserItem[]>(`/users?include_inactive=${includeInactive}`)).data
  });
  const roles = useQuery({ queryKey: ["users", "roles"], queryFn: async () => (await api.get<RoleItem[]>("/users/roles")).data });
  const permissions = useQuery({ queryKey: ["users", "permissions"], queryFn: async () => (await api.get<PermissionItem[]>("/users/permissions")).data });

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissionItem[]>();
    for (const permission of permissions.data ?? []) {
      const list = groups.get(permission.module) ?? [];
      list.push(permission);
      groups.set(permission.module, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => moduleLabel(a).localeCompare(moduleLabel(b)));
  }, [permissions.data]);


  const createUser = useMutation({
    mutationFn: async () => api.post("/users", { identification, name, email, password, role_names: [role], company_id: "default", location_id: 1 }),
    onSuccess: () => {
      setIdentification("");
      setName("");
      setEmail("");
      setPassword(DEFAULT_PASSWORD);
      setMessage("Usuario creado correctamente.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible crear el usuario. Revisa identificacion, email, password y rol.")
  });

  const saveRole = useMutation({
    mutationFn: async () => {
      const payload = { description: roleDescription, permissions: selectedPermissions };
      if (selectedRoleId === "new") {
        return api.post("/users/roles", { role_name: roleName, ...payload });
      }
      return api.patch(`/users/roles/${selectedRoleId}`, payload);
    },
    onSuccess: () => {
      setMessage("Rol guardado correctamente.");
      client.invalidateQueries({ queryKey: ["users", "roles"] });
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible guardar el rol. Verifica nombre, descripcion y permisos.")
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
      setMessage("Usuario desactivado. No se borro de la base de datos.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible desactivar el usuario.")
  });

  function submitUser(event: FormEvent) {
    event.preventDefault();
    createUser.mutate();
  }

  function submitRole(event: FormEvent) {
    event.preventDefault();
    saveRole.mutate();
  }

  function startNewRole() {
    setSelectedRoleId("new");
    setRoleName("");
    setRoleDescription("");
    setSelectedPermissions([]);
  }

  function editRole(item: RoleItem) {
    setSelectedRoleId(item.idRole);
    setRoleName(item.role_name);
    setRoleDescription(item.description);
    setSelectedPermissions(item.permissions);
  }

  function togglePermission(permission: string) {
    setSelectedPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission].sort());
  }

  return (
    <>
      <PageTitle title="Usuarios" description="Administra usuarios, roles, permisos por modulo y desactivacion segura." />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}
      <div className="split users-layout">
        <section className="card">
          <h2>Nuevo usuario</h2>
          <form className="form-grid" onSubmit={submitUser}>
            <label>Identificacion<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password inicial<input value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
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
            <h2>Usuarios activos</h2>
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

      <section className="card role-admin">
        <div className="toolbar space-between">
          <div>
            <h2>Roles y permisos</h2>
            <p className="muted">Selecciona un rol existente o crea uno nuevo. Los permisos marcados controlan el menu y el acceso API.</p>
          </div>
          <button className="ghost" type="button" onClick={startNewRole}><UserCog size={16} /> Nuevo rol</button>
        </div>
        <div className="role-grid">
          <aside className="role-list">
            {(roles.data ?? []).map((item) => (
              <button key={item.idRole} className={selectedRoleId === item.idRole ? "secondary" : "ghost"} type="button" onClick={() => editRole(item)}>
                {item.permissions.includes("*") ? <Eye size={16} /> : <EyeOff size={16} />} {roleLabel(item.role_name)}
              </button>
            ))}
          </aside>
          <form className="form-grid" onSubmit={submitRole}>
            <div className="form-row-2">
              <label>Nombre tecnico del rol<input value={roleName} onChange={(event) => setRoleName(event.target.value)} disabled={selectedRoleId !== "new"} placeholder="operador_kardex" required /></label>
              <label>Descripcion<input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} required /></label>
            </div>
            <div className="permission-grid">
              {permissionGroups.map(([module, items]) => (
                <div className="permission-group" key={module}>
                  <strong>{moduleLabel(module)}</strong>
                  {items.map((permission) => (
                    <label className="inline-check" key={permission.idPermission}>
                      <input type="checkbox" checked={selectedPermissions.includes(permission.permission_key)} onChange={() => togglePermission(permission.permission_key)} />
                      <span>{permission.permission_key}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="toolbar">
              <button disabled={saveRole.isPending}><Save size={17} /> Guardar rol</button>
              <button className="ghost" type="button" onClick={() => { roles.refetch(); permissions.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
