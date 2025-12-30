BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Sede] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(1000) NOT NULL,
    [direccion] NVARCHAR(1000),
    CONSTRAINT [Sede_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Taller] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(1000) NOT NULL,
    [descripcion] VARCHAR(500),
    [edadMinima] INT NOT NULL,
    [edadMaxima] INT NOT NULL,
    [horario] NVARCHAR(1000) NOT NULL,
    [cuposTotales] INT NOT NULL,
    [cuposDisponibles] INT NOT NULL,
    [sedeId] INT NOT NULL,
    CONSTRAINT [Taller_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Alumno] (
    [id] INT NOT NULL IDENTITY(1,1),
    [rut] NVARCHAR(1000) NOT NULL,
    [nombres] NVARCHAR(1000) NOT NULL,
    [apellidos] NVARCHAR(1000) NOT NULL,
    [fechaNacimiento] DATETIME2 NOT NULL,
    [curso] NVARCHAR(1000),
    [password] NVARCHAR(1000) NOT NULL,
    [nombreApoderado] NVARCHAR(1000) NOT NULL,
    [telefonoApoderado] NVARCHAR(1000) NOT NULL,
    [emailApoderado] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Alumno_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Alumno_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Alumno_rut_key] UNIQUE NONCLUSTERED ([rut])
);

-- CreateTable
CREATE TABLE [dbo].[Inscripcion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [fecha] DATETIME2 NOT NULL CONSTRAINT [Inscripcion_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [alumnoId] INT NOT NULL,
    [tallerId] INT NOT NULL,
    CONSTRAINT [Inscripcion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Inscripcion_alumnoId_tallerId_key] UNIQUE NONCLUSTERED ([alumnoId],[tallerId])
);

-- CreateTable
CREATE TABLE [dbo].[ProfesorTaller] (
    [id] INT NOT NULL IDENTITY(1,1),
    [usuarioId] INT NOT NULL,
    [tallerId] INT NOT NULL,
    CONSTRAINT [ProfesorTaller_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProfesorTaller_usuarioId_tallerId_key] UNIQUE NONCLUSTERED ([usuarioId],[tallerId])
);

-- CreateTable
CREATE TABLE [dbo].[Asistencia] (
    [id] INT NOT NULL IDENTITY(1,1),
    [fecha] DATETIME2 NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL,
    [alumnoId] INT NOT NULL,
    [tallerId] INT NOT NULL,
    [registradoPor] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Asistencia_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Asistencia_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Asistencia_tallerId_alumnoId_fecha_key] UNIQUE NONCLUSTERED ([tallerId],[alumnoId],[fecha])
);

-- AddForeignKey
ALTER TABLE [dbo].[Taller] ADD CONSTRAINT [Taller_sedeId_fkey] FOREIGN KEY ([sedeId]) REFERENCES [dbo].[Sede]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Inscripcion] ADD CONSTRAINT [Inscripcion_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Inscripcion] ADD CONSTRAINT [Inscripcion_tallerId_fkey] FOREIGN KEY ([tallerId]) REFERENCES [dbo].[Taller]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProfesorTaller] ADD CONSTRAINT [ProfesorTaller_tallerId_fkey] FOREIGN KEY ([tallerId]) REFERENCES [dbo].[Taller]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Asistencia] ADD CONSTRAINT [Asistencia_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Asistencia] ADD CONSTRAINT [Asistencia_tallerId_fkey] FOREIGN KEY ([tallerId]) REFERENCES [dbo].[Taller]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
