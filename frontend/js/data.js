/* ============================================================
   AMBAR - RBAC visual, navegacion y utilidades de presentacion
   Los datos operativos vienen del backend por medio de frontend/js/api.js.
   ============================================================ */

/* ---- Catálogo de permisos agrupado por módulo (para la matriz) ---- */
window.PERM_GROUPS = [
  { mod: "Gestión Documental", perms: [
    ["document.read", "Ver documentos del área"],
    ["document.read_all", "Ver todos los documentos"],
    ["document.create", "Crear / registrar"],
    ["document.update", "Editar y foliar"],
    ["document.transfer", "Mover / prestar"],
  ]},
  { mod: "TRD", perms: [["trd.manage", "Administrar series y retención"]] },
  { mod: "Archivo & Custodia", perms: [
    ["archive.manage", "Administrar archivos y ubicaciones"],
    ["transfer.manage", "Gestionar recepción"],
    ["transfer.batch_manage", "Gestionar lotes / FUID"],
  ]},
  { mod: "RRHH", perms: [["hr.view", "Consultar empleados"], ["hr.manage", "Gestionar empleados y contratos"]] },
  { mod: "Exámenes Médicos (SST)", perms: [["medical.view", "Consultar exámenes"], ["medical.manage", "Programar y registrar"]] },
  { mod: "Reclutamiento", perms: [["recruit.view", "Consultar candidatos"], ["recruit.manage", "Gestionar vacantes y pipeline"]] },
  { mod: "Correspondencia", perms: [["mail.view", "Consultar"], ["mail.manage", "Radicar y tramitar"]] },
  { mod: "Búsqueda & OCR", perms: [["search.query", "Buscar"], ["ocr.manage", "Operar digitalización/OCR"]] },
  { mod: "Reportes & BI", perms: [["analytics.view", "Indicadores operativos"], ["bi.view", "Tableros gerenciales"], ["report.request", "Generar y descargar reportes"], ["bi.refresh", "Actualizar BI"]] },
  { mod: "Seguridad", perms: [["users.manage", "Usuarios, roles y permisos"], ["audit.view", "Auditoría"]] },
  { mod: "Plataforma", perms: [["platform.view", "Configuración"], ["integration.manage", "Integraciones"], ["signature.manage", "Firmas"], ["workflow.manage", "Automatización"]] },
  { mod: "Notificaciones", perms: [["notification.read", "Recibir alertas"]] },
];

window.ALL_PERMS = PERM_GROUPS.flatMap(g => g.perms.map(p => p[0]));
window.PERM_LABEL = Object.fromEntries(PERM_GROUPS.flatMap(g => g.perms));

/* ---- Roles ---- */
window.ROLES = {
  super_admin: { name: "Super Administrador", color: "var(--viz-violet)", area: "TI / Gerencia",
    desc: "Acceso total sin restricciones. Configura el sistema completo.", perms: "*" },
  jefe_archivo: { name: "Jefe de Archivo", color: "var(--viz-amber)", area: "Archivo",
    desc: "Define políticas documentales, aprueba transferencias y supervisa el archivo.",
    perms: ["document.read","document.read_all","document.create","document.update","document.transfer","trd.manage","archive.manage","transfer.manage","transfer.batch_manage","mail.view","mail.manage","search.query","ocr.manage","analytics.view","bi.view","audit.view","notification.read"] },
  auxiliar_archivo: { name: "Auxiliar de Archivo", color: "var(--viz-teal)", area: "Archivo",
    desc: "Recibe, clasifica, digitaliza y ubica documentos. Gestiona préstamos.",
    perms: ["document.read","document.create","document.update","document.transfer","archive.manage","transfer.manage","transfer.batch_manage","mail.view","mail.manage","search.query","ocr.manage","notification.read"] },
  gerente_rrhh: { name: "Gerente de RRHH", color: "var(--viz-rose)", area: "RRHH",
    desc: "Administra empleados, contratos, candidatos, vacantes y exámenes médicos.",
    perms: ["hr.view","hr.manage","medical.view","medical.manage","recruit.view","recruit.manage","document.read","document.create","search.query","analytics.view","bi.view","notification.read"] },
  analista_rrhh: { name: "Analista de RRHH", color: "var(--viz-sky)", area: "RRHH",
    desc: "Registra candidatos, actualiza expedientes y gestiona el pipeline de selección.",
    perms: ["hr.view","recruit.view","recruit.manage","medical.view","document.read","search.query","notification.read"] },
  sst: { name: "Responsable SST", color: "var(--viz-green)", area: "Seguridad y Salud",
    desc: "Programa y hace seguimiento a exámenes médicos ocupacionales.",
    perms: ["medical.view","medical.manage","hr.view","document.read","search.query","notification.read"] },
  recepcion: { name: "Recepción", color: "var(--viz-gold)", area: "Recepción",
    desc: "Radica correspondencia entrante y saliente; distribuye a las áreas.",
    perms: ["mail.view","mail.manage","document.read","document.create","search.query","notification.read"] },
  gerencia: { name: "Gerencia", color: "var(--viz-indigo)", area: "Dirección",
    desc: "Consulta tableros ejecutivos e indicadores. No opera módulos transaccionales.",
    perms: ["analytics.view","bi.view","document.read_all","hr.view","audit.view","notification.read"] },
  consultor: { name: "Consultor", color: "var(--muted)", area: "Cualquier área",
    desc: "Solo lectura de los documentos de su área.",
    perms: ["document.read","search.query","notification.read"] },
};


window.normalizeRoleKey = function(role) {
  const key = String(role || "consultor").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    "super_admin": "super_admin",
    "superadministrador": "super_admin",
    "super_administrador": "super_admin",
    "archive_admin": "jefe_archivo",
    "archive_analyst": "auxiliar_archivo",
    "archive_assistant": "auxiliar_archivo",
    "auditor": "gerencia",
    "viewer": "consultor",
    "hr_manager": "gerente_rrhh",
    "hr_analyst": "analista_rrhh"
  };
  return aliases[key] || key;
};

window.roleMeta = function(userOrRole) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole?.role;
  const key = normalizeRoleKey(role);
  return ROLES[key] || { name: String(role || "Usuario AMBAR").replace(/_/g, " "), color: "var(--muted)", area: "AMBAR", desc: "Rol operativo configurado en backend.", perms: [] };
};

/* ---- Usuarios: solo backend. Se mantiene arreglo vacío para compatibilidad visual. */
window.USERS = [];

window.permsOf = function(user){
  if(!user) return [];
  if (Array.isArray(user.permissions) && user.permissions.length) {
    return user.permissions.includes("*") ? ALL_PERMS.slice() : user.permissions;
  }
  const r = ROLES[normalizeRoleKey(user.role)];
  if(!r) return [];
  return r.perms === "*" ? ALL_PERMS.slice() : r.perms;
};
window.can = function(user, anyOf){
  if (Array.isArray(user?.permissions) && user.permissions.includes("*")) return true;
  const p = permsOf(user);
  if(!anyOf || anyOf.length === 0) return true;
  return anyOf.some(x => p.includes(x));
};

/* ---- Navegación (filtrada por permisos en el shell) ---- */
window.NAV = [
  { label: "Inicio operativo", icon: "gauge", items: [
    { key: "dashboard", label: "Centro operacional", icon: "gauge", perms: ["analytics.view","bi.view","hr.view","document.read"] },
  ]},
  { label: "Gestionar documentos", icon: "file-text", items: [
    { key: "expedients", label: "Expedientes", icon: "folder-kanban", perms: ["document.read","document.create"] },
    { key: "documents", label: "Documentos", icon: "file-text", perms: ["document.read","document.read_all","document.create"] },
    { key: "repository", label: "Repositorio", icon: "database", perms: ["document.read","document.read_all"] },
    { key: "documentSearch", label: "Búsqueda documental", icon: "search", perms: ["search.query","document.read"] },
    { key: "foliation", label: "Foliación", icon: "list-checks", perms: ["document.read","document.update"] },
    { key: "digitization", label: "Digitalización", icon: "scan-line", perms: ["ocr.manage"] },
    { key: "trd", label: "TRD & Retención", icon: "table", perms: ["trd.manage"] },
  ]},
  { label: "Operar custodia", icon: "warehouse", items: [
    { key: "archive", label: "Archivo Físico", icon: "warehouse", perms: ["archive.manage","document.read"] },
    { key: "inventory", label: "Inventarios", icon: "boxes", perms: ["document.read","archive.manage"] },
    { key: "kardex", label: "Kardex", icon: "history", perms: ["document.read","audit.view"] },
    { key: "transfers", label: "Transferencias", icon: "route", perms: ["transfer.batch_manage","document.transfer"] },
    { key: "reception", label: "Recepción", icon: "package-check", perms: ["transfer.batch_manage","document.transfer"] },
    { key: "fuid", label: "FUID", icon: "clipboard", perms: ["document.read","document.transfer"] },
    { key: "loans", label: "Préstamos", icon: "package-check", perms: ["document.transfer","transfer.manage"] },
    { key: "correspondence", label: "Correspondencia", icon: "mail", perms: ["mail.view","mail.manage"] },
  ]},
  { label: "Talento humano", icon: "briefcase", items: [
    { key: "hr", label: "Empleados", icon: "briefcase", perms: ["hr.view","hr.manage"] },
    { key: "medical", label: "Exámenes Médicos", icon: "stethoscope", perms: ["medical.view","medical.manage"] },
    { key: "recruitment", label: "Reclutamiento", icon: "user-plus", perms: ["recruit.view","recruit.manage"] },
  ]},
  { label: "Inteligencia", icon: "bar-chart", items: [
    { key: "reports", label: "Reportes & BI", icon: "bar-chart", perms: ["analytics.view","bi.view"] },
    { key: "audit", label: "Auditoría", icon: "shield-check", perms: ["audit.view"] },
  ]},
  { label: "Administración", icon: "server-cog", items: [
    { key: "security", label: "Seguridad", icon: "shield", perms: ["users.manage"] },
    { key: "settings", label: "Configuración", icon: "settings", perms: ["platform.view","integration.manage"] },
  ]},
];

/* ---- Catálogos compartidos ---- */
window.AREAS = [];
window.SEDES = [];
window.ARCHIVES = [];
window.DOC_TYPES = [];

/* utilidades pequeñas */
window.fmtN = (n) => new Intl.NumberFormat("es-CO").format(n);
window.initialsOf = (name) => name.split(" ").slice(0,2).map(s=>s[0]).join("").toUpperCase();
