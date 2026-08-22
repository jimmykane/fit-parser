import process from 'node:process'
import { Profile } from '@garmin/fitsdk'
import {
  FIT,
  FIT_VENDOR_MESSAGE_EXTENSIONS,
  FIT_VENDOR_TYPE_EXTENSIONS,
} from '../src/fit.js'
import {
  GARMIN_MESSAGES,
  GARMIN_PROFILE_VERSION,
  GARMIN_TYPES,
} from '../src/garmin_profile.generated.js'

const errors: string[] = []
const expectedVendorMessages: Record<number, { fields: number[], name: string }> = {
  18: { name: 'session', fields: [178, 188, 205, 206, 207] },
  20: { name: 'record', fields: [90, 137, 138] },
  23: { name: 'device_info', fields: [24] },
  79: { name: 'user_metrics', fields: [0, 1, 2, 3, 4, 6, 8, 11, 12, 13, 16, 19, 35, 253] },
  140: { name: 'activity_metrics', fields: [1, 4, 7, 9, 11, 20, 29, 41, 60, 61, 62, 63] },
  312: { name: 'split', fields: [107, 108, 109] },
}
const expectedVendorTypes: Record<string, Record<number, string>> = {
  mesg_num: {
    79: 'user_metrics',
    140: 'activity_metrics',
  },
}
const metadataKeys = [
  'field',
  'type',
  'baseType',
  'array',
  'scale',
  'offset',
  'units',
] as const

function sortedNumbers(values: string[]): number[] {
  return values.map(Number).sort((left, right) => left - right)
}

Object.entries(expectedVendorMessages).forEach(([messageIdText, expected]) => {
  const messageId = Number(messageIdText)
  const extension = FIT_VENDOR_MESSAGE_EXTENSIONS[messageId]
  if (!extension) {
    errors.push(`Missing registered vendor message ${messageId}`)
    return
  }
  if (extension.name !== expected.name) {
    errors.push(`Registered vendor message ${messageId} name drift`)
  }
  const actualFields = sortedNumbers(
    Object.keys(extension).filter(key => key !== 'name'),
  )
  if (
    actualFields.length !== expected.fields.length
    || actualFields.some((fieldId, index) => fieldId !== expected.fields[index])
  ) {
    errors.push(`Registered vendor message ${messageId} field set drift`)
  }
})

Object.keys(FIT_VENDOR_MESSAGE_EXTENSIONS).forEach((messageId) => {
  if (!expectedVendorMessages[Number(messageId)]) {
    errors.push(`Unregistered vendor message ${messageId}`)
  }
})

Object.entries(GARMIN_MESSAGES).forEach(([messageIdText, generatedMessage]) => {
  const messageId = Number(messageIdText)
  const mergedMessage = FIT.messages[messageId]
  if (!mergedMessage) {
    errors.push(`Missing standard message ${messageId} (${generatedMessage.name})`)
    return
  }
  if (mergedMessage.name !== generatedMessage.name) {
    errors.push(`Standard message ${messageId} name drift: ${mergedMessage.name}`)
  }

  Object.entries(generatedMessage).forEach(([fieldIdText, generatedField]) => {
    if (fieldIdText === 'name') {
      return
    }
    const fieldId = Number(fieldIdText)
    const mergedField = mergedMessage[fieldId]
    if (!mergedField) {
      errors.push(`Missing standard message ${messageId}, field ${fieldId}`)
      return
    }
    metadataKeys.forEach((key) => {
      if (mergedField[key] !== generatedField[key]) {
        errors.push(`Standard message ${messageId}, field ${fieldId} ${key} drift`)
      }
    })
  })
})

Object.entries(FIT.messages).forEach(([messageIdText, message]) => {
  const messageId = Number(messageIdText)
  const generatedMessage = GARMIN_MESSAGES[messageId]
  const extension = FIT_VENDOR_MESSAGE_EXTENSIONS[messageId]
  const fieldNames = new Map<string, number>()
  if (!generatedMessage && !extension) {
    errors.push(`Unexpected private message ${messageId} (${message.name})`)
    return
  }

  Object.keys(message)
    .filter(key => key !== 'name')
    .map(Number)
    .forEach((fieldId) => {
      const fieldName = message[fieldId].field
      const existingFieldId = fieldNames.get(fieldName)
      if (existingFieldId !== undefined) {
        errors.push(
          `Duplicate output field ${messageId}/${existingFieldId},${fieldId} (${fieldName})`,
        )
      }
      fieldNames.set(fieldName, fieldId)
      if (!generatedMessage?.[fieldId] && !extension?.[fieldId]) {
        errors.push(`Unexpected vendor field ${messageId}/${fieldId}`)
      }
    })
})

Object.entries(FIT_VENDOR_MESSAGE_EXTENSIONS).forEach(
  ([messageIdText, extension]) => {
    const messageId = Number(messageIdText)
    const mergedMessage = FIT.messages[messageId]
    Object.keys(extension)
      .filter(key => key !== 'name')
      .map(Number)
      .forEach((fieldId) => {
        const mergedField = mergedMessage?.[fieldId]
        const extensionField = extension[fieldId]
        if (!mergedField) {
          errors.push(`Missing vendor field ${messageId}/${fieldId}`)
          return
        }
        metadataKeys.forEach((key) => {
          if (mergedField[key] !== extensionField[key]) {
            errors.push(`Vendor field ${messageId}/${fieldId} ${key} drift`)
          }
        })
      })
  },
)

Object.entries(GARMIN_TYPES).forEach(([typeName, generatedValues]) => {
  const mergedValues = FIT.types[typeName]
  if (!mergedValues) {
    errors.push(`Missing standard type ${typeName}`)
    return
  }
  Object.entries(generatedValues).forEach(([valueId, generatedValue]) => {
    if (mergedValues[Number(valueId)] !== generatedValue) {
      errors.push(`Standard type ${typeName}/${valueId} drift`)
    }
  })
})

Object.entries(FIT.types).forEach(([typeName, values]) => {
  const generatedValues = GARMIN_TYPES[typeName]
  const extension = FIT_VENDOR_TYPE_EXTENSIONS[typeName]
  if (!generatedValues && !extension) {
    errors.push(`Unexpected vendor type ${typeName}`)
    return
  }
  Object.keys(values).forEach((valueId) => {
    if (
      generatedValues?.[Number(valueId)] === undefined
      && extension?.[Number(valueId)] === undefined
    ) {
      errors.push(`Unexpected vendor type value ${typeName}/${valueId}`)
    }
  })
})

Object.entries(expectedVendorTypes).forEach(([typeName, expectedValues]) => {
  const extensionValues = FIT_VENDOR_TYPE_EXTENSIONS[typeName]
  if (!extensionValues) {
    errors.push(`Missing registered vendor type ${typeName}`)
    return
  }
  Object.entries(expectedValues).forEach(([valueId, expectedValue]) => {
    if (extensionValues[Number(valueId)] !== expectedValue) {
      errors.push(`Registered vendor type ${typeName}/${valueId} drift`)
    }
    if (FIT.types[typeName]?.[Number(valueId)] !== expectedValue) {
      errors.push(`Missing merged vendor type ${typeName}/${valueId}`)
    }
  })
  Object.keys(extensionValues).forEach((valueId) => {
    if (expectedValues[Number(valueId)] === undefined) {
      errors.push(`Unregistered vendor type value ${typeName}/${valueId}`)
    }
  })
})

Object.keys(FIT_VENDOR_TYPE_EXTENSIONS).forEach((typeName) => {
  if (!expectedVendorTypes[typeName]) {
    errors.push(`Unregistered vendor type ${typeName}`)
  }
})

const sdkMessages = Object.values(Profile.messages)
const privateMessageIds = Object.keys(FIT_VENDOR_MESSAGE_EXTENSIONS)
  .map(Number)
  .filter(messageId => !GARMIN_MESSAGES[messageId])
  .sort((left, right) => left - right)
const vendorFieldCount = Object.values(FIT_VENDOR_MESSAGE_EXTENSIONS)
  .reduce(
    (count, message) => count + Object.keys(message).filter(key => key !== 'name').length,
    0,
  )

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
  vendorFields: vendorFieldCount,
  privateMessageIds,
  errors,
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (errors.length > 0) {
  process.exitCode = 1
}
