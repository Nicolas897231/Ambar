/* ============================================================
   AMBAR — Administración: Seguridad (usuarios, roles, permisos)
   ============================================================ */
const { useState: seS } = React;

function SecurityPage({ user }) {
  const [tab, setTab] = seS("users");
  const [roleKey, setRoleKey] = seS("jefe_archivo");
  const role = ROLES[normalizeRoleKey(roleKey)] || roleMeta(roleKey);
  const rolePerms = role.perms === "*" ? ALL_PERMS : role.perms;
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Administración</div><h1>Seguridad y Accesos</h1><p className="lead">Controla quién puede ver, crear o modificar cada módulo. Los permisos son granulares por módulo y acción; el menú de cada usuario se construye según su rol.</p></div><div className="page-actions"><Button icon="user-plus">Invitar usuario</Button></div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Usuarios activos" value={USERS.length} icon="users" tone="brand" accent />
        <Metric label="Roles definidos" value={Object.keys(ROLES).length} icon="shield" tone="info" accent />
        <Metric label="Con MFA activo" value={USERS.filter(u => u.mfa).length} icon="fingerprint" tone="ok" accent foot="autenticación reforzada" />
        <Metric label="Permisos del sistema" value={ALL_PERMS.length} icon="key-round" tone="brand" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "users", label: "Usuarios", icon: "users" }, { key: "roles", label: "Roles", icon: "shield" }, { key: "matrix", label: "Matriz de permisos", icon: "table" }]} />

      {tab === "users" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="tbl"><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Área</th><th>MFA</th><th>Estado</th><th></th></tr></thead><tbody>
          {USERS.map(u => (<tr key={u.id} className="clickable"><td><div className="t-avatar"><Avatar size="sm" name={u.name} color={u.color} /><span className="cell-strong">{u.name}</span></div></td><td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{u.email}</td><td><Badge tone="brand">{roleMeta(u).name}</Badge></td><td>{u.archive}</td><td>{u.mfa ? <Badge tone="success" icon="fingerprint">Activo</Badge> : <Badge tone="outline">Inactivo</Badge>}</td><td><Badge tone="success" dot>Activo</Badge></td><td><Button variant="subtle" size="sm" icon="more-horizontal" /></td></tr>))}
        </tbody></table></div></Card>
      )}

      {tab === "roles" && (
        <div className="grid" style={{ gridTemplateColumns: "300px 1fr", gap: "var(--s4)" }}>
          <Card pad="sm" className="an-rise"><CardHead title="Roles" /><div className="col" style={{ gap: 2 }}>
            {Object.entries(ROLES).map(([k, r]) => (<div key={k} className={`role-list-item${roleKey === k ? " active" : ""}`} onClick={() => setRoleKey(k)}><span className="role-swatch" style={{ background: r.color }} /><div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{r.name}</div><small className="muted truncate" style={{ display: "block" }}>{USERS.filter(u => u.role === k).length} usuarios</small></div></div>))}
          </div></Card>
          <Card className="an-rise">
            <div className="row gap2" style={{ marginBottom: "var(--s2)" }}><span className="role-swatch" style={{ background: role.color, height: 28 }} /><div><h3>{role.name}</h3><p className="muted" style={{ fontSize: "var(--fs-sm)" }}>{role.area}</p></div></div>
            <p className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: "var(--s4)" }}>{role.desc}</p>
            <div className="divider" />
            <div className="label" style={{ margin: "var(--s3) 0" }}>Permisos otorgados ({role.perms === "*" ? "todos" : rolePerms.length})</div>
            <div className="col gap4">
              {PERM_GROUPS.map(g => { const granted = g.perms.filter(p => rolePerms.includes(p[0])); if (granted.length === 0 && role.perms !== "*") return null; return (
                <div key={g.mod}><div className="row gap2" style={{ marginBottom: 6 }}><b style={{ fontSize: "var(--fs-sm)" }}>{g.mod}</b><Badge tone="outline">{role.perms === "*" ? g.perms.length : granted.length}/{g.perms.length}</Badge></div>
                  <div className="row wrap gap2">{g.perms.map(p => { const on = rolePerms.includes(p[0]); return <span key={p[0]} className="tag-soft" style={{ opacity: on ? 1 : .4, background: on ? "var(--ok-bg)" : "", color: on ? "var(--ok)" : "" }}>{on ? <Icon name="check" size={11} /> : <Icon name="x" size={11} />}{p[1]}</span>; })}</div>
                </div>); })}
            </div>
          </Card>
        </div>
      )}

      {tab === "matrix" && (
        <Card flush className="an-rise"><div className="table-scroll"><table className="matrix"><thead><tr><th>Módulo / Permiso</th>{Object.values(ROLES).map(r => <th key={r.name} style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: 110, fontSize: "var(--fs-2xs)", whiteSpace: "nowrap" }}>{r.name}</th>)}</tr></thead><tbody>
          {PERM_GROUPS.map(g => (<React.Fragment key={g.mod}><tr><td colSpan={Object.keys(ROLES).length + 1} style={{ background: "var(--panel-2)", fontWeight: 700, fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>{g.mod}</td></tr>
            {g.perms.map(p => (<tr key={p[0]}><td>{p[1]}</td>{Object.values(ROLES).map((r, i) => { const on = r.perms === "*" || r.perms.includes(p[0]); return <td key={i}><span className={`perm-cell ${on ? "on" : "off"}`}>{on ? <Icon name="check" size={13} /> : <Icon name="x" size={11} />}</span></td>; })}</tr>))}
          </React.Fragment>))}
        </tbody></table></div></Card>
      )}
    </>
  );
}

window.SecurityPage = SecurityPage;
