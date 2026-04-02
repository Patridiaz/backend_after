import http from 'k6/http';
import { check, sleep } from 'k6';

// --- CONFIGURACIÓN DEL ESCENARIO DE ALTO RENDIMIENTO ---
export const options = {
  insecureSkipTLSVerify: true, 
  stages: [
    { duration: '15s', target: 300 }, // Escala brutal a 300 usuarios en 15 segundos
    { duration: '30s', target: 300 }, // Mantiene la presión de 300 personas
    { duration: '15s', target: 0 },   // Baja a 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'], // El 95% debe responder en menos de 800ms
    http_req_failed: ['rate<0.05'],   // Menos del 5% de errores permitidos bajo carga extrema
  },
};

const BASE_URL = 'http://localhost:3007/api'; // Usamos localhost para máxima velocidad en el test

export default function () {
  // Generamos datos aleatorios por cada "persona" en el test
  const randomId = Math.floor(Math.random() * 900000) + 100000;
  const rutStr = `22${randomId}K`;
  const tallerId = Math.floor(Math.random() * 10) + 1; // Repartir entre talleres 1 al 10

  // Datos de la inscripción
  const payload = JSON.stringify({
    rut: rutStr,
    nombres: `TestLoadVU ${__VU}`,
    apellidos: `Iteration ${__ITER}`,
    fechaNacimiento: '2015-05-20',
    tallerId: tallerId,
    rutApoderado: `12345${__VU}K`,
    nombreApoderado: 'Apoderado LoadTest',
    emailApoderado: `loadtest_${__VU}@afterschool.cl`,
    telefonoApoderado: '912345678',
    parentesco: 'PADRE',
    enfermedadCronica: false,
    usoImagen: true
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  // Acción principal: Intento de Inscripción
  const res = http.post(`${BASE_URL}/inscripciones/nueva`, payload, params);
  
  // Imprimir alerta si hay un error grave (500)
  if (res.status >= 500) {
    console.error(`🔴 ERROR CRÍTICO NO SE ESPERABA: Status ${res.status} - Body: ${res.body}`);
  }

  // Verificamos éxito empresarial (201: Inscrito, 202: Lista de Espera)
  check(res, {
    'Status es 201 o 202': (r) => r.status === 201 || r.status === 202,
    'Tiempo de respuesta < 1s': (r) => r.timings.duration < 1000,
  });

  // El usuario tarda un poco entre leer y decidir (Opcional)
  sleep(Math.random() * 1 + 1); 
}
