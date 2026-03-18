import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  user: any = null;

  setUser(userData: any) {

    this.user = userData;

  }

  getUser() {

    return this.user;

  }

  isAdmin() {

    return this.user?.role === 'admin';

  }

}