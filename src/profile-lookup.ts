import { PROFILE_TYPES } from './profile.js'

type FitProfileNameMap = Readonly<Record<number, string>>

const FIT_PROFILE_MANUFACTURERS = PROFILE_TYPES.manufacturer as FitProfileNameMap
const FIT_PROFILE_GARMIN_PRODUCTS = PROFILE_TYPES.garmin_product as FitProfileNameMap
const FIT_PROFILE_SPORTS = PROFILE_TYPES.sport as FitProfileNameMap
const FIT_PROFILE_SUB_SPORTS = PROFILE_TYPES.sub_sport as FitProfileNameMap

function getProfileName(
  mapping: FitProfileNameMap,
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value
  if (!Number.isFinite(id)) {
    return null
  }

  return mapping[id] ?? null
}

/** Resolves a FIT manufacturer identifier to its canonical profile name. */
export function getFitManufacturerName(value: number | string | null | undefined): string | null {
  return getProfileName(FIT_PROFILE_MANUFACTURERS, value)
}

/** Resolves a Garmin product identifier to its canonical profile name. */
export function getFitGarminProductName(value: number | string | null | undefined): string | null {
  return getProfileName(FIT_PROFILE_GARMIN_PRODUCTS, value)
}

/** Resolves a FIT sport identifier to its canonical profile name. */
export function getFitSportName(value: number | string | null | undefined): string | null {
  return getProfileName(FIT_PROFILE_SPORTS, value)
}

/** Resolves a FIT sub-sport identifier to its canonical profile name. */
export function getFitSubSportName(value: number | string | null | undefined): string | null {
  return getProfileName(FIT_PROFILE_SUB_SPORTS, value)
}

/**
 * Resolves a Garmin product identifier to a human-readable device name.
 * This does not alter parsed `product` or `product_name` fields.
 */
export function getFitGarminProductDisplayName(value: number | string | null | undefined): string | null {
  const name = getFitGarminProductName(value)
  if (!name) {
    return null
  }

  // Preserve the established display spelling for the optical heart-rate product.
  const displaySource = name === 'o_hr' ? 'o_h_r' : name
  const formatted = displaySource
    .replace(/^fr(\d+)/i, 'Forerunner $1')
    .replace(/^fenix(\d+)/i, 'Fenix $1')
    .replace(/^edge(\d+)/i, 'Edge $1')
    .replace(/^vivoactive/i, 'VivoActive')
    .replace(/^vivosmart/i, 'VivoSmart')
    .replace(/^vivofit/i, 'VivoFit')
    .replace(/^vivomove/i, 'VivoMove')
    .replace(/^vivosport/i, 'VivoSport')
    .replace(/^approach([A-Z\d])/i, 'Approach $1')
    .replace(/^marq([A-Z])/i, 'Marq $1')
    .replace(/^hrm/i, 'HRM ')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/(\d)([a-z])/gi, '$1 $2')

  return formatted
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase()
      if (lower === 'apac')
        return 'APAC'
      if (lower === 'xt')
        return 'XT'
      if (lower === 'lte')
        return 'LTE'
      if (lower === 'hr')
        return 'HR'
      if (lower === 'gps')
        return 'GPS'
      if (lower === 'mtb')
        return 'MTB'
      if (lower === 'ii')
        return 'II'
      if (lower === 'iii')
        return 'III'
      if (lower === 'm' && name.toLowerCase().includes('645m'))
        return 'Music'
      if (lower === 'jpn')
        return 'Japan'
      if (lower === 'chn')
        return 'China'
      if (lower === 'twn')
        return 'Taiwan'
      if (lower === 'kor')
        return 'Korea'
      if (lower === 'rus')
        return 'Russia'
      if (lower === 'sea')
        return 'SEA'
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
    .replace(/Vivo Active/g, 'VivoActive')
    .trim()
}
