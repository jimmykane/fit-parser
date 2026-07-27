import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { FitBaseType, FitEncoder } from '../src/fit-encoder.js'
import FitParser from '../src/fit-parser.js'

describe('unknown enum handling', () => {
  it('recognizes sport values added by the pinned Garmin profile', async () => {
    const fitParser = new FitParser({ force: true, mode: 'both' })
    const buffer = await fs.readFile('./test/snorkeling-unknown-sport.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject.sessions?.[0]?.sport).toBe('snorkeling')
    expect(fitObject.activity?.sessions?.[0]?.sport).toBe('snorkeling')

    // Known enum mappings still map to string values
    expect(fitObject.file_ids?.[0]?.manufacturer).toBe('suunto')
  })

  it('keeps raw enum IDs that are absent from the pinned Garmin profile', async () => {
    const file = new FitEncoder()
      .writeMessage(18, [
        {
          number: 5,
          size: 1,
          baseType: FitBaseType.Enum,
          value: 250,
        },
      ])
      .close()

    const fitObject = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(fitObject.sessions?.[0]?.sport).toBe(250)
  })
})
