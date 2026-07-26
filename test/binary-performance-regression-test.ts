import type { MessageTypeDefinition } from '../src/binary.js'
import type { FitParserOptions } from '../src/fit-parser.js'
import type { FieldDefinition } from '../src/fit.js'
import { describe, expect, it } from 'vitest'
import { readRecord } from '../src/binary.js'

const parserOptions: FitParserOptions = {
  elapsedRecordField: false,
  force: false,
  lengthUnit: 'm',
  pressureUnit: 'bar',
  speedUnit: 'm/s',
  temperatureUnit: 'celsius',
}

function field(
  name: string,
  type: string,
  size: number,
  baseTypeNo: number,
  littleEndian: boolean,
  scale: number | null = null,
  offset = 0,
): FieldDefinition {
  return {
    baseTypeNo,
    dataType: type,
    endianAbility: (baseTypeNo & 128) === 128,
    fDefNo: 0,
    littleEndian,
    name,
    offset,
    scale,
    size,
    type,
  }
}

function definition(fieldDefs: FieldDefinition[]): MessageTypeDefinition {
  return {
    fieldDefs,
    globalMessageNumber: 20,
    littleEndian: true,
    numberOfFields: fieldDefs.length,
    rawData: Array.from({ length: fieldDefs.length }),
  }
}

describe('binary decoder allocation regressions', () => {
  it('reads mixed-endian scalars and arrays from one offset DataView', () => {
    const fieldDefs = [
      field('little_uint16', 'uint16', 2, 132, true),
      field('big_uint32', 'uint32', 4, 134, false, 100),
      field('little_float32', 'float32', 4, 136, true),
      field('big_float64', 'float64', 8, 137, false),
      field('uint16_values', 'uint16_array', 4, 132, true),
    ]
    const payload = new Uint8Array(1 + fieldDefs.reduce((size, item) => size + item.size, 0))
    const payloadView = new DataView(payload.buffer)
    payload[0] = 0
    payloadView.setUint16(1, 0x1234, true)
    payloadView.setUint32(3, 10_000, false)
    payloadView.setFloat32(7, 1.25, true)
    payloadView.setFloat64(11, -9.5, false)
    payloadView.setUint16(19, 7, true)
    payloadView.setUint16(21, 0xFFFF, true)

    const padded = new Uint8Array(payload.length + 12)
    padded.fill(0xA5)
    padded.set(payload, 5)
    const blob = padded.subarray(5, 5 + payload.length)
    const dataView = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)

    const parsed = readRecord(
      blob,
      [definition(fieldDefs)],
      [],
      0,
      parserOptions,
      undefined,
      0,
      dataView,
    )

    expect(parsed.nextIndex).toBe(payload.length)
    expect(parsed.message).toMatchObject({
      big_float64: -9.5,
      big_uint32: 100,
      little_float32: 1.25,
      little_uint16: 0x1234,
      uint16_values: [7, null],
    })
  })

  it('clears invalid values when reusing a message definition raw-data buffer', () => {
    const messageDefinition = definition([
      field('heart_rate', 'uint8', 1, 2, true),
    ])
    const messageTypes = [messageDefinition]
    const rawData = messageDefinition.rawData

    const valid = new Uint8Array([0, 140])
    const first = readRecord(valid, messageTypes, [], 0, parserOptions, undefined, 0)
    expect(first.message).toMatchObject({ heart_rate: 140 })

    const invalid = new Uint8Array([0, 0xFF])
    const second = readRecord(invalid, messageTypes, [], 0, parserOptions, undefined, 0)
    expect(second.message).not.toHaveProperty('heart_rate')
    expect(messageDefinition.rawData).toBe(rawData)

    const validAgain = new Uint8Array([0, 141])
    const third = readRecord(validAgain, messageTypes, [], 0, parserOptions, undefined, 0)
    expect(third.message).toMatchObject({ heart_rate: 141 })
    expect(messageDefinition.rawData).toBe(rawData)
  })

  it('preserves legacy zero-padding for truncated endian fields', () => {
    const truncatedFloat = new Uint8Array([0, 0x3F, 0x80])
    const parsedFloat = readRecord(
      truncatedFloat,
      [definition([field('truncated_float', 'float32', 4, 136, false)])],
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    const truncatedArray = new Uint8Array([0, 7, 0, 9])
    const parsedArray = readRecord(
      truncatedArray,
      [definition([field('truncated_array', 'uint16_array', 4, 132, true)])],
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(parsedFloat.message).toMatchObject({ truncated_float: 1 })
    expect(parsedArray.message).toMatchObject({ truncated_array: [7, 9] })
  })

  it('does not read malformed endian fields across their declared boundary', () => {
    const malformedDefinition = definition([
      field('short_uint16', 'uint16', 1, 132, true),
    ])
    const dataWithFollowingBytes = new Uint8Array([0, 0x34, 0x12])

    expect(() =>
      readRecord(
        dataWithFollowingBytes,
        [malformedDefinition],
        [],
        0,
        parserOptions,
        undefined,
        0,
      )).toThrow(RangeError)

    const forced = readRecord(
      dataWithFollowingBytes,
      [malformedDefinition],
      [],
      0,
      { ...parserOptions, force: true },
      undefined,
      0,
    )
    expect(forced.message).toMatchObject({ short_uint16: 0x34 })
  })

  it('initializes a reusable raw-data buffer for legacy definitions', () => {
    const legacyDefinition: MessageTypeDefinition = {
      fieldDefs: [field('heart_rate', 'uint8', 1, 2, true)],
      globalMessageNumber: 20,
      littleEndian: true,
      numberOfFields: 1,
    }

    const parsed = readRecord(
      new Uint8Array([0, 140]),
      [legacyDefinition],
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(parsed.message).toMatchObject({ heart_rate: 140 })
    expect(legacyDefinition.rawData).toHaveLength(1)
  })
})
