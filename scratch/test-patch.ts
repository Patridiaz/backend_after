import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not defined');
}

const urlMatch = connectionString.match(/sqlserver:\/\/([^:]+):(\d+);/);
const dbMatch = connectionString.match(/database=([^;]+)/);
const userMatch = connectionString.match(/user=([^;]+)/);
const passwordMatch = connectionString.match(/password=([^;]+)/);
const encryptMatch = connectionString.match(/encrypt=([^;]+)/);
const trustCertMatch = connectionString.match(/trustServerCertificate=([^;]+)/);

const config = {
  server: urlMatch ? urlMatch[1] : 'localhost',
  port: urlMatch ? parseInt(urlMatch[2]) : 1433,
  database: dbMatch ? dbMatch[1] : '',
  user: userMatch ? userMatch[1] : '',
  password: passwordMatch ? passwordMatch[1] : '',
  options: {
    encrypt: encryptMatch ? encryptMatch[1] === 'true' : false,
    trustServerCertificate: trustCertMatch ? trustCertMatch[1] === 'true' : true,
  },
};

const adapter = new PrismaMssql(config);
const prisma = new PrismaClient({ adapter });

const jwtService = new JwtService({ secret: 'DKJJDAJDAJWDJKAJDKAJKDJAWWD' });
const token = jwtService.sign({ sub: 1, nombre: 'Test Admin', roles: ['ADMIN'] });

async function run() {
  // 1. Create a dummy apoderado with a unique email for testing duplicate constraints
  const duplicateEmail = `test-dup-${Date.now()}@example.com`;
  console.log("Creating dummy apoderado with email:", duplicateEmail);
  await prisma.apoderado.create({
    data: {
      rut: `99999999-${Math.floor(Math.random() * 1000)}`,
      nombre: "DUMMY DUPLICATE",
      email: duplicateEmail,
      telefono: "123456789",
      password: "password123"
    }
  });

  const payload = {
    alumno: {
      rut: "249994847",
      nombres: "ELENA ISABEL",
      apellidos: "VILLASECA CATALÁN",
      establecimientoNombre: "Colegio politécnico particular de conchali"
    },
    apoderado: {
      rut: "153688265",
      nombre: "ELIZABETH ANDREA GUZMAN BASUALTO",
      email: duplicateEmail, // This will trigger the unique constraint violation!
      telefono: "974768756"
    },
    salud: {
      enfermedadCronica: false,
      enfermedadCronicaDetalle: "",
      tratamientoMedico: "",
      alergias: "",
      necesidadesEspeciales: false,
      necesidadesEspecialesDetalle: "",
      apoyoEscolar: "No",
      activo: true
    },
    parentesco: "Madre"
  };

  try {
    console.log("Sending PATCH request with duplicate apoderado email...");
    const response = await fetch("http://localhost:3007/api/inscripciones/admin/ficha/INSCRITO/933", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    console.log("Response status:", response.status);
    const bodyText = await response.text();
    console.log("Response body:", bodyText);
  } catch (error) {
    console.error("Fetch failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
