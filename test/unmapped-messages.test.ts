import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

describe('unmapped FIT data preservation', () => {
  it('retains unknown messages without an opt-in or semantic profile entry', async () => {
    const file = new FitEncoder().writeMessage(470, [
      { number: 7, size: 2, baseType: FitBaseType.Uint16, value: 0x1234 },
      {
        number: 9,
        size: 3,
        baseType: FitBaseType.Byte,
        value: new Uint8Array([0xAA, 0xBB, 0xCC]),
      },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.unmapped_messages).toEqual([{
      global_message_number: 470,
      message_index: 0,
      little_endian: true,
      fields: [
        {
          field_definition_number: 7,
          base_type: FitBaseType.Uint16,
          raw_value: [0x34, 0x12],
        },
        {
          field_definition_number: 9,
          base_type: FitBaseType.Byte,
          raw_value: [0xAA, 0xBB, 0xCC],
        },
      ],
      developer_fields: [],
    }])
  })

  it('retains only unknown fields when a message is otherwise recognized', async () => {
    const file = new FitEncoder().writeMessage(20, [
      { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 147 },
      { number: 250, size: 2, baseType: FitBaseType.Uint16, value: 0xCAFE },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.records?.[0]?.heart_rate).toBe(147)
    expect(parsed.unmapped_messages).toEqual([{
      global_message_number: 20,
      message_index: 0,
      little_endian: true,
      fields: [{
        field_definition_number: 250,
        base_type: FitBaseType.Uint16,
        raw_value: [0xFE, 0xCA],
      }],
      developer_fields: [],
    }])
  })

  it('does not duplicate fully recognized messages', async () => {
    const file = new FitEncoder().writeMessage(20, [
      { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 147 },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.unmapped_messages).toBeUndefined()
  })
})
