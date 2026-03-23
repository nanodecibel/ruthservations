import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EquipmentPicker } from './equipment-picker';

describe('EquipmentPicker', () => {
  let component: EquipmentPicker;
  let fixture: ComponentFixture<EquipmentPicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentPicker],
    }).compileComponents();

    fixture = TestBed.createComponent(EquipmentPicker);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
