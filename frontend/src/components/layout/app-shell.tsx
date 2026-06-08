"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FileText,
  FolderKanban,
  Gauge,
  HeartPulse,
  Layers3,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Moon,
  PackageCheck,
  Plus,
  Route,
  ScanLine,
  Search,
  ServerCog,
  Settings,
  ShieldCheck,
  Sun,
  TableProperties,
  Tags,
  Users,
  Warehouse
} from "lucide-react";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { clearSession, CurrentUser, getCurrentUser, getStoredPermissions, hasAnyPermission, saveCurrentUser } from "@/lib/auth";
import { NotificationCenter, NotificationItem, SearchCommand } from "@/components/ui/enterprise";

type NavItem = { href: string; label: string; icon: typeof Gauge; permissions: string[]; badge?: string };
type NavGroup = { label: string; icon: typeof Gauge; items: NavItem[]; permissions: string[] };
type ArchiveOption = { idArchive: number; archive_name: string; archive_code?: string };

const groups: NavGroup[] = [
  { label: "Dashboard", icon: Gauge, permissions: ["analytics.view", "bi.view", "document.read", "hr.view"], items: [{ href: "/dashboard", label: "Dashboard", icon: Gauge, permissions: ["analytics.view", "bi.view", "document.read", "hr.view"] }] },
  {
    label: "Gestión Documental",
    icon: FileText,
    permissions: ["document.read", "document.read_all", "document.create", "document.update", "ocr.manage"],
    items: [
      { href: "/expedients", label: "Expedientes", icon: FolderKanban, permissions: ["document.read", "document.create"] },
      { href: "/documents", label: "Documentos", icon: FileText, permissions: ["document.read", "document.read_all", "document.create", "document.update"] },
      { href: "/digitization", label: "Digitalización", icon: ScanLine, permissions: ["document.read", "ocr.manage"] }
    ]
  },
  {
    label: "TRD",
    icon: TableProperties,
    permissions: ["trd.manage"],
    items: [
      { href: "/trd?view=dependencies", label: "Dependencias", icon: Building2, permissions: ["trd.manage"] },
      { href: "/trd?view=series", label: "Series", icon: TableProperties, permissions: ["trd.manage"] },
      { href: "/trd?view=subseries", label: "Subseries", icon: Layers3, permissions: ["trd.manage"] },
      { href: "/trd?view=typologies", label: "Tipologías", icon: Tags, permissions: ["trd.manage"] }
    ]
  },
  {
    label: "Custodia Documental",
    icon: Warehouse,
    permissions: ["document.transfer", "transfer.manage", "transfer.batch_manage", "archive.manage"],
    items: [
      { href: "/archives", label: "Archivos", icon: Warehouse, permissions: ["document.read", "archive.manage"] },
      { href: "/kardex", label: "Kardex", icon: Route, permissions: ["document.transfer", "transfer.manage"] },
      { href: "/transfer-batches", label: "Transferencias", icon: Route, permissions: ["transfer.batch_manage", "document.transfer"] },
      { href: "/reception", label: "Recepción", icon: PackageCheck, permissions: ["transfer.manage"] },
      { href: "/loans", label: "Préstamos", icon: ClipboardCheck, permissions: ["document.transfer"] },
      { href: "/inventory", label: "Inventarios", icon: ClipboardList, permissions: ["document.transfer", "transfer.manage", "archive.manage"] },
      { href: "/locations", label: "Ubicaciones", icon: MapPin, permissions: ["archive.manage"] }
    ]
  },
  { label: "Correspondencia", icon: Mail, permissions: ["document.read", "mail.view", "mail.manage"], items: [{ href: "/correspondence", label: "Correspondencia", icon: Mail, permissions: ["document.read", "mail.view", "mail.manage"] }] },
  {
    label: "RRHH",
    icon: BriefcaseBusiness,
    permissions: ["hr.view", "hr.manage"],
    items: [
      { href: "/hr?view=employees", label: "Empleados", icon: BriefcaseBusiness, permissions: ["hr.view", "hr.manage"] },
      { href: "/hr?view=contracts", label: "Contratos", icon: FileText, permissions: ["hr.manage"] },
      { href: "/recruitment", label: "Reclutamiento", icon: Users, permissions: ["hr.view", "hr.manage", "recruit.view", "recruit.manage"] }
    ]
  },
  {
    label: "SST",
    icon: HeartPulse,
    permissions: ["hr.view", "hr.manage", "medical.view", "medical.manage"],
    items: [
      { href: "/sst/exams", label: "Exámenes", icon: HeartPulse, permissions: ["hr.view", "hr.manage", "medical.view", "medical.manage"] },
      { href: "/sst/alerts", label: "Alertas", icon: Activity, permissions: ["hr.view", "hr.manage", "medical.view", "medical.manage"] }
    ]
  },
  { label: "BI", icon: BarChart3, permissions: ["bi.view", "analytics.view"], items: [{ href: "/bi", label: "BI", icon: BarChart3, permissions: ["bi.view", "analytics.view"] }] },
  { label: "Auditoría", icon: FileSearch, permissions: ["audit.view"], items: [{ href: "/audit", label: "Auditoría", icon: FileSearch, permissions: ["audit.view"] }] },
  { label: "Seguridad", icon: ShieldCheck, permissions: ["users.manage"], items: [{ href: "/security", label: "Seguridad", icon: ShieldCheck, permissions: ["users.manage"] }] },
  { label: "Configuración", icon: Settings, permissions: ["platform.view", "integration.manage", "webhook.manage", "signature.manage", "workflow.manage"], items: [{ href: "/settings", label: "Configuración", icon: ServerCog, permissions: ["platform.view", "integration.manage", "webhook.manage", "signature.manage", "workflow.manage"] }] }
];

const quickActions: Record<string, { label: string; href: string }> = {
  "/dashboard": { label: "Ver tareas", href: "/tasks" },
  "/expedients": { label: "Nuevo expediente", href: "/expedients" },
  "/documents": { label: "Nuevo documento", href: "/documents" },
  "/digitization": { label: "Subir lote", href: "/digitization" },
  "/trd": { label: "Importar TRD", href: "/trd?view=typologies" },
  "/archives": { label: "Crear archivo", href: "/archives" },
  "/kardex": { label: "Buscar trazabilidad", href: "/traceability" },
  "/transfer-batches": { label: "Nueva transferencia", href: "/transfer-batches" },
  "/reception": { label: "Revisar recepción", href: "/reception" },
  "/loans": { label: "Crear préstamo", href: "/loans" },
  "/inventory": { label: "Ver ubicación", href: "/locations" },
  "/locations": { label: "Crear caja", href: "/boxes" },
  "/correspondence": { label: "Radicar", href: "/correspondence" },
  "/hr": { label: "Nuevo empleado", href: "/hr?view=employees" },
  "/recruitment": { label: "Nueva vacante", href: "/recruitment" },
  "/sst/exams": { label: "Programar examen", href: "/sst/exams" },
  "/audit": { label: "Exportar auditoría", href: "/audit" },
  "/security": { label: "Crear usuario", href: "/users" },
  "/settings": { label: "Estado sistema", href: "/platform" }
};

function pathOf(href: string) {
  return href.split("?")[0];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => (typeof window !== "undefined" ? window.localStorage.getItem("ambar_sidebar_collapsed") === "1" : false));
  const [darkMode, setDarkMode] = useState(() => (typeof window !== "undefined" ? window.localStorage.getItem("ambar_theme") === "dark" : false));
  const [selectedArchive, setSelectedArchive] = useState("");
  const [sidebarQuery, setSidebarQuery] = useState("");
  const cachedUser = getCurrentUser();
  const currentUser = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const { data } = await api.get<CurrentUser>("/auth/me");
      saveCurrentUser(data);
      return data;
    },
    initialData: cachedUser ?? undefined,
    staleTime: 60000
  });
  const permissions = currentUser.data?.permissions ?? getStoredPermissions();
  const archives = useQuery({ queryKey: ["shell", "archives"], queryFn: async () => (await api.get<ArchiveOption[]>("/archives")).data, enabled: hasAnyPermission(permissions, ["document.read", "archive.manage"]) });
  const notifications = useQuery({ queryKey: ["shell", "notifications"], queryFn: async () => (await api.get<NotificationItem[]>("/notifications")).data, enabled: hasAnyPermission(permissions, ["notification.read"]) });

  const toggleSidebar = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("ambar_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setDarkMode((value) => {
      const next = !value;
      window.localStorage.setItem("ambar_theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  const visibleGroups = useMemo(() => groups
    .map((group) => ({ ...group, items: group.items.filter((item) => hasAnyPermission(permissions, item.permissions)) }))
    .filter((group) => group.items.length > 0 || hasAnyPermission(permissions, group.permissions)), [permissions]);

  const filteredGroups = useMemo(() => visibleGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !sidebarQuery.trim() || `${group.label} ${item.label}`.toLowerCase().includes(sidebarQuery.trim().toLowerCase()))
    }))
    .filter((group) => group.items.length > 0), [sidebarQuery, visibleGroups]);

  const currentHref = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const isActive = useCallback((href: string) => {
    if (href === currentHref) return true;
    if (!href.includes("?")) return pathname === href;
    const [hrefPath, hrefQuery] = href.split("?");
    const hrefView = new URLSearchParams(hrefQuery).get("view");
    return pathname === hrefPath && searchParams.get("view") === hrefView;
  }, [currentHref, pathname, searchParams]);

  const breadcrumbItems = useMemo(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some((item) => isActive(item.href) || pathname === pathOf(item.href)));
    const activeItem = activeGroup?.items.find((item) => isActive(item.href)) ?? activeGroup?.items.find((item) => pathname === pathOf(item.href));
    return [activeGroup?.label ?? "AMBAR", activeItem?.label ?? "Operación"];
  }, [isActive, pathname, visibleGroups]);

  const action = quickActions[pathname] ?? quickActions[pathOf(currentHref)] ?? { label: "Acción", href: "/dashboard" };

  return (
    <div className={`app-shell ${collapsed ? "collapsed sidebar-collapsed" : ""}`} data-theme={darkMode ? "dark" : "light"}>
      <aside className="sidebar">
        <div className="side-brand sidebar-brand-block">
          <button className="icon-btn sidebar-toggle" type="button" onClick={toggleSidebar} title={collapsed ? "Expandir menú" : "Contraer menú"}>
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
          <Link className="side-logo" href="/dashboard" aria-label="AMBAR"><FolderKanban size={22} /></Link>
          <div className="b-text grow">
            <div className="b-name brand">AMBAR</div>
            <div className="b-sub muted">SGDEA Enterprise</div>
          </div>
        </div>

        <label className="side-search sidebar-search" title="Buscar en menú">
          <Search size={15} />
          <input value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} placeholder="Buscar módulo..." />
        </label>

        <nav className="side-nav nav nav-enterprise">
          {filteredGroups.map((group) => {
            const GroupIcon = group.icon;
            const open = group.items.some((item) => pathname === pathOf(item.href));
            return (
              <details className="nav-group" key={group.label} open={open || group.label === "Dashboard"}>
                <summary className="nav-grp-btn nav-group-title" title={group.label}>
                  <GroupIcon size={17} className="g-ico" />
                  <span className="g-label grow">{group.label}</span>
                  <ChevronDown className="nav-chevron chev" size={15} />
                </summary>
                <div className="nav-items nav-subitems">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link key={`${group.label}-${item.label}-${item.href}`} className={`nav-link${active ? " active" : ""}`} href={item.href} title={item.label}>
                        <Icon size={16} className="l-ico" />
                        <span className="l-label grow">{item.label}</span>
                        {item.badge ? <small className="l-badge">{item.badge}</small> : null}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}

          <div className="nav-smart-section subtle">
            <span><Bell size={13} /> Accesos rápidos</span>
            <Link href="/notifications">Notificaciones</Link>
            <Link href="/tasks">Tareas</Link>
            <Link href="/empleo">Portal empleo</Link>
          </div>

          <button type="button" onClick={() => { clearSession(); router.push("/login"); }}><LogOut size={18} /> <span>Salir</span></button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="crumbs breadcrumbs compact-breadcrumbs"><span>{breadcrumbItems[0]}</span><span>{breadcrumbItems[1]}</span></div>
            <SearchCommand />
          </div>
          <div className="topbar-actions">
            <select className="archive-selector" value={selectedArchive} onChange={(event) => setSelectedArchive(event.target.value)} aria-label="Archivo actual">
              <option value="">Todos los archivos</option>
              {archives.data?.map((archive) => <option key={archive.idArchive} value={archive.idArchive}>{archive.archive_name}</option>)}
            </select>
            <NotificationCenter items={notifications.data ?? []} loading={notifications.isLoading} />
            <button className="icon-btn icon-button" type="button" onClick={toggleTheme} title={darkMode ? "Modo claro" : "Modo oscuro"}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
            <div className="avatar user-avatar" title={currentUser.data?.email ?? "Sesión activa"}>{currentUser.data?.name?.slice(0, 1) ?? "A"}</div>
          </div>
        </header>
        <div className="content route-enter">{children}</div>
        <Link className="context-fab" href={action.href}><Plus size={18} /><span>{action.label}</span></Link>
      </main>
    </div>
  );
}
