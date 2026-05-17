"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Bot, BriefcaseBusiness, BarChart3, ClipboardCheck, ClipboardList, FilePenLine, FileText, Gauge, GitBranch, Link2, LogOut, PlugZap, Route, Search, ServerCog, ShieldCheck, TableProperties, Users, Warehouse } from "lucide-react";
import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { clearSession, CurrentUser, getCurrentUser, getStoredPermissions, hasAnyPermission, saveCurrentUser } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, permissions: ["analytics.view", "bi.view"] },
  { href: "/documents", label: "Documentos", icon: FileText, permissions: ["document.read", "document.read_all", "document.create", "document.update"] },
  { href: "/trd", label: "TRD", icon: TableProperties, permissions: ["trd.manage"] },
  { href: "/kardex", label: "Kardex", icon: Route, permissions: ["document.transfer", "transfer.manage"] },
  { href: "/workflows", label: "Workflows", icon: GitBranch, permissions: ["workflow.manage"] },
  { href: "/tasks", label: "Tareas", icon: ClipboardCheck, permissions: ["task.manage"] },
  { href: "/hr", label: "RRHH", icon: BriefcaseBusiness, permissions: ["hr.view", "hr.manage"] },
  { href: "/transfer-batches", label: "Lotes", icon: Warehouse, permissions: ["transfer.batch_manage"] },
  { href: "/reports", label: "Reportes", icon: ClipboardList, permissions: ["report.request"] },
  { href: "/search", label: "Busqueda", icon: Search, permissions: ["search.query", "search.reindex"] },
  { href: "/ocr", label: "OCR", icon: Bot, permissions: ["ocr.manage"] },
  { href: "/signatures", label: "Firmas", icon: FilePenLine, permissions: ["signature.manage"] },
  { href: "/integrations", label: "Integraciones", icon: PlugZap, permissions: ["integration.manage"] },
  { href: "/webhooks", label: "Webhooks", icon: Link2, permissions: ["webhook.manage"] },
  { href: "/bi", label: "BI", icon: BarChart3, permissions: ["bi.view", "bi.refresh"] },
  { href: "/platform", label: "Plataforma", icon: ServerCog, permissions: ["platform.view"] },
  { href: "/audit", label: "Auditoria", icon: ShieldCheck, permissions: ["audit.view"] },
  { href: "/users", label: "Usuarios", icon: Users, permissions: ["users.manage"] },
  { href: "/notifications", label: "Notificaciones", icon: Bell, permissions: ["notification.read"] }
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
  const visibleNav = nav.filter((item) => hasAnyPermission(permissions, item.permissions));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Ambar</div>
          <div className="muted">Control documental enterprise</div>
        </div>
        <nav className="nav">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} style={{ background: pathname === item.href ? "#263238" : undefined }}>
                <Icon size={18} /> {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => { clearSession(); router.push("/login"); }}>
            <LogOut size={18} /> Salir
          </button>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <span><ClipboardList size={18} /> Fase 4 Enterprise+</span>
          <span className="status">{currentUser.data?.roles.join(", ") || "Sesion activa"}</span>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
