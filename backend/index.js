// =================================================================
// == Plataforma de Apoyo Docente - Backend v2.0 (FINAL Y COMPLETO)
// =================================================================

// --- 1. IMPORTACIONES DE LIBRERÍAS ---
const functions = require('@google-cloud/functions-framework');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

// --- 2. CONFIGURACIÓN E INICIALIZACIÓN DE APIS ---
const auth = new google.auth.GoogleAuth({
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/forms.body'
    ],
});
const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const forms = google.forms({ version: 'v1', auth });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
// --- 3. HELPER DE SEGURIDAD: VERIFICADOR DE AUTENTICACIÓN ---
const getAuthenticatedUser = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('No se proporcionó un token de autorización válido.');
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw new Error(`Error de autenticación: ${error.message}`);
    if (!user) throw new Error('Token inválido o expirado.');
    console.log(`Solicitud autenticada para el usuario: ${user.id}`);
    return user;
};
// --- 4. HELPERS INTERNOS DE GOOGLE DRIVE ---
const findOrCreateFolder = async (name, parentId) => {
    const query = `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    let res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const meta = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
    const createRes = await drive.files.create({ resource: meta, fields: 'id' });
    return createRes.data.id;
};
const createGoogleSheet = async (name, parentId) => {
    const meta = { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] };
    const res = await drive.files.create({ resource: meta, fields: 'id' });
    return res.data.id;
};

/**
 * Cloud Function que recibe los detalles de una materia y crea toda la
 * estructura de carpetas y archivos en el Google Drive de la Cuenta de Servicio.
 */
/**
 * VERSIÓN HÍBRIDA: Crea la estructura en Drive Y guarda la metadata en Supabase.
 */
functions.http('createMateriaStructure', async (req, res) => {
    // ... (el código de CORS se mantiene igual) ...
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
        const materia = req.body;
        // -- NUEVO: Obtener el ID del docente desde el token (esto lo implementaremos después) --
        // Por ahora, lo simularemos. NECESITAREMOS el ID de un usuario de prueba de Supabase.
        // Ve a Supabase > Authentication > Users y copia el UID de un usuario.
        const docenteId = "PEGA_AQUI_EL_UID_DE_UN_USUARIO_DOCENTE_DE_PRUEBA"; 

        if (!materia || !materia.nombre || !materia.semestre || !materia.unidades || !docenteId) {
            return res.status(400).send({ message: 'Datos incompletos.' });
        }

        // --- PARTE 1: CREACIÓN EN GOOGLE DRIVE (sin cambios) ---
        console.log('Iniciando creación en Drive para:', materia.nombre);
        const raizAppId = await findOrCreateFolder('Plataforma de Apoyo Docente', 'root');

        // -- Lógica para buscar o crear el semestre en Drive --
        const semestreDriveQuery = `'${raizAppId}' in parents and name = '${materia.semestre}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        let semestreFolderResponse = await drive.files.list({ q: semestreDriveQuery, fields: 'files(id)' });
        let semestreId;
        if (semestreFolderResponse.data.files.length > 0) {
            semestreId = semestreFolderResponse.data.files[0].id;
        } else {
            const createdSemestre = await drive.files.create({ resource: { name: materia.semestre, mimeType: 'application/vnd.google-apps.folder', parents: [raizAppId] }, fields: 'id' });
            semestreId = createdSemestre.data.id;
        }

        const materiaId = await findOrCreateFolder(materia.nombre, semestreId);
        const unidadesDriveData = [];
        for (let i = 1; i <= materia.unidades; i++) {
            const unidadFolderId = await findOrCreateFolder(`Unidad ${i}`, materiaId);
            const asistenciaId = await createGoogleSheet('asistencia', unidadFolderId);
            const actividadesId = await createGoogleSheet('actividades', unidadFolderId);
            const reportesId = await createGoogleSheet('reportes', unidadFolderId);
            const evaluacionesId = await createGoogleSheet('evaluaciones', unidadFolderId);
            const ponderacionId = await createGoogleSheet('ponderacion_unidad', unidadFolderId);
            unidadesDriveData.push({ numero: i, folderId: unidadFolderId, asistenciaId, actividadesId, reportesId, evaluacionesId, ponderacionId });
        }

        // --- PARTE 2: GUARDAR METADATA EN SUPABASE ---
        console.log("Guardando metadata en Supabase...");

        // 1. Insertar o encontrar el semestre en la tabla 'semestres'
        let { data: semestreData, error: semestreError } = await supabase
            .from('semestres')
            .select('id')
            .eq('nombre', materia.semestre)
            .eq('docente_id', docenteId)
            .single();

        if (semestreError && semestreError.code !== 'PGRST116') { // PGRST116 = 'not found'
            throw semestreError;
        }
        if (!semestreData) {
            const { data, error } = await supabase
                .from('semestres')
                .insert({ nombre: materia.semestre, docente_id: docenteId, drive_folder_id: semestreId })
                .select('id')
                .single();
            if (error) throw error;
            semestreData = data;
        }

        // 2. Insertar la nueva materia
        const { data: materiaData, error: materiaError } = await supabase
            .from('materias')
            .insert({
                nombre: materia.nombre,
                unidades_count: materia.unidades,
                semestre_id: semestreData.id,
                docente_id: docenteId,
                drive_folder_id: materiaId
            })
            .select('id')
            .single();
        if (materiaError) throw materiaError;

        // 3. Insertar las unidades
        const unidadesParaInsertar = unidadesDriveData.map(u => ({
            numero_unidad: u.numero,
            materia_id: materiaData.id,
            ponderacion: 0, // Ponderación inicial de 0
            drive_folder_id: u.folderId,
            asistencia_sheet_id: u.asistenciaId,
            actividades_sheet_id: u.actividadesId,
            reportes_sheet_id: u.reportesId,
            evaluaciones_sheet_id: u.evaluacionesId,
            ponderacion_sheet_id: u.ponderacionId
        }));
        const { error: unidadesError } = await supabase.from('unidades').insert(unidadesParaInsertar);
        if (unidadesError) throw unidadesError;

        console.log('¡Estructura híbrida creada con éxito!');
        res.status(200).send({
            message: 'Estructura creada en Drive y registrada en Supabase.',
            materiaDriveFolderId: materiaId,
            materiaDbId: materiaData.id
        });

    } catch (error) {
        console.error('Error creando la estructura híbrida:', error);
        res.status(500).send({ message: `Error interno: ${error.message}` });
    }
});
// --- 5. RUTAS/FUNCIONES DEL API ---

// -- 5.1 GESTIÓN DE MATERIAS (SEGURAS) --
functions.http('createMateriaStructure', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        const user = await getAuthenticatedUser(req);
        const docenteId = user.id;
        const materia = req.body;
        if (!materia || !materia.nombre || !materia.semestre || !materia.unidades) return res.status(400).send({ message: 'Datos de materia incompletos.' });
        
        const raizAppId = await findOrCreateFolder('Plataforma de Apoyo Docente', 'root');
        const semestreId = await findOrCreateFolder(materia.semestre, raizAppId);
        const materiaFolderId = await findOrCreateFolder(materia.nombre, semestreId);
        const unidadesDriveData = [];
        for (let i = 1; i <= materia.unidades; i++) {
            const unidadFolderId = await findOrCreateFolder(`Unidad ${i}`, materiaFolderId);
            unidadesDriveData.push({ numero: i, folderId: unidadFolderId, aId: await createGoogleSheet('asistencia', unidadFolderId), acId: await createGoogleSheet('actividades', unidadFolderId), rId: await createGoogleSheet('reportes', unidadFolderId), eId: await createGoogleSheet('evaluaciones', unidadFolderId), pId: await createGoogleSheet('ponderacion_unidad', unidadFolderId) });
        }

        let { data: semData } = await supabase.from('semestres').select('id').eq('nombre', materia.semestre).eq('docente_id', docenteId).single();
        if (!semData) { const { data } = await supabase.from('semestres').insert({ nombre: materia.semestre, docente_id: docenteId, drive_folder_id: semestreId }).select('id').single(); semData = data; }

        const { data: matData } = await supabase.from('materias').insert({ nombre: materia.nombre, unidades_count: materia.unidades, semestre_id: semData.id, docente_id: docenteId, drive_folder_id: materiaFolderId }).select('id').single();
        const unidadesInsert = unidadesDriveData.map(u => ({ numero_unidad: u.numero, materia_id: matData.id, ponderacion: 0, drive_folder_id: u.folderId, asistencia_sheet_id: u.aId, actividades_sheet_id: u.acId, reportes_sheet_id: u.rId, evaluaciones_sheet_id: u.eId, ponderacion_sheet_id: u.pId }));
        await supabase.from('unidades').insert(unidadesInsert);
        
        res.status(200).send({ message: 'Estructura creada y registrada.', materiaDriveFolderId: materiaFolderId, materiaDbId: matData.id });
    } catch (error) { const status = error.message.includes('autenticación') ? 401 : 500; res.status(status).send({ message: `Error: ${error.message}` }); }
});

functions.http('listMaterias', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'GET'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        const user = await getAuthenticatedUser(req);
        const { data, error } = await supabase.from('semestres').select(`nombre, drive_folder_id, materias (id, nombre, drive_folder_id, visible)`).eq('docente_id', user.id);
        if (error) throw error;
        const resultado = data.map(s => ({ semestre: s.nombre, semestreId: s.drive_folder_id, materias: s.materias.map(m => ({ dbId: m.id, nombre: m.nombre, materiaId: m.drive_folder_id, visible: m.visible })) }));
        res.status(200).send(resultado);
    } catch (error) { const status = error.message.includes('autenticación') ? 401 : 500; res.status(status).send({ message: `Error: ${error.message}` }); }
});

functions.http('deleteMateria', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        const user = await getAuthenticatedUser(req);
        const { materiaId } = req.body;
        if (!materiaId) return res.status(400).send({ message: 'Se requiere "materiaId".' });
        const { data } = await supabase.from('materias').select('drive_folder_id').eq('id', materiaId).eq('docente_id', user.id).single();
        if (!data) throw new Error('Materia no encontrada o sin permiso.');
        await supabase.from('materias').delete().eq('id', materiaId);
        await drive.files.delete({ fileId: data.drive_folder_id });
        res.status(200).send({ message: 'Materia eliminada completamente.' });
    } catch (error) { const status = error.message.includes('autenticación') ? 401 : 500; res.status(status).send({ message: `Error: ${error.message}` }); }
});
// --- NUEVA FUNCIÓN PARA COMPARTIR CARPETAS ---

/**
 * Cloud Function que comparte una carpeta de Drive con un usuario específico.
 * Le otorga permisos de "escritor" (editor) para que pueda modificar el contenido.
 */
functions.http('shareFolderWithUser', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        // 1. Extraer los datos de la solicitud
        const { folderId, emailAddress } = req.body;
        if (!folderId || !emailAddress) {
            return res.status(400).send({ message: 'Se requiere "folderId" y "emailAddress".' });
        }

        console.log(`Compartiendo carpeta ${folderId} con ${emailAddress}...`);

        // 2. Crear el permiso en la API de Drive
        await drive.permissions.create({
            fileId: folderId,
            requestBody: {
                role: 'writer', // 'writer' es el rol de editor. Puede ver, editar y añadir archivos.
                type: 'user',   // Estamos compartiendo con un usuario específico.
                emailAddress: emailAddress
            }
        });

        console.log('¡Carpeta compartida exitosamente!');
        
        // 3. Enviar una respuesta de éxito
        res.status(200).send({ message: `Carpeta ${folderId} compartida exitosamente con ${emailAddress}.` });

    } catch (error) {
        console.error('Error al compartir la carpeta:', error);
        res.status(500).send({ message: 'Error interno del servidor al compartir la carpeta.' });
    }
});
/**
 * VERSIÓN HÍBRIDA: Elimina la materia de la base de datos de Supabase
 * y luego borra la carpeta correspondiente de Google Drive.
 */
functions.http('deleteMateria', async (req, res) => {
    // ... (el código de CORS se mantiene igual) ...
    res.set('Access-control-allow-origin', '*');
    res.set('Access-control-allow-methods', 'POST');
    res.set('Access-control-allow-headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
        // AHORA RECIBIMOS EL ID DE LA BASE DE DATOS, no el de la carpeta
        const { materiaId } = req.body;
        if (!materiaId) {
            return res.status(400).send({ message: 'Se requiere "materiaId" de la base de datos.' });
        }

        // -- NUEVO: Obtener el ID del docente desde el token (lo implementaremos después) --
        const docenteId = "PEGA_AQUI_EL_UID_DE_UN_USUARIO_DOCENTE_DE_PRUEBA";

        console.log(`Solicitud para eliminar la materia con DB ID: ${materiaId}`);

        // 1. Obtener el ID de la carpeta de Drive desde Supabase
        const { data: materiaData, error: selectError } = await supabase
            .from('materias')
            .select('drive_folder_id')
            .eq('id', materiaId)
            .eq('docente_id', docenteId) // Asegurarnos de que el docente es el propietario
            .single();

        if (selectError || !materiaData) {
            throw new Error('Materia no encontrada o no tienes permiso para eliminarla.');
        }

        const folderIdToDelete = materiaData.drive_folder_id;

        // 2. Eliminar la materia de la base de datos de Supabase.
        // Gracias a la configuración "ON DELETE CASCADE", al eliminar la materia,
        // Supabase eliminará automáticamente todas sus unidades, materiales, etc.
        const { error: deleteError } = await supabase
            .from('materias')
            .delete()
            .eq('id', materiaId);

        if (deleteError) {
            throw deleteError;
        }
        console.log(`Registro de la materia ${materiaId} eliminado de Supabase.`);

        // 3. Eliminar la carpeta de Google Drive
        await drive.files.delete({
            fileId: folderIdToDelete,
        });

        console.log(`Carpeta de Drive ${folderIdToDelete} eliminada exitosamente.`);

        res.status(200).send({ message: `La materia ha sido eliminada completamente.` });

    } catch (error) {
        console.error(`Error al eliminar la materia ${req.body.materiaId}:`, error);
        res.status(500).send({ message: `Error interno: ${error.message}` });
    }
});
/**
 * VERSIÓN SEGURA: Lee las materias del docente autenticado.
 */
functions.http('listMaterias', async (req, res) => {
    // ... (el código de CORS se mantiene igual) ...
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // <-- AÑADIR 'Authorization'
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
        // 1. OBTENER EL USUARIO AUTENTICADO
        const user = await getAuthenticatedUser(req);
        const docenteId = user.id;

        console.log(`Buscando materias para el docente ${docenteId} en Supabase...`);

        // 2. Hacer la consulta a Supabase (el resto del código es igual)
        const { data, error } = await supabase
            .from('semestres')
            .select(`
                nombre,
                drive_folder_id,
                materias ( nombre, drive_folder_id, visible )
            `)
            .eq('docente_id', docenteId);

        if (error) throw error;

        // ... (el resto de la función para formatear y enviar la respuesta es igual) ...
        const resultadoFinal = data.map(semestre => ({
            semestre: semestre.nombre,
            semestreId: semestre.drive_folder_id,
            materias: semestre.materias.map(materia => ({
                nombre: materia.nombre,
                materiaId: materia.drive_folder_id,
                visible: materia.visible
            }))
        }));
        res.status(200).send(resultadoFinal);

    } catch (error) {
        console.error('Error en listMaterias (seguro):', error);
        // Si el error es de autenticación, enviamos un código 401 (No autorizado)
        if (error.message.includes('autenticación') || error.message.includes('token')) {
            res.status(401).send({ message: error.message });
        } else {
            res.status(500).send({ message: `Error interno: ${error.message}` });
        }
    }
});
// --- NUEVA FUNCIÓN PARA LA ASISTENCIA QR ---

/**
 * Cloud Function que genera un código de asistencia único y temporal para una
 * hoja de cálculo de asistencia específica.
 * Almacena el código y una marca de tiempo como propiedades personalizadas en el archivo de Drive.
 */
functions.http('generateAttendanceCode', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { sheetId } = req.body;
        if (!sheetId) {
            return res.status(400).send({ message: 'Se requiere "sheetId".' });
        }

        // 1. Generar un código de sesión único y una marca de tiempo
        // El código es una cadena aleatoria y la marca de tiempo es la hora actual en milisegundos
        const attendanceCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const timestamp = Date.now().toString();

        console.log(`Generando código de asistencia para el Sheet ${sheetId}: ${attendanceCode}`);

        // 2. Actualizar las propiedades del archivo en Drive para almacenar la sesión
        // Esto es como ponerle una "etiqueta" invisible al archivo con la información de la sesión.
        await drive.files.update({
            fileId: sheetId,
            requestBody: {
                properties: {
                    'attendance_code': attendanceCode,
                    'session_start_time': timestamp
                }
            }
        });

        console.log("Código de asistencia guardado en las propiedades del archivo.");
        
        // 3. Enviar el código de vuelta al frontend para que pueda generar el QR
        res.status(200).send({
            message: 'Código de asistencia generado exitosamente.',
            attendanceCode: attendanceCode
        });

    } catch (error) {
        console.error(`Error al generar el código de asistencia para ${req.body.sheetId}:`, error);
        res.status(500).send({ message: 'Error interno del servidor al generar el código.' });
    }
});
// --- NUEVA FUNCIÓN PARA REGISTRAR ASISTENCIA DE ESTUDIANTES ---

/**
 * Cloud Function que un estudiante usa para registrar su asistencia.
 * Valida un código, encuentra la hoja de asistencia correspondiente y escribe una nueva fila.
 */
functions.http('registerAttendance', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { attendanceCode, studentId } = req.body;
        if (!attendanceCode || !studentId) {
            return res.status(400).send({ message: 'Se requiere "attendanceCode" y "studentId".' });
        }

        console.log(`Intento de registro para el código ${attendanceCode} por el estudiante ${studentId}`);

        // 1. Buscar el archivo de asistencia que tenga el código activo en sus propiedades
        const query = `properties has { key='attendance_code' and value='${attendanceCode}' } and trashed=false`;
        const fileResponse = await drive.files.list({
            q: query,
            fields: 'files(id, properties, name)',
            spaces: 'drive',
        });

        if (fileResponse.data.files.length === 0) {
            console.log("Código de asistencia no encontrado o inválido.");
            return res.status(404).send({ message: 'Código de asistencia no válido o la sesión ha expirado.' });
        }

        const sheetFile = fileResponse.data.files[0];
        const sheetId = sheetFile.id;
        const sessionStartTime = parseInt(sheetFile.properties.session_start_time, 10);

        // 2. Validar que la sesión no haya expirado (ej. 15 minutos de validez)
        const SESSION_DURATION_MS = 15 * 60 * 1000;
        if (Date.now() - sessionStartTime > SESSION_DURATION_MS) {
            console.log("La sesión de asistencia ha expirado.");
            // Opcional: Podríamos borrar las propiedades del archivo para invalidar el código permanentemente
            return res.status(403).send({ message: 'La sesión de asistencia ha expirado.' });
        }

        // 3. Escribir la asistencia en la hoja de cálculo
        const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Merida' });
        const values = [[studentId, timestamp]]; // Los datos a añadir: [[valor_columna_A, valor_columna_B]]
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'A1', // Sheets es lo suficientemente inteligente para encontrar la primera fila vacía a partir de A1
            valueInputOption: 'USER_ENTERED',
            resource: { values },
        });
        
        console.log(`Asistencia registrada para ${studentId} en la hoja ${sheetFile.name}`);
        
        res.status(200).send({ message: `¡Asistencia registrada con éxito para ${studentId}!` });

    } catch (error) {
        console.error('Error al registrar la asistencia:', error);
        res.status(500).send({ message: 'Error interno del servidor al registrar la asistencia.' });
    }
});
// --- NUEVA FUNCIÓN PARA LISTAR MATERIAL DIDÁCTICO ---

/**
 * Cloud Function que lista todos los archivos dentro de una carpeta específica de Drive.
 * Ideal para mostrar al docente el material didáctico de una unidad.
 */
functions.http('listUnitFiles', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST'); // Usamos POST para recibir el folderId en el body
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { folderId } = req.body;
        if (!folderId) {
            return res.status(400).send({ message: 'Se requiere "folderId".' });
        }

        console.log(`Listando archivos para la carpeta ${folderId}`);

        // 1. Construir la consulta para buscar archivos dentro de la carpeta padre
        const query = `'${folderId}' in parents and trashed=false`;

        // 2. Llamar a la API de Drive para obtener la lista de archivos
        const response = await drive.files.list({
            q: query,
            // Pedimos los campos que nos interesan para cada archivo
            fields: 'files(id, name, mimeType, webViewLink, iconLink)', 
        });

        const files = response.data.files;
        console.log(`Se encontraron ${files.length} archivos.`);
        
        // 3. Enviar la lista de archivos de vuelta al frontend
        res.status(200).send(files);

    } catch (error) {
        console.error(`Error al listar los archivos de la carpeta ${req.body.folderId}:`, error);
        res.status(500).send({ message: 'Error interno del servidor al listar los archivos.' });
    }
});
// --- NUEVA FUNCIÓN PARA CREAR EVALUACIONES ---

/**
 * Cloud Function que crea un nuevo Google Form para una evaluación
 * y lo mueve a la carpeta de la unidad correspondiente.
 */
functions.http('createEvaluationForm', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { title, parentFolderId } = req.body;
        if (!title || !parentFolderId) {
            return res.status(400).send({ message: 'Se requiere "title" y "parentFolderId".' });
        }

        console.log(`Creando evaluación con título: "${title}"`);

        // 1. Crear el Google Form
        const form = await forms.forms.create({
            requestBody: {
                info: {
                    title: title,
                    documentTitle: title // El nombre del archivo
                }
            }
        });

        const formId = form.data.formId;
        const formUrl = form.data.responderUri;
        console.log(`Formulario creado con ID: ${formId}`);

        // 2. Mover el formulario a la carpeta de la unidad correspondiente
        // Los formularios se crean en la raíz del Drive, necesitamos moverlos.
        // Primero, obtenemos la información del archivo para saber su ID de Drive.
        const file = await drive.files.get({
            fileId: formId,
            fields: 'parents' // Necesitamos saber dónde está actualmente (en la raíz)
        });

        // Luego, lo actualizamos para cambiar su "padre" a la carpeta de la unidad
        await drive.files.update({
            fileId: formId,
            addParents: parentFolderId,
            removeParents: file.data.parents.join(','), // Lo quitamos de la raíz
            fields: 'id, parents'
        });

        console.log(`Formulario ${formId} movido a la carpeta ${parentFolderId}`);
        
        // 3. Devolver la información del formulario creado
        res.status(200).send({
            message: 'Evaluación creada exitosamente.',
            formId: formId,
            formUrl: formUrl
        });

    } catch (error) {
        console.error(`Error al crear la evaluación:`, error);
        res.status(500).send({ message: 'Error interno del servidor al crear la evaluación.' });
    }
});
// --- NUEVA FUNCIÓN PARA LEER DATOS DE HOJAS DE CÁLCULO ---

/**
 * Cloud Function que lee y devuelve todos los datos de una hoja de cálculo de Google.
 */
functions.http('getSheetData', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST'); // Usamos POST para recibir el sheetId en el body
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { sheetId } = req.body;
        if (!sheetId) {
            return res.status(400).send({ message: 'Se requiere "sheetId".' });
        }

        console.log(`Leyendo datos del Sheet con ID: ${sheetId}`);

        // 1. Llamar a la API de Google Sheets para obtener los valores
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'A1:Z', // Un rango amplio para asegurar que leemos toda la hoja
        });

        const rows = response.data.values || []; // Si la hoja está vacía, 'values' puede no existir
        console.log(`Se encontraron ${rows.length} filas de datos.`);
        
        // 2. Enviar los datos de vuelta al frontend
        // El resultado es un arreglo de arreglos, donde cada arreglo interno es una fila.
        // Ejemplo: [ ["Matrícula", "Fecha"], ["001", "03/10/2025"], ["002", "03/10/2025"] ]
        res.status(200).send(rows);

    } catch (error) {
        console.error(`Error al leer los datos del Sheet ${req.body.sheetId}:`, error);
        res.status(500).send({ message: 'Error interno del servidor al leer la hoja de cálculo.' });
    }
});
// --- NUEVA FUNCIÓN PARA ESCRIBIR/ACTUALIZAR DATOS EN HOJAS DE CÁLCULO ---

/**
 * Cloud Function que escribe o actualiza datos en un rango específico de una hoja de cálculo.
 */
functions.http('updateSheetData', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { sheetId, range, values } = req.body;
        if (!sheetId || !range || !values) {
            return res.status(400).send({ message: 'Se requiere "sheetId", "range" y "values".' });
        }

        console.log(`Escribiendo en Sheet ${sheetId}, rango ${range}`);

        // 1. Llamar a la API de Google Sheets para actualizar los valores
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: range, // El rango específico a escribir, ej: 'Hoja1!C2:D3'
            valueInputOption: 'USER_ENTERED', // Interpreta los datos como si un usuario los escribiera
            resource: {
                values: values, // Los datos a escribir, en formato de arreglo de arreglos.
                                // Ejemplo para una celda: [['100']]
                                // Ejemplo para dos filas: [['Actividad 1', '100'], ['Actividad 2', '80']]
            },
        });

        console.log("Datos actualizados exitosamente.");
        
        // 2. Enviar una confirmación de éxito
        res.status(200).send({
            message: 'Datos actualizados exitosamente en la hoja de cálculo.',
            updatedRange: response.data.updatedRange
        });

    } catch (error) {
        console.error(`Error al escribir en el Sheet ${req.body.sheetId}:`, error);
        res.status(500).send({ message: 'Error interno del servidor al escribir en la hoja de cálculo.' });
    }
});
// --- FUNCIÓN FINAL PARA GESTIONAR PERMISOS DE MATERIALES ---

/**
 * Cloud Function que actualiza los permisos de un archivo en Drive.
 * Puede hacer un archivo público (visible para cualquiera con el enlace) o privado.
 */
functions.http('updateFilePermissions', async (req, res) => {
    // Configuración de CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { fileId, isPublic } = req.body;
        if (!fileId || isPublic === undefined) {
            return res.status(400).send({ message: 'Se requiere "fileId" y un estado "isPublic" (true/false).' });
        }

        console.log(`Actualizando permisos para el archivo ${fileId}. Hacerlo público: ${isPublic}`);

        if (isPublic) {
            // HACE EL ARCHIVO PÚBLICO (CUALQUIERA CON EL ENLACE PUEDE VER)
            await drive.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: 'reader', // Rol de 'lector'
                    type: 'anyone'  // Para 'cualquier persona'
                }
            });
            console.log("El archivo ahora es público.");
        } else {
            // HACE EL ARCHIVO PRIVADO (ELIMINA EL PERMISO PÚBLICO)
            try {
                await drive.permissions.delete({
                    fileId: fileId,
                    permissionId: 'anyone' // El ID del permiso público es siempre 'anyone'
                });
                console.log("El archivo ahora es privado.");
            } catch (error) {
                // Si el permiso 'anyone' no existía, la API da un error.
                // Lo ignoramos de forma segura porque el resultado deseado (que sea privado) ya se cumple.
                if (error.code === 404) {
                    console.log("El archivo ya era privado. No se realizaron cambios.");
                } else {
                    throw error; // Si es otro error, sí lo lanzamos.
                }
            }
        }
        
        res.status(200).send({ message: `Permisos del archivo ${fileId} actualizados correctamente.` });

    } catch (error) {
        console.error(`Error al actualizar los permisos del archivo ${req.body.fileId}:`, error);
        res.status(500).send({ message: 'Error interno del servidor al actualizar los permisos.' });
    }
});
