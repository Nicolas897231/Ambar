"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Bot, BriefcaseBusiness, BarChart3, ClipboardCheck, ClipboardList, FilePenLine, FileText, Gauge, GitBranch, Link2, LogOut, PlugZap, Route, Search, ServerCog, ShieldCheck, TableProperties, Users, Warehouse } from "lucide-react";
import { ReactNode } from "react";
import { clearSession } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/documents", label: "Documentos", icon: FileText },
  { href: "/trd", label: "TRD", icon: TableProperties },
  { href: "/kardex", label: "Kardex", icon: Route },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/tasks", label: "Tareas", icon: ClipboardCheck },
  { href: "/hr", label: "RRHH", icon: BriefcaseBusiness },
  { href: "/transfer-batches", label: "Lotes", icon: Warehouse },
  { href: "/reports", label: "Reportes", icon: ClipboardList },
  { href: "/search", label: "Busqueda", icon: Search },
  { href: "/ocr", label: "OCR", icon: Bot },
  { href: "/signatures", label: "Firmas", icon: FilePenLine },
  { href: "/integrations", label: "Integraciones", icon: PlugZap },
  { href: "/webhooks", label: "Webhooks", icon: Link2 },
  { href: "/bi", label: "BI", icon: BarChart3 },
  { href: "/platform", label: "Plataforma", icon: ServerCog },
  { href: "/audit", label: "Auditoria", icon: ShieldCheck },
  { href: "/users", label: "Usuarios", icon: Users },
  { href: "/notifications", label: "Notificaciones", icon: Bell }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Ambar</div>
          <div className="muted">Control documental enterprise</div>
        </div>
        <nav className="nav">
          {nav.map((item) => {
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
          <span className="status">OCR + Firmas + Integraciones + BI</span>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}