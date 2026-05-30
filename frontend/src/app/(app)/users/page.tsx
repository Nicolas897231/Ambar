"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserRoundCog
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type UserItem = {
  identification: string;
  name: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
};

type RoleItem = {
  idRole: number;
  role_name: string;
  description: string;
  permissions: string[];
};

type ArchiveItem = {
  idArchive: number;
  archive_code: string;
  archive_name: string;
  archive_type: string;
  status: string;
};

const wizardSteps = [
  { key: "persona", title: "Persona", description: "Identidad laboral verificable." },
  { key: "acceso", title: "Acceso", description: "Credenciales y metodo de ingreso." },
  { key: "perfiles", title: "Perfiles", description: "Rol y capacidades operativas." },
  { key: "archivos", title: "Archivos", description: "Alcance real por archivo." },
  { key: "seguridad", title: "Seguridad", description: "Estado, expiracion y firmas." }
] as const;

const archiveAccessLevels = [
  { value: "lectura", label: "Lectura", backend: "read", description: "Consultar informacion del archivo." },
  { value: "escritura", label: "Escritura", backend: "operate", description: "Crear y actualizar registros documentales." },
  { value: "custodia", label: "Custodia", backend: "operate", description: "Operar recepciones, prestamos y movimientos." },
  { value: "auditoria", label: "Auditoria", backend: "operate", description: "Consultar trazabilidad autorizada." },
  { value: "administracion", label: "Administracion", backend: "admin", description: "Administrar usuarios del archivo." }
] as const;

function roleLabel(value: string) {
  return value.replaceAll("_", " ");
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg ?? String(item)).join(". ");
  }
  return fallback;
}

function accessToBackend(value: string) {
  return archiveAccessLevels.find((item) => item.value === value)?.backend ?? "read";
}

function passwordIsStrong(value: string) {
  return value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export default function UsersPage() {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [identificationType, setIdentificationType] = useState("cc");
  const [identification, setIdentification] = useState("");
  const [firstNames, setFirstNames] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [authMethod, setAuthMethod] = useState("password");
  const [role, setRole] = useState("viewer");
  const [specialCapability, setSpecialCapability] = useState("");
  const [archiveAccess, setArchiveAccess] = useState<Record<number, string>>({});
  const [mechanicalSignature, setMechanicalSignature] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [accountStatus, setAccountStatus] = useState("active");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const users = useQuery({
    queryKey: ["users", includeInactive],
    queryFn: async () => (await api.get<UserItem[]>(`/users?include_inactive=${includeInactive}`)).data
  });
  const roles = useQuery({ queryKey: ["users", "roles"], queryFn: async () => (await api.get<RoleItem[]>("/users/roles")).data });
  const archives = useQuery({ queryKey: ["archives", "user-wizard"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });

  const fullName = useMemo(() => `${firstNames} ${lastNames}`.trim().replace(/\s+/g, " "), [firstNames, lastNames]);
  const selectedArchives = useMemo(() => Object.entries(archiveAccess).filter(([, level]) => Boolean(level)), [archiveAccess]);

  const personaValid = /^\d+$/.test(identification) && firstNames.trim().length >= 2 && lastNames.trim().length >= 2 && !/\d/.test(firstNames + lastNames) && /\S+@\S+\.\S+/.test(email);
  const accessValid = username.trim().length >= 3 && passwordIsStrong(password);
  const profileValid = Boolean(role);
  const archiveValid = role === "super_admin" || selectedArchives.length > 0;
  const currentValid = [personaValid, accessValid, profileValid, archiveValid, true][step];

  const createUser = useMutation({
    mutationFn: async () => {
      const response = await api.post("/users", {
        identification,
        name: fullName,
        email,
        password,
        role_names: [role],
        company_id: "default",
        location_id: 1
      });
      await Promise.all(selectedArchives.map(([archiveId, level]) => api.post(`/archives/${archiveId}/users`, {
        identification,
        access_level: accessToBackend(level)
      })));
      return response.data;
    },
    onSuccess: () => {
      setIdentification("");
      setFirstNames("");
      setLastNames("");
      setEmail("");
      setPhone("");
      setPosition("");
      setDepartment("");
      setUsername("");
      setPassword("");
      setMfaEnabled(false);
      setAuthMethod("password");
      setRole("viewer");
      setSpecialCapability("");
      setArchiveAccess({});
      setMechanicalSignature(false);
      setDigitalSignature(false);
      setAccessExpiresAt("");
      setAccountStatus("active");
      setStep(0);
      setMessage("Usuario creado y accesos de archivo asignados correctamente.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => setMessage(apiErrorMessage(error, "No fue posible crear el usuario. Revisa identificacion, email, password, rol y acceso por archivo."))
  });

  const updateUserRole = useMutation({
    mutationFn: async ({ user, nextRole }: { user: UserItem; nextRole: string }) => api.patch(`/users/${user.identification}`, { role_names: [nextRole] }),
    onSuccess: () => {
      setMessage("Rol del usuario actualizado.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible actualizar el rol del usuario.")
  });

  const deactivateUser = useMutation({
    mutationFn: async (user: UserItem) => api.delete(`/users/${user.identification}`),
    onSuccess: () => {
      setMessage("Usuario desactivado. Se conserva para auditoria y no podra ingresar.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible desactivar el usuario.")
  });

  function submitUser(event: FormEvent) {
    event.preventDefault();
    if (!personaValid) {
      setStep(0);
      setMessage("Completa datos de persona validos: identificacion numerica, nombres sin numeros y correo valido.");
      return;
    }
    if (!accessValid) {
      setStep(1);
      setMessage("La clave temporal debe tener minimo 12 caracteres, mayuscula, minuscula, numero y simbolo.");
      return;
    }
    if (!profileValid) {
      setStep(2);
      setMessage("Selecciona un perfil operativo para el usuario.");
      return;
    }
    if (!archiveValid) {
      setStep(3);
      setMessage("Asigna al menos un archivo autorizado o usa un perfil super admin.");
      return;
    }
    createUser.mutate();
  }

  function nextStep() {
    if (!currentValid) {
      setMessage("Completa los datos requeridos de este paso antes de continuar.");
      return;
    }
    setMessage("");
    setStep((current) => Math.min(current + 1, wizardSteps.length - 1));
  }

  return (
    <>
      <PageTitle
        title="Usuarios"
        description="Alta operacional por persona, perfil, archivo autorizado y seguridad."
        action={
          <div className="toolbar">
            <Link className="button-link ghost-link" href="/roles"><UserRoundCog size={17} /> Administrar roles</Link>
            <button className="ghost" type="button" onClick={() => users.refetch()}><RefreshCcw size={17} /> Actualizar</button>
          </div>
        }
      />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}
      <div className="split users-layout">
        <section className="card user-wizard-card">
          <div className="wizard-steps" aria-label="Alta de usuario">
            {wizardSteps.map((item, index) => (
              <button
                className={`wizard-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
                type="button"
                key={item.key}
                onClick={() => setStep(index)}
              >
                <span>{index < step ? <CheckCircle2 size={16} /> : index + 1}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>

          <form className="wizard-body" onSubmit={submitUser}>
            <header>
              <p className="muted">{wizardSteps[step].description}</p>
              <h2>{wizardSteps[step].title}</h2>
            </header>

            {step === 0 ? (
              <div className="form-grid two-columns">
                <label>Nombres<input value={firstNames} onChange={(event) => setFirstNames(event.target.value)} required /></label>
                <label>Apellidos<input value={lastNames} onChange={(event) => setLastNames(event.target.value)} required /></label>
                <label>Tipo identificacion
                  <select value={identificationType} onChange={(event) => setIdentificationType(event.target.value)}>
                    <option value="cc">Cedula de ciudadania</option>
                    <option value="ce">Cedula de extranjeria</option>
                    <option value="pa">Pasaporte</option>
                  </select>
                </label>
                <label>Identificacion<input inputMode="numeric" value={identification} onChange={(event) => setIdentification(event.target.value.replace(/\D/g, ""))} required /></label>
                <label>Correo<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setUsername(event.target.value.split("@")[0] ?? ""); }} required /></label>
                <label>Telefono<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                <label>Cargo<input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Analista documental" /></label>
                <label>Dependencia<input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Archivo" /></label>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="form-grid two-columns">
                <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
                <label>Password temporal<input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} placeholder="Minimo 12, mayuscula, minuscula, numero y simbolo" /></label>
                <label>Metodo autenticacion
                  <select value={authMethod} onChange={(event) => setAuthMethod(event.target.value)}>
                    <option value="password">Password temporal</option>
                    <option value="directory">Directorio corporativo futuro</option>
                  </select>
                </label>
                <label className="inline-check wizard-toggle">
                  <input type="checkbox" checked={mfaEnabled} onChange={(event) => setMfaEnabled(event.target.checked)} />
                  MFA preparado
                </label>
                <div className="card compact wizard-note">
                  <KeyRound size={18} />
                  <span>AMBAR usa el correo para ingreso. El username queda como referencia operacional hasta activar proveedor corporativo.</span>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="form-grid">
                <label>Perfil operativo
                  <select value={role} onChange={(event) => setRole(event.target.value)}>
                    {(roles.data ?? []).map((item) => <option key={item.idRole} value={item.role_name}>{roleLabel(item.role_name)}</option>)}
                  </select>
                </label>
                <div className="permission-matrix">
                  <div className="permission-row header"><span>Modulo</span><span>Ver</span><span>Crear</span><span>Editar</span><span>Aprobar</span><span>Auditar</span></div>
                  {["Gestion documental", "Custodia", "TRD", "RRHH", "Auditoria"].map((module) => (
                    <div className="permission-row" key={module}>
                      <strong>{module}</strong>
                      {["ver", "crear", "editar", "aprobar", "auditar"].map((capability) => <span className="status" key={capability}>segun rol</span>)}
                    </div>
                  ))}
                </div>
                <label>Permiso especial documentado<input value={specialCapability} onChange={(event) => setSpecialCapability(event.target.value)} placeholder="Ej: acceso temporal a auditoria" /></label>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="archive-access-grid">
                {archives.isLoading ? <p className="muted">Cargando archivos autorizables...</p> : null}
                {(archives.data ?? []).map((archive) => (
                  <article className={`archive-access-card ${archiveAccess[archive.idArchive] ? "selected" : ""}`} key={archive.idArchive}>
                    <div>
                      <strong><Building2 size={16} /> {archive.archive_name}</strong>
                      <p className="muted">{archive.archive_code} / {archive.archive_type}</p>
                    </div>
                    <label>Tipo acceso
                      <select value={archiveAccess[archive.idArchive] ?? ""} onChange={(event) => setArchiveAccess((current) => ({ ...current, [archive.idArchive]: event.target.value }))}>
                        <option value="">Sin acceso</option>
                        {archiveAccessLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                      </select>
                    </label>
                    <p className="muted">{archiveAccessLevels.find((level) => level.value === archiveAccess[archive.idArchive])?.description ?? "El usuario no vera este archivo."}</p>
                  </article>
                ))}
                {!archives.isLoading && !(archives.data ?? []).length ? <p className="muted">No hay archivos disponibles para asignar.</p> : null}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="form-grid two-columns">
                <label className="inline-check wizard-toggle">
                  <input type="checkbox" checked={mechanicalSignature} onChange={(event) => setMechanicalSignature(event.target.checked)} />
                  Firma mecanica habilitada
                </label>
                <label className="inline-check wizard-toggle">
                  <input type="checkbox" checked={digitalSignature} onChange={(event) => setDigitalSignature(event.target.checked)} />
                  Firma digital preparada
                </label>
                <label>Expiracion acceso<input type="date" value={accessExpiresAt} onChange={(event) => setAccessExpiresAt(event.target.value)} /></label>
                <label>Estado
                  <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
                    <option value="active">Activo</option>
                    <option value="pending">Pendiente</option>
                  </select>
                </label>
                <div className="card compact wizard-note">
                  <ShieldCheck size={18} />
                  <span>El alta se auditara y los accesos por archivo quedaran aplicados en backend. Campos de firma quedan listos para la capa de firma avanzada.</span>
                </div>
              </div>
            ) : null}

            <footer className="wizard-actions">
              <button className="ghost" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}><ChevronLeft size={16} /> Anterior</button>
              {step < wizardSteps.length - 1 ? (
                <button type="button" onClick={nextStep}>Continuar <ChevronRight size={16} /></button>
              ) : (
                <button type="submit" disabled={createUser.isPending}><Plus size={17} /> Crear usuario</button>
              )}
            </footer>
          </form>
        </section>

        <section className="card table-card">
          <div className="toolbar space-between">
            <h2>Usuarios</h2>
            <label className="inline-check">
              <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
              Mostrar inactivos
            </label>
          </div>
          <table>
            <thead><tr><th>Usuario</th><th>Email</th><th>Estado</th><th>Rol</th><th>Permisos</th><th>Acciones</th></tr></thead>
            <tbody>
              {users.data?.map((item) => {
                const draftRole = userRoleDrafts[item.identification] ?? item.roles[0] ?? "viewer";
                return (
                  <tr key={item.identification}>
                    <td><strong>{item.name}</strong><br /><span className="muted">{item.identification}</span></td>
                    <td>{item.email}</td>
                    <td><span className={`status ${item.status !== "active" ? "danger-status" : ""}`}>{item.status}</span></td>
                    <td>
                      <select value={draftRole} onChange={(event) => setUserRoleDrafts((current) => ({ ...current, [item.identification]: event.target.value }))}>
                        {(roles.data ?? []).map((roleItem) => <option key={roleItem.idRole} value={roleItem.role_name}>{roleLabel(roleItem.role_name)}</option>)}
                      </select>
                    </td>
                    <td><span className="status"><ShieldCheck size={14} /> {item.permissions.includes("*") ? "Todos" : item.permissions.length}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="ghost" type="button" onClick={() => updateUserRole.mutate({ user: item, nextRole: draftRole })}><Save size={15} /> Guardar</button>
                        {item.status === "active" ? <button className="ghost danger" type="button" onClick={() => deactivateUser.mutate(item)}><Trash2 size={15} /> Desactivar</button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.isLoading ? <p className="muted">Cargando usuarios...</p> : null}
        </section>
      </div>
    </>
  );
}
