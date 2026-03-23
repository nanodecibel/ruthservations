import { Component, OnInit, ChangeDetectorRef, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, getDoc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { map } from 'rxjs/operators';
import { combineLatest } from 'rxjs';

registerLocaleData(localeEs);

@Component({
  selector: 'app-my-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-reservations.html',
  styleUrls: ['./my-reservations.scss'],
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class MyReservations implements OnInit {
  groupedReservations: any[] = [];
  loading = true;
  userId: string | null = null;
  cancellationMinHoursBefore = 24;

  showCancelModal = false;
  reservationToCancel: any = null;
  isCancelling = false;

  constructor(private firestore: Firestore, private auth: Auth, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        this.userId = user.uid;
        await this.loadConfig();
        this.initDataStream();
      } else {
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  async loadConfig() {
    try {
      const configRef = doc(this.firestore, 'universities/u1/system_config/config');
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        this.cancellationMinHoursBefore = configSnap.data()['cancellation_min_hours_before'] || 24;
      }
    } catch (e) { console.error("Error config:", e); }
  }

  initDataStream() {
    if (!this.userId) return;

    const spacesRef = collection(this.firestore, 'universities/u1/spaces');
    const reservationsRef = collection(this.firestore, 'universities/u1/reservations');
    const slotsRef = collection(this.firestore, 'universities/u1/time_slots');
    const equipmentRef = collection(this.firestore, 'universities/u1/equipment'); // Colección para el cruce

    const spaces$ = collectionData(spacesRef, { idField: 'id' }).pipe(
      map(spaces => {
        const map: any = {};
        spaces.forEach((s: any) => map[s.id] = s.name);
        return map;
      })
    );

    const labels$ = collectionData(slotsRef, { idField: 'id' }).pipe(
      map(slots => {
        const map: any = {};
        slots.forEach((s: any) => map[s.id] = s.label);
        return map;
      })
    );

    // Mapeo de ID de equipo a su Tipo (Categoría)
    const equipmentTypeMap$ = collectionData(equipmentRef, { idField: 'id' }).pipe(
      map(items => {
        const map: any = {};
        items.forEach((item: any) => map[item.id] = item.type || 'Otros');
        return map;
      })
    );

    const reservations$ = collectionData(reservationsRef, { idField: 'id' }).pipe(
      map(res => res
        .filter((r: any) => r.user_id === this.userId && (r.status === 'pending' || r.status === 'approved'))
        .map((r: any) => ({
          ...r,
          created_at: r.created_at instanceof Timestamp ? r.created_at.toDate() : new Date(r.created_at),
          date: r.date instanceof Timestamp ? r.date.toDate() : new Date(r.date)
        }))
      )
    );

    combineLatest([spaces$, labels$, reservations$, equipmentTypeMap$]).subscribe(([spacesMap, labelsMap, reservations, typeMap]) => {
      const groups: { [key: string]: any } = {};

      reservations.forEach((r: any) => {
        const groupId = r.reservation_group;
        const timeLabel = labelsMap[r.slot_code?.toString()] || `Bloque ${r.slot_code}`;

        if (!groups[groupId]) {
          // Procesar equipos solicitados y agruparlos por tipo usando el mapa de cruce
          const rawItems = r.requested_items || [];
          const groupedItems: { [category: string]: any[] } = {};

          rawItems.forEach((item: any) => {
            const category = typeMap[item.id] || 'General';
            if (!groupedItems[category]) groupedItems[category] = [];
            groupedItems[category].push(item);
          });

          // Convertimos el objeto de grupos en un array para el HTML
          const itemsByCategory = Object.keys(groupedItems).map(cat => ({
            name: cat,
            list: groupedItems[cat]
          }));

          groups[groupId] = {
            id: groupId,
            space_name: spacesMap[r.space_id] || 'Laboratorio',
            date: r.date,
            status: r.status,
            created_at: r.created_at,
            companions: r.companions || [],
            time_labels: [timeLabel],
            slot_ids: [r.id],
            equipment_categories: itemsByCategory // Nueva propiedad para la vista
          };
        } else {
          // Si el grupo ya existe, solo añadimos el horario si no está repetido
          if (!groups[groupId].time_labels.includes(timeLabel)) {
            groups[groupId].time_labels.push(timeLabel);
          }
          groups[groupId].slot_ids.push(r.id);
        }
      });

      this.groupedReservations = Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
      this.loading = false;
      this.cd.detectChanges();
    });
  }

  canCancel(date: Date): boolean {
    const now = new Date();
    const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours >= this.cancellationMinHoursBefore;
  }

  openCancelModal(group: any) {
    if (!this.canCancel(group.date)) {
      alert(`Solo puedes cancelar con ${this.cancellationMinHoursBefore}h de anticipación.`);
      return;
    }
    this.reservationToCancel = group;
    this.showCancelModal = true;
  }

  closeCancelModal() {
    this.showCancelModal = false;
    this.reservationToCancel = null;
  }

  async confirmCancellation() {
    if (!this.reservationToCancel || this.isCancelling) return;
    this.isCancelling = true;
    try {
      const promises = this.reservationToCancel.slot_ids.map((id: string) => {
        const ref = doc(this.firestore, `universities/u1/reservations/${id}`);
        return updateDoc(ref, { status: 'cancelled' });
      });
      await Promise.all(promises);
      this.closeCancelModal();
    } catch (e) {
      console.error(e);
      alert('Error al cancelar');
    } finally {
      this.isCancelling = false;
      this.cd.detectChanges();
    }
  }
}