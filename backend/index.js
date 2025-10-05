// =================================================================
// == Plataforma de Apoyo Docente - Backend v2.0 (FINAL Y COMPLETO)
// =================================================================

// --- 1. IMPORTACIONES DE LIBRERÍAS ---
const functions = require('@google-cloud/functions-framework');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

// --- 2. CONFIGURACIÓN E INICIALIZACIÓN DE APIS ---
const auth = new google.auth.GoogleAuth({
    // Permisos necesarios para gestionar Drive, Sheets y Forms
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.body.readonly' // Necesario para algunas operaciones de Forms
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
    // Usamos el email para Drive y el ID para Supabase (como se define en el frontend)
    console.log(`Solicitud autenticada para el usuario: ${user.email} (ID: ${user.id})`);
    return user;
};

// --- 4. HELPERS INTERNOS DE GOOGLE DRIVE Y SHEETS ---

// **Drive: Creación y Búsqueda**
const findOrCreateFolder = async (name, parentId) => {
    const query = `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    let res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const meta = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
    const createRes = await drive.files.create({ resource: meta, fields: 'id' });
    return createRes.data.id;
};

// **Drive: Creación de Hojas de Cálculo (Base)**
const createGoogleSheet = async (name, parentId) => {
    const meta = { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] };
    const res = await drive.files.create({ resource: meta, fields: 'id' });
    return res.data.id;
};

// **Drive: Compartición (Permisos)**
const shareDriveItem = async (fileId, emailAddress, role = 'writer') => {
    const permission = { 'type': 'user', 'role': role, 'emailAddress': emailAddress };
    try {
        await drive.permissions.create({
            fileId: fileId,
            resource: permission,
            sendNotificationEmail: true,
            fields: 'id',
        });
        console.log(`Compartido ${fileId} con ${emailAddress} como ${role}`);
    } catch (error) {
        if (error.code === 409) { console.log(`El item ya está compartido con ${emailAddress}.`); }
        else { throw error; }
    }
};

// **Sheets: Estructuración (Inicialización de Asistencia)**
const initAsistenciaSheet = async (sheetId) => {
    const requests = [{
        // Headers: Matrícula, Nombre + Columnas de asistencia (se asume llenado diario)
        updateCells: {
            rows: [{ values: [
                { userEnteredValue: { stringValue: 'Matrícula' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Nombre Completo' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Día 1' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Día 2' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Día 3' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Día 4' }, userEnteredFormat: { textFormat: { bold: true } } },
            ] }],
            start: { sheetId: 0, rowIndex: 0, columnIndex: 0 },
            fields: 'userEnteredValue,userEnteredFormat.textFormat'
        }
    }];
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
};

// **Sheets: Estructuración (Inicialización de Actividades/Evaluaciones)**
const initActividadesSheet = async (sheetId) => {
    const requests = [{
        // Headers: Matrícula, Nombre + Columna de Nota (Actividades o Evaluación)
        updateCells: {
            rows: [{ values: [
                { userEnteredValue: { stringValue: 'Matrícula' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Nombre Completo' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Nota Final' }, userEnteredFormat: { textFormat: { bold: true } } }
            ] }],
            start: { sheetId: 0, rowIndex: 0, columnIndex: 0 },
            fields: 'userEnteredValue,userEnteredFormat.textFormat'
        }
    }];
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
};

// **Sheets: Estructuración (Inicialización de Ponderación)**
const initPonderacionSheet = async (sheetId) => {
    // Estructura de Ponderación
    const values = [
        ['Criterio', 'Ponderación (%)'],
        ['Asistencia', ''],
        ['Actividades', ''],
        ['Reportes', ''],
        ['Evaluaciones', ''],
        ['Total (Debe sumar 100%)', '=SUM(B2:B5)'] 
    ];
    
    // Escribir valores y fórmulas
    await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: values },
    });
    
    // Renombrar la hoja y dar formato
    const requests = [{
        updateSheetProperties: { properties: { sheetId: 0, title: 'Ponderación de Unidad' }, fields: 'title' }
    }, {
        repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold'
        }
    }];

    await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
};

// --- 6. RUTAS/FUNCIONES DEL API (Cloud Functions) ---

// -- 6.1 GESTIÓN DE MATERIAS (CREACIÓN DE ESTRUCTURA) --
functions.http('createMateriaStructure', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        const user = await getAuthenticatedUser(req);
        const docenteId = user.id;
        const docenteEmail = user.email; 

        const materia = req.body;
        if (!materia || !materia.nombre || !materia.semestre || !materia.unidades) return res.status(400).send({ message: 'Datos de materia incompletos.' });
        
        // 1. Creación de Drive
        const raizAppId = await findOrCreateFolder('Plataforma de Apoyo Docente', 'root');
        const semestreId = await findOrCreateFolder(materia.semestre, raizAppId);
        const materiaFolderId = await findOrCreateFolder(materia.nombre, semestreId);
        
        // **AÑADIDO: Compartir la carpeta principal con el docente**
        await shareDriveItem(materiaFolderId, docenteEmail, 'writer', true); 

        const unidadesDriveData = [];
        for (let i = 1; i <= materia.unidades; i++) {
            const unidadFolderId = await findOrCreateFolder(`Unidad ${i}`, materiaFolderId);
            // Crea la subcarpeta de Material Didáctico
            const materialDidacticoFolderId = await findOrCreateFolder('Material Didáctico', unidadFolderId);
            
            unidadesDriveData.push({ 
                numero: i, 
                folderId: unidadFolderId,
                materialId: materialDidacticoFolderId, // Nuevo ID
                aId: await createGoogleSheet('Asistencia', unidadFolderId), 
                acId: await createGoogleSheet('Actividades', unidadFolderId), 
                rId: await createGoogleSheet('Reportes', unidadFolderId), 
                eId: await createGoogleSheet('Evaluaciones', unidadFolderId), 
                pId: await createGoogleSheet('Ponderacion_Unidad', unidadFolderId) 
            });
        }

        // 2. Persistencia en Supabase
        let { data: semData } = await supabase.from('semestres').select('id').eq('nombre', materia.semestre).eq('docente_id', docenteId).single();
        if (!semData) { const { data } = await supabase.from('semestres').insert({ nombre: materia.semestre, docente_id: docenteId, drive_folder_id: semestreId }).select('id').single(); semData = data; }

        const { data: matData } = await supabase.from('materias').insert({ nombre: materia.nombre, unidades_count: materia.unidades, semestre_id: semData.id, docente_id: docenteId, drive_folder_id: materiaFolderId }).select('id').single();
        
        const unidadesInsert = unidadesDriveData.map(u => ({ 
            numero_unidad: u.numero, 
            materia_id: matData.id, 
            ponderacion: 0, 
            drive_folder_id: u.folderId, 
            material_didactico_folder_id: u.materialId, // Nuevo campo
            asistencia_sheet_id: u.aId, 
            actividades_sheet_id: u.acId, 
            reportes_sheet_id: u.rId, 
            evaluaciones_sheet_id: u.eId, 
            ponderacion_sheet_id: u.pId 
        }));
        await supabase.from('unidades').insert(unidadesInsert);
        
        // 3. Inicialización de Hojas de Cálculo (Estructuración)
        for (const unidad of unidadesDriveData) {
            await initAsistenciaSheet(unidad.aId);
            await initActividadesSheet(unidad.acId);
            await initPonderacionSheet(unidad.pId);
        }

        res.status(200).send({ message: 'Estructura creada, compartida y registrada.', materiaDriveFolderId: materiaFolderId, materiaDbId: matData.id });
    } catch (error) { 
        console.error("Error en createMateriaStructure:", error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});

// -- 6.2 GESTIÓN DE MATERIAS (LISTAR) --
functions.http('listMaterias', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'GET'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).send('Método no permitido'); return; }

    try {
        const user = await getAuthenticatedUser(req);
        const { data, error } = await supabase.from('semestres')
            .select(`
                nombre, 
                drive_folder_id, 
                materias (id, nombre, drive_folder_id, visible)
            `)
            .eq('docente_id', user.id);
            
        if (error) throw error;
        
        const resultado = data.map(s => ({ 
            semestre: s.nombre, 
            semestreId: s.drive_folder_id, 
            materias: s.materias.map(m => ({ 
                dbId: m.id, 
                nombre: m.nombre, 
                materiaId: m.drive_folder_id, 
                visible: m.visible 
            })) 
        }));
        
        res.status(200).send(resultado);
    } catch (error) { 
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});

// -- 6.3 GESTIÓN DE MATERIAS (ELIMINAR) --
functions.http('deleteMateria', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).send('Método no permitido'); return; }
    
    try {
        const user = await getAuthenticatedUser(req);
        const { materiaDbId } = req.body;
        if (!materiaDbId) return res.status(400).send({ message: 'ID de materia es requerido.' });
        
        // 1. Obtener la información de la materia y su folder (y verificar propiedad)
        const { data: materiaData, error: fetchError } = await supabase
            .from('materias')
            .select('drive_folder_id')
            .eq('id', materiaDbId)
            .eq('docente_id', user.id)
            .single();

        if (fetchError || !materiaData) throw new Error('Materia no encontrada o no autorizada.');

        // 2. Eliminar registros de la base de datos (ON DELETE CASCADE se encarga de las unidades)
        const { error: deleteError } = await supabase.from('materias').delete().eq('id', materiaDbId);
        if (deleteError) throw deleteError;
        
        // 3. Eliminar la carpeta de Drive (MOVER A LA PAPELERA - Safer Delete)
        await drive.files.update({
            fileId: materiaData.drive_folder_id,
            resource: { trashed: true }
        });
        
        res.status(200).send({ message: 'Materia eliminada (enviada a la papelera de Drive) y borrada de la base de datos.' });

    } catch (error) {
        console.error("Error en deleteMateria:", error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});

// -- 6.4 GESTIÓN DE ESTUDIANTES (MATRÍCULA EN SHEETS) --
functions.http('addStudentsToMateria', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        const user = await getAuthenticatedUser(req);
        const { materiaDbId, students } = req.body;

        if (!materiaDbId || !students || students.length === 0) return res.status(400).send({ message: 'Datos de materia o estudiantes incompletos.' });

        // 1. Verificar propiedad y obtener sheets IDs de todas las unidades
        const { data: unidadesData, error: fetchError } = await supabase
            .from('materias')
            .select('unidades (asistencia_sheet_id, actividades_sheet_id, reportes_sheet_id, evaluaciones_sheet_id)')
            .eq('id', materiaDbId)
            .eq('docente_id', user.id) // Seguridad
            .single();

        if (fetchError || !unidadesData) throw new Error('Materia no encontrada o no autorizada.');

        // 2. Preparar datos para escribir (solo Matrícula y Nombre)
        const studentValues = students.map(s => [s.matricula, s.nombre]);
        
        // 3. Escribir estudiantes en CADA hoja de unidad (Columnas A y B)
        // Obtenemos todos los IDs de Sheets de todas las unidades
        const allSheetIds = unidadesData.unidades.flatMap(u => [
            u.asistencia_sheet_id, 
            u.actividades_sheet_id, 
            u.reportes_sheet_id, 
            u.evaluaciones_sheet_id
        ]);
        
        for (const sheetId of allSheetIds) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: 'A2', 
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: studentValues }
            });
        }
        
        res.status(200).send({ message: `Se matricularon ${students.length} estudiantes y se actualizaron ${allSheetIds.length} hojas.` });

    } catch (error) {
        console.error("Error en addStudentsToMateria:", error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});


// -- 6.5 GESTIÓN DE ASISTENCIA QR (GENERAR CÓDIGO) --
functions.http('generateAttendanceCode', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        await getAuthenticatedUser(req); // Solo el docente autenticado puede generar el código
        const { sheetId } = req.body;
        if (!sheetId) return res.status(400).send({ message: 'Se requiere "sheetId".' });

        // 1. Generar código y timestamp
        const attendanceCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const timestamp = Date.now().toString();

        // 2. Almacenar la sesión en las propiedades del archivo de Drive
        await drive.files.update({
            fileId: sheetId,
            requestBody: {
                properties: { 'attendance_code': attendanceCode, 'session_start_time': timestamp }
            }
        });
        
        res.status(200).send({ message: 'Código de asistencia generado.', attendanceCode: attendanceCode });

    } catch (error) {
        console.error(`Error al generar el código de asistencia para ${req.body.sheetId}:`, error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});

// -- 6.6 GESTIÓN DE ASISTENCIA QR (REGISTRAR ALUMNO) --
functions.http('registerAttendance', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
        const { attendanceCode, matricula } = req.body;
        if (!attendanceCode || !matricula) return res.status(400).send({ message: 'Se requiere "attendanceCode" y "matricula".' });

        // 1. Buscar archivo de asistencia con el código activo y propiedades
        const query = `properties has { key='attendance_code' and value='${attendanceCode}' } and trashed=false`;
        const fileResponse = await drive.files.list({
            q: query, fields: 'files(id, properties)', spaces: 'drive',
        });

        if (fileResponse.data.files.length === 0) return res.status(404).send({ message: 'Código de asistencia no válido o la sesión no está activa.' });

        const sheetFile = fileResponse.data.files[0];
        const sheetId = sheetFile.id;
        const sessionStartTime = parseInt(sheetFile.properties.session_start_time, 10);
        
        // 2. Validar que la sesión no haya expirado (15 minutos)
        const SESSION_DURATION_MS = 15 * 60 * 1000;
        if (Date.now() - sessionStartTime > SESSION_DURATION_MS) {
            return res.status(403).send({ message: 'La sesión de asistencia ha expirado. Contacta a tu docente.' });
        }

        // 3. Escribir la matrícula y el timestamp en la hoja de cálculo
        const timestamp = new Date().toLocaleString('es-MX'); 
        const values = [[matricula, timestamp]]; // Registra Matrícula y Timestamp (se asume que es una nueva columna por día en initAsistenciaSheet)
        
        // NOTA: Para un registro de asistencia por día, necesitaríamos encontrar la columna 
        // de la fecha actual. Aquí, simplemente anexamos una nueva fila, asumiendo que 
        // el frontend/post-proceso se encarga de la lógica Matrícula vs Columna Día.
        // Para simplificar la conexión al frontend, usaremos la función append (nueva fila).
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'A1', // Escribe al final de la hoja, a partir de la columna A
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: values },
        });
        
        res.status(200).send({ message: `¡Asistencia registrada con éxito para la matrícula ${matricula}!` });

    } catch (error) {
        console.error('Error al registrar la asistencia:', error);
        res.status(500).send({ message: 'Error interno del servidor al registrar la asistencia.' });
    }
});


// -- 6.7 GESTIÓN DE MATERIAL DIDÁCTICO (LISTAR ARCHIVOS) --
functions.http('listUnitFiles', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        await getAuthenticatedUser(req); // Solo docentes autenticados
        const { folderId } = req.body;
        if (!folderId) return res.status(400).send({ message: 'Se requiere "folderId".' });

        const query = `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`; // Excluye subcarpetas
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, webViewLink, iconLink)', 
        });

        res.status(200).send(response.data.files);

    } catch (error) {
        console.error(`Error al listar los archivos de la carpeta ${req.body.folderId}:`, error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});


// -- 6.8 GESTIÓN DE MATERIAL DIDÁCTICO (PERMISOS DE ARCHIVO) --
functions.http('updateFilePermissions', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        await getAuthenticatedUser(req); // Solo docentes
        const { fileId, isPublic, allowDownload } = req.body;
        if (!fileId || isPublic === undefined || allowDownload === undefined) {
            return res.status(400).send({ message: 'Se requieren "fileId", "isPublic" y "allowDownload".' });
        }

        // 1. Gestión de visibilidad (Permiso 'anyone')
        if (isPublic) {
            await shareDriveItem(fileId, 'anyone', 'reader'); // Compartir con 'anyone'
        } else {
            // Eliminar el permiso 'anyone' (hacer privado)
            try { await drive.permissions.delete({ fileId: fileId, permissionId: 'anyone' }); } 
            catch (error) { if (error.code !== 404) throw error; } // Ignorar 404 si el permiso ya no existe
        }
        
        // 2. Gestión de descarga (Solo para archivos que NO son folders o Sheets/Docs/etc. de Google)
        // Nota: Las Hojas de Google (Sheets) requieren un manejo diferente para la descarga,
        // pero esta operación Drive.files.update sí afecta a archivos cargados (PDF, JPG, etc.).
        await drive.files.update({
            fileId: fileId,
            requestBody: {
                viewersCanCopyContent: allowDownload // Controla la descarga/copia/impresión
            }
        });
        
        res.status(200).send({ message: `Permisos del archivo ${fileId} actualizados. Público: ${isPublic}, Descarga: ${allowDownload}.` });

    } catch (error) {
        console.error(`Error al actualizar permisos del archivo ${req.body.fileId}:`, error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});


// -- 6.9 GESTIÓN DE EVALUACIONES (CREACIÓN DE FORM) --
functions.http('createEvaluationForm', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        await getAuthenticatedUser(req); // Solo docentes
        const { title, parentFolderId } = req.body;
        if (!title || !parentFolderId) return res.status(400).send({ message: 'Se requiere "title" y "parentFolderId".' });

        // 1. Crear el Google Form (se crea en la raíz por defecto)
        const form = await forms.forms.create({
            requestBody: {
                info: { title: title, documentTitle: title }
            }
        });

        const formId = form.data.formId;
        const formUrl = form.data.responderUri;
        
        // 2. Mover el formulario a la carpeta de la unidad
        const file = await drive.files.get({ fileId: formId, fields: 'parents' });
        await drive.files.update({
            fileId: formId,
            addParents: parentFolderId,
            removeParents: file.data.parents.join(','), 
            fields: 'id, parents'
        });
        
        res.status(200).send({
            message: 'Evaluación creada exitosamente.',
            formId: formId,
            formUrl: formUrl
        });

    } catch (error) {
        console.error(`Error al crear la evaluación:`, error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});

// -- 6.10 UTILIDAD (LEER DATOS DE SHEET) --
functions.http('getSheetData', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        // No requiere autenticación si la hoja fue compartida públicamente o con el usuario autenticado
        const { sheetId, range } = req.body; 
        if (!sheetId) return res.status(400).send({ message: 'Se requiere "sheetId".' });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: range || 'A1:Z', 
        });

        res.status(200).send(response.data.values || []);

    } catch (error) {
        console.error(`Error al leer los datos del Sheet ${req.body.sheetId}:`, error);
        res.status(500).send({ message: 'Error interno del servidor al leer la hoja de cálculo.' });
    }
});

// -- 6.11 UTILIDAD (ESCRIBIR DATOS EN SHEET) --
functions.http('updateSheetData', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
        await getAuthenticatedUser(req); // Solo docentes
        const { sheetId, range, values } = req.body;
        if (!sheetId || !range || !values) return res.status(400).send({ message: 'Se requiere "sheetId", "range" y "values".' });

        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: values },
        });
        
        res.status(200).send({ message: 'Datos actualizados exitosamente.', updatedRange: response.data.updatedRange });

    } catch (error) {
        console.error(`Error al escribir en el Sheet ${req.body.sheetId}:`, error);
        const status = error.message.includes('autenticación') ? 401 : 500; 
        res.status(status).send({ message: `Error: ${error.message}` }); 
    }
});
