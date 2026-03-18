import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { UserService } from '../../core/services/user';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  email = '';
  password = '';
  loading = false;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private userService: UserService
  ) {}

  async login() {
    if (!this.email || !this.password) return;
    this.loading = true;

    try {
      const credential = await signInWithEmailAndPassword(this.auth, this.email, this.password);
      const uid = credential.user.uid;
      const userRef = doc(this.firestore, `universities/u1/users/${uid}`);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData: any = userSnap.data();
        this.userService.setUser({ uid: uid, ...userData });
        this.router.navigate(['/reservations']);
      } else {
        alert("Usuario no encontrado.");
        this.loading = false;
      }
    } catch (error) {
      console.error(error);
      alert("Error de autenticación.");
      this.loading = false;
    }
  }
}