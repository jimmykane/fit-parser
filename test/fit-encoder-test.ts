import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

describe('FitEncoder', () => {
  it('writes an integrity-checked FIT Course that FitParser can parse', async () => {
    const encoder = new FitEncoder()
    const startTime = FitEncoder.toFitTimestamp(
      new Date('2020-01-01T00:00:00.000Z'),
    )
    const endTime = startTime + 1
    const latitude = Math.round((1 * 0x80000000) / 180)
    const longitude = Math.round((2 * 0x80000000) / 180)

    encoder.writeMessage(0, [
      { number: 0, size: 1, baseType: FitBaseType.Enum, value: 6 },
      { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 255 },
      { number: 2, size: 2, baseType: FitBaseType.Uint16, value: 1 },
      { number: 3, size: 4, baseType: FitBaseType.Uint32z, value: 1 },
      { number: 4, size: 4, baseType: FitBaseType.Uint32, value: startTime },
    ])
    encoder.writeMessage(
      31,
      [
        { number: 4, size: 1, baseType: FitBaseType.Enum, value: 2 },
        {
          number: 5,
          size: FitEncoder.string('Encoded Course').length,
          baseType: FitBaseType.String,
          value: FitEncoder.string('Encoded Course'),
        },
        { number: 7, size: 1, baseType: FitBaseType.Enum, value: 6 },
      ],
      1,
    )
    encoder.writeMessage(
      20,
      [
        {
          number: 253,
          size: 4,
          baseType: FitBaseType.Uint32,
          value: startTime,
        },
        { number: 0, size: 4, baseType: FitBaseType.Sint32, value: latitude },
        { number: 1, size: 4, baseType: FitBaseType.Sint32, value: longitude },
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: 2550 },
        { number: 5, size: 4, baseType: FitBaseType.Uint32, value: 0 },
      ],
      2,
    )
    encoder.writeMessage(
      20,
      [
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: endTime },
        { number: 0, size: 4, baseType: FitBaseType.Sint32, value: latitude },
        { number: 1, size: 4, baseType: FitBaseType.Sint32, value: longitude },
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: 2550 },
        { number: 5, size: 4, baseType: FitBaseType.Uint32, value: 12345 },
      ],
      2,
    )

    const file = encoder.close()
    const expectedCRC = FitEncoder.calculateCRC(file.slice(0, -2))
    const actualCRC = file[file.length - 2] + (file[file.length - 1] << 8)
    const parsed = await new FitParser({
      force: false,
      mode: 'both',
    }).parseAsync(file.buffer)

    expect(Array.from(file.slice(8, 12))).toEqual([0x2E, 0x46, 0x49, 0x54])
    expect(actualCRC).toBe(expectedCRC)
    expect(parsed.course).toMatchObject({
      name: 'Encoded Course',
      sport: 'cycling',
      sub_sport: 'indoor_cycling',
    })
    expect(parsed.records).toMatchObject([
      {
        position_lat: expect.closeTo(1, 6),
        position_long: expect.closeTo(2, 6),
        altitude: 10,
        distance: 0,
      },
      { distance: 123.45 },
    ])
  })

  it('rejects invalid variable-length field values', () => {
    const encoder = new FitEncoder()

    expect(() =>
      encoder.writeMessage(31, [
        {
          number: 5,
          size: 2,
          baseType: FitBaseType.String,
          value: FitEncoder.string('too long'),
        },
      ]),
    ).toThrow('expected 2 bytes')
  })

  it('rejects timestamps outside FIT\'s unsigned 32-bit epoch range', () => {
    expect(() =>
      FitEncoder.toFitTimestamp(new Date('1988-12-30T23:59:59.000Z')),
    ).toThrow('FIT timestamp')
    expect(() =>
      FitEncoder.toFitTimestamp(new Date('2200-01-01T00:00:00.000Z')),
    ).toThrow('FIT timestamp')
  })

  it('rejects finite numbers that overflow FIT float32 fields', () => {
    const encoder = new FitEncoder()

    expect(() =>
      encoder.writeMessage(20, [
        { number: 6, size: 4, baseType: FitBaseType.Float32, value: 1e300 },
      ]),
    ).toThrow('finite float32')
  })

  it('validates definitions before writing and keeps the encoder usable after an error', async () => {
    const encoder = new FitEncoder()

    expect(() =>
      encoder.writeMessage(0, [
        { number: 300, size: 1, baseType: FitBaseType.Enum, value: 6 },
      ]),
    ).toThrow('FIT field number')

    encoder.writeMessage(0, [
      { number: 0, size: 1, baseType: FitBaseType.Enum, value: 6 },
    ])
    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.file_ids).toMatchObject([{ type: 'course' }])
  })

  it('writes signed and unsigned 64-bit values using bigint', () => {
    const encoder = new FitEncoder()
    const unsignedValue = BigInt('12345678901234567890')

    encoder.writeMessage(0, [
      {
        number: 10,
        size: 8,
        baseType: FitBaseType.Uint64,
        value: unsignedValue,
      },
      { number: 11, size: 8, baseType: FitBaseType.Sint64, value: BigInt(-1) },
    ])
    const file = encoder.close()
    const data = file.slice(14 + 6 + 2 * 3 + 1, -2)

    expect(Array.from(data.slice(0, 8))).toEqual([
      210,
      10,
      31,
      235,
      140,
      169,
      84,
      171,
    ])
    expect(Array.from(data.slice(8))).toEqual(
      Array.from({ length: 8 }, () => 0xFF),
    )
  })

  it('writes signed coordinates with two\'s-complement FIT values', async () => {
    const encoder = new FitEncoder()
    const latitude = Math.round((-1 * 0x80000000) / 180)

    encoder.writeMessage(20, [
      { number: 0, size: 4, baseType: FitBaseType.Sint32, value: latitude },
      { number: 1, size: 4, baseType: FitBaseType.Sint32, value: latitude },
    ])

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.records?.[0]).toMatchObject({
      position_lat: expect.closeTo(-1, 6),
      position_long: expect.closeTo(-1, 6),
    })
  })
})
