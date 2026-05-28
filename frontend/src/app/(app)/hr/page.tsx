"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Employee = { identification: string; employee_code: string; full_name: string; position: string; department: string; status: string };
type Position = { idPosition: number; position_code: string; name: string; level: string; department: string; status: string; required_documents?: { items?: string[] }; suggested_permissions?: { items?: string[] } };
type Contract = { idContract: number; ps1010Identification: string; contract_type: string; start_date: string; end_date?: string; status: string };

export default function HrPage() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "employees";
  const [identification, setIdentification] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("Analista documental");
  const [department, setDepartment] = useState("Archivo");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [fileType, setFileType] = useState("contrato_firmado");
  const [documentId, setDocumentId] = useState("");
  const [contractType, setContractType] = useState("Contrato laboral");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [positionCode, setPositionCode] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionLevel, setPositionLevel] = useState("operativo");
  const [requiredDocuments, setRequiredDocuments] = useState("hoja_vida, contrato_firmado, arl");
  const [message, setMessage] = useState("");
  const employees = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get<Employee[]>("/hr/employees")).data });
  const positions = useQuery({ queryKey: ["hr-positions"], queryFn: async () => (await api.get<Position[]>("/hr/positions")).data });
  const expiringContracts = useQuery({ queryKey: ["hr-contracts-expiring"], queryFn: async () => (await api.get<Contract[]>("/hr/contracts/expiring")).data, enabled: view === "contracts" });
  const create = useMutation({
    mutationFn: async () => api.post("/hr/employees", { identification, employee_code: `EMP-${identification}`, full_name: fullName, position, department, hire_date: new Date().toISOString() }),
    onSuccess: () => { setIdentification(""); setFullName(""); setMessage("Empleado creado y expediente laboral inicializado."); client.invalidateQueries({ queryKey: ["employees"] }); },
    onError: () => setMessage("No fue posible crear el empleado. Valida identificacion, nombre y codigo unico.")
  });
  const linkFile = useMutation({
    mutationFn: async () => api.post(`/hr/employees/${selectedEmployee}/files`, { file_type: fileType, document_id: Number(documentId) }),
    onSuccess: () => { setDocumentId(""); setMessage("Documento laboral asociado al expediente."); },
    onError: () => setMessage("No fue posible asociar el documento. Verifica empleado, tipo y documento SGDEA.")
  });
  const createContract = useMutation({
    mutationFn: async () => api.post(`/hr/employees/${selectedEmployee}/contracts`, { contract_type: contractType, start_date: new Date(contractStart).toISOString(), end_date: contractEnd ? new Date(contractEnd).toISOString() : null, status: "active" }),
    onSuccess: () => { setMessage("Contrato registrado en el expediente laboral."); expiringContracts.refetch(); },
    onError: () => setMessage("No fue posible crear el contrato. Revisa empleado y fechas.")
  });
  const createPosition = useMutation({
    mutationFn: async () => api.post("/hr/positions", { position_code: positionCode, name: positionName, level: positionLevel, department, required_documents: requiredDocuments.split(",").map((item) => item.trim()).filter(Boolean), suggested_permissions: [] }),
    onSuccess: () => { setPositionCode(""); setPositionName(""); setMessage("Cargo creado correctamente."); positions.refetch(); },
    onError: () => setMessage("No fue posible crear el cargo. Revisa codigo unico y campos obligatorios.")
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
  const viewCopy: Record<string, { title: string; description: string }> = {
    employees: { title: "Empleados", description: "Base humana para expedientes laborales, cargos y custodia documental." },
    expedients: { title: "Expedientes laborales", description: "Control documental de hoja de vida, contratos, afiliaciones y novedades." },
    contracts: { title: "Contratos", description: "Seguimiento operativo de contratos y vencimientos documentales." },
    positions: { title: "Cargos", description: "Catalogo compacto de cargos usado para permisos sugeridos y expedientes laborales." }
  };
  const selected = employees.data?.find((item) => item.identification === selectedEmployee) ?? employees.data?.[0];
  return (
    <>
      <PageTitle title={viewCopy[view]?.title ?? "RRHH"} description={viewCopy[view]?.description ?? "Empleado, expediente vivo, contratos, novedades y cumplimiento documental."} action={<button className="ghost" onClick={() => employees.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <nav className="tabbar view-tabs">
        <Link className={view === "employees" ? "active" : ""} href="/hr?view=employees">Empleados</Link>
        <Link className={view === "expedients" ? "active" : ""} href="/hr?view=expedients">Expedientes laborales</Link>
        <Link className={view === "contracts" ? "active" : ""} href="/hr?view=contracts">Contratos</Link>
        <Link className={view === "positions" ? "active" : ""} href="/hr?view=positions">Cargos</Link>
      </nav>
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("La") || message.startsWith("El") ? "error" : "status"}>{message}</span></div> : null}
      <div className="split">
        <section className="card form-panel">
          {view === "employees" ? (
            <>
              <h2>Nuevo empleado</h2>
              <form className="form-grid" onSubmit={submit}>
                <label>Identificacion<input value={identification} onChange={(event) => setIdentification(event.target.value)} required /></label>
                <label>Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
                <label>Cargo<select value={position} onChange={(event) => setPosition(event.target.value)}>{positions.data?.map((item) => <option key={item.idPosition} value={item.name}>{item.name}</option>)}<option value={position}>{position}</option></select></label>
                <label>Departamento<input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label>
                <button><Plus size={17} /> Crear empleado</button>
              </form>
            </>
          ) : null}
          {view === "expedients" ? (
            <>
              <h2>Documento laboral</h2>
              <form className="form-grid" onSubmit={(event) => { event.preventDefault(); linkFile.mutate(); }}>
                <label>Empleado<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} required><option value="">Seleccionar</option>{employees.data?.map((item) => <option key={item.identification} value={item.identification}>{item.full_name}</option>)}</select></label>
                <label>Tipo documental<select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="hoja_vida">Hoja de vida</option><option value="contrato_firmado">Contrato firmado</option><option value="arl">ARL</option><option value="eps">EPS</option><option value="pension">Pension</option><option value="examen_ingreso">Examen ingreso</option></select></label>
                <label>ID documento SGDEA<input value={documentId} onChange={(event) => setDocumentId(event.target.value)} required placeholder="Documento ya cargado en Repositorio" /></label>
                <button><Plus size={17} /> Asociar documento</button>
              </form>
            </>
          ) : null}
          {view === "contracts" ? (
            <>
              <h2>Nuevo contrato</h2>
              <form className="form-grid" onSubmit={(event) => { event.preventDefault(); createContract.mutate(); }}>
                <label>Empleado<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} required><option value="">Seleccionar</option>{employees.data?.map((item) => <option key={item.identification} value={item.identification}>{item.full_name}</option>)}</select></label>
                <label>Tipo contrato<input value={contractType} onChange={(event) => setContractType(event.target.value)} required /></label>
                <label>Fecha inicio<input type="date" value={contractStart} onChange={(event) => setContractStart(event.target.value)} required /></label>
                <label>Fecha fin<input type="date" value={contractEnd} onChange={(event) => setContractEnd(event.target.value)} /></label>
                <button><Plus size={17} /> Registrar contrato</button>
              </form>
            </>
          ) : null}
          {view === "positions" ? (
            <>
              <h2>Nuevo cargo</h2>
              <form className="form-grid" onSubmit={(event) => { event.preventDefault(); createPosition.mutate(); }}>
                <label>Codigo<input value={positionCode} onChange={(event) => setPositionCode(event.target.value)} required /></label>
                <label>Nombre cargo<input value={positionName} onChange={(event) => setPositionName(event.target.value)} required /></label>
                <label>Nivel<select value={positionLevel} onChange={(event) => setPositionLevel(event.target.value)}><option value="operativo">Operativo</option><option value="profesional">Profesional</option><option value="coordinacion">Coordinacion</option><option value="directivo">Directivo</option></select></label>
                <label>Dependencia<input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label>
                <label>Documentos obligatorios<textarea value={requiredDocuments} onChange={(event) => setRequiredDocuments(event.target.value)} /></label>
                <button><Plus size={17} /> Crear cargo</button>
              </form>
            </>
          ) : null}
        </section>
        <section className="card table-card">
          {view === "positions" ? (
            <table>
              <thead><tr><th>Codigo</th><th>Cargo</th><th>Nivel</th><th>Dependencia</th><th>Documentos</th><th>Estado</th></tr></thead>
              <tbody>{positions.data?.map((item) => <tr key={item.idPosition}><td>{item.position_code}</td><td>{item.name}</td><td>{item.level}</td><td>{item.department}</td><td>{item.required_documents?.items?.join(", ")}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody>
            </table>
          ) : view === "expedients" ? (
            <div className="grid">
              <h2>Expedientes laborales</h2>
              {employees.data?.map((item) => <article className="card compact" key={item.identification}><div className="toolbar space-between"><strong>{item.full_name}</strong><span className="status">{item.status}</span></div><p className="muted">{item.employee_code} - {item.position} - {item.department}</p><div className="toolbar"><span className="status">Checklist laboral</span><span className="muted">Hoja de vida, contrato, ARL, EPS, pension y examen de ingreso.</span></div></article>)}
            </div>
          ) : view === "contracts" ? (
            <table>
              <thead><tr><th>Empleado</th><th>Contrato</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead>
              <tbody>{expiringContracts.data?.map((item) => <tr key={item.idContract}><td>{item.ps1010Identification}</td><td>{item.contract_type}</td><td>{item.start_date?.slice(0, 10)}</td><td>{item.end_date?.slice(0, 10) ?? "Sin fin"}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Empleado</th><th>Cargo</th><th>Area</th><th>Estado</th></tr></thead>
              <tbody>{employees.data?.map((item) => <tr key={item.identification}><td>{item.full_name}<br /><span className="muted">{item.employee_code}</span></td><td>{item.position}</td><td>{item.department}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody>
            </table>
          )}
          {selected && view === "expedients" ? <p className="muted">Seleccion actual: {selected.full_name}. Para cargar binarios usa Repositorio/Documentos y asocia aqui el ID documental.</p> : null}
        </section>
      </div>
    </>
  );
}
