import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('zones regression tests', () => {
    it('expects time_in_power_zone to be parsed in file-with-zones.fit', async () => {
        const fitParser = new FitParser({ force: true })
        // Use the example file provided by the user
        const buffer = await fs.readFile('./examples/file-with-zones.fit')
        const fitObject = await fitParser.parseAsync(buffer)

        expect(fitObject).toHaveProperty('time_in_zone')
        const timeInZone = fitObject.time_in_zone || []

        expect(timeInZone.length).toBeGreaterThan(0)

        // Find a record that should have power zones
        // Based on our analysis, they all seemed to have it after the fix
        const msgWithPower = timeInZone.find((msg: any) => msg.time_in_power_zone && msg.time_in_power_zone.length > 0)

        expect(msgWithPower).toBeDefined()
        expect(msgWithPower.time_in_power_zone).toBeInstanceOf(Array)

        // Verify values match approximately what we saw (sum > 0)
        const powerZoneSum = msgWithPower.time_in_power_zone.reduce((a: number, b: number) => a + b, 0)
        expect(powerZoneSum).toBeGreaterThan(0)

        // Verify boundaries
        expect(msgWithPower).toHaveProperty('power_zone_high_boundary')
        expect(msgWithPower.power_zone_high_boundary).toBeInstanceOf(Array)

        // Use SDK ground truth: We verified there are 7 active zones (plus potential padding)
        // The array size is fixed (e.g. 10), but populated values matter.
        // We expect at least 7 zones based on the file analysis.
        expect(msgWithPower.time_in_power_zone.length).toBeGreaterThanOrEqual(7)
        expect(msgWithPower.power_zone_high_boundary.length).toBeGreaterThanOrEqual(7)
    })

    it('expects time_in_power_zone to NOT contain sentinel values in downhill.fit', async () => {
        const fitParser = new FitParser({ force: true })
        const buffer = await fs.readFile('./examples/downhill.fit')
        const fitObject = await fitParser.parseAsync(buffer)

        // Check sessions
        if (fitObject.sessions && fitObject.sessions.length > 0) {
            const session = fitObject.sessions[0];
            if (session.time_in_power_zone) {
                const invalidValue = 4294967.295;
                const hasInvalid = session.time_in_power_zone.some((v: any) => Math.abs(v - invalidValue) < 0.1);
                expect(hasInvalid).toBe(false);
            }
        }
    })
})
