import { describe, expect, it } from 'vitest'
import { FIT } from '../src/fit.js'
import { GARMIN_TYPES } from '../src/garmin_profile.generated.js'

describe('garmin product profile', () => {
  it('matches every generated product ID and name without overrides', () => {
    expect(FIT.types.garmin_product).toEqual(GARMIN_TYPES.garmin_product)
  })
})
