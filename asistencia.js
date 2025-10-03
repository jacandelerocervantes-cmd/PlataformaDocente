// asistencia.js - Lógica para el panel del alumno

// --- CONEXIÓN CON SUPABASE ---
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ELEMENTOS DEL DOM ---
const mensaje = document.querySelector('#mensaje');
const form = document.querySelector('#form-registro-asistencia');
const inputMatricula = document.querySelector('#matricula');
const botonRegistrar = form.querySelector('button');

let sesionToken = null;

// --- LÓGICA PRINCIPAL ---

// 1. Al cargar la página, obtenemos y validamos el token de la URL
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenString = urlParams.get('token');

    if (!tokenString) {
        deshabilitarFormulario('Error: No se encontró un token de sesión. Acceso denegado.');
        return;
    }

    try {
        // Decodificamos y parseamos el token
        sesionToken = JSON.parse(decodeURIComponent(tokenString));
        
        // Validamos que la sesión no haya expirado
        if (Date.now() > sesionToken.exp) {
            deshabilitarFormulario('Error: La sesión de asistencia ha expirado.');
            sesionToken = null; // Invalidamos el token
        }
    } catch (error) {
        deshabilitarFormulario('Error: El token de sesión es inválido.');
        sesionToken = null;
    }
});

// 2. Manejamos el envío del formulario
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!sesionToken) {
        deshabilitarFormulario('No hay una sesión activa para registrar.');
        return;
    }

    const matricula = inputMatricula.value.trim();
    deshabilitarFormulario('Procesando tu asistencia...');

    try {
        // Buscamos al alumno por su matrícula y la materia de la sesión
        const { data: alumno, error: errorAlumno } = await supabase
            .from('Alumnos')
            .select('id') // Solo necesitamos el ID del alumno
            .eq('matricula', matricula)
            .eq('materia_id', sesionToken.materiaId)
            .single();

        if (errorAlumno || !alumno) {
            // Si no se encuentra, habilitamos el formulario para que pueda intentarlo de nuevo
            habilitarFormulario(`Error: Matrícula no encontrada para esta materia. Inténtalo de nuevo.`);
            return;
        }

        // Si encontramos al alumno, insertamos la asistencia
        const hoy = new Date().toISOString().slice(0, 10);
        const { error: errorAsistencia } = await supabase
            .from('Asistencias')
            .insert({
                alumno_id: alumno.id,
                materia_id: sesionToken.materiaId,
                fecha: hoy,
                sesion_numero: sesionToken.sesion
            });

        if (errorAsistencia) {
            // Este error puede ocurrir si el alumno ya registró asistencia hoy para esta sesión (violación de clave primaria/única)
            habilitarFormulario('Error: Ya has registrado tu asistencia para esta sesión.');
            console.error(errorAsistencia);
        } else {
            // Si todo sale bien, el formulario se queda deshabilitado con el mensaje de éxito.
            mensaje.textContent = '¡Asistencia registrada con éxito! Ya puedes cerrar esta ventana.';
        }
    } catch (error) {
        habilitarFormulario('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
        console.error("Error en el proceso de registro:", error);
    }
});

function deshabilitarFormulario(textoMensaje) {
    mensaje.textContent = textoMensaje;
    inputMatricula.disabled = true;
    botonRegistrar.disabled = true;
    botonRegistrar.style.cursor = 'not-allowed';
    botonRegistrar.style.backgroundColor = '#6c757d'; // Color gris
}

function habilitarFormulario(textoMensaje) {
    mensaje.textContent = textoMensaje;
    inputMatricula.disabled = false;
    botonRegistrar.disabled = false;
    botonRegistrar.style.cursor = 'pointer';
    botonRegistrar.style.backgroundColor = '#007bff'; // Color original
    inputMatricula.focus(); // Ponemos el foco de nuevo en el campo de matrícula
}