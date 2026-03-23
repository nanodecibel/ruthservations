import { Component } from '@angular/core';
import { RouterModule, Router } from '@angular/router'; // Añadimos Router
import { Auth, signOut, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss']
})
export class Navbar {
  menuOpen = false;
  userLogged = false;
  isAdmin = false;

  constructor(
    private auth: Auth, 
    private firestore: Firestore,
    private router: Router // Inyectamos el router
  ) {
    onAuthStateChanged(this.auth, user => {
      this.userLogged = !!user;
      if (!user) {
        this.isAdmin = false;
        // Si no hay usuario y no estamos en login, redirigir
        if (!window.location.hash.includes('/login')) {
          this.router.navigate(['/login']);
        }
        return;
      }

      const ref = doc(this.firestore, `universities/u1/users/${user.uid}`);
      docData(ref).subscribe((data: any) => {
        this.isAdmin = data?.role === 'admin';
      });
    });
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }

  async logout() {
    try {
      this.closeMenu();
      await signOut(this.auth);
      // Cambiamos location.href por la navegación de Angular
      // Esto añadirá automáticamente el /#/login que necesitas
      this.router.navigate(['/login']);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  }
}