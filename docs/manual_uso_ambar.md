# Manual de uso e implementacion de AMBAR

## 1. Que es AMBAR

AMBAR es una plataforma SGDEA empresarial para administrar documentos, expedientes, archivos fisicos y digitales, custodia documental, trazabilidad, prestamos, transferencias, radicacion, auditoria y talento humano documental.

AMBAR no debe entenderse como un simple sistema para subir archivos. Su objetivo es responder preguntas operativas reales:

- Donde esta un expediente.
- Quien lo tiene.
- Que documentos contiene.
- Que falta por completar.
- En que archivo esta custodiado.
- En que caja o ubicacion fisica se encuentra.
- Que movimientos ha tenido.
- Quien lo presto, recibio, rechazo o devolvio.
- Que usuario hizo cada accion.
- Que documentos estan vencidos, incompletos o pendientes.

La aplicacion esta organizada por procesos, no por formularios sueltos.

## 2. Conceptos basicos del aplicativo

### Empresa

Es la organizacion que usa AMBAR. Dentro de una empresa se parametrizan archivos, usuarios, roles, dependencias, TRD, expedientes, documentos, cargos, empleados y procesos de custodia.

### Usuario

Persona que ingresa al sistema. Un usuario tiene rol, permisos y acceso a ciertos archivos. No todo usuario ve todo.

### Rol

Perfil de permisos. Define que puede hacer un usuario: ver, crear, editar, aprobar, auditar, administrar o consultar.

### Archivo

Unidad archivistica responsable de custodiar documentacion. No es una sede. Ejemplos:

- Archivo de Gestion Cali.
- Archivo Central Pereira.
- Archivo Historico Bogota.
- Archivo Satelite Medellin.

### Sede

Lugar fisico de la empresa. Una sede puede tener varios archivos.

### TRD

Tabla de Retencion Documental. Es el motor archivistico de AMBAR. Define dependencias, series, subseries, tipologias documentales, tiempos de retencion y disposicion final.

### Dependencia

Area funcional que produce documentos. Ejemplos: Talento Humano, Juridica, Operaciones, Contabilidad, Compras.

### Serie documental

Agrupacion documental de una dependencia. Ejemplos: Historias Laborales, Contratos, Manifiestos, Procesos Judiciales.

### Subserie documental

Division interna de una serie. Ejemplo:

Historias Laborales:

- Empleados activos.
- Ex empleados.
- Contratistas.

### Tipologia documental

Tipo de documento definido por la TRD. No es un archivo PDF. Es el tipo archivistico del documento.

Ejemplos:

- Hoja de vida.
- Contrato laboral.
- Afiliacion EPS.
- Manifiesto de carga.
- Remesa.
- Sentencia.
- Factura.

### Expediente

Unidad principal de trabajo. Agrupa carpetas y documentos relacionados con una persona, proceso, contrato, proveedor, cliente, viaje o tramite.

Ejemplos:

- Expediente laboral de Juan Perez.
- Expediente de contrato 2026-001.
- Expediente de viaje Cali Bogota.
- Expediente juridico de demanda laboral.

### Carpeta

Unidad interna del expediente. Organiza documentos y puede estar asociada a una caja fisica.

### Documento

Registro documental clasificado por TRD, expediente, carpeta y tipologia. Puede tener archivo digital o ser solo fisico.

### Archivo digital

Archivo electronico cargado al repositorio: PDF, DOCX, XLSX, JPG, PNG, XML, ZIP, etc.

### Caja

Unidad fisica donde se ubican carpetas. La ubicacion fisica se controla principalmente desde la caja.

### Ubicacion fisica

Ruta topografica donde esta una caja, carpeta, expediente o documento fisico.

Ejemplo:

Sede Cali -> Archivo Central Cali -> Pasillo 1 -> Estanteria 6 -> Cuerpo A -> Nivel 3 -> Caja BX-001.

### Kardex

Historial documental. Muestra movimientos y eventos relevantes: creacion, transferencia, recepcion, prestamo, devolucion, cambio de ubicacion, rechazo, custodia.

### FUID

Formato Unico de Inventario Documental. Es el inventario formal de expedientes, carpetas o documentos, especialmente usado en transferencias.

### Radicacion

Ventanilla unica manual para registrar comunicaciones entrantes y salientes. Permite asignar responsable, fecha limite, dependencia, expediente relacionado y trazabilidad.

### Auditoria

Registro de acciones sensibles. Permite saber quien hizo que, cuando, desde donde y sobre que entidad.

## 3. Primer uso en una empresa nueva

Este es el orden recomendado cuando AMBAR se instala por primera vez.

### Paso 1. Ingresar como administrador

Entrar al sistema con el usuario administrador inicial.

Ruta:

`/login`

El administrador debe entrar primero para configurar la empresa antes de entregar usuarios operativos.

### Paso 2. Revisar estado tecnico

Ir a:

Administracion -> Configuracion -> Estado sistema

Verificar:

- API activa.
- Base de datos activa.
- Redis activo.
- MinIO configurado.
- RabbitMQ configurado.
- Servicios sin errores.

Si algun servicio aparece caido, no iniciar capacitacion todavia.

### Paso 3. Crear estructura de seguridad

Ir a:

Administracion -> Seguridad

Configurar:

1. Roles.
2. Permisos por modulo.
3. Usuarios.
4. Acceso por archivo.
5. MFA si la empresa lo va a usar.

Recomendacion inicial:

- Super Administrador: solo personal TI o administrador principal.
- Jefe de Archivo: responsable archivistico.
- Auxiliar de Archivo: operacion diaria.
- Recepcion: radicacion.
- Analista RRHH: empleados y reclutamiento.
- Gerencia: consulta e indicadores.
- Auditor: auditoria y trazabilidad.

### Paso 4. Crear dependencias

Ir a:

Gestionar documentos -> TRD & Retencion -> Dependencias

Crear las areas reales de la empresa:

- Gerencia.
- Talento Humano.
- Juridica.
- Contabilidad.
- Operaciones.
- Compras.
- Archivo.

Las dependencias sirven para organizar la TRD y clasificar documentos segun el area que los produce.

### Paso 5. Crear TRD

Ir a:

Gestionar documentos -> TRD & Retencion

Configurar:

1. Dependencias.
2. Series.
3. Subseries.
4. Tipologias documentales.
5. Retencion.
6. Disposicion final.

Ejemplo:

Dependencia: Talento Humano  
Serie: Historias Laborales  
Subserie: Empleados Activos  
Tipologias: Hoja de Vida, Contrato, EPS, ARL, AFP, Diploma  
Retencion Gestion: 2 anos  
Retencion Central: 8 anos  
Disposicion Final: Conservacion total

La TRD debe configurarse antes de operar documentos, porque AMBAR usa esa estructura para clasificar expedientes y documentos.

### Paso 6. Crear archivos fisicos y digitales

Ir a:

Operar custodia -> Archivo Fisico

Crear:

1. Sedes.
2. Archivos.
3. Pasillos.
4. Estanterias.
5. Cuerpos o modulos.
6. Niveles o entrepanos.
7. Cajas.

Ejemplo:

Sede: Pereira  
Archivo: Archivo Central Pereira  
Pasillo: 1  
Estanteria: 3  
Cuerpo: A  
Nivel: 2  
Caja: BX-001

La ubicacion no se escribe manualmente en documentos. Se parametriza y luego se selecciona.

### Paso 7. Crear cargos y dependencias laborales

Ir a:

Talento Humano -> Empleados -> Perfiles de cargo / Dependencias

Crear:

- Cargos.
- Areas laborales.
- Documentos obligatorios por cargo.

Ejemplo cargo:

Cargo: Conductor  
Documentos obligatorios: Hoja de vida, licencia, EPS, ARL, examen medico, contrato.

Esto permite que AMBAR calcule completitud documental del empleado.

### Paso 8. Crear empleados o candidatos

Para empleados existentes:

Talento Humano -> Empleados -> Nuevo empleado

Para procesos nuevos:

Talento Humano -> Reclutamiento -> Nueva vacante / candidato

Cuando un candidato es contratado, debe evolucionar a empleado sin duplicar documentos.

### Paso 9. Crear expedientes

Ir a:

Gestionar documentos -> Expedientes

Crear expediente seleccionando:

1. Archivo.
2. Dependencia.
3. Serie.
4. Subserie.
5. Nombre.
6. Responsable.

Ejemplo:

Expediente: Historia Laboral Nicolas Ramirez  
Archivo: Archivo Gestion RRHH Cali  
Dependencia: Talento Humano  
Serie: Historias Laborales  
Subserie: Empleados Activos

### Paso 10. Crear carpetas

Dentro del expediente, crear carpetas si se requiere separar documentos.

Ejemplo:

- Contratacion.
- Afiliaciones.
- Incapacidades.
- Evaluaciones.
- Retiro.

Si la carpeta es fisica, asignarla a una caja.

### Paso 11. Registrar documentos

Ir a:

Gestionar documentos -> Documentos -> Registrar documento

El flujo correcto es:

1. Seleccionar archivo.
2. Seleccionar dependencia.
3. Seleccionar serie.
4. Seleccionar subserie.
5. Seleccionar tipologia documental.
6. Seleccionar expediente.
7. Seleccionar carpeta.
8. Registrar folios.
9. Cargar archivo digital si existe.
10. Confirmar.

El sistema genera codigo automaticamente.

### Paso 12. Consultar y operar

Una vez hay expedientes y documentos, los usuarios trabajan desde:

- Expedientes.
- Documentos.
- Repositorio.
- Busqueda documental.
- Kardex.
- Archivo fisico.
- Prestamos.
- Transferencias.
- Radicacion.

## 4. Modulos del sistema

## 4.1 Inicio operativo

### Centro operacional

Ruta:

Inicio operativo -> Centro operacional

Sirve para ver el estado general de la operacion.

Muestra:

- Documentos registrados.
- Documentos digitalizados.
- Expedientes activos.
- Prestamos vencidos.
- Transferencias pendientes.
- Alertas recientes.
- Tareas pendientes.
- Estado documental.

Uso recomendado:

El usuario debe iniciar el dia en este modulo para saber que requiere accion.

Si ve una alerta, debe entrar al modulo relacionado:

- Prestamo vencido -> Prestamos.
- Transferencia pendiente -> Transferencias o Recepcion.
- Expediente incompleto -> Expedientes.
- Documento sin ubicacion -> Archivo Fisico.

## 4.2 Gestionar documentos

### Expedientes

Ruta:

Gestionar documentos -> Expedientes

Para que sirve:

Administra unidades documentales completas. Es el centro del SGDEA.

Funcionalidades:

- Crear expedientes.
- Consultar expedientes.
- Ver documentos asociados.
- Ver carpetas.
- Ver completitud.
- Ver ubicacion.
- Ver historial.
- Ver auditoria.

Flujo de uso:

1. Crear expediente.
2. Asociarlo a archivo, dependencia, serie y subserie.
3. Crear carpetas.
4. Agregar documentos.
5. Revisar completitud.
6. Validar foliacion.
7. Consultar trazabilidad.

Si creo un expediente, lo encuentro en:

- Gestionar documentos -> Expedientes.
- Busqueda documental.
- Archivo Fisico si tiene ubicacion.
- Kardex si ya tuvo movimientos.

### Documentos

Ruta:

Gestionar documentos -> Documentos

Para que sirve:

Registra, clasifica y consulta documentos de negocio.

Funcionalidades:

- Registrar documento.
- Asociar tipologia.
- Asociar expediente.
- Asociar carpeta.
- Registrar folios.
- Cargar archivo digital.
- Ver estado.
- Ver responsable.
- Ver vencimientos si aplica.

Flujo de uso:

1. Seleccionar contexto TRD.
2. Elegir expediente y carpeta.
3. Seleccionar tipologia documental.
4. Registrar metadatos.
5. Registrar folios.
6. Cargar archivo digital si existe.
7. Guardar.

Si subo un documento, lo encuentro en:

- Gestionar documentos -> Documentos.
- Expediente donde fue asociado.
- Repositorio si tiene archivo digital.
- Busqueda documental.
- Kardex si genero movimiento.
- Archivo Fisico si pertenece a carpeta ubicada.

### Repositorio

Ruta:

Gestionar documentos -> Repositorio

Para que sirve:

Consulta archivos digitales cargados al sistema.

Funcionalidades:

- Ver documentos con archivo digital.
- Descargar archivos autorizados.
- Ver documento, archivo, expediente y carpeta.
- Consultar tamano y nombre de archivo.

Uso:

Si una persona pregunta por el PDF o archivo cargado, se busca en Repositorio.

### Busqueda documental

Ruta:

Gestionar documentos -> Busqueda documental

Para que sirve:

Buscar documentos y expedientes por texto, estado, archivo, metadatos o tipologia.

Funcionalidades:

- Buscar por nombre.
- Buscar por codigo.
- Buscar por estado.
- Buscar por archivo.
- Buscar por metadatos.
- Exportar resultados.

Ejemplo:

Si busco "contrato", debe traer documentos o expedientes que tengan contrato en nombre, tipo, asunto o metadatos disponibles.

### Foliacion

Ruta:

Gestionar documentos -> Foliacion

Para que sirve:

Controla hojas numeradas dentro de un expediente.

Un folio es una hoja numerada. Si un contrato tiene 15 hojas, normalmente ocupa folios 1 al 15.

Funcionalidades:

- Ver documentos del expediente.
- Ver total de folios.
- Ver pendientes por foliar.
- Registrar folio inicial y final.
- Detectar saltos.
- Detectar duplicados.

Flujo:

1. Seleccionar expediente.
2. Revisar documentos.
3. Seleccionar documento pendiente.
4. Registrar folio inicial.
5. Registrar folio final.
6. Guardar.

Si un documento ya tiene folios, debe aparecer en el mapa de folios.

### Digitalizacion y OCR

Ruta:

Gestionar documentos -> Digitalizacion

Para que sirve:

Controla trabajos de digitalizacion y OCR.

Digitalizar significa convertir un documento fisico a archivo digital.

OCR significa extraer texto de una imagen o PDF escaneado para que luego pueda buscarse.

Funcionalidades:

- Ver cola de trabajos.
- Crear nuevo escaneo.
- Asociar documento registrado.
- Procesar OCR.
- Validar resultado.
- Archivar resultado.

Ejemplo:

1. Existe un contrato fisico.
2. Se registra como documento.
3. Se escanea.
4. Se envia a OCR.
5. AMBAR extrae texto.
6. Luego se puede buscar por palabras dentro del documento.

### TRD y Retencion

Ruta:

Gestionar documentos -> TRD & Retencion

Para que sirve:

Define la estructura documental de la empresa.

Funcionalidades:

- Crear dependencias.
- Crear series.
- Crear subseries.
- Crear tipologias.
- Definir retencion.
- Definir disposicion final.
- Exportar TRD.

Orden recomendado:

1. Dependencia.
2. Serie.
3. Subserie.
4. Tipologia.
5. Retencion.
6. Disposicion final.

La TRD gobierna documentos y expedientes.

## 4.3 Operar custodia

### Archivo Fisico

Ruta:

Operar custodia -> Archivo Fisico

Para que sirve:

Administra donde estan fisicamente las cajas, carpetas, expedientes y documentos.

Funcionalidades:

- Crear sedes.
- Crear archivos.
- Crear topografia.
- Crear cajas.
- Ver mapa topografico.
- Ver sin ubicacion.
- Ver movimientos.
- Buscar ubicacion fisica.

Flujo:

1. Crear sede.
2. Crear archivo.
3. Crear pasillos.
4. Crear estanterias.
5. Crear cuerpos.
6. Crear niveles.
7. Crear cajas.
8. Asignar carpetas a cajas.

Si asigno una carpeta a una caja, los expedientes y documentos heredan esa ubicacion.

### Inventarios

Ruta:

Operar custodia -> Inventarios

Para que sirve:

Consultar volumen documental, cajas, documentos, expedientes y unidades sin ubicacion.

Funcionalidades:

- Ver inventario por archivo.
- Ver cajas.
- Ver documentos.
- Ver ocupacion.
- Ver inconsistencias.

### Kardex

Ruta:

Operar custodia -> Kardex

Para que sirve:

Ver la historia documental de una unidad.

Muestra:

- Creacion.
- Prestamo.
- Devolucion.
- Transferencia.
- Recepcion.
- Rechazo.
- Cambio de ubicacion.
- Cambio de custodia.

Si alguien pregunta "que ha pasado con este expediente", se consulta Kardex.

### Transferencias

Ruta:

Operar custodia -> Transferencias

Para que sirve:

Mover responsabilidad documental de un archivo a otro.

No se trata solo de mover un registro. Se transfiere custodia.

Flujo:

1. Crear transferencia.
2. Seleccionar unidad documental: documento, carpeta, expediente o caja.
3. Seleccionar archivo origen.
4. Seleccionar archivo destino.
5. Validar permisos, TRD, foliacion y prestamos.
6. Generar FUID.
7. Enviar a recepcion.
8. El destino acepta, rechaza o recibe parcial.
9. Se actualiza Kardex y auditoria.

Si creo una transferencia, la encuentro en:

- Transferencias.
- Recepcion del archivo destino.
- Kardex de la unidad.
- FUID si se genero inventario.
- Auditoria.

### Recepcion

Ruta:

Operar custodia -> Recepcion

Para que sirve:

El archivo destino revisa lo que le enviaron.

Funcionalidades:

- Ver transferencias pendientes.
- Revisar inventario.
- Revisar FUID.
- Aceptar.
- Rechazar.
- Recibir parcial.
- Dejar observacion.

Si se rechaza, debe indicarse motivo.

### FUID

Ruta:

Operar custodia -> FUID

Para que sirve:

Consultar inventarios documentales formales.

El FUID muestra que se esta transfiriendo o inventariando:

- Serie.
- Subserie.
- Expediente.
- Fechas.
- Folios.
- Soporte.
- Ubicacion.
- Observaciones.

Uso:

Se usa especialmente antes, durante y despues de una transferencia documental.

### Prestamos

Ruta:

Operar custodia -> Prestamos

Para que sirve:

Controla salidas temporales de documentos, carpetas, expedientes o cajas.

Flujo:

1. Solicitar prestamo.
2. Seleccionar archivo custodio.
3. Seleccionar unidad documental.
4. Indicar solicitante.
5. Indicar fecha esperada de devolucion.
6. Registrar motivo.
7. Entregar.
8. Registrar devolucion.
9. Cerrar.

Reglas:

- No se debe transferir una unidad prestada.
- No se debe cerrar un expediente con prestamo activo.
- Los vencidos aparecen como alerta.

### Radicacion

Ruta:

Operar custodia -> Radicacion

Para que sirve:

Registrar comunicaciones recibidas y enviadas.

Funcionalidades:

- Radicar entrada.
- Radicar salida.
- Asignar responsable.
- Definir dependencia.
- Definir vencimiento.
- Relacionar expediente.
- Relacionar documento.
- Responder.
- Cerrar.
- Ver trazabilidad.

Flujo entrada:

1. Llega carta, correo o comunicacion.
2. Usuario de recepcion entra a Radicacion.
3. Clic en Radicar entrada.
4. Registra remitente, asunto, tipo, canal y prioridad.
5. Asigna dependencia o responsable.
6. Guarda.
7. AMBAR genera numero de radicado.
8. El responsable lo tramita.
9. Se marca como respondido o cerrado.

Flujo salida:

1. La empresa emite comunicacion.
2. Clic en Radicar salida.
3. Se registra destinatario, asunto y canal.
4. Se relaciona expediente o documento si aplica.
5. Se guarda y queda trazabilidad.

## 4.4 Talento humano

### Empleados

Ruta:

Talento humano -> Empleados

Para que sirve:

Administra empleados desde enfoque documental, no como ERP.

Funcionalidades:

- Crear empleado.
- Ver expediente laboral.
- Ver documentos.
- Ver contratos.
- Ver afiliaciones.
- Ver historial laboral.
- Ver cumplimiento documental.

Si creo un empleado, lo encuentro en:

- Talento humano -> Empleados.
- Busqueda documental.
- Expedientes si tiene expediente laboral.

### Perfiles de cargo

Dentro de Talento Humano.

Para que sirve:

Define cargos y documentos requeridos.

Ejemplo:

Cargo: Auxiliar de archivo  
Requiere: Hoja de vida, contrato, EPS, ARL, certificado de estudios.

### Contratos

Para que sirve:

Controla contratos laborales y sus vencimientos.

Muestra:

- Contratos activos.
- Contratos por vencer.
- Historial contractual.

### Dependencias

Para que sirve:

Organiza areas internas de talento humano o estructura laboral.

### Examenes medicos

Ruta:

Talento humano -> Examenes Medicos

Para que sirve:

Controla examenes ocupacionales.

Funcionalidades:

- Programar examen.
- Registrar resultado operativo.
- Ver proximos a vencer.
- Ver vencidos.
- Ver alertas.

### Reclutamiento

Ruta:

Talento humano -> Reclutamiento

Para que sirve:

Gestiona vacantes y candidatos.

Flujo:

1. Crear vacante.
2. Recibir candidatos.
3. Pasar por etapas: postulado, entrevista, prueba tecnica, aprobado, contratado o descartado.
4. Al contratar, el expediente candidato evoluciona a expediente laboral.

### Portal publico de empleo

Ruta publica:

`/empleo`

Para que sirve:

Permite que personas externas consulten vacantes y apliquen sin entrar al aplicativo principal.

Regla:

El portal publico no debe mostrar dashboard, documentos, usuarios, archivos ni modulos internos.

## 4.5 Inteligencia

### Reportes y BI

Ruta:

Inteligencia -> Reportes & BI

Para que sirve:

Muestra indicadores reales de la operacion.

Funcionalidades:

- Indicadores documentales.
- Indicadores de archivo fisico.
- Indicadores de talento humano.
- Generar reportes.
- Descargar reportes.

No debe usarse como BI decorativo, sino como tablero operacional.

### Auditoria

Ruta:

Inteligencia -> Auditoria

Para que sirve:

Ver acciones sensibles del sistema.

Permite consultar:

- Usuario.
- Fecha.
- Modulo.
- Accion.
- Resultado.
- Severidad.
- Antes y despues.
- IP.
- Entidad afectada.

Se usa para control interno, seguridad y trazabilidad.

## 4.6 Administracion

### Seguridad

Ruta:

Administracion -> Seguridad

Para que sirve:

Administra usuarios, roles y permisos.

Funcionalidades:

- Crear usuario.
- Asignar rol.
- Ver roles.
- Ver matriz de permisos.
- Configurar MFA.
- Activar o desactivar usuarios.

Regla:

Un usuario solo debe tener los permisos que necesita para trabajar.

### Configuracion

Ruta:

Administracion -> Configuracion

Para que sirve:

Administra estado tecnico, integraciones, firmas y preferencias.

Incluye:

- Apariencia.
- Estado sistema.
- Integraciones.
- Firmas.

### Integraciones

Sirven para conectar AMBAR con otros sistemas.

Ejemplo:

Una app externa genera documentos y necesita enviarlos a AMBAR. En ese caso se crea una integracion para recibir datos o archivos mediante API.

La integracion debe definir:

- Nombre.
- Tipo.
- Direccion: enviar, recibir o ambas.
- Metodo: GET, POST, PUT segun el caso.
- URL destino si AMBAR envia.
- Secreto o credencial guardada en servidor.
- Permisos.
- Auditoria.

## 5. Flujos operativos comunes

### Flujo: crear y consultar un documento

1. Crear TRD si no existe.
2. Crear expediente.
3. Crear carpeta.
4. Registrar documento.
5. Cargar archivo digital si aplica.
6. Consultar en Documentos.
7. Consultar dentro del Expediente.
8. Consultar archivo digital en Repositorio.
9. Consultar movimientos en Kardex.
10. Buscar por Busqueda documental.

### Flujo: ubicar fisicamente un expediente

1. Crear archivo fisico.
2. Crear topografia.
3. Crear caja.
4. Asignar carpeta a caja.
5. El expediente hereda ubicacion.
6. Buscar en Archivo Fisico o Busqueda documental.

### Flujo: prestar un expediente

1. Ir a Prestamos.
2. Crear solicitud.
3. Seleccionar unidad documental.
4. Registrar solicitante y motivo.
5. Guardar.
6. Registrar entrega.
7. Registrar devolucion.
8. Consultar Kardex.

### Flujo: transferir documentacion

1. Ir a Transferencias.
2. Crear transferencia.
3. Seleccionar unidad documental.
4. Seleccionar origen y destino.
5. Validar.
6. Generar FUID.
7. Enviar.
8. Recibir desde Recepcion.
9. Aceptar, rechazar o recibir parcial.
10. Revisar Kardex y Auditoria.

### Flujo: radicar una carta recibida

1. Ir a Radicacion.
2. Clic en Radicar entrada.
3. Registrar remitente.
4. Registrar asunto.
5. Seleccionar tipo y canal.
6. Asignar dependencia o responsable.
7. Definir fecha limite si aplica.
8. Relacionar expediente si existe.
9. Guardar.
10. El responsable la tramita.
11. Se marca respondida o cerrada.

### Flujo: contratar una persona

1. Crear vacante.
2. Registrar candidato.
3. Subir documentos.
4. Avanzar por etapas.
5. Aprobar candidato.
6. Contratar.
7. Crear o evolucionar expediente laboral.
8. Revisar documentos obligatorios.

## 6. Tabla rapida: si hago esto, donde lo encuentro

| Accion | Donde se crea | Donde se consulta despues |
|---|---|---|
| Crear dependencia TRD | TRD & Retencion | TRD, Expedientes, Documentos |
| Crear serie | TRD & Retencion | TRD, Documentos, Expedientes |
| Crear tipologia | TRD & Retencion | Documentos, Expedientes, Completitud |
| Crear expediente | Expedientes | Expedientes, Busqueda, Kardex |
| Crear documento | Documentos | Documentos, Expediente, Repositorio, Busqueda |
| Subir archivo digital | Documentos | Repositorio, Documento, Expediente |
| Registrar folios | Foliacion | Foliacion, Documento, Expediente |
| Crear archivo fisico | Archivo Fisico | Archivo Fisico, Inventarios |
| Crear caja | Archivo Fisico | Archivo Fisico, Inventarios |
| Asignar carpeta a caja | Archivo Fisico / Carpetas | Archivo Fisico, Expediente, Busqueda |
| Crear transferencia | Transferencias | Transferencias, Recepcion, FUID, Kardex |
| Recibir transferencia | Recepcion | Recepcion, Kardex, Auditoria |
| Crear prestamo | Prestamos | Prestamos, Kardex, Dashboard |
| Devolver prestamo | Prestamos | Prestamos, Kardex, Auditoria |
| Radicar entrada | Radicacion | Radicacion, Notificaciones, Auditoria |
| Radicar salida | Radicacion | Radicacion, Auditoria |
| Crear empleado | Talento Humano | Empleados, Expedientes, Busqueda |
| Crear vacante | Reclutamiento | Reclutamiento, Portal empleo |
| Ver auditoria | Auditoria | Auditoria |
| Ver indicadores | Reportes & BI | Reportes & BI, Dashboard |

## 7. Recomendaciones de operacion en produccion

### Para el administrador

- No entregar usuarios super administrador a todos.
- Crear roles por funcion.
- Activar MFA para perfiles sensibles.
- Revisar auditoria semanalmente.
- Revisar integraciones antes de activarlas.
- Validar que cada usuario tenga acceso solo a sus archivos.

### Para archivo

- No crear documentos sin expediente.
- No transferir unidades prestadas.
- No cerrar expedientes incompletos.
- Mantener ubicaciones fisicas parametrizadas.
- Registrar devoluciones de prestamos el mismo dia.
- Usar Kardex para resolver dudas de trazabilidad.

### Para talento humano

- No duplicar expediente de candidato y empleado.
- Usar tipologias obligatorias por cargo.
- Revisar completitud documental.
- Registrar cambios de cargo.
- Controlar contratos por vencer.

### Para recepcion

- Radicar toda comunicacion recibida.
- Asignar responsable.
- Definir vencimiento si requiere respuesta.
- Cerrar solo cuando haya respuesta o gestion terminada.

## 8. MVP funcional de AMBAR

Para salir a produccion controlada, el MVP debe cubrir:

1. Login y seguridad.
2. Usuarios, roles y permisos.
3. TRD basica.
4. Expedientes.
5. Documentos.
6. Repositorio.
7. Archivo fisico.
8. Ubicaciones y cajas.
9. Kardex.
10. Prestamos.
11. Transferencias.
12. Recepcion.
13. FUID.
14. Radicacion.
15. Talento humano documental.
16. Auditoria.
17. Dashboard operacional.

## 9. Como capacitar a una empresa

Orden sugerido de capacitacion:

1. Explicar que AMBAR trabaja por expedientes, no por archivos sueltos.
2. Mostrar TRD.
3. Mostrar archivo fisico.
4. Crear expediente de ejemplo.
5. Crear carpeta.
6. Registrar documento.
7. Cargar archivo digital.
8. Buscarlo en Documentos, Expediente, Repositorio y Busqueda.
9. Registrar foliacion.
10. Prestar el expediente.
11. Devolverlo.
12. Transferirlo.
13. Recibirlo.
14. Ver Kardex.
15. Ver Auditoria.
16. Radicar una comunicacion.
17. Cerrar radicado.
18. Revisar Dashboard.

## 10. Mensaje comercial corto

AMBAR es una plataforma SGDEA empresarial que permite a una organizacion saber exactamente que documentos tiene, donde estan, quien los custodia, que movimientos han tenido, que falta por completar y que acciones estan pendientes. Integra gestion documental, archivo fisico, TRD, expedientes, FUID, transferencias, prestamos, radicacion, talento humano documental, auditoria y seguridad en una sola operacion trazable.
