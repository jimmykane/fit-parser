import type { FitOptions, MesgNum } from './fit_types.js'
import { GARMIN_MESSAGES, GARMIN_TYPES } from './garmin_profile.generated.js'

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

/**
 * Garmin fields observed in the external FIT corpus but absent from the pinned
 * public SDK profile. These additions may not replace standard SDK fields.
 */
export const FIT_VENDOR_MESSAGE_EXTENSIONS: Record<number, Message> = {
  18: {
    name: 'session',
    178: field('est_sweat_loss', 'uint16', 1, 'ml'),
    188: field('primary_benefit', 'uint8'),
    205: field('beginning_potential_stamina', 'uint8', 1, 'percent'),
    206: field('ending_potential_stamina', 'uint8', 1, 'percent'),
    207: field('min_stamina', 'uint8', 1, 'percent'),
  },
  20: {
    name: 'record',
    90: field('garmin_performance_condition', 'sint8'),
    137: field('potential_stamina', 'uint8', 1, 'percent'),
    138: field('stamina', 'uint8', 1, 'percent'),
  },
  23: {
    name: 'device_info',
    24: field('ant_id', 'uint32z'),
  },
  // Undocumented Garmin user metrics message observed in activity FIT files.
  79: {
    name: 'user_metrics',
    0: field('vo2_max', 'uint16', 1024 / 3.5, 'ml/kg/min'),
    1: field('age', 'uint8', 1, 'years'),
    2: field('height', 'uint8', 100, 'm'),
    3: field('weight', 'uint16', 10, 'kg'),
    4: field('gender', 'gender'),
    6: field('max_heart_rate', 'uint8', 1, 'bpm'),
    8: field('remaining_recovery_time', 'uint16'),
    11: field('lthr', 'uint16', 1, 'bpm'),
    12: field('ltpower', 'uint16', 1, 'watts'),
    13: field('ltspeed', 'uint16', 1000, 'm/s'),
    16: field('start_of_activity', 'date_time'),
    19: field('first_vo2_max', 'uint32', 65536 / 3.5, 'ml/kg/min'),
    35: field('end_of_previous_activity', 'date_time'),
    253: field('timestamp', 'date_time'),
  },
  // Undocumented Garmin activity metrics message observed in activity FIT files.
  140: {
    name: 'activity_metrics',
    1: field('new_max_heart_rate', 'uint8', 1, 'bpm'),
    4: field('aerobic_training_effect', 'uint8', 10),
    7: field('vo2_max', 'uint32', 65536 / 3.5, 'ml/kg/min'),
    9: field('recovery_time', 'uint16', 1, 'min'),
    11: field('sport', 'sport'),
    20: field('anaerobic_training_effect', 'uint8', 10),
    29: field('first_vo2_max', 'uint32', 65536 / 3.5, 'ml/kg/min'),
    41: field('primary_benefit', 'uint8'),
    60: field('total_ascent', 'uint16', 1, 'm'),
    61: field('total_descent', 'uint16', 1, 'm'),
    62: field('avg_power', 'uint16', 1, 'watts'),
    63: field('avg_heart_rate', 'uint8', 1, 'bpm'),
  },
  312: {
    name: 'split',
    107: field('beginning_potential_stamina', 'uint8', 1, 'percent'),
    108: field('ending_potential_stamina', 'uint8', 1, 'percent'),
    109: field('min_stamina', 'uint8', 1, 'percent'),
  },
}

export const FIT_VENDOR_TYPE_EXTENSIONS: Record<string, Record<number, string>> = {
  mesg_num: {
    79: 'user_metrics',
    140: 'activity_metrics',
  },
}

function field(
  name: string,
  type: string,
  scale = 1,
  units = '',
  baseType?: string,
): MessageObject {
  return {
    field: name,
    type,
    ...(baseType ? { baseType } : {}),
    scale,
    offset: 0,
    units,
  }
}

function mergeVendorMessages(): Record<number, Message> {
  const messages = { ...GARMIN_MESSAGES }

  Object.entries(FIT_VENDOR_MESSAGE_EXTENSIONS).forEach(
    ([messageIdText, extension]) => {
      const messageId = Number(messageIdText)
      const standardMessage = messages[messageId]
      if (!standardMessage) {
        messages[messageId] = extension
        return
      }
      if (standardMessage.name !== extension.name) {
        throw new Error(`Vendor message ${messageId} conflicts with the Garmin SDK name`)
      }

      Object.keys(extension)
        .filter(key => key !== 'name')
        .forEach((fieldId) => {
          if (standardMessage[Number(fieldId)]) {
            throw new Error(
              `Vendor message ${messageId}, field ${fieldId} conflicts with the Garmin SDK profile`,
            )
          }
        })
      messages[messageId] = { ...standardMessage, ...extension }
    },
  )

  return messages
}

function mergeVendorTypes(): Record<string, Record<number, string | number>> {
  const types = Object.fromEntries(
    Object.entries(GARMIN_TYPES).map(([name, values]) => [name, { ...values }]),
  )

  Object.entries(FIT_VENDOR_TYPE_EXTENSIONS).forEach(([name, extension]) => {
    const standardValues = types[name] ?? {}
    Object.keys(extension).forEach((valueId) => {
      if (standardValues[Number(valueId)] !== undefined) {
        throw new Error(
          `Vendor type ${name}, value ${valueId} conflicts with the Garmin SDK profile`,
        )
      }
    })
    types[name] = { ...standardValues, ...extension }
  })

  return types
}

export const FIT: FitType = {
  scConst: 180 / 2 ** 31,
  options,
  messages: mergeVendorMessages(),
  types: mergeVendorTypes(),
}
