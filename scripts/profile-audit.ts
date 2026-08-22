import process from 'node:process'
import { Profile } from '@garmin/fitsdk'
import { FIT } from '../src/fit.js'
import {
  GARMIN_MESSAGES,
  GARMIN_PROFILE_VERSION,
  GARMIN_TYPES,
} from '../src/garmin_profile.generated.js'

const expectedPrivateMessageIds = [79, 140]
const errors: string[] = []
const sdkMessages = Object.values(Profile.messages)
const sdkMessageIds = new Set(sdkMessages.map(message => message.num))

function equivalentProfileName(
  left: string | number,
  right: string | number,
): boolean {
  return String(left).replace(/_/g, '').toLowerCase()
    === String(right).replace(/_/g, '').toLowerCase()
}

sdkMessages.forEach((message) => {
  const generatedMessage = GARMIN_MESSAGES[message.num]
  const mergedMessage = FIT.messages[message.num]
  if (!generatedMessage || !mergedMessage) {
    errors.push(`Missing global message ${message.num} (${message.name})`)
    return
  }

  if (!equivalentProfileName(mergedMessage.name, generatedMessage.name)) {
    errors.push(
      `Profile message name drift for message ${message.num}: ${mergedMessage.name}`,
    )
  }

  Object.values(message.fields).forEach((field) => {
    const generatedField = generatedMessage[field.num]
    const mergedField = mergedMessage[field.num]
    if (!generatedField || !mergedField) {
      errors.push(
        `Missing global message ${message.num}, field ${field.num} (${field.name})`,
      )
      return
    }

    if (!equivalentProfileName(mergedField.field, generatedField.field)) {
      errors.push(
        `Profile field name drift for message ${message.num}, field ${field.num}: ${mergedField.field}`,
      )
    }

    const metadataKeys = [
      'type',
      'baseType',
      'array',
      'scale',
      'offset',
      'units',
    ] as const
    metadataKeys.forEach((key) => {
      if (mergedField[key] !== generatedField[key]) {
        errors.push(
          `Profile metadata drift for message ${message.num}, field ${field.num} (${field.name}): ${key}`,
        )
      }
    })
  })
})

Object.keys(Profile.types).forEach((typeName) => {
  const generatedTypeName = Object.keys(GARMIN_TYPES).find((candidate) => {
    return candidate.replace(/_/g, '').toLowerCase()
      === typeName.toLowerCase()
  })
  if (!generatedTypeName || !FIT.types[generatedTypeName]) {
    errors.push(`Missing profile type ${typeName}`)
  }
})

const privateMessageIds = Object.keys(FIT.messages)
  .map(Number)
  .filter(messageId => !sdkMessageIds.has(messageId))
  .sort((left, right) => left - right)

if (
  privateMessageIds.length !== expectedPrivateMessageIds.length
  || privateMessageIds.some(
    (messageId, index) => messageId !== expectedPrivateMessageIds[index],
  )
) {
  errors.push(
    `Unexpected private message overlays: ${privateMessageIds.join(', ')}`,
  )
}

const report = {
  sdkVersion: [
    GARMIN_PROFILE_VERSION.major,
    GARMIN_PROFILE_VERSION.minor,
    GARMIN_PROFILE_VERSION.patch,
  ].join('.'),
  standardMessages: sdkMessages.length,
  standardFields: sdkMessages.reduce(
    (count, message) => count + Object.keys(message.fields).length,
    0,
  ),
  profileTypes: Object.keys(Profile.types).length,
  privateMessageIds,
  errors,
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (errors.length > 0) {
  process.exitCode = 1
}
