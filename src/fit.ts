import type { FitOptions, MesgNum } from './fit_types.js'
import { PROFILE_MESSAGES, PROFILE_TYPES } from './profile.js'

export type MessageName = Exclude<MesgNum, number | 'definition'>

const metersInOneKilometer = 1000
const secondsInOneHour = 3600
// according to https://en.wikipedia.org/wiki/Mile
const metersInOneMile = 1609.344
const centiBarsInOneBar = 100
const psiInOneBar = 14.5037738

export interface FieldDefinition {
  type: string | number
  rawType?: string | number
  fDefNo: number
  size: number
  array?: boolean
  endianAbility: boolean
  littleEndian: boolean
  baseTypeNo: number
  name: string
  dataType: string
  scale?: number | null
  offset?: number
  units?: string
  requiresBoundedDataView?: boolean
  developerDataIndex?: number
  isDeveloperField?: boolean
}

export interface MessageObject {
  field: string
  type: string
  baseType?: string
  array?: boolean
  scale: number | null
  offset: number
  units: string
}

export interface Message {
  name: MessageName
  [fieldId: number]: MessageObject
}

export interface FitType {
  scConst: number
  options: FitOptions
  messages: Record<number, Message>
  types: Record<string, Record<number, string | number>>
}

const options: FitOptions = {
  speedUnits: {
    'm/s': { multiplier: 1, offset: 0 },
    'mph': { multiplier: secondsInOneHour / metersInOneMile, offset: 0 },
    'km/h': { multiplier: secondsInOneHour / metersInOneKilometer, offset: 0 },
  },
  lengthUnits: {
    m: { multiplier: 1, offset: 0 },
    mi: { multiplier: 1 / metersInOneMile, offset: 0 },
    km: { multiplier: 1 / metersInOneKilometer, offset: 0 },
  },
  temperatureUnits: {
    'celsius': { multiplier: 1, offset: 0 },
    '°C': { multiplier: 1, offset: 0 },
    'kelvin': { multiplier: 1, offset: 273.15 },
    'fahrenheit': { multiplier: 9 / 5, offset: 32 },
  },
  pressureUnits: {
    cbar: { multiplier: centiBarsInOneBar, offset: 0 },
    bar: { multiplier: 1, offset: 0 },
    psi: { multiplier: psiInOneBar, offset: 0 },
  },
}

export const FIT: FitType = {
  scConst: 180 / 2 ** 31,
  options,
  messages: PROFILE_MESSAGES,
  types: PROFILE_TYPES,
}
