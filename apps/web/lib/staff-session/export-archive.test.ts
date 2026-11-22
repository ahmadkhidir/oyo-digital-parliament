/**
 * The export archive (`C-036`, `C-067`).
 *
 * A stored-entry ZIP has a readable signature and two entries; the bytes are deterministic because
 * the timestamps are fixed. The test reads the local headers back rather than trusting the writer.
 */
import { describe, expect, it } from 'vitest';
import { zipStore } from './export-archive';

describe('zipStore', () => {
  const encoder = new TextEncoder();
  const entries = [
    { name: 'member-data.json', data: encoder.encode('{"member":"mbr_TEST"}') },
    { name: 'manifest.txt', data: encoder.encode('generated: 2026-11-22T10:00:00Z') },
  ];

  it('writes a ZIP local-file signature and both entries', () => {
    const bytes = zipStore(entries);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('member-data.json');
    expect(text).toContain('manifest.txt');
    expect(text).toContain('{"member":"mbr_TEST"}');
  });

  it('is deterministic for the same entries', () => {
    expect(Array.from(zipStore(entries))).toEqual(Array.from(zipStore(entries)));
  });
});
