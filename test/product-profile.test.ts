import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder, getFitGarminProductDisplayName, getFitGarminProductName } from '../src/fit-parser.js'
import { FIT } from '../src/fit.js'
import { PROFILE_TYPES } from '../src/profile.js'

describe('product profile', () => {
  it('matches every maintained product ID and name without overrides', () => {
    expect(FIT.types.garmin_product).toEqual(PROFILE_TYPES.garmin_product)
  })

  // Product identifiers verified against the documented Garmin profile 21.218.0.
  it.each([
    [4565, 'fr970'],
    [4570, 'fr570_large'],
    [4574, 'fr570_small'],
    [4595, 'fenix7_pro_solar_no_wifi'],
    [4874, 'approach_s7243mm'],
    [4875, 'approach_s7247mm'],
    [4952, 'fenix9_pro43mm'],
    [4953, 'fenix9_pro47mm'],
    [4954, 'fenix9_pro51mm'],
    [4955, 'fenix9_pro_solar47mm'],
    [4956, 'fenix9_pro_solar51mm'],
    [5019, 'cirqa_smart_band'],
    [5133, 'fenix943mm'],
    [5134, 'fenix9'],
    [5169, 'enduro4'],
    [30059, 'training_peaks_virtual_ios'],
    [30060, 'training_peaks_virtual_android'],
    [30061, 'training_peaks_virtual_windows'],
    [30062, 'training_peaks_virtual_mac_os'],
    [30063, 'training_peaks_virtual_apple_tv'],
  ] as const)('resolves Garmin product %i as %s while preserving its wire identifier', async (product, name) => {
    const file = new FitEncoder().writeMessage(0, [
      { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 1 },
      { number: 2, size: 2, baseType: FitBaseType.Uint16, value: product },
    ]).close()
    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.file_ids?.[0]).toMatchObject({ manufacturer: 'garmin', product })
    expect(getFitGarminProductName(product)).toBe(name)
    expect(getFitGarminProductName(String(product))).toBe(name)
  })

  it('formats the new Forerunner model names for consumers', () => {
    expect(getFitGarminProductDisplayName(4565)).toBe('Forerunner 970')
    expect(getFitGarminProductDisplayName(4570)).toBe('Forerunner 570 Large')
    expect(getFitGarminProductDisplayName(4574)).toBe('Forerunner 570 Small')
  })
})
