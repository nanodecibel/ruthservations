import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
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

  constructor(private auth: Auth, private firestore: Firestore) {
    onAuthStateChanged(this.auth, user => {
      this.userLogged = !!user;
      if (!user) {
        this.isAdmin = false;
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
    this.closeMenu();
    await signOut(this.auth);
    location.href = "/login";
  }
}