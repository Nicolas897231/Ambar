"use client";

import { FormEvent, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, Upload } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { EmptyState, LoadingSkeleton, StatusBadge } from "@/components/ui/enterprise";

type Vacancy = { idVacancy: number; vacancy_code: string; title: string; department: string; description?: string; requirements: string[]; contract_type?: string; location?: string; status: string };

export default function PublicJobsPage() {
  const [selected, setSelected] = useState<Vacancy | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [observation, setObservation] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [message, setMessage] = useState("");

  const vacancies = useQuery({ queryKey: ["public-vacancies"], queryFn: async () => (await api.get<Vacancy[]>("/hr/public/vacancies")).data });
  const apply = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const form = new FormData();
      form.append("full_name", fullName);
      form.append("email", email);
      if (phone) form.append("phone", phone);
      if (observation) form.append("observation", observation);
      if (resume) form.append("resume", resume);
      return api.post(`/hr/public/vacancies/${selected.idVacancy}/apply`, form);
    },
    onSuccess: () => {
      setMessage("Postulacion recibida. El equipo de RRHH revisara tu informacion.");
      setFullName("");
      setEmail("");
      setPhone("");
      setObservation("");
      setResume(null);
    },
    onError: () => setMessage("No fue posible enviar la postulacion. Revisa correo, archivo y datos obligatorios.")
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    apply.mutate();
  }

  return (
    <main className="jobs-page">
      <header className="jobs-hero">
        <div>
          <span className="eyebrow">AMBAR Empleo</span>
          <h1>Vacantes disponibles</h1>
          <p>Consulta oportunidades activas y postulate cargando tu hoja de vida. Tu informacion entra al pipeline documental de RRHH sin duplicar expedientes.</p>
        </div>
        <a className="ghost" href="/login">Ingreso AMBAR</a>
      </header>

      <section className="jobs-layout">
        <div className="jobs-list card">
          <div className="toolbar space-between"><h2><BriefcaseBusiness size={18} /> Oportunidades</h2><StatusBadge value={`${vacancies.data?.length ?? 0} abiertas`} tone={(vacancies.data?.length ?? 0) ? "success" : "neutral"} /></div>
          {vacancies.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!vacancies.isLoading && !(vacancies.data ?? []).length ? <EmptyState icon={<BriefcaseBusiness size={20} />} title="Sin vacantes abiertas" description="En este momento no hay convocatorias publicadas." /> : null}
          {(vacancies.data ?? []).map((vacancy) => (
            <button className={`job-card ${selected?.idVacancy === vacancy.idVacancy ? "active" : ""}`} key={vacancy.idVacancy} onClick={() => { setSelected(vacancy); setMessage(""); }}>
              <strong>{vacancy.title}</strong>
              <span>{vacancy.department}{vacancy.location ? ` / ${vacancy.location}` : ""}</span>
              <small>{vacancy.description ?? "Vacante documental registrada por RRHH."}</small>
            </button>
          ))}
        </div>

        <aside className="card jobs-apply">
          {selected ? (
            <>
              <div className="toolbar space-between"><h2>{selected.title}</h2><StatusBadge value={selected.status} tone="success" /></div>
              <p className="muted">{selected.department}{selected.contract_type ? ` / ${selected.contract_type}` : ""}</p>
              {selected.description ? <p>{selected.description}</p> : null}
              <div className="checklist">{selected.requirements.map((item) => <span className="status" key={item}>{item}</span>)}</div>
              <form onSubmit={submit} className="grid">
                <label>Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
                <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label>Telefono<input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={10} /></label>
                <label>Observacion<textarea value={observation} onChange={(event) => setObservation(event.target.value)} /></label>
                <label>Hoja de vida<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResume(event.target.files?.[0] ?? null)} /></label>
                {message ? <div className={message.startsWith("Postulacion") ? "status" : "error"}>{message}</div> : null}
                <button type="submit" disabled={apply.isPending}>{apply.isPending ? <Upload size={17} /> : <CheckCircle2 size={17} />} Enviar postulacion</button>
              </form>
            </>
          ) : <EmptyState icon={<BriefcaseBusiness size={20} />} title="Selecciona una vacante" description="El formulario de postulacion aparece cuando eliges una oportunidad." />}
        </aside>
      </section>
    </main>
  );
}
