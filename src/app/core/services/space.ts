import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Space } from '../../shared/models/space.model';

@Injectable({
  providedIn: 'root'
})
export class SpaceService {

  constructor(private firestore: Firestore) {}

  getSpaces(): Observable<Space[]> {
    const spacesRef = collection(this.firestore, 'universities/u1/spaces');
    return collectionData(spacesRef, { idField: 'id' }) as Observable<Space[]>;
  }

}