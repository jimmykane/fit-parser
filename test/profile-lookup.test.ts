import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import FitParser, {
  FitBaseType,
  FitEncoder,
  getFitGarminProductDisplayName,
  getFitGarminProductName,
  getFitManufacturerName,
  getFitSportName,
  getFitSubSportName,
} from '../src/fit-parser.js'
import { PROFILE_TYPES } from '../src/profile.js'

function fingerprint(mapping: Readonly<Record<number, string | number>>): string {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(mapping).sort(([left], [right]) => Number(left) - Number(right))))
    .digest('hex')
}

describe('fit profile lookup API', () => {
  it('locks the complete lookup surface', () => {
    const mappings = {
      manufacturers: PROFILE_TYPES.manufacturer,
      products: PROFILE_TYPES.garmin_product,
      sports: PROFILE_TYPES.sport,
      subSports: PROFILE_TYPES.sub_sport,
    }

    expect(Object.fromEntries(
      Object.entries(mappings).map(([name, mapping]) => [name, Object.keys(mapping).length]),
    )).toEqual({
      manufacturers: 243,
      products: 479,
      sports: 82,
      subSports: 114,
    })

    expect(Object.fromEntries(
      Object.entries(mappings).map(([name, mapping]) => [name, fingerprint(mapping)]),
    )).toEqual({
      manufacturers: 'fe6227bce757907f5708e92a743ff0bce2f4a5c7a47ba3ada704727624de0816',
      products: '6bfe7d5fd3d793c80d7e00ad97e97fb0ce78f1c59075ccb7a28b33a026d3863d',
      sports: 'c3afd60238fca4f98f6a6de44b4348530124680b9a1b5b8ec710c2d9cf95ed27',
      subSports: 'c0bf27dff0d313b8d490f61dff0c697d2cf4b9157dfe1ed38f4e148c9481f84d',
    })
  })

  it('resolves every maintained value through the public lookup functions', () => {
    const lookups = [
      [PROFILE_TYPES.manufacturer, getFitManufacturerName],
      [PROFILE_TYPES.garmin_product, getFitGarminProductName],
      [PROFILE_TYPES.sport, getFitSportName],
      [PROFILE_TYPES.sub_sport, getFitSubSportName],
    ] as const

    lookups.forEach(([mapping, lookup]) => {
      Object.entries(mapping).forEach(([id, name]) => {
        expect(lookup(id)).toBe(name)
      })
    })
  })

  it('resolves numeric and numeric-string profile identifiers', () => {
    expect(getFitManufacturerName(1)).toBe('garmin')
    expect(getFitManufacturerName('23')).toBe('suunto')
    expect(getFitGarminProductName(4655)).toBe('edge_mtb')
    expect(getFitSportName('4')).toBe('fitness_equipment')
    expect(getFitSubSportName(153)).toBe('mountain_enduro')
    expect(getFitSubSportName('154')).toBe('mountain_downhill')
  })

  it('returns null for absent or unknown profile identifiers', () => {
    expect(getFitManufacturerName(undefined)).toBeNull()
    expect(getFitGarminProductName(null)).toBeNull()
    expect(getFitSportName('not-a-number')).toBeNull()
    expect(getFitSubSportName(99999)).toBeNull()
  })

  it('formats established Garmin product display names', () => {
    expect(getFitGarminProductDisplayName(1836)).toBe('Edge 1000')
    expect(getFitGarminProductDisplayName('4655')).toBe('Edge MTB')
    expect(getFitGarminProductDisplayName(2888)).toBe('Forerunner 645 Music')
    expect(getFitGarminProductDisplayName(255)).toBe('O H R')
    expect(getFitGarminProductDisplayName(99999)).toBeNull()

    const displayNames = Object.keys(PROFILE_TYPES.garmin_product)
      .map(Number)
      .sort((left, right) => left - right)
      .map(productId => [productId, getFitGarminProductDisplayName(productId)])
    expect(createHash('sha256').update(JSON.stringify(displayNames)).digest('hex'))
      .toBe('65e2e48698885b89ee74052e31bf3f9470476a9b47ecfdf764ec61c2bac0cf94')
  })

  it.each([
    [153, 'mountain_enduro'],
    [154, 'mountain_downhill'],
  ])('decodes sub-sport profile ID %i as %s', async (subSport, expectedName) => {
    const file = new FitEncoder().writeMessage(18, [
      { number: 5, size: 1, baseType: FitBaseType.Enum, value: 2 },
      { number: 6, size: 1, baseType: FitBaseType.Enum, value: subSport },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.sessions?.[0]).toMatchObject({
      sport: 'cycling',
      sub_sport: expectedName,
    })
  })
})
