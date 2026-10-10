import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

function concatenate(...files: Uint8Array[]): ArrayBuffer {
  const bytes = new Uint8Array(files.reduce((length, file) => length + file.length, 0))
  let offset = 0
  for (const file of files) {
    bytes.set(file, offset)
    offset += file.length
  }
  return bytes.buffer
}

function wrap(packets: number[], headerLength = 14): Uint8Array<ArrayBuffer> {
  const file = new Uint8Array(headerLength + packets.length + 2)
  file[0] = headerLength
  file[1] = 32
  file.set([46, 70, 73, 84], 8)
  const view = new DataView(file.buffer)
  view.setUint32(4, packets.length, true)
  if (headerLength === 14) {
    view.setUint16(12, FitEncoder.calculateCRC(file.subarray(0, 12)), true)
  }
  file.set(packets, headerLength)
  view.setUint16(file.length - 2, FitEncoder.calculateCRC(file.subarray(0, -2)), true)
  return file
}

function record(heartRate: number): Uint8Array {
  return new FitEncoder().writeMessage(20, [
    { number: 3, size: 1, baseType: FitBaseType.Uint8, value: heartRate },
    { number: 6, size: 2, baseType: FitBaseType.Uint16, value: 3000 },
  ]).close()
}

describe('concatenated FIT files', () => {
  it('preserves file order and independent records with the configured options', async () => {
    const files = await new FitParser({ force: false, speedUnit: 'km/h' })
      .parseFilesAsync(concatenate(record(120), record(140), record(160)))
    expect(files).toHaveLength(3)
    expect(files.map(file => file.records?.map(value => value.heart_rate)))
      .toEqual([[120], [140], [160]])
    expect(files.map(file => file.records?.[0].speed)).toEqual([10.8, 10.8, 10.8])
  })

  it('returns the same single-file result and keeps the existing API compatible', async () => {
    const parser = new FitParser({ force: false })
    const first = record(120)
    const second = record(140)
    const expected = await parser.parseAsync(concatenate(first))
    expect(await parser.parseFilesAsync(concatenate(first))).toEqual([expected])
    expect(await parser.parseAsync(concatenate(first, second))).toEqual(expected)
  })

  it('respects Buffer offsets and lengths without reading surrounding bytes', async () => {
    const input = Buffer.from(concatenate(record(120), record(140)))
    const padded = Buffer.concat([Buffer.from([1, 2, 3]), input, Buffer.from([4, 5])])
    const view = padded.subarray(3, 3 + input.length)
    expect(view.byteOffset).toBeGreaterThan(0)
    const files = await new FitParser({ force: false }).parseFilesAsync(view)
    expect(files.map(file => file.records?.[0].heart_rate)).toEqual([120, 140])
  })

  it('accepts mixed 12-byte and 14-byte headers, including empty data sections', async () => {
    const files = await new FitParser({ force: false })
      .parseFilesAsync(concatenate(wrap([], 12), record(120), wrap([])))
    expect(files).toHaveLength(3)
    expect(files.map(file => file.records?.length)).toEqual([0, 1, 0])
  })

  it('keeps raw message occurrence indexes local to each file', async () => {
    const files = await new FitParser({ force: false, includeRawMessages: true, rawMessagesOnly: true })
      .parseFilesAsync(concatenate(record(120), record(140)))
    expect(files.map(file => file.raw_messages?.[0].message_index)).toEqual([0, 0])
    expect(files.map(file => file.raw_messages?.[0].fields[0].raw_value)).toEqual([[120], [140]])
    expect(files.every(file => file.records === undefined)).toBe(true)
  })

  it('does not carry developer descriptions into another file', async () => {
    // Description: developer index 0, field 1, uint16, name "value".
    const description = [0x41, 0, 0, 206, 0, 4, 0, 1, 2, 1, 1, 2, 2, 1, 2, 3, 6, 7, 1, 0, 1, 132, 118, 97, 108, 117, 101, 0]
    const definition = [0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 2, 0]
    const first = wrap([...description, ...definition, 0, 120, 52, 18])
    const second = wrap([...definition, 0, 140, 53, 18])
    const files = await new FitParser({ force: false, includeUnmappedMessages: true })
      .parseFilesAsync(concatenate(first, second))
    expect(files[0].records?.[0]).toMatchObject({ heart_rate: 120, value: 4660 })
    expect(files[1].records?.[0]).not.toHaveProperty('value')
    expect(files[1].unmapped_messages?.[0].developer_fields[0].raw_value).toEqual([53, 18])
  })

  it('does not carry native definitions into another file', async () => {
    await expect(new FitParser({ force: false })
      .parseFilesAsync(concatenate(record(120), wrap([0, 140]))))
      .rejects
      .toBeDefined()
  })

  it('does not carry a compressed timestamp reference into another file', async () => {
    const first = new FitEncoder().writeMessage(20, [
      { number: 253, size: 4, baseType: FitBaseType.Uint32, value: 1000 },
    ]).close()
    const second = wrap([0x40, 0, 0, 20, 0, 1, 3, 1, 2, 0x80, 140])
    await expect(new FitParser({ force: false }).parseFilesAsync(concatenate(first, second)))
      .rejects
      .toThrow('Compressed timestamp requires a previous timestamp')
    const recovered = await new FitParser({ force: true }).parseFilesAsync(concatenate(first, second))
    expect(recovered[1].records?.[0].timestamp).toBeUndefined()
  })

  it.each([0, 1])('validates file CRC for file %s and follows the force option', async (index) => {
    const files = [record(120), record(140)]
    files[index][files[index].length - 1] ^= 0xFF
    await expect(new FitParser({ force: false }).parseFilesAsync(concatenate(...files)))
      .rejects
      .toThrow('File CRC mismatch')
    expect(await new FitParser({ force: true }).parseFilesAsync(concatenate(...files)))
      .toHaveLength(2)
  })

  it('validates the header CRC in an appended file', async () => {
    const second = record(140)
    second[12] ^= 0xFF
    await expect(new FitParser({ force: false })
      .parseFilesAsync(concatenate(record(120), second)))
      .rejects
      .toThrow('Header CRC mismatch')
  })

  it.each([false, true])('rejects records and definitions crossing the data boundary with force=%s', async (force) => {
    const parser = new FitParser({ force, strict: true })
    const malformed = [
      // The record has a header but is missing its one-byte native value.
      wrap([0x40, 0, 0, 20, 0, 1, 3, 1, 2, 0]),
      // The temperature recovery must not turn a CRC byte into a value.
      wrap([0x40, 0, 0, 20, 0, 1, 13, 1, 2, 0]),
      // The developer field has only one of its two declared bytes.
      wrap([0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 2, 0, 0, 140, 1]),
      // A native field definition is missing its size and base type.
      wrap([0x40, 0, 0, 20, 0, 1, 3]),
      // An incomplete definition can otherwise produce a NaN next index.
      wrap([0x40, 0, 0]),
    ]
    for (const file of malformed) {
      await expect(parser.parseFilesAsync(concatenate(record(120), file)))
        .rejects
        .toThrow(/Invalid FIT (data record|definition).*|Invalid FIT developer definition bounds/)
    }
  })

  it.each([false, true])('rejects empty, truncated, or trailing input with force=%s', async (force) => {
    const parser = new FitParser({ force, strict: true })
    const complete = record(120)
    const oversized = complete.slice()
    new DataView(oversized.buffer).setUint32(4, 0xFFFFFFFF, true)
    const badSignature = complete.slice()
    badSignature[8] = 0
    const badHeader = complete.slice()
    badHeader[0] = 13
    const inputs = [
      new ArrayBuffer(0),
      concatenate(complete, complete.subarray(0, 13)),
      concatenate(complete, complete.subarray(0, -1)),
      concatenate(complete, oversized),
      concatenate(complete, badSignature),
      concatenate(complete, badHeader),
      concatenate(complete, new Uint8Array([0])),
      concatenate(complete, new Uint8Array(20)),
    ]
    for (const input of inputs) {
      await expect(parser.parseFilesAsync(input)).rejects.toBeDefined()
    }
  })
})
