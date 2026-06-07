"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, CheckCircle2, Plus, RefreshCcw, UserCheck, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DetailDrawer, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Candidate = { idCandidate: number; full_name: string; email?: string; phone?: string; position_applied: string; department: string; status: string };
type Vacancy = { idVacancy: number; vacancy_code: string; title: string; department: string; description?: string; requirements: string[]; status: string; location?: string; contract_type?: string };

const columns = [
  { key: "postulado", label: "Postulado" },
  { key: "entrevista", label: "Entrevista" },
  { key: "validacion", label: "Prueba tecnica" },
  { key: "aprobado", label: "Aprobado" },
  { key: "contratado", label: "Contratado" },
  { key: "rechazado", label: "Descartado" }
];

function tone(value: string) {
  if (value === "rechazado") return "danger" as const;
  if (["entrevista", "validacion"].includes(value)) return "warning" as const;
  if (["aprobado", "contratado"].includes(value)) return "success" as const;
  return "neutral" as const;
}

export default function RecruitmentPage() {
  const client = useQueryClient();
  const [drawer, setDrawer] = useState<"" | "vacancy" | "candidate">("");
  const [message, setMessage] = useState("");
  const [vacancyCode, setVacancyCode] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [candidatePosition, setCandidatePosition] = useState("");
  const [candidateDepartment, setCandidateDepartment] = useState("");

  const candidates = useQuery({ queryKey: ["recruitment-candidates"], queryFn: async () => (await api.get<Candidate[]>("/hr/candidates")).data });
  const vacancies = useQuery({ queryKey: ["hr-vacancies"], queryFn: async () => (await api.get<Vacancy[]>("/hr/vacancies")).data });
  const activeVacancies = useMemo(() => (vacancies.data ?? []).filter((item) => item.status === "open"), [vacancies.data]);

  const createVacancy = useMutation({
    mutationFn: async () => api.post("/hr/vacancies", { vacancy_code: vacancyCode, title, department, location: location || null, description: description || null, requirements: requirements.split(",").map((item) => item.trim()).filter(Boolean), status: "open" }),
    onSuccess: () => { setMessage("Vacante publicada en portal empleo."); setDrawer(""); setVacancyCode(""); setTitle(""); setDepartment(""); setLocation(""); setDescription(""); setRequirements(""); client.invalidateQueries({ queryKey: ["hr-vacancies"] }); }
  });
  const createCandidate = useMutation({
    mutationFn: async () => api.post("/hr/candidates", { candidate_code: `REC-${Date.now()}`, full_name: candidateName, email: candidateEmail || null, phone: candidatePhone || null, position_applied: candidatePosition, department: candidateDepartment, observations: "Creado desde reclutamiento." }),
    onSuccess: () => { setMessage("Candidato creado en pipeline."); setDrawer(""); setCandidateName(""); setCandidateEmail(""); setCandidatePhone(""); setCandidatePosition(""); setCandidateDepartment(""); candidates.refetch(); }
  });
  const updateCandidate = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => api.patch(`/hr/candidates/${id}/status`, { status, observation: `Cambio a ${status} desde pipeline.` }),
    onSuccess: () => candidates.refetch()
  });
  const hireCandidate = useMutation({
    mutationFn: async ({ id, identification }: { id: number; identification: string }) => api.post(`/hr/candidates/${id}/hire`, { identification }),
    onSuccess: () => { setMessage("Candidato contratado: expediente laboral creado sin duplicar hoja de vida."); candidates.refetch(); }
  });

  function submitVacancy(event: FormEvent) {
    event.preventDefault();
    createVacancy.mutate();
  }

  function submitCandidate(event: FormEvent) {
    event.preventDefault();
    createCandidate.mutate();
  }

  function contractCandidate(candidate: Candidate) {
    const identification = window.prompt("Numero de documento del empleado");
    if (identification?.trim()) hireCandidate.mutate({ id: candidate.idCandidate, identification: identification.trim() });
  }

  return (
    <>
      <PageTitle title="Reclutamiento" description="Pipeline documental: vacante, postulacion, validacion y contratacion sin duplicar documentos." action={<div className="toolbar"><Link className="ghost" href="/empleo">Ver portal empleo</Link><button onClick={() => setDrawer("vacancy")}><Plus size={17} /> Crear vacante</button><button className="ghost" onClick={() => { candidates.refetch(); vacancies.refetch(); }}><RefreshCcw size={17} /> Actualizar</button></div>} />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}
      <section className="metrics">
        <MetricCard label="Vacantes abiertas" value={activeVacancies.length} tone={activeVacancies.length ? "success" : "neutral"} />
        <MetricCard label="Candidatos" value={candidates.data?.length ?? 0} tone="info" />
        <MetricCard label="Aprobados" value={(candidates.data ?? []).filter((item) => item.status === "aprobado").length} tone="success" />
        <MetricCard label="Contratados" value={(candidates.data ?? []).filter((item) => item.status === "contratado").length} tone="neutral" />
      </section>
      <section className="card">
        <div className="toolbar space-between"><h2><BriefcaseBusiness size={18} /> Vacantes activas</h2><button className="ghost" onClick={() => setDrawer("candidate")}><Users size={16} /> Crear candidato interno</button></div>
        {!vacancies.isLoading && !activeVacancies.length ? <EmptyState icon={<BriefcaseBusiness size={20} />} title="Sin vacantes abiertas" description="Publica una vacante para alimentar el portal empleo." /> : null}
        <div className="workspace-grid">
          {activeVacancies.map((item) => (
            <article className="workspace-card" key={item.idVacancy}>
              <div className="toolbar space-between"><strong>{item.title}</strong><StatusBadge value={item.status} tone="success" /></div>
              <p className="muted">{item.department}{item.location ? ` / ${item.location}` : ""}</p>
              <p className="muted">{item.description ?? "Sin descripcion"}</p>
              <div className="checklist">{item.requirements.map((requirement) => <span className="status" key={requirement}>{requirement}</span>)}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="pipeline-board">
        {candidates.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {columns.map((column) => {
          const items = (candidates.data ?? []).filter((candidate) => candidate.status === column.key);
          return (
            <article className="pipeline-column" key={column.key}>
              <div className="toolbar space-between"><h3>{column.label}</h3><StatusBadge value={items.length} tone={items.length ? "info" : "neutral"} /></div>
              {items.map((candidate) => (
                <div className="candidate-card" key={candidate.idCandidate}>
                  <div className="toolbar space-between"><strong>{candidate.full_name}</strong><StatusBadge value={candidate.status} tone={tone(candidate.status)} /></div>
                  <p className="muted">{candidate.position_applied} / {candidate.department}</p>
                  <p className="muted">{candidate.email ?? "Sin correo"}</p>
                  <div className="inline-actions">
                    {candidate.status === "postulado" ? <button className="ghost" onClick={() => updateCandidate.mutate({ id: candidate.idCandidate, status: "entrevista" })}>Entrevista</button> : null}
                    {candidate.status === "entrevista" ? <button className="ghost" onClick={() => updateCandidate.mutate({ id: candidate.idCandidate, status: "validacion" })}>Prueba tecnica</button> : null}
                    {candidate.status === "validacion" ? <button className="ghost" onClick={() => updateCandidate.mutate({ id: candidate.idCandidate, status: "aprobado" })}><CheckCircle2 size={15} /> Aprobar</button> : null}
                    {candidate.status === "aprobado" ? <button className="ghost" onClick={() => contractCandidate(candidate)}><UserCheck size={15} /> Contratar</button> : null}
                  </div>
                </div>
              ))}
            </article>
          );
        })}
      </section>
      {!candidates.isLoading && !(candidates.data ?? []).length ? <EmptyState icon={<Users size={20} />} title="Sin candidatos" description="Los candidatos apareceran aqui al crearse internamente o aplicar desde el portal empleo." /> : null}

      <DetailDrawer title="Crear vacante" subtitle="Publica una vacante real para el portal empleo." open={drawer === "vacancy"} onClose={() => setDrawer("")}>
        <form className="grid two-columns" onSubmit={submitVacancy}>
          <label>Codigo<input value={vacancyCode} onChange={(event) => setVacancyCode(event.target.value)} required /></label>
          <label>Titulo<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>Dependencia<input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label>
          <label>Ubicacion<input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          <label className="full-span">Descripcion<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="full-span">Requisitos separados por coma<input value={requirements} onChange={(event) => setRequirements(event.target.value)} /></label>
          <button type="submit"><Plus size={17} /> Publicar vacante</button>
        </form>
      </DetailDrawer>

      <DetailDrawer title="Crear candidato" subtitle="Alta interna del pipeline." open={drawer === "candidate"} onClose={() => setDrawer("")}>
        <form className="grid two-columns" onSubmit={submitCandidate}>
          <label>Nombre completo<input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} required /></label>
          <label>Correo<input type="email" value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} /></label>
          <label>Telefono<input value={candidatePhone} onChange={(event) => setCandidatePhone(event.target.value)} /></label>
          <label>Cargo aplicado<input value={candidatePosition} onChange={(event) => setCandidatePosition(event.target.value)} required /></label>
          <label>Dependencia<input value={candidateDepartment} onChange={(event) => setCandidateDepartment(event.target.value)} required /></label>
          <button type="submit"><Plus size={17} /> Crear candidato</button>
        </form>
      </DetailDrawer>
    </>
  );
}
