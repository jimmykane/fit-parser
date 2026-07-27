import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('temperature unit conversion', () => {
  it.each([
    {
      expectedRecord: 19,
      expectedSession: [10, 12, 19],
      label: 'the default Celsius unit',
      temperatureUnit: undefined,
    },
    {
      expectedRecord: 19,
      expectedSession: [10, 12, 19],
      label: 'the canonical Celsius unit',
      temperatureUnit: 'celsius',
    },
    {
      expectedRecord: 19,
      expectedSession: [10, 12, 19],
      label: 'the legacy Celsius alias',
      temperatureUnit: '°C',
    },
    {
      expectedRecord: 66.2,
      expectedSession: [50, 53.6, 66.2],
      label: 'Fahrenheit',
      temperatureUnit: 'fahrenheit',
    },
    {
      expectedRecord: 292.15,
      expectedSession: [283.15, 285.15, 292.15],
      label: 'Kelvin',
      temperatureUnit: 'kelvin',
    },
  ])('converts record and session temperatures to $label', async ({
    expectedRecord,
    expectedSession,
    temperatureUnit,
  }) => {
    const fitParser = new FitParser({
      force: true,
      ...(temperatureUnit ? { temperatureUnit } : {}),
    })
    const buffer = await fs.readFile('./examples/file-with-zones.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    const record = fitObject.records?.find(item => item.temperature !== undefined)
    const session = fitObject.sessions?.[0]
    expect(record).toBeDefined()
    expect(session).toBeDefined()
    expect(record?.temperature).toBeCloseTo(expectedRecord)
    expect(session?.min_temperature).toBeCloseTo(expectedSession[0])
    expect(session?.avg_temperature).toBeCloseTo(expectedSession[1])
    expect(session?.max_temperature).toBeCloseTo(expectedSession[2])
  })
})
