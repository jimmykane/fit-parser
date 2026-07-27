import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('pressure unit conversion', () => {
  it.each([
    {
      end: 65.29,
      label: 'the default bar unit',
      pressure: 223.59,
      pressureUnit: undefined,
      start: 223.59,
    },
    {
      end: 6529,
      label: 'centibars',
      pressure: 22359,
      pressureUnit: 'cbar',
      start: 22359,
    },
    {
      end: 65.29,
      label: 'bar',
      pressure: 223.59,
      pressureUnit: 'bar',
      start: 223.59,
    },
    {
      end: 946.951391402,
      label: 'PSI',
      pressure: 3242.898783942,
      pressureUnit: 'psi',
      start: 3242.898783942,
    },
  ])('converts tank pressures to $label', async ({
    end,
    pressure,
    pressureUnit,
    start,
  }) => {
    const fitParser = new FitParser({
      force: true,
      ...(pressureUnit ? { pressureUnit } : {}),
    })
    const buffer = await fs.readFile('./examples/example-diving.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject.tank_updates?.[0]?.pressure).toBeCloseTo(pressure)
    expect(fitObject.tank_summaries?.[0]?.start_pressure).toBeCloseTo(start)
    expect(fitObject.tank_summaries?.[0]?.end_pressure).toBeCloseTo(end)
  })
})
