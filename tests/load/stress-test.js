import http from 'k6/http';
import { check, sleep } from 'k6';

// --- ESCENARIO DE CARGA CONTROLADA ---
export const options = {
  insecureSkipTLSVerify: true, 
  stages: [
    { duration: '10s', target: 300 }, // Subida suave a 100 personas
    { duration: '20s', target: 300 }, 
    { duration: '10s', target: 0 },   
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // Toleramos hasta 1.5s bajo carga
    http_req_failed: ['rate<0.10'],    // Permitimos hasta 10% de fallos bajo estrés
  },
};

const BASE_URL = 'http://localhost:3007/api';

export default function () {
  const randomId = Math.floor(Math.random() * 9000000) + 1000000;
  const rutStr = `22${randomId}K`;
  const tallerId = Math.floor(Math.random() * 5) + 1;

  const payload = JSON.stringify({
    rut: rutStr,
    nombres: `TestLoadVU ${__VU}`,
    apellidos: `Iteration ${__ITER}`,
    fechaNacimiento: '2015-05-20',
    tallerId: tallerId,
    rutApoderado: `12345${__VU}K`,
    nombreApoderado: 'Apoderado LoadTest',
    emailApoderado: `ltest${__VU}_${Date.now()}@after.cl`, // Email único por milisegundos
    telefonoApoderado: '912345678',
    parentesco: 'PADRE',
    enfermedadCronica: false,
    usoImagen: true
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(`${BASE_URL}/inscripciones/nueva`, payload, params);
  
  check(res, {
    'Éxito (201/202)': (r) => r.status === 201 || r.status === 202,
  });

  sleep(Math.random() * 2 + 1); 
}
