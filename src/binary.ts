import type { FitParserOptions } from './fit-parser.js'
import type {
  FieldDefinition,
} from './fit.js'
import type { FitOptions, LengthUnits, MesgNum, PressureUnits, SpeedUnits, TemperatureUnits, Unit } from './fit_types.js'
import { Buffer } from 'buffer'
import { FIT } from './fit.js'
import { getFitMessage, getFitMessageBaseType } from './messages.js'

const CompressedLocalMsgNumMask = 0x60 as const
const CompressedHeaderMask = 0x80 as const
const GarminTimeOffset = 631065600000 as const
let monitoring_timestamp = 0

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

const InvalidFieldData = Symbol('invalid FIT field data')
const formatTypeMetadata = new Map<string | number, FormatTypeMetadata>()

function requiresBoundedEndianDataView(type: string | number, size: number): boolean {
  switch (type) {
    case 'sint16':
    case 'uint16':
    case 'uint16z':
      return size < 2
    case 'sint32':
    case 'uint32':
    case 'uint32z':
    case 'float32':
      return size < 4
    case 'float64':
      return size < 8
    case 'uint16_array':
    case 'exercise_category_array':
      return size % 2 !== 0
    case 'uint32_array':
      return size % 4 !== 0
    default:
      return false
  }
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
  options: FitParserOptions,
): any {
  if (fDef.type === 'uint8_array') {
    const array8: number[] = []
    for (let i = 0; i < fDef.size; i++) {
      array8.push(blob[startIndex + i])
    }
    return array8
  }

  if (fDef.endianAbility) {
    const requiresBoundedDataView = fDef.requiresBoundedDataView
      ?? (fDef.requiresBoundedDataView = requiresBoundedEndianDataView(fDef.type, fDef.size))
    let fieldDataView = dataView
    let fieldStartIndex = startIndex
    if (
      startIndex < 0
      || startIndex + fDef.size > blob.length
      || startIndex + fDef.size > dataView.byteLength
    ) {
      const paddedField = new Uint8Array(fDef.size)
      for (let index = 0; index < fDef.size; index++) {
        paddedField[index] = blob[startIndex + index]
      }
      fieldDataView = new DataView(paddedField.buffer)
      fieldStartIndex = 0
    }
    else if (requiresBoundedDataView) {
      fieldDataView = new DataView(dataView.buffer, dataView.byteOffset + startIndex, fDef.size)
      fieldStartIndex = 0
    }

    try {
      switch (fDef.type) {
        case 'sint16':
          return fieldDataView.getInt16(fieldStartIndex, fDef.littleEndian)
        case 'uint16':
        case 'uint16z':
          return fieldDataView.getUint16(fieldStartIndex, fDef.littleEndian)
        case 'sint32':
          return fieldDataView.getInt32(fieldStartIndex, fDef.littleEndian)
        case 'uint32':
        case 'uint32z':
          return fieldDataView.getUint32(fieldStartIndex, fDef.littleEndian)
        case 'float32':
          return fieldDataView.getFloat32(fieldStartIndex, fDef.littleEndian)
        case 'float64':
          return fieldDataView.getFloat64(fieldStartIndex, fDef.littleEndian)
        case 'uint32_array': {
          const array32: number[] = []
          for (let i = 0; i < fDef.size; i += 4) {
            array32.push(fieldDataView.getUint32(fieldStartIndex + i, fDef.littleEndian))
          }
          return array32
        }
        case 'uint16_array':
        case 'exercise_category_array': {
          const array16: number[] = []
          for (let i = 0; i < fDef.size; i += 2) {
            array16.push(fieldDataView.getUint16(fieldStartIndex + i, fDef.littleEndian))
          }
          return array16
        }
      }
    }
    catch (e) {
      if (!options.force) {
        throw e
      }
    }

    const temp: number[] = []
    for (let i = 0; i < fDef.size; i++) {
      temp.push(blob[startIndex + i])
    }
    return addEndian(fDef.littleEndian, temp)
  }

  if (fDef.type === 'string') {
    const temp: number[] = []
    for (let i = 0; i < fDef.size; i++) {
      if (blob[startIndex + i]) {
        temp.push(blob[startIndex + i])
      }
    }
    return Buffer.from(temp).toString('utf-8')
  }

  if (fDef.type === 'byte_array') {
    const temp: number[] = []
    for (let i = 0; i < fDef.size; i++) {
      temp.push(blob[startIndex + i])
    }
    return temp
  }

  if (fDef.type === 'sint8') {
    const val = blob[startIndex]
    return val > 127 ? val - 256 : val
  }

  return blob[startIndex]
}

function formatByType(
  data: any,
  type: string | number,
  scale: number | null,
  offset: number,
): any {
  switch (type) {
    case 'date_time':
    case 'local_date_time':
      return new Date(data * 1000 + GarminTimeOffset)
    case 'sint32':
      return data * FIT.scConst
    case 'uint8':
    case 'sint16':
    case 'uint32':
    case 'uint16':
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
          dataItem[value] = !!((data & Number(key)) >> 7) // Not sure if we need the >> 7 and casting to boolean but from all the masked props of fields so far this seems to be the case
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
      return data === 0xFFFFFFFF
    case 'float64':
      // eslint-disable-next-line no-loss-of-precision
      return data === 0xFFFFFFFFFFFFFFFF
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
    case 'speed_1s':
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
    case 'avg_temperature':
    case 'max_temperature':
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

function applyGarminProductName(fields: any): void {
  if (fields.product_name !== undefined || fields.manufacturer !== 'garmin') {
    return
  }

  const product = fields.product
  if (typeof product !== 'number') {
    return
  }

  const productName = FIT.types.garmin_product[product]
  if (typeof productName === 'string') {
    // Keep the raw protocol ID and expose the SDK product name separately.
    fields.product_name = productName
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

  const baseType = description.fit_base_type_id
  const type = FIT.types.fit_base_type[baseType]
  if (typeof baseType !== 'number' || type === undefined) {
    developerFieldDef.resolvedFieldDef = undefined
    developerFieldDef.resolvedFrom = undefined
    if (options.force) {
      return undefined
    }
    throw new Error(
      `Unsupported base type for developer data index ${developerFieldDef.developerDataIndex}, field ${developerFieldDef.fieldDefinitionNumber}`,
    )
  }

  const resolvedFieldDef: FieldDefinition = {
    type,
    fDefNo: developerFieldDef.fieldDefinitionNumber,
    size: developerFieldDef.size,
    endianAbility: (baseType & 128) === 128,
    littleEndian,
    baseTypeNo: baseType,
    name: description.field_name ?? '',
    dataType: getFitMessageBaseType(baseType & 15),
    scale: description.scale ?? 1,
    offset: description.offset ?? 0,
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
): {
  messageType: MesgNum | ''
  nextIndex: number
  message?: any
} {
  const recordHeader = blob[startIndex]
  let localMessageType = recordHeader & 15

  if ((recordHeader & CompressedHeaderMask) === CompressedHeaderMask) {
    // compressed timestamp

    localMessageType = (recordHeader & CompressedLocalMsgNumMask) >> 5
  }
  else if ((recordHeader & 64) === 64) {
    // is definition message
    // startIndex + 1 is reserved

    const hasDeveloperData = (recordHeader & 32) === 32
    const lEnd = blob[startIndex + 2] === 0
    const numberOfFields = blob[startIndex + 5]
    const numberOfDeveloperDataFields = hasDeveloperData
      ? blob[startIndex + 5 + numberOfFields * 3 + 1]
      : 0

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

    for (let i = 0; i < numberOfFields; i++) {
      const fDefIndex = startIndex + 6 + i * 3
      const baseType = blob[fDefIndex + 2]
      const { field, type, scale, offset } = message.getAttributes(blob[fDefIndex])
      const fDef: FieldDefinition = {
        type,
        fDefNo: blob[fDefIndex],
        size: blob[fDefIndex + 1],
        endianAbility: (baseType & 128) === 128,
        littleEndian: lEnd,
        baseTypeNo: baseType,
        name: field,
        dataType: getFitMessageBaseType(baseType & 15),
        scale,
        offset,
        requiresBoundedDataView: requiresBoundedEndianDataView(type, blob[fDefIndex + 1]),
      }

      mTypeDef.fieldDefs.push(fDef)
    }

    for (let i = 0; i < numberOfDeveloperDataFields; i++) {
      const fDefIndex = startIndex + 6 + numberOfFields * 3 + 1 + i * 3
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

  const messageType = messageTypes[localMessageType] || messageTypes[0]

  // TODO: handle compressed header ((recordHeader & 128) == 128)

  // uncompressed header
  let messageSize = 0
  let readDataFromIndex = startIndex + 1
  const fields: any = {}
  const message = getFitMessage(messageType.globalMessageNumber)
  const developerFieldDefs = messageType.developerFieldDefs ?? []
  const totalFieldCount = messageType.fieldDefs.length + developerFieldDefs.length

  const rawData = messageType.rawData
    ?? (messageType.rawData = Array.from(
      { length: totalFieldCount },
      () => InvalidFieldData,
    ))
  let validFieldCount = 0
  for (let i = 0; i < messageType.fieldDefs.length; i++) {
    const fDef = messageType.fieldDefs[i]
    const data = readData(blob, dataView, fDef, readDataFromIndex, options)

    if (!isInvalidValue(data, fDef.type) && !isInvalidBaseTypeValue(data, fDef.baseTypeNo)) {
      rawData[i] = data
      validFieldCount++
    }
    else {
      rawData[i] = InvalidFieldData
    }

    readDataFromIndex += fDef.size
    messageSize += fDef.size
  }

  for (let i = 0; i < developerFieldDefs.length; i++) {
    const developerFieldDef = developerFieldDefs[i]
    const rawDataIndex = messageType.fieldDefs.length + i
    const fDef = resolveDeveloperFieldDefinition(
      developerFieldDef,
      messageType.littleEndian,
      developerFields,
      options,
    )

    if (fDef) {
      const data = readData(blob, dataView, fDef, readDataFromIndex, options)
      if (!isInvalidValue(data, fDef.type) && !isInvalidBaseTypeValue(data, fDef.baseTypeNo)) {
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
    const field = fDef.name
    if (field !== 'unknown' && field !== '' && field !== undefined) {
      fields[field] = data
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
    if (fDef.isDeveloperField) {
      const field = fDef.name
      const { type } = fDef
      const scale = fDef.scale ?? null
      const offset = fDef.offset ?? 0

      fields[fDef.name] = applyOptions(
        formatByType(data, type, scale, offset),
        field,
        options,
        fields,
      )
    }
    else {
      const { name: field, type } = fDef
      const scale = fDef.scale ?? null
      const offset = fDef.offset ?? 0

      if (field !== 'unknown' && field !== '' && field !== undefined) {
        fields[field] = applyOptions(
          formatByType(data, type, scale, offset),
          field,
          options,
          fields,
        )
      }
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
      fields[field] = applyOptions(
        formatByType(data, fDef.type, fDef.scale ?? null, fDef.offset ?? 0),
        field,
        options,
        fields,
      )
    }
  }

  applyGarminProductName(fields)

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
    // TODO weirdly uses global variables?
    // we need to keep the raw timestamp value so we can calculate subsequent timestamp16 fields
    if (fields.timestamp) {
      monitoring_timestamp = fields.timestamp
      fields.timestamp = new Date(fields.timestamp * 1000 + GarminTimeOffset)
    }
    if (fields.timestamp16 && !fields.timestamp) {
      monitoring_timestamp
        += (fields.timestamp16 - (monitoring_timestamp & 0xFFFF)) & 0xFFFF
      // fields.timestamp = monitoring_timestamp;
      fields.timestamp = new Date(
        monitoring_timestamp * 1000 + GarminTimeOffset,
      )
    }
  }

  return {
    messageType: message.name,
    nextIndex: startIndex + messageSize + 1,
    message: fields,
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
