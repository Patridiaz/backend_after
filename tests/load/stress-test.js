import http from 'k6/http';
import { check, sleep } from 'k6';

// --- CONFIGURACIÓN DEL ESCENARIO ---
export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Escalar a 50 usuarios concurrentes
    { duration: '1m', target: 50 },  // Mantener 50 usuarios
    { duration: '30s', target: 0 },  // Bajar a 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // El 95% de las peticiones debe tardar menos de 500ms
    http_req_failed: ['rate<0.01'],   // Menos del 1% de errores permitidos
  },
};

// --- DATOS DE PRUEBA ---
const BASE_URL = 'https://after.eduhuechuraba.cl/api'; // URL de tu VPS

export default function () {
  const randomRut = Math.floor(Math.random() * 9000000) + 10000000;
  const rutStr = `${randomRut}K`;

  // 1. Simular búsqueda de alumno (LECTURA)
  const resVerificar = http.get(`${BASE_URL}/inscripciones/verificar-alumno/${rutStr}`);
  check(resVerificar, {
    'verificar status es 200': (r) => r.status === 200,
  });

  sleep(1); // Pausa de 1 segundo entre acciones del "usuario"

  // 2. Simular intento de inscripción (ESCRITURA CON TRANSACCIÓN)
  // Nota: Esto generará datos reales en tu DB local.
  const payload = JSON.stringify({
    rut: rutStr,
    nombres: 'TEST LOAD',
    apellidos: 'USER K6',
    fechaNacimiento: '2015-05-20',
    establecimientoNombre: 'SEDE TEST LOAD',
    telefono: '999999999',
    rutApoderado: '11111111-1',
    nombreApoderado: 'APODERADO TEST',
    telefonoApoderado: '988888888',
    emailApoderado: `test_${__VU}@example.com`,
    parentesco: 'Padre',
    tallerId: 51, // <--- ASEGÚRATE DE QUE ESTE ID EXISTA Y TENGA CUPOS
    enfermedadCronica: false,
    usoImagen: true
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const resInscribir = http.post(`${BASE_URL}/inscripciones/nueva`, payload, params);
  
  // Imprimir error si falla (muy útil para debuggear carga)
  if (resInscribir.status !== 201) {
    console.warn(`❌ Fallo en iteración ${__ITER}: Status ${resInscribir.status} - Body: ${resInscribir.body}`);
  }

  check(resInscribir, {
    'inscripcion status < 500': (r) => r.status < 500,
    'inscripcion fue exitosa (201)': (r) => r.status === 201,
  });

  sleep(2);
}
