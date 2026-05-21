"use client";

import { FormEvent, useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Employee = { identification: string; employee_code: string; full_name: string; position: string; department: string; status: string };

export default function HrPage() {
  const client = useQueryClient();
  const [identification, setIdentification] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("Analista documental");
  const [department, setDepartment] = useState("Archivo");
  const [message, setMessage] = useState("");
  const employees = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get<Employee[]>("/hr/employees")).data });
  const create = useMutation({
    mutationFn: async () => api.post("/hr/employees", { identification, employee_code: `EMP-${identification}`, full_name: fullName, position, department, hire_date: new Date().toISOString() }),
    onSuccess: () => { setIdentification(""); setFullName(""); setMessage("Empleado creado y expediente laboral inicializado."); client.invalidateQueries({ queryKey: ["employees"] }); },
    onError: () => setMessage("No fue posible crear el empleado. Valida identificacion, nombre y codigo unico.")
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanId = identification.trim();
    const cleanName = fullName.trim();
    if (!/[0-9]/.test(cleanId) || /\s/.test(cleanId)) {
      setMessage("La identificacion debe ser un documento, sin espacios y con al menos un numero.");
      return;
    }
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(cleanName) || /^[\d\s.-]+$/.test(cleanName)) {
      setMessage("El nombre completo debe contener un nombre valido, no solo numeros.");
      return;
    }
    create.mutate();
  }
  return (
    <>
      <PageTitle title="Expedientes RRHH" description="Empleado, expediente vivo, contratos, novedades y cumplimiento documental." action={<button className="ghost" onClick={() => employees.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("La") || message.startsWith("El") ? "error" : "status"}>{message}</span></div> : null}
      <div className="split">
        <section className="card">
          <h2>Nuevo empleado</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Identificacion<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
            <label>Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
            <label>Cargo<input value={position} onChange={(event) => setPosition(event.target.value)} required /></label>
            <label>Departamento<input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label>
            <button><Plus size={17} /> Crear expediente</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Empleado</th><th>Cargo</th><th>Area</th><th>Estado</th></tr></thead>
            <tbody>{employees.data?.map((item) => <tr key={item.identification}><td>{item.full_name}<br /><span className="muted">{item.employee_code}</span></td><td>{item.position}</td><td>{item.department}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
