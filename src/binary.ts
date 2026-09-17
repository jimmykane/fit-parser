import type { FitParserOptions } from './fit-parser.js'
import type {
  FieldDefinition,
  MessageName,
} from './fit.js'
import type { FitOptions, LengthUnits, PressureUnits, SpeedUnits, TemperatureUnits, Unit } from './fit_types.js'
import { Buffer } from 'buffer'
import { FIT } from './fit.js'
import { getFitMessage, getFitMessageBaseType } from './messages.js'

const CompressedLocalMsgNumMask = 0x60 as const
const CompressedHeaderMask = 0x80 as const
const CompressedTimestampMask = 0x1F as const
const GarminTimeOffset = 631065600000 as const

interface FormatTypeMetadata {
  entries: [string, string | number][]
  hasMask: boolean
  typeMap: Record<string, string | number>
}

export interface MessageTypeDefinition {
  littleEndian: boolean
  globalMessageNumber: number
  numberOfFields: number
  fieldDefs: FieldDefinition[]
  developerFieldDefs?: DeveloperFieldDefinition[]
  rawData?: any[]
}

export interface DeveloperFieldDefinition {
  developerDataIndex: number
  fieldDefinitionNumber: number
  size: number
  resolvedFieldDef?: FieldDefinition
  resolvedFrom?: unknown
}

export interface DecoderState {
  lastTimestamp?: number
  monitoringTimestamp?: number
}

export interface RawDeveloperFieldValue {
  developerDataIndex: number
  fieldDefinitionNumber: number
  rawValue: number[]
}

export interface RawFieldValue {
  fieldDefinitionNumber: number
  baseType: number
  rawValue: number[]
}

const InvalidFieldData = Symbol('invalid FIT field data')
const formatTypeMetadata = new Map<string | number, FormatTypeMetadata>()
const uint8CompatibleTypes = new Set(['enum', 'uint8', 'byte'])
const fitBaseTypeWidths = new Map<number, number>([
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

function retainsRawMessages(options: FitParserOptions): boolean {
  return options.includeRawMessages === true
    || Array.isArray(options.includeRawMessages)
}

function isValidRawFieldDefinition(size: number, baseType: number): boolean {
  if (size <= 0 || (baseType & 0x60) !== 0) {
    return false
  }
  const typeId = baseType & 0x1F
  const width = fitBaseTypeWidths.get(typeId)
  return width !== undefined && (typeId === 7 || size % width === 0)
}

function baseTypeSize(type: string | number): number | undefined {
  switch (type) {
    case 'enum':
    case 'sint8':
    case 'uint8':
    case 'uint8z':
    case 'byte':
      return 1
    case 'sint16':
    case 'uint16':
    case 'uint16z':
      return 2
    case 'sint32':
    case 'uint32':
    case 'uint32z':
    case 'float32':
      return 4
    case 'float64':
      return 8
    default:
      return undefined
  }
}

function requiresBoundedEndianDataView(type: string | number, size: number): boolean {
  const elementSize = baseTypeSize(type)
  return elementSize !== undefined && size % elementSize !== 0
}

function areProfileBaseTypesCompatible(
  profileType: string | number | undefined,
  wireType: string | number,
): boolean {
  if (profileType === undefined || profileType === wireType) {
    return true
  }

  // FIT producers commonly interchange enum, uint8, and byte definitions.
  // They have the same width and value representation; keeping the semantic
  // profile type is safe while still rejecting width and sign conflicts.
  return uint8CompatibleTypes.has(String(profileType))
    && uint8CompatibleTypes.has(String(wireType))
}

export function addEndian(littleEndian: boolean, bytes: number[]): number {
  let result = 0
  if (!littleEndian)
    bytes.reverse()
  for (let i = 0; i < bytes.length; i++) {
    result += (bytes[i] << (i << 3)) >>> 0
  }

  return result
}

function readData(
  blob: Uint8Array,
  dataView: DataView,
  fDef: FieldDefinition,
  startIndex: number,
): any {
  const rawType
    = fDef.rawType ?? FIT.types.fit_base_type[fDef.baseTypeNo] ?? fDef.type
  if (rawType === 'string') {
    const temp: number[] = []
    for (let i = 0; i < fDef.size; i++) {
      if (blob[startIndex + i]) {
        temp.push(blob[startIndex + i])
      }
    }
    return Buffer.from(temp).toString('utf-8')
  }

  const elementSize = baseTypeSize(rawType)
  if (elementSize === undefined) {
    return InvalidFieldData
  }

  if (
    fDef.size < elementSize
    || fDef.size % elementSize !== 0
    || startIndex < 0
    || startIndex + fDef.size > blob.length
    || startIndex + fDef.size > dataView.byteLength
  ) {
    return InvalidFieldData
  }

  const isArray = fDef.array === true
    || String(fDef.type).endsWith('_array')
    || fDef.type === 'exercise_category_array'
    || (fDef.isDeveloperField === true && fDef.size > elementSize)
  const elementCount = isArray ? fDef.size / elementSize : 1
  const values: number[] = []

  for (let elementIndex = 0; elementIndex < elementCount; elementIndex++) {
    const offset = startIndex + elementIndex * elementSize
    switch (rawType) {
      case 'sint8': {
        const value = blob[offset]
        values.push(value > 127 ? value - 256 : value)
        break
      }
      case 'sint16':
        values.push(dataView.getInt16(offset, fDef.littleEndian))
        break
      case 'uint16':
      case 'uint16z':
        values.push(dataView.getUint16(offset, fDef.littleEndian))
        break
      case 'sint32':
        values.push(dataView.getInt32(offset, fDef.littleEndian))
        break
      case 'uint32':
      case 'uint32z':
        values.push(dataView.getUint32(offset, fDef.littleEndian))
        break
      case 'float32':
        values.push(dataView.getFloat32(offset, fDef.littleEndian))
        break
      case 'float64':
        values.push(dataView.getFloat64(offset, fDef.littleEndian))
        break
      default:
        values.push(blob[offset])
        break
    }
  }

  return isArray ? values : values[0]
}

function formatByType(
  data: any,
  type: string | number,
  scale: number | null,
  offset: number,
  units?: string,
): any {
  switch (type) {
    case 'date_time':
    case 'local_date_time':
      return new Date(data * 1000 + GarminTimeOffset)
    case 'sint32':
      return units === 'semicircles'
        ? data * FIT.scConst
        : scale ? data / scale + offset : data
    case 'sint8':
    case 'uint8':
    case 'uint8z':
    case 'sint16':
    case 'uint16':
    case 'uint16z':
    case 'uint32':
    case 'uint32z':
    case 'float32':
    case 'float64':
      return scale ? data / scale + offset : data
    case 'uint32_array':
    case 'uint16_array':
    case 'uint8_array':
      if (Array.isArray(data)) {
        const baseType = type.replace('_array', '')
        return data.map((dataItem: number) => {
          if (isInvalidValue(dataItem, baseType)) {
            return null
          }
          return scale ? dataItem / scale + offset : dataItem
        })
      }
      return scale ? data / scale + offset : data
    case 'exercise_category_array':
      if (Array.isArray(data)) {
        return data.map((dataItem: number) => {
          if (isInvalidValue(dataItem, 'uint16')) {
            return null
          }
          return formatByType(dataItem, 'exercise_category', scale, offset)
        })
      }
      return formatByType(data, 'exercise_category', scale, offset)
    default:
    {
      const typeMap = FIT.types[type] as Record<string, string | number> | undefined
      if (!typeMap) {
        return data
      }

      let metadata = formatTypeMetadata.get(type)
      if (!metadata) {
        const entries: [string, string | number][] = []
        let hasMask = false
        for (const key in typeMap) {
          if (key in typeMap) {
            const value = typeMap[key]
            entries.push([key, value])
            if (String(value) === 'mask') {
              hasMask = true
            }
          }
        }
        metadata = { entries, hasMask, typeMap }
        formatTypeMetadata.set(type, metadata)
      }

      if (!metadata.hasMask) {
        const mapped = metadata.typeMap[String(data)]
        return mapped === undefined ? data : mapped
      }

      const dataItem: any = {}
      for (const [key, value] of metadata.entries) {
        if (value === 'mask') {
          dataItem.value = data & Number(key)
        }
        else {
          dataItem[value] = (data & Number(key)) !== 0
        }
      }
      return dataItem
    }
  }
}

function isInvalidValue(data: any, type: string | number): boolean {
  switch (type) {
    case 'enum':
      return data === 0xFF
    case 'sint8':
      return data === 0x7F
    case 'uint8':
      return data === 0xFF
    case 'sint16':
      return data === 0x7FFF
    case 'uint16':
      return data === 0xFFFF
    case 'sint32':
      return data === 0x7FFFFFFF
    case 'uint32':
      return data === 0xFFFFFFFF
    case 'string':
      return data === 0x00
    case 'float32':
      return Number.isNaN(data)
    case 'float64':
      return Number.isNaN(data)
    case 'uint8z':
      return data === 0x00
    case 'uint16z':
      return data === 0x0000
    case 'uint32z':
      return data === 0x000000
    case 'byte':
      return data === 0xFF
    case 'sint64':
      // eslint-disable-next-line no-loss-of-precision
      return data === 0x7FFFFFFFFFFFFFFF
    case 'uint64':
      // eslint-disable-next-line no-loss-of-precision
      return data === 0xFFFFFFFFFFFFFFFF
    case 'uint64z':
      return data === 0x0000000000000000
    default:
      return false
  }
}

function isInvalidBaseTypeValue(data: any, baseTypeNo: number): boolean {
  if (Array.isArray(data)) {
    return false
  }

  const baseType = FIT.types.fit_base_type[baseTypeNo]
  return typeof baseType === 'string' ? isInvalidValue(data, baseType) : false
}

function formatFieldValue(
  data: any,
  fDef: FieldDefinition,
  options: FitParserOptions,
  fields: any,
): any {
  const field = fDef.name
  const scale = fDef.scale ?? null
  const offset = fDef.offset ?? 0

  if (
    Array.isArray(data)
    && !String(fDef.type).endsWith('_array')
    && fDef.type !== 'exercise_category_array'
  ) {
    const rawType = fDef.rawType ?? FIT.types.fit_base_type[fDef.baseTypeNo]
    return data.map((item) => {
      if (isInvalidValue(item, rawType)) {
        return null
      }
      return applyOptions(
        formatByType(item, fDef.type, scale, offset, fDef.units),
        field,
        options,
        fields,
      )
    })
  }

  return applyOptions(
    formatByType(data, fDef.type, scale, offset, fDef.units),
    field,
    options,
    fields,
  )
}

function isOutputFieldName(field: string | undefined): field is string {
  return field !== 'unknown' && field !== '' && field !== undefined
}

function convertTo<T extends string>(
  data: number,
  unitsList: keyof FitOptions,
  unitName: T,
): number {
  const options = FIT.options[unitsList] as Unit<T>
  const unit = options[unitName]
  return unit ? data * unit.multiplier + unit.offset : data
}

function applyOptions(data: any, field: string, options: any, fields: any): any {
  switch (field) {
    case 'device_type': {
      const isLocal = fields.source_type === 'local' || fields.source_type === 5
      const isBLE = fields.source_type === 'bluetooth_low_energy' || fields.source_type === 3 || fields.source_type === 'bluetooth' || fields.source_type === 2
      const isANT = fields.source_type === 'antplus' || fields.source_type === 1 || fields.source_type === 'ant' || fields.source_type === 0

      if (isLocal) {
        return FIT.types.local_device_type[data] || data
      }
      if (isBLE) {
        return FIT.types.ble_device_type[data] || data
      }
      if (isANT) {
        return FIT.types.antplus_device_type[data] || data
      }
      return data
    }
    case 'speed':
    case 'enhanced_speed':
    case 'vertical_speed':
    case 'avg_speed':
    case 'max_speed':
    case 'speed1s':
    case 'ball_speed':
    case 'enhanced_avg_speed':
    case 'enhanced_max_speed':
    case 'avg_pos_vertical_speed':
    case 'max_pos_vertical_speed':
    case 'avg_neg_vertical_speed':
    case 'max_neg_vertical_speed':
      return convertTo<SpeedUnits>(data, 'speedUnits', options.speedUnit)
    case 'distance':
    case 'total_distance':
    case 'enhanced_avg_altitude':
    case 'enhanced_min_altitude':
    case 'enhanced_max_altitude':
    case 'enhanced_altitude':
    case 'height':
    case 'odometer':
    case 'avg_stroke_distance':
    case 'min_altitude':
    case 'avg_altitude':
    case 'max_altitude':
    case 'total_ascent':
    case 'total_descent':
    case 'altitude':
    case 'cycle_length':
    case 'auto_wheelsize':
    case 'custom_wheelsize':
    case 'gps_accuracy':
      return convertTo<LengthUnits>(data, 'lengthUnits', options.lengthUnit)
    case 'temperature':
    case 'min_temperature':
    case 'temperature_min':
    case 'avg_temperature':
    case 'max_temperature':
    case 'temperature_max':
      return convertTo<TemperatureUnits>(data, 'temperatureUnits', options.temperatureUnit)
    case 'pressure':
    case 'start_pressure':
    case 'end_pressure':
      return convertTo<PressureUnits>(data, 'pressureUnits', options.pressureUnit)
    case 'ant_id': {
      const n1 = (data >>> 28) & 0xF
      const n2 = (data >>> 24) & 0xF
      const n3 = (data >>> 16) & 0xFF
      const n4 = data & 0xFFFF
      return `${n1.toString(16).toUpperCase()}-${n2.toString(16).toUpperCase()}-${n3.toString(16).toUpperCase().padStart(2, '0')}-${n4.toString(16).toUpperCase().padStart(4, '0')}`
    }
    default:
      return data
  }
}

function resolveDeveloperFieldDefinition(
  developerFieldDef: DeveloperFieldDefinition,
  littleEndian: boolean,
  developerFields: any[],
  options: FitParserOptions,
): FieldDefinition | undefined {
  const description
    = developerFields[developerFieldDef.developerDataIndex]?.[
      developerFieldDef.fieldDefinitionNumber
    ]

  if (!description) {
    developerFieldDef.resolvedFieldDef = undefined
    developerFieldDef.resolvedFrom = undefined
    return undefined
  }

  if (
    developerFieldDef.resolvedFrom === description
    && developerFieldDef.resolvedFieldDef
  ) {
    return developerFieldDef.resolvedFieldDef
  }

  const describedBaseType = description.fit_base_type_id
  const baseType = typeof describedBaseType === 'number'
    ? describedBaseType
    : Number(Object.entries(FIT.types.fit_base_type).find(
        ([, typeName]) => typeName === describedBaseType,
      )?.[0])
  const type = FIT.types.fit_base_type[baseType]
  if (!Number.isInteger(baseType) || type === undefined) {
    developerFieldDef.resolvedFieldDef = undefined
    developerFieldDef.resolvedFrom = undefined
    if (options.force || retainsRawMessages(options)) {
      return undefined
    }
    throw new Error(
      `Unsupported base type for developer data index ${developerFieldDef.developerDataIndex}, field ${developerFieldDef.fieldDefinitionNumber}`,
    )
  }

  const resolvedFieldDef: FieldDefinition = {
    type,
    rawType: type,
    fDefNo: developerFieldDef.fieldDefinitionNumber,
    size: developerFieldDef.size,
    array: type !== 'string'
      && developerFieldDef.size > (baseTypeSize(type) ?? developerFieldDef.size),
    endianAbility: (baseType & 128) === 128,
    littleEndian,
    baseTypeNo: baseType,
    name: description.field_name ?? '',
    dataType: getFitMessageBaseType(baseType & 15),
    scale: description.scale ?? 1,
    // FIT developer-field descriptions use `raw / scale - offset`. This
    // parser's formatter retains the legacy equivalent signed offset and adds
    // it after scaling.
    offset: -(description.offset ?? 0),
    units: description.units ?? '',
    requiresBoundedDataView: requiresBoundedEndianDataView(
      type,
      developerFieldDef.size,
    ),
    developerDataIndex: developerFieldDef.developerDataIndex,
    isDeveloperField: true,
  }

  developerFieldDef.resolvedFieldDef = resolvedFieldDef
  developerFieldDef.resolvedFrom = description
  return resolvedFieldDef
}

export function readRecord(
  blob: Uint8Array,
  messageTypes: MessageTypeDefinition[],
  developerFields: any[],
  startIndex: number,
  options: FitParserOptions,
  startDate: number | undefined,
  pausedTime: number,
  dataView: DataView = new DataView(blob.buffer, blob.byteOffset, blob.byteLength),
  decoderState: DecoderState = {},
  dataEnd: number = dataView.byteLength,
): {
  messageType: MessageName | 'definition' | ''
  nextIndex: number
  message?: any
  globalMessageNumber?: number
  littleEndian?: boolean
  compressedTimestamp?: number
  rawFields?: RawFieldValue[]
  rawDeveloperFields?: RawDeveloperFieldValue[]
} {
  if (startIndex < 0 || startIndex >= dataEnd) {
    throw new Error('Invalid FIT record bounds')
  }
  const recordHeader = blob[startIndex]
  let localMessageType = recordHeader & 15
  const isCompressedTimestamp
    = (recordHeader & CompressedHeaderMask) === CompressedHeaderMask

  if (isCompressedTimestamp) {
    // compressed timestamp

    localMessageType = (recordHeader & CompressedLocalMsgNumMask) >> 5
  }
  else if ((recordHeader & 64) === 64) {
    // is definition message
    // startIndex + 1 is reserved

    if (retainsRawMessages(options) && startIndex + 6 > dataEnd) {
      throw new Error('Invalid FIT definition bounds')
    }

    const hasDeveloperData = (recordHeader & 32) === 32
    const lEnd = blob[startIndex + 2] === 0
    const numberOfFields = blob[startIndex + 5]
    const nativeDefinitionsEnd = startIndex + 6 + numberOfFields * 3
    if (
      retainsRawMessages(options)
      && (
        (recordHeader & 16) !== 0
        || blob[startIndex + 1] !== 0
        || blob[startIndex + 2] > 1
        || nativeDefinitionsEnd > dataEnd
        || (hasDeveloperData && nativeDefinitionsEnd + 1 > dataEnd)
      )
    ) {
      throw new Error('Invalid FIT definition')
    }
    const numberOfDeveloperDataFields = hasDeveloperData
      ? blob[startIndex + 5 + numberOfFields * 3 + 1]
      : 0
    const definitionEnd = nativeDefinitionsEnd
      + (hasDeveloperData ? 1 + numberOfDeveloperDataFields * 3 : 0)
    if (retainsRawMessages(options) && definitionEnd > dataEnd) {
      throw new Error('Invalid FIT developer definition bounds')
    }

    const mTypeDef: MessageTypeDefinition = {
      littleEndian: lEnd,
      globalMessageNumber: addEndian(lEnd, [
        blob[startIndex + 3],
        blob[startIndex + 4],
      ]),
      numberOfFields: numberOfFields + numberOfDeveloperDataFields,
      fieldDefs: [],
      developerFieldDefs: [],
      rawData: [],
    }

    const message = getFitMessage(mTypeDef.globalMessageNumber)
    const nativeFieldNumbers = new Set<number>()

    for (let i = 0; i < numberOfFields; i++) {
      const fDefIndex = startIndex + 6 + i * 3
      const baseType = blob[fDefIndex + 2]
      const fieldNumber = blob[fDefIndex]
      const fieldSize = blob[fDefIndex + 1]
      if (
        retainsRawMessages(options)
        && (
          nativeFieldNumbers.has(fieldNumber)
          || !isValidRawFieldDefinition(fieldSize, baseType)
        )
      ) {
        throw new Error('Invalid FIT native field definition')
      }
      nativeFieldNumbers.add(fieldNumber)
      const wireType = FIT.types.fit_base_type[baseType]
      const {
        field,
        type,
        baseType: profileBaseType,
        array,
        scale,
        offset,
        units,
      } = message.getAttributes(blob[fDefIndex])
      const profileCompatible = areProfileBaseTypesCompatible(
        profileBaseType,
        wireType,
      )
      const fDef: FieldDefinition = {
        type: profileCompatible ? type : wireType,
        rawType: wireType,
        fDefNo: fieldNumber,
        size: fieldSize,
        array: profileCompatible
          ? array === true || String(type).endsWith('_array')
          : false,
        endianAbility: (baseType & 128) === 128,
        littleEndian: lEnd,
        baseTypeNo: baseType,
        name: profileCompatible ? field : '',
        dataType: getFitMessageBaseType(baseType & 15),
        scale: profileCompatible ? scale : null,
        offset: profileCompatible ? offset : 0,
        units: profileCompatible ? units : '',
        requiresBoundedDataView: requiresBoundedEndianDataView(
          wireType,
          fieldSize,
        ),
      }

      mTypeDef.fieldDefs.push(fDef)
    }

    const developerFieldNumbers = new Set<string>()
    for (let i = 0; i < numberOfDeveloperDataFields; i++) {
      const fDefIndex = startIndex + 6 + numberOfFields * 3 + 1 + i * 3
      const developerFieldKey = `${blob[fDefIndex + 2]}:${blob[fDefIndex]}`
      if (
        retainsRawMessages(options)
        && (blob[fDefIndex + 1] === 0 || developerFieldNumbers.has(developerFieldKey))
      ) {
        throw new Error('Invalid FIT developer field definition')
      }
      developerFieldNumbers.add(developerFieldKey)
      mTypeDef.developerFieldDefs?.push({
        fieldDefinitionNumber: blob[fDefIndex],
        size: blob[fDefIndex + 1],
        developerDataIndex: blob[fDefIndex + 2],
      })
    }

    mTypeDef.rawData = Array.from(
      { length: mTypeDef.numberOfFields },
      () => InvalidFieldData,
    )
    messageTypes[localMessageType] = mTypeDef

    const nextIndex = startIndex + 6 + mTypeDef.numberOfFields * 3
    const nextIndexWithDeveloperData = nextIndex + 1

    return {
      messageType: 'definition',
      nextIndex: hasDeveloperData ? nextIndexWithDeveloperData : nextIndex,
    }
  }

  if (!isCompressedTimestamp && (recordHeader & 0x30) !== 0) {
    throw new Error('Invalid FIT data record header')
  }

  const messageType = messageTypes[localMessageType]
  if (!messageType) {
    throw new Error('FIT data record has no local definition')
  }

  if (isCompressedTimestamp && retainsRawMessages(options)) {
    const timestampField = messageType.fieldDefs[0]
    if (
      !timestampField
      || timestampField.fDefNo !== 253
      || timestampField.size !== 4
      || (timestampField.baseTypeNo & 0x1F) !== 6
    ) {
      throw new Error('Invalid FIT compressed timestamp definition')
    }
  }

  let messageSize = 0
  let readDataFromIndex = startIndex + 1
  const fields: any = {}
  const message = getFitMessage(messageType.globalMessageNumber)
  const developerFieldDefs = messageType.developerFieldDefs ?? []
  const totalFieldCount = messageType.fieldDefs.length + developerFieldDefs.length
  const includeRawMessage = options.includeRawMessages === true
    || (Array.isArray(options.includeRawMessages)
      && options.includeRawMessages.includes(messageType.globalMessageNumber))
  const includeRawDeveloperFields = options.includeRawDeveloperFields === true
    || (Array.isArray(options.includeRawDeveloperFields)
      && options.includeRawDeveloperFields.includes(messageType.globalMessageNumber))
  const rawFields: RawFieldValue[] | undefined = includeRawMessage ? [] : undefined
  const rawDeveloperFields: RawDeveloperFieldValue[] | undefined
    = includeRawDeveloperFields || includeRawMessage ? [] : undefined
  if (retainsRawMessages(options)) {
    const nativeSize = messageType.fieldDefs.reduce((total, field, index) => (
      total + (isCompressedTimestamp && index === 0 && field.fDefNo === 253 ? 0 : field.size)
    ), 0)
    const developerSize = developerFieldDefs.reduce((total, field) => total + field.size, 0)
    if (startIndex + 1 + nativeSize + developerSize > dataEnd) {
      throw new Error('Invalid FIT data record bounds')
    }
  }

  const rawData = messageType.rawData
    ?? (messageType.rawData = Array.from(
      { length: totalFieldCount },
      () => InvalidFieldData,
    ))
  let validFieldCount = 0
  for (let i = 0; i < messageType.fieldDefs.length; i++) {
    const fDef = messageType.fieldDefs[i]
    if (isCompressedTimestamp && i === 0 && fDef.fDefNo === 253) {
      rawData[i] = InvalidFieldData
      continue
    }
    if (rawFields && readDataFromIndex + fDef.size <= dataEnd) {
      rawFields.push({
        fieldDefinitionNumber: fDef.fDefNo,
        baseType: fDef.baseTypeNo,
        rawValue: Array.from(blob.subarray(
          readDataFromIndex,
          readDataFromIndex + fDef.size,
        )),
      })
    }
    const data = readData(blob, dataView, fDef, readDataFromIndex)

    if (
      data !== InvalidFieldData
      && !isInvalidValue(data, fDef.type)
      && !isInvalidBaseTypeValue(data, fDef.baseTypeNo)
    ) {
      rawData[i] = data
      validFieldCount++
      if (!isCompressedTimestamp && fDef.fDefNo === 253) {
        decoderState.lastTimestamp = typeof data === 'number' ? data : undefined
      }
    }
    else {
      rawData[i] = InvalidFieldData
      if (!isCompressedTimestamp && fDef.fDefNo === 253) {
        decoderState.lastTimestamp = undefined
      }
    }

    readDataFromIndex += fDef.size
    messageSize += fDef.size
  }

  for (let i = 0; i < developerFieldDefs.length; i++) {
    const developerFieldDef = developerFieldDefs[i]
    const rawDataIndex = messageType.fieldDefs.length + i
    if (
      rawDeveloperFields
      && readDataFromIndex + developerFieldDef.size <= dataEnd
    ) {
      rawDeveloperFields.push({
        developerDataIndex: developerFieldDef.developerDataIndex,
        fieldDefinitionNumber: developerFieldDef.fieldDefinitionNumber,
        rawValue: Array.from(blob.subarray(
          readDataFromIndex,
          readDataFromIndex + developerFieldDef.size,
        )),
      })
    }
    const fDef = resolveDeveloperFieldDefinition(
      developerFieldDef,
      messageType.littleEndian,
      developerFields,
      options,
    )

    if (fDef) {
      const data = readData(blob, dataView, fDef, readDataFromIndex)
      if (
        data !== InvalidFieldData
        && !isInvalidValue(data, fDef.type)
        && !isInvalidBaseTypeValue(data, fDef.baseTypeNo)
      ) {
        rawData[rawDataIndex] = data
        validFieldCount++
      }
      else {
        rawData[rawDataIndex] = InvalidFieldData
      }
    }
    else {
      rawData[rawDataIndex] = InvalidFieldData
    }

    readDataFromIndex += developerFieldDef.size
    messageSize += developerFieldDef.size
  }

  for (let i = 0; i < messageType.fieldDefs.length; i++) {
    const data = rawData[i]
    if (data === InvalidFieldData) {
      continue
    }
    const fDef = messageType.fieldDefs[i]
    if (isOutputFieldName(fDef.name)) {
      fields[fDef.name] = data
    }
  }

  for (let i = 0; i < developerFieldDefs.length; i++) {
    const data = rawData[messageType.fieldDefs.length + i]
    const fDef = developerFieldDefs[i].resolvedFieldDef
    if (data === InvalidFieldData || !fDef) {
      continue
    }
    const field = fDef.name
    if (field !== 'unknown' && field !== '') {
      fields[field] = data
    }
  }

  for (let i = 0; i < messageType.fieldDefs.length; i++) {
    const data = rawData[i]
    if (data === InvalidFieldData) {
      continue
    }
    const fDef = messageType.fieldDefs[i]
    if (isOutputFieldName(fDef.name)) {
      fields[fDef.name] = formatFieldValue(data, fDef, options, fields)
    }
  }

  for (let i = 0; i < developerFieldDefs.length; i++) {
    const data = rawData[messageType.fieldDefs.length + i]
    const fDef = developerFieldDefs[i].resolvedFieldDef
    if (data === InvalidFieldData || !fDef) {
      continue
    }
    const field = fDef.name
    if (field !== 'unknown' && field !== '') {
      fields[field] = formatFieldValue(data, fDef, options, fields)
    }
  }

  let compressedTimestamp: number | undefined
  if (isCompressedTimestamp) {
    const previousTimestamp = decoderState.lastTimestamp
    if (previousTimestamp === undefined) {
      if (!options.force) {
        throw new Error('Compressed timestamp requires a previous timestamp')
      }
    }
    else {
      const timeOffset = recordHeader & CompressedTimestampMask
      const previousOffset = previousTimestamp & CompressedTimestampMask
      const rollover = timeOffset < previousOffset ? 0x20 : 0
      const timestamp
        = previousTimestamp - previousOffset + timeOffset + rollover
      if (timestamp >= 0xFFFFFFFF) {
        throw new Error('Compressed timestamp exceeds FIT uint32 range')
      }
      decoderState.lastTimestamp = timestamp
      compressedTimestamp = timestamp
      fields.timestamp = new Date(timestamp * 1000 + GarminTimeOffset)
      validFieldCount++
    }
  }

  if (validFieldCount > 0 && message.name === 'record' && options.elapsedRecordField) {
    fields.elapsed_time = ((fields.timestamp as any) - (startDate || 0)) / 1000
    fields.timer_time = fields.elapsed_time - pausedTime
  }

  if (message.name === 'field_description') {
    developerFields[fields.developer_data_index]
      = developerFields[fields.developer_data_index] || []
    developerFields[fields.developer_data_index][
      fields.field_definition_number
    ] = fields
  }

  if (message.name === 'monitoring') {
    const timestampFieldIndex = messageType.fieldDefs.findIndex(
      fieldDefinition => fieldDefinition.fDefNo === 253,
    )
    const rawTimestamp = timestampFieldIndex >= 0
      ? rawData[timestampFieldIndex]
      : InvalidFieldData

    if (rawTimestamp !== InvalidFieldData && typeof rawTimestamp === 'number') {
      decoderState.monitoringTimestamp = rawTimestamp
      fields.timestamp = new Date(rawTimestamp * 1000 + GarminTimeOffset)
    }
    else if (
      fields.timestamp16
      && decoderState.monitoringTimestamp !== undefined
      && !fields.timestamp
    ) {
      decoderState.monitoringTimestamp
        += (fields.timestamp16 - (decoderState.monitoringTimestamp & 0xFFFF)) & 0xFFFF
      fields.timestamp = new Date(
        decoderState.monitoringTimestamp * 1000 + GarminTimeOffset,
      )
    }
  }

  return {
    globalMessageNumber: messageType.globalMessageNumber,
    littleEndian: messageType.littleEndian,
    compressedTimestamp,
    messageType: message.name,
    nextIndex: startIndex + messageSize + 1,
    message: fields,
    rawFields,
    rawDeveloperFields,
  }
}

export function getArrayBuffer(buffer: ArrayBuffer | Buffer): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    return buffer
  }
  const ab = new ArrayBuffer(buffer.length)
  const view = new Uint8Array(ab)
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i]
  }
  return ab
}

export function calculateCRC(
  blob: Uint8Array,
  start: number,
  end: number,
): number {
  const crcTable = [
    0x0000,
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

  let crc = 0
  for (let i = start; i < end; i++) {
    const byteVal = blob[i]
    let tmp = crcTable[crc & 0xF]
    crc = (crc >> 4) & 0x0FFF
    crc = crc ^ tmp ^ crcTable[byteVal & 0xF]
    tmp = crcTable[crc & 0xF]
    crc = (crc >> 4) & 0x0FFF
    crc = crc ^ tmp ^ crcTable[(byteVal >> 4) & 0xF]
  }

  return crc
}
