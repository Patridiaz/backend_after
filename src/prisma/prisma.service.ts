import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Parse the connection string
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not defined');
    }
    
    // Extract connection details from the connection string
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
    
    // Create adapter with the config
    const adapter = new PrismaMssql(config);
    
    // Call super with the adapter
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}