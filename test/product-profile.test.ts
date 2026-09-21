import { describe, expect, it } from 'vitest'
import { FIT } from '../src/fit.js'
import { PROFILE_TYPES } from '../src/profile.js'

describe('product profile', () => {
  it('matches every maintained product ID and name without overrides', () => {
    expect(FIT.types.garmin_product).toEqual(PROFILE_TYPES.garmin_product)
  })
})
