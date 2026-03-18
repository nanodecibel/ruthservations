import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core'; // <--- CORREGIDO AQUÍ
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, addDoc, Timestamp } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-schedules',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedules.html',
  styleUrl: './schedules.scss'
})
export class Schedules implements OnInit, OnDestroy {
  spaces: any[] = [];
  slots: any[] = [];

  selectedSpaceId = '';
  scheduleTitle = '';
  startDate: string = '';
  endDate: string = '';

  weekLogic: { [key: string]: number[] } = {
    "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": []
  };

  isLoading = true;
  isSaving = false;
  toast = { show: false, message: '', type: 'success' };

  days = [
    { num: 1, label: 'L' }, { num: 2, label: 'M' }, { num: 3, label: 'X' },
    { num: 4, label: 'J' }, { num: 5, label: 'V' }, { num: 6, label: 'S' }, { num: 7, label: 'D' }
  ];

  private subscriptions: Subscription = new Subscription();

  constructor(private firestore: Firestore, private cd: ChangeDetectorRef) { }

  ngOnInit() {
    this.loadInitialData();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  loadInitialData() {
    const spacesRef = collection(this.firestore, 'universities/u1/spaces');
    const slotsRef = collection(this.firestore, 'universities/u1/time_slots');

    const spacesSub = collectionData(spacesRef, { idField: 'id' }).subscribe({
      next: (data) => {
        this.spaces = data;
        if (this.spaces.length > 0 && !this.selectedSpaceId) {
          this.selectedSpaceId = this.spaces[0].id;
        }
        this.checkLoadingState();
      },
      error: (err) => {
        console.error("Error cargando espacios:", err);
        this.handleLoadingError();
      }
    });

    const slotsSub = collectionData(slotsRef).subscribe({
      next: (data) => {
        this.slots = (data as any[])
          .filter(s => s.day === 1 && s.active)
          .sort((a, b) => a.order - b.order);
        this.checkLoadingState();
      },
      error: (err) => {
        console.error("Error cargando slots:", err);
        this.handleLoadingError();
      }
    });

    this.subscriptions.add(spacesSub);
    this.subscriptions.add(slotsSub);

    setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.cd.detectChanges();
      }
    }, 6000);
  }

  private checkLoadingState() {
    if (this.spaces.length > 0 && this.slots.length > 0) {
      this.isLoading = false;
      this.cd.detectChanges();
    }
  }

  private handleLoadingError() {
    this.isLoading = false;
    this.triggerToast("Error de conexión con el servidor", "error");
    this.cd.detectChanges();
  }

  dropdownOpen = false;
  toggleDropdown() { this.dropdownOpen = !this.dropdownOpen; }

  selectSpace(id: string) {
    this.selectedSpaceId = id;
    this.dropdownOpen = false;
  }

  getSelectedSpaceName() {
    const space = this.spaces.find(s => s.id === this.selectedSpaceId);
    return space ? space.name : 'Seleccionar laboratorio';
  }

  getSelectedSpaceLocation() {
    const space = this.spaces.find(s => s.id === this.selectedSpaceId);
    return space ? space.location : 'Ubicación no definida';
  }

  toggleBlock(dayNum: number, slotOrder: number) {
    const dayKey = dayNum.toString();
    const index = this.weekLogic[dayKey].indexOf(slotOrder);
    if (index > -1) {
      this.weekLogic[dayKey].splice(index, 1);
    } else {
      this.weekLogic[dayKey].push(slotOrder);
    }
    this.cd.detectChanges();
  }

  isBlockSelected(dayNum: number, slotOrder: number): boolean {
    return this.weekLogic[dayNum.toString()].includes(slotOrder);
  }

  async saveSchedule() {
    if (!this.selectedSpaceId || !this.startDate || !this.endDate || !this.scheduleTitle.trim()) {
      this.triggerToast("Faltan datos obligatorios", "error");
      return;
    }

    this.isSaving = true;
    try {
      const blockedRef = collection(this.firestore, 'universities/u1/blocked_schedules');
      const start = new Date(this.startDate + 'T00:00:00');
      const end = new Date(this.endDate + 'T23:59:59');

      await addDoc(blockedRef, {
        title: this.scheduleTitle,
        space_id: this.selectedSpaceId,
        start_date: Timestamp.fromDate(start),
        end_date: Timestamp.fromDate(end),
        week_logic: this.weekLogic,
        created_at: Timestamp.now(),
        reason: 'academic'
      });

      this.triggerToast("¡Planificación guardada con éxito!", "success");
      this.resetCanvas();
      this.scheduleTitle = '';
      this.startDate = '';
      this.endDate = '';
    } catch (e) {
      console.error("Error al guardar:", e);
      this.triggerToast("Error al conectar con Firebase", "error");
    } finally {
      this.isSaving = false;
      this.cd.detectChanges();
    }
  }

  resetCanvas() {
    this.weekLogic = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] };
    this.cd.detectChanges();
  }

  triggerToast(message: string, type: 'success' | 'error' = 'success') {
    this.toast = { show: true, message, type };
    this.cd.detectChanges();
    setTimeout(() => {
      this.toast.show = false;
      this.cd.detectChanges();
    }, 4000);
  }
}