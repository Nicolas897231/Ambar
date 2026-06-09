/* ============================================================
   AMBAR — Datos: RBAC, usuarios, navegación, catálogos base
   Todo simulado en memoria. Sin backend.
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
  { mod: "Reportes & BI", perms: [["analytics.view", "Indicadores operativos"], ["bi.view", "Tableros gerenciales"]] },
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

/* ---- Usuarios demo (cualquiera entra con contraseña: ambar) ---- */
window.USERS = [
  { id: 1, name: "Camila Restrepo", email: "admin@ambar.co", pass: "ambar", role: "super_admin", initials: "CR", color: "var(--viz-violet)", mfa: true, archive: "Todos", title: "Administradora del Sistema" },
  { id: 2, name: "Andrés Gómez", email: "jefe.archivo@ambar.co", pass: "ambar", role: "jefe_archivo", initials: "AG", color: "var(--viz-amber)", mfa: true, archive: "Archivo Central Cali", title: "Jefe de Archivo" },
  { id: 3, name: "Laura Mejía", email: "auxiliar@ambar.co", pass: "ambar", role: "auxiliar_archivo", initials: "LM", color: "var(--viz-teal)", mfa: false, archive: "Archivo de Gestión", title: "Auxiliar de Archivo" },
  { id: 4, name: "Ricardo Salas", email: "rrhh@ambar.co", pass: "ambar", role: "gerente_rrhh", initials: "RS", color: "var(--viz-rose)", mfa: true, archive: "RRHH", title: "Gerente de RRHH" },
  { id: 5, name: "Diana Ortiz", email: "analista.rrhh@ambar.co", pass: "ambar", role: "analista_rrhh", initials: "DO", color: "var(--viz-sky)", mfa: false, archive: "RRHH", title: "Analista de RRHH" },
  { id: 6, name: "Felipe Cano", email: "sst@ambar.co", pass: "ambar", role: "sst", initials: "FC", color: "var(--viz-green)", mfa: false, archive: "SST", title: "Responsable SST" },
  { id: 7, name: "Marta Lozano", email: "recepcion@ambar.co", pass: "ambar", role: "recepcion", initials: "ML", color: "var(--viz-gold)", mfa: false, archive: "Recepción", title: "Auxiliar de Recepción" },
  { id: 8, name: "Jorge Villa", email: "gerencia@ambar.co", pass: "ambar", role: "gerencia", initials: "JV", color: "var(--viz-indigo)", mfa: true, archive: "Dirección", title: "Director General" },
];

window.permsOf = function(user){
  if(!user) return [];
  if (Array.isArray(user.permissions) && user.permissions.length) {
    return user.permissions.includes("*") ? ALL_PERMS.slice() : user.permissions;
  }
  const r = ROLES[user.role];
  if(!r) return [];
  return r.perms === "*" ? ALL_PERMS.slice() : r.perms;
};
window.can = function(user, anyOf){
  const p = permsOf(user);
  if(!anyOf || anyOf.length === 0) return true;
  return anyOf.some(x => p.includes(x));
};

/* ---- Navegación (filtrada por permisos en el shell) ---- */
window.NAV = [
  { label: "Principal", icon: "gauge", items: [
    { key: "dashboard", label: "Dashboard", icon: "gauge", perms: ["analytics.view","bi.view","hr.view","document.read"] },
  ]},
  { label: "Gestión Documental", icon: "file-text", items: [
    { key: "expedients", label: "Expedientes", icon: "folder-kanban", perms: ["document.read","document.create"] },
    { key: "documents", label: "Documentos", icon: "file-text", perms: ["document.read","document.read_all","document.create"] },
    { key: "digitization", label: "Digitalización", icon: "scan-line", perms: ["ocr.manage"], badge: "12" },
    { key: "trd", label: "TRD & Retención", icon: "table", perms: ["trd.manage"] },
  ]},
  { label: "Archivo & Custodia", icon: "warehouse", items: [
    { key: "archive", label: "Archivo Físico", icon: "warehouse", perms: ["archive.manage","document.read"] },
    { key: "transfers", label: "Transferencias", icon: "route", perms: ["transfer.batch_manage","document.transfer"] },
    { key: "loans", label: "Préstamos", icon: "package-check", perms: ["document.transfer","transfer.manage"], badge: "3" },
    { key: "correspondence", label: "Correspondencia", icon: "mail", perms: ["mail.view","mail.manage"] },
  ]},
  { label: "Talento Humano", icon: "briefcase", items: [
    { key: "hr", label: "Empleados", icon: "briefcase", perms: ["hr.view","hr.manage"] },
    { key: "medical", label: "Exámenes Médicos", icon: "stethoscope", perms: ["medical.view","medical.manage"], badge: "5" },
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
window.AREAS = ["RRHH","Jurídica","Financiera","Operaciones","Comercial","SST","Gerencia","TI","Compras"];
window.SEDES = ["Sede Principal Cali","Sede Bogotá","Sede Medellín","Sede Barranquilla"];
window.ARCHIVES = ["Archivo de Gestión","Archivo Central Cali","Archivo Histórico"];
window.DOC_TYPES = ["Contrato","Factura","Acta","Certificación","Memorando","Hoja de vida","Correspondencia","Resolución","Informe","Licencia"];

/* utilidades pequeñas */
window.fmtN = (n) => new Intl.NumberFormat("es-CO").format(n);
window.initialsOf = (name) => name.split(" ").slice(0,2).map(s=>s[0]).join("").toUpperCase();
