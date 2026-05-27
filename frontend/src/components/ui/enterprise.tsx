"use client";

import Link from "next/link";
import { Bell, CheckCircle2, ChevronRight, ExternalLink, Inbox, Loader2, Search, ShieldAlert } from "lucide-react";
import { ReactNode } from "react";

export function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav className="breadcrumbs">
      {items.map((item) => <span key={item}>{item}</span>)}
    </nav>
  );
}

export function PageHeader({ title, description, eyebrow, action }: { title: string; description: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-actions">{action}</div> : null}
    </header>
  );
}

export function StatusBadge({ value, tone = "neutral" }: { value: string | number; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`badge badge-${tone}`}>{value}</span>;
}

export function MetricCard({ label, value, tone = "neutral", cta, href }: { label: string; value: string | number; tone?: "success" | "warning" | "danger" | "info" | "neutral"; cta?: string; href?: string }) {
  const content = (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {cta ? <small>{cta}</small> : null}
    </article>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Inbox size={20} />}</div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: rows }).map((_, index) => <div className="skeleton" key={index} />)}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="data-table">{children}</div>;
}

export function TimelineEvent({ state, title, description, meta, tone = "neutral", action }: { state: string; title: string; description?: string; meta?: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral"; action?: ReactNode }) {
  return (
    <article className={`timeline-event timeline-${tone}`}>
      <div className="timeline-dot" />
      <div className="timeline-card">
        <div className="toolbar space-between">
          <StatusBadge value={state} tone={tone} />
          {meta ? <span className="muted">{meta}</span> : null}
        </div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
        {action ? <div className="toolbar">{action}</div> : null}
      </div>
    </article>
  );
}

export function DetailDrawer({ title, subtitle, open, onClose, children }: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true">
      <button className="drawer-scrim" type="button" aria-label="Cerrar detalle" onClick={onClose} />
      <aside className="detail-drawer">
        <div className="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="ghost" type="button" onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function SearchCommand() {
  return (
    <Link className="search-command" href="/search">
      <Search size={16} />
      <span>Buscar expediente, caja, empleado...</span>
      <kbd>/</kbd>
    </Link>
  );
}

export type NotificationItem = {
  idNotification: number;
  title?: string;
  message: string;
  module?: string;
  type?: string;
  status?: string;
  priority?: "low" | "normal" | "high" | "critical";
  archive_name?: string | null;
  action_label?: string | null;
  action_url: string | null;
  created_at?: string;
};

function notificationTone(item: NotificationItem) {
  if (item.priority === "critical") return "danger" as const;
  if (item.priority === "high") return "warning" as const;
  if (item.status === "resolved" || item.status === "dismissed") return "neutral" as const;
  return item.status === "action_required" ? "info" as const : "neutral" as const;
}

export function NotificationCenter({ items, loading }: { items: NotificationItem[]; loading?: boolean }) {
  const actionable = items.filter((item) => !["read", "resolved", "dismissed", "actioned"].includes(item.status ?? "unread"));
  const critical = actionable.filter((item) => item.priority === "critical");
  return (
    <details className="notification-center">
      <summary aria-label="Notificaciones">
        <Bell size={18} />
        {actionable.length > 0 ? <span>{actionable.length}</span> : null}
      </summary>
      <div className="notification-panel">
        <div className="toolbar space-between">
          <strong>Centro accionable</strong>
          <StatusBadge value={critical.length ? `${critical.length} criticas` : `${actionable.length} pendientes`} tone={critical.length ? "danger" : actionable.length ? "warning" : "neutral"} />
        </div>
        {loading ? <LoadingSkeleton rows={3} /> : null}
        {!loading && actionable.length === 0 ? <EmptyState icon={<CheckCircle2 size={20} />} title="Todo al dia" description="No hay acciones criticas por revisar." /> : null}
        <div className="notification-list">
          {actionable.slice(0, 6).map((item) => (
            <article key={`${item.module ?? item.type}-${item.idNotification}`}>
              <div className="toolbar space-between">
                <StatusBadge value={item.priority ?? "normal"} tone={notificationTone(item)} />
                <small className="muted">{item.module ?? item.type ?? "AMBAR"}</small>
              </div>
              <strong>{item.title ?? item.message}</strong>
              <p>{item.message}</p>
              {item.archive_name ? <small className="muted">{item.archive_name}</small> : null}
              {item.action_url ? <Link href={item.action_url}>{item.action_label ?? "Abrir"} <ExternalLink size={13} /></Link> : <span className="muted">Sin accion directa</span>}
            </article>
          ))}
        </div>
        <Link className="inline-link" href="/notifications">Ver centro completo <ChevronRight size={14} /></Link>
      </div>
    </details>
  );
}

export function AccessWarning({ children = "No tienes acceso a este archivo" }: { children?: ReactNode }) {
  return <span className="access-warning"><ShieldAlert size={14} /> {children}</span>;
}

export function SpinnerLabel({ children }: { children: ReactNode }) {
  return <span className="spinner-label"><Loader2 size={14} /> {children}</span>;
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="inline-link" href={href}>{children}<ChevronRight size={14} /></Link>;
}
