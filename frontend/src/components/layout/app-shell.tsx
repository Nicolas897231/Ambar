"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, BarChart3, Bell, Bot, Boxes, BriefcaseBusiness, Building2, ChevronDown, ClipboardCheck, ClipboardList, Database, FileBox, FilePenLine, FileText, FolderKanban, Gauge, Layers3, Link2, ListChecks, LogOut, MapPin, PackageCheck, PlugZap, Route, Search, ServerCog, ShieldCheck, TableProperties, Users, Warehouse } from "lucide-react";
import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { clearSession, CurrentUser, getCurrentUser, getStoredPermissions, hasAnyPermission, saveCurrentUser } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: typeof Gauge; permissions: string[]; badge?: string };
type NavGroup = { label: string; icon: typeof Gauge; items: NavItem[]; permissions: string[] };

const groups: NavGroup[] = [
  {
    label: "Inicio",
    icon: Gauge,
    permissions: ["analytics.view", "bi.view"],
    items: [{ href: "/dashboard", label: "Dashboard", icon: Gauge, permissions: ["analytics.view", "bi.view"] }]
  },
  {
    label: "Gestion Documental",
    icon: FileText,
    permissions: ["document.read", "document.read_all", "document.create", "document.update"],
    items: [
      { href: "/expedients", label: "Expedientes", icon: FolderKanban, permissions: ["document.read", "document.create"] },
      { href: "/folders", label: "Carpetas", icon: FileBox, permissions: ["document.read", "document.create"] },
      { href: "/documents", label: "Documentos", icon: FileText, permissions: ["document.read", "document.read_all", "document.create", "document.update"] },
      { href: "/foliation", label: "Foliacion", icon: ListChecks, permissions: ["document.update"] },
      { href: "/repository", label: "Repositorio", icon: Database, permissions: ["document.read"] }
    ]
  },
  {
    label: "TRD",
    icon: TableProperties,
    permissions: ["trd.manage"],
    items: [
      { href: "/trd", label: "Series", icon: TableProperties, permissions: ["trd.manage"] },
      { href: "/trd", label: "Subseries", icon: Layers3, permissions: ["trd.manage"] },
      { href: "/trd", label: "Retencion", icon: ClipboardList, permissions: ["trd.manage"] },
      { href: "/trd", label: "Disposicion final", icon: PackageCheck, permissions: ["trd.manage"] },
      { href: "/trd", label: "Tipos documentales", icon: FileText, permissions: ["trd.manage"] }
    ]
  },
  {
    label: "Custodia Documental",
    icon: Warehouse,
    permissions: ["document.transfer", "transfer.manage", "transfer.batch_manage", "archive.manage"],
    items: [
      { href: "/archives", label: "Archivos", icon: Building2, permissions: ["document.read", "archive.manage"] },
      { href: "/kardex", label: "Kardex", icon: Route, permissions: ["document.transfer", "transfer.manage"] },
      { href: "/transfer-batches", label: "Transferencias", icon: Warehouse, permissions: ["transfer.batch_manage", "document.transfer"] },
      { href: "/reception", label: "Recepcion", icon: PackageCheck, permissions: ["transfer.manage"] },
      { href: "/fuid", label: "Inventarios / FUID", icon: ClipboardList, permissions: ["document.transfer", "transfer.manage"] },
      { href: "/boxes", label: "Cajas", icon: Boxes, permissions: ["archive.manage"] },
      { href: "/shelves", label: "Estanterias", icon: Archive, permissions: ["archive.manage"] },
      { href: "/loans", label: "Prestamos", icon: PackageCheck, permissions: ["document.transfer"] },
      { href: "/traceability", label: "Trazabilidad", icon: Route, permissions: ["document.read"] },
      { href: "/locations", label: "Ubicaciones", icon: MapPin, permissions: ["archive.manage"] },
      { href: "/custodians", label: "Custodios", icon: Users, permissions: ["archive.manage"] }
    ]
  },
  {
    label: "Gestion Humana",
    icon: BriefcaseBusiness,
    permissions: ["hr.view", "hr.manage"],
    items: [
      { href: "/hr", label: "Empleados", icon: BriefcaseBusiness, permissions: ["hr.view", "hr.manage"] },
      { href: "/hr", label: "Expedientes laborales", icon: FolderKanban, permissions: ["hr.view", "hr.manage"] },
      { href: "/hr", label: "Contratos", icon: FileText, permissions: ["hr.manage"] },
      { href: "/hr", label: "Afiliaciones", icon: ClipboardCheck, permissions: ["hr.manage"] },
      { href: "/hr", label: "Novedades", icon: ListChecks, permissions: ["hr.manage"] }
    ]
  },
  {
    label: "Busqueda",
    icon: Search,
    permissions: ["search.query", "search.reindex", "ocr.manage"],
    items: [
      { href: "/search", label: "Global", icon: Search, permissions: ["search.query"] },
      { href: "/search", label: "Avanzada", icon: Database, permissions: ["search.query"] },
      { href: "/ocr", label: "OCR", icon: Bot, permissions: ["ocr.manage"] }
    ]
  },
  {
    label: "Inteligencia y Reportes",
    icon: BarChart3,
    permissions: ["bi.view", "report.request"],
    items: [
      { href: "/bi", label: "BI", icon: BarChart3, permissions: ["bi.view", "bi.refresh"] },
      { href: "/reports", label: "Reportes", icon: ClipboardList, permissions: ["report.request"] },
      { href: "/bi", label: "Indicadores", icon: Gauge, permissions: ["bi.view", "bi.refresh"] }
    ]
  },
  {
    label: "Plataforma",
    icon: ServerCog,
    permissions: ["signature.manage", "integration.manage", "webhook.manage", "platform.view", "audit.view"],
    items: [
      { href: "/integrations", label: "Integraciones", icon: PlugZap, permissions: ["integration.manage"] },
      { href: "/webhooks", label: "Webhooks", icon: Link2, permissions: ["webhook.manage"] },
      { href: "/audit", label: "Auditoria", icon: ShieldCheck, permissions: ["audit.view"] },
      { href: "/signatures", label: "Firmas", icon: FilePenLine, permissions: ["signature.manage"] },
      { href: "/platform", label: "Configuracion", icon: ServerCog, permissions: ["platform.view"] }
    ]
  },
  {
    label: "Seguridad",
    icon: ShieldCheck,
    permissions: ["users.manage", "archive.manage", "notification.read"],
    items: [
      { href: "/users", label: "Usuarios", icon: Users, permissions: ["users.manage"] },
      { href: "/roles", label: "Roles", icon: ShieldCheck, permissions: ["users.manage"] },
      { href: "/hr", label: "Cargos", icon: BriefcaseBusiness, permissions: ["hr.manage", "users.manage"] },
      { href: "/roles", label: "Permisos", icon: ClipboardCheck, permissions: ["users.manage"] },
      { href: "/archives", label: "Accesos por Archivo", icon: Building2, permissions: ["archive.manage"] },
      { href: "/notifications", label: "Notificaciones", icon: Bell, permissions: ["notification.read"] }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => hasAnyPermission(permissions, item.permissions)) }))
    .filter((group) => group.items.length > 0 || hasAnyPermission(permissions, group.permissions));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand-block">
          <div className="brand">Ambar</div>
          <div className="muted">SGDEA enterprise</div>
        </div>
        <nav className="nav nav-enterprise">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const open = group.items.some((item) => pathname === item.href);
            return (
              <details className="nav-group" key={group.label} open={open || group.label === "Inicio"}>
                <summary className="nav-group-title"><GroupIcon size={17} /> <span>{group.label}</span><ChevronDown className="nav-chevron" size={15} /></summary>
                <div className="nav-subitems">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link key={`${group.label}-${item.label}-${item.href}`} className={active ? "active" : ""} href={item.href}>
                        <Icon size={16} /> <span>{item.label}</span>{item.badge ? <small>{item.badge}</small> : null}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
          <button type="button" onClick={() => { clearSession(); router.push("/login"); }}>
            <LogOut size={18} /> Salir
          </button>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <span><ClipboardList size={18} /> Operacion archivistica enterprise</span>
          <span className="status">{currentUser.data?.roles.join(", ") || "Sesion activa"}</span>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
