"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, BriefcaseBusiness, Building2, ChevronDown, ClipboardList, Database, FileBox, FilePenLine, FileText, FolderKanban, Gauge, Layers3, Link2, ListChecks, LogOut, MapPin, Menu, Moon, PackageCheck, PlugZap, Route, Search, ServerCog, ShieldCheck, Sun, TableProperties, Users, Warehouse, Zap } from "lucide-react";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { clearSession, CurrentUser, getCurrentUser, getStoredPermissions, hasAnyPermission, saveCurrentUser } from "@/lib/auth";
import { NotificationCenter, NotificationItem, SearchCommand } from "@/components/ui/enterprise";

type NavItem = { href: string; label: string; icon: typeof Gauge; permissions: string[]; badge?: string };
type NavGroup = { label: string; icon: typeof Gauge; items: NavItem[]; permissions: string[] };
type ArchiveOption = { idArchive: number; archive_name: string; archive_code?: string };

const groups: NavGroup[] = [
  { label: "Dashboard", icon: Gauge, permissions: ["analytics.view", "bi.view"], items: [{ href: "/dashboard", label: "Centro operacional", icon: Gauge, permissions: ["analytics.view", "bi.view"] }] },
  {
    label: "Gestion Documental",
    icon: FileText,
    permissions: ["document.read", "document.read_all", "document.create", "document.update"],
    items: [
      { href: "/expedients", label: "Expedientes", icon: FolderKanban, permissions: ["document.read", "document.create"] },
      { href: "/documents", label: "Documentos", icon: FileText, permissions: ["document.read", "document.read_all", "document.create", "document.update"] },
      { href: "/folders", label: "Carpetas", icon: FileBox, permissions: ["document.read", "document.create"] },
      { href: "/repository", label: "Repositorio", icon: Database, permissions: ["document.read"] },
      { href: "/foliation", label: "Foliacion", icon: ListChecks, permissions: ["document.update"] }
    ]
  },
  {
    label: "TRD",
    icon: TableProperties,
    permissions: ["trd.manage"],
    items: [
      { href: "/trd?view=series", label: "Series", icon: TableProperties, permissions: ["trd.manage"] },
      { href: "/trd?view=subseries", label: "Subseries", icon: Layers3, permissions: ["trd.manage"] },
      { href: "/trd?view=retention", label: "Retencion", icon: ClipboardList, permissions: ["trd.manage"] },
      { href: "/trd?view=disposition", label: "Disposicion final", icon: PackageCheck, permissions: ["trd.manage"] }
    ]
  },
  {
    label: "Custodia",
    icon: Warehouse,
    permissions: ["document.transfer", "transfer.manage", "transfer.batch_manage", "archive.manage"],
    items: [
      { href: "/archives", label: "Archivos", icon: Building2, permissions: ["document.read", "archive.manage"] },
      { href: "/transfer-batches", label: "Transferencias", icon: Warehouse, permissions: ["transfer.batch_manage", "document.transfer"] },
      { href: "/reception", label: "Recepcion", icon: PackageCheck, permissions: ["transfer.manage"] },
      { href: "/kardex", label: "Kardex", icon: Route, permissions: ["document.transfer", "transfer.manage"] },
      { href: "/loans", label: "Prestamos", icon: PackageCheck, permissions: ["document.transfer"] },
      { href: "/inventory", label: "Inventarios", icon: ClipboardList, permissions: ["document.transfer", "transfer.manage"] },
      { href: "/fuid", label: "FUID", icon: ClipboardList, permissions: ["document.transfer", "transfer.manage"] },
      { href: "/locations", label: "Ubicaciones", icon: MapPin, permissions: ["archive.manage"] }
    ]
  },
  {
    label: "RRHH",
    icon: BriefcaseBusiness,
    permissions: ["hr.view", "hr.manage"],
    items: [
      { href: "/hr?view=employees", label: "Empleados", icon: BriefcaseBusiness, permissions: ["hr.view", "hr.manage"] },
      { href: "/hr?view=candidates", label: "Candidatos", icon: Users, permissions: ["hr.view", "hr.manage"] },
      { href: "/hr?view=expedients", label: "Expedientes laborales", icon: FolderKanban, permissions: ["hr.view", "hr.manage"] },
      { href: "/hr?view=contracts", label: "Contratos", icon: FileText, permissions: ["hr.manage"] },
      { href: "/hr?view=positions", label: "Cargos", icon: Users, permissions: ["hr.manage"] },
      { href: "/hr?view=departments", label: "Dependencias", icon: Building2, permissions: ["hr.manage"] }
    ]
  },
  { label: "Busqueda", icon: Search, permissions: ["search.query", "search.reindex", "ocr.manage"], items: [{ href: "/search?view=global", label: "Global", icon: Search, permissions: ["search.query"] }, { href: "/search?view=advanced", label: "Avanzada", icon: Database, permissions: ["search.query"] }, { href: "/ocr", label: "OCR futuro", icon: Bot, permissions: ["ocr.manage"] }] },
  { label: "Auditoria", icon: ShieldCheck, permissions: ["audit.view"], items: [{ href: "/audit", label: "Eventos y seguridad", icon: ShieldCheck, permissions: ["audit.view"] }] },
  { label: "Plataforma", icon: ServerCog, permissions: ["signature.manage", "integration.manage", "webhook.manage", "platform.view", "users.manage", "archive.manage", "workflow.manage"], items: [{ href: "/users", label: "Seguridad", icon: ShieldCheck, permissions: ["users.manage"] }, { href: "/integrations", label: "Integraciones", icon: PlugZap, permissions: ["integration.manage"] }, { href: "/webhooks", label: "Webhooks", icon: Link2, permissions: ["webhook.manage"] }, { href: "/signatures", label: "Firmas", icon: FilePenLine, permissions: ["signature.manage"] }, { href: "/platform", label: "Configuracion", icon: ServerCog, permissions: ["platform.view"] }, { href: "/workflows", label: "Automatizacion", icon: Zap, permissions: ["workflow.manage"] }] }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
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
  const visibleGroups = useMemo(() => groups
    .map((group) => ({ ...group, items: group.items.filter((item) => hasAnyPermission(permissions, item.permissions)) }))
    .filter((group) => group.items.length > 0 || hasAnyPermission(permissions, group.permissions)), [permissions]);
  const filteredGroups = useMemo(() => visibleGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !sidebarQuery.trim() || `${group.label} ${item.label}`.toLowerCase().includes(sidebarQuery.trim().toLowerCase()))
    }))
    .filter((group) => group.items.length > 0), [sidebarQuery, visibleGroups]);
  const archives = useQuery({ queryKey: ["shell", "archives"], queryFn: async () => (await api.get<ArchiveOption[]>("/archives")).data, enabled: hasAnyPermission(permissions, ["document.read", "archive.manage"]) });
  const notifications = useQuery({
    queryKey: ["shell", "notifications"],
    queryFn: async () => (await api.get<NotificationItem[]>("/notifications")).data,
    enabled: hasAnyPermission(permissions, ["notification.read"])
  });
  const queryString = searchParams.toString();
  const currentHref = queryString ? `${pathname}?${queryString}` : pathname;
  const pathOf = useCallback((href: string) => href.split("?")[0], []);
  const isActive = useCallback((href: string) => {
    if (href === currentHref) return true;
    if (!href.includes("?")) return pathname === href;
    const [hrefPath, hrefQuery] = href.split("?");
    const hrefView = new URLSearchParams(hrefQuery).get("view");
    const currentView = searchParams.get("view");
    return pathname === hrefPath && currentView === hrefView;
  }, [currentHref, pathname, searchParams]);
  const breadcrumbItems = useMemo(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some((item) => isActive(item.href) || pathname === pathOf(item.href)));
    const activeItem = activeGroup?.items.find((item) => isActive(item.href)) ?? activeGroup?.items.find((item) => pathname === pathOf(item.href));
    return [activeGroup?.label ?? "AMBAR", activeItem?.label ?? "Operacion"];
  }, [isActive, pathOf, pathname, visibleGroups]);
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`} data-theme={darkMode ? "dark" : "light"}>
      <aside className="sidebar">
        <div className="sidebar-brand-block">
          <button className="sidebar-toggle" type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expandir menu" : "Contraer menu"}><Menu size={17} /></button>
          <div><div className="brand">AMBAR</div><div className="muted">SGDEA enterprise</div></div>
        </div>
        <label className="sidebar-search" title="Buscar en menu">
          <Search size={15} />
          <input value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} placeholder="Buscar modulo..." />
        </label>
        <nav className="nav nav-enterprise">
          {filteredGroups.map((group) => {
            const GroupIcon = group.icon;
            const open = group.items.some((item) => pathname === pathOf(item.href));
            return (
              <details className="nav-group" key={group.label} open={open || group.label === "Dashboard"}>
                <summary className="nav-group-title" title={group.label}><GroupIcon size={17} /> <span>{group.label}</span><ChevronDown className="nav-chevron" size={15} /></summary>
                <div className="nav-subitems">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return <Link key={`${group.label}-${item.label}-${item.href}`} className={active ? "active" : ""} href={item.href} title={item.label}><Icon size={16} /> <span>{item.label}</span>{item.badge ? <small>{item.badge}</small> : null}</Link>;
                  })}
                </div>
              </details>
            );
          })}
          <button type="button" onClick={() => { clearSession(); router.push("/login"); }}><LogOut size={18} /> <span>Salir</span></button>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="topbar-left"><div className="breadcrumbs compact-breadcrumbs">{breadcrumbItems.map((item) => <span key={item}>{item}</span>)}</div><SearchCommand /></div>
          <div className="topbar-actions">
            <select className="archive-selector" value={selectedArchive} onChange={(event) => setSelectedArchive(event.target.value)} aria-label="Archivo actual"><option value="">Todos los archivos</option>{archives.data?.map((archive) => <option key={archive.idArchive} value={archive.idArchive}>{archive.archive_name}</option>)}</select>
            <NotificationCenter items={notifications.data ?? []} loading={notifications.isLoading} />
            <button className="icon-button" type="button" onClick={() => setDarkMode((value) => !value)} title={darkMode ? "Modo claro" : "Modo oscuro"}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
            <div className="user-avatar" title={currentUser.data?.email ?? "Sesion activa"}>{currentUser.data?.name?.slice(0, 1) ?? "A"}</div>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
