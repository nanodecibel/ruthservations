import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'

import { Auth } from '@angular/fire/auth'
import { Firestore, doc, getDoc } from '@angular/fire/firestore'

export const adminGuard: CanActivateFn = async () => {

const auth = inject(Auth)
const firestore = inject(Firestore)
const router = inject(Router)

const user = auth.currentUser

if(!user){

router.navigate(['/login'])
return false

}

/* buscar rol */

const ref = doc(firestore,'universities/u1/users/'+user.uid)
const snap = await getDoc(ref)

const data:any = snap.data()

if(data?.role === 'admin'){

return true

}

/* si no es admin */

router.navigate(['/reservations'])
return false

}