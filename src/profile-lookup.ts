import type { FitProfileValueMap } from './profile-lookup-data.js'
import {
  FIT_PROFILE_COURSE_POINTS,
  FIT_PROFILE_GARMIN_PRODUCTS,
  FIT_PROFILE_MANUFACTURERS,
  FIT_PROFILE_SPORTS,
  FIT_PROFILE_SUB_SPORTS,
} from './profile-lookup-data.js'

function normalizeProfileName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, '')
}

function createProfileIdMap(mapping: FitProfileValueMap): ReadonlyMap<string, number> {
  return new Map(
    Object.entries(mapping)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([id, name]) => [normalizeProfileName(name), Number(id)]),
  )
}

const FIT_PROFILE_SPORT_IDS = createProfileIdMap(FIT_PROFILE_SPORTS)
const FIT_PROFILE_SUB_SPORT_IDS = createProfileIdMap(FIT_PROFILE_SUB_SPORTS)
const FIT_PROFILE_COURSE_POINT_IDS = createProfileIdMap(FIT_PROFILE_COURSE_POINTS)

function getProfileName(
  mapping: FitProfileValueMap,
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    return null
  }

  const normalizedValue = typeof value === 'string' ? value.trim() : value
  if (normalizedValue === '' || (typeof normalizedValue === 'string' && !/^\d+$/.test(normalizedValue))) {
    return null
  }

  const id = Number(normalizedValue)
  if (!Number.isSafeInteger(id) || id < 0) {
    return null
  }

  const name = mapping[id]
  return typeof name === 'string' ? name : null
}

function getProfileId(
  mapping: ReadonlyMap<string, number>,
  value: string | null | undefined,
): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const name = normalizeProfileName(value)
  if (name === '') {
    return null
  }
  return mapping.get(name) ?? null
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

/** Resolves a FIT sport name to its numeric profile identifier. */
export function getFitSportId(value: string | null | undefined): number | null {
  return getProfileId(FIT_PROFILE_SPORT_IDS, value)
}

/** Resolves a FIT sub-sport name to its numeric profile identifier. */
export function getFitSubSportId(value: string | null | undefined): number | null {
  return getProfileId(FIT_PROFILE_SUB_SPORT_IDS, value)
}

/** Resolves a FIT course-point name to its numeric profile identifier. */
export function getFitCoursePointId(value: string | null | undefined): number | null {
  return getProfileId(FIT_PROFILE_COURSE_POINT_IDS, value)
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
