import 'dotenv/config';
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

async function main() {
  try {
    console.log("Fetching columns for Establecimiento...");
    const columnsEst = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'Establecimiento'`
    );
    console.log("Establecimiento:", columnsEst);

  } catch (error) {
    console.error("ERROR:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
