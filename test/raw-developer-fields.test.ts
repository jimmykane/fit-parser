import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { FitEncoder } from '../src/fit-encoder.js'
import FitParser, { FitBaseType } from '../src/fit-parser.js'

interface NativeFieldDefinition {
  number: number
  size: number
  baseType: number
}

interface DeveloperFieldDefinition {
  number: number
  size: number
  developerDataIndex: number
}

function definition(
  localMessageNumber: number,
  globalMessageNumber: number,
  fields: NativeFieldDefinition[],
  developerFields: DeveloperFieldDefinition[] = [],
): number[] {
  return [
    0x40 | (developerFields.length ? 0x20 : 0) | localMessageNumber,
    0,
    0,
    globalMessageNumber & 0xFF,
    (globalMessageNumber >>> 8) & 0xFF,
    fields.length,
    ...fields.flatMap(field => [field.number, field.size, field.baseType]),
    ...(developerFields.length
      ? [developerFields.length, ...developerFields.flatMap(field => [
          field.number,
          field.size,
          field.developerDataIndex,
        ])]
      : []),
  ]
}

function data(localMessageNumber: number, ...values: Uint8Array[]): number[] {
  return [localMessageNumber, ...values.flatMap(value => Array.from(value))]
}

function byte(value: number): Uint8Array {
  return Uint8Array.of(value)
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(`${value}\0`)
}

function fitFile(records: number[][]): Uint8Array {
  const body = Uint8Array.from(records.flat())
  const header = new Uint8Array(14)
  const view = new DataView(header.buffer)
  header[0] = 14
  header[1] = 0x20
  view.setUint16(2, 21208, true)
  view.setUint32(4, body.length, true)
  header.set(new TextEncoder().encode('.FIT'), 8)
  view.setUint16(12, FitEncoder.calculateCRC(header.subarray(0, 12)), true)

  const withoutFileCrc = new Uint8Array(header.length + body.length)
  withoutFileCrc.set(header)
  withoutFileCrc.set(body, header.length)
  const output = new Uint8Array(withoutFileCrc.length + 2)
  output.set(withoutFileCrc)
  new DataView(output.buffer).setUint16(
    withoutFileCrc.length,
    FitEncoder.calculateCRC(withoutFileCrc),
    true,
  )
  return output
}

function developerDataId(index: number, fill: number): number[][] {
  const fields = [
    { number: 1, size: 16, baseType: FitBaseType.Byte },
    { number: 3, size: 1, baseType: FitBaseType.Uint8 },
  ]
  return [
    definition(0, 207, fields),
    data(0, new Uint8Array(16).fill(fill), byte(index)),
  ]
}

function fieldDescription(
  developerDataIndex: number,
  fieldDefinitionNumber: number,
  name: string,
): number[][] {
  const nameBytes = text(name)
  const fields = [
    { number: 0, size: 1, baseType: FitBaseType.Uint8 },
    { number: 1, size: 1, baseType: FitBaseType.Uint8 },
    { number: 2, size: 1, baseType: FitBaseType.Uint8 },
    { number: 3, size: nameBytes.length, baseType: FitBaseType.String },
  ]
  return [
    definition(1, 206, fields),
    data(
      1,
      byte(developerDataIndex),
      byte(fieldDefinitionNumber),
      byte(FitBaseType.String),
      nameBytes,
    ),
  ]
}

describe('raw developer fields', () => {
  it('retains selected raw messages with wire metadata and exact field order', async () => {
    const owner = Uint8Array.from([97, 0, 98, 0])
    const file = fitFile([
      definition(
        0,
        18,
        [{ number: 5, size: 1, baseType: FitBaseType.Enum }],
        [{ number: 21, size: owner.length, developerDataIndex: 9 }],
      ),
      data(0, byte(2), owner),
      definition(1, 20, [{ number: 253, size: 4, baseType: FitBaseType.Uint32 }]),
      data(1, uint32(1_100_000_000)),
    ])

    const regular = await new FitParser({ force: false }).parseAsync(file.buffer)
    const retained = await new FitParser({
      force: false,
      includeRawMessages: [18],
    }).parseAsync(file.buffer)
    const { raw_messages: rawMessages, ...compatibleOutput } = retained

    expect(regular).not.toHaveProperty('raw_messages')
    expect(compatibleOutput).toEqual(regular)
    expect(rawMessages).toEqual([{
      global_message_number: 18,
      message_index: 0,
      little_endian: true,
      fields: [{
        field_definition_number: 5,
        base_type: FitBaseType.Enum,
        raw_value: [2],
      }],
      developer_fields: [{
        developer_data_index: 9,
        field_definition_number: 21,
        raw_value: Array.from(owner),
      }],
    }])
  })

  it('can omit decoded activity collections while retaining selected messages', async () => {
    const file = fitFile([
      definition(0, 18, [{ number: 5, size: 1, baseType: FitBaseType.Enum }]),
      data(0, byte(2)),
      definition(1, 20, [{ number: 3, size: 1, baseType: FitBaseType.Uint8 }]),
      data(1, byte(140)),
    ])

    const parsed = await new FitParser({
      force: false,
      includeRawMessages: [18],
      rawMessagesOnly: true,
    }).parseAsync(file.buffer)

    expect(parsed).toEqual({
      profileVersion: 21208,
      protocolVersion: 32,
      raw_messages: [{
        global_message_number: 18,
        message_index: 0,
        little_endian: true,
        fields: [{
          field_definition_number: 5,
          base_type: FitBaseType.Enum,
          raw_value: [2],
        }],
        developer_fields: [],
      }],
    })
  })

  it('retains reconstructed timestamps without inventing omitted compressed field bytes', async () => {
    const baseTimestamp = 1_100_000_030
    const compressedTimestamp = baseTimestamp + 4
    const compressedHeader = 0x80 | (2 << 5) | (compressedTimestamp & 0x1F)
    const file = fitFile([
      definition(0, 20, [{ number: 253, size: 4, baseType: FitBaseType.Uint32 }]),
      data(0, uint32(baseTimestamp)),
      definition(2, 18, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32 },
        { number: 5, size: 1, baseType: FitBaseType.Enum },
      ]),
      [compressedHeader, 2],
    ])

    const parsed = await new FitParser({
      force: false,
      includeRawMessages: [18],
    }).parseAsync(file.buffer)

    expect(parsed.raw_messages).toEqual([{
      global_message_number: 18,
      message_index: 0,
      little_endian: true,
      compressed_timestamp: compressedTimestamp,
      fields: [{
        field_definition_number: 5,
        base_type: FitBaseType.Enum,
        raw_value: [2],
      }],
      developer_fields: [],
    }])
    expect(parsed.sessions?.[0]?.timestamp).toEqual(new Date(Date.UTC(1989, 11, 31) + compressedTimestamp * 1000))
  })

  it('retains empty selected messages and unsigned compressed timestamps', async () => {
    const baseTimestamp = 0xF000001E
    const compressedTimestamp = baseTimestamp + 4
    const compressedHeader = 0x80 | (2 << 5) | (compressedTimestamp & 0x1F)
    const file = fitFile([
      definition(0, 20, [{ number: 253, size: 4, baseType: FitBaseType.Uint32 }]),
      data(0, uint32(baseTimestamp)),
      definition(1, 72, []),
      data(1),
      definition(2, 18, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32 },
        { number: 5, size: 1, baseType: FitBaseType.Enum },
      ]),
      [compressedHeader, 2],
    ])

    const parsed = await new FitParser({
      force: false,
      includeRawMessages: [18, 72],
    }).parseAsync(file.buffer)

    expect(parsed.raw_messages).toEqual([
      {
        global_message_number: 72,
        message_index: 0,
        little_endian: true,
        fields: [],
        developer_fields: [],
      },
      {
        global_message_number: 18,
        message_index: 0,
        little_endian: true,
        compressed_timestamp: compressedTimestamp,
        fields: [{
          field_definition_number: 5,
          base_type: FitBaseType.Enum,
          raw_value: [2],
        }],
        developer_fields: [],
      },
    ])
  })

  it.each([
    {
      definition: definition(0, 18, [{ number: 5, size: 0, baseType: FitBaseType.Enum }]),
      payload: data(0),
    },
    {
      definition: definition(0, 18, [
        { number: 5, size: 1, baseType: FitBaseType.Enum },
        { number: 5, size: 1, baseType: FitBaseType.Enum },
      ]),
      payload: data(0, byte(1), byte(2)),
    },
    {
      definition: definition(0, 18, [{ number: 5, size: 1, baseType: 17 }]),
      payload: data(0, byte(1)),
    },
  ])('retains unusual field definitions for consumer-specific validation', async ({
    definition: unusualDefinition,
    payload,
  }) => {
    const file = fitFile([unusualDefinition, payload])

    const parsed = await new FitParser({
      force: false,
      includeRawMessages: [18],
      rawMessagesOnly: true,
    }).parseAsync(file.buffer)

    expect(parsed.raw_messages).toHaveLength(1)
    expect(parsed.raw_messages?.[0]?.fields).toHaveLength(
      (unusualDefinition[5] as number),
    )
  })

  it('does not apply selected-message shape validation to unrelated messages', async () => {
    const file = fitFile([
      definition(0, 21, [{ number: 3, size: 1, baseType: FitBaseType.Uint32 }]),
      data(0, byte(7)),
      definition(1, 72, []),
      data(1),
    ])

    const parsed = await new FitParser({
      force: false,
      includeRawMessages: [72],
      rawMessagesOnly: true,
    }).parseAsync(file.buffer)

    expect(parsed.raw_messages).toEqual([{
      global_message_number: 72,
      message_index: 0,
      little_endian: true,
      fields: [],
      developer_fields: [],
    }])
  })

  it('retains exact bytes and identities without changing default parsed output', async () => {
    const owner0 = Uint8Array.from([97, 0, 98, 0])
    const external0 = Uint8Array.from([49, 0, 50, 0])
    const owner1 = Uint8Array.from([99, 0, 100, 0])
    const external1 = Uint8Array.from([51, 0, 52, 0])
    const developerFields = [
      { number: 0, size: owner0.length, developerDataIndex: 0 },
      { number: 1, size: external0.length, developerDataIndex: 0 },
      { number: 0, size: owner1.length, developerDataIndex: 1 },
      { number: 1, size: external1.length, developerDataIndex: 1 },
    ]
    const file = fitFile([
      ...developerDataId(0, 0x11),
      ...developerDataId(1, 0x22),
      ...fieldDescription(0, 0, 'owner'),
      ...fieldDescription(0, 1, 'external'),
      ...fieldDescription(1, 0, 'owner'),
      ...fieldDescription(1, 1, 'external'),
      definition(2, 18, [], developerFields),
      data(2, owner0, external0, owner1, external1),
      definition(3, 20, [], [{
        number: 0,
        size: owner0.length,
        developerDataIndex: 0,
      }]),
      data(3, owner0),
    ])

    const regular = await new FitParser({ force: false }).parseAsync(file.buffer)
    const retained = await new FitParser({
      force: false,
      includeRawDeveloperFields: true,
    }).parseAsync(file.buffer)
    const sessionsOnly = await new FitParser({
      force: false,
      includeRawDeveloperFields: [18],
    }).parseAsync(file.buffer)
    const { raw_developer_fields: rawDeveloperFields, ...compatibleOutput } = retained

    expect(compatibleOutput).toEqual(regular)
    expect(regular).not.toHaveProperty('raw_developer_fields')
    expect(regular.sessions?.[0]).toMatchObject({
      external: '34',
      owner: 'cd',
    })
    expect(rawDeveloperFields).toEqual([
      {
        global_message_number: 18,
        message_index: 0,
        developer_data_index: 0,
        field_definition_number: 0,
        raw_value: Array.from(owner0),
      },
      {
        global_message_number: 18,
        message_index: 0,
        developer_data_index: 0,
        field_definition_number: 1,
        raw_value: Array.from(external0),
      },
      {
        global_message_number: 18,
        message_index: 0,
        developer_data_index: 1,
        field_definition_number: 0,
        raw_value: Array.from(owner1),
      },
      {
        global_message_number: 18,
        message_index: 0,
        developer_data_index: 1,
        field_definition_number: 1,
        raw_value: Array.from(external1),
      },
      {
        global_message_number: 20,
        message_index: 0,
        developer_data_index: 0,
        field_definition_number: 0,
        raw_value: Array.from(owner0),
      },
    ])
    expect(sessionsOnly.raw_developer_fields).toEqual(rawDeveloperFields?.slice(0, 4))
  })

  it('retains unresolved developer fields without inventing decoded metadata', async () => {
    const rawValue = Uint8Array.from([0, 0xFF, 17, 0])
    const file = fitFile([
      definition(0, 18, [], [{
        number: 42,
        size: rawValue.length,
        developerDataIndex: 9,
      }]),
      data(0, rawValue),
    ])

    const parsed = await new FitParser({
      force: false,
      includeRawDeveloperFields: true,
    }).parseAsync(file.buffer)

    expect(parsed.raw_developer_fields).toEqual([{
      global_message_number: 18,
      message_index: 0,
      developer_data_index: 9,
      field_definition_number: 42,
      raw_value: Array.from(rawValue),
    }])
    expect(parsed.sessions?.[0]).toEqual({})
  })

  it('keeps message occurrences distinct and supports offset Buffer inputs', async () => {
    const first = Uint8Array.from([1, 0, 2, 0])
    const second = Uint8Array.from([3, 0, 4, 0])
    const file = fitFile([
      definition(0, 18, [], [{
        number: 7,
        size: first.length,
        developerDataIndex: 2,
      }]),
      data(0, first),
      data(0, second),
    ])
    const padded = Buffer.alloc(file.length + 12, 0xA5)
    Buffer.from(file).copy(padded, 5)
    const input = padded.subarray(5, 5 + file.length)

    const parsed = await new FitParser({
      force: false,
      includeRawDeveloperFields: [18],
    }).parseAsync(input)

    expect(parsed.raw_developer_fields).toEqual([
      {
        global_message_number: 18,
        message_index: 0,
        developer_data_index: 2,
        field_definition_number: 7,
        raw_value: Array.from(first),
      },
      {
        global_message_number: 18,
        message_index: 1,
        developer_data_index: 2,
        field_definition_number: 7,
        raw_value: Array.from(second),
      },
    ])
  })

  it('never captures trailing file CRC bytes as developer-field data', async () => {
    const file = fitFile([
      definition(0, 18, [], [{
        number: 9,
        size: 4,
        developerDataIndex: 3,
      }]),
      data(0, Uint8Array.from([1, 2])),
    ])

    const parsed = await new FitParser({
      force: false,
      includeRawDeveloperFields: true,
    }).parseAsync(file.buffer)

    expect(parsed.raw_developer_fields).toEqual([])
  })
})
