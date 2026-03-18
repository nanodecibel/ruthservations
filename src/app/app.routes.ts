import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.Login)
  },
  {
    path: 'reservations',
    loadComponent: () => import('./features/reservations/reservations').then(m => m.Reservations)
  },
  {
    path: 'my-reservations',
    loadComponent: () => import('./features/my-reservations/my-reservations').then(m => m.MyReservations)
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then(m => m.Admin)
  },
  {
    path: 'schedules',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/schedules/schedules').then(m => m.Schedules)
  },
  // NUEVA RUTA DE ANALÍTICAS
  {
    path: 'analytics',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/analytics/analytics').then(m => m.Analytics)
  }
];