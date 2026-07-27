import type { MessageTypeDefinition } from '../src/binary.js'
import type { FitParserOptions } from '../src/fit-parser.js'
import type { FieldDefinition } from '../src/fit.js'
import { describe, expect, it } from 'vitest'
import { readRecord } from '../src/binary.js'
import { FIT } from '../src/fit.js'

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
      field('big_sint16', 'sint16', 2, 131, false),
      field('little_sint32', 'sint32', 4, 133, true),
      field('big_uint16z', 'uint16z', 2, 139, false),
      field('little_uint32z', 'uint32z', 4, 140, true),
      field('big_uint32_values', 'uint32_array', 8, 134, false),
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
    payloadView.setInt16(23, -12_345, false)
    payloadView.setInt32(25, -123_456_789, true)
    payloadView.setUint16(29, 0x1234, false)
    payloadView.setUint32(31, 0x89ABCDEF, true)
    payloadView.setUint32(35, 0x01020304, false)
    payloadView.setUint32(39, 0xFFFFFFFF, false)

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
      big_sint16: -12_345,
      big_float64: -9.5,
      big_uint32: 100,
      big_uint16z: 0x1234,
      big_uint32_values: [0x01020304, null],
      little_float32: 1.25,
      little_sint32: -123_456_789 * FIT.scConst,
      little_uint16: 0x1234,
      little_uint32z: 0x89ABCDEF,
      uint16_values: [7, null],
    })
  })

  it('caches definition metadata and preallocates reusable raw storage', () => {
    const messageTypes: MessageTypeDefinition[] = []
    const definitionRecord = new Uint8Array([
      0x40,
      0,
      0,
      20,
      0,
      1,
      3,
      1,
      2,
    ])

    const parsedDefinition = readRecord(
      definitionRecord,
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(parsedDefinition).toMatchObject({
      messageType: 'definition',
      nextIndex: definitionRecord.length,
    })
    expect(messageTypes[0]?.fieldDefs[0]).toMatchObject({
      name: 'heart_rate',
      offset: 0,
      requiresBoundedDataView: false,
      scale: null,
      type: 'uint8',
    })
    expect(messageTypes[0]?.rawData).toHaveLength(1)

    const rawData = messageTypes[0]?.rawData
    const parsedRecord = readRecord(
      new Uint8Array([0, 140]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(parsedRecord.message).toMatchObject({ heart_rate: 140 })
    expect(messageTypes[0]?.rawData).toBe(rawData)
  })

  it.each([false, true])(
    'preserves record alignment when a developer field description is missing (force: %s)',
    (force) => {
      const messageTypes: MessageTypeDefinition[] = []
      const developerFields: any[] = []
      const definitionRecord = new Uint8Array([
        0x60,
        0,
        0,
        20,
        0,
        1,
        3,
        1,
        2,
        1,
        2,
        4,
        2,
      ])

      const parsedDefinition = readRecord(
        definitionRecord,
        messageTypes,
        developerFields,
        0,
        { ...parserOptions, force },
        undefined,
        0,
      )

      expect(parsedDefinition.nextIndex).toBe(definitionRecord.length)
      expect(messageTypes[0]?.fieldDefs).toHaveLength(1)
      expect(messageTypes[0]?.developerFieldDefs).toEqual([
        {
          developerDataIndex: 2,
          fieldDefinitionNumber: 2,
          size: 4,
        },
      ])
      expect(messageTypes[0]?.rawData).toHaveLength(2)

      const records = new Uint8Array([
        0,
        140,
        1,
        2,
        3,
        4,
        0,
        141,
        5,
        6,
        7,
        8,
      ])
      const first = readRecord(
        records,
        messageTypes,
        developerFields,
        0,
        { ...parserOptions, force },
        undefined,
        0,
      )
      const second = readRecord(
        records,
        messageTypes,
        developerFields,
        first.nextIndex,
        { ...parserOptions, force },
        undefined,
        0,
      )

      expect(first.nextIndex).toBe(6)
      expect(first.message).toEqual({ heart_rate: 140 })
      expect(second.nextIndex).toBe(records.length)
      expect(second.message).toEqual({ heart_rate: 141 })
    },
  )

  it('decodes a developer field after its description arrives', () => {
    const messageTypes: MessageTypeDefinition[] = []
    const developerFields: any[] = []
    const definitionRecord = new Uint8Array([
      0x60,
      0,
      0,
      20,
      0,
      1,
      3,
      1,
      2,
      1,
      2,
      4,
      2,
    ])
    readRecord(
      definitionRecord,
      messageTypes,
      developerFields,
      0,
      parserOptions,
      undefined,
      0,
    )

    const beforeDescription = new Uint8Array(6)
    beforeDescription[1] = 140
    new DataView(beforeDescription.buffer).setFloat32(2, 9.5, true)
    const unresolved = readRecord(
      beforeDescription,
      messageTypes,
      developerFields,
      0,
      parserOptions,
      undefined,
      0,
    )
    expect(unresolved.message).toEqual({ heart_rate: 140 })

    developerFields[2] = []
    developerFields[2][2] = {
      field_name: 'late_developer_value',
      fit_base_type_id: 136,
      offset: 0,
      scale: 1,
    }

    const afterDescription = new Uint8Array(6)
    afterDescription[1] = 141
    new DataView(afterDescription.buffer).setFloat32(2, 12.5, true)
    const resolved = readRecord(
      afterDescription,
      messageTypes,
      developerFields,
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(resolved.nextIndex).toBe(afterDescription.length)
    expect(resolved.message).toEqual({
      heart_rate: 141,
      late_developer_value: 12.5,
    })
    expect(messageTypes[0]?.developerFieldDefs?.[0].resolvedFieldDef).toMatchObject({
      baseTypeNo: 136,
      name: 'late_developer_value',
      type: 'float32',
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

  it('omits truncated endian fields instead of manufacturing padded values', () => {
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

    expect(parsedFloat.message).toEqual({})
    expect(parsedArray.message).toEqual({})
  })

  it.each([false, true])(
    'omits undersized endian fields without reading the following bytes (force: %s)',
    (force) => {
      const malformedDefinition = definition([
        field('short_uint16', 'uint16', 1, 132, true),
      ])
      const dataWithFollowingBytes = new Uint8Array([0, 0x34, 0x12])

      const parsed = readRecord(
        dataWithFollowingBytes,
        [malformedDefinition],
        [],
        0,
        { ...parserOptions, force },
        undefined,
        0,
      )
      expect(parsed.message).toEqual({})
      expect(parsed.nextIndex).toBe(2)
    },
  )

  it.each([false, true])(
    'omits malformed endian arrays without reading the following bytes (force: %s)',
    (force) => {
      const malformedDefinition = definition([
        field('odd_uint16_array', 'uint16_array', 3, 132, true),
      ])
      const dataWithFollowingBytes = new Uint8Array([0, 0x34, 0x12, 0x56, 0x78])

      const parsed = readRecord(
        dataWithFollowingBytes,
        [malformedDefinition],
        [],
        0,
        { ...parserOptions, force },
        undefined,
        0,
      )
      expect(parsed.message).toEqual({})
      expect(parsed.nextIndex).toBe(4)
    },
  )

  it('preserves enum and mask formatting when metadata is reused', () => {
    const messageDefinition = definition([
      field('gender_value', 'gender', 1, 0, true),
      field('balance_value', 'left_right_balance', 1, 2, true),
    ])
    const messageTypes = [messageDefinition]

    const first = readRecord(
      new Uint8Array([0, 1, 128]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
    )
    const second = readRecord(
      new Uint8Array([0, 99, 0]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(first.message).toMatchObject({
      balance_value: { 0: false, right: true, value: 0 },
      gender_value: 'male',
    })
    expect(second.message).toMatchObject({
      balance_value: { 0: false, right: false, value: 0 },
      gender_value: 99,
    })
  })

  it('clears invalid developer values when reusing raw storage', () => {
    const developerField = {
      ...field('Developer Value', 'uint8', 1, 2, true, 2, 1),
      developerDataIndex: 0,
      isDeveloperField: true,
    }
    const messageDefinition = definition([developerField])
    const messageTypes = [messageDefinition]
    const rawData = messageDefinition.rawData

    const valid = readRecord(
      new Uint8Array([0, 40]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
    )
    const invalid = readRecord(
      new Uint8Array([0, 0xFF]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
    )

    expect(valid.message).toMatchObject({ 'Developer Value': 21 })
    expect(invalid.message).not.toHaveProperty('Developer Value')
    expect(messageDefinition.rawData).toBe(rawData)
  })

  it('does not add elapsed fields when every reused field is invalid', () => {
    const messageTypes = [
      definition([field('heart_rate', 'uint8', 1, 2, true)]),
    ]

    const parsed = readRecord(
      new Uint8Array([0, 0xFF]),
      messageTypes,
      [],
      0,
      { ...parserOptions, elapsedRecordField: true },
      Date.UTC(2026, 0, 1),
      10,
    )

    expect(parsed.message).toEqual({})
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

  it('reconstructs compressed timestamps and handles the 32-second rollover', () => {
    const decoderState = { lastTimestamp: 1000 }
    const messageTypes: MessageTypeDefinition[] = []
    messageTypes[3] = definition([
      field('heart_rate', 'uint8', 1, 2, true),
    ])

    const first = readRecord(
      new Uint8Array([0xE8, 140]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
      undefined,
      decoderState,
    )
    const second = readRecord(
      new Uint8Array([0xEA, 141]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
      undefined,
      decoderState,
    )
    const rollover = readRecord(
      new Uint8Array([0xE2, 142]),
      messageTypes,
      [],
      0,
      parserOptions,
      undefined,
      0,
      undefined,
      decoderState,
    )

    expect(first.message).toMatchObject({
      heart_rate: 140,
      timestamp: new Date(631066600000),
    })
    expect(second.message).toMatchObject({
      heart_rate: 141,
      timestamp: new Date(631066602000),
    })
    expect(rollover.message).toMatchObject({
      heart_rate: 142,
      timestamp: new Date(631066626000),
    })
    expect(decoderState.lastTimestamp).toBe(1026)
  })

  it('uses a later full timestamp as the next compressed timestamp reference', () => {
    const decoderState = { lastTimestamp: 1000 }
    const fullTimestamp = {
      ...field('timestamp', 'date_time', 4, 134, true),
      fDefNo: 253,
    }
    const fullTimestampPayload = new Uint8Array(5)
    new DataView(fullTimestampPayload.buffer).setUint32(1, 2000, true)

    readRecord(
      fullTimestampPayload,
      [definition([fullTimestamp])],
      [],
      0,
      parserOptions,
      undefined,
      0,
      undefined,
      decoderState,
    )
    const compressed = readRecord(
      new Uint8Array([0x91]),
      [definition([])],
      [],
      0,
      parserOptions,
      undefined,
      0,
      undefined,
      decoderState,
    )

    expect(compressed.message).toEqual({
      timestamp: new Date(631067601000),
    })
    expect(decoderState.lastTimestamp).toBe(2001)
  })

  it('requires a timestamp reference for strict compressed records', () => {
    expect(() => readRecord(
      new Uint8Array([0x80, 140]),
      [definition([field('heart_rate', 'uint8', 1, 2, true)])],
      [],
      0,
      parserOptions,
      undefined,
      0,
    )).toThrow('Compressed timestamp requires a previous timestamp')

    const forced = readRecord(
      new Uint8Array([0x80, 140]),
      [definition([field('heart_rate', 'uint8', 1, 2, true)])],
      [],
      0,
      { ...parserOptions, force: true },
      undefined,
      0,
    )
    expect(forced.message).toEqual({ heart_rate: 140 })
  })
})
