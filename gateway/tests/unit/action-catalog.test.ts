import { describe, expect, it } from 'vitest';
import {
  ACTION_CATEGORIES,
  ACTION_OPERATIONS,
  actionCatalogPayload,
  isCatalogOperation,
  unknownCatalogOperations,
} from '../../src/actors/action-catalog.js';

describe('action catalog', () => {
  it('exposes 8 action categories', () => {
    expect(ACTION_CATEGORIES).toHaveLength(8);
    expect(ACTION_CATEGORIES.map((c) => c.id)).toEqual([
      'READ',
      'CREATE',
      'UPDATE',
      'DELETE',
      'EXECUTE',
      'TRANSMIT',
      'INVOKE',
      'OTHER',
    ]);
  });

  it('exposes a curated operation vocabulary', () => {
    expect(ACTION_OPERATIONS.length).toBeGreaterThanOrEqual(10);
    expect(ACTION_OPERATIONS.length).toBeLessThanOrEqual(16);
    expect(isCatalogOperation('write')).toBe(true);
    expect(isCatalogOperation('field_update')).toBe(true);
    expect(isCatalogOperation('clinical_note')).toBe(true);
    expect(isCatalogOperation('read_claim')).toBe(false);
  });

  it('flags unknown operations', () => {
    expect(
      unknownCatalogOperations(['write', 'field_update', 'update_claim']),
    ).toEqual(['update_claim']);
  });

  it('returns a stable API payload', () => {
    const payload = actionCatalogPayload();
    expect(payload.categories).toHaveLength(8);
    expect(payload.operations.some((o) => o.id === 'summarize')).toBe(true);
    expect(payload.write_kinds.some((k) => k.id === 'field_update')).toBe(true);
  });
});
