import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, addDoc, doc, updateDoc, getDoc, query, where, getDocs, Timestamp } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { EquipmentPicker } from '../../components/equipment-picker/equipment-picker';

@Component({
    selector: 'app-reservations',
    standalone: true,
    imports: [CommonModule, FormsModule, EquipmentPicker],
    templateUrl: './reservations.html',
    styleUrls: ['./reservations.scss']
})
export class Reservations implements OnInit {
    @ViewChild('picker') equipmentPicker!: EquipmentPicker;

    spaces: any[] = [];
    slots: any[] = [];
    selectedSpace = '';
    selectedSlots: any[] = [];
    companionsText = '';
    acceptTerms = false;

    isLoading = true;
    isSubmitting = false;
    isAdmin = false;
    isConfirmingDelete = false;

    occupiedSlots: { [key: string]: string } = {};
    blockedSchedules: any[] = [];
    toast = { show: false, message: '', type: 'success' };

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

    private isInventorySpace(): boolean {
        return this.selectedSpace === 'solo-equipos';
    }

    private checkAdminStatus() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(this.firestore, `universities/u1/users/${user.uid}`);
                    const userSnap = await getDoc(userDocRef);
                    this.isAdmin = userSnap.exists() && userSnap.data()['role'] === 'admin';
                } catch (e) {
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
            this.blockedSchedules = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        this.weekDates = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d;
        });
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

        if (!this.isInventorySpace()) {
            const resStatus = this.occupiedSlots[`${dateStr}_${slotOrder}`];
            if (resStatus) return resStatus;
        }

        for (const block of this.blockedSchedules) {
            const start = block.start_date instanceof Timestamp ? block.start_date.toDate() : new Date(block.start_date);
            const end = block.end_date instanceof Timestamp ? block.end_date.toDate() : new Date(block.end_date);
            if (date >= start && date <= end) {
                const dayNum = (dayIndex + 1).toString();
                if (block.week_logic?.[dayNum]?.includes(slotOrder)) return 'blocked';
            }
        }
        return null;
    }

async toggleSlot(day: number, slot: any) {
    const status = this.isOccupied(day - 1, slot.order);
    
    // --- BYPASS SOLO-EQUIPOS / BLOQUEOS ---
    if (status === 'blocked' || (status && !this.isInventorySpace())) {
        this.showInfo(day - 1, slot, status);
        return;
    }

    // Validación de mismo día
    if (this.selectedSlots.length > 0) {
        if (this.selectedSlots[0].day !== day) {
            this.triggerToast("Toda la reserva debe ser para el mismo día", "error");
            return;
        }
    }

    // Lógica de fechas y horas
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

    // Validaciones de anticipación
    if (diffDays < 0) { this.triggerToast("No puedes reservar en días pasados", "error"); return; }
    if (diffDays < this.config.reservation_min_days_before) { this.triggerToast(`Debes reservar con al menos ${this.config.reservation_min_days_before} día(s) de anticipación`, "error"); return; }
    if (diffDays > this.config.reservation_max_days_before) { this.triggerToast(`Máximo ${this.config.reservation_max_days_before} días de anticipación`, "error"); return; }

    const slotCode = day * 100 + slot.order;
    const index = this.selectedSlots.findIndex(s => s.slot_code === slotCode);
    
    if (index > -1) {
        // --- CAMBIO PARA INMUTABILIDAD (QUITAR) ---
        // Filtramos para crear un NUEVO array sin el slot deseleccionado
        this.selectedSlots = this.selectedSlots.filter(s => s.slot_code !== slotCode);
    } else {
        if (this.selectedSlots.length >= this.config.max_blocks_per_reservation_user) {
            this.triggerToast(`Máximo ${this.config.max_blocks_per_reservation_user} bloques por reserva`, "error");
            return;
        }
        // --- CAMBIO PARA INMUTABILIDAD (AÑADIR) ---
        // Creamos un NUEVO array con los existentes + el nuevo objeto
        this.selectedSlots = [
            ...this.selectedSlots, 
            { day, slot_index: slot.order, slot_code: slotCode, label: slot.label, date: slotDate }
        ];
    }

    // Al asignar un nuevo array a this.selectedSlots, el [selectedSlots] del HTML
    // detecta el cambio de referencia y dispara el ngOnChanges en el EquipmentPicker.
    this.cd.detectChanges();
}

    async showInfo(dayIndex: number, slot: any, status: string) {
        const date = this.weekDates[dayIndex];
        const dateStr = this.getLocalDataString(date);

        this.isConfirmingDelete = false;
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
        if (!this.isAdmin || !this.infoModal.blockId || this.isSubmitting) return;
        if (!this.isConfirmingDelete) {
            this.isConfirmingDelete = true;
            this.cd.detectChanges();
            return;
        }
        this.isSubmitting = true;
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
                    weekLogic[dayKey] = weekLogic[dayKey].filter((order: number) => order !== slotOrder);
                    if (weekLogic[dayKey].length === 0) delete weekLogic[dayKey];
                    await updateDoc(docRef, { week_logic: weekLogic });
                    await this.loadOccupiedData();
                    this.triggerToast("Espacio liberado correctamente", "success");
                    this.closeModal();
                }
            }
        } catch (e) {
            this.triggerToast("Error al modificar el bloqueo", "error");
        } finally {
            this.isSubmitting = false;
            this.isConfirmingDelete = false;
            this.cd.detectChanges();
        }
    }

    closeModal() {
        this.infoModal.show = false;
        this.isConfirmingDelete = false;
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

    // --- NUEVO: Obtener resumen para el HTML ---
    getSelectedItemsSummary(): any[] {
        let items: any[] = [];
        if (this.equipmentPicker) {
            this.equipmentPicker.categories.forEach(group => {
                group.items.forEach(item => {
                    if (item.selected_quantity > 0) {
                        items.push({ name: `${item.brand} ${item.model}`, qty: item.selected_quantity });
                    }
                });
            });
        }
        return items;
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
        // --- EXTRACCIÓN DE EQUIPOS ---
        const itemsToReserve: any[] = [];
        
        if (this.equipmentPicker && this.equipmentPicker.categories) {
            console.log("Categorías encontradas en el picker:", this.equipmentPicker.categories);
            
            this.equipmentPicker.categories.forEach(group => {
                group.items.forEach(item => {
                    // Forzamos la lectura de la cantidad seleccionada
                    if (item.selected_quantity > 0) {
                        itemsToReserve.push({
                            id: item.id,
                            brand: item.brand,
                            model: item.model,
                            quantity: item.selected_quantity
                        });
                    }
                });
            });
        }

        console.log("Equipos listos para enviar:", itemsToReserve);

        // Validación: Si el espacio es 'solo-equipos', no puede ir vacío
        if (this.isInventorySpace() && itemsToReserve.length === 0) {
            this.triggerToast("Debes seleccionar al menos un equipo", "error");
            this.isSubmitting = false;
            return;
        }

        const reservationsRef = collection(this.firestore, 'universities/u1/reservations');
        const groupId = crypto.randomUUID();
        const companionsArray = this.companionsText.split(',').map(x => x.trim()).filter(x => x.length > 0);

        // --- BUCLE DE GUARDADO ---
        for (const slot of this.selectedSlots) {
            const reservationData = {
                approval_time: null,
                approved_by: null,
                companions: companionsArray,
                created_at: new Date(),
                date: slot.date, // Timestamp
                day: slot.day,
                week_number: this.getWeekNumber(slot.date),
                year: slot.date.getFullYear(),
                reservation_group: groupId,
                reservation_key: `${this.selectedSpace}_${this.getLocalDataString(slot.date)}_${slot.slot_index}`,
                slot_code: slot.slot_code,
                slot_index: slot.slot_index,
                space_id: this.selectedSpace,
                status: "pending",
                user_id: user.uid,
                requested_items: itemsToReserve // El array con los datos
            };

            await addDoc(reservationsRef, reservationData);
        }

        await this.loadOccupiedData();
        this.resetForm();
        this.triggerToast("¡Reserva enviada con éxito!", "success");

    } catch (e) {
        console.error("Error crítico en submitReservation:", e);
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
        // Opcional: Podrías resetear el picker aquí si tienes un método reset en el hijo
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