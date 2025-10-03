// estudiante.js - VERSIÓN FINAL Y COMPLETA

// --- CONEXIÓN CON SUPABASE ---
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('Panel de estudiante conectado.');

// --- ELEMENTOS DEL DOM ---
const loginEstudianteDiv = document.querySelector('#login-estudiante');
const panelPrincipalEstudianteDiv = document.querySelector('#panel-principal-estudiante');
const formLoginEstudiante = document.querySelector('#form-login-estudiante');
const codigoMateriaInput = document.querySelector('#codigo-materia');
const matriculaEstudianteInput = document.querySelector('#matricula-estudiante');
const loginErrorMessage = document.querySelector('#login-error-message');
const nombreEstudianteSpan = document.querySelector('#nombre-estudiante');
const nombreMateriaEstudianteSpan = document.querySelector('#nombre-materia-estudiante');
const btnLogoutEstudiante = document.querySelector('#btn-logout-estudiante');
const unidadSelectEstudiante = document.querySelector('#unidad-select-estudiante');
const calificacionesContenido = document.querySelector('#calificaciones-contenido');
const materialContenido = document.querySelector('#material-contenido');

// --- LÓGICA DE SESIÓN ---

// Al cargar la página, revisamos si ya hay una sesión activa en sessionStorage
document.addEventListener('DOMContentLoaded', () => {
    const sesion = JSON.parse(sessionStorage.getItem('sesionEstudiante'));
    if (sesion) {
        // Si existe una sesión, mostramos el panel principal directamente
        mostrarPanelPrincipal(sesion.alumno, sesion.materia);
    }
});

const iniciarSesion = async (event) => {
    event.preventDefault();
    loginErrorMessage.textContent = '';
    const codigoMateria = codigoMateriaInput.value.trim();
    const matricula = matriculaEstudianteInput.value.trim();
    if (!codigoMateria || !matricula) {
        loginErrorMessage.textContent = 'Ambos campos son obligatorios.';
        return;
    }
    try {
        // 1. Validar que la materia exista usando el código (ID)
        const { data: materia, error: errorMateria } = await supabase
            .from('Materias')
            .select('*')
            .eq('id', codigoMateria)
            .single();

        if (errorMateria || !materia) {
            throw new Error('El código de la materia no es válido.');
        }

        // 2. Validar que el alumno exista en esa materia con esa matrícula
        const { data: alumno, error: errorAlumno } = await supabase
            .from('Alumnos')
            .select('*')
            .eq('materia_id', codigoMateria)
            .eq('matricula', matricula)
            .single();
        
        if (errorAlumno || !alumno) {
            throw new Error('Matrícula no encontrada para esta materia.');
        }

        // 3. Si todo es correcto, guardamos la sesión en sessionStorage y mostramos el panel
        const sesion = { alumno, materia };
        sessionStorage.setItem('sesionEstudiante', JSON.stringify(sesion));
        mostrarPanelPrincipal(alumno, materia);

    } catch (error) {
        loginErrorMessage.textContent = error.message;
    }
};

const cerrarSesion = () => {
    sessionStorage.removeItem('sesionEstudiante');
    window.location.reload(); // Recargamos la página para volver al estado inicial
};

const mostrarPanelPrincipal = (alumno, materia) => {
    loginEstudianteDiv.style.display = 'none';
    panelPrincipalEstudianteDiv.style.display = 'block';

    nombreEstudianteSpan.textContent = alumno.nombre;
    nombreMateriaEstudianteSpan.textContent = materia.nombre;

    // Llenar el selector de unidades
    unidadSelectEstudiante.innerHTML = '';
    const optionPlaceholder = document.createElement('option');
    optionPlaceholder.value = "";
    optionPlaceholder.textContent = "-- Selecciona una Unidad --";
    unidadSelectEstudiante.appendChild(optionPlaceholder);

    for (let i = 1; i <= materia.unidades; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Unidad ${i}`;
        unidadSelectEstudiante.appendChild(option);
    }
};

// --- LÓGICA PARA CARGAR DATOS DE LA UNIDAD SELECCIONADA ---
const cargarDatosDeUnidad = async () => {
    const unidadSeleccionada = unidadSelectEstudiante.value;
    const sesion = JSON.parse(sessionStorage.getItem('sesionEstudiante'));

    if (!unidadSeleccionada || !sesion) {
        calificacionesContenido.innerHTML = '<p>Selecciona una unidad para ver tu progreso.</p>';
        materialContenido.innerHTML = '<p>Selecciona una unidad para ver el material.</p>';
        return;
    }

    calificacionesContenido.innerHTML = `<p>Calculando progreso...</p>`;
    materialContenido.innerHTML = `<p>Cargando material...</p>`;
    
    // Llamamos a las funciones para cargar los datos de forma asíncrona
    await cargarProgresoEstudiante(sesion.alumno, sesion.materia, unidadSeleccionada);
    await cargarMaterialDidactico(sesion.materia.id);
};

const cargarProgresoEstudiante = async (alumno, materia, unidad) => {
    try {
        // --- 1. Obtener la calificación final (si existe) ---
        const { data: califData, error: errorCalif } = await supabase
            .from('CalificacionesUnidad')
            .select('calificacion_final')
            .eq('alumno_id', alumno.id)
            .eq('materia_id', materia.id)
            .eq('unidad', unidad)
            .single();
        
        // --- 2. Simulación del desglose de progreso ---
        // Una implementación real y eficiente requeriría una Edge Function
        
        let html = '';
        if (califData) {
            html += `
                <div style="text-align: center; margin-bottom: 20px;">
                    <h4>Calificación Final de la Unidad:</h4>
                    <p style="font-size: 2.5em; color: #007bff; margin: 0;">${califData.calificacion_final}</p>
                </div>
                <hr>
            `;
        } else {
            html += '<p>La calificación final de la unidad aún no ha sido calculada por el docente.</p>';
        }

        html += `
            <h4>Desglose de Progreso (Simulación):</h4>
            <p><strong>Asistencias:</strong> 85%</p>
            <p><strong>Actividades:</strong> 92%</p>
            <p><strong>Reportes:</strong> 78%</p>
            <p><strong>Evaluaciones:</strong> (No disponible)</p>
        `;

        calificacionesContenido.innerHTML = html;

    } catch (error) {
        calificacionesContenido.innerHTML = '<p>No se pudo cargar la información de progreso.</p>';
        console.error("Error cargando progreso:", error);
    }
};

const cargarMaterialDidactico = async (materiaId) => {
    // Leemos de nuestra tabla de permisos qué archivos son visibles
    const { data: permisos, error: errorPermisos } = await supabase
        .from('MaterialDidactico')
        .select('file_id, es_visible, permite_descarga')
        .eq('materia_id', materiaId)
        .eq('es_visible', true);

    if (errorPermisos || !permisos || permisos.length === 0) {
        materialContenido.innerHTML = '<p>No hay material disponible para esta materia.</p>';
        return;
    }
    
    // Por seguridad, no podemos llamar a la API de Drive desde aquí.
    // Una implementación futura con backend (Edge Function) podría obtener los nombres y links.
    materialContenido.innerHTML = '';
    permisos.forEach(permiso => {
        const div = document.createElement('div');
        div.className = 'material-item-estudiante';
        
        div.innerHTML = `📄 Archivo disponible (ID: ...${permiso.file_id.slice(-8)})`;
        materialContenido.appendChild(div);
    });
};


// --- EVENTOS ---
formLoginEstudiante.addEventListener('submit', iniciarSesion);
btnLogoutEstudiante.addEventListener('click', cerrarSesion);
unidadSelectEstudiante.addEventListener('change', cargarDatosDeUnidad);