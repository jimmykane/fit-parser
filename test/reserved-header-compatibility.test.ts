import { describe, expect, it, vi } from 'vitest'
import FitParser, { FitEncoder, readFitMessages } from '../src/fit-parser.js'

function wrap(packets: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(14 + packets.length + 2)
  bytes[0] = 14
  bytes[1] = 32
  bytes.set([46, 70, 73, 84], 8)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, packets.length, true)
  view.setUint16(12, FitEncoder.calculateCRC(bytes.subarray(0, 12)), true)
  bytes.set(packets, 14)
  view.setUint16(bytes.length - 2, FitEncoder.calculateCRC(bytes.subarray(0, -2)), true)
  return bytes
}

const definition = [0x40, 0, 0, 20, 0, 1, 3, 1, 2]

describe('reserved normal-header bit compatibility', () => {
  it.each([false, true])('recovers only bit 4 in all ordinary APIs with force=%s', async (force) => {
    for (const definitionHeader of [0x40, 0x50]) {
      for (const dataHeader of [0, 0x10]) {
        const bytes = wrap([definitionHeader, ...definition.slice(1), dataHeader, 140])
        const original = bytes.slice()
        const parser = new FitParser({ force, includeUnmappedMessages: true })
        const expected = await parser.parseAsync(wrap([...definition, 0, 140]).buffer)
        expect(await parser.parseAsync(bytes.buffer)).toEqual(expected)
        expect(await parser.parseFilesAsync(bytes.buffer)).toEqual([expected])
        const callback = vi.fn()
        parser.parse(bytes.buffer, callback)
        expect(callback).toHaveBeenCalledExactlyOnceWith(undefined, expected)
        expect(bytes).toEqual(original)
      }
    }
  })

  it.each([false, true])('keeps strict and raw capture rejection with force=%s', async (force) => {
    for (const packets of [[0x50, ...definition.slice(1), 0, 140], [...definition, 0x10, 140]]) {
      const bytes = wrap(packets)
      for (const options of [{ strict: true }, { includeRawMessages: true }, { includeRawMessages: [20] }]) {
        const parser = new FitParser({ force, ...options })
        await expect(parser.parseAsync(bytes.buffer)).rejects.toThrow(/Invalid FIT/)
        await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow(/Invalid FIT/)
        expect(() => parser.parse(bytes.buffer, vi.fn())).toThrow(/Invalid FIT/)
      }
      expect(() => readFitMessages(bytes)).toThrow()
    }
  })

  it.each([0x20, 0x30])('still rejects data-header bits %s in ordinary decoding', async (header) => {
    for (const force of [false, true]) {
      const bytes = wrap([...definition, header, 140])
      await expect(new FitParser({ force }).parseAsync(bytes.buffer)).rejects.toThrow('Invalid FIT data record header')
    }
  })

  it.each([false, true])('requires complete definitions and native/developer payloads with force=%s', async (force) => {
    const malformed = [
      [0x50, 0, 0], // Incomplete fixed definition.
      [0x50, 0, 0, 20, 0, 1, 3], // Incomplete native descriptor.
      [0x70, 0, 0, 20, 0, 0], // Missing developer field count.
      [0x70, 0, 0, 20, 0, 0, 1, 1], // Incomplete developer descriptor.
      [0x50, ...definition.slice(1), 0], // Ordinary data using a flagged definition.
      [...definition, 0x10], // Flagged data using an ordinary definition.
      [0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 4, 0, 0x10, 140, 1],
      [0x40, 1, 0, 20, 0, 1, 3, 1, 2, 0x10, 140], // Reserved definition byte.
      [0x40, 0, 2, 20, 0, 1, 3, 1, 2, 0x10, 140], // Invalid architecture.
      [0x10, 140], // Missing definition.
    ]
    for (const packets of malformed) {
      const bytes = wrap(packets)
      const parser = new FitParser({ force })
      await expect(parser.parseAsync(bytes.buffer)).rejects.toThrow(/Invalid FIT|no local definition/)
      await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow(/Invalid FIT|no local definition/)
    }
  })

  it('preserves developer fields and valid compressed timestamp headers', async () => {
    const developer = wrap([0x70, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 2, 0, 0x10, 140, 52, 18])
    const parsed = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(developer.buffer)
    expect(parsed.records?.[0].heart_rate).toBe(140)
    expect(parsed.unmapped_messages?.[0].developer_fields[0].raw_value).toEqual([52, 18])
    const compressed = wrap([0x40, 0, 0, 20, 0, 2, 253, 4, 134, 3, 1, 2, 0, 0, 4, 0, 0, 120, 0x90, 140])
    expect((await new FitParser({ force: false, strict: true }).parseAsync(compressed.buffer)).records)
      .toHaveLength(2)
  })

  it('preserves checksum validation and file-local definition state', async () => {
    const bytes = wrap([...definition, 0x10, 140])
    bytes[bytes.length - 1] ^= 0xFF
    await expect(new FitParser({ force: false }).parseAsync(bytes.buffer)).rejects.toBe('File CRC mismatch')
    expect((await new FitParser({ force: true }).parseAsync(bytes.buffer)).records?.[0].heart_rate).toBe(140)
    const first = wrap([...definition, 0x10, 140])
    const second = wrap([0x10, 150])
    const joined = new Uint8Array(first.length + second.length)
    joined.set(first)
    joined.set(second, first.length)
    await expect(new FitParser().parseFilesAsync(joined.buffer)).rejects.toThrow('no local definition')
  })
})
