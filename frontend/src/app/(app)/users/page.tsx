"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
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
  UserPlus,
  UserRoundCog,
  X
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
  phone?: string | null;
  position_name?: string | null;
  department_name?: string | null;
  mfa_enabled?: boolean;
  mfa_configured?: boolean;
  roles: string[];
  permissions: string[];
};

type RoleItem = { idRole: number; role_name: string; description: string; permissions: string[] };
type ArchiveItem = { idArchive: number; archive_code: string; archive_name: string; archive_type: string; status: string };
type HRPosition = { idPosition: number; name: string; level: string; department: string; status: string };
type HRDepartment = { idDepartment: number; name: string; status: string };
type MfaSetup = { identification: string; email: string; mfa_enabled: boolean; secret: string; otpauth_uri: string };

const wizardSteps = [
  { key: "persona", title: "Persona", description: "Datos minimos para crear el acceso." },
  { key: "perfil", title: "Perfil", description: "Rol operativo del usuario." },
  { key: "archivos", title: "Archivos", description: "Archivos autorizados para operar." },
  { key: "seguridad", title: "Seguridad", description: "Estado, firmas y acceso inicial." }
] as const;

const archiveAccessLevels = [
  { value: "lectura", label: "Lectura", backend: "read", description: "Consulta informacion del archivo." },
  { value: "escritura", label: "Escritura", backend: "operate", description: "Crea y actualiza registros documentales." },
  { value: "custodia", label: "Custodia", backend: "operate", description: "Opera recepciones, prestamos y movimientos." },
  { value: "auditoria", label: "Auditoria", backend: "operate", description: "Consulta trazabilidad autorizada." },
  { value: "administracion", label: "Administracion", backend: "admin", description: "Administra usuarios del archivo." }
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

function onlyLetters(value: string) {
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(value.trim());
}

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useQueryClient();
  const drawerOpen = searchParams.get("action") === "create";
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [identificationType, setIdentificationType] = useState("cc");
  const [identification, setIdentification] = useState("");
  const [firstNames, setFirstNames] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("viewer");
  const [archiveAccess, setArchiveAccess] = useState<Record<number, string>>({});
  const [mechanicalSignature, setMechanicalSignature] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [accountStatus, setAccountStatus] = useState("active");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({});
  const [mfaUser, setMfaUser] = useState<UserItem | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [message, setMessage] = useState("");

  const users = useQuery({
    queryKey: ["users", includeInactive],
    queryFn: async () => (await api.get<UserItem[]>(`/users?include_inactive=${includeInactive}`)).data
  });
  const roles = useQuery({ queryKey: ["users", "roles"], queryFn: async () => (await api.get<RoleItem[]>("/users/roles")).data });
  const archives = useQuery({ queryKey: ["archives", "user-wizard"], queryFn: async () => (await api.get<ArchiveItem[]>("/archives")).data });
  const positions = useQuery({ queryKey: ["hr", "positions", "user-wizard"], queryFn: async () => (await api.get<HRPosition[]>("/hr/positions")).data });
  const departments = useQuery({ queryKey: ["hr", "departments", "user-wizard"], queryFn: async () => (await api.get<HRDepartment[]>("/hr/departments")).data });

  const fullName = useMemo(() => `${firstNames} ${lastNames}`.trim().replace(/\s+/g, " "), [firstNames, lastNames]);
  const selectedArchives = useMemo(() => Object.entries(archiveAccess).filter(([, level]) => Boolean(level)), [archiveAccess]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!/^\d{6,12}$/.test(identification)) errors.identification = "Debe tener entre 6 y 12 numeros.";
    if (firstNames.trim().length < 2 || !onlyLetters(firstNames)) errors.firstNames = "Solo letras, minimo 2 caracteres.";
    if (lastNames.trim().length < 2 || !onlyLetters(lastNames)) errors.lastNames = "Solo letras, minimo 2 caracteres.";
    if (!/\S+@\S+\.\S+/.test(email)) errors.email = "Correo invalido.";
    if (!/^\d{10}$/.test(phone)) errors.phone = "Debe tener exactamente 10 numeros.";
    if (!role) errors.role = "Selecciona un perfil.";
    if (role !== "super_admin" && selectedArchives.length === 0) errors.archives = "Asigna al menos un archivo o usa super admin.";
    return errors;
  }, [email, firstNames, identification, lastNames, phone, role, selectedArchives.length]);

  const stepErrors = useMemo(() => [
    [fieldErrors.identification, fieldErrors.firstNames, fieldErrors.lastNames, fieldErrors.email, fieldErrors.phone].filter(Boolean),
    [fieldErrors.role].filter(Boolean),
    [fieldErrors.archives].filter(Boolean),
    []
  ] as string[][], [fieldErrors]);
  const currentValid = stepErrors[step].length === 0;

  const closeDrawer = () => {
    setMessage("");
    router.push("/users");
  };

  const resetForm = () => {
    setIdentification("");
    setFirstNames("");
    setLastNames("");
    setEmail("");
    setPhone("");
    setPosition("");
    setDepartment("");
    setRole("viewer");
    setArchiveAccess({});
    setMechanicalSignature(false);
    setDigitalSignature(false);
    setAccessExpiresAt("");
    setAccountStatus("active");
    setStep(0);
    setMaxStepReached(0);
  };

  const createUser = useMutation({
    mutationFn: async () => {
      const response = await api.post("/users", {
        identification,
        name: fullName,
        email,
        password: identification,
        phone,
        position_name: position || null,
        department_name: department || null,
        auth_method: "temporary_password",
        mfa_enabled: false,
        mechanical_signature_enabled: mechanicalSignature,
        digital_signature_ready: digitalSignature,
        access_expires_at: accessExpiresAt ? new Date(`${accessExpiresAt}T23:59:59`).toISOString() : null,
        role_names: [role],
        company_id: "default",
        location_id: 1,
        status: accountStatus
      });
      await Promise.all(selectedArchives.map(([archiveId, level]) => api.post(`/archives/${archiveId}/users`, {
        identification,
        access_level: accessToBackend(level)
      })));
      return response.data;
    },
    onSuccess: () => {
      resetForm();
      setMessage("Usuario creado. Clave inicial: la misma identificacion del usuario.");
      closeDrawer();
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => setMessage(apiErrorMessage(error, "No fue posible crear el usuario. Revisa los campos marcados."))
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
      setMessage("Usuario desactivado.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible desactivar el usuario.")
  });

  const setupMfa = useMutation({
    mutationFn: async (user: UserItem) => (await api.post<MfaSetup>(`/users/${user.identification}/mfa/setup`)).data,
    onSuccess: (data) => {
      setMfaSetup(data);
      setMessage("MFA activado. Escanea o registra la clave en una app autenticadora.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => setMessage(apiErrorMessage(error, "No fue posible configurar MFA."))
  });

  const disableMfa = useMutation({
    mutationFn: async (user: UserItem) => api.post(`/users/${user.identification}/mfa/disable`),
    onSuccess: () => {
      setMfaUser(null);
      setMfaSetup(null);
      setMessage("MFA desactivado para el usuario.");
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setMessage("No fue posible desactivar MFA.")
  });

  function submitUser(event: FormEvent) {
    event.preventDefault();
    const firstInvalid = stepErrors.findIndex((errors) => errors.length > 0);
    if (firstInvalid >= 0) {
      setStep(firstInvalid);
      setMaxStepReached((current) => Math.max(current, firstInvalid));
      setMessage(stepErrors[firstInvalid][0]);
      return;
    }
    createUser.mutate();
  }

  function nextStep() {
    if (!currentValid) {
      setMessage(stepErrors[step][0]);
      return;
    }
    const next = Math.min(step + 1, wizardSteps.length - 1);
    setMessage("");
    setStep(next);
    setMaxStepReached((current) => Math.max(current, next));
  }

  function goToStep(index: number) {
    if (index <= maxStepReached) {
      setStep(index);
      return;
    }
    setMessage("Antes falta: " + (stepErrors[step][0] ?? "completar el paso actual"));
  }

  return (
    <>
      <PageTitle
        title="Usuarios"
        description="Lista de usuarios, perfiles y accesos por archivo. La creacion se hace en flujo guiado."
        action={
          <div className="toolbar">
            <Link className="button-link ghost-link" href="/roles?action=create"><UserRoundCog size={17} /> Crear perfil</Link>
            <Link className="button-link" href="/users?action=create"><UserPlus size={17} /> Crear usuario</Link>
            <button className="ghost" type="button" onClick={() => users.refetch()}><RefreshCcw size={17} /> Actualizar</button>
          </div>
        }
      />
      {message ? <div className="card compact"><span className="status">{message}</span></div> : null}

      <section className="card table-card">
        <div className="toolbar space-between">
          <h2>Usuarios</h2>
          <label className="inline-check">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Mostrar inactivos
          </label>
        </div>
        <table>
          <thead><tr><th>Usuario</th><th>Email</th><th>Cargo</th><th>Dependencia</th><th>Seguridad</th><th>Rol</th><th>Permisos</th><th>Acciones</th></tr></thead>
          <tbody>
            {users.data?.map((item) => {
              const draftRole = userRoleDrafts[item.identification] ?? item.roles[0] ?? "viewer";
              return (
                <tr key={item.identification}>
                  <td><strong>{item.name}</strong><br /><span className="muted">{item.identification}{item.phone ? ` / ${item.phone}` : ""}</span></td>
                  <td>{item.email}</td>
                  <td>{item.position_name ?? "Sin cargo"}</td>
                  <td>{item.department_name ?? "Sin dependencia"}</td>
                  <td>
                    <span className={`status ${item.status !== "active" ? "danger-status" : ""}`}>{item.status}</span>{" "}
                    <span className={item.mfa_enabled ? "badge badge-success" : "badge badge-neutral"}>MFA {item.mfa_enabled ? "activo" : "off"}</span>
                  </td>
                  <td>
                    <select value={draftRole} onChange={(event) => setUserRoleDrafts((current) => ({ ...current, [item.identification]: event.target.value }))}>
                      {(roles.data ?? []).map((roleItem) => <option key={roleItem.idRole} value={roleItem.role_name}>{roleLabel(roleItem.role_name)}</option>)}
                    </select>
                  </td>
                  <td><span className="status"><ShieldCheck size={14} /> {item.permissions.includes("*") ? "Todos" : item.permissions.length}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="ghost" type="button" onClick={() => updateUserRole.mutate({ user: item, nextRole: draftRole })}><Save size={15} /> Guardar</button>
                      <button className="ghost" type="button" onClick={() => { setMfaUser(item); setMfaSetup(null); }}><KeyRound size={15} /> MFA</button>
                      {item.status === "active" ? <button className="ghost danger" type="button" onClick={() => deactivateUser.mutate(item)}><Trash2 size={15} /> Desactivar</button> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.isLoading ? <div className="skeleton-stack"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div> : null}
      </section>

      {drawerOpen ? (
        <div className="drawer-layer">
          <button className="drawer-scrim" type="button" onClick={closeDrawer} aria-label="Cerrar" />
          <aside className="detail-drawer wide-drawer">
            <div className="drawer-header">
              <div>
                <h2>Crear usuario</h2>
                <p>Alta simple: datos basicos, perfil, archivo y estado.</p>
              </div>
              <button className="icon-button" type="button" onClick={closeDrawer} title="Cerrar"><X size={17} /></button>
            </div>

            <div className="wizard-steps" aria-label="Alta de usuario">
              {wizardSteps.map((item, index) => (
                <button className={`wizard-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`} type="button" key={item.key} onClick={() => goToStep(index)}>
                  <span>{index < step ? <CheckCircle2 size={16} /> : index + 1}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>

            {stepErrors[step].length ? (
              <div className="validation-panel">
                <strong><AlertCircle size={16} /> Para continuar falta</strong>
                {stepErrors[step].map((error) => <span key={error}>{error}</span>)}
              </div>
            ) : null}

            <form className="wizard-body" onSubmit={submitUser}>
              <header>
                <p className="muted">{wizardSteps[step].description}</p>
                <h2>{wizardSteps[step].title}</h2>
              </header>

              {step === 0 ? (
                <div className="form-grid two-columns">
                  <label>Nombres<input value={firstNames} onChange={(event) => setFirstNames(event.target.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, ""))} maxLength={80} required />{fieldErrors.firstNames ? <small className="field-error">{fieldErrors.firstNames}</small> : null}</label>
                  <label>Apellidos<input value={lastNames} onChange={(event) => setLastNames(event.target.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, ""))} maxLength={80} required />{fieldErrors.lastNames ? <small className="field-error">{fieldErrors.lastNames}</small> : null}</label>
                  <label>Tipo identificacion
                    <select value={identificationType} onChange={(event) => setIdentificationType(event.target.value)}>
                      <option value="cc">Cedula de ciudadania</option>
                      <option value="ce">Cedula de extranjeria</option>
                      <option value="pa">Pasaporte</option>
                    </select>
                  </label>
                  <label>Identificacion<input inputMode="numeric" value={identification} onChange={(event) => setIdentification(event.target.value.replace(/\D/g, "").slice(0, 12))} minLength={6} maxLength={12} required />{fieldErrors.identification ? <small className="field-error">{fieldErrors.identification}</small> : null}</label>
                  <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value.trim())} maxLength={255} required />{fieldErrors.email ? <small className="field-error">{fieldErrors.email}</small> : null}</label>
                  <label>Telefono<input inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} minLength={10} maxLength={10} required />{fieldErrors.phone ? <small className="field-error">{fieldErrors.phone}</small> : null}</label>
                  <label>Cargo
                    <select value={position} onChange={(event) => setPosition(event.target.value)}>
                      <option value="">Sin asignar</option>
                      {(positions.data ?? []).map((item) => <option key={item.idPosition} value={item.name}>{item.name} / {item.level}</option>)}
                    </select>
                  </label>
                  <label>Dependencia
                    <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                      <option value="">Sin asignar</option>
                      {(departments.data ?? []).map((item) => <option key={item.idDepartment} value={item.name}>{item.name}</option>)}
                    </select>
                  </label>
                  <div className="card compact wizard-note">
                    <KeyRound size={18} />
                    <span>Acceso inicial simple: el usuario entra con su correo y la clave inicial igual a su identificacion.</span>
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="form-grid">
                  <label>Perfil operativo
                    <select value={role} onChange={(event) => setRole(event.target.value)}>
                      {(roles.data ?? []).map((item) => <option key={item.idRole} value={item.role_name}>{roleLabel(item.role_name)}</option>)}
                    </select>
                    {fieldErrors.role ? <small className="field-error">{fieldErrors.role}</small> : null}
                  </label>
                  <div className="profile-summary">
                    <strong>{roleLabel(role)}</strong>
                    <p>El perfil define permisos por accion. Puedes ajustar la matriz desde Crear perfil.</p>
                    {role === "super_admin" ? <span className="badge badge-warning">Administrador universal</span> : <span className="badge badge-neutral">Permisos segun perfil</span>}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="archive-access-grid">
                  {fieldErrors.archives ? <div className="validation-panel"><strong><AlertCircle size={16} /> Archivo requerido</strong><span>{fieldErrors.archives}</span></div> : null}
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
                </div>
              ) : null}

              {step === 3 ? (
                <div className="form-grid two-columns">
                  <label className="inline-check wizard-toggle"><input type="checkbox" checked={mechanicalSignature} onChange={(event) => setMechanicalSignature(event.target.checked)} /> Firma mecanica habilitada</label>
                  <label className="inline-check wizard-toggle"><input type="checkbox" checked={digitalSignature} onChange={(event) => setDigitalSignature(event.target.checked)} /> Firma digital preparada</label>
                  <label>Expiracion acceso<input type="date" value={accessExpiresAt} onChange={(event) => setAccessExpiresAt(event.target.value)} /></label>
                  <label>Estado
                    <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </label>
                  <div className="card compact wizard-note">
                    <ShieldCheck size={18} />
                    <span>MFA no se activa aqui para no trabar el alta. Se configura desde la lista del usuario cuando la empresa lo necesite.</span>
                  </div>
                </div>
              ) : null}

              <footer className="wizard-actions">
                <button className="ghost" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}><ChevronLeft size={16} /> Anterior</button>
                {step < wizardSteps.length - 1 ? <button type="button" onClick={nextStep}>Continuar <ChevronRight size={16} /></button> : <button type="submit" disabled={createUser.isPending}><Plus size={17} /> Crear usuario</button>}
              </footer>
            </form>
          </aside>
        </div>
      ) : null}

      {mfaUser ? (
        <div className="drawer-layer">
          <button className="drawer-scrim" type="button" onClick={() => { setMfaUser(null); setMfaSetup(null); }} aria-label="Cerrar MFA" />
          <aside className="detail-drawer">
            <div className="drawer-header">
              <div>
                <h2>Configurar MFA</h2>
                <p>{mfaUser.name} / {mfaUser.email}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => { setMfaUser(null); setMfaSetup(null); }}><X size={17} /></button>
            </div>
            <div className="profile-summary">
              <strong>Autenticacion TOTP</strong>
              <p>Activa un segundo factor con Google Authenticator, Microsoft Authenticator, 1Password u otra app compatible.</p>
              <span className={mfaUser.mfa_enabled ? "badge badge-success" : "badge badge-neutral"}>{mfaUser.mfa_enabled ? "MFA activo" : "MFA inactivo"}</span>
            </div>
            {mfaSetup ? (
              <div className="form-grid">
                <label>Clave secreta TOTP<input readOnly value={mfaSetup.secret} /></label>
                <label>URI para autenticador<textarea readOnly rows={4} value={mfaSetup.otpauth_uri} /></label>
                <p className="muted">Escanea esta URI con la app autenticadora. Desde el proximo login se pedira codigo MFA.</p>
              </div>
            ) : null}
            <div className="toolbar">
              <button type="button" onClick={() => setupMfa.mutate(mfaUser)} disabled={setupMfa.isPending}><KeyRound size={16} /> Activar / regenerar MFA</button>
              {mfaUser.mfa_enabled ? <button className="ghost danger" type="button" onClick={() => disableMfa.mutate(mfaUser)}><Trash2 size={16} /> Desactivar MFA</button> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
