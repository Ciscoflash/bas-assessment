import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, isValidIsoDate } from '../../src/money/index.js';

describe('dates', () => {
  it('counts days as later minus earlier', () => {
    expect(daysBetween('2026-01-01', '2026-03-02')).toBe(60);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // leap year
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1);
    expect(daysBetween('2026-03-02', '2026-01-01')).toBe(-60);
  });
  it('adds months with end-of-month clamping, anchored to the start date', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('adds days', () => {
    expect(addDays('2026-01-01', 60)).toBe('2026-03-02');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    for (let i = -800; i < 800; i += 37) expect(daysBetween('2026-06-15', addDays('2026-06-15', i))).toBe(i);
  });
  it('rejects impossible dates', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-1-01')).toBe(false);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });
});
