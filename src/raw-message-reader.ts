const FIT_EPOCH_MS = 631065600000
const FIT_BASE_TYPE_WIDTHS = new Map<number, number>([
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 2],
  [4, 2],
  [5, 4],
  [6, 4],
  [7, 1],
  [8, 4],
  [9, 8],
  [10, 1],
  [11, 2],
  [12, 4],
  [13, 1],
  [14, 8],
  [15, 8],
  [16, 8],
])
const FIT_UNSIGNED_SCALAR_BASE_TYPES = new Set([0, 2, 4, 6, 10, 11, 12, 13])
const CRC_TABLE = [
  0,
  0xCC01,
  0xD801,
  0x1400,
  0xF001,
  0x3C00,
  0x2800,
  0xE401,
  0xA001,
  0x6C00,
  0x7800,
  0xB401,
  0x5000,
  0x9C01,
  0x8801,
  0x4400,
]

export type FitMessageReaderErrorCode
  = | 'invalid_input'
    | 'input_limit'
    | 'invalid_header'
    | 'invalid_crc'
    | 'invalid_structure'

export type FitMessageReaderIssueCode = 'invalid_timestamp'

export interface FitRawField {
  fieldNumber: number
  size: number
  baseType: number
  bytes: Uint8Array
}

export interface FitRawDeveloperField {
  fieldNumber: number
  size: number
  developerDataIndex: number
  bytes: Uint8Array
}

export interface FitRawMessage {
  globalMessageNumber: number
  messageIndex: number
  littleEndian: boolean
  /** Native FIT timestamp in seconds since the FIT epoch, when available. */
  timestamp?: number
  /** Reconstructed native timestamp when the record used a compressed header. */
  compressedTimestamp?: number
  fields: FitRawField[]
  developerFields: FitRawDeveloperField[]
}

export interface FitMessageReaderIssue {
  code: FitMessageReaderIssueCode
  globalMessageNumber: number
  messageIndex: number
}

export interface FitMessageReaderResult {
  protocolVersion: number
  profileVersion: number
  messages: FitRawMessage[]
  issues: FitMessageReaderIssue[]
}

export interface FitMessageReaderOptions {
  /** Retain only these global message numbers. Omit to retain every message. */
  messageNumbers?: readonly number[]
  /** Reject larger inputs before allocating retained message data. */
  maxInputBytes?: number
}

interface FieldDefinition {
  fieldNumber: number
  size: number
  baseType: number
}

interface DeveloperFieldDefinition {
  fieldNumber: number
  size: number
  developerDataIndex: number
}

interface MessageDefinition {
  globalMessageNumber: number
  littleEndian: boolean
  fields: FieldDefinition[]
  developerFields: DeveloperFieldDefinition[]
}

/** Error thrown when the strict raw-message reader rejects a FIT input. */
export class FitMessageReaderError extends Error {
  readonly code: FitMessageReaderErrorCode

  constructor(code: FitMessageReaderErrorCode) {
    super(code)
    this.name = 'FitMessageReaderError'
    this.code = code
  }
}

function calculateCRC(bytes: Uint8Array): number {
  let value = 0
  for (const byte of bytes) {
    value = (value >>> 4) ^ CRC_TABLE[value & 15] ^ CRC_TABLE[byte & 15]
    value = (value >>> 4) ^ CRC_TABLE[value & 15] ^ CRC_TABLE[byte >>> 4]
  }
  return value
}

/** Returns the five-bit FIT base-type identifier, or null for reserved/unknown values. */
export function getFitBaseTypeId(baseType: number): number | null {
  if (!Number.isInteger(baseType) || baseType < 0 || baseType > 0xFF) {
    return null
  }
  if (baseType & 0x60) {
    return null
  }
  const id = baseType & 0x1F
  return FIT_BASE_TYPE_WIDTHS.has(id) ? id : null
}

function isValidFieldDefinition(field: FieldDefinition): boolean {
  const baseTypeId = getFitBaseTypeId(field.baseType)
  const width = baseTypeId === null
    ? undefined
    : FIT_BASE_TYPE_WIDTHS.get(baseTypeId)
  return width !== undefined
    && field.size > 0
    && (baseTypeId === 7 || field.size % width === 0)
}

/** Reads an unsigned one-, two-, or four-byte raw FIT field. */
export function readFitUnsignedField(
  field: FitRawField | undefined,
  expectedBaseType: number,
  size: 1 | 2 | 4,
  littleEndian: boolean,
): number | undefined {
  if (!field) {
    return undefined
  }
  const expectedType = getFitBaseTypeId(expectedBaseType)
  const actualType = getFitBaseTypeId(field.baseType)
  const compatibleByte = size === 1
    && expectedType !== null
    && actualType !== null
    && [0, 2, 13].includes(expectedType)
    && [0, 2, 13].includes(actualType)
  if (
    expectedType === null
    || actualType === null
    || !FIT_UNSIGNED_SCALAR_BASE_TYPES.has(expectedType)
    || FIT_BASE_TYPE_WIDTHS.get(expectedType) !== size
    || field.size !== size
    || !(field.bytes instanceof Uint8Array)
    || field.bytes.byteLength !== field.size
    || (actualType !== expectedType && !compatibleByte)
  ) {
    throw new TypeError('FIT field does not match the expected unsigned type')
  }
  const view = new DataView(
    field.bytes.buffer,
    field.bytes.byteOffset,
    field.bytes.byteLength,
  )
  const value = size === 1
    ? view.getUint8(0)
    : size === 2
      ? view.getUint16(0, littleEndian)
      : view.getUint32(0, littleEndian)
  const invalid = [10, 11, 12].includes(expectedType)
    ? 0
    : size === 1
      ? 0xFF
      : size === 2
        ? 0xFFFF
        : 0xFFFFFFFF
  return value === invalid ? undefined : value
}

/** Reads UTF-8 bytes, removes trailing NUL padding, and preserves interior NUL separators. */
export function readFitStringField(field: FitRawField | undefined): string | undefined {
  if (!field) {
    return undefined
  }
  if (
    getFitBaseTypeId(field.baseType) !== 7
    || field.size <= 0
    || !(field.bytes instanceof Uint8Array)
    || field.bytes.byteLength !== field.size
  ) {
    throw new TypeError('FIT field is not a string')
  }
  const value = new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: true,
  }).decode(field.bytes).replace(/\0+$/, '')
  return value || undefined
}

function readTimestamp(
  field: FieldDefinition,
  bytes: Uint8Array,
  littleEndian: boolean,
): number | undefined {
  if (field.size !== 4 || (field.baseType & 0x1F) !== 6) {
    throw new FitMessageReaderError('invalid_structure')
  }
  const value = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0, littleEndian)
  return value === 0xFFFFFFFF ? undefined : value
}

function validateOptions(options: FitMessageReaderOptions): {
  selectedMessages?: Set<number>
  maxInputBytes: number
} {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new FitMessageReaderError('invalid_input')
  }
  const maxInputBytes = options.maxInputBytes ?? Number.POSITIVE_INFINITY
  if (
    maxInputBytes !== Number.POSITIVE_INFINITY
    && (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 0)
  ) {
    throw new FitMessageReaderError('invalid_input')
  }

  if (options.messageNumbers === undefined) {
    return { maxInputBytes }
  }
  if (!Array.isArray(options.messageNumbers)) {
    throw new FitMessageReaderError('invalid_input')
  }
  const selectedMessages = new Set<number>()
  for (const messageNumber of options.messageNumbers) {
    if (
      !Number.isSafeInteger(messageNumber)
      || messageNumber < 0
      || messageNumber > 0xFFFF
    ) {
      throw new FitMessageReaderError('invalid_input')
    }
    selectedMessages.add(messageNumber)
  }
  return { maxInputBytes, selectedMessages }
}

/**
 * Strictly validates a FIT file and retains raw fields for selected messages.
 * This entry point does not load the semantic FIT profile or format field values.
 */
export function readFitMessages(
  input: ArrayBuffer | Uint8Array,
  options: FitMessageReaderOptions = {},
): FitMessageReaderResult {
  const { maxInputBytes, selectedMessages } = validateOptions(options)
  if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) {
    throw new FitMessageReaderError('invalid_input')
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length > maxInputBytes) {
    throw new FitMessageReaderError('input_limit')
  }
  if (bytes.length < 14) {
    throw new FitMessageReaderError('invalid_header')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerSize = bytes[0]
  if (headerSize !== 12 && headerSize !== 14) {
    throw new FitMessageReaderError('invalid_header')
  }
  const dataEnd = headerSize + view.getUint32(4, true)
  const protocolMajorVersion = bytes[1] >>> 4
  if (
    (protocolMajorVersion !== 1 && protocolMajorVersion !== 2)
    || bytes[8] !== 0x2E
    || bytes[9] !== 0x46
    || bytes[10] !== 0x49
    || bytes[11] !== 0x54
    || dataEnd + 2 !== bytes.length
  ) {
    throw new FitMessageReaderError('invalid_header')
  }
  if (
    headerSize === 14
    && view.getUint16(12, true) !== 0
    && calculateCRC(bytes.subarray(0, 12)) !== view.getUint16(12, true)
  ) {
    throw new FitMessageReaderError('invalid_crc')
  }
  if (calculateCRC(bytes.subarray(0, dataEnd)) !== view.getUint16(dataEnd, true)) {
    throw new FitMessageReaderError('invalid_crc')
  }

  const definitions = new Map<number, MessageDefinition>()
  const messageIndexes = new Map<number, number>()
  const messages: FitRawMessage[] = []
  const issues: FitMessageReaderIssue[] = []
  let cursor = headerSize
  let lastTimestamp: number | undefined
  const take = (size: number): Uint8Array => {
    if (cursor + size > dataEnd) {
      throw new FitMessageReaderError('invalid_structure')
    }
    const value = bytes.subarray(cursor, cursor + size)
    cursor += size
    return value
  }

  // `take` owns bounds checking and advances the shared cursor for every record component.
  // eslint-disable-next-line no-unmodified-loop-condition
  while (cursor < dataEnd) {
    const recordHeader = take(1)[0]
    const compressed = (recordHeader & 0x80) !== 0
    const localMessageNumber = compressed
      ? (recordHeader >> 5) & 3
      : recordHeader & 15

    if (!compressed && (recordHeader & 0x10) !== 0) {
      throw new FitMessageReaderError('invalid_structure')
    }
    if (!compressed && (recordHeader & 0x40) !== 0) {
      const definitionHeader = take(5)
      if (definitionHeader[0] !== 0 || definitionHeader[1] > 1) {
        throw new FitMessageReaderError('invalid_structure')
      }
      const littleEndian = definitionHeader[1] === 0
      const globalMessageNumber = littleEndian
        ? definitionHeader[2] | (definitionHeader[3] << 8)
        : (definitionHeader[2] << 8) | definitionHeader[3]
      const selected = selectedMessages === undefined
        || selectedMessages.has(globalMessageNumber)
      const readFields = (count: number): FieldDefinition[] => {
        const fields: FieldDefinition[] = []
        const fieldNumbers = new Set<number>()
        for (let index = 0; index < count; index++) {
          const raw = take(3)
          const field: FieldDefinition = {
            fieldNumber: raw[0],
            size: raw[1],
            baseType: raw[2],
          }
          if (
            fieldNumbers.has(field.fieldNumber)
            || field.size === 0
            || (selected && !isValidFieldDefinition(field))
          ) {
            throw new FitMessageReaderError('invalid_structure')
          }
          fieldNumbers.add(field.fieldNumber)
          fields.push(field)
        }
        return fields
      }
      const fields = readFields(definitionHeader[4])
      const developerFields: DeveloperFieldDefinition[] = []
      if ((recordHeader & 0x20) !== 0) {
        const developerFieldKeys = new Set<string>()
        const count = take(1)[0]
        for (let index = 0; index < count; index++) {
          const raw = take(3)
          const key = `${raw[2]}:${raw[0]}`
          if (raw[1] === 0 || developerFieldKeys.has(key)) {
            throw new FitMessageReaderError('invalid_structure')
          }
          developerFieldKeys.add(key)
          developerFields.push({
            fieldNumber: raw[0],
            size: raw[1],
            developerDataIndex: raw[2],
          })
        }
      }
      definitions.set(localMessageNumber, {
        globalMessageNumber,
        littleEndian,
        fields,
        developerFields,
      })
      continue
    }
    if (!compressed && (recordHeader & 0x20) !== 0) {
      throw new FitMessageReaderError('invalid_structure')
    }

    const definition = definitions.get(localMessageNumber)
    if (!definition) {
      throw new FitMessageReaderError('invalid_structure')
    }
    const messageIndex = messageIndexes.get(definition.globalMessageNumber) ?? 0
    messageIndexes.set(definition.globalMessageNumber, messageIndex + 1)
    const selected = selectedMessages === undefined
      || selectedMessages.has(definition.globalMessageNumber)
    let timestamp: number | undefined
    let compressedTimestamp: number | undefined
    if (compressed) {
      const timestampField = definition.fields[0]
      if (
        !timestampField
        || timestampField.fieldNumber !== 253
        || timestampField.baseType !== 0x86
        || timestampField.size !== 4
        || lastTimestamp === undefined
      ) {
        throw new FitMessageReaderError('invalid_structure')
      }
      timestamp = Math.floor(lastTimestamp / 32) * 32 + (recordHeader & 31)
      if (timestamp < lastTimestamp) {
        timestamp += 32
      }
      if (timestamp >= 0xFFFFFFFF) {
        throw new FitMessageReaderError('invalid_structure')
      }
      lastTimestamp = timestamp
      compressedTimestamp = timestamp
    }

    const fields: FitRawField[] = []
    for (const field of definition.fields) {
      if (compressed && field.fieldNumber === 253) {
        continue
      }
      const raw = take(field.size)
      if (field.fieldNumber === 253) {
        try {
          timestamp = readTimestamp(field, raw, definition.littleEndian)
          lastTimestamp = timestamp
        }
        catch {
          lastTimestamp = undefined
          issues.push({
            code: 'invalid_timestamp',
            globalMessageNumber: definition.globalMessageNumber,
            messageIndex,
          })
        }
      }
      if (selected) {
        fields.push({ ...field, bytes: raw.slice() })
      }
    }

    const developerFields: FitRawDeveloperField[] = []
    for (const field of definition.developerFields) {
      const raw = take(field.size)
      if (selected) {
        developerFields.push({ ...field, bytes: raw.slice() })
      }
    }

    if (selected) {
      messages.push({
        globalMessageNumber: definition.globalMessageNumber,
        messageIndex,
        littleEndian: definition.littleEndian,
        ...(timestamp === undefined ? {} : { timestamp }),
        ...(compressedTimestamp === undefined ? {} : { compressedTimestamp }),
        fields,
        developerFields,
      })
    }
  }

  return {
    protocolVersion: bytes[1],
    profileVersion: view.getUint16(2, true),
    messages,
    issues,
  }
}

/** Converts a native FIT timestamp to a JavaScript epoch millisecond value. */
export function fitTimestampToUnixMilliseconds(timestamp: number): number {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 0xFFFFFFFF) {
    throw new RangeError('FIT timestamp must be an integer between 0 and 4294967294')
  }
  return FIT_EPOCH_MS + timestamp * 1000
}
