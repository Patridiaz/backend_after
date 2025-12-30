# Script de Migración: Alumno -> Apoderado

## ⚠️ ADVERTENCIA

Este cambio de schema requiere recrear las tablas. **SE PERDERÁN TODOS LOS DATOS EXISTENTES**.

## Opción 1: Base de Datos Vacía o de Desarrollo

Si tu base de datos no tiene datos importantes, ejecuta:

```bash
npx prisma db push --force-reset
npx prisma generate
```

## Opción 2: Migración con Datos Existentes

Si tienes datos que necesitas preservar, sigue estos pasos:

### 1. Exportar Datos Actuales (SQL Server Management Studio)

```sql
-- Exportar Alumnos
SELECT * INTO AlumnosBackup FROM Alumno;

-- Exportar Inscripciones
SELECT * INTO InscripcionesBackup FROM Inscripcion;

-- Exportar Asistencias
SELECT * INTO AsistenciasBackup FROM Asistencia;
```

### 2. Aplicar Nuevo Schema

```bash
npx prisma db push --force-reset
npx prisma generate
```

### 3. Migrar Datos (SQL)

```sql
-- Crear Apoderados únicos desde los datos de Alumno
INSERT INTO Apoderado (rut, nombre, telefono, email, password, createdAt)
SELECT DISTINCT
    CONCAT(nombreApoderado, '_', emailApoderado) as rut, -- Temporal, necesitarás RUTs reales
    nombreApoderado,
    telefonoApoderado,
    ISNULL(emailApoderado, CONCAT('apoderado', ROW_NUMBER() OVER(ORDER BY nombreApoderado), '@temp.com')),
    password, -- Reutilizamos el hash del alumno temporalmente
    GETDATE()
FROM AlumnosBackup
GROUP BY nombreApoderado, telefonoApoderado, emailApoderado, password;

-- Recrear Alumnos vinculados a Apoderados
INSERT INTO Alumno (rut, nombres, apellidos, fechaNacimiento, curso, apoderadoId, createdAt)
SELECT
    a.rut,
    a.nombres,
    a.apellidos,
    a.fechaNacimiento,
    a.curso,
    ap.id,
    a.createdAt
FROM AlumnosBackup a
JOIN Apoderado ap ON ap.email = ISNULL(a.emailApoderado, CONCAT('apoderado', a.id, '@temp.com'));

-- Recrear Inscripciones
INSERT INTO Inscripcion (alumnoId, tallerId, fecha)
SELECT
    new_a.id,
    i.tallerId,
    i.fecha
FROM InscripcionesBackup i
JOIN AlumnosBackup old_a ON i.alumnoId = old_a.id
JOIN Alumno new_a ON new_a.rut = old_a.rut;

-- Recrear Asistencias
INSERT INTO Asistencia (alumnoId, tallerId, fecha, estado, registradoPor, createdAt)
SELECT
    new_a.id,
    ast.tallerId,
    ast.fecha,
    ast.estado,
    ast.registradoPor,
    ast.createdAt
FROM AsistenciasBackup ast
JOIN AlumnosBackup old_a ON ast.alumnoId = old_a.id
JOIN Alumno new_a ON new_a.rut = old_a.rut;
```

## Opción 3: Desarrollo Limpio (RECOMENDADO)

Si estás en desarrollo y no tienes datos críticos:

```bash
npx prisma db push --force-reset --accept-data-loss
npx prisma generate
npm run start:dev
```

## Verificación Post-Migración

Después de aplicar los cambios, verifica:

1. ✅ Tabla `Apoderado` creada
2. ✅ Tabla `Alumno` actualizada con campo `apoderadoId`
3. ✅ Relaciones funcionando correctamente
4. ✅ Login de apoderado funcional

## Nuevas Credenciales de Login

Después de la migración:

- **Usuario**: Email del Apoderado
- **Contraseña**: RUT del Apoderado (sin puntos ni guión)
