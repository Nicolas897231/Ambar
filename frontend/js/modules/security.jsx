const { useState: seS } = React;

function backendRoleKey(role) {
  return role?.role_name || role?.name || role?.key || "viewer";
}

function backendRoleName(role) {
  return roleMeta(backendRoleKey(role)).name || String(backendRoleKey(role)).replace(/_/g, " ");
}

function permissionGroupsFromBackend(permissions) {
  const items = AmbarAPI.listFrom(permissions);
  if (!items.length) return PERM_GROUPS;
  const grouped = {};
  items.forEach((permission) => {
    const moduleName = permission.module || "General";
    grouped[moduleName] = grouped[moduleName] || [];
    grouped[moduleName].push([permission.permission_key, permission.description || permission.permission_key]);
  });
  return Object.entries(grouped).map(([mod, perms]) => ({ mod, perms }));
}

function UserModal({ roles, positions, departments, onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = seS({
    identification: "",
    name: "",
    email: "",
    phone: "",
    role_name: backendRoleKey(roles[0]) || "viewer",
    position_name: "",
    department_name: "",
    mfa_enabled: false,
    status: "active",
  });
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const missing = [];
    if (!/^\d{6,12}$/.test(payload.identification)) missing.push("identificacion numerica de 6 a 12 digitos");
    if (!payload.name.trim() || /\d/.test(payload.name)) missing.push("nombre sin numeros");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) missing.push("correo valido");
    if (payload.phone && !/^\d{10}$/.test(payload.phone)) missing.push("telefono de 10 digitos");
    if (!payload.role_name) missing.push("rol");
    if (missing.length) {
      toast(`Corrige: ${missing.join(", ")}.`, { tone: "danger", title: "Usuario incompleto" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/users", {
        identification: payload.identification,
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone || null,
        role_names: [payload.role_name],
        position_name: payload.position_name || null,
        department_name: payload.department_name || null,
        mfa_enabled: Boolean(payload.mfa_enabled),
        status: payload.status,
      });
      toast("Usuario creado. La clave inicial es su numero de identificacion.", { tone: "ok", title: "Usuario listo" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el usuario.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal title="Crear usuario" sub="El backend valida identificacion, correo, rol y telefono. La clave inicial sera la identificacion." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="user-plus" onClick={submit}>Crear usuario</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Identificacion" required><input inputMode="numeric" maxLength="12" value={payload.identification} onChange={(e) => setField("identification", e.target.value.replace(/\D/g, ""))} placeholder="1000000000" /></Field>
        <Field label="Telefono"><input inputMode="numeric" maxLength="10" value={payload.phone} onChange={(e) => setField("phone", e.target.value.replace(/\D/g, ""))} placeholder="3001234567" /></Field>
        <Field label="Nombre completo" required><input value={payload.name} onChange={(e) => setField("name", e.target.value.replace(/[0-9]/g, ""))} /></Field>
        <Field label="Correo" required><input type="email" value={payload.email} onChange={(e) => setField("email", e.target.value)} /></Field>
        <Field label="Cargo RRHH"><select value={payload.position_name} onChange={(e) => setField("position_name", e.target.value)}><option value="">Sin cargo asociado</option>{positions.map((p) => <option key={p.idPosition || p.position_code || p.name} value={p.name}>{p.name}</option>)}</select></Field>
        <Field label="Dependencia RRHH"><select value={payload.department_name} onChange={(e) => setField("department_name", e.target.value)}><option value="">Sin dependencia asociada</option>{departments.map((d) => <option key={d.idDepartment || d.department_code || d.name} value={d.name}>{d.name}</option>)}</select></Field>
        <Field label="Rol" required><select value={payload.role_name} onChange={(e) => setField("role_name", e.target.value)}>{roles.map((role) => <option key={backendRoleKey(role)} value={backendRoleKey(role)}>{backendRoleName(role)}</option>)}</select></Field>
        <Field label="Estado"><select value={payload.status} onChange={(e) => setField("status", e.target.value)}><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="locked">Bloqueado</option></select></Field>
        <label className="check" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={payload.mfa_enabled} onChange={(e) => setField("mfa_enabled", e.target.checked)} />Activar MFA TOTP para este usuario</label>
      </div>
    </Modal>
  );
}

function RoleModal({ role, permissions, onClose, onSaved }) {
  const toast = useToast();
  const groups = permissionGroupsFromBackend(permissions);
  const allKeys = groups.flatMap((group) => group.perms.map((item) => item[0]));
  const [payload, setPayload] = seS({
    role_name: role?.role_name || "",
    description: role?.description || "",
    permissions: role?.permissions || [],
  });
  const isEditing = Boolean(role?.idRole);
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const togglePermission = (permission) => {
    setField("permissions", payload.permissions.includes(permission)
      ? payload.permissions.filter((item) => item !== permission)
      : [...payload.permissions, permission]);
  };
  const selectAll = () => setField("permissions", allKeys.slice());
  const clearAll = () => setField("permissions", []);
  const submit = async () => {
    if (!/^[a-z0-9_]{3,80}$/.test(payload.role_name)) {
      toast("El codigo del rol usa solo minusculas, numeros y guion bajo.", { tone: "danger", title: "Rol invalido" });
      return;
    }
    if (payload.description.trim().length < 3) {
      toast("Agrega una descripcion clara del rol.", { tone: "danger", title: "Falta descripcion" });
      return;
    }
    try {
      const keepWildcard = role?.role_name === "super_admin" && !payload.permissions.includes("*");
      const permissions = keepWildcard ? ["*", ...payload.permissions] : payload.permissions;
      const body = { description: payload.description.trim(), permissions };
      const saved = isEditing
        ? await AmbarAPI.patch(`/users/roles/${role.idRole}`, body)
        : await AmbarAPI.post("/users/roles", { role_name: payload.role_name.trim(), ...body });
      toast(isEditing ? "Rol actualizado." : "Rol creado.", { tone: "ok", title: "Permisos guardados" });
      onSaved(saved);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible guardar el rol.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal wide title={isEditing ? "Editar rol" : "Crear rol"} sub="Define permisos por accion. El backend conserva la validacion final." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Guardar rol</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Codigo tecnico" required><input disabled={isEditing} value={payload.role_name} onChange={(e) => setField("role_name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="jefe_archivo" /></Field>
        <Field label="Descripcion" required><input value={payload.description} onChange={(e) => setField("description", e.target.value)} /></Field>
      </div>
      <div className="row wrap gap2" style={{ margin: "var(--s4) 0" }}>
        <Button size="sm" variant="ghost" onClick={selectAll}>Seleccionar todos</Button>
        <Button size="sm" variant="ghost" onClick={clearAll}>Limpiar</Button>
        <Badge tone="outline">{payload.permissions.length} permisos</Badge>
      </div>
      <div className="permission-pick-list">
        {groups.map((group) => (
          <div key={group.mod} className="permission-group">
            <div className="label">{group.mod}</div>
            <div className="row wrap gap2">
              {group.perms.map(([key, label]) => (
                <button key={key} type="button" className={`perm-choice${payload.permissions.includes(key) ? " active" : ""}`} onClick={() => togglePermission(key)}>
                  <Icon name={payload.permissions.includes(key) ? "check" : "plus"} size={13} />{label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function SecurityPage() {
  const [tab, setTab] = seS("users");
  const [roleKey, setRoleKey] = seS("");
  const [creatingUser, setCreatingUser] = seS(false);
  const [editingRole, setEditingRole] = seS(null);
  const liveUsers = useLiveData(() => AmbarAPI.endpoints.users(), [], []);
  const liveRoles = useLiveData(() => AmbarAPI.endpoints.roles(), [], []);
  const { data: rawPerms } = useLiveData(() => AmbarAPI.endpoints.permissions(), [], []);
  const { data: rawPositions } = useLiveData(() => AmbarAPI.endpoints.positions(), [], []);
  const { data: rawDepartments } = useLiveData(() => AmbarAPI.endpoints.departments(), [], []);
  const users = AmbarAPI.listFrom(liveUsers.data).map((u, i) => ({
    id: u.identification || u.id || i,
    name: u.name || u.full_name || u.email || "Usuario",
    email: u.email || "",
    role: normalizeRoleKey((u.roles || [u.role || "viewer"])[0]),
    roles: u.roles || [u.role || "viewer"],
    status: u.status || "active",
    permissions: u.permissions || [],
  }));
  const backendRoles = AmbarAPI.listFrom(liveRoles.data);
  const roles = backendRoles.length ? backendRoles : Object.entries(ROLES).map(([role_name, value]) => ({ role_name, description: value.desc, permissions: value.perms === "*" ? ["*"] : value.perms }));
  const selectedRole = roles.find((item) => backendRoleKey(item) === roleKey) || roles[0] || null;
  const rolePerms = selectedRole?.permissions?.includes("*") ? ALL_PERMS : (selectedRole?.permissions || []);
  const roleUsers = users.filter((u) => u.roles.map(normalizeRoleKey).includes(normalizeRoleKey(backendRoleKey(selectedRole))));
  const permissionGroups = permissionGroupsFromBackend(rawPerms);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Administracion</div>
          <h1>Seguridad y Accesos</h1>
          <p className="lead">Usuarios y permisos conectados al backend. Las acciones sensibles siguen validadas por API.</p>
        </div>
        <div className="page-actions">
          {tab === "roles" && <Button variant="ghost" icon="shield" onClick={() => setEditingRole({})}>Crear rol</Button>}
          <Button icon="user-plus" onClick={() => setCreatingUser(true)}>Crear usuario</Button>
        </div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="Usuarios activos" value={users.filter((u) => u.status === "active").length} icon="users" tone="brand" accent />
        <Metric label="Roles backend" value={roles.length} icon="shield" tone="info" accent />
        <Metric label="Permisos backend" value={AmbarAPI.listFrom(rawPerms).length || ALL_PERMS.length} icon="key-round" tone="brand" accent />
        <Metric label="Usuarios totales" value={users.length} icon="user" tone="ok" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "users", label: "Usuarios", icon: "users" }, { key: "roles", label: "Roles", icon: "shield" }, { key: "matrix", label: "Matriz de permisos", icon: "table" }]} />

      {tab === "users" && (
        <Card flush className="an-rise">
          {liveUsers.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={6} /></div> : users.length === 0 ? <Empty icon="users" title="Sin usuarios">No hay usuarios retornados por el backend.</Empty> : (
            <div className="table-scroll"><table className="tbl"><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Permisos</th></tr></thead><tbody>
              {users.map((u) => (<tr key={u.id}><td><div className="t-avatar"><Avatar size="sm" name={u.name} color={roleMeta(u).color} /><span className="cell-strong">{u.name}</span></div></td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{u.email}</td><td><Badge tone="brand">{roleMeta(u).name}</Badge></td><td><Badge tone={u.status === "active" ? "success" : "neutral"} dot>{u.status}</Badge></td><td>{u.permissions.includes("*") ? <Badge tone="success">Todos</Badge> : <Badge tone="outline">{u.permissions.length}</Badge>}</td></tr>))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {tab === "roles" && (
        <div className="security-roles-layout">
          <Card pad="sm" className="an-rise"><CardHead title="Roles" action={<Button size="sm" variant="ghost" icon="plus" onClick={() => setEditingRole({})}>Nuevo</Button>} /><div className="col" style={{ gap: 2 }}>
            {roles.map((role) => {
              const key = backendRoleKey(role);
              const meta = roleMeta(key);
              return <div key={key} className={`role-list-item${backendRoleKey(selectedRole) === key ? " active" : ""}`} onClick={() => setRoleKey(key)}><span className="role-swatch" style={{ background: meta.color }} /><div className="grow" style={{ minWidth: 0 }}><div className="role-name-line">{backendRoleName(role)}</div><small className="muted truncate" style={{ display: "block" }}>{users.filter((u) => u.roles.map(normalizeRoleKey).includes(normalizeRoleKey(key))).length} usuarios</small></div></div>;
            })}
          </div></Card>
          <Card className="an-rise">
            <div className="row between center" style={{ marginBottom: "var(--s3)" }}>
              <div className="row gap2"><span className="role-swatch" style={{ background: roleMeta(backendRoleKey(selectedRole)).color, height: 28 }} /><div><h3>{backendRoleName(selectedRole)}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)" }}>{roleMeta(backendRoleKey(selectedRole)).area}</p></div></div>
              {selectedRole?.idRole && <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditingRole(selectedRole)}>Editar permisos</Button>}
            </div>
            <p className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: "var(--s4)" }}>{selectedRole?.description || roleMeta(backendRoleKey(selectedRole)).desc}</p>
            <div className="divider" />
            <div className="label" style={{ margin: "var(--s3) 0" }}>Permisos ({selectedRole?.permissions?.includes("*") ? "todos" : rolePerms.length})</div>
            <div className="row wrap gap2">{(selectedRole?.permissions?.includes("*") ? ALL_PERMS : rolePerms).map((p) => <span key={p} className="tag-soft">{PERM_LABEL[p] || p}</span>)}</div>
            <div className="divider" />
            <div className="label" style={{ margin: "var(--s3) 0" }}>Usuarios con este rol ({roleUsers.length})</div>
            <div className="row wrap gap2">{roleUsers.length ? roleUsers.map((u) => <span key={u.id} className="tag-soft">{u.name}</span>) : <span className="muted">Sin usuarios asignados.</span>}</div>
          </Card>
        </div>
      )}

      {tab === "matrix" && (
        <Card flush className="an-rise"><div className="table-scroll matrix-wrap"><table className="matrix roles-matrix"><thead><tr><th>Modulo / Permiso</th>{roles.map((role) => <th key={backendRoleKey(role)} className="role-head">{backendRoleName(role)}</th>)}</tr></thead><tbody>
          {permissionGroups.map((group) => (<React.Fragment key={group.mod}><tr><td colSpan={roles.length + 1} style={{ background: "var(--panel-2)", fontWeight: 700, fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>{group.mod}</td></tr>
            {group.perms.map(([key, label]) => (<tr key={key}><td>{label}</td>{roles.map((role) => { const perms = role.permissions || []; const on = perms.includes("*") || perms.includes(key); return <td key={backendRoleKey(role)}><span className={`perm-cell ${on ? "on" : "off"}`}>{on ? <Icon name="check" size={13} /> : <Icon name="x" size={11} />}</span></td>; })}</tr>))}
          </React.Fragment>))}
        </tbody></table></div></Card>
      )}

      {creatingUser && <UserModal roles={roles} positions={AmbarAPI.listFrom(rawPositions)} departments={AmbarAPI.listFrom(rawDepartments)} onClose={() => setCreatingUser(false)} onCreated={(created) => liveUsers.setData((current) => [created, ...(current || [])])} />}
      {editingRole && <RoleModal role={editingRole.idRole ? editingRole : null} permissions={rawPerms} onClose={() => setEditingRole(null)} onSaved={(saved) => liveRoles.setData((current) => {
        const list = current || [];
        return list.some((item) => item.idRole === saved.idRole) ? list.map((item) => item.idRole === saved.idRole ? saved : item) : [saved, ...list];
      })} />}
    </>
  );
}

window.SecurityPage = SecurityPage;
