import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('jump message tests', () => {
  it('expects jump message to be parsed with all fields', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./examples/jumps-mtb.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('jumps')
    expect(fitObject.jumps).toBeDefined()
    expect(fitObject.jumps!.length).toBeGreaterThan(0)

    const firstJump = fitObject.jumps![0]

    // Verify all expected fields are present
    expect(firstJump).toHaveProperty('timestamp')
    expect(firstJump).toHaveProperty('distance')
    expect(firstJump).toHaveProperty('hang_time')
    expect(firstJump).toHaveProperty('score')
    expect(firstJump).toHaveProperty('position_lat')
    expect(firstJump).toHaveProperty('position_long')
    expect(firstJump).toHaveProperty('speed')
  })

  it('expects first jump to have correct values', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./examples/jumps-mtb.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    const firstJump = fitObject.jumps![0]

    // Expected values from user-provided data
    // distance: 2.069174 m
    // hang_time: 0.36 s
    // score: 62.43974
    // position_lat: 39.66786°
    // position_long: 20.83819°
    // enhanced_speed: 5.748 m/s

    expect(firstJump.distance).toBeCloseTo(2.069, 2)
    expect(firstJump.hang_time).toBeCloseTo(0.36, 2)
    expect(firstJump.score).toBeCloseTo(62.44, 1)
    expect(firstJump.position_lat).toBeCloseTo(39.6679, 3)
    expect(firstJump.position_long).toBeCloseTo(20.8382, 3)
    expect(firstJump.speed).toBeCloseTo(5.748, 2)
  })

  it('expects session to have jump_count field', async () => {
    const fitParser = new FitParser({ force: true, mode: 'both' })
    const buffer = await fs.readFile('./examples/jumps-mtb.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('activity')
    expect(fitObject.activity).toHaveProperty('sessions')
    expect(fitObject.activity.sessions!.length).toBeGreaterThan(0)

    const session = fitObject.activity.sessions![0]
    expect(session).toHaveProperty('jump_count')
    expect(session.jump_count).toBe(11)
  })
})
