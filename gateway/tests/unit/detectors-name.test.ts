import { describe, expect, it } from 'vitest';
import { detectDeterministic } from '../../src/interrogation/detectors.js';

describe('Deterministic NAME / ADDRESS detection', () => {
  it('tokenizes labeled chart Name fields', () => {
    const text = [
      'Name: Charles Greene',
      'MRN: AB12345',
      'Date of Birth: 1980-01-01',
      'What conditions has Charles Greene been diagnosed with?',
    ].join('\n');
    const detection = detectDeterministic(text);
    const name = detection.entities.find((e) => e.type === 'NAME');
    expect(name).toBeDefined();
    expect(text.slice(name!.start, name!.end)).toBe('Charles Greene');
    expect(detection.entities.some((e) => e.type === 'MRN')).toBe(true);
    expect(detection.entities.some((e) => e.type === 'DOB')).toBe(true);
  });

  it('detects labeled Address fields', () => {
    const text = 'Address: 123 Main Street, Springfield';
    const detection = detectDeterministic(text);
    const address = detection.entities.find((e) => e.type === 'ADDRESS');
    expect(address).toBeDefined();
    expect(text.slice(address!.start, address!.end)).toContain('Main Street');
  });

  it('detects narrative date-of-birth answers as DOB identifiers', () => {
    const text =
      "Mr. Greene's date of birth is listed in the Demographics section as 10/12/1967.";
    const detection = detectDeterministic(text);
    const dob = detection.entities.find((e) => e.type === 'DOB');
    expect(dob).toBeDefined();
    expect(text.slice(dob!.start, dob!.end)).toBe('10/12/1967');
  });
});
