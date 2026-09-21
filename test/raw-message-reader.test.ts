import type { FitMessageReaderError } from '../src/raw-message-reader.js'
import { describe, expect, it } from 'vitest'
import { FitEncoder } from '../src/fit-encoder.js'
import {
  fitTimestampToUnixMilliseconds,
  getFitBaseTypeId,
  readFitMessages,
  readFitStringField,
  readFitUnsignedField,
} from '../src/raw-message-reader.js'

interface NativeField {
  number: number
  baseType: number
  bytes: number[]
}

interface DeveloperField {
  number: number
  developerDataIndex: number
  bytes: number[]
}

function uint32(value: number): number[] {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return Array.from(bytes)
}

function message(
  globalMessageNumber: number,
  fields: NativeField[],
  developerFields: DeveloperField[] = [],
  localMessageNumber = 0,
  compressedTimestamp?: number,
): number[] {
  const definition = [
    0x40 | (developerFields.length ? 0x20 : 0) | localMessageNumber,
    0,
    0,
    globalMessageNumber & 0xFF,
    globalMessageNumber >>> 8,
    fields.length,
    ...fields.flatMap(field => [field.number, field.bytes.length, field.baseType]),
    ...(developerFields.length
      ? [
          developerFields.length,
          ...developerFields.flatMap(field => [
            field.number,
            field.bytes.length,
            field.developerDataIndex,
          ]),
        ]
      : []),
  ]
  const recordHeader = compressedTimestamp === undefined
    ? localMessageNumber
    : 0x80 | (localMessageNumber << 5) | (compressedTimestamp & 31)
  return [
    ...definition,
    recordHeader,
    ...fields.flatMap(field => (
      compressedTimestamp !== undefined && field.number === 253
        ? []
        : field.bytes
    )),
    ...developerFields.flatMap(field => field.bytes),
  ]
}

function fitFile(records: number[], headerSize = 14): Uint8Array {
  const bytes = new Uint8Array(headerSize + records.length + 2)
  const view = new DataView(bytes.buffer)
  bytes.set([headerSize, 0x20, 0xD4, 0x52])
  view.setUint32(4, records.length, true)
  bytes.set([0x2E, 0x46, 0x49, 0x54], 8)
  if (headerSize === 14) {
    view.setUint16(12, FitEncoder.calculateCRC(bytes.subarray(0, 12)), true)
  }
  bytes.set(records, headerSize)
  view.setUint16(
    bytes.length - 2,
    FitEncoder.calculateCRC(bytes.subarray(0, -2)),
    true,
  )
  return bytes
}

describe('lightweight raw FIT message reader', () => {
  it('retains only selected native and developer fields without profile formatting', () => {
    const file = fitFile([
      ...message(20, [{ number: 3, baseType: 2, bytes: [140] }]),
      ...message(
        18,
        [
          { number: 253, baseType: 0x86, bytes: uint32(1_100_000_000) },
          { number: 5, baseType: 0, bytes: [2] },
        ],
        [{ number: 7, developerDataIndex: 3, bytes: [65, 0, 66, 0] }],
        1,
      ),
    ])

    const parsed = readFitMessages(file, { messageNumbers: [18] })

    expect(parsed.protocolVersion).toBe(0x20)
    expect(parsed.profileVersion).toBe(21204)
    expect(parsed.issues).toEqual([])
    expect(parsed.messages).toEqual([{
      globalMessageNumber: 18,
      messageIndex: 0,
      littleEndian: true,
      timestamp: 1_100_000_000,
      fields: [
        {
          fieldNumber: 253,
          size: 4,
          baseType: 0x86,
          bytes: Uint8Array.from(uint32(1_100_000_000)),
        },
        { fieldNumber: 5, size: 1, baseType: 0, bytes: Uint8Array.of(2) },
      ],
      developerFields: [{
        fieldNumber: 7,
        size: 4,
        developerDataIndex: 3,
        bytes: Uint8Array.from([65, 0, 66, 0]),
      }],
    }])
  })

  it('reconstructs compressed timestamps while retaining only wire fields', () => {
    const baseTimestamp = 1_100_000_030
    const compressedTimestamp = baseTimestamp + 4
    const file = fitFile([
      ...message(20, [{ number: 253, baseType: 0x86, bytes: uint32(baseTimestamp) }]),
      ...message(
        18,
        [
          { number: 253, baseType: 0x86, bytes: uint32(0) },
          { number: 5, baseType: 0, bytes: [2] },
        ],
        [],
        2,
        compressedTimestamp,
      ),
    ])

    expect(readFitMessages(file, { messageNumbers: [18] }).messages).toEqual([{
      globalMessageNumber: 18,
      messageIndex: 0,
      littleEndian: true,
      timestamp: compressedTimestamp,
      compressedTimestamp,
      fields: [{ fieldNumber: 5, size: 1, baseType: 0, bytes: Uint8Array.of(2) }],
      developerFields: [],
    }])
  })

  it.each([12, 14])('validates header size %i and supports offset Uint8Array views', (headerSize) => {
    const source = fitFile(message(72, []), headerSize)
    const padded = new Uint8Array(source.length + 9)
    padded.set(source, 5)

    expect(readFitMessages(padded.subarray(5, 5 + source.length)).messages)
      .toMatchObject([{ globalMessageNumber: 72 }])
  })

  it('reports malformed timestamps without discarding other selected fields', () => {
    const file = fitFile(message(18, [
      { number: 253, baseType: 7, bytes: [65, 0] },
      { number: 5, baseType: 0, bytes: [2] },
    ]))

    const parsed = readFitMessages(file, { messageNumbers: [18] })

    expect(parsed.issues).toEqual([{
      code: 'invalid_timestamp',
      globalMessageNumber: 18,
      messageIndex: 0,
    }])
    expect(parsed.messages[0].fields).toHaveLength(2)
  })

  it('rejects invalid input limits, CRCs, headers and record structure with stable codes', () => {
    const good = fitFile(message(72, []))
    const badCRC = good.slice()
    badCRC[badCRC.length - 1] ^= 1
    const badHeader = good.slice()
    badHeader[8] = 0
    const badStructure = fitFile([15])

    expect(() => readFitMessages('invalid' as never)).toThrowError(
      expect.objectContaining<Partial<FitMessageReaderError>>({ code: 'invalid_input' }),
    )
    expect(() => readFitMessages(good, null as never)).toThrowError(
      expect.objectContaining<Partial<FitMessageReaderError>>({ code: 'invalid_input' }),
    )
    expect(() => readFitMessages(good, { maxInputBytes: good.length - 1 })).toThrowError(
      expect.objectContaining<Partial<FitMessageReaderError>>({ code: 'input_limit' }),
    )
    expect(() => readFitMessages(badCRC)).toThrowError(
      expect.objectContaining<Partial<FitMessageReaderError>>({ code: 'invalid_crc' }),
    )
    expect(() => readFitMessages(badHeader)).toThrowError(
      expect.objectContaining<Partial<FitMessageReaderError>>({ code: 'invalid_header' }),
    )
    expect(() => readFitMessages(badStructure)).toThrowError(
      expect.objectContaining<Partial<FitMessageReaderError>>({ code: 'invalid_structure' }),
    )
  })

  it('converts bounded native timestamps to Unix milliseconds', () => {
    expect(fitTimestampToUnixMilliseconds(0)).toBe(Date.UTC(1989, 11, 31))
    expect(() => fitTimestampToUnixMilliseconds(0xFFFFFFFF)).toThrow(RangeError)
  })

  it('provides profile-independent raw field helpers', () => {
    expect(getFitBaseTypeId(0x86)).toBe(6)
    expect(getFitBaseTypeId(0x66)).toBeNull()
    expect(readFitUnsignedField({
      fieldNumber: 1,
      size: 2,
      baseType: 0x84,
      bytes: Uint8Array.of(0x34, 0x12),
    }, 0x84, 2, true)).toBe(0x1234)
    expect(readFitUnsignedField({
      fieldNumber: 1,
      size: 1,
      baseType: 2,
      bytes: Uint8Array.of(0xFF),
    }, 0, 1, true)).toBeUndefined()
    expect(readFitUnsignedField({
      fieldNumber: 1,
      size: 1,
      baseType: 10,
      bytes: Uint8Array.of(0),
    }, 10, 1, true)).toBeUndefined()
    expect(readFitUnsignedField({
      fieldNumber: 1,
      size: 2,
      baseType: 11,
      bytes: Uint8Array.of(0, 0),
    }, 11, 2, true)).toBeUndefined()
    expect(readFitStringField({
      fieldNumber: 3,
      size: 4,
      baseType: 7,
      bytes: Uint8Array.of(65, 0, 66, 0),
    })).toBe('A\0B')
    expect(() => readFitUnsignedField({
      fieldNumber: 1,
      size: 2,
      baseType: 0x84,
      bytes: Uint8Array.of(0x34),
    }, 0x84, 2, true)).toThrow(TypeError)
    expect(() => readFitUnsignedField({
      fieldNumber: 1,
      size: 1,
      baseType: 1,
      bytes: Uint8Array.of(0xFF),
    }, 1, 1, true)).toThrow(TypeError)
    expect(() => readFitUnsignedField({
      fieldNumber: 1,
      size: 4,
      baseType: 0x84,
      bytes: Uint8Array.of(1, 0, 2, 0),
    }, 0x84, 4, true)).toThrow(TypeError)
    expect(() => readFitStringField({
      fieldNumber: 3,
      size: 4,
      baseType: 7,
      bytes: Uint8Array.of(65, 0),
    })).toThrow(TypeError)
  })
})
