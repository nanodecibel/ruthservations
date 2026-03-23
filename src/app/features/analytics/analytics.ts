import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, getDocs, Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.scss'
})
export class Analytics implements OnInit {
  spaces: any[] = [];
  selectedSpaceId: string = '';
  dateStart: string = '';
  dateEnd: string = '';

  groupedRecords: any[] = [];
  stats = { resHours: 0 };
  
  isLoading = false;
  hasConsulted = false;
  dropdownOpen = false;

  constructor(private firestore: Firestore, private cd: ChangeDetectorRef) {}

  async ngOnInit() {
    try {
      const snap = await getDocs(collection(this.firestore, 'universities/u1/spaces'));
      this.spaces = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      if (this.spaces.length > 0) this.selectedSpaceId = this.spaces[0].id;
      this.cd.detectChanges();
    } catch (e) { console.error("Error inicial:", e); }
  }

  async consultar() {
    if (!this.selectedSpaceId || !this.dateStart || !this.dateEnd) return;

    this.isLoading = true;
    this.hasConsulted = true;
    this.groupedRecords = []; 
    this.cd.detectChanges();

    try {
      // 1. CARGA DE DATOS MAESTROS (Incluyendo Equipment para el cruce)
      const [usersSnap, resSnap, slotsSnap, equipSnap] = await Promise.all([
        getDocs(collection(this.firestore, 'universities/u1/users')),
        getDocs(collection(this.firestore, 'universities/u1/reservations')),
        getDocs(collection(this.firestore, 'universities/u1/time_slots')),
        getDocs(collection(this.firestore, 'universities/u1/equipment'))
      ]);

      const usersMap = new Map(usersSnap.docs.map(d => [d.id, (d.data() as any).name]));
      const slotsMap = new Map(slotsSnap.docs.map(d => [d.id, (d.data() as any).label]));
      
      // Mapeo de ID de equipo a su Categoría (Type)
      const equipTypeMap = new Map(equipSnap.docs.map(d => [d.id, (d.data() as any).type || 'Otros']));
      
      const allRes = resSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      const start = new Date(this.dateStart + 'T00:00:00');
      const end = new Date(this.dateEnd + 'T23:59:59');

      const filteredRes = allRes.filter(r => {
        if (r.space_id !== this.selectedSpaceId) return false;
        const rDate = r.date instanceof Timestamp ? r.date.toDate() : new Date(r.date);
        const rTime = rDate.getTime();
        return rTime >= start.getTime() && rTime <= end.getTime();
      });

      const groups: { [key: string]: any } = {};
      
      filteredRes.forEach(r => {
        const gid = r.reservation_group || r.id;
        const slotId = String(r.slot_code); 
        const slotLabel = slotsMap.get(slotId) || `Horario ${slotId}`;

        if (!groups[gid]) {
          // Lógica de agrupación de equipos por categoría
          const rawItems = r.requested_items || [];
          const catMap: { [key: string]: any[] } = {};

          rawItems.forEach((item: any) => {
            const category = equipTypeMap.get(item.id) || 'General';
            if (!catMap[category]) catMap[category] = [];
            catMap[category].push(item);
          });

          const equipmentCategories = Object.keys(catMap).map(catName => ({
            name: catName,
            items: catMap[catName]
          }));

          groups[gid] = {
            user: usersMap.get(r.user_id) || 'Estudiante',
            date: r.date instanceof Timestamp ? r.date.toDate() : new Date(r.date),
            status: r.status || 'pending',
            slotsLabels: [slotLabel],
            companions: r.companions || [],
            equipment: equipmentCategories // Array formateado para el HTML
          };
        } else if (!groups[gid].slotsLabels.includes(slotLabel)) {
          groups[gid].slotsLabels.push(slotLabel);
        }
      });

      this.groupedRecords = Object.values(groups).map((g: any) => {
        const sortedLabels = g.slotsLabels.sort();
        let range = sortedLabels.join(', ');
        
        try {
          if (sortedLabels.length > 1 && sortedLabels[0].includes(' - ')) {
            const firstPart = sortedLabels[0].split(' - ')[0];
            const lastPart = sortedLabels[sortedLabels.length - 1].split(' - ')[1];
            range = `${firstPart} - ${lastPart}`;
          }
        } catch (e) { }

        return { ...g, timeRange: range };
      }).sort((a, b) => b.date.getTime() - a.date.getTime());

      this.stats.resHours = filteredRes.length;

    } catch (e) {
      console.error("Error en consulta:", e);
    } finally {
      this.isLoading = false;
      this.cd.detectChanges(); 
    }
  }

  toggleDropdown() { this.dropdownOpen = !this.dropdownOpen; }
  selectSpace(id: string) { 
    this.selectedSpaceId = id; 
    this.dropdownOpen = false; 
    this.consultar(); 
  }
  getSelectedSpaceName() { 
    return this.spaces.find(s => s.id === this.selectedSpaceId)?.name || 'Seleccionar...'; 
  }
}