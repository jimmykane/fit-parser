import { Profile } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { FitBaseType, FitEncoder } from '../src/fit-encoder.js'
import FitParser from '../src/fit-parser.js'
import { FIT } from '../src/fit.js'
import { GARMIN_PROFILE_VERSION } from '../src/garmin_profile.generated.js'

describe('generated Garmin profile', () => {
  it('tracks every message and field from the pinned SDK', () => {
    const sdkMessages = Object.values(Profile.messages)

    expect(GARMIN_PROFILE_VERSION).toMatchObject(Profile.version)
    expect(sdkMessages).toHaveLength(124)
    expect(sdkMessages.reduce(
      (count, message) => count + Object.keys(message.fields).length,
      0,
    )).toBe(1406)

    sdkMessages.forEach((message) => {
      const parsedMessage = FIT.messages[message.num]
      expect(parsedMessage, `global message ${message.num}`).toBeDefined()
      Object.values(message.fields).forEach((field) => {
        expect(
          parsedMessage[field.num],
          `global message ${message.num}, field ${field.num}`,
        ).toBeDefined()
      })
    })
  })

  it('parses messages that were absent from the handwritten profile', async () => {
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
