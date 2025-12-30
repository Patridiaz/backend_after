# Sistema de Gestión de Talleres - Documentación API v2

## 🔐 Autenticación

### Sistema Dual de Autenticación

El sistema maneja dos tipos de usuarios desde dos bases de datos diferentes:

1. **Profesores y Administradores** → BD `ticket-service`
2. **Apoderados** → BD `bd_after` (tabla `Apoderado`)

### Endpoint de Login

**POST** `/api/auth/login`

**Body:**

```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña_o_rut"
}
```

**Respuesta Exitosa (Profesor):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "nombre": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "roles": ["Profesor"],
    "tipo": "Profesor"
  }
}
```

**Respuesta Exitosa (Apoderado):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 5,
    "nombre": "Pedro González",
    "email": "pedro@ejemplo.com",
    "telefono": "+56912345678",
    "rut": "12345678-9",
    "roles": ["APODERADO"],
    "tipo": "APODERADO",
    "pupilos": [
      {
        "id": 10,
        "nombre": "María González López",
        "rut": "23456789-0",
        "curso": "3° Básico",
        "talleres": [
          {
            "id": 1,
            "nombre": "Fútbol Infantil",
            "sede": "Sede Central",
            "horario": "Lunes y Miércoles 15:00-16:30"
          }
        ]
      }
    ]
  }
}
```

---

## 📝 Inscripciones

### Inscribir Alumno (Actualizado)

**POST** `/api/inscripciones/nueva`

**Body:**

```json
{
  "rut": "23456789-0",
  "nombres": "María",
  "apellidos": "González López",
  "fechaNacimiento": "2015-05-20",
  "nombreApoderado": "Pedro González",
  "rutApoderado": "12345678-9",
  "telefonoApoderado": "+56912345678",
  "emailApoderado": "pedro@ejemplo.com",
  "tallerId": 1
}
```

**Respuesta:**

```json
{
  "message": "Inscripción exitosa. El apoderado puede iniciar sesión con: Email: pedro@ejemplo.com y Contraseña: 12345678-9",
  "inscripcionId": 1,
  "apoderado": {
    "email": "pedro@ejemplo.com",
    "nombre": "Pedro González"
  }
}
```

**Nota:**

- Si el apoderado ya existe (por RUT), se reutiliza.
- Si el alumno ya existe, se vincula al apoderado actual.
- La contraseña del apoderado es su propio RUT (hasheado).

---

## 👨‍👩‍👧‍👦 Endpoints para Apoderados

**Requiere:** Token JWT con `tipo: "APODERADO"`

### Ver Mis Pupilos

**GET** `/api/apoderado/mis-pupilos`

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
[
  {
    "id": 10,
    "rut": "23456789-0",
    "nombres": "María",
    "apellidos": "González López",
    "curso": "3° Básico",
    "fechaNacimiento": "2015-05-20T00:00:00.000Z"
  },
  {
    "id": 11,
    "rut": "23456789-1",
    "nombres": "Juan",
    "apellidos": "González López",
    "curso": "5° Básico",
    "fechaNacimiento": "2013-03-15T00:00:00.000Z"
  }
]
```

### Ver Talleres de Mis Pupilos

**GET** `/api/apoderado/talleres`

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
[
  {
    "alumno": {
      "id": 10,
      "nombre": "María González López",
      "rut": "23456789-0"
    },
    "talleres": [
      {
        "id": 1,
        "nombre": "Fútbol Infantil",
        "horario": "Lunes y Miércoles 15:00-16:30",
        "sede": "Sede Central"
      }
    ]
  },
  {
    "alumno": {
      "id": 11,
      "nombre": "Juan González López",
      "rut": "23456789-1"
    },
    "talleres": [
      {
        "id": 2,
        "nombre": "Básquetbol",
        "horario": "Martes y Jueves 16:00-17:30",
        "sede": "Sede Norte"
      }
    ]
  }
]
```

### Ver Asistencia de Mis Pupilos

**GET** `/api/apoderado/asistencia`

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
[
  {
    "alumno": {
      "id": 10,
      "nombre": "María González López",
      "rut": "23456789-0"
    },
    "resumen": {
      "totalClases": 10,
      "presentes": 8,
      "porcentaje": "80.0"
    },
    "detalle": [
      {
        "fecha": "2024-01-15T00:00:00.000Z",
        "estado": "P",
        "taller": "Fútbol Infantil"
      },
      {
        "fecha": "2024-01-13T00:00:00.000Z",
        "estado": "P",
        "taller": "Fútbol Infantil"
      }
    ]
  }
]
```

### Ver Mi Perfil

**GET** `/api/apoderado/perfil`

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
{
  "id": 5,
  "rut": "12345678-9",
  "nombre": "Pedro González",
  "email": "pedro@ejemplo.com",
  "telefono": "+56912345678",
  "createdAt": "2024-01-10T00:00:00.000Z",
  "_count": {
    "alumnos": 2
  }
}
```

---

## 👨‍🏫 Endpoints para Profesores

(Sin cambios - ver documentación anterior)

---

## 🔧 Endpoints de Administración

**Requiere:** Token JWT con rol `Admin`

### Crear Sede

**POST** `/api/talleres/sede`

**Headers:**

```
Authorization: Bearer <token>
```

**Body:**

```json
{
  "nombre": "Sede Sur",
  "direccion": "Av. Sur 456"
}
```

### Crear Taller

**POST** `/api/talleres/nuevo`

**Headers:**

```
Authorization: Bearer <token>
```

**Body:**

```json
{
  "nombre": "Natación Infantil",
  "descripcion": "Clases de natación para niños de 6 a 10 años",
  "edadMinima": 6,
  "edadMaxima": 10,
  "horario": "Lunes y Miércoles 14:00-15:00",
  "cuposTotales": 20,
  "sedeId": 1
}
```

### Asignar Profesor a Taller

**POST** `/api/talleres/asignar-profesor`

**Headers:**

```
Authorization: Bearer <token>
```

**Body:**

```json
{
  "usuarioId": 5,
  "tallerId": 1
}
```

**Nota:** `usuarioId` es el ID del profesor en la base de datos `ticket-service`.

### Listar Todos los Talleres

**GET** `/api/talleres/admin/todos`

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
[
  {
    "id": 1,
    "nombre": "Fútbol Infantil",
    "descripcion": "Taller de fútbol",
    "horario": "Lunes y Miércoles 15:00-16:30",
    "cuposTotales": 20,
    "cuposDisponibles": 5,
    "sede": {
      "id": 1,
      "nombre": "Sede Central"
    },
    "profesores": [
      {
        "id": 1,
        "usuarioId": 5,
        "tallerId": 1
      }
    ],
    "_count": {
      "inscripciones": 15
    }
  }
]
```

### Listar Profesores Disponibles

**GET** `/api/talleres/admin/profesores`

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
[
  {
    "id": 5,
    "email": "profesor1@ejemplo.com",
    "name": "Carlos Rodríguez",
    "isActive": true
  },
  {
    "id": 6,
    "email": "profesor2@ejemplo.com",
    "name": "Ana Martínez",
    "isActive": true
  }
]
```

---

## 🔑 Estructura del Token JWT

```json
{
  "email": "usuario@ejemplo.com",
  "sub": 1,
  "roles": ["APODERADO"],
  "nombre": "Pedro González",
  "tipo": "APODERADO",
  "pupilosIDs": [10, 11],
  "iat": 1234567890,
  "exp": 1234654290
}
```

**Campos:**

- `email`: Email del usuario
- `sub`: ID del usuario
- `roles`: Array de roles
- `nombre`: Nombre completo
- `tipo`: `"Profesor"`, `"Admin"` o `"APODERADO"`
- `pupilosIDs`: Solo para apoderados - IDs de sus hijos
- `iat`: Timestamp de creación
- `exp`: Timestamp de expiración (8 horas)

---

## 🚀 Flujo de Uso

### Para Apoderados:

1. **Inscribir hijo(s)** → `/api/inscripciones/nueva` (puede hacerse varias veces con el mismo `rutApoderado`)
2. **Login** → `/api/auth/login` (Email del apoderado + RUT del apoderado)
3. **Ver hijos** → `/api/apoderado/mis-pupilos`
4. **Ver talleres** → `/api/apoderado/talleres`
5. **Ver asistencia** → `/api/apoderado/asistencia`

### Para Administradores:

1. **Login** → `/api/auth/login`
2. **Crear sedes** → `/api/talleres/sede`
3. **Crear talleres** → `/api/talleres/nuevo`
4. **Listar profesores** → `/api/talleres/admin/profesores`
5. **Asignar profesores** → `/api/talleres/asignar-profesor`

---

## ⚠️ Códigos de Error

- `400 Bad Request`: Datos inválidos o cupos agotados
- `401 Unauthorized`: Token inválido o expirado
- `403 Forbidden`: Acceso denegado (rol incorrecto)
- `404 Not Found`: Recurso no encontrado
- `409 Conflict`: Conflicto (ej: alumno ya inscrito, profesor ya asignado)

---

## 🔧 Variables de Entorno

```env
DATABASE_URL="sqlserver://host:port;database=bd_after;user=usuario;password=pass;encrypt=false;trustServerCertificate=true"
JWT_SECRET="DKJJDAJDAJWDJKAJDKAJKDJAWWD"
PORT=3000
```
