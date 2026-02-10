import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('unknown enum handling', () => {
  it('keeps raw enum IDs for unknown sport values', async () => {
    const fitParser = new FitParser({ force: true, mode: 'both' })
    const buffer = await fs.readFile('./test/snorkeling-unknown-sport.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject.sessions?.[0]?.sport).toBe(82)
    expect(fitObject.activity?.sessions?.[0]?.sport).toBe(82)

    // Known enum mappings still map to string values
    expect(fitObject.file_ids?.[0]?.manufacturer).toBe('suunto')
  })
})
