import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('temperature unit conversion', () => {
    it('converts min, avg, and max temperature from celsius to fahrenheit in file-with-zones.fit', async () => {
        const fitParser = new FitParser({ force: true, temperatureUnit: 'fahrenheit' })
        const buffer = await fs.readFile('./examples/file-with-zones.fit')
        const fitObject = await fitParser.parseAsync(buffer)

        const session = fitObject.sessions?.[0]
        expect(session).toBeDefined()
        expect(session.min_temperature).toBeCloseTo(50, 1)    // 10°C → 50°F
        expect(session.avg_temperature).toBeCloseTo(53.6, 1)  // 12°C → 53.6°F
        expect(session.max_temperature).toBeCloseTo(66.2, 1)  // 19°C → 66.2°F
    })
})
