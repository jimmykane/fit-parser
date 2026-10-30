import type { FitParserOptions } from '../src/fit-parser.js'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { readRecord } from '../src/binary.js'
import FitParser, { FitEncoder } from '../src/fit-parser.js'

function wrap(packets: number[]): Buffer<ArrayBuffer> {
  const bytes = Buffer.alloc(14 + packets.length + 2)
  bytes[0] = 14
  bytes[1] = 32
  bytes.set([46, 70, 73, 84], 8)
  bytes.writeUInt32LE(packets.length, 4)
  bytes.writeUInt16LE(FitEncoder.calculateCRC(bytes.subarray(0, 12)), 12)
  bytes.set(packets, 14)
  bytes.writeUInt16LE(FitEncoder.calculateCRC(bytes.subarray(0, -2)), bytes.length - 2)
  return bytes
}

const definition = [0x40, 0, 0, 20, 0, 1, 3, 1, 2]
const timestampDefinition = [0x40, 0, 0, 20, 0, 2, 253, 4, 134, 3, 1, 2]
const cases: {
  name: string
  packets: number[]
  options?: FitParserOptions
  message: string
  byteOffset: number
  recordHeader: number
}[] = [
  {
    name: 'invalid data header',
    packets: [0x20],
    message: 'Invalid FIT data record header',
    byteOffset: 14,
    recordHeader: 0x20,
  },
  {
    name: 'incomplete fixed definition',
    packets: [0x40, 0, 0],
    options: { strict: true },
    message: 'Invalid FIT definition bounds',
    byteOffset: 14,
    recordHeader: 0x40,
  },
  {
    name: 'invalid definition architecture',
    packets: [0x40, 0, 2, 20, 0, 0],
    options: { strict: true },
    message: 'Invalid FIT definition',
    byteOffset: 14,
    recordHeader: 0x40,
  },
  {
    name: 'reserved definition header in raw capture',
    packets: [0x50, ...definition.slice(1)],
    options: { includeRawMessages: true },
    message: 'Invalid FIT definition',
    byteOffset: 14,
    recordHeader: 0x50,
  },
  {
    name: 'incomplete native descriptor',
    packets: [0x40, 0, 0, 20, 0, 1, 3],
    options: { includeRawMessages: true },
    message: 'Invalid FIT definition',
    byteOffset: 14,
    recordHeader: 0x40,
  },
  {
    name: 'missing developer field count',
    packets: [0x60, 0, 0, 20, 0, 0],
    options: { strict: true },
    message: 'Invalid FIT definition',
    byteOffset: 14,
    recordHeader: 0x60,
  },
  {
    name: 'incomplete developer descriptor',
    packets: [0x60, 0, 0, 20, 0, 0, 1, 1],
    options: { strict: true },
    message: 'Invalid FIT developer definition bounds',
    byteOffset: 14,
    recordHeader: 0x60,
  },
  {
    name: 'incompatible definition for reserved header recovery',
    packets: [0x40, 1, ...definition.slice(2), 0x10, 140],
    message: 'Invalid FIT definition for reserved header compatibility',
    byteOffset: 23,
    recordHeader: 0x10,
  },
  {
    name: 'incomplete native data',
    packets: [...definition, 0],
    options: { strict: true },
    message: 'Invalid FIT data record bounds',
    byteOffset: 23,
    recordHeader: 0,
  },
  {
    name: 'incomplete developer data',
    packets: [0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 4, 0, 0, 140, 1],
    options: { strict: true },
    message: 'Invalid FIT data record bounds',
    byteOffset: 27,
    recordHeader: 0,
  },
  {
    name: 'compressed timestamp without an earlier timestamp',
    packets: [...timestampDefinition, 0x80, 120],
    options: { strict: true },
    message: 'Compressed timestamp requires a previous timestamp',
    byteOffset: 26,
    recordHeader: 0x80,
  },
  {
    name: 'compressed timestamp overflow',
    packets: [...timestampDefinition, 0, 254, 255, 255, 255, 120, 0x80, 120],
    message: 'Compressed timestamp exceeds FIT uint32 range',
    byteOffset: 32,
    recordHeader: 0x80,
  },
  {
    name: 'undefined compressed local slot',
    packets: [0xA5],
    message: 'FIT data record has no local definition',
    byteOffset: 14,
    recordHeader: 0xA5,
  },
]

describe.each(cases)('record diagnostics: $name', ({ packets, options, message, byteOffset, recordHeader }) => {
  const expected = { message, byteOffset, recordHeader }

  it.each([false, true])('keeps the same rejection with force=%s', async (force) => {
    const bytes = wrap(packets)
    const before = Buffer.from(bytes)
    const parser = new FitParser({ ...options, force })
    await expect(parser.parseAsync(bytes)).rejects.toMatchObject(expected)
    await expect(parser.parseFilesAsync(bytes)).rejects.toMatchObject(expected)
    const callback = vi.fn()
    let failure: unknown
    try {
      parser.parse(bytes, callback)
    }
    catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject(expected)
    expect(callback).not.toHaveBeenCalled()
    expect(bytes).toEqual(before)
  })

  it('uses the supplied view and includes preceding files exactly once', async () => {
    const bytes = wrap(packets)
    const parser = new FitParser({ ...options, force: false, mode: 'both' })
    const padded = Buffer.concat([Buffer.alloc(11), bytes, Buffer.alloc(7)])
    const before = Buffer.from(padded)
    await expect(parser.parseAsync(padded.subarray(11, 11 + bytes.length))).rejects.toMatchObject(expected)
    await expect(parser.parseAsync(Uint8Array.from(bytes).buffer)).rejects.toMatchObject(expected)
    const prefix = wrap([...definition, 0, 120])
    const joined = Buffer.concat([prefix, prefix, bytes])
    const paddedJoined = Buffer.concat([Buffer.alloc(13), joined, Buffer.alloc(9)])
    const beforeJoined = Buffer.from(paddedJoined)
    await expect(parser.parseFilesAsync(paddedJoined.subarray(13, 13 + joined.length))).rejects.toMatchObject({
      ...expected,
      byteOffset: prefix.length * 2 + byteOffset,
    })
    expect(padded).toEqual(before)
    expect(paddedJoined).toEqual(beforeJoined)
  })
})

describe('out-of-data record bounds', () => {
  it.each([-1, 1, 2])('omits recordHeader when offset %i is outside the data section', (startIndex) => {
    const bytes = Uint8Array.from([0x40, 0x99])
    let failure: unknown
    try {
      readRecord(bytes, [], [], startIndex, {}, undefined, 0, undefined, undefined, 1)
    }
    catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ message: 'Invalid FIT record bounds', byteOffset: startIndex })
    expect(failure).not.toHaveProperty('recordHeader')
  })
})
