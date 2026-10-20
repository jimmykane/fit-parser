import { describe, expect, it, vi } from 'vitest'
import FitParser, { FitBaseType, FitEncoder, readFitMessages } from '../src/fit-parser.js'

interface Field {
  number: number
  baseType: number
  bytes: number[]
}

function unsigned(value: number, size: 2 | 4, littleEndian: boolean): number[] {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  if (size === 2)
    view.setUint16(0, value, littleEndian)
  else
    view.setUint32(0, value, littleEndian)
  return Array.from(bytes)
}

function message(number: number, fields: Field[], littleEndian: boolean): number[] {
  return [
    0x40,
    0,
    littleEndian ? 0 : 1,
    ...unsigned(number, 2, littleEndian),
    fields.length,
    ...fields.flatMap(field => [field.number, field.bytes.length, field.baseType]),
    0,
    ...fields.flatMap(field => field.bytes),
  ]
}

function file(messages: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(12 + messages.length + 2)
  bytes.set([12, 0x20, 1, 0])
  const view = new DataView(bytes.buffer)
  view.setUint32(4, messages.length, true)
  bytes.set([0x2E, 0x46, 0x49, 0x54], 8)
  bytes.set(messages, 12)
  view.setUint16(bytes.length - 2, FitEncoder.calculateCRC(bytes.subarray(0, -2)), true)
  return bytes
}

const start = new Date('2026-01-02T10:00:00Z')
const timestamp = FitEncoder.toFitTimestamp(start)

function workout(littleEndian: boolean, endianFlag: boolean): Uint8Array<ArrayBuffer> {
  const field = (number: number, value: number, size: 2 | 4): Field => ({
    number,
    baseType: (size === 2 ? FitBaseType.Uint16 : FitBaseType.Uint32) & (endianFlag ? 0xFF : 0x7F),
    bytes: unsigned(value, size, littleEndian),
  })
  const summary = [field(2, timestamp, 4), field(253, timestamp + 3, 4), field(7, 3000, 4), field(8, 3000, 4), field(11, 7, 2)]
  return file([
    ...[0, 1, 2].flatMap(second => message(20, [
      field(253, timestamp + second, 4),
      field(7, 257 + second, 2),
    ], littleEndian)),
    ...message(19, summary, littleEndian),
    ...message(18, [...summary, { number: 5, baseType: FitBaseType.Enum, bytes: [11] }], littleEndian),
  ])
}

describe('base-type IDs without the endian flag', () => {
  it.each([false, true])('decodes session, lap and record timing with littleEndian=%s', async (littleEndian) => {
    const bytes = workout(littleEndian, false)
    const canonical = workout(littleEndian, true)
    for (const strict of [false, true]) {
      const parser = new FitParser({ force: false, strict, mode: 'both' })
      const parsed = await parser.parseAsync(bytes.buffer)
      expect(parsed).toEqual(await parser.parseAsync(canonical.buffer))
      expect(parsed.sessions?.[0]).toMatchObject({
        start_time: start,
        timestamp: new Date(+start + 3000),
        total_elapsed_time: 3,
        total_timer_time: 3,
        total_calories: 7,
        sport: 'walking',
      })
      expect(parsed.laps?.[0]).toMatchObject({ start_time: start, total_elapsed_time: 3 })
      expect(parsed.records).toEqual([0, 1, 2].map(second => ({
        timestamp: new Date(+start + second * 1000),
        power: 257 + second,
      })))
      const callback = vi.fn()
      parser.parse(bytes.buffer, callback)
      expect(callback).toHaveBeenCalledWith(undefined, parsed)
      const concatenated = Uint8Array.from([...bytes, ...canonical])
      expect(await parser.parseFilesAsync(concatenated.buffer)).toEqual([parsed, parsed])
    }
    const retained = await new FitParser({ force: false, includeRawMessages: [20] }).parseAsync(bytes.buffer)
    expect(retained.raw_messages?.[0]).toMatchObject({
      little_endian: littleEndian,
      fields: [
        { field_definition_number: 253, base_type: 6, raw_value: unsigned(timestamp, 4, littleEndian) },
        { field_definition_number: 7, base_type: 4, raw_value: unsigned(257, 2, littleEndian) },
      ],
    })
    expect(readFitMessages(bytes).issues).toEqual([])
  })

  it.each([false, true])('omits invalid sentinels and preserves zero values with littleEndian=%s', async (littleEndian) => {
    const bytes = file([0xFFFFFFFF, 0].flatMap(value => message(20, [
      { number: 253, baseType: 6, bytes: unsigned(value, 4, littleEndian) },
      { number: 7, baseType: 4, bytes: unsigned(value & 0xFFFF, 2, littleEndian) },
      { number: 3, baseType: 2, bytes: [140] },
    ], littleEndian)))
    const parsed = await new FitParser({ force: false, strict: true }).parseAsync(bytes.buffer)
    expect(parsed.records).toEqual([
      { heart_rate: 140 },
      { timestamp: new Date('1989-12-31T00:00:00Z'), power: 0, heart_rate: 140 },
    ])
  })

  it.each([0x26, 0x46, 0x66, 0xA6, 0xC6, 0xE6, 0x1F, 0x9F])(
    'does not normalize reserved or unknown type code %s into a timestamp',
    async (baseType) => {
      const bytes = file(message(20, [
        { number: 253, baseType, bytes: unsigned(timestamp, 4, true) },
        { number: 3, baseType: 2, bytes: [140] },
      ], true))
      const parsed = await new FitParser({ force: false, strict: true, includeUnmappedMessages: true }).parseAsync(bytes.buffer)
      expect(parsed.records).toEqual([{ heart_rate: 140 }])
      expect(parsed.unmapped_messages?.[0].fields[0]).toEqual({
        field_definition_number: 253,
        base_type: baseType,
        raw_value: unsigned(timestamp, 4, true),
      })
      expect(() => readFitMessages(bytes)).toThrow('invalid_structure')
    },
  )

  it.each([3, 4, 5])('does not reinterpret an incompatible wire type %s as uint32', async (baseType) => {
    const bytes = file(message(20, [
      { number: 253, baseType, bytes: unsigned(timestamp, baseType === 5 ? 4 : 2, true) },
      { number: 3, baseType: 2, bytes: [140] },
    ], true))
    const parsed = await new FitParser({ force: false, strict: true }).parseAsync(bytes.buffer)
    expect(parsed.records).toEqual([{ heart_rate: 140 }])
  })
})
