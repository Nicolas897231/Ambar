"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BriefcaseBusiness, Building2, CheckCircle2, FileText, GitBranch, Plus, RefreshCcw, UserCheck, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DetailDrawer, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Employee = { identification: string; employee_code: string; full_name: string; position: string; department: string; status: string };
type Position = { idPosition: number; position_code: string; name: string; level: string; department: string; status: string; required_documents?: { items?: string[] }; suggested_permissions?: { items?: string[] } };
type Contract = { idContract: number; ps1010Identification: string; contract_type: string; start_date: string; end_date?: string; status: string };
type Candidate = { idCandidate: number; candidate_code: string; full_name: string; email?: string; phone?: string; position_applied: string; department: string; status: string; resume_document_id?: number; hired_employee_id?: string; observations?: { items?: string[] } };
type Department = { idDepartment: number; department_code: string; name: string; parent_id?: number | null; responsible_identification?: string | null; status: string };
type DepartmentNode = Department & { children: DepartmentNode[] };
type Compliance = { compliance: number; missing_files: string[]; items: Array<{ file_type: string; complete: boolean }> };

const candidateColumns = [
  { key: "postulado", label: "Postulados" },
  { key: "entrevista", label: "Entrevista" },
  { key: "validacion", label: "Validacion" },
  { key: "aprobado", label: "Aprobados" },
  { key: "contratado", label: "Contratados" }
];

const viewCopy: Record<string, { title: string; description: string }> = {
  employees: { title: "Empleados", description: "Personas laborales separadas del acceso al sistema." },
  candidates: { title: "Candidatos", description: "Pipeline documental: hoja de vida, entrevistas, validacion y contratacion." },
  expedients: { title: "Expedientes laborales", description: "Control de documentos obligatorios y trazabilidad laboral." },
  contracts: { title: "Contratos", description: "Seguimiento operativo de contratos y vencimientos documentales." },
  positions: { title: "Cargos", description: "Cargos como catalogo operativo, no texto libre." },
  departments: { title: "Dependencias", description: "Arbol organizacional para cargos, responsables y permisos sugeridos." }
};

function statusTone(value: string) {
  if (["rechazado", "cancelled", "inactive"].includes(value)) return "danger" as const;
  if (["validacion", "entrevista", "pending"].includes(value)) return "warning" as const;
  if (["aprobado", "contratado", "active"].includes(value)) return "success" as const;
  return "neutral" as const;
}

function DepartmentBranch({ node }: { node: DepartmentNode }) {
  return (
    <li>
      <div className="tree-node">
        <Building2 size={16} />
        <strong>{node.name}</strong>
        <span className="muted">{node.department_code}</span>
        <StatusBadge value={node.status} tone={statusTone(node.status)} />
      </div>
      {node.children.length ? <ul>{node.children.map((child) => <DepartmentBranch key={child.idDepartment} node={child} />)}</ul> : null}
    </li>
  );
}

function EmployeeComplianceCard({ employee, onAttach }: { employee: Employee; onAttach: () => void }) {
  const compliance = useQuery({ queryKey: ["employee-compliance", employee.identification], queryFn: async () => (await api.get<Compliance>(`/hr/employees/${employee.identification}/compliance`)).data });
  return (
    <article className="workspace-card">
      <div className="toolbar space-between"><strong>{employee.full_name}</strong><StatusBadge value={`${compliance.data?.compliance ?? 0}%`} tone={(compliance.data?.compliance ?? 0) >= 100 ? "success" : "warning"} /></div>
      <p className="muted">{employee.employee_code} - {employee.position} - {employee.department}</p>
      <div className="module-grid">
        {(compliance.data?.items ?? []).map((item) => <span className={item.complete ? "badge badge-success" : "badge badge-warning"} key={item.file_type}>{item.complete ? "✓" : "Pendiente"} {item.file_type}</span>)}
      </div>
      {compliance.data?.missing_files.length ? <p className="muted">Faltan: {compliance.data.missing_files.join(", ")}</p> : <p className="muted">Documentacion laboral completa.</p>}
      <button className="ghost" onClick={onAttach}><FileText size={16} /> Asociar documento</button>
    </article>
  );
}

export default function HrPage() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "employees";
  const [drawer, setDrawer] = useState<"" | "candidate" | "employee" | "position" | "department" | "contract" | "file">("");
  const [identification, setIdentification] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
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
  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [parentDepartment, setParentDepartment] = useState("");
  const [candidateCode, setCandidateCode] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [candidatePosition, setCandidatePosition] = useState("");
  const [candidateDepartment, setCandidateDepartment] = useState("");
  const [candidateObservation, setCandidateObservation] = useState("");
  const [message, setMessage] = useState("");

  const employees = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get<Employee[]>("/hr/employees")).data });
  const positions = useQuery({ queryKey: ["hr-positions"], queryFn: async () => (await api.get<Position[]>("/hr/positions")).data });
  const departments = useQuery({ queryKey: ["hr-departments"], queryFn: async () => (await api.get<Department[]>("/hr/departments")).data });
  const departmentTree = useQuery({ queryKey: ["hr-departments-tree"], queryFn: async () => (await api.get<DepartmentNode[]>("/hr/departments/tree")).data });
  const candidates = useQuery({ queryKey: ["hr-candidates"], queryFn: async () => (await api.get<Candidate[]>("/hr/candidates")).data });
  const expiringContracts = useQuery({ queryKey: ["hr-contracts-expiring"], queryFn: async () => (await api.get<Contract[]>("/hr/contracts/expiring")).data, enabled: view === "contracts" });

  const stats = useMemo(() => ({
    candidates: candidates.data?.filter((item) => item.status !== "contratado" && item.status !== "rechazado").length ?? 0,
    employees: employees.data?.length ?? 0,
    positions: positions.data?.filter((item) => item.status === "active").length ?? 0,
    departments: departments.data?.filter((item) => item.status === "active").length ?? 0
  }), [candidates.data, departments.data, employees.data, positions.data]);

  const createEmployee = useMutation({
    mutationFn: async () => api.post("/hr/employees", { identification, employee_code: `EMP-${identification}`, full_name: fullName, position, department, hire_date: new Date().toISOString() }),
    onSuccess: () => { setIdentification(""); setFullName(""); setMessage("Empleado creado y expediente laboral inicializado."); setDrawer(""); client.invalidateQueries({ queryKey: ["employees"] }); },
    onError: () => setMessage("No fue posible crear el empleado. Valida identificacion, nombre y codigo unico.")
  });
  const createCandidate = useMutation({
    mutationFn: async () => api.post("/hr/candidates", { candidate_code: candidateCode, full_name: candidateName, email: candidateEmail || null, phone: candidatePhone || null, position_applied: candidatePosition, department: candidateDepartment, observations: candidateObservation || null }),
    onSuccess: () => { setCandidateCode(""); setCandidateName(""); setCandidateEmail(""); setCandidatePhone(""); setCandidatePosition(""); setCandidateDepartment(""); setCandidateObservation(""); setMessage("Candidato creado en pipeline."); setDrawer(""); candidates.refetch(); },
    onError: () => setMessage("No fue posible crear el candidato. Revisa codigo, nombre y correo unico.")
  });
  const updateCandidate = useMutation({
    mutationFn: async ({ id, status, observation }: { id: number; status: string; observation?: string }) => api.patch(`/hr/candidates/${id}/status`, { status, observation }),
    onSuccess: () => { setMessage("Candidato actualizado."); candidates.refetch(); }
  });
  const hireCandidate = useMutation({
    mutationFn: async ({ id, hiredId }: { id: number; hiredId: string }) => api.post(`/hr/candidates/${id}/hire`, { identification: hiredId }),
    onSuccess: () => { setMessage("Candidato contratado. Empleado y checklist onboarding creados."); candidates.refetch(); employees.refetch(); }
  });
  const linkFile = useMutation({
    mutationFn: async () => api.post(`/hr/employees/${selectedEmployee}/files`, { file_type: fileType, document_id: Number(documentId) }),
    onSuccess: () => { setDocumentId(""); setMessage("Documento laboral asociado al expediente."); setDrawer(""); },
    onError: () => setMessage("No fue posible asociar el documento. Verifica empleado, tipo y documento SGDEA.")
  });
  const createContract = useMutation({
    mutationFn: async () => api.post(`/hr/employees/${selectedEmployee}/contracts`, { contract_type: contractType, start_date: new Date(contractStart).toISOString(), end_date: contractEnd ? new Date(contractEnd).toISOString() : null, status: "active" }),
    onSuccess: () => { setMessage("Contrato registrado en el expediente laboral."); setDrawer(""); expiringContracts.refetch(); },
    onError: () => setMessage("No fue posible crear el contrato. Revisa empleado y fechas.")
  });
  const createPosition = useMutation({
    mutationFn: async () => api.post("/hr/positions", { position_code: positionCode, name: positionName, level: positionLevel, department, required_documents: requiredDocuments.split(",").map((item) => item.trim()).filter(Boolean), suggested_permissions: [] }),
    onSuccess: () => { setPositionCode(""); setPositionName(""); setMessage("Cargo creado correctamente."); setDrawer(""); positions.refetch(); },
    onError: () => setMessage("No fue posible crear el cargo. Revisa codigo unico y campos obligatorios.")
  });
  const createDepartment = useMutation({
    mutationFn: async () => api.post("/hr/departments", { department_code: departmentCode, name: departmentName, parent_id: parentDepartment ? Number(parentDepartment) : null }),
    onSuccess: () => { setDepartmentCode(""); setDepartmentName(""); setParentDepartment(""); setMessage("Dependencia creada en el arbol organizacional."); setDrawer(""); departments.refetch(); departmentTree.refetch(); },
    onError: () => setMessage("No fue posible crear la dependencia. Revisa codigo unico y superior.")
  });

  function validateEmployee(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+$/.test(identification.trim())) {
      setMessage("La identificacion debe contener solo numeros.");
      return;
    }
    if (/\d/.test(fullName) || fullName.trim().length < 3) {
      setMessage("El nombre completo debe contener texto valido y no numeros.");
      return;
    }
    createEmployee.mutate();
  }

  function approveCandidate(candidate: Candidate) {
    updateCandidate.mutate({ id: candidate.idCandidate, status: "aprobado", observation: "Aprobado desde pipeline operacional." });
  }

  function contractCandidate(candidate: Candidate) {
    const hiredId = window.prompt("Numero de documento del nuevo empleado");
    if (!hiredId?.trim()) return;
    hireCandidate.mutate({ id: candidate.idCandidate, hiredId: hiredId.trim() });
  }

  const primaryAction = view === "candidates" ? "candidate" : view === "positions" ? "position" : view === "departments" ? "department" : view === "contracts" ? "contract" : view === "expedients" ? "file" : "employee";

  return (
    <>
      <PageTitle title={viewCopy[view]?.title ?? "RRHH"} description={viewCopy[view]?.description ?? "Ciclo documental laboral."} action={<div className="toolbar"><button onClick={() => setDrawer(primaryAction)}><Plus size={17} /> Crear</button><button className="ghost" onClick={() => { employees.refetch(); candidates.refetch(); positions.refetch(); departments.refetch(); }}><RefreshCcw size={17} /> Actualizar</button></div>} />
      <nav className="tabbar view-tabs">
        <Link className={view === "employees" ? "active" : ""} href="/hr?view=employees">Empleados</Link>
        <Link className={view === "candidates" ? "active" : ""} href="/hr?view=candidates">Candidatos</Link>
        <Link className={view === "expedients" ? "active" : ""} href="/hr?view=expedients">Expedientes laborales</Link>
        <Link className={view === "contracts" ? "active" : ""} href="/hr?view=contracts">Contratos</Link>
        <Link className={view === "positions" ? "active" : ""} href="/hr?view=positions">Cargos</Link>
        <Link className={view === "departments" ? "active" : ""} href="/hr?view=departments">Dependencias</Link>
      </nav>
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("La") || message.startsWith("El") ? "error" : "status"}>{message}</span></div> : null}

      <section className="metrics">
        <MetricCard label="Candidatos activos" value={stats.candidates} tone={stats.candidates ? "warning" : "neutral"} />
        <MetricCard label="Empleados" value={stats.employees} tone="info" />
        <MetricCard label="Cargos activos" value={stats.positions} tone="success" />
        <MetricCard label="Dependencias" value={stats.departments} tone="neutral" />
      </section>

      {view === "candidates" ? (
        <section className="pipeline-board">
          {candidates.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {candidateColumns.map((column) => {
            const items = (candidates.data ?? []).filter((candidate) => candidate.status === column.key);
            return (
              <article className="pipeline-column" key={column.key}>
                <div className="toolbar space-between"><h3>{column.label}</h3><StatusBadge value={items.length} tone={items.length ? "info" : "neutral"} /></div>
                {items.map((candidate) => (
                  <div className="candidate-card" key={candidate.idCandidate}>
                    <strong>{candidate.full_name}</strong>
                    <p className="muted">{candidate.position_applied} / {candidate.department}</p>
                    <p className="muted">{candidate.email ?? "Sin correo"}</p>
                    <div className="inline-actions">
                      {candidate.status !== "aprobado" && candidate.status !== "contratado" ? <button className="ghost" onClick={() => approveCandidate(candidate)}><CheckCircle2 size={15} /> Aprobar</button> : null}
                      {candidate.status === "aprobado" ? <button className="ghost" onClick={() => contractCandidate(candidate)}><UserCheck size={15} /> Contratar</button> : null}
                    </div>
                  </div>
                ))}
              </article>
            );
          })}
        </section>
      ) : null}

      {view === "employees" ? (
        <section className="workspace-grid">
          {employees.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {(employees.data ?? []).map((item) => <article className="workspace-card" key={item.identification}><div className="toolbar space-between"><strong>{item.full_name}</strong><StatusBadge value={item.status} tone={statusTone(item.status)} /></div><p className="muted">{item.employee_code} / {item.identification}</p><div className="module-grid"><span className="status">{item.position}</span><span className="status">{item.department}</span></div><Link className="inline-link" href={`/hr?view=expedients&employee=${item.identification}`}>Abrir workspace laboral</Link></article>)}
        </section>
      ) : null}

      {view === "positions" ? (
        <section className="workspace-grid">
          {positions.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {(positions.data ?? []).map((item) => <article className="workspace-card" key={item.idPosition}><div className="toolbar space-between"><strong><BriefcaseBusiness size={16} /> {item.name}</strong><StatusBadge value={item.status} tone={statusTone(item.status)} /></div><p className="muted">{item.position_code} / {item.level} / {item.department}</p><p className="muted">Docs obligatorios: {item.required_documents?.items?.join(", ") || "Sin checklist"}</p><div className="inline-actions"><button className="ghost">Editar</button><button className="ghost danger">Desactivar</button></div></article>)}
          {!positions.isLoading && !(positions.data ?? []).length ? <EmptyState icon={<BriefcaseBusiness size={20} />} title="Sin cargos" description="Crea cargos para dejar de capturar texto libre en empleados." /> : null}
        </section>
      ) : null}

      {view === "departments" ? (
        <section className="card">
          <div className="toolbar space-between"><h2><GitBranch size={18} /> Arbol organizacional</h2><button className="ghost" onClick={() => setDrawer("department")}><Plus size={16} /> Dependencia</button></div>
          {departmentTree.isLoading ? <LoadingSkeleton rows={4} /> : null}
          <ul className="org-tree">{departmentTree.data?.map((node) => <DepartmentBranch key={node.idDepartment} node={node} />)}</ul>
          {!departmentTree.isLoading && !(departmentTree.data ?? []).length ? <EmptyState icon={<Building2 size={20} />} title="Sin dependencias" description="Crea la primera dependencia para activar el arbol organizacional." /> : null}
        </section>
      ) : null}

      {view === "expedients" ? (
        <section className="workspace-grid">
          {(employees.data ?? []).map((item) => <EmployeeComplianceCard employee={item} key={item.identification} onAttach={() => { setSelectedEmployee(item.identification); setDrawer("file"); }} />)}
        </section>
      ) : null}

      {view === "contracts" ? (
        <section className="card table-card">
          <table>
            <thead><tr><th>Empleado</th><th>Contrato</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead>
            <tbody>{expiringContracts.data?.map((item) => <tr key={item.idContract}><td>{item.ps1010Identification}</td><td>{item.contract_type}</td><td>{item.start_date?.slice(0, 10)}</td><td>{item.end_date?.slice(0, 10) ?? "Sin fin"}</td><td><StatusBadge value={item.status} tone={statusTone(item.status)} /></td></tr>)}</tbody>
          </table>
        </section>
      ) : null}

      <DetailDrawer open={Boolean(drawer)} onClose={() => setDrawer("")} title={drawer === "candidate" ? "Crear candidato" : drawer === "position" ? "Crear cargo" : drawer === "department" ? "Crear dependencia" : drawer === "contract" ? "Registrar contrato" : drawer === "file" ? "Asociar documento laboral" : "Crear empleado"}>
        {drawer === "candidate" ? <form className="form-grid" onSubmit={(event) => { event.preventDefault(); createCandidate.mutate(); }}><label>Codigo<input value={candidateCode} onChange={(event) => setCandidateCode(event.target.value)} required /></label><label>Nombre completo<input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} required /></label><label>Correo<input type="email" value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} /></label><label>Telefono<input value={candidatePhone} onChange={(event) => setCandidatePhone(event.target.value)} /></label><label>Cargo aspirado<input value={candidatePosition} onChange={(event) => setCandidatePosition(event.target.value)} required /></label><label>Dependencia<input value={candidateDepartment} onChange={(event) => setCandidateDepartment(event.target.value)} required /></label><label>Observacion<textarea value={candidateObservation} onChange={(event) => setCandidateObservation(event.target.value)} /></label><button><Plus size={17} /> Crear candidato</button></form> : null}
        {drawer === "employee" ? <form className="form-grid" onSubmit={validateEmployee}><label>Identificacion<input value={identification} onChange={(event) => setIdentification(event.target.value.replace(/\D/g, ""))} required /></label><label>Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label><label>Cargo<select value={position} onChange={(event) => setPosition(event.target.value)} required><option value="">Seleccionar</option>{positions.data?.map((item) => <option key={item.idPosition} value={item.name}>{item.name}</option>)}</select></label><label>Dependencia<select value={department} onChange={(event) => setDepartment(event.target.value)} required><option value="">Seleccionar</option>{departments.data?.map((item) => <option key={item.idDepartment} value={item.name}>{item.name}</option>)}</select></label><button><Plus size={17} /> Crear empleado</button></form> : null}
        {drawer === "position" ? <form className="form-grid" onSubmit={(event) => { event.preventDefault(); createPosition.mutate(); }}><label>Codigo<input value={positionCode} onChange={(event) => setPositionCode(event.target.value)} required /></label><label>Nombre cargo<input value={positionName} onChange={(event) => setPositionName(event.target.value)} required /></label><label>Nivel<select value={positionLevel} onChange={(event) => setPositionLevel(event.target.value)}><option value="operativo">Operativo</option><option value="profesional">Profesional</option><option value="coordinacion">Coordinacion</option><option value="directivo">Directivo</option></select></label><label>Dependencia<select value={department} onChange={(event) => setDepartment(event.target.value)} required><option value="">Seleccionar</option>{departments.data?.map((item) => <option key={item.idDepartment} value={item.name}>{item.name}</option>)}</select></label><label>Documentos obligatorios<textarea value={requiredDocuments} onChange={(event) => setRequiredDocuments(event.target.value)} /></label><button><Plus size={17} /> Crear cargo</button></form> : null}
        {drawer === "department" ? <form className="form-grid" onSubmit={(event) => { event.preventDefault(); createDepartment.mutate(); }}><label>Codigo<input value={departmentCode} onChange={(event) => setDepartmentCode(event.target.value)} required /></label><label>Nombre dependencia<input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} required /></label><label>Superior<select value={parentDepartment} onChange={(event) => setParentDepartment(event.target.value)}><option value="">Sin superior</option>{departments.data?.map((item) => <option key={item.idDepartment} value={item.idDepartment}>{item.name}</option>)}</select></label><button><Plus size={17} /> Crear dependencia</button></form> : null}
        {drawer === "contract" ? <form className="form-grid" onSubmit={(event) => { event.preventDefault(); createContract.mutate(); }}><label>Empleado<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} required><option value="">Seleccionar</option>{employees.data?.map((item) => <option key={item.identification} value={item.identification}>{item.full_name}</option>)}</select></label><label>Tipo contrato<input value={contractType} onChange={(event) => setContractType(event.target.value)} required /></label><label>Fecha inicio<input type="date" value={contractStart} onChange={(event) => setContractStart(event.target.value)} required /></label><label>Fecha fin<input type="date" value={contractEnd} onChange={(event) => setContractEnd(event.target.value)} /></label><button><Plus size={17} /> Registrar contrato</button></form> : null}
        {drawer === "file" ? <form className="form-grid" onSubmit={(event) => { event.preventDefault(); linkFile.mutate(); }}><label>Empleado<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} required><option value="">Seleccionar</option>{employees.data?.map((item) => <option key={item.identification} value={item.identification}>{item.full_name}</option>)}</select></label><label>Tipo documental<select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="hoja_vida">Hoja de vida</option><option value="contrato_firmado">Contrato firmado</option><option value="arl">ARL</option><option value="eps">EPS</option><option value="pension">Pension</option><option value="examen_ingreso">Examen ingreso</option></select></label><label>ID documento SGDEA<input value={documentId} onChange={(event) => setDocumentId(event.target.value)} required placeholder="Documento ya cargado en Repositorio" /></label><button><Plus size={17} /> Asociar documento</button></form> : null}
      </DetailDrawer>
    </>
  );
}
