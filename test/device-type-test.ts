import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('device type mapping tests', () => {
    it('expects correct resolution for Local, BLE and ANT+ device types', async () => {
        const fitParser = new FitParser({ force: true })
        const buffer = await fs.readFile('./test/jumps-mtb.fit')
        const fitObject = await fitParser.parseAsync(buffer)

        expect(fitObject).toHaveProperty('device_infos')
        const deviceInfos = fitObject.device_infos || []

        // Index 2: Local GPS (source_type: local, device_type: 0)
        const gpsDevice = deviceInfos.find(d => d.device_index === 2 && d.source_type === 'local')
        expect(gpsDevice).toBeDefined()
        expect(gpsDevice?.device_type).toBe('gps')

        // Index 3: BLE HR (source_type: bluetooth_low_energy, device_type: 1)
        const bleHrDevice = deviceInfos.find(d => d.device_index === 3 && d.source_type === 'bluetooth_low_energy')
        expect(bleHrDevice).toBeDefined()
        expect(bleHrDevice?.device_type).toBe('heart_rate')

        // Index 4: ANT+ Shifting (source_type: antplus, device_type: 34)
        const antShiftingDevice = deviceInfos.find(d => d.device_index === 4 && d.source_type === 'antplus')
        expect(antShiftingDevice).toBeDefined()
        expect(antShiftingDevice?.device_type).toBe('shifting')

        // Index 4: Local Barometer (is also there in some records, usually shared device index?)
        // In this file index 2 seems reused across timestamps or message types
        const barometerDevice = deviceInfos.find(d => d.device_type === 'barometer')
        expect(barometerDevice).toBeDefined()
        expect(barometerDevice?.source_type).toBe('local')
    })
})
