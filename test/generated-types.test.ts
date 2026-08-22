import type {
  ParsedDiveSettings,
  ParsedFieldCapabilities,
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

    expect(record.timestamp).toBe(timestamp)
    expect(record.speed1s).toEqual([1, null])
    expect(diveSettings.safety_stop_enabled).toBe(1)
    expect(session.sport).toBe(250)
    expect(fieldCapabilities.mesg_num).toBe(65_000)
  })
})
