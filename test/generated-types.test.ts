import type {
  ParsedDiveSettings,
  ParsedFieldCapabilities,
  ParsedFit,
  ParsedRecord,
  ParsedSession,
} from '../src/fit_types.js'
import { describe, expect, it } from 'vitest'

describe('generated parsed types', () => {
  it('matches runtime dates, masks, nullable arrays, bools, and unknown enums', () => {
    const timestamp = new Date('2026-01-02T03:04:05.000Z')
    const record: ParsedRecord = {
      timestamp,
      speed1s: [1, null],
      left_right_balance: {
        value: 12,
        right: true,
      },
    }
    const diveSettings: ParsedDiveSettings = {
      safety_stop_enabled: 1,
    }
    const session: ParsedSession = {
      sport: 250,
    }
    const fieldCapabilities: ParsedFieldCapabilities = {
      mesg_num: 65_000,
    }
    const fit: Pick<ParsedFit, 'raw_developer_fields'> = {
      raw_developer_fields: [{
        global_message_number: 18,
        message_index: 0,
        developer_data_index: 1,
        field_definition_number: 2,
        raw_value: [97, 0, 98, 0],
      }],
    }
    const rawMessages: Pick<ParsedFit, 'raw_messages'> = {
      raw_messages: [{
        global_message_number: 18,
        message_index: 0,
        little_endian: true,
        fields: [{ field_definition_number: 5, base_type: 0, raw_value: [2] }],
        developer_fields: [{
          developer_data_index: 1,
          field_definition_number: 2,
          raw_value: [97, 0],
        }],
      }],
    }

    expect(record.timestamp).toBe(timestamp)
    expect(record.speed1s).toEqual([1, null])
    expect(diveSettings.safety_stop_enabled).toBe(1)
    expect(session.sport).toBe(250)
    expect(fieldCapabilities.mesg_num).toBe(65_000)
    expect(fit.raw_developer_fields?.[0]?.raw_value).toEqual([97, 0, 98, 0])
    expect(rawMessages.raw_messages?.[0]?.fields[0]?.raw_value).toEqual([2])
  })
})
