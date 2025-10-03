// script.js - VERSIÓN FINAL Y COMPLETA DEL PANEL DOCENTE

// --- CONEXIÓN CON SUPABASE ---
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('Supabase conectado.');

// --- ESTADO DE LA APLICACIÓN ---
let materiaSeleccionada = null;
let sesionActiva = { numero: 0, timer: null };
let qrCodeInstance = null;
let subscripcionAsistencia = null;

// --- ELEMENTOS DEL DOM ---
const authSection = document.querySelector('#auth-section');
const mainContent = document.querySelector('#main-content');
const loginButton = document.querySelector('#login-button');
const logoutButton = document.querySelector('#logout-button');
const userName = document.querySelector('#user-name');
const vistaDashboard = document.querySelector('#vista-dashboard');
const vistaGestionMateria = document.querySelector('#vista-gestion-materia');
const formMateria = document.querySelector('#form-materia');
const listaMaterias = document.querySelector('#lista-materias');
const btnVolverDashboard = document.querySelector('#btn-volver-dashboard');
const nombreMateriaGestion = document.querySelector('#nombre-materia-gestion');
const formAlumno = document.querySelector('#form-alumno');
const listaAlumnos = document.querySelector('#lista-alumnos');
const modalEditar = document.querySelector('#modal-editar');
const formEditarMateria = document.querySelector('#form-editar-materia');
const cerrarModal = document.querySelector('.cerrar-modal');
const csvFileInput = document.querySelector('#csv-file-input');
const btnUploadCsv = document.querySelector('#btn-upload-csv');
const btnIniciarSesion1 = document.querySelector('#btn-iniciar-sesion-1');
const btnIniciarSesion2 = document.querySelector('#btn-iniciar-sesion-2');
const btnTerminarAsistencia = document.querySelector('#btn-terminar-asistencia');
const qrCodeContainer = document.querySelector('#qrcode');
const qrMessage = document.querySelector('#qr-message');
const qrTitle = document.querySelector('#qr-title');
const listaAlumnosAsistencia = document.querySelector('#lista-alumnos-asistencia');
const unidadAsistenciaSelect = document.querySelector('#unidad-asistencia-select');
const btnGuardarAsistenciaSheet = document.querySelector('#btn-guardar-asistencia-sheet');
const tabsContainer = document.querySelector('.navegacion-tabs');
const tabContents = document.querySelectorAll('.tab-content');
const unidadActividadesSelect = document.querySelector('#unidad-actividades-select');
const listaArchivosActividades = document.querySelector('#lista-archivos-actividades');
const btnSeleccionarTodo = document.querySelector('#btn-seleccionar-todo');
const btnDeseleccionarTodo = document.querySelector('#btn-deseleccionar-todo');
const promptCalificacion = document.querySelector('#prompt-calificacion');
const btnIniciarCalificacionIA = document.querySelector('#btn-iniciar-calificacion-ia');
const estadoCalificacion = document.querySelector('#estado-calificacion');
const unidadCalificacionesSelect = document.querySelector('#unidad-calificaciones-select');
const camposPonderacion = document.querySelectorAll('.campos-ponderacion input');
const totalPonderado = document.querySelector('#total-ponderado');
const btnGuardarPonderacion = document.querySelector('#btn-guardar-ponderacion');
const btnCalcularUnidad = document.querySelector('#btn-calcular-unidad');
const reporteFinalContainer = document.querySelector('#reporte-final-container');
const unidadMaterialSelect = document.querySelector('#unidad-material-select');
const listaMaterialDidactico = document.querySelector('#lista-material-didactico');
const unidadEvaluacionesSelect = document.querySelector('#unidad-evaluaciones-select');
const nombreNuevaEvaluacionInput = document.querySelector('#nombre-nueva-evaluacion');
const btnCrearEvaluacion = document.querySelector('#btn-crear-evaluacion');
const evaluacionesListado = document.querySelector('#evaluaciones-listado');
const unidadReportesSelect = document.querySelector('#unidad-reportes-select');
const listaArchivosReportes = document.querySelector('#lista-archivos-reportes');
const mostrarOcultasCheckbox = document.querySelector('#mostrar-ocultas-checkbox');

// --- FUNCIONES DE NAVEGACIÓN Y VISTAS ---
const mostrarDashboard = () => {
    vistaGestionMateria.style.display = 'none';
    vistaDashboard.style.display = 'block';
    terminarSesionAsistencia();
    materiaSeleccionada = null;
    if (subscripcionAsistencia) {
        supabase.removeChannel(subscripcionAsistencia);
        subscripcionAsistencia = null;
    }
};

const mostrarGestionMateria = async (materia) => {
    materiaSeleccionada = materia;
    nombreMateriaGestion.textContent = `Gestionando: ${materia.nombre}`;

    // Llenamos todos los selectores de unidades
    unidadAsistenciaSelect.innerHTML = '';
    unidadActividadesSelect.innerHTML = '';
    unidadCalificacionesSelect.innerHTML = '';
    unidadMaterialSelect.innerHTML = '';
    unidadEvaluacionesSelect.innerHTML = '';
    unidadReportesSelect.innerHTML = '';
    
    const optionPlaceholder = (text = "-- Selecciona --") => {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = text;
        return option;
    };
    
    unidadActividadesSelect.appendChild(optionPlaceholder());
    unidadCalificacionesSelect.appendChild(optionPlaceholder());
    unidadMaterialSelect.appendChild(optionPlaceholder());
    unidadEvaluacionesSelect.appendChild(optionPlaceholder());
    unidadReportesSelect.appendChild(optionPlaceholder());

    for (let i = 1; i <= materia.unidades; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Unidad ${i}`;
        unidadAsistenciaSelect.appendChild(option.cloneNode(true));
        unidadActividadesSelect.appendChild(option.cloneNode(true));
        unidadCalificacionesSelect.appendChild(option.cloneNode(true));
        unidadMaterialSelect.appendChild(option.cloneNode(true));
        unidadEvaluacionesSelect.appendChild(option.cloneNode(true));
        unidadReportesSelect.appendChild(option.cloneNode(true));
    }

    vistaDashboard.style.display = 'none';
    vistaGestionMateria.style.display = 'block';
    
    tabsContainer.querySelector('[data-tab="tab-alumnos-asistencia"]').click();
    
    await obtenerAlumnos();
    await mostrarListaDeClase();
    escucharAsistenciasEnTiempoReal();
};

// --- FUNCIONES DE AUTENTICACIÓN ---
const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            scopes: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/forms.body'
        }
    });
};
const signOut = async () => { await supabase.auth.signOut(); };

// --- MANEJO DEL ESTADO DE AUTENTICACIÓN ---
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        authSection.style.display = 'none';
        mainContent.style.display = 'block';
        userName.textContent = session.user.user_metadata.full_name;
        mostrarDashboard();
        await obtenerMaterias();
    } else {
        authSection.style.display = 'block';
        mainContent.style.display = 'none';
    }
});

// --- FUNCIONES DE GOOGLE DRIVE, SHEETS Y FORMS ---
const findFileIdByName = async (name, parentId, mimeType, accessToken) => {
    const query = `name='${name}' and '${parentId}' in parents and mimeType='${mimeType}' and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const data = await response.json();
    return data.files.length > 0 ? data.files[0].id : null;
};

const findOrCreateFolder = async (folderName, parentId, accessToken) => {
    const folderId = await findFileIdByName(folderName, parentId, 'application/vnd.google-apps.folder', accessToken);
    if (folderId) return folderId;
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const response = await fetch(createUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
    const data = await response.json();
    return data.id;
};

const createGoogleSheet = async (fileName, parentId, accessToken) => {
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const response = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] })
    });
    return await response.json();
};

const createFolderStructure = async (materia) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.provider_token) { alert('No se pudo crear la estructura.'); return; }
    const accessToken = session.provider_token;
    try {
        alert('Iniciando creación de carpetas y archivos en Google Drive...');
        const raizAppId = await findOrCreateFolder('Plataforma de Apoyo Docente', 'root', accessToken);
        const semestreId = await findOrCreateFolder(materia.semestre, raizAppId, accessToken);
        const materiaId = await findOrCreateFolder(materia.nombre, semestreId, accessToken);
        for (let i = 1; i <= materia.unidades; i++) {
            const unidadFolderId = await findOrCreateFolder(`Unidad ${i}`, materiaId, accessToken);
            await createGoogleSheet('asistencia', unidadFolderId, accessToken);
            await createGoogleSheet('actividades', unidadFolderId, accessToken);
            await createGoogleSheet('reportes', unidadFolderId, accessToken);
            await createGoogleSheet('evaluaciones', unidadFolderId, accessToken);
            await createGoogleSheet('ponderacion_unidad', unidadFolderId, accessToken);
        }
        alert('¡Estructura de carpetas y archivos creada con éxito!');
    } catch (error) { console.error('Error creando la estructura completa:', error); alert('Hubo un error al crear la estructura en Google Drive.'); }
};

const guardarAsistenciaEnSheet = async () => {
    if (!materiaSeleccionada) return;
    const unidadSeleccionada = unidadAsistenciaSelect.value;
    if (!unidadSeleccionada) { alert('Por favor, selecciona una unidad.'); return; }
    alert('Iniciando proceso de guardado en Google Sheets...');
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session.provider_token;
        const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken);
        const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken);
        const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken);
        const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken);
        const sheetId = await findFileIdByName('asistencia', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken);
        if (!sheetId) throw new Error('No se pudo encontrar la hoja de cálculo de asistencia.');

        const hoy = new Date().toISOString().slice(0, 10);
        const { data: alumnos, error: errorAlumnos } = await supabase.from('Alumnos').select('id, nombre, matricula').eq('materia_id', materiaSeleccionada.id);
        const { data: asistencias, error: errorAsistencias } = await supabase.from('Asistencias').select('alumno_id, sesion_numero').eq('materia_id', materiaSeleccionada.id).eq('fecha', hoy);
        if (errorAlumnos || errorAsistencias) throw new Error('Error al obtener datos de Supabase.');

        const mapaAsistencias = new Map(asistencias.map(a => [`${a.alumno_id}-${a.sesion_numero}`, true]));
        const valoresParaSheet = alumnos.map(alumno => [
            hoy, alumno.matricula, alumno.nombre,
            mapaAsistencias.has(`${alumno.id}-1`) ? '1' : '0',
            mapaAsistencias.has(`${alumno.id}-2`) ? '1' : '0'
        ]);

        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:append?valueInputOption=USER_ENTERED`;
        const response = await fetch(appendUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: valoresParaSheet }) });
        const result = await response.json();
        if (result.error) throw new Error(result.error.message);
        alert(`¡Asistencia guardada con éxito en la Unidad ${unidadSeleccionada}!`);
    } catch (error) { console.error('Error al guardar en Google Sheets:', error); alert(`Hubo un error al guardar: ${error.message}`); }
};

// --- FUNCIONES DEL MÓDULO DE MATERIAL DIDÁCTICO ---
const listarMaterialDidactico = async () => {
    const unidadSeleccionada = unidadMaterialSelect.value;
    if (!unidadSeleccionada) {
        listaMaterialDidactico.innerHTML = '<p>Selecciona una unidad para gestionar el material.</p>';
        return;
    }
    listaMaterialDidactico.innerHTML = '<p>Buscando archivos en Google Drive...</p>';
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session.provider_token;
        const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken);
        const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken);
        const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken);
        const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken);
        if (!unidadId) throw new Error('No se encontró la carpeta de la unidad.');

        const query = `'${unidadId}' in parents and trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, webViewLink)`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const data = await response.json();

        const { data: permisos, error: errorPermisos } = await supabase.from('MaterialDidactico').select('*').eq('materia_id', materiaSeleccionada.id);
        if (errorPermisos) throw new Error('No se pudieron cargar los permisos de los archivos.');

        const mapaPermisos = new Map(permisos.map(p => [p.file_id, p]));
        listaMaterialDidactico.innerHTML = '';
        if (!data.files || data.files.length === 0) {
            listaMaterialDidactico.innerHTML = '<p>No se encontraron archivos en esta unidad.</p>';
            return;
        }

        data.files.forEach(file => {
            const permiso = mapaPermisos.get(file.id) || {};
            const div = document.createElement('div');
            div.className = 'material-item';
            div.innerHTML = `
                <a href="${file.webViewLink}" target="_blank">${file.name}</a>
                <div class="controles-material">
                    <span>Visible:</span>
                    <label class="switch">
                        <input type="checkbox" class="permiso-toggle" data-file-id="${file.id}" data-permiso="es_visible" ${permiso.es_visible ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span>Descargable:</span>
                    <label class="switch">
                        <input type="checkbox" class="permiso-toggle" data-file-id="${file.id}" data-permiso="permite_descarga" ${permiso.permite_descarga ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;
            listaMaterialDidactico.appendChild(div);
        });
    } catch (error) { console.error("Error listando material:", error); listaMaterialDidactico.innerHTML = `<p>Error al cargar el material: ${error.message}</p>`; }
};

const manejarPermisoMaterial = async (evento) => {
    const checkbox = evento.target;
    const fileId = checkbox.dataset.fileId;
    const tipoPermiso = checkbox.dataset.permiso;
    const valor = checkbox.checked;
    const { error } = await supabase.from('MaterialDidactico').upsert({ file_id: fileId, materia_id: materiaSeleccionada.id, [tipoPermiso]: valor }, { onConflict: 'file_id' });
    if (error) { console.error('Error al actualizar permiso:', error); alert('Hubo un error al guardar la configuración.'); checkbox.checked = !valor; }
};

// --- FUNCIONES DE CALIFICACIÓN CON IA ---
const getGoogleCloudProjectId = async (accessToken) => { const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', { headers: { 'Authorization': `Bearer ${accessToken}` } }); const data = await response.json(); if (data.projects && data.projects.length > 0) { return data.projects[0].projectId; } return null; };
const iniciarCalificacionConIA = async () => { const archivosSeleccionados = Array.from(document.querySelectorAll('.checkbox-archivo:checked')).map(cb => ({ id: cb.dataset.fileId, name: cb.dataset.fileName })); const prompt = promptCalificacion.value.trim(); const unidad = unidadActividadesSelect.value; if (archivosSeleccionados.length === 0 || !prompt || !unidad) { alert('Por favor, selecciona archivos, una rúbrica y una unidad.'); return; } estadoCalificacion.innerHTML = `<p><strong>Iniciando proceso...</strong></p>`; try { const { data: { session } } = await supabase.auth.getSession(); const accessToken = session.provider_token; const projectId = await getGoogleCloudProjectId(accessToken); if (!projectId) { throw new Error("No se pudo obtener el Project ID de Google Cloud."); } estadoCalificacion.innerHTML = `<p><strong>Conectando...</strong> (Simulación)</p><p><strong>Project ID:</strong> ${projectId}</p><p>Se enviarán ${archivosSeleccionados.length} archivos.</p>`; console.log("========= SIMULACIÓN DE LLAMADA A IA ========="); console.log("Project ID:", projectId); console.log("Archivos:", archivosSeleccionados.map(f => f.id)); console.log("Prompt:", prompt); console.log("Materia:", materiaSeleccionada.nombre); console.log("Unidad:", unidad); console.log("=============================================="); setTimeout(() => { alert('SIMULACIÓN COMPLETADA: Revisa la consola para ver los datos procesados.'); estadoCalificacion.innerHTML = `<p><strong>Proceso simulado con éxito.</strong></p>`; }, 2000); } catch (error) { console.error("Error en calificación:", error); estadoCalificacion.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${error.message}</p>`; } };
const listarArchivosDeActividades = async () => { const unidadSeleccionada = unidadActividadesSelect.value; if (!unidadSeleccionada) { listaArchivosActividades.innerHTML = '<p>Selecciona una unidad.</p>'; return; } listaArchivosActividades.innerHTML = '<p>Buscando archivos...</p>'; try { const { data: { session } } = await supabase.auth.getSession(); const accessToken = session.provider_token; const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken); const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken); const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken); const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken); if (!unidadId) throw new Error('No se encontró la carpeta de la unidad.'); const query = `'${unidadId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`; const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, webViewLink)`; const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } }); const data = await response.json(); listaArchivosActividades.innerHTML = ''; if (!data.files || data.files.length === 0) { listaArchivosActividades.innerHTML = '<p>No se encontraron entregas.</p>'; return; } data.files.forEach(file => { const div = document.createElement('div'); div.className = 'archivo-item'; div.innerHTML = `<input type="checkbox" class="checkbox-archivo" data-file-id="${file.id}" data-file-name="${file.name}"><a href="${file.webViewLink}" target="_blank">${file.name}</a>`; listaArchivosActividades.appendChild(div); }); } catch (error) { console.error("Error listando archivos:", error); listaArchivosActividades.innerHTML = `<p>Error: ${error.message}</p>`; } };

// --- FUNCIONES DEL MÓDULO DE EVALUACIONES ---
const crearNuevaEvaluacion = async () => {
    const unidadSeleccionada = unidadEvaluacionesSelect.value;
    const nombreEvaluacion = nombreNuevaEvaluacionInput.value.trim();
    if (!unidadSeleccionada || !nombreEvaluacion) { alert('Por favor, selecciona una unidad y escribe un nombre para la evaluación.'); return; }
    alert('Creando nuevo formulario de Google...');
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session.provider_token;
        const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken);
        const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken);
        const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken);
        const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken);
        if (!unidadId) throw new Error('No se encontró la carpeta de la unidad en Google Drive.');
        
        const form = { info: { title: `${nombreEvaluacion} - ${materiaSeleccionada.nombre}`, documentTitle: `${nombreEvaluacion} (U${unidadSeleccionada})` } };
        const createFormResponse = await fetch('https://forms.googleapis.com/v1/forms', { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        const formCreado = await createFormResponse.json();
        if (formCreado.error) throw new Error(formCreado.error.message);

        const fileId = formCreado.formId;
        const file = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json());
        const previousParents = file.parents.join(',');
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${unidadId}&removeParents=${previousParents}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${accessToken}` } });

        const { error: errorSupabase } = await supabase.from('Evaluaciones').insert({ form_id: formCreado.formId, form_url: formCreado.responderUri, materia_id: materiaSeleccionada.id, unidad: unidadSeleccionada, nombre: nombreEvaluacion });
        if (errorSupabase) throw errorSupabase;

        alert(`¡Evaluación "${nombreEvaluacion}" creada con éxito!`);
        nombreNuevaEvaluacionInput.value = '';
        await listarEvaluaciones();
    } catch (error) { console.error("Error creando evaluación:", error); alert(`Hubo un error al crear la evaluación: ${error.message}`); }
};

const listarEvaluaciones = async () => {
    const unidadSeleccionada = unidadEvaluacionesSelect.value;
    if (!unidadSeleccionada) { evaluacionesListado.innerHTML = '<p>Selecciona una unidad para ver las evaluaciones.</p>'; return; }
    evaluacionesListado.innerHTML = '<p>Cargando evaluaciones...</p>';
    const { data, error } = await supabase.from('Evaluaciones').select('*').eq('materia_id', materiaSeleccionada.id).eq('unidad', unidadSeleccionada);
    if (error) { console.error("Error listando evaluaciones:", error); evaluacionesListado.innerHTML = '<p>No se pudieron cargar las evaluaciones.</p>'; return; }
    evaluacionesListado.innerHTML = '';
    if (data.length === 0) { evaluacionesListado.innerHTML = '<p>No hay evaluaciones creadas para esta unidad.</p>'; return; }
    data.forEach(evaluacion => {
        const div = document.createElement('div');
        div.className = 'evaluacion-item';
        div.innerHTML = `
            <span>${evaluacion.nombre}</span>
            <div class="controles-material">
                <a href="${evaluacion.form_url.replace('/viewform', '/edit')}" target="_blank">Editar en Forms</a>
                <span>Activa:</span>
                <label class="switch">
                    <input type="checkbox" class="evaluacion-toggle" data-eval-id="${evaluacion.id}" ${evaluacion.esta_activa ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        `;
        evaluacionesListado.appendChild(div);
    });
};

const manejarActivacionEvaluacion = async (evento) => {
    const checkbox = evento.target;
    const evalId = checkbox.dataset.evalId;
    const nuevoEstado = checkbox.checked;
    const { error } = await supabase.from('Evaluaciones').update({ esta_activa: nuevoEstado }).eq('id', evalId);
    if (error) { console.error("Error al activar evaluación:", error); alert('No se pudo cambiar el estado.'); checkbox.checked = !nuevoEstado; }
};

// --- FUNCIONES DE ASISTENCIA ---
const iniciarSesionAsistencia = (numeroSesion) => { if (!materiaSeleccionada) return; terminarSesionAsistencia(); sesionActiva.numero = numeroSesion; const expiracion = Date.now() + 5 * 60 * 1000; const sesionToken = { materiaId: materiaSeleccionada.id, exp: expiracion, sesion: numeroSesion }; const urlAsistencia = `${window.location.origin}${window.location.pathname.replace('index.html', '')}asistencia.html?token=${encodeURIComponent(JSON.stringify(sesionToken))}`; qrCodeContainer.innerHTML = ''; qrCodeInstance = new QRCode(qrCodeContainer, { text: urlAsistencia, width: 128, height: 128 }); sesionActiva.timer = setTimeout(() => { alert(`La Sesión ${numeroSesion} ha expirado.`); terminarSesionAsistencia(); }, 5 * 60 * 1000); qrTitle.textContent = `QR - Sesión ${numeroSesion}`; qrMessage.textContent = 'Vence en 5 minutos.'; btnTerminarAsistencia.style.display = 'inline-block'; };
const terminarSesionAsistencia = () => { clearTimeout(sesionActiva.timer); qrCodeContainer.innerHTML = ''; qrCodeInstance = null; qrTitle.textContent = 'QR Inactivo'; qrMessage.textContent = 'Selecciona una sesión.'; btnTerminarAsistencia.style.display = 'none'; sesionActiva.numero = 0; };
const mostrarListaDeClase = async () => { if (!materiaSeleccionada) return; const { data: alumnos, error: errorAlumnos } = await supabase.from('Alumnos').select('id, nombre, matricula').eq('materia_id', materiaSeleccionada.id); if (errorAlumnos) { console.error("Error cargando lista:", errorAlumnos); return; } const hoy = new Date().toISOString().slice(0, 10); const { data: asistenciasHoy, error: errorAsistencias } = await supabase.from('Asistencias').select('alumno_id, sesion_numero').eq('materia_id', materiaSeleccionada.id).eq('fecha', hoy); if (errorAsistencias) { console.error("Error cargando asistencias:", errorAsistencias); return; } const mapaAsistencias = new Map(asistenciasHoy.map(a => [`${a.alumno_id}-${a.sesion_numero}`, true])); listaAlumnosAsistencia.innerHTML = ''; if (alumnos.length === 0) { listaAlumnosAsistencia.innerHTML = '<p>No hay alumnos.</p>'; return; } alumnos.forEach(alumno => { const div = document.createElement('div'); div.className = 'alumno-item'; div.innerHTML = `<input type="checkbox" data-alumno-id="${alumno.id}" data-sesion="1" ${mapaAsistencias.has(`${alumno.id}-1`) ? 'checked' : ''}><input type="checkbox" data-alumno-id="${alumno.id}" data-sesion="2" ${mapaAsistencias.has(`${alumno.id}-2`) ? 'checked' : ''}><span>${alumno.nombre} (${alumno.matricula})</span>`; listaAlumnosAsistencia.appendChild(div); }); };
const manejarAsistenciaManual = async (evento) => { const checkbox = evento.target; const alumnoId = checkbox.dataset.alumnoId; const sesionNumero = checkbox.dataset.sesion; const estaMarcado = checkbox.checked; const hoy = new Date().toISOString().slice(0, 10); if (estaMarcado) { const { error } = await supabase.from('Asistencias').insert({ alumno_id: alumnoId, materia_id: materiaSeleccionada.id, fecha: hoy, sesion_numero: sesionNumero }); if (error) { console.error("Error al añadir asistencia:", error); checkbox.checked = false; } } else { const { error } = await supabase.from('Asistencias').delete().match({ alumno_id: alumnoId, materia_id: materiaSeleccionada.id, fecha: hoy, sesion_numero: sesionNumero }); if (error) { console.error("Error al quitar asistencia:", error); checkbox.checked = true; } } };
const escucharAsistenciasEnTiempoReal = () => { if (subscripcionAsistencia) { supabase.removeChannel(subscripcionAsistencia); } subscripcionAsistencia = supabase.channel(`asistencias-materia-${materiaSeleccionada.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'Asistencias', filter: `materia_id=eq.${materiaSeleccionada.id}` }, (payload) => { console.log('Cambio detectado!', payload); mostrarListaDeClase(); }).subscribe(); };

// --- FUNCIONES CRUD de Alumnos ---
const obtenerAlumnos = async () => { if (!materiaSeleccionada) return; const { data, error } = await supabase.from('Alumnos').select('*').eq('materia_id', materiaSeleccionada.id); if (error) { console.error("Error obteniendo alumnos:", error); return; } listaAlumnos.innerHTML = ''; if (data.length === 0) { listaAlumnos.innerHTML = '<p>No hay alumnos.</p>'; return; } data.forEach(alumno => { const div = document.createElement('div'); div.innerHTML = `<span>${alumno.nombre} (${alumno.matricula})</span>`; listaAlumnos.appendChild(div); }); };
const crearNuevoAlumno = async (event) => { event.preventDefault(); if (!materiaSeleccionada) return; const nombre = document.querySelector('#nombre-alumno').value; const matricula = document.querySelector('#matricula-alumno').value; const correo = document.querySelector('#correo-alumno').value; const { error } = await supabase.from('Alumnos').insert({ nombre, matricula, correo, materia_id: materiaSeleccionada.id }); if (error) { console.error('Error al añadir alumno:', error); alert('Error al añadir alumno.'); } else { formAlumno.reset(); await obtenerAlumnos(); } };
const procesarArchivoCSV = () => { const file = csvFileInput.files[0]; if (!file) { alert('Selecciona un archivo.'); return; } Papa.parse(file, { header: true, skipEmptyLines: true, complete: async (results) => { if (results.errors.length > 0) { alert('Error al leer el archivo.'); console.error("Errores CSV:", results.errors); return; } const alumnosParaSubir = results.data.map(alumno => ({ nombre: alumno.nombre, matricula: alumno.matricula, correo: alumno.correo, materia_id: materiaSeleccionada.id })); const { error } = await supabase.from('Alumnos').insert(alumnosParaSubir); if (error) { console.error('Error en carga masiva:', error); alert('Error al guardar los alumnos.'); } else { alert(`¡Se añadieron ${alumnosParaSubir.length} alumnos!`); csvFileInput.value = ''; await obtenerAlumnos(); } } }); };

// --- FUNCIONES DEL MÓDULO DE CALIFICACIONES ---
const actualizarTotalPonderado = () => { let total = 0; camposPonderacion.forEach(input => { total += parseInt(input.value) || 0; }); totalPonderado.textContent = total; totalPonderado.style.color = total !== 100 ? 'red' : 'green'; };
const cargarPonderacion = async () => { const unidadSeleccionada = unidadCalificacionesSelect.value; if (!unidadSeleccionada) return; try { const { data: { session } } = await supabase.auth.getSession(); const accessToken = session.provider_token; const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken); const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken); const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken); const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken); const sheetId = await findFileIdByName('ponderacion_unidad', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken); if (!sheetId) throw new Error('No se encontró el archivo.'); const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:B4`; const response = await fetch(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }); const data = await response.json(); if (data.values) { data.values.forEach(row => { const [rubro, valor] = row; const input = document.getElementById(`ponderacion-${rubro.toLowerCase()}`); if (input) input.value = valor; }); } actualizarTotalPonderado(); } catch (error) { console.error("Error al cargar ponderación:", error); document.getElementById('ponderacion-asistencia').value = 10; document.getElementById('ponderacion-actividades').value = 40; document.getElementById('ponderacion-reportes').value = 20; document.getElementById('ponderacion-evaluaciones').value = 30; actualizarTotalPonderado(); } };
const guardarPonderacion = async () => { if (totalPonderado.textContent !== '100') { alert('La suma debe ser 100%.'); return; } const unidadSeleccionada = unidadCalificacionesSelect.value; if (!unidadSeleccionada) { alert('Selecciona una unidad.'); return; } alert('Guardando...'); try { const { data: { session } } = await supabase.auth.getSession(); const accessToken = session.provider_token; const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken); const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken); const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken); const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken); const sheetId = await findFileIdByName('ponderacion_unidad', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken); if (!sheetId) throw new Error('No se encontró el archivo.'); const valores = [['asistencia', document.getElementById('ponderacion-asistencia').value], ['actividades', document.getElementById('ponderacion-actividades').value], ['reportes', document.getElementById('ponderacion-reportes').value], ['evaluaciones', document.getElementById('ponderacion-evaluaciones').value]]; const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:B4?valueInputOption=USER_ENTERED`; const response = await fetch(updateUrl, { method: 'PUT', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: valores }) }); const result = await response.json(); if (result.error) throw new Error(result.error.message); alert('¡Ponderación guardada!'); } catch (error) { console.error("Error al guardar:", error); alert(`Error: ${error.message}`); } };
const calcularCalificacionesFinales = async () => { const unidadSeleccionada = unidadCalificacionesSelect.value; if (!unidadSeleccionada || totalPonderado.textContent !== '100' || !confirm(`¿Calcular calificaciones para la Unidad ${unidadSeleccionada}?`)) return; reporteFinalContainer.innerHTML = '<p>Calculando...</p>'; try { const { data: { session } } = await supabase.auth.getSession(); const accessToken = session.provider_token; const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken); const semestreId = await findFileIdByName(materiaSeleccionada.semestre, raizId, 'application/vnd.google-apps.folder', accessToken); const materiaId = await findFileIdByName(materiaSeleccionada.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken); const unidadId = await findFileIdByName(`Unidad ${unidadSeleccionada}`, materiaId, 'application/vnd.google-apps.folder', accessToken); const sheetIds = { ponderacion: await findFileIdByName('ponderacion_unidad', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken), asistencia: await findFileIdByName('asistencia', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken), actividades: await findFileIdByName('actividades', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken), reportes: await findFileIdByName('reportes', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken), evaluaciones: await findFileIdByName('evaluaciones', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken) }; if (Object.values(sheetIds).some(id => !id)) throw new Error('Faltan archivos de calificación.'); reporteFinalContainer.innerHTML = '<p>Leyendo datos...</p>'; const [ponderacionData, asistenciaData, actividadesData, reportesData, evaluacionesData, alumnos] = await Promise.all([ fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.ponderacion}/values/A1:B4`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()), fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.asistencia}/values/A:E`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()), fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.actividades}/values/A:B`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()), fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.reportes}/values/A:B`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()), fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.evaluaciones}/values/A:B`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()), supabase.from('Alumnos').select('id, matricula, nombre').eq('materia_id', materiaSeleccionada.id) ]); const ponderaciones = Object.fromEntries(ponderacionData.values); reporteFinalContainer.innerHTML = '<p>Procesando...</p>'; const resultadosFinales = alumnos.data.map(alumno => { const asistenciasAlumno = (asistenciaData.values || []).filter(row => row && row[1] === alumno.matricula); const totalDias = new Set(asistenciasAlumno.map(row => row[0])).size; const totalSesionesPosibles = totalDias * 2; const totalAsistencias = asistenciasAlumno.reduce((acc, row) => acc + (parseInt(row[3]) || 0) + (parseInt(row[4]) || 0), 0); const califAsistencia = totalSesionesPosibles > 0 ? (totalAsistencias / totalSesionesPosibles) * 100 : 0; const actividadesAlumno = (actividadesData.values || []).filter(row => row && row[0] === alumno.matricula); const totalActividades = actividadesAlumno.reduce((acc, row) => acc + (parseInt(row[1]) || 0), 0); const califActividades = actividadesAlumno.length > 0 ? totalActividades / actividadesAlumno.length : 0; const reportesAlumno = (reportesData.values || []).filter(row => row && row[0] === alumno.matricula); const totalReportes = reportesAlumno.reduce((acc, row) => acc + (parseInt(row[1]) || 0), 0); const califReportes = reportesAlumno.length > 0 ? totalReportes / reportesAlumno.length : 0; const evaluacionesAlumno = (evaluacionesData.values || []).filter(row => row && row[0] === alumno.matricula); const totalEvaluaciones = evaluacionesAlumno.reduce((acc, row) => acc + (parseInt(row[1]) || 0), 0); const califEvaluaciones = evaluacionesAlumno.length > 0 ? totalEvaluaciones / evaluacionesAlumno.length : 0; const califFinal = (califAsistencia * (ponderaciones.asistencia / 100)) + (califActividades * (ponderaciones.actividades / 100)) + (califReportes * (ponderaciones.reportes / 100)) + (califEvaluaciones * (ponderaciones.evaluaciones / 100)); return { matricula: alumno.matricula, nombre: alumno.nombre, califFinal: califFinal.toFixed(2), alumno_id: alumno.id }; }); let tablaHTML = `<table><thead><tr><th>Matrícula</th><th>Nombre</th><th>Calif. Final</th></tr></thead><tbody>`; resultadosFinales.forEach(res => { tablaHTML += `<tr><td>${res.matricula}</td><td>${res.nombre}</td><td>${res.califFinal}</td></tr>`; }); tablaHTML += `</tbody></table>`; reporteFinalContainer.innerHTML = tablaHTML; reporteFinalContainer.innerHTML += '<p>Guardando calificaciones...</p>'; const calificacionesParaSupabase = resultadosFinales.map(res => ({ materia_id: materiaSeleccionada.id, unidad: unidadSeleccionada, alumno_id: res.alumno_id, calificacion_final: res.califFinal })); const { error: errorSupabase } = await supabase.from('CalificacionesUnidad').upsert(calificacionesParaSupabase, { onConflict: 'materia_id,unidad,alumno_id' }); if (errorSupabase) throw new Error('Error al guardar en DB.'); const nombreNuevaHoja = `Reporte Final U${unidadSeleccionada} - ${new Date().toLocaleDateString()}`; const headers = [['Matrícula', 'Nombre', 'Calificación Final']]; const valoresReporte = resultadosFinales.map(res => [res.matricula, res.nombre, res.califFinal]); await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.reportes}/batchUpdate`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: nombreNuevaHoja } } }] }) }); await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetIds.reportes}/values/'${nombreNuevaHoja}'!A1:append?valueInputOption=USER_ENTERED`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [...headers, ...valoresReporte] }) }); alert(`¡Cálculo completado!`); } catch (error) { console.error("Error en cálculo:", error); reporteFinalContainer.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`; } };
const cerrarSemestre = async (materia) => { if (!confirm(`¿Cerrar semestre para "${materia.nombre}"?`)) return; alert('Cerrando semestre...'); try { const { data: { session } } = await supabase.auth.getSession(); const accessToken = session.provider_token; const { data: alumnos, error: errorAlumnos } = await supabase.from('Alumnos').select('matricula, nombre').eq('materia_id', materia.id); if (errorAlumnos) throw new Error('No se pudieron cargar alumnos.'); const raizId = await findFileIdByName('Plataforma de Apoyo Docente', 'root', 'application/vnd.google-apps.folder', accessToken); const semestreId = await findFileIdByName(materia.semestre, raizId, 'application/vnd.google-apps.folder', accessToken); const materiaId = await findFileIdByName(materia.nombre, semestreId, 'application/vnd.google-apps.folder', accessToken); if (!materiaId) throw new Error('No se encontró la carpeta.'); const calificacionesPorAlumno = new Map(alumnos.map(a => [a.matricula, { nombre: a.nombre, calificaciones: [] }])); for (let i = 1; i <= materia.unidades; i++) { const unidadId = await findFileIdByName(`Unidad ${i}`, materiaId, 'application/vnd.google-apps.folder', accessToken); if (!unidadId) continue; const reportesSheetId = await findFileIdByName('reportes', unidadId, 'application/vnd.google-apps.spreadsheet', accessToken); if (!reportesSheetId) continue; const sheetsMeta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${reportesSheetId}?fields=sheets.properties.title`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()); const reporteSheet = sheetsMeta.sheets.find(s => s.properties.title.startsWith(`Reporte Final U${i}`)); if (!reporteSheet) continue; const reporteData = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${reportesSheetId}/values/'${reporteSheet.properties.title}'!A:C`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(res => res.json()); if (reporteData.values) { reporteData.values.slice(1).forEach(row => { const [matricula, nombre, calificacion] = row; if (calificacionesPorAlumno.has(matricula)) { calificacionesPorAlumno.get(matricula).calificaciones.push(parseFloat(calificacion) || 0); } }); } } const resultadosSemestrales = []; for (const [matricula, data] of calificacionesPorAlumno.entries()) { const suma = data.calificaciones.reduce((acc, cal) => acc + cal, 0); const promedio = data.calificaciones.length > 0 ? suma / data.calificaciones.length : 0; resultadosSemestrales.push([matricula, data.nombre, promedio.toFixed(2)]); } const reporteFinalSheet = await createGoogleSheet(`Reporte Semestral Final - ${materia.nombre}`, materiaId, accessToken); const headers = [['Matrícula', 'Nombre', 'Calificación Final Semestral']]; const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${reporteFinalSheet.id}/values/A1:append?valueInputOption=USER_ENTERED`; await fetch(updateUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [...headers, ...resultadosSemestrales] }) }); alert('¡Cierre de semestre completado!'); } catch (error) { console.error("Error en cierre:", error); alert(`Error: ${error.message}`); } };

// --- EVENTOS ---
loginButton.addEventListener('click', signInWithGoogle);
logoutButton.addEventListener('click', signOut);
formMateria.addEventListener('submit', crearNuevaMateria);
btnVolverDashboard.addEventListener('click', mostrarDashboard);
formAlumno.addEventListener('submit', crearNuevoAlumno);
btnUploadCsv.addEventListener('click', procesarArchivoCSV);
cerrarModal.addEventListener('click', () => { modalEditar.style.display = 'none'; });
formEditarMateria.addEventListener('submit', guardarCambiosMateria);
btnIniciarSesion1.addEventListener('click', () => iniciarSesionAsistencia(1));
btnIniciarSesion2.addEventListener('click', () => iniciarSesionAsistencia(2));
btnTerminarAsistencia.addEventListener('click', terminarSesionAsistencia);
listaAlumnosAsistencia.addEventListener('change', manejarAsistenciaManual);
btnGuardarAsistenciaSheet.addEventListener('click', guardarAsistenciaEnSheet);
tabsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-link')) {
        tabsContainer.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    }
});
unidadActividadesSelect.addEventListener('change', listarArchivosDeActividades);
btnSeleccionarTodo.addEventListener('click', () => { document.querySelectorAll('.checkbox-archivo').forEach(checkbox => checkbox.checked = true); });
btnDeseleccionarTodo.addEventListener('click', () => { document.querySelectorAll('.checkbox-archivo').forEach(checkbox => checkbox.checked = false); });
btnIniciarCalificacionIA.addEventListener('click', iniciarCalificacionConIA);
unidadCalificacionesSelect.addEventListener('change', cargarPonderacion);
camposPonderacion.forEach(input => { input.addEventListener('input', actualizarTotalPonderado); });
btnGuardarPonderacion.addEventListener('click', guardarPonderacion);
btnCalcularUnidad.addEventListener('click', calcularCalificacionesFinales);
unidadMaterialSelect.addEventListener('change', listarMaterialDidactico);
listaMaterialDidactico.addEventListener('change', manejarPermisoMaterial);
unidadEvaluacionesSelect.addEventListener('change', listarEvaluaciones);
btnCrearEvaluacion.addEventListener('click', crearNuevaEvaluacion);
evaluacionesListado.addEventListener('change', (e) => {
    if (e.target.classList.contains('evaluacion-toggle')) {
        manejarActivacionEvaluacion(e);
    }
});
unidadReportesSelect.addEventListener('change', listarArchivosDeReportes);
listaArchivosReportes.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        guardarCalificacionReporte(e);
    }
});
mostrarOcultasCheckbox.addEventListener('change', obtenerMaterias);