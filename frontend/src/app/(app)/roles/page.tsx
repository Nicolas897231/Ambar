"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, RefreshCcw, Save, UserCog } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

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

function roleLabel(value: string) {
  return value.replaceAll("_", " ");
}

function moduleLabel(value: string) {
  const labels: Record<string, string> = {
    analytics: "Inicio",
    archive: "Archivos",
    audit: "Auditoria",
    auth: "Autenticacion",
    bi: "BI",
    document: "Gestion documental",
    hr: "Gestion humana",
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
    transfer: "Custodia documental",
    trd: "TRD",
    users: "Seguridad",
    webhook: "Webhooks",
    workflow: "Workflows"
  };
  return labels[value] ?? value;
}

export default function RolesPage() {
  const client = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | "new">("new");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");

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
      <PageTitle
        title="Roles"
        description="Define permisos por modulo. Lo marcado habilita menu y el backend valida la API."
        action={<button className="ghost" type="button" onClick={startNewRole}><UserCog size={16} /> Nuevo rol</button>}
      />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}
      <section className="card role-admin">
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
                    <label className="inline-check" key={permission.idPermission} title={permission.description}>
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
