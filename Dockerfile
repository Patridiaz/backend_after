# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copiar archivos de dependencias y esquemas de Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instalar todas las dependencias
RUN npm ci

# Copiar código fuente y archivos de configuración
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY prisma.config.ts ./

# Generar cliente de Prisma y compilar la aplicación
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# Instalar solo dependencias de producción y generar Prisma Client
RUN npm ci --only=production && npx prisma generate

# Copiar el código compilado desde la etapa builder
COPY --from=builder /usr/src/app/dist ./dist

# Puerto expuesto por la aplicación NestJS
EXPOSE 3007

# Comando para iniciar la aplicación en producción
CMD ["sh", "-c", "if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi"]
