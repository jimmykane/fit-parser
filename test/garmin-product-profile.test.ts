import { Profile } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { FIT } from '../src/fit.js'

describe('garmin product profile', () => {
  it('matches every product ID and name in the pinned Garmin SDK profile', () => {
    const sdkProducts = Profile.types.garminProduct as Record<number, string>

    expect(FIT.types.garmin_product).toMatchObject(sdkProducts)
  })
})
