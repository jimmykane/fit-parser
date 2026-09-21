import { createHash } from 'node:crypto'
import process from 'node:process'
import { FIT } from '../src/fit.js'
import {
  PROFILE_MESSAGES,
  PROFILE_TYPES,
} from '../src/profile.js'

const expectedCounts = {
  messages: 126,
  fields: 1444,
  types: 200,
  values: 4405,
  products: 479,
} as const
const expectedFingerprints = {
  messages: '9c64f94fcf30d4c38249ece5159953a9ca2e48997de635b325ef6f0d0cc96ac6',
  types: 'cf1a7075edbd3c5fe849e2ef2f6370512d2da6671883a68cabbd265e061ac67d',
} as const
const errors: string[] = []

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

if (FIT.messages !== PROFILE_MESSAGES) {
  errors.push('Runtime messages do not use the maintained profile directly')
}
if (FIT.types !== PROFILE_TYPES) {
  errors.push('Runtime types do not use the maintained profile directly')
}

let fieldCount = 0
Object.entries(PROFILE_MESSAGES).forEach(([messageId, message]) => {
  if (!message.name) {
    errors.push(`Message ${messageId} has no name`)
  }
  const fieldNames = new Map<string, string>()
  Object.entries(message).forEach(([fieldId, field]) => {
    if (fieldId === 'name') {
      return
    }
    fieldCount++
    if (!field.field || !field.type) {
      errors.push(`Message ${messageId}, field ${fieldId} has incomplete identifiers`)
    }
    if (field.scale !== null && typeof field.scale !== 'number') {
      errors.push(`Message ${messageId}, field ${fieldId} has an invalid scale`)
    }
    if (typeof field.offset !== 'number' || typeof field.units !== 'string') {
      errors.push(`Message ${messageId}, field ${fieldId} has invalid numeric metadata`)
    }
    const priorFieldId = fieldNames.get(field.field)
    if (priorFieldId !== undefined) {
      errors.push(
        `Message ${messageId} duplicates output field ${field.field} at ${priorFieldId}/${fieldId}`,
      )
    }
    fieldNames.set(field.field, fieldId)
  })
})

let valueCount = 0
Object.entries(PROFILE_TYPES).forEach(([typeName, values]) => {
  Object.entries(values).forEach(([valueId, value]) => {
    valueCount++
    if (typeof value !== 'string' && typeof value !== 'number') {
      errors.push(`Type ${typeName}, value ${valueId} has an invalid mapping`)
    }
  })
})

const counts = {
  messages: Object.keys(PROFILE_MESSAGES).length,
  fields: fieldCount,
  types: Object.keys(PROFILE_TYPES).length,
  values: valueCount,
  products: Object.keys(PROFILE_TYPES.garmin_product ?? {}).length,
}
Object.entries(expectedCounts).forEach(([name, expected]) => {
  const actual = counts[name as keyof typeof counts]
  if (actual !== expected) {
    errors.push(`Profile ${name} count drift: expected ${expected}, received ${actual}`)
  }
})

const fingerprints = {
  messages: fingerprint(PROFILE_MESSAGES),
  types: fingerprint(PROFILE_TYPES),
}
Object.entries(expectedFingerprints).forEach(([name, expected]) => {
  const actual = fingerprints[name as keyof typeof fingerprints]
  if (actual !== expected) {
    errors.push(`Profile ${name} fingerprint drift: expected ${expected}, received ${actual}`)
  }
})

process.stdout.write(`${JSON.stringify({
  ...counts,
  fingerprints,
  errors,
}, null, 2)}\n`)
if (errors.length > 0) {
  process.exitCode = 1
}
