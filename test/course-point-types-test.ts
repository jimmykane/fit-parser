import { describe, expect, it } from 'vitest'
import { FIT } from '../src/fit.js'

describe('course point profile types', () => {
  it('should expose newer Garmin Up Ahead course point values', () => {
    const expectedTypes = {
      27: 'campsite',
      28: 'aid_station',
      29: 'rest_area',
      30: 'general_distance',
      31: 'service',
      32: 'energy_gel',
      33: 'sports_drink',
      34: 'mile_marker',
      35: 'checkpoint',
      36: 'shelter',
      37: 'meeting_spot',
      38: 'overlook',
      39: 'toilet',
      40: 'shower',
      41: 'gear',
      42: 'sharp_curve',
      43: 'steep_incline',
      44: 'tunnel',
      45: 'bridge',
      46: 'obstacle',
      47: 'crossing',
      48: 'store',
      49: 'transition',
      50: 'navaid',
      51: 'transport',
      52: 'alert',
      53: 'info',
    } as const

    Object.entries(expectedTypes).forEach(([id, coursePointType]) => {
      expect(FIT.types.course_point[Number(id)]).toBe(coursePointType)
    })
  })
})
