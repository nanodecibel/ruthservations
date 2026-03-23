import { Component, OnInit, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, where, getDocs } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

interface Equipment {
  id: string;
  brand: string;
  model: string;
  total_stock: number;
  available_stock: number; 
  type: string;
  selected_quantity: number;
}

interface EquipmentGroup {
  type: string;
  items: Equipment[];
  expanded: boolean;
  totalSelectedInCategory: number;
}

@Component({
  selector: 'app-equipment-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './equipment-picker.html',
  styleUrl: './equipment-picker.scss',
})
export class EquipmentPicker implements OnInit, OnChanges, OnDestroy {
  @Input() selectedSlots: any[] = [];
  public categories: EquipmentGroup[] = [];
  private baseEquipment: any[] = []; 
  private dataSubscription: Subscription | undefined;

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {
    const itemCollection = collection(this.firestore, 'universities/u1/equipment');
    this.dataSubscription = collectionData(itemCollection, { idField: 'id' }).subscribe(data => {
      this.baseEquipment = data;
      this.calculateAvailability();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedSlots']) {
      this.calculateAvailability();
    }
  }

  async calculateAvailability() {
    if (!this.baseEquipment.length) return;
    if (!this.selectedSlots.length) {
      this.processCategories(this.baseEquipment, {});
      return;
    }

    const reservationsRef = collection(this.firestore, 'universities/u1/reservations');
    const uniqueDates = [...new Set(this.selectedSlots.map(s => s.date.getTime()))].map(t => new Date(t));
    const slotIndexes = this.selectedSlots.map(s => s.slot_index);
    
    const occupiedMap: { [equipmentId: string]: number } = {};
    const processedGroups = new Set<string>();

    try {
      const q = query(reservationsRef, 
        where("date", "in", uniqueDates),
        where("status", "in", ["pending", "approved"])
      );

      const snap = await getDocs(q);
      
      snap.forEach(doc => {
        const res = doc.data();
        const groupId = res['reservation_group'];

        // Contamos solo si el slot coincide y no hemos procesado este grupo de reserva
        if (slotIndexes.includes(res['slot_index']) && !processedGroups.has(groupId)) {
          const requestedItems = res['requested_items'] || [];
          requestedItems.forEach((item: any) => {
            occupiedMap[item.id] = (occupiedMap[item.id] || 0) + (item.quantity || 0);
          });
          processedGroups.add(groupId);
        }
      });

      this.processCategories(this.baseEquipment, occupiedMap);
    } catch (e) {
      console.error("Error en disponibilidad:", e);
      this.processCategories(this.baseEquipment, {});
    }
  }

  private processCategories(data: any[], occupiedMap: { [key: string]: number }) {
    const groups = data.reduce((acc, item) => {
      const type = item.type || 'Otros';
      if (!acc[type]) acc[type] = [];
      
      const used = occupiedMap[item.id] || 0;
      const available = Math.max(0, (item.total_stock || 0) - used);

      acc[type].push({ 
        ...item, 
        available_stock: available, 
        selected_quantity: 0 
      });
      return acc;
    }, {});

    this.categories = Object.keys(groups).map(type => ({
      type: type,
      items: groups[type],
      expanded: false,
      totalSelectedInCategory: 0
    }));
  }

  toggleCategory(selectedGroup: EquipmentGroup) {
    if (selectedGroup.expanded) {
      selectedGroup.expanded = false;
    } else {
      this.categories.forEach(g => g.expanded = false);
      selectedGroup.expanded = true;
    }
  }

  add(item: Equipment, group: EquipmentGroup) {
    if (item.selected_quantity < item.available_stock) {
      item.selected_quantity++;
      group.totalSelectedInCategory++;
    }
  }

  remove(item: Equipment, group: EquipmentGroup) {
    if (item.selected_quantity > 0) {
      item.selected_quantity--;
      group.totalSelectedInCategory--;
    }
  }

  ngOnDestroy() {
    if (this.dataSubscription) this.dataSubscription.unsubscribe();
  }
}