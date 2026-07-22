const FIT_HEADER_SIZE = 14
const FIT_EPOCH_MS = 631065600000
const UINT8_MAX = 0xFF
const UINT16_MAX = 0xFFFF
const UINT32_MAX = 0xFFFFFFFF
const BIGINT_ZERO = BigInt(0)
const BIGINT_EIGHT = BigInt(8)
const BIGINT_BYTE_MASK = BigInt(0xFF)
const UINT64_MAX = BigInt('18446744073709551615')
const UINT64_MODULUS = BigInt('18446744073709551616')
const SINT8_MIN = -0x80
const SINT8_MAX = 0x7F
const SINT16_MIN = -0x8000
const SINT16_MAX = 0x7FFF
const SINT32_MIN = -0x80000000
const SINT32_MAX = 0x7FFFFFFF
const SINT64_MIN = BigInt('-9223372036854775808')
const SINT64_MAX = BigInt('9223372036854775807')

/** FIT definition base-type bytes, including the endian flag where required. */
export enum FitBaseType {
  Enum = 0x00,
  Sint8 = 0x01,
  Uint8 = 0x02,
  String = 0x07,
  Uint8z = 0x0A,
  Byte = 0x0D,
  Sint16 = 0x83,
  Uint16 = 0x84,
  Sint32 = 0x85,
  Uint32 = 0x86,
  Float32 = 0x88,
  Float64 = 0x89,
  Uint16z = 0x8B,
  Uint32z = 0x8C,
  Sint64 = 0x8E,
  Uint64 = 0x8F,
  Uint64z = 0x90,
}

export interface FitEncoderField {
  number: number
  size: number
  baseType: FitBaseType | number
  value: number | bigint | Uint8Array
}

export interface FitEncoderOptions {
  protocolVersion?: number
  profileVersion?: number
}

/**
 * A generic FIT binary encoder. Callers supply profile-specific field
 * definitions and already-scaled field values. Numeric arrays, strings, and
 * variable-length field values are supplied as raw `Uint8Array` values.
 */
export class FitEncoder {
  private readonly data: number[] = []
  private readonly activeDefinitions = new Map<number, string>()
  private readonly protocolVersion: number
  private readonly profileVersion: number

  constructor(options: FitEncoderOptions = {}) {
    this.protocolVersion = FitEncoder.assertIntegerInRange(
      options.protocolVersion ?? 2,
      0,
      UINT8_MAX,
      'FIT protocol version',
    )
    this.profileVersion = FitEncoder.assertIntegerInRange(
      options.profileVersion ?? 21188,
      0,
      UINT16_MAX,
      'FIT profile version',
    )
  }

  writeMessage(
    globalMessageNumber: number,
    fields: FitEncoderField[],
    localMessageNumber = 0,
  ): this {
    this.validateMessage(globalMessageNumber, fields, localMessageNumber)

    const definitionSignature = JSON.stringify({
      globalMessageNumber,
      fields: fields.map(field => this.getFieldDefinition(field)),
    })
    if (
      this.activeDefinitions.get(localMessageNumber) !== definitionSignature
    ) {
      this.writeDefinition(localMessageNumber, globalMessageNumber, fields)
      this.activeDefinitions.set(localMessageNumber, definitionSignature)
    }

    this.writeUInt8(localMessageNumber)
    fields.forEach(field => this.writeFieldValue(field))
    return this
  }

  close(): Uint8Array {
    if (this.data.length > UINT32_MAX) {
      throw new RangeError('FIT data section cannot exceed 4294967295 bytes')
    }

    const header = [
      FIT_HEADER_SIZE,
      this.protocolVersion,
      this.profileVersion & UINT8_MAX,
      (this.profileVersion >>> 8) & UINT8_MAX,
      this.data.length & UINT8_MAX,
      (this.data.length >>> 8) & UINT8_MAX,
      (this.data.length >>> 16) & UINT8_MAX,
      (this.data.length >>> 24) & UINT8_MAX,
      0x2E,
      0x46,
      0x49,
      0x54,
    ]
    const headerCRC = FitEncoder.calculateCRC(header)
    const output = header.concat(
      [headerCRC & UINT8_MAX, (headerCRC >>> 8) & UINT8_MAX],
      this.data,
    )
    const fileCRC = FitEncoder.calculateCRC(output)
    output.push(fileCRC & UINT8_MAX, (fileCRC >>> 8) & UINT8_MAX)
    return new Uint8Array(output)
  }

  static string(value: string): Uint8Array {
    const bytes = new TextEncoder().encode(value)
    if (bytes.length > UINT8_MAX - 1) {
      throw new RangeError(
        'FIT string fields can contain at most 254 UTF-8 bytes plus the null terminator',
      )
    }
    const output = new Uint8Array(bytes.length + 1)
    output.set(bytes)
    return output
  }

  static toFitTimestamp(date: Date): number {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new TypeError('FIT timestamp requires a valid Date')
    }
    const timestamp = Math.floor((date.getTime() - FIT_EPOCH_MS) / 1000)
    return FitEncoder.assertIntegerInRange(
      timestamp,
      0,
      UINT32_MAX,
      'FIT timestamp',
    )
  }

  static calculateCRC(bytes: ArrayLike<number>): number {
    let crc = 0
    for (let index = 0; index < bytes.length; index++) {
      let value = crc ^ bytes[index]
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? (value >>> 1) ^ 0xA001 : value >>> 1
      }
      crc = value
    }
    return crc
  }

  private validateMessage(
    globalMessageNumber: number,
    fields: FitEncoderField[],
    localMessageNumber: number,
  ): void {
    FitEncoder.assertIntegerInRange(
      globalMessageNumber,
      0,
      UINT16_MAX,
      'FIT global message number',
    )
    FitEncoder.assertIntegerInRange(
      localMessageNumber,
      0,
      0x0F,
      'FIT local message number',
    )
    if (!Array.isArray(fields) || fields.length > UINT8_MAX) {
      throw new RangeError(
        'FIT message definitions support between 0 and 255 fields',
      )
    }
    fields.forEach(field => this.validateField(field))
  }

  private validateField(field: FitEncoderField): void {
    if (!field || typeof field !== 'object') {
      throw new TypeError('FIT field definitions must be objects')
    }
    FitEncoder.assertIntegerInRange(
      field.number,
      0,
      UINT8_MAX,
      'FIT field number',
    )
    FitEncoder.assertIntegerInRange(field.size, 1, UINT8_MAX, 'FIT field size')
    FitEncoder.assertIntegerInRange(
      field.baseType,
      0,
      UINT8_MAX,
      'FIT base type',
    )
    if (!this.isSupportedBaseType(field.baseType)) {
      throw new RangeError(`Unsupported FIT base type ${field.baseType}`)
    }

    if (field.value instanceof Uint8Array) {
      if (field.value.length !== field.size) {
        throw new RangeError(
          `FIT field ${field.number} expected ${field.size} bytes, received ${field.value.length}`,
        )
      }
      const baseTypeSize = this.getBaseTypeSize(field.baseType)
      if (baseTypeSize && field.size % baseTypeSize !== 0) {
        throw new RangeError(
          `FIT field ${field.number} size must be a multiple of ${baseTypeSize}`,
        )
      }
      return
    }

    const baseTypeSize = this.getBaseTypeSize(field.baseType)
    if (baseTypeSize === undefined || field.size !== baseTypeSize) {
      throw new RangeError(
        `FIT field ${field.number} has an invalid size for base type ${field.baseType}`,
      )
    }

    switch (field.baseType) {
      case FitBaseType.Sint64:
        this.assertBigIntInRange(
          field.value,
          SINT64_MIN,
          SINT64_MAX,
          field.number,
        )
        return
      case FitBaseType.Uint64:
      case FitBaseType.Uint64z:
        this.assertBigIntInRange(
          field.value,
          BIGINT_ZERO,
          UINT64_MAX,
          field.number,
        )
        return
      case FitBaseType.Sint8:
        this.assertNumberInRange(
          field.value,
          SINT8_MIN,
          SINT8_MAX,
          field.number,
        )
        return
      case FitBaseType.Sint16:
        this.assertNumberInRange(
          field.value,
          SINT16_MIN,
          SINT16_MAX,
          field.number,
        )
        return
      case FitBaseType.Sint32:
        this.assertNumberInRange(
          field.value,
          SINT32_MIN,
          SINT32_MAX,
          field.number,
        )
        return
      case FitBaseType.Float32:
        if (typeof field.value !== 'number' || !Number.isFinite(field.value)) {
          throw new RangeError(
            `FIT field ${field.number} requires a finite numeric value`,
          )
        }
        if (!Number.isFinite(Math.fround(field.value))) {
          throw new RangeError(
            `FIT field ${field.number} must be representable as a finite float32`,
          )
        }
        return
      case FitBaseType.Float64:
        if (typeof field.value !== 'number' || !Number.isFinite(field.value)) {
          throw new RangeError(
            `FIT field ${field.number} requires a finite numeric value`,
          )
        }
        return
      default:
        this.assertNumberInRange(
          field.value,
          0,
          this.getUnsignedMaximum(field.baseType),
          field.number,
        )
    }
  }

  private assertNumberInRange(
    value: number | bigint | Uint8Array,
    minimum: number,
    maximum: number,
    fieldNumber: number,
  ): void {
    if (
      typeof value !== 'number'
      || !Number.isInteger(value)
      || value < minimum
      || value > maximum
    ) {
      throw new RangeError(
        `FIT field ${fieldNumber} must be an integer between ${minimum} and ${maximum}`,
      )
    }
  }

  private assertBigIntInRange(
    value: number | bigint | Uint8Array,
    minimum: bigint,
    maximum: bigint,
    fieldNumber: number,
  ): void {
    if (typeof value !== 'bigint' || value < minimum || value > maximum) {
      throw new RangeError(
        `FIT field ${fieldNumber} must be a bigint between ${minimum} and ${maximum}`,
      )
    }
  }

  private getUnsignedMaximum(baseType: FitBaseType | number): number {
    switch (baseType) {
      case FitBaseType.Enum:
      case FitBaseType.Uint8:
      case FitBaseType.Uint8z:
      case FitBaseType.Byte:
        return UINT8_MAX
      case FitBaseType.Uint16:
      case FitBaseType.Uint16z:
        return UINT16_MAX
      case FitBaseType.Uint32:
      case FitBaseType.Uint32z:
        return UINT32_MAX
      default:
        throw new RangeError(`Unsupported FIT base type ${baseType}`)
    }
  }

  private getFieldDefinition(
    field: FitEncoderField,
  ): Pick<FitEncoderField, 'number' | 'size' | 'baseType'> {
    return { number: field.number, size: field.size, baseType: field.baseType }
  }

  private writeDefinition(
    localMessageNumber: number,
    globalMessageNumber: number,
    fields: FitEncoderField[],
  ): void {
    this.writeUInt8(0x40 | localMessageNumber)
    this.writeUInt8(0)
    this.writeUInt8(0)
    this.writeUInt16(globalMessageNumber)
    this.writeUInt8(fields.length)
    fields.forEach((field) => {
      this.writeUInt8(field.number)
      this.writeUInt8(field.size)
      this.writeUInt8(field.baseType)
    })
  }

  private writeFieldValue(field: FitEncoderField): void {
    if (field.value instanceof Uint8Array) {
      field.value.forEach(value => this.writeUInt8(value))
      return
    }

    switch (field.baseType) {
      case FitBaseType.Enum:
      case FitBaseType.Uint8:
      case FitBaseType.Uint8z:
      case FitBaseType.Byte:
        this.writeUInt8(field.value as number)
        return
      case FitBaseType.Sint8:
        this.writeInt8(field.value as number)
        return
      case FitBaseType.Uint16:
      case FitBaseType.Uint16z:
        this.writeUInt16(field.value as number)
        return
      case FitBaseType.Sint16:
        this.writeInt16(field.value as number)
        return
      case FitBaseType.Uint32:
      case FitBaseType.Uint32z:
        this.writeUInt32(field.value as number)
        return
      case FitBaseType.Sint32:
        this.writeInt32(field.value as number)
        return
      case FitBaseType.Float32:
        this.writeFloat32(field.value as number)
        return
      case FitBaseType.Float64:
        this.writeFloat64(field.value as number)
        return
      case FitBaseType.Sint64:
        this.writeInt64(field.value as bigint)
        return
      case FitBaseType.Uint64:
      case FitBaseType.Uint64z:
        this.writeUInt64(field.value as bigint)
        return
      default:
        throw new Error(`Unsupported FIT base type ${field.baseType}`)
    }
  }

  private getBaseTypeSize(baseType: FitBaseType | number): number | undefined {
    switch (baseType) {
      case FitBaseType.Enum:
      case FitBaseType.Sint8:
      case FitBaseType.Uint8:
      case FitBaseType.Uint8z:
      case FitBaseType.Byte:
        return 1
      case FitBaseType.Sint16:
      case FitBaseType.Uint16:
      case FitBaseType.Uint16z:
        return 2
      case FitBaseType.Sint32:
      case FitBaseType.Uint32:
      case FitBaseType.Uint32z:
      case FitBaseType.Float32:
        return 4
      case FitBaseType.Float64:
      case FitBaseType.Sint64:
      case FitBaseType.Uint64:
      case FitBaseType.Uint64z:
        return 8
      default:
        return undefined
    }
  }

  private isSupportedBaseType(baseType: FitBaseType | number): boolean {
    return (
      baseType === FitBaseType.String
      || this.getBaseTypeSize(baseType) !== undefined
    )
  }

  private writeUInt8(value: number): void {
    this.data.push(value)
  }

  private writeUInt16(value: number): void {
    this.data.push(value & UINT8_MAX, (value >>> 8) & UINT8_MAX)
  }

  private writeInt8(value: number): void {
    this.writeUInt8(value < 0 ? 0x100 + value : value)
  }

  private writeInt16(value: number): void {
    this.writeUInt16(value < 0 ? 0x10000 + value : value)
  }

  private writeUInt32(value: number): void {
    this.data.push(
      value & UINT8_MAX,
      Math.floor(value / 0x100) & UINT8_MAX,
      Math.floor(value / 0x10000) & UINT8_MAX,
      Math.floor(value / 0x1000000) & UINT8_MAX,
    )
  }

  private writeInt32(value: number): void {
    this.writeUInt32(value < 0 ? 0x100000000 + value : value)
  }

  private writeUInt64(value: bigint): void {
    for (let byteIndex = BIGINT_ZERO; byteIndex < BIGINT_EIGHT; byteIndex++) {
      this.writeUInt8(
        Number((value >> (byteIndex * BIGINT_EIGHT)) & BIGINT_BYTE_MASK),
      )
    }
  }

  private writeInt64(value: bigint): void {
    this.writeUInt64(value < BIGINT_ZERO ? UINT64_MODULUS + value : value)
  }

  private writeFloat32(value: number): void {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setFloat32(0, value, true)
    bytes.forEach(byte => this.writeUInt8(byte))
  }

  private writeFloat64(value: number): void {
    const bytes = new Uint8Array(8)
    new DataView(bytes.buffer).setFloat64(0, value, true)
    bytes.forEach(byte => this.writeUInt8(byte))
  }

  private static assertIntegerInRange(
    value: unknown,
    minimum: number,
    maximum: number,
    label: string,
  ): number {
    if (
      typeof value !== 'number'
      || !Number.isInteger(value)
      || value < minimum
      || value > maximum
    ) {
      throw new RangeError(
        `${label} must be an integer between ${minimum} and ${maximum}`,
      )
    }
    return value
  }
}
