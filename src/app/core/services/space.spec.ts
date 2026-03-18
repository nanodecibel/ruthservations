import { TestBed } from '@angular/core/testing';

import { Space } from './space';

describe('Space', () => {
  let service: Space;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Space);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
