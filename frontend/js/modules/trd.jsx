/* ============================================================
   AMBAR - Gestion Documental: TRD & Retencion
   ============================================================ */
const { useState: tdS } = React;

function normalizeDisposition(value) {
  const raw = String(value || "").trim();
  const map = { CT: "Conservacion total", E: "Eliminacion", S: "Seleccion", MT: "Medio tecnologico" };
  return map[raw] || raw || "Conservacion total";
}

function mapTrdRows(items) {
  const grouped = new Map();
  (items || []).forEach((item, i) => {
    const series = item.series || item;
    const seriesId = series.idSeries || item.series_id || item.ps610IdSeries || item.idSeries || item.id || i;
    const code = series.series_code || series.code || item.series_code || item.code || String(i + 1).padStart(3, "0");
    const name = series.series_name || series.name || item.series_name || item.name || "Serie documental";
    const current = grouped.get(seriesId) || {
      id: seriesId,
      code,
      name,
      description: series.description || item.description || "",
      dependency_id: series.dependency_id || item.dependency_id || item.dependency?.idDependency || item.dependency?.id || series.dependency?.idDependency || "",
      dependency: item.dependency_name || item.dependency?.name || series.dependency?.name || "",
      status: series.status || item.status || "active",
      sub: [],
      subseriesDetails: [],
      typologies: [],
      gestion: 0,
      central: 0,
      final: "Conservacion total",
    };
    const subseriesList = Array.isArray(item.subseries) ? item.subseries : [item.subseries || item].filter(Boolean);
    subseriesList.forEach((sub) => {
      const subName = sub.subseries_name || sub.name || item.subseries_name;
      if (subName && !current.sub.includes(subName)) current.sub.push(subName);
      const subId = sub.idSubseries || sub.id || item.subseries_id || item.idSubseries;
      const retention = item.retention || {};
      const management = sub.retention_management_years ?? sub.archive_management ?? retention.management_years ?? item.retention_management_years ?? item.archive_management ?? item.gestion ?? 0;
      const central = sub.retention_central_years ?? sub.archive_central ?? retention.central_years ?? item.retention_central_years ?? item.archive_central ?? item.central ?? 0;
      if (management !== undefined) current.gestion = Math.max(Number(current.gestion || 0), Number(management || 0));
      if (central !== undefined) current.central = Math.max(Number(current.central || 0), Number(central || 0));
      current.final = normalizeDisposition(sub.final_disposition || sub.final_action || retention.final_action || item.final_disposition || item.final_action || item.disposition || item.disposition_final || current.final);
      if (subId && subName && !current.subseriesDetails.some(item => Number(item.id) === Number(subId))) {
        current.subseriesDetails.push({
          id: subId,
          series_id: seriesId,
          series_code: code,
          series_name: name,
          name: subName,
          archive_management: Number(management || 0),
          archive_central: Number(central || 0),
          final_action: sub.final_action || retention.final_action || item.final_action || item.disposition || "CT",
          procedure: sub.procedure || retention.procedure || item.procedure || "",
          status: sub.status || "active",
        });
      }
      const types = sub.document_types || sub.typologies || item.document_types || item.typologies || [];
      (Array.isArray(types) ? types : []).forEach((type) => {
        const label = type.name || type.type_name || type.type_code || type.code;
        if (label && !current.typologies.includes(label)) current.typologies.push(label);
      });
    });
    grouped.set(seriesId, current);
  });
  return Array.from(grouped.values());
}

function dispositionTone(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("elimin")) return "danger";
  if (v.includes("sele")) return "warning";
  return "success";
}

function CreateSeriesModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({ code: "", name: "", description: "", dependency_id: "", status: "active" });
  const { data: depsRaw } = useLiveData(() => AmbarAPI.endpoints.trdDependencies(), [], []);
  const dependencies = AmbarAPI.listFrom(depsRaw);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    const missing = [];
    if (!payload.name.trim()) missing.push("nombre");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Serie incompleta" });
      return;
    }
    try {
      const body = { ...payload, code: null, dependency_id: payload.dependency_id ? Number(payload.dependency_id) : null };
      const created = await AmbarAPI.post("/trd/series", body);
      toast("Serie creada en la TRD.", { tone: "ok", title: "TRD actualizada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la serie.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal title="Nueva serie documental" sub="La serie queda gobernada por una dependencia TRD." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear serie</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" hint="AMBAR genera este código automáticamente al guardar la serie."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input maxLength={160} value={payload.name} onChange={e => setField("name", e.target.value)} placeholder="Historias laborales" /></Field>
        <Field label="Dependencia"><select value={payload.dependency_id} onChange={e => setField("dependency_id", e.target.value)}><option value="">Usar dependencia por defecto</option>{dependencies.map(d => <option key={d.idDependency || d.id} value={d.idDependency || d.id}>{d.name || d.code}</option>)}</select></Field>
        <Field label="Estado"><select value={payload.status} onChange={e => setField("status", e.target.value)}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripcion"><textarea value={payload.description} maxLength={500} onChange={e => setField("description", e.target.value)} placeholder="Alcance documental de esta serie" /></Field></div>
      </div>
    </Modal>
  );
}

function EditSeriesModal({ series, dependencies, onClose, onSaved }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({
    name: series.name || "",
    description: series.description || "",
    dependency_id: series.dependency_id || series.dependency?.idDependency || "",
    status: series.status || "active",
  });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    if (!payload.name.trim()) {
      toast("Falta: nombre de la serie.", { tone: "danger", title: "Serie incompleta" });
      return;
    }
    try {
      await AmbarAPI.patch(`/trd/series/${series.id}`, {
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        dependency_id: payload.dependency_id ? Number(payload.dependency_id) : null,
        status: payload.status,
      });
      toast("Serie actualizada.", { tone: "ok", title: "TRD actualizada" });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible actualizar la serie.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal title="Editar serie documental" sub="Actualiza nombre, dependencia y estado sin romper expedientes existentes." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Guardar cambios</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Codigo"><AutoCodeInput value={series.code || ""} /></Field>
        <Field label="Nombre" required><input maxLength={160} value={payload.name} onChange={e => setField("name", e.target.value)} /></Field>
        <Field label="Dependencia"><select value={payload.dependency_id || ""} onChange={e => setField("dependency_id", e.target.value)}><option value="">Dependencia por defecto</option>{dependencies.map(d => <option key={d.idDependency || d.id} value={d.idDependency || d.id}>{d.name || d.code}</option>)}</select></Field>
        <Field label="Estado"><select value={payload.status} onChange={e => setField("status", e.target.value)}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripcion"><textarea value={payload.description || ""} maxLength={500} onChange={e => setField("description", e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function CreateDependencyModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({ code: "", name: "", description: "", status: "active" });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    if (!payload.name.trim()) {
      toast("El nombre es obligatorio. El código lo puede generar AMBAR.", { tone: "danger", title: "Dependencia incompleta" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/trd/dependencies", { ...payload, code: null });
      toast("Dependencia creada para gobernar series documentales.", { tone: "ok", title: "TRD actualizada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la dependencia.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal title="Nueva dependencia" sub="Toda serie debe pertenecer a una dependencia funcional." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear dependencia</Button></>}>
      <div className="grid cols-2">
        <Field label="Código" hint="AMBAR genera este código automáticamente al guardar la dependencia."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input value={payload.name} maxLength={160} onChange={e => setField("name", e.target.value)} placeholder="Talento Humano" /></Field>
        <Field label="Estado"><select value={payload.status} onChange={e => setField("status", e.target.value)}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripcion"><textarea value={payload.description} maxLength={500} onChange={e => setField("description", e.target.value)} placeholder="Funcion documental de la dependencia" /></Field></div>
      </div>
    </Modal>
  );
}

function EditSubseriesModal({ subseries, onClose, onSaved }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({
    name: subseries.name || "",
    archive_management: subseries.archive_management ?? 0,
    archive_central: subseries.archive_central ?? 0,
    final_action: subseries.final_action || "CT",
    procedure: subseries.procedure || "",
    status: subseries.status || "active",
  });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    const missing = [];
    if (!payload.name.trim()) missing.push("nombre de subserie");
    const management = Number(payload.archive_management || 0);
    const central = Number(payload.archive_central || 0);
    if (management + central < 1) missing.push("retencion minima de 1 ano");
    if (missing.length) return toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Subserie incompleta" });
    try {
      await AmbarAPI.patch(`/trd/subseries/${subseries.id}`, {
        name: payload.name.trim(),
        archive_management: management,
        archive_central: central,
        final_action: payload.final_action,
        procedure: payload.procedure.trim() || null,
        status: payload.status,
      });
      toast("Subserie y retencion actualizadas.", { tone: "ok", title: "TRD actualizada" });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible actualizar la subserie.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal lg title="Editar subserie y retencion" sub={`${subseries.series_code || ""} ${subseries.series_name || ""}`.trim()} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Guardar cambios</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Subserie" required><input maxLength={160} value={payload.name} onChange={e => setField("name", e.target.value)} /></Field>
        <Field label="Estado"><select value={payload.status} onChange={e => setField("status", e.target.value)}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></Field>
        <Field label="Retencion en gestion (anos)" required><input type="number" min="0" max="100" value={payload.archive_management} onChange={e => setField("archive_management", e.target.value)} /></Field>
        <Field label="Retencion en central (anos)" required><input type="number" min="0" max="100" value={payload.archive_central} onChange={e => setField("archive_central", e.target.value)} /></Field>
        <Field label="Disposicion final" required><select value={payload.final_action} onChange={e => setField("final_action", e.target.value)}><option value="CT">CT - Conservacion total</option><option value="E">E - Eliminacion</option><option value="S">S - Seleccion</option><option value="MT">MT - Medio tecnologico</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Procedimiento"><textarea maxLength={800} value={payload.procedure} onChange={e => setField("procedure", e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function CreateSubseriesModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({
    series_id: "",
    name: "",
    archive_management: 2,
    archive_central: 8,
    final_action: "CT",
    procedure: "",
  });
  const { data: seriesRaw } = useLiveData(() => AmbarAPI.endpoints.trdSeries(), [], []);
  const series = AmbarAPI.listFrom(seriesRaw);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    const missing = [];
    if (!payload.series_id) missing.push("serie");
    if (!payload.name.trim()) missing.push("nombre de subserie");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Subserie incompleta" });
      return;
    }
    const management = Number(payload.archive_management || 0);
    const central = Number(payload.archive_central || 0);
    if (management + central < 1) {
      toast("La retencion total debe ser minimo de 1 ano.", { tone: "danger", title: "Retencion invalida" });
      return;
    }
    try {
      const subseries = await AmbarAPI.post("/trd/subseries", {
        series_id: Number(payload.series_id),
        name: payload.name.trim(),
        retention_years: management + central,
      });
      const subseriesId = subseries.idSubseries || subseries.id || subseries.subseries_id;
      await AmbarAPI.post("/trd/dispositions", {
        subseries_id: Number(subseriesId),
        archive_management: management,
        archive_central: central,
        final_action: payload.final_action,
        procedure: payload.procedure.trim() || null,
      });
      toast("Subserie, retencion y disposicion creadas.", { tone: "ok", title: "TRD actualizada" });
      onCreated && onCreated();
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la subserie.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal lg title="Nueva subserie y retencion" sub="Define la unidad documental que heredan expedientes y documentos." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear subserie</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Serie documental" required>
          <select value={payload.series_id} onChange={e => setField("series_id", e.target.value)}>
            <option value="">Seleccionar serie</option>
            {series.map(s => <option key={s.idSeries || s.id} value={s.idSeries || s.id}>{s.code ? `${s.code} - ` : ""}{s.name || s.series_name}</option>)}
          </select>
        </Field>
        <Field label="Nombre de subserie" required>
          <input value={payload.name} maxLength={160} onChange={e => setField("name", e.target.value)} placeholder="Empleados activos" />
        </Field>
        <Field label="Retencion en gestion (anos)" required>
          <input type="number" min="0" max="100" value={payload.archive_management} onChange={e => setField("archive_management", e.target.value)} />
        </Field>
        <Field label="Retencion en central (anos)" required>
          <input type="number" min="0" max="100" value={payload.archive_central} onChange={e => setField("archive_central", e.target.value)} />
        </Field>
        <Field label="Disposicion final" required>
          <select value={payload.final_action} onChange={e => setField("final_action", e.target.value)}>
            <option value="CT">CT - Conservacion total</option>
            <option value="E">E - Eliminacion</option>
            <option value="S">S - Seleccion</option>
            <option value="MT">MT - Medio tecnologico</option>
          </select>
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Procedimiento">
            <textarea value={payload.procedure} maxLength={800} onChange={e => setField("procedure", e.target.value)} placeholder="Regla archivistica o nota del comite de archivo" />
          </Field>
        </div>
      </div>
      <div className="info-callout" style={{ marginTop: "var(--s4)" }}>
        <Icon name="info" size={16} />
        <p>La retencion se define en la subserie. Cuando se cierre un expediente, AMBAR calcula automaticamente gestion, central y disposicion final.</p>
      </div>
    </Modal>
  );
}

function CreateDocumentTypeModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = tdS({
    type_code: "",
    name: "",
    description: "",
    series_id: "",
    subseries_id: "",
    sector: "general",
    required_in_expedient: true,
    required_metadata: "",
    optional_metadata: "",
  });
  const { data: seriesRaw } = useLiveData(() => AmbarAPI.endpoints.trdSeries(), [], []);
  const { data: subseriesRaw } = useLiveData(() => AmbarAPI.endpoints.trdSubseries(), [], []);
  const series = AmbarAPI.listFrom(seriesRaw);
  const subseries = AmbarAPI.listFrom(subseriesRaw).filter((item) => {
    const seriesRef = item.ps610IdSeries || item.series_id || item.series?.idSeries || item.series?.id;
    return !payload.series_id || !seriesRef || Number(seriesRef) === Number(payload.series_id);
  });
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value, ...(key === "series_id" ? { subseries_id: "" } : {}) }));
  const lines = (value) => String(value || "").split(/\n|,/).map((item) => item.trim()).filter(Boolean);

  const submit = async () => {
    const missing = [];
    if (!payload.name.trim()) missing.push("nombre");
    if (!payload.subseries_id) missing.push("subserie");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Tipología incompleta" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/documents/types", {
        type_code: null,
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        series_id: payload.series_id ? Number(payload.series_id) : null,
        subseries_id: Number(payload.subseries_id),
        sector: payload.sector.trim() || "general",
        required_in_expedient: Boolean(payload.required_in_expedient),
        required_metadata: lines(payload.required_metadata),
        optional_metadata: lines(payload.optional_metadata),
        validation_schema: {},
      });
      toast("Tipología documental creada.", { tone: "ok", title: "TRD actualizada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear la tipología.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal lg title="Nueva tipología documental" sub="La tipología define qué documento se exige y qué metadatos captura AMBAR." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear tipología</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" hint="AMBAR genera este código automáticamente al guardar la tipología."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input maxLength={140} value={payload.name} onChange={e => setField("name", e.target.value)} placeholder="Contrato laboral" /></Field>
        <Field label="Serie documental">
          <select value={payload.series_id} onChange={e => setField("series_id", e.target.value)}>
            <option value="">Seleccionar serie</option>
            {series.map(s => <option key={s.idSeries || s.id} value={s.idSeries || s.id}>{s.code ? `${s.code} - ` : ""}{s.name || s.series_name}</option>)}
          </select>
        </Field>
        <Field label="Subserie" required>
          <select value={payload.subseries_id} onChange={e => setField("subseries_id", e.target.value)}>
            <option value="">Seleccionar subserie</option>
            {subseries.map(s => <option key={s.idSubseries || s.id} value={s.idSubseries || s.id}>{s.name || s.subseries_name}</option>)}
          </select>
        </Field>
        <Field label="Sector"><input maxLength={80} value={payload.sector} onChange={e => setField("sector", e.target.value)} placeholder="RRHH, Transporte, Juridica" /></Field>
        <Field label="Obligatoriedad"><select value={payload.required_in_expedient ? "yes" : "no"} onChange={e => setField("required_in_expedient", e.target.value === "yes")}><option value="yes">Obligatoria en expediente</option><option value="no">Opcional</option></select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descripción"><textarea maxLength={500} value={payload.description} onChange={e => setField("description", e.target.value)} placeholder="Uso documental de esta tipología" /></Field></div>
        <Field label="Metadatos requeridos" hint="Uno por línea o separados por coma. Ejemplo: fecha inicio, salario, cargo"><textarea value={payload.required_metadata} onChange={e => setField("required_metadata", e.target.value)} /></Field>
        <Field label="Metadatos opcionales" hint="Campos que ayudan, pero no bloquean la creación."><textarea value={payload.optional_metadata} onChange={e => setField("optional_metadata", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function TRDPage({ user }) {
  const [tab, setTab] = tdS("series");
  const [creating, setCreating] = tdS(false);
  const [creatingDep, setCreatingDep] = tdS(false);
  const [creatingSub, setCreatingSub] = tdS(false);
  const [creatingType, setCreatingType] = tdS(false);
  const [editingSeries, setEditingSeries] = tdS(null);
  const [editingSubseries, setEditingSubseries] = tdS(null);
  const liveSeries = window.useLiveData(
    () => window.AmbarAPI.endpoints.trdEditor().then(value => mapTrdRows(window.AmbarAPI.listFrom(value, ["rows", "items", "results"]))),
    [],
    []
  );
  const liveDependencies = window.useLiveData(() => window.AmbarAPI.endpoints.trdDependencies(), [], []);
  const liveTypes = window.useLiveData(() => window.AmbarAPI.endpoints.documentTypes(), [], []);
  const series = liveSeries.data;
  const dependencies = window.AmbarAPI.listFrom(liveDependencies.data);
  const documentTypes = window.AmbarAPI.listFrom(liveTypes.data);
  const retentionRows = series.flatMap(s => (s.subseriesDetails || []).map(sub => ({ ...sub, series_code: s.code, series_name: s.name })));
  const refreshTrd = async () => {
    const value = await window.AmbarAPI.endpoints.trdEditor();
    liveSeries.setData(mapTrdRows(window.AmbarAPI.listFrom(value, ["rows", "items", "results"])));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestion Documental</div>
          <h1>TRD & Retencion</h1>
          <p className="lead">Tabla de Retencion Documental: define cuanto tiempo se conserva cada tipo de documento y su disposicion final.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="download" onClick={() => AmbarAPI.download("/trd/export?format=csv", "TRD_AMBAR.csv")}>Exportar TRD</Button>
          {can(user, ["trd.manage"]) && <Button variant="ghost" icon="building" onClick={() => setCreatingDep(true)}>Nueva dependencia</Button>}
          {can(user, ["trd.manage"]) && <Button variant="ghost" icon="layers" onClick={() => setCreatingSub(true)}>Nueva subserie</Button>}
          {can(user, ["trd.manage"]) && <Button variant="ghost" icon="file-plus" onClick={() => setCreatingType(true)}>Nueva tipología</Button>}
          {can(user, ["trd.manage"]) && <Button icon="plus" onClick={() => setCreating(true)}>Nueva serie</Button>}
        </div>
      </div>
      <div className="page-intro an-rise">
        <span className="pi-ico"><Icon name="table" size={18} /></span>
        <div>
          <h4>Que es la TRD</h4>
          <p>Es el instrumento que organiza dependencias, series, subseries y tipologias. AMBAR la usa como motor para clasificar documentos, calcular retencion y preparar transferencias.</p>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "dependencies", label: "Dependencias", icon: "building" }, { key: "series", label: "Series y subseries", icon: "table" }, { key: "types", label: "Tipologías", icon: "file-plus" }, { key: "retention", label: "Retencion", icon: "clock" }, { key: "disposition", label: "Disposicion final", icon: "package-check" }]} />

      {tab === "dependencies" && (
        <Card flush className="an-rise">
          {liveDependencies.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={5} /></div> : dependencies.length === 0 ? <Empty icon="building" title="Sin dependencias">Crea dependencias antes de estructurar series documentales.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Codigo</th><th>Dependencia</th><th>Estado</th><th>Descripcion</th></tr></thead>
                <tbody>{dependencies.map(dep => <tr key={dep.idDependency || dep.id}>
                  <td className="cell-mono cell-strong">{dep.code}</td>
                  <td className="cell-strong">{dep.name}</td>
                  <td><Badge tone={dep.status === "active" ? "success" : "neutral"}>{dep.status}</Badge></td>
                  <td className="muted">{dep.description || "-"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "series" && (
        <Card flush className="an-rise">
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Codigo</th><th>Serie documental</th><th>Subseries</th><th>Tipologías</th><th>Disposicion final</th><th>Acciones</th></tr></thead>
              <tbody>
                {series.map(s => (
                  <tr key={s.code}>
                    <td className="cell-mono cell-strong">{s.code}</td>
                    <td className="cell-strong">{s.name}</td>
                    <td><div className="row wrap gap2">{(s.sub || []).map(x => <span key={x} className="tag-soft">{x}</span>)}</div></td>
                    <td><div className="row wrap gap2">{(s.typologies || []).slice(0, 4).map(x => <span key={x} className="tag-soft">{x}</span>)}{(s.typologies || []).length > 4 && <Badge tone="outline">+{s.typologies.length - 4}</Badge>}</div></td>
                    <td><Badge tone={dispositionTone(s.final)}>{s.final}</Badge></td>
                    <td>{can(user, ["trd.manage"]) && <Button variant="subtle" size="sm" icon="pencil" onClick={() => setEditingSeries(s)}>Editar</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "types" && (
        <Card flush className="an-rise">
          <div className="toolbar-card">
            <div>
              <b>Tipologías documentales</b>
              <p className="muted" style={{ marginTop: 4 }}>Son los tipos reales de documentos que puede exigir una subserie: contrato, hoja de vida, remesa, manifiesto, demanda, factura.</p>
            </div>
            {can(user, ["trd.manage"]) && <Button icon="plus" onClick={() => setCreatingType(true)}>Nueva tipología</Button>}
          </div>
          {liveTypes.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={6} /></div> : documentTypes.length === 0 ? <Empty icon="file-plus" title="Sin tipologías">Crea tipologías para que documentos y cargos no usen textos libres.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Código</th><th>Tipología</th><th>Sector</th><th>Obligatoria</th><th>Metadatos</th><th>Estado</th></tr></thead>
                <tbody>{documentTypes.map(type => {
                  const required = (type.required_metadata && (type.required_metadata.fields || type.required_metadata.items)) || [];
                  const optional = (type.optional_metadata && (type.optional_metadata.fields || type.optional_metadata.items)) || [];
                  return <tr key={type.idDocumentType || type.id || type.type_code}>
                    <td className="cell-mono cell-strong">{type.type_code || type.code}</td>
                    <td className="cell-strong">{type.name}</td>
                    <td>{type.sector || type.template_sector || "general"}</td>
                    <td><Badge tone={type.required_in_expedient ? "warning" : "outline"}>{type.required_in_expedient ? "Obligatoria" : "Opcional"}</Badge></td>
                    <td><div className="row wrap gap2"><Badge tone="brand">{required.length} requeridos</Badge><Badge tone="outline">{optional.length} opcionales</Badge></div></td>
                    <td><Badge tone={type.status === "active" ? "success" : "neutral"}>{type.status || "active"}</Badge></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "retention" && (
        <Card flush className="an-rise">
          <div className="toolbar-card">
            <div>
              <b>Definir retencion documental</b>
              <p className="muted" style={{ marginTop: 4 }}>La retencion se configura por subserie: archivo de gestion, archivo central y disposicion final.</p>
            </div>
            {can(user, ["trd.manage"]) && <Button icon="plus" onClick={() => setCreatingSub(true)}>Nueva subserie</Button>}
          </div>
          {retentionRows.length === 0 ? <Empty icon="clock" title="Sin subseries">Crea una subserie para configurar tiempos de retencion y disposicion final.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Codigo serie</th><th>Serie</th><th>Subserie</th><th>Archivo de Gestion</th><th>Archivo Central</th><th>Retencion total</th><th>Acciones</th></tr></thead>
                <tbody>
                  {retentionRows.map(row => (
                    <tr key={row.id}>
                      <td className="cell-mono">{row.series_code}</td>
                      <td className="cell-strong">{row.series_name}</td>
                      <td>{row.name}</td>
                      <td><Badge tone="info">{row.archive_management} anos</Badge></td>
                      <td><Badge tone="brand">{row.archive_central} anos</Badge></td>
                      <td className="mono">{Number(row.archive_management || 0) + Number(row.archive_central || 0)} anos</td>
                      <td>{can(user, ["trd.manage"]) && <Button variant="subtle" size="sm" icon="pencil" onClick={() => setEditingSubseries(row)}>Editar</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "disposition" && (
        <div className="grid cols-3 stagger">
          {[["Conservacion total", "success", "shield-check", "Documentos con valor historico que se conservan permanentemente."], ["Seleccion", "warning", "filter", "Se conserva una muestra representativa; el resto se elimina."], ["Eliminacion", "danger", "trash", "Documentos sin valor secundario, eliminables tras su retencion legal."]].map(([t, tn, ic, d], i) => (
            <Card key={t} style={{ "--i": i }}>
              <div className="row gap2" style={{ marginBottom: "var(--s2)" }}>
                <span className="m-icon" style={{ background: `var(--${tn === "success" ? "ok" : tn === "warning" ? "warn" : "danger"}-bg)`, color: `var(--${tn === "success" ? "ok" : tn === "warning" ? "warn" : "danger"})` }}><Icon name={ic} size={18} /></span>
                <h3 style={{ fontSize: "var(--fs-md)" }}>{t}</h3>
              </div>
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>{d}</p>
              <div className="divider" />
              <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Series con esta disposicion</span><Badge tone={tn}>{series.filter(s => s.final === t).length}</Badge></div>
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateSeriesModal onClose={() => setCreating(false)} onCreated={(created) => liveSeries.setData(current => [mapTrdRows([created])[0], ...(current || [])])} />}
      {creatingDep && <CreateDependencyModal onClose={() => setCreatingDep(false)} onCreated={(created) => liveDependencies.setData(current => [created, ...(current || [])])} />}
      {creatingSub && <CreateSubseriesModal onClose={() => setCreatingSub(false)} onCreated={refreshTrd} />}
      {creatingType && <CreateDocumentTypeModal onClose={() => setCreatingType(false)} onCreated={(created) => liveTypes.setData(current => [created, ...(current || [])])} />}
      {editingSeries && <EditSeriesModal series={editingSeries} dependencies={dependencies} onClose={() => setEditingSeries(null)} onSaved={refreshTrd} />}
      {editingSubseries && <EditSubseriesModal subseries={editingSubseries} onClose={() => setEditingSubseries(null)} onSaved={refreshTrd} />}
    </>
  );
}
window.TRDPage = TRDPage;
