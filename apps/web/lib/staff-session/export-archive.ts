/**
 * A tiny, dependency-free ZIP writer for the member export (`C-036`, `C-067`).
 *
 * `C-036` serves the export as `application/zip`, and the project's dependency rule asks for an
 * agreed package rather than a hand-rolled format. The archive is one JSON document plus a small
 * manifest, so the one method every reader supports is enough: stored (uncompressed) entries with a
 * UTF-8 name. This module writes exactly that, deterministically, and nothing else.
 *
 * The timestamps are fixed at the DOS epoch (1980-01-01) so two runs over the same record produce the
 * same bytes; an export is not a place for the time the file happened to be written.
 */

/** One file in the archive. */
export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

/** CRC-32 of the bytes, as the ZIP local and central headers record it. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A little-endian writer over a growable byte array. */
class ByteWriter {
  private readonly bytes: number[] = [];

  u16(value: number): this {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  u32(value: number): this {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    return this;
  }

  raw(bytes: Uint8Array): this {
    for (const byte of bytes) this.bytes.push(byte);
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** The fixed DOS date and time: 1980-01-01 00:00:00. */
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

/** The general-purpose flag bit 11: file names are UTF-8. */
const UTF8_FLAG = 0x0800;

/** The compression method: stored, no compression. */
const STORED = 0;

/** The ZIP version a stored archive needs. */
const VERSION = 20;

/**
 * Build one stored-entry ZIP.
 *
 * @param entries - The files, in the order a reader should see them.
 * @returns The archive bytes.
 */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local = new ByteWriter();
  const central = new ByteWriter();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = local.toBytes().length;

    local
      .u32(0x04034b50)
      .u16(VERSION)
      .u16(UTF8_FLAG)
      .u16(STORED)
      .u16(DOS_TIME)
      .u16(DOS_DATE)
      .u32(crc)
      .u32(entry.data.length)
      .u32(entry.data.length)
      .u16(name.length)
      .u16(0)
      .raw(name)
      .raw(entry.data);

    central
      .u32(0x02014b50)
      .u16(VERSION)
      .u16(VERSION)
      .u16(UTF8_FLAG)
      .u16(STORED)
      .u16(DOS_TIME)
      .u16(DOS_DATE)
      .u32(crc)
      .u32(entry.data.length)
      .u32(entry.data.length)
      .u16(name.length)
      .u16(0)
      .u16(0)
      .u16(0)
      .u16(0)
      .u32(0)
      .u32(offset)
      .raw(name);
  }

  const localBytes = local.toBytes();
  const centralBytes = central.toBytes();
  const end = new ByteWriter()
    .u32(0x06054b50)
    .u16(0)
    .u16(0)
    .u16(entries.length)
    .u16(entries.length)
    .u32(centralBytes.length)
    .u32(localBytes.length)
    .u16(0)
    .toBytes();

  const out = new Uint8Array(localBytes.length + centralBytes.length + end.length);
  out.set(localBytes, 0);
  out.set(centralBytes, localBytes.length);
  out.set(end, localBytes.length + centralBytes.length);
  return out;
}
