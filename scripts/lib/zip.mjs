/** Port da fluxa-core/src/integrations/agent-pack/zip.ts (F01). */

import { deflateRawSync, inflateRawSync } from "node:zlib";
import { validatePackEntryPath } from "./sanitize.mjs";

export const AGENT_PACK_MAX_ZIP_BYTES = 10 * 1024 * 1024;
export const AGENT_PACK_MAX_ENTRIES = 64;
export const AGENT_PACK_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
export const AGENT_PACK_MAX_FILE_BYTES = 5 * 1024 * 1024;

export class AgentPackZipError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentPackZipError";
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

function dosDateTime(date = new Date()) {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function normalizeZipPath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function zipEntries(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  const now = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(normalizeZipPath(entry.path), "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const method = 8;

    const local = Buffer.alloc(30 + name.length + compressed.length);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    compressed.copy(local, 30 + name.length);
    parts.push(local);

    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(CENTRAL_SIG, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(now.time, 12);
    cd.writeUInt16LE(now.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    name.copy(cd, 46);
    central.push(cd);

    offset += local.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralBuf, end]);
}

function findEndOfCentralDirectory(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_SIG) return i;
  }
  return -1;
}

export function unzipBuffer(buf) {
  if (buf.length > AGENT_PACK_MAX_ZIP_BYTES) {
    throw new AgentPackZipError(
      `ZIP troppo grande: ${buf.length} bytes (max ${AGENT_PACK_MAX_ZIP_BYTES})`,
    );
  }

  const out = new Map();
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new AgentPackZipError("ZIP non valido: EOCD assente");

  const centralOffset = buf.readUInt32LE(eocd + 16);
  const centralCount = buf.readUInt16LE(eocd + 10);
  if (centralCount > AGENT_PACK_MAX_ENTRIES) {
    throw new AgentPackZipError(
      `Troppe voci ZIP: ${centralCount} (max ${AGENT_PACK_MAX_ENTRIES})`,
    );
  }

  let totalUncompressed = 0;
  let pos = centralOffset;

  for (let i = 0; i < centralCount; i++) {
    if (buf.readUInt32LE(pos) !== CENTRAL_SIG) {
      throw new AgentPackZipError("ZIP non valido: central directory corrotta");
    }
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    try {
      validatePackEntryPath(name);
    } catch (err) {
      throw new AgentPackZipError(
        err instanceof Error ? err.message : `Path ZIP non valido: ${name}`,
      );
    }

    if (uncompSize > AGENT_PACK_MAX_FILE_BYTES) {
      throw new AgentPackZipError(
        `File ZIP troppo grande: ${name} (${uncompSize} bytes)`,
      );
    }
    totalUncompressed += uncompSize;
    if (totalUncompressed > AGENT_PACK_MAX_UNCOMPRESSED_BYTES) {
      throw new AgentPackZipError(
        `Dimensione decompressa totale oltre il limite (${AGENT_PACK_MAX_UNCOMPRESSED_BYTES} bytes)`,
      );
    }

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new AgentPackZipError(`Metodo ZIP non supportato: ${method}`);
    }
    if (data.length !== uncompSize) {
      throw new AgentPackZipError(`Dimensione non coerente per ${name}`);
    }
    out.set(normalizeZipPath(name), data);
  }

  return out;
}
