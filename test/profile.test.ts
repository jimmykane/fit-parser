import { describe, expect, it } from 'vitest'
import { FitBaseType, FitEncoder } from '../src/fit-encoder.js'
import FitParser from '../src/fit-parser.js'
import { FIT } from '../src/fit.js'
import {
  PROFILE_MESSAGES,
  PROFILE_TYPES,
} from '../src/profile.js'

function uint16Array(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setUint16(index * 2, value, true))
  return bytes
}

describe('static FIT profile', () => {
  it('keeps the reviewed profile snapshot complete', () => {
    const profileMessages = Object.values(PROFILE_MESSAGES)

    expect(profileMessages).toHaveLength(126)
    expect(profileMessages.reduce(
      (count, message) => count + Object.keys(message).filter(key => key !== 'name').length,
      0,
    )).toBe(1444)
    expect(Object.keys(PROFILE_TYPES)).toHaveLength(200)

    Object.entries(PROFILE_MESSAGES).forEach(([messageId, message]) => {
      const parsedMessage = FIT.messages[Number(messageId)]
      expect(parsedMessage, `global message ${messageId}`).toBeDefined()
      Object.keys(message).filter(key => key !== 'name').forEach((fieldId) => {
        expect(
          parsedMessage[Number(fieldId)],
          `global message ${messageId}, field ${fieldId}`,
        ).toBeDefined()
      })
    })
  })

  it('decodes restored health messages, scaling, signed values, and enums', async () => {
    const encoder = new FitEncoder()
      .writeMessage(370, [
        { number: 0, size: 2, baseType: FitBaseType.Uint16, value: 6400 },
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: 7680 },
        { number: 6, size: 1, baseType: FitBaseType.Enum, value: 4 },
      ], 0)
      .writeMessage(398, [
        { number: 1, size: 4, baseType: FitBaseType.Float32, value: 0.5 },
        { number: 2, size: 4, baseType: FitBaseType.Float32, value: -0.25 },
        { number: 4, size: 4, baseType: FitBaseType.Float32, value: 36.75 },
      ], 1)
      .writeMessage(412, [
        { number: 1, size: 2, baseType: FitBaseType.Sint16, value: -120 },
        { number: 3, size: 2, baseType: FitBaseType.Sint16, value: 60 },
        { number: 4, size: 1, baseType: FitBaseType.Enum, value: 1 },
        { number: 5, size: 1, baseType: FitBaseType.Enum, value: 1 },
        { number: 6, size: 1, baseType: FitBaseType.Enum, value: 2 },
      ], 2)

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.hrv_status_summary).toMatchObject({
      weekly_average: 50,
      last_night5_min_high: 60,
      status: 'balanced',
    })
    expect(parsed.skin_temp_overnight).toMatchObject({
      average_deviation: 0.5,
      average7_day_deviation: -0.25,
      nightly_value: 36.75,
    })
    expect(parsed.nap_event).toMatchObject({
      start_timezone_offset: -120,
      end_timezone_offset: 60,
      feedback: 'multiple_naps_during_day',
      is_deleted: 1,
      source: 'manual_gc',
    })
  })

  it('parses messages covered by the maintained profile', async () => {
    const encoder = new FitEncoder()
      .writeMessage(188, [
        { number: 0, size: 1, baseType: FitBaseType.Enum, value: 1 },
      ], 0)
      .writeMessage(211, [
        { number: 0, size: 1, baseType: FitBaseType.Uint8, value: 48 },
        { number: 1, size: 1, baseType: FitBaseType.Uint8, value: 51 },
      ], 1)
      .writeMessage(275, [
        { number: 0, size: 1, baseType: FitBaseType.Enum, value: 3 },
      ], 2)

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.ohr_settings?.enabled).toBe('on')
    expect(parsed.monitoring_hr_data).toMatchObject({
      resting_heart_rate: 48,
      current_day_resting_heart_rate: 51,
    })
    expect(parsed.sleep_level?.sleep_level).toBe('deep')
  })

  it('accepts enum-encoded developer base-type descriptions', async () => {
    const name = FitEncoder.string('Wind')
    const encoder = new FitEncoder().writeMessage(206, [
      { number: 0, size: 1, baseType: FitBaseType.Uint8, value: 0 },
      { number: 1, size: 1, baseType: FitBaseType.Uint8, value: 0 },
      { number: 2, size: 1, baseType: FitBaseType.Enum, value: 137 },
      {
        number: 3,
        size: name.length,
        baseType: FitBaseType.String,
        value: name,
      },
    ])

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.field_descriptions?.[0]).toMatchObject({
      field_name: 'Wind',
      fit_base_type_id: 'float64',
    })
  })

  it('uses profile metadata without compatibility aliases', async () => {
    const encoder = new FitEncoder()
      .writeMessage(6, [
        { number: 19, size: 1, baseType: FitBaseType.Uint8, value: 20 },
      ], 2)
      .writeMessage(18, [
        { number: 139, size: 2, baseType: FitBaseType.Uint16, value: 100 },
        { number: 140, size: 4, baseType: FitBaseType.Uint32, value: 70 },
        { number: 168, size: 4, baseType: FitBaseType.Sint32, value: 98_304 },
        { number: 193, size: 1, baseType: FitBaseType.Uint8, value: 7 },
        { number: 196, size: 2, baseType: FitBaseType.Uint16, value: 159 },
      ], 0)
      .writeMessage(55, [
        { number: 28, size: 1, baseType: FitBaseType.Uint8, value: 17 },
        { number: 31, size: 4, baseType: FitBaseType.Uint32, value: 12_345 },
        { number: 32, size: 4, baseType: FitBaseType.Uint32, value: 54_321 },
      ], 3)
      .writeMessage(103, [
        {
          number: 3,
          size: 4,
          baseType: FitBaseType.Uint16,
          value: uint16Array([5000, 10_000]),
        },
        {
          number: 4,
          size: 4,
          baseType: FitBaseType.Uint16,
          value: uint16Array([2500, 7500]),
        },
      ], 6)
      .writeMessage(262, [
        { number: 0, size: 4, baseType: FitBaseType.Uint32, value: 12_345 },
      ], 4)
      .writeMessage(323, [
        { number: 3, size: 4, baseType: FitBaseType.Uint32, value: 12_345 },
      ], 5)
      .writeMessage(216, [
        { number: 0, size: 2, baseType: FitBaseType.Uint16, value: 18 },
      ], 1)

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.bike_profile?.crank_length).toBe(120)
    expect(parsed.sessions?.[0]?.avg_vam).toBe(0.1)
    expect(parsed.sessions?.[0]?.avg_depth).toBe(0.07)
    expect(parsed.sessions?.[0]?.training_load_peak).toBe(1.5)
    expect(parsed.sessions?.[0]?.workout_rpe).toBe(7)
    expect(parsed.sessions?.[0]?.metabolic_calories).toBe(159)
    expect(parsed.sessions?.[0]).not.toHaveProperty('resting_calories')
    expect(parsed.sessions?.[0]).not.toHaveProperty('recovery_advisor')
    expect(parsed.monitors?.[0]).toMatchObject({
      intensity: 1.7,
      ascent: 12.345,
      descent: 54.321,
    })
    expect(parsed.monitor_info?.[0]).toMatchObject({
      cycles_to_distance: [1, 2],
      cycles_to_calories: [0.5, 1.5],
    })
    expect(parsed.dive_alarm?.depth).toBe(12.345)
    expect(parsed.tank_summaries?.[0]?.volume_used).toBe(123.45)
    expect(parsed.time_in_zone?.[0]?.reference_mesg).toBe('session')
  })

  it('retains every recognized repeated message in file order', async () => {
    const firstName = FitEncoder.string('Warm up')
    const secondName = FitEncoder.string('Run')
    const encoder = new FitEncoder()
      .writeMessage(27, [{
        number: 0,
        size: firstName.length,
        baseType: FitBaseType.String,
        value: firstName,
      }])
      .writeMessage(27, [{
        number: 0,
        size: secondName.length,
        baseType: FitBaseType.String,
        value: secondName,
      }])
      .writeMessage(268, [{
        number: 2,
        size: 4,
        baseType: FitBaseType.Uint32,
        value: 1250,
      }], 1)
      .writeMessage(268, [{
        number: 2,
        size: 4,
        baseType: FitBaseType.Uint32,
        value: 2500,
      }], 1)

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.messages?.workout_step?.map(step => step.wkt_step_name))
      .toEqual(['Warm up', 'Run'])
    expect(parsed.workout_step?.wkt_step_name).toBe('Run')
    expect(parsed.messages?.dive_summary?.map(summary => summary.avg_depth))
      .toEqual([1.25, 2.5])
    expect(parsed.dive_summary?.avg_depth).toBe(2.5)
  })

  it('covers flow and grit across lap and segment-lap summaries', async () => {
    const encoder = new FitEncoder()
      .writeMessage(19, [
        { number: 149, size: 4, baseType: FitBaseType.Float32, value: 12.5 },
        { number: 150, size: 4, baseType: FitBaseType.Float32, value: 6.25 },
        { number: 153, size: 4, baseType: FitBaseType.Float32, value: 3.5 },
        { number: 154, size: 4, baseType: FitBaseType.Float32, value: 4.5 },
      ], 0)
      .writeMessage(142, [
        { number: 84, size: 4, baseType: FitBaseType.Float32, value: 9.5 },
        { number: 85, size: 4, baseType: FitBaseType.Float32, value: 8.5 },
        { number: 86, size: 4, baseType: FitBaseType.Float32, value: 7.5 },
        { number: 87, size: 4, baseType: FitBaseType.Float32, value: 6.5 },
      ], 1)

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.laps?.[0]).toMatchObject({
      total_grit: 12.5,
      total_flow: 6.25,
      avg_grit: 3.5,
      avg_flow: 4.5,
    })
    expect(parsed.segment_lap).toMatchObject({
      total_grit: 9.5,
      total_flow: 8.5,
      avg_grit: 7.5,
      avg_flow: 6.5,
    })
  })
})
