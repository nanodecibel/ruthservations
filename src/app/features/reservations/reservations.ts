import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, addDoc, doc, updateDoc, getDoc, query, where, getDocs, Timestamp } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';

@Component({
    selector: 'app-reservations',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reservations.html',
    styleUrls: ['./reservations.scss']
})
export class Reservations implements OnInit {
    spaces: any[] = [];
    slots: any[] = [];
    selectedSpace = '';
    selectedSlots: any[] = [];
    companionsText = '';
    acceptTerms = false;

    isLoading = true;
    isSubmitting = false;
    isAdmin = false;
    isConfirmingDelete = false; // Nuevo flag para evitar el alert nativo

    // Mapa para reservas: { 'fecha_slotIndex': 'status' }
    occupiedSlots: { [key: string]: string } = {};

    // Almacén para horarios bloqueados semestrales
    blockedSchedules: any[] = [];

    toast = { show: false, message: '', type: 'success' };

    // Modal de Información
    infoModal = {
        show: false,
        title: '',
        user: '',
        reason: '',
        status: '',
        blockId: '',
        currentDayIndex: -1,
        currentSlotOrder: -1,
        companions: [] as string[]
    };

    config: any = {
        system_enabled: true,
        max_future_weeks_visible: 2,
        max_blocks_per_reservation_user: 3,
        max_blocks_user_week: 7,
        reservation_min_days_before: 1,
        reservation_max_days_before: 7,
        reservations_require_approval: true
    };

    days = [
        { num: 1, label: 'L' }, { num: 2, label: 'M' }, { num: 3, label: 'X' },
        { num: 4, label: 'J' }, { num: 5, label: 'V' }, { num: 6, label: 'S' }, { num: 7, label: 'D' }
    ];
    weekOffset = 0;
    weekDates: Date[] = [];

    constructor(
        private firestore: Firestore,
        private auth: Auth,
        private cd: ChangeDetectorRef
    ) { }

    async ngOnInit() {
        this.checkAdminStatus();
        this.calculateWeek();
        await this.loadSystemConfig();
        this.loadInitialData();
    }

    private checkAdminStatus() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(this.firestore, `universities/u1/users/${user.uid}`);
                    const userSnap = await getDoc(userDocRef);

                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        this.isAdmin = userData['role'] === 'admin';
                    } else {
                        this.isAdmin = false;
                    }
                } catch (e) {
                    console.error("Error verificando rol:", e);
                    this.isAdmin = false;
                }
                this.cd.detectChanges();
            } else {
                this.isAdmin = false;
                this.cd.detectChanges();
            }
        });
    }

    private loadInitialData() {
        const spacesRef = collection(this.firestore, 'universities/u1/spaces');
        const slotsRef = collection(this.firestore, 'universities/u1/time_slots');

        collectionData(spacesRef, { idField: 'id' }).subscribe(data => {
            this.spaces = data;
            if (this.spaces.length > 0 && !this.selectedSpace) {
                this.selectedSpace = this.spaces[0].id;
                this.loadOccupiedData();
            }
            this.isLoading = false;
            this.cd.detectChanges();
        });

        collectionData(slotsRef, { idField: 'id' }).subscribe(data => {
            this.slots = (data as any[])
                .filter((s: any) => s.day === 1 && s.active)
                .sort((a: any, b: any) => a.order - b.order);
            this.cd.detectChanges();
        });
    }

    private getLocalDataString(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async loadOccupiedData() {
        if (!this.selectedSpace) return;
        this.isLoading = true;
        this.cd.detectChanges();

        try {
            await Promise.all([
                this.loadOccupiedSlots(),
                this.loadBlockedSchedules()
            ]);
        } finally {
            this.isLoading = false;
            this.cd.detectChanges();
        }
    }

    async loadOccupiedSlots() {
        const reservationsRef = collection(this.firestore, 'universities/u1/reservations');
        const q = query(reservationsRef, where("space_id", "==", this.selectedSpace));

        try {
            const snap = await getDocs(q);
            this.occupiedSlots = {};
            snap.forEach(doc => {
                const data = doc.data();
                if (data['status'] === 'pending' || data['status'] === 'approved') {
                    const dateObj = data['date'] instanceof Timestamp ? data['date'].toDate() : new Date(data['date']);
                    const dateStr = this.getLocalDataString(dateObj);
                    const key = `${dateStr}_${data['slot_index']}`;
                    this.occupiedSlots[key] = data['status'];
                }
            });
        } catch (e) {
            console.error("Error cargando ocupados:", e);
        }
    }

    async loadBlockedSchedules() {
        const blockedRef = collection(this.firestore, 'universities/u1/blocked_schedules');
        const q = query(blockedRef, where("space_id", "==", this.selectedSpace));

        try {
            const snap = await getDocs(q);
            this.blockedSchedules = [];
            snap.forEach(doc => {
                this.blockedSchedules.push({ id: doc.id, ...doc.data() });
            });
        } catch (e) {
            console.error("Error cargando bloqueos:", e);
        }
    }

    async loadSystemConfig() {
        try {
            const ref = doc(this.firestore, 'universities/u1/system_config/config');
            const snap = await getDoc(ref);
            if (snap.exists()) {
                this.config = { ...this.config, ...snap.data() };
                this.cd.detectChanges();
            }
        } catch (e) {
            console.error("Error loading config:", e);
        }
    }

    onSpaceChange() {
        this.selectedSlots = [];
        this.loadOccupiedData();
    }

    calculateWeek() {
        const now = new Date();
        const monday = new Date(now);
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1 - day);
        monday.setDate(now.getDate() + diff + (this.weekOffset * 7));
        this.weekDates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            this.weekDates.push(d);
        }
    }

    getWeekNumber(d: Date): number {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }

    nextWeek() {
        if (this.weekOffset < this.config.max_future_weeks_visible - 1) {
            this.weekOffset++;
            this.calculateWeek();
            this.selectedSlots = [];
            this.loadOccupiedData();
        }
    }

    prevWeek() {
        if (this.weekOffset > 0) {
            this.weekOffset--;
            this.calculateWeek();
            this.selectedSlots = [];
            this.loadOccupiedData();
        }
    }

    isOccupied(dayIndex: number, slotOrder: number): string | null {
        const date = this.weekDates[dayIndex];
        const dateStr = this.getLocalDataString(date);
        const resStatus = this.occupiedSlots[`${dateStr}_${slotOrder}`];
        if (resStatus) return resStatus;

        for (const block of this.blockedSchedules) {
            const start = block.start_date instanceof Timestamp ? block.start_date.toDate() : new Date(block.start_date);
            const end = block.end_date instanceof Timestamp ? block.end_date.toDate() : new Date(block.end_date);
            if (date >= start && date <= end) {
                const dayNum = (dayIndex + 1).toString();
                const blockedIndices = block.week_logic?.[dayNum] || [];
                if (blockedIndices.includes(slotOrder)) return 'blocked';
            }
        }
        return null;
    }

    async toggleSlot(day: number, slot: any) {
    const status = this.isOccupied(day - 1, slot.order);
    
    if (status) {
        this.showInfo(day - 1, slot, status);
        return;
    }

    // --- NUEVA REGLA: Validación de mismo día ---
    if (this.selectedSlots.length > 0) {
        // Comparamos el día del nuevo slot con el día del primer slot ya seleccionado
        if (this.selectedSlots[0].day !== day) {
            this.triggerToast("Toda la reserva debe ser para el mismo día", "error");
            return;
        }
    }
    // --------------------------------------------

    const now = new Date();
    const slotDateBase = new Date(this.weekDates[day - 1]);
    let slotHour = 8;
    if (slot.label) {
        const match = slot.label.match(/\d{1,2}/);
        if (match) slotHour = parseInt(match[0]);
    }

    const slotDate = new Date(slotDateBase.getFullYear(), slotDateBase.getMonth(), slotDateBase.getDate(), slotHour, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate()).getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) { this.triggerToast("No puedes reservar en días pasados", "error"); return; }
    if (diffDays < this.config.reservation_min_days_before) { this.triggerToast(`Debes reservar con al menos ${this.config.reservation_min_days_before} día(s) de anticipación`, "error"); return; }
    if (diffDays > this.config.reservation_max_days_before) { this.triggerToast(`Máximo ${this.config.reservation_max_days_before} días de anticipación`, "error"); return; }

    const slotCode = day * 100 + slot.order;
    const index = this.selectedSlots.findIndex(s => s.slot_code === slotCode);
    
    if (index > -1) {
        this.selectedSlots.splice(index, 1);
    } else {
        if (this.selectedSlots.length >= this.config.max_blocks_per_reservation_user) {
            this.triggerToast(`Máximo ${this.config.max_blocks_per_reservation_user} bloques por reserva`, "error");
            return;
        }
        this.selectedSlots.push({ day, slot_index: slot.order, slot_code: slotCode, label: slot.label, date: slotDate });
    }
    this.cd.detectChanges();
}
    async showInfo(dayIndex: number, slot: any, status: string) {
        const date = this.weekDates[dayIndex];
        const dateStr = this.getLocalDataString(date);

        this.isConfirmingDelete = false; // Reset confirm state al abrir
        this.infoModal = {
            show: true,
            title: `${slot.label} - ${this.days[dayIndex].label}`,
            user: 'Cargando...',
            reason: '',
            status: status,
            blockId: '',
            currentDayIndex: dayIndex,
            currentSlotOrder: slot.order,
            companions: []
        };
        this.cd.detectChanges();

        if (status === 'blocked') {
            const block = this.blockedSchedules.find(b => {
                const start = b.start_date instanceof Timestamp ? b.start_date.toDate() : new Date(b.start_date);
                const end = b.end_date instanceof Timestamp ? b.end_date.toDate() : new Date(b.end_date);
                const dayNum = (dayIndex + 1).toString();
                return date >= start && date <= end && b.week_logic?.[dayNum]?.includes(slot.order);
            });
            this.infoModal.user = block?.title || "Horario Académico / Administrativo";
            this.infoModal.reason = block?.reason || "Espacio no disponible por programación semestral.";
            this.infoModal.blockId = block?.id || '';
        } else {
            try {
                const reservationsRef = collection(this.firestore, 'universities/u1/reservations');
                const q = query(
                    reservationsRef,
                    where("space_id", "==", this.selectedSpace),
                    where("reservation_key", "==", `${this.selectedSpace}_${dateStr}_${slot.order}`)
                );

                const snap = await getDocs(q);
                if (!snap.empty) {
                    const resData = snap.docs[0].data();
                    const userSnap = await getDoc(doc(this.firestore, `universities/u1/users/${resData['user_id']}`));

                    this.infoModal.user = userSnap.exists() ? userSnap.data()['name'] : "Usuario de Ruthservations";
                    this.infoModal.companions = resData['companions'] || [];
                    this.infoModal.reason = status === 'pending' ? "Esta reserva está esperando aprobación del administrador." : "Reserva confirmada.";
                }
            } catch (e) {
                this.infoModal.user = "Información no disponible";
            }
        }
        this.cd.detectChanges();
    }

    async deleteBlockedSchedule() {
        // Si ya se está enviando o no hay ID, no hacer nada
        if (!this.isAdmin || !this.infoModal.blockId || this.isSubmitting) return;

        // Paso 1: Confirmación visual en el botón
        if (!this.isConfirmingDelete) {
            this.isConfirmingDelete = true;
            this.cd.detectChanges();
            return;
        }

        // Paso 2: Inicio de la operación
        this.isSubmitting = true; // Activa barra de progreso y texto en botón
        this.cd.detectChanges();

        try {
            const docRef = doc(this.firestore, `universities/u1/blocked_schedules/${this.infoModal.blockId}`);
            const blockSnap = await getDoc(docRef);

            if (blockSnap.exists()) {
                const blockData = blockSnap.data();
                const weekLogic = { ...blockData['week_logic'] };
                const dayKey = (this.infoModal.currentDayIndex + 1).toString();
                const slotOrder = this.infoModal.currentSlotOrder;

                if (weekLogic[dayKey]) {
                    // Filtramos el slot específico
                    weekLogic[dayKey] = weekLogic[dayKey].filter((order: number) => order !== slotOrder);

                    // Si el día quedó vacío, limpiamos la llave
                    if (weekLogic[dayKey].length === 0) {
                        delete weekLogic[dayKey];
                    }

                    // 1. Actualizamos en Firestore
                    await updateDoc(docRef, { week_logic: weekLogic });

                    // 2. Refrescamos la data de la cuadrícula (importante hacer el await aquí)
                    await this.loadOccupiedData();

                    // 3. Feedback de éxito
                    this.triggerToast("Espacio liberado correctamente", "success");

                    // 4. CIERRE DEFINITIVO: Cerramos el modal
                    this.closeModal();
                }
            }
        } catch (e) {
            console.error("Error al liberar espacio:", e);
            this.triggerToast("Error al modificar el bloqueo", "error");
        } finally {
            // Paso 3: Apagar motores de carga (importante que esté en finally)
            this.isSubmitting = false;
            this.isConfirmingDelete = false;
            this.cd.detectChanges();
        }
    }
    closeModal() {
        this.infoModal.show = false;
        this.isConfirmingDelete = false; // Reset de seguridad
        this.cd.detectChanges();
    }

    isSelected(day: number, slot: any) {
        return this.selectedSlots.some(s => s.slot_code === (day * 100 + slot.order));
    }

    dropdownOpen = false;
    toggleDropdown() {
        this.dropdownOpen = !this.dropdownOpen;
        this.cd.detectChanges();
    }

    selectSpace(id: string) {
        this.selectedSpace = id;
        this.dropdownOpen = false;
        this.onSpaceChange();
        this.cd.detectChanges();
    }

    getSelectedSpaceName() {
        const space = this.spaces.find(s => s.id === this.selectedSpace);
        return space ? space.name : 'Seleccionar Laboratorio';
    }

    getSelectedSpaceLocation() {
        const space = this.spaces.find(s => s.id === this.selectedSpace);
        return space ? space.location : '';
    }

    async submitReservation() {
        if (this.isSubmitting || !this.config.system_enabled || !this.selectedSpace || this.selectedSlots.length === 0 || !this.acceptTerms) return;

        this.isSubmitting = true;
        this.cd.detectChanges();

        const user = this.auth.currentUser;
        if (!user) {
            this.triggerToast("Debes iniciar sesión", "error");
            this.isSubmitting = false;
            return;
        }

        try {
            const reservationsRef = collection(this.firestore, 'universities/u1/reservations');
            const q = query(reservationsRef, where("user_id", "==", user.uid));
            const snap = await getDocs(q);

            let blocksThisWeek = 0;
            snap.forEach(d => {
                const res = d.data();
                if ((res['status'] === 'pending' || res['status'] === 'approved') && this.isSameWeek(res['date'] instanceof Timestamp ? res['date'].toDate() : new Date(res['date']), this.selectedSlots[0].date)) {
                    blocksThisWeek++;
                }
            });

            if (blocksThisWeek + this.selectedSlots.length > this.config.max_blocks_user_week) {
                this.triggerToast(`Límite semanal excedido (${this.config.max_blocks_user_week} bloques)`, "error");
                this.isSubmitting = false;
                this.cd.detectChanges();
                return;
            }

            const groupId = crypto.randomUUID();
            const companionsArray = this.companionsText.split(',').map(x => x.trim()).filter(x => x.length > 0);

            for (const slot of this.selectedSlots) {
                await addDoc(reservationsRef, {
                    approval_time: null,
                    approved_by: null,
                    companions: companionsArray,
                    created_at: new Date(),
                    date: slot.date,
                    day: slot.day,
                    week_number: this.getWeekNumber(slot.date),
                    year: slot.date.getFullYear(),
                    reservation_group: groupId,
                    reservation_key: `${this.selectedSpace}_${this.getLocalDataString(slot.date)}_${slot.slot_index}`,
                    slot_code: slot.slot_code,
                    slot_index: slot.slot_index,
                    space_id: this.selectedSpace,
                    status: "pending",
                    user_id: user.uid
                });
            }

            await this.loadOccupiedData();
            this.resetForm();
            this.triggerToast("¡Reserva enviada con éxito!", "success");
        } catch (e) {
            this.triggerToast("Hubo un error al procesar la reserva", "error");
        } finally {
            this.isSubmitting = false;
            this.cd.detectChanges();
        }
    }

    private isSameWeek(d1: Date, d2: Date) {
        return this.getWeekNumber(d1) === this.getWeekNumber(d2) && d1.getFullYear() === d2.getFullYear();
    }

    private resetForm() {
        this.selectedSlots = [];
        this.companionsText = '';
        this.acceptTerms = false;
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