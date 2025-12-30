# Plan de Implementación Frontend - Sistema de Talleres (Actualizado v2)

## 📦 Nuevas Dependencias (UX/UI)

```bash
npm install sweetalert2 @sweetalert2/ngx-sweetalert2
```

---

## 🎨 Mejora 1: Servicio de Alertas (SweetAlert2)

Crearemos un servicio centralizado para manejar todas las alertas con un diseño consistente.

**Archivo:** `src/app/core/services/alert.service.ts`

```typescript
import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  constructor() {}

  // Alerta de Éxito (ej: Guardado correctamente)
  success(title: string, message: string) {
    return Swal.fire({
      icon: 'success',
      title: title,
      text: message,
      confirmButtonColor: '#2563eb', // Azul corporativo
      timer: 2000,
      timerProgressBar: true,
    });
  }

  // Alerta de Error
  error(title: string, message: string) {
    return Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonColor: '#ef4444',
    });
  }

  // Confirmación (ej: Cerrar Sesión)
  async confirm(
    title: string,
    message: string,
    confirmText: string = 'Sí, continuar',
  ): Promise<boolean> {
    const result = await Swal.fire({
      title: title,
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#d33',
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancelar',
    });

    return result.isConfirmed;
  }

  // Loading (mientras se hace una petición)
  showLoading(title: string = 'Procesando...') {
    Swal.fire({
      title: title,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  }

  close() {
    Swal.close();
  }
}
```

---

## 🧭 Mejora 2: Navbar Inteligente y Logout

El Navbar debe reaccionar al estado de autenticación. Si el usuario no está logueado, no debe mostrar menús de navegación, solo el logo.

**Archivo:** `src/app/shared/components/navbar/navbar.component.ts`

```typescript
import { Component } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { AlertService } from '../../../core/services/alert.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  template: `
    <nav class="navbar" *ngIf="authService.currentUser$ | async as user">
      <!-- Logo siempre visible, redirige condicionalmente -->
      <div class="logo" (click)="navigateHome()">Sistema Talleres</div>

      <!-- Menú solo visible si hay usuario logueado -->
      <div class="menu-items" *ngIf="user">
        <!-- Menú Profesor -->
        <ng-container *ngIf="user.tipo === 'Profesor' || user.tipo === 'Admin'">
          <a routerLink="/profesor/dashboard">Panel</a>
          <a routerLink="/profesor/mis-talleres">Mis Talleres</a>
        </ng-container>

        <!-- Menú Alumno -->
        <ng-container *ngIf="user.tipo === 'ALUMNO'">
          <a routerLink="/alumno/dashboard">Mis Clases</a>
          <a routerLink="/alumno/asistencia">Mi Asistencia</a>
        </ng-container>

        <!-- Botón Salir -->
        <button class="btn-logout" (click)="logout()">Cerrar Sesión</button>
      </div>
    </nav>
  `,
  styles: [
    `
      .navbar {
        display: flex;
        justify-content: space-between;
        padding: 1rem;
        background: #fff;
        shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      .logo {
        font-weight: bold;
        font-size: 1.2rem;
        cursor: pointer;
      }
      .menu-items {
        display: flex;
        gap: 1rem;
        align-items: center;
      }
      .btn-logout {
        background: #fee2e2;
        color: #dc2626;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
      }
      .btn-logout:hover {
        background: #fecaca;
      }
    `,
  ],
})
export class NavbarComponent {
  constructor(
    public authService: AuthService,
    private alertService: AlertService,
    private router: Router,
  ) {}

  navigateHome() {
    if (this.authService.isAuthenticated()) {
      // Si es profesor -> Dashboard Profesor, si es alumno -> Dashboard Alumno
      const user = this.authService.getCurrentUser();
      if (user?.tipo === 'Profesor' || user?.tipo === 'Admin') {
        this.router.navigate(['/profesor/dashboard']);
      } else {
        this.router.navigate(['/alumno/dashboard']);
      }
    } else {
      // Si no está logueado -> Login (o Landing page si existiera)
      this.router.navigate(['/login']);
    }
  }

  async logout() {
    const confirmado = await this.alertService.confirm(
      '¿Cerrar Sesión?',
      '¿Estás seguro que deseas salir del sistema?',
    );

    if (confirmado) {
      this.authService.logout();
      this.alertService.success('Hasta pronto', 'Sesión cerrada correctamente');
      this.router.navigate(['/login']);
    }
  }
}
```

---

## 🔒 Mejora 3: Layout del Login

Para que el Login se vea "limpio" y sin el Navbar completo, podemos usar un layout condicional en `app.component.html` o simplemente el `*ngIf` que agregamos arriba en el Navbar hace el trabajo sucio:

**Si el usuario NO está logueado (`user` es null), el Navbar solo mostrará el logo, pero no los botones de navegación.**

Si prefieres eliminar totalmente el Navbar en el Login:

**Archivo:** `src/app/app.component.html`

```html
<!-- Mostrar Navbar solo si NO estamos en la página de login -->
<app-navbar *ngIf="!isLoginPage()"></app-navbar>

<div class="container">
  <router-outlet></router-outlet>
</div>
```

**Archivo:** `src/app/app.component.ts`

```typescript
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent {
  constructor(private router: Router) {}

  isLoginPage(): boolean {
    return this.router.url === '/login';
  }
}
```

---

## 🚀 Implementación en Componentes (Ejemplo)

**Ejemplo: Asignar Profesor con Alerta**

```typescript
// talleres.component.ts

asignarProfesor() {
  this.alertService.showLoading('Asignando...');

  this.talleresService.assignProfesor(dto).subscribe({
    next: () => {
      this.alertService.close(); // Cierra el loading
      this.alertService.success('¡Listo!', 'Profesor asignado correctamente al taller.');
      this.cargarTalleres(); // Recargar tabla
    },
    error: (err) => {
      this.alertService.close();
      // El backend devuelve errores 409 (Conflict) o 400 (Bad Request)
      const msg = err.error?.message || 'Ocurrió un error inesperado';
      this.alertService.error('Error', msg);
    }
  });
}
```
