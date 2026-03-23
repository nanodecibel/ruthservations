import { Component, OnInit, ChangeDetectorRef, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es'; 
import { Firestore, collection, collectionData, doc, updateDoc, Timestamp, query, where } from '@angular/fire/firestore';
import { combineLatest, BehaviorSubject } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

registerLocaleData(localeEs);

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class Admin implements OnInit {
  private viewMode$ = new BehaviorSubject<'pending' | 'approved'>('pending');
  currentMode: 'pending' | 'approved' = 'pending';

  groupedReservations: any[] = [];
  loading = true;

  toast = { show: false, message: '', type: 'success' };

  showConfirmModal = false;
  modalConfig = {
    title: '',
    message: '',
    confirmText: '',
    isDanger: false,
    action: () => {}
  };

  constructor(private firestore: Firestore, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    this.initAdminStream();
  }

  initAdminStream() {
    const spacesRef = collection(this.firestore, 'universities/u1/spaces');
    const usersRef = collection(this.firestore, 'universities/u1/users');
    const slotsRef = collection(this.firestore, 'universities/u1/time_slots');
    const resRef = collection(this.firestore, 'universities/u1/reservations');
    const equipmentRef = collection(this.firestore, 'universities/u1/equipment'); // Para el cruce

    const spaces$ = collectionData(spacesRef, { idField: 'id' }).pipe(
      map(items => {
        const m: any = {};
        items.forEach((s: any) => m[s.id] = s.name);
        return m;
      })
    );

    const users$ = collectionData(usersRef, { idField: 'id' }).pipe(
      map(items => {
        const m: any = {};
        items.forEach((u: any) => m[u.id] = u.name);
        return m;
      })
    );

    const labels$ = collectionData(slotsRef).pipe(
      map(items => {
        const m: any = {};
        items.forEach((s: any) => {
          const code = (s.day * 100) + s.order;
          m[code] = s.label;
        });
        return m;
      })
    );

    // Mapeo de ID de equipo a Categoría (Type)
    const equipmentTypeMap$ = collectionData(equipmentRef, { idField: 'id' }).pipe(
      map(items => {
        const m: any = {};
        items.forEach((item: any) => m[item.id] = item.type || 'Otros');
        return m;
      })
    );

    const reservations$ = this.viewMode$.pipe(
      switchMap(mode => {
        this.loading = true;
        const q = query(resRef, where('status', '==', mode));
        return collectionData(q, { idField: 'id' });
      })
    );

    combineLatest([spaces$, users$, labels$, reservations$, equipmentTypeMap$]).subscribe({
      next: ([spacesMap, usersMap, labelsMap, reservations, typeMap]) => {
        const groups: { [key: string]: any } = {};

        reservations.forEach((r: any) => {
          const gid = r.reservation_group;
          const slotCode = (r.day * 100) + r.slot_index;
          const timeLabel = labelsMap[slotCode] || `Bloque ${slotCode}`;

          if (!groups[gid]) {
            // Lógica de agrupación de equipos por categoría
            const rawItems = r.requested_items || [];
            const groupedItems: { [category: string]: any[] } = {};

            rawItems.forEach((item: any) => {
              const category = typeMap[item.id] || 'General';
              if (!groupedItems[category]) groupedItems[category] = [];
              groupedItems[category].push(item);
            });

            const equipmentCategories = Object.keys(groupedItems).map(cat => ({
              name: cat,
              list: groupedItems[cat]
            }));

            groups[gid] = {
              groupId: gid,
              space: spacesMap[r.space_id] || 'Laboratorio',
              user: usersMap[r.user_id] || 'Estudiante',
              date: r.date instanceof Timestamp ? r.date.toDate() : new Date(r.date),
              companions: r.companions || [],
              labels: [timeLabel],
              ids: [r.id],
              equipment: equipmentCategories // Lista agrupada para el HTML
            };
          } else {
            if (!groups[gid].labels.includes(timeLabel)) {
                groups[gid].labels.push(timeLabel);
            }
            groups[gid].ids.push(r.id);
          }
        });

        this.groupedReservations = Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  triggerToast(message: string, type: 'success' | 'error' = 'success') {
    this.toast = { show: true, message, type };
    this.cd.detectChanges();
    setTimeout(() => {
      this.toast.show = false;
      this.cd.detectChanges();
    }, 4000);
  }

  setView(mode: 'pending' | 'approved') {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.viewMode$.next(mode);
  }

  async updateStatus(group: any, newStatus: string, successMsg: string) {
    this.loading = true;
    this.cd.detectChanges();
    try {
      const promises = group.ids.map((id: string) => {
        const ref = doc(this.firestore, `universities/u1/reservations/${id}`);
        return updateDoc(ref, { status: newStatus });
      });
      await Promise.all(promises);
      this.triggerToast(successMsg, 'success');
    } catch (e) {
      console.error(e);
      this.triggerToast("Error al actualizar estado", "error");
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  approve(g: any) { this.updateStatus(g, 'approved', 'Reserva aprobada'); }
  finish(g: any) { this.updateStatus(g, 'finished', 'Reserva finalizada'); }

  openConfirm(g: any, actionType: 'reject' | 'abandon') {
    if (actionType === 'reject') {
      this.modalConfig = {
        title: '¿Rechazar reserva?',
        message: 'Esta acción notificará al estudiante que su espacio no fue asignado.',
        confirmText: 'Rechazar',
        isDanger: true,
        action: () => this.updateStatus(g, 'rejected', 'Reserva rechazada')
      };
    } else {
      this.modalConfig = {
        title: 'Marcar como abandonada',
        message: '¿Confirmas que el estudiante no asistió a su laboratorio?',
        confirmText: 'Abandonada',
        isDanger: true,
        action: () => this.updateStatus(g, 'abandoned', 'Reserva marcada como abandonada')
      };
    }
    this.showConfirmModal = true;
    this.cd.detectChanges();
  }

  confirmAction() {
    this.showConfirmModal = false;
    this.modalConfig.action();
    this.cd.detectChanges();
  }
}