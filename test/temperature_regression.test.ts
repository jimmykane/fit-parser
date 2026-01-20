import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import FitParser from '../src/fit-parser'

const RELATIVE_PATH_TO_EXAMPLES = '../examples'

describe('temperature Regression Tests', () => {
  it('should parse negative temperatures correctly in tempissue1.fit', async () => {
    const filePath = path.join(__dirname, RELATIVE_PATH_TO_EXAMPLES, 'tempissue1.fit')
    const content = fs.readFileSync(filePath)
    const parser = new FitParser({
      force: true,
      temperatureUnit: 'celsius',
    })

    return new Promise<void>((resolve, reject) => {
      parser.parse(content, (error, data) => {
        if (error) {
          reject(error)
          return
        }

        // We expect to find temperatures that are negative
        // Currently they are being parsed as 250-255

        // Collect all temperature values
        const temperatures: number[] = []

        if (data.records) {
          data.records.forEach((record: any) => {
            if (record.temperature !== undefined) {
              temperatures.push(record.temperature)
            }
          })
        }

        try {
          // Check if we have any negative temperatures
          const hasNegativeTemps = temperatures.some(t => t < 0)

          // This assertion should FAIL before the fix
          expect(hasNegativeTemps).toBe(true)

          // Also check that we DON'T have suspicious high values (e.g. > 100 degrees C)
          // 250 unsigned is -6 signed
          const hasSuspiciousHighTemps = temperatures.some(t => t > 100)
          expect(hasSuspiciousHighTemps).toBe(false)
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    })
  })

  it('should parse positive temperatures correctly in tempissue2.fit', async () => {
    const filePath = path.join(__dirname, RELATIVE_PATH_TO_EXAMPLES, 'tempissue2.fit')
    const content = fs.readFileSync(filePath)
    const parser = new FitParser({
      force: true,
      temperatureUnit: 'celsius',
    })

    return new Promise<void>((resolve, reject) => {
      parser.parse(content, (error, data) => {
        if (error) {
          reject(error)
          return
        }

        const temperatures: number[] = []
        if (data.records) {
          data.records.forEach((record: any) => {
            if (record.temperature !== undefined) {
              temperatures.push(record.temperature)
            }
          })
        }

        try {
          // Should have reasonable positive temperatures
          const hasReasonableTemps = temperatures.every(t => t >= 0 && t < 100)
          expect(hasReasonableTemps).toBe(true)
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    })
  })
})
