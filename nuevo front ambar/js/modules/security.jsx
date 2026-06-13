const { useState: seS } = React;

function SecurityPage() {
  const [tab, setTab] = seS("users");
  const [roleKey, setRoleKey] = seS("super_admin");
  const { data: rawUsers, loading } = useLiveData(() => AmbarAPI.endpoints.users(), [], []);
  const { data: rawRoles } = useLiveData(() => AmbarAPI.endpoints.roles(), [], []);
  const { data: rawPerms } = useLiveData(() => AmbarAPI.endpoints.permissions(), [], []);
  const users = AmbarAPI.listFrom(rawUsers).map((u, i) => ({
    id: u.identification || u.id || i,
    name: u.name || u.full_name || u.email || "Usuario",
    email: u.email || "",
    role: normalizeRoleKey((u.roles || [u.role || "viewer"])[0]),
    status: u.status || "active",
    permissions: u.permissions || [],
  }));
  const backendRoles = AmbarAPI.listFrom(rawRoles);
  const backendPerms = AmbarAPI.listFrom(rawPerms);
  const role = ROLES[normalizeRoleKey(roleKey)] || roleMeta(roleKey);
  const rolePerms = role.perms === "*" ? ALL_PERMS : (role.perms || []);
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Administracion</div><h1>Seguridad y Accesos</h1><p className="lead">Usuarios y permisos conectados al backend. Las acciones sensibles siguen validadas por API.</p></div><div className="page-actions"><Button icon="user-plus">Crear usuario</Button></div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Usuarios activos" value={users.filter(u => u.status === "active").length} icon="users" tone="brand" accent />
        <Metric label="Roles backend" value={backendRoles.length || Object.keys(ROLES).length} icon="shield" tone="info" accent />
        <Metric label="Permisos backend" value={backendPerms.length || ALL_PERMS.length} icon="key-round" tone="brand" accent />
        <Metric label="Usuarios totales" value={users.length} icon="user" tone="ok" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "users", label: "Usuarios", icon: "users" }, { key: "roles", label: "Roles", icon: "shield" }, { key: "matrix", label: "Matriz de permisos", icon: "table" }]} />

      {tab === "users" && (
        <Card flush className="an-rise">
          {loading ? <div style={{ padding: "var(--s5)" }}><Skeleton lines={6} /></div> : users.length === 0 ? <Empty icon="users" title="Sin usuarios">No hay usuarios retornados por el backend.</Empty> : (
            <div className="table-scroll"><table className="tbl"><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Permisos</th></tr></thead><tbody>
              {users.map(u => (<tr key={u.id}><td><div className="t-avatar"><Avatar size="sm" name={u.name} color={roleMeta(u).color} /><span className="cell-strong">{u.name}</span></div></td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{u.email}</td><td><Badge tone="brand">{roleMeta(u).name}</Badge></td><td><Badge tone={u.status === "active" ? "success" : "neutral"} dot>{u.status}</Badge></td><td>{u.permissions.includes("*") ? <Badge tone="success">Todos</Badge> : <Badge tone="outline">{u.permissions.length}</Badge>}</td></tr>))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {tab === "roles" && (
        <div className="grid" style={{ gridTemplateColumns: "300px 1fr", gap: "var(--s4)" }}>
          <Card pad="sm" className="an-rise"><CardHead title="Roles" /><div className="col" style={{ gap: 2 }}>
            {Object.entries(ROLES).map(([k, r]) => (<div key={k} className={`role-list-item${roleKey === k ? " active" : ""}`} onClick={() => setRoleKey(k)}><span className="role-swatch" style={{ background: r.color }} /><div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{r.name}</div><small className="muted truncate" style={{ display: "block" }}>{users.filter(u => u.role === k).length} usuarios</small></div></div>))}
          </div></Card>
          <Card className="an-rise">
            <div className="row gap2" style={{ marginBottom: "var(--s2)" }}><span className="role-swatch" style={{ background: role.color, height: 28 }} /><div><h3>{role.name}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)" }}>{role.area}</p></div></div>
            <p className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: "var(--s4)" }}>{role.desc}</p>
            <div className="divider" />
            <div className="label" style={{ margin: "var(--s3) 0" }}>Permisos visuales ({role.perms === "*" ? "todos" : rolePerms.length})</div>
            <div className="row wrap gap2">{(role.perms === "*" ? ALL_PERMS : rolePerms).map(p => <span key={p} className="tag-soft">{PERM_LABEL[p] || p}</span>)}</div>
          </Card>
        </div>
      )}

      {tab === "matrix" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="matrix"><thead><tr><th>Modulo / Permiso</th>{Object.values(ROLES).map(r => <th key={r.name} style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: 110, fontSize: "var(--fs-2xs)", whiteSpace: "nowrap" }}>{r.name}</th>)}</tr></thead><tbody>
          {PERM_GROUPS.map(g => (<React.Fragment key={g.mod}><tr><td colSpan={Object.keys(ROLES).length + 1} style={{ background: "var(--panel-2)", fontWeight: 700, fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>{g.mod}</td></tr>
            {g.perms.map(p => (<tr key={p[0]}><td>{p[1]}</td>{Object.values(ROLES).map((r, i) => { const on = r.perms === "*" || r.perms.includes(p[0]); return <td key={i}><span className={`perm-cell ${on ? "on" : "off"}`}>{on ? <Icon name="check" size={13} /> : <Icon name="x" size={11} />}</span></td>; })}</tr>))}
          </React.Fragment>))}
        </tbody></table></div></Card>
      )}
    </>
  );
}

window.SecurityPage = SecurityPage;
