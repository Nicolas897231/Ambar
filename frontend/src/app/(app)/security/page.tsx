"use client";

import Link from "next/link";
import { KeyRound, ShieldCheck, UserCog, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type UserItem = { identification: string; name: string; email: string; status: string; roles?: string[] };

export default function SecurityPage() {
  const users = useQuery({ queryKey: ["security-users"], queryFn: async () => (await api.get<UserItem[]>("/users")).data });
  const items = users.data ?? [];
  return (
    <>
      <PageTitle title="Seguridad" description="Usuarios, perfiles, permisos por accion, MFA y acceso por archivo." action={<div className="toolbar"><Link className="button-link" href="/users">Administrar usuarios</Link><Link className="ghost" href="/roles">Perfiles</Link></div>} />
      <section className="metrics">
        <MetricCard label="Usuarios" value={items.length} tone="info" />
        <MetricCard label="Activos" value={items.filter((item) => item.status === "active").length} tone="success" />
        <MetricCard label="Bloqueados" value={items.filter((item) => item.status === "locked").length} tone="danger" />
        <MetricCard label="Inactivos" value={items.filter((item) => item.status === "inactive").length} tone="warning" />
      </section>
      <section className="workspace-grid">
        <article className="workspace-card">
          <div className="toolbar space-between"><strong><Users size={17} /> Usuarios</strong><StatusBadge value="operativo" tone="success" /></div>
          <p className="muted">Alta, desactivacion segura, MFA preparado y archivos autorizados.</p>
          <Link className="inline-link" href="/users">Abrir usuarios</Link>
        </article>
        <article className="workspace-card">
          <div className="toolbar space-between"><strong><UserCog size={17} /> Perfiles</strong><StatusBadge value="matriz" tone="info" /></div>
          <p className="muted">Matriz operacional por modulo: ver, crear, editar, aprobar y auditar.</p>
          <Link className="inline-link" href="/roles">Abrir perfiles</Link>
        </article>
        <article className="workspace-card">
          <div className="toolbar space-between"><strong><KeyRound size={17} /> MFA</strong><StatusBadge value="opcional" tone="neutral" /></div>
          <p className="muted">La configuracion de MFA queda en el flujo de usuarios y se valida en backend al login.</p>
          <Link className="inline-link" href="/users">Configurar acceso</Link>
        </article>
      </section>
      <section className="card">
        <div className="toolbar space-between"><h2><ShieldCheck size={18} /> Usuarios recientes</h2><StatusBadge value="RBAC" tone="info" /></div>
        {users.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!users.isLoading && !items.length ? <EmptyState icon={<ShieldCheck size={20} />} title="Sin usuarios visibles" description="No hay usuarios disponibles o no tienes permiso para consultarlos." /> : null}
        {items.slice(0, 8).map((item) => <div className="service-card" key={item.identification}><span><strong>{item.name}</strong><br /><small className="muted">{item.email}</small></span><StatusBadge value={item.status} tone={item.status === "active" ? "success" : "warning"} /></div>)}
      </section>
    </>
  );
}
