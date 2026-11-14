import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

// A fixed-size string field: the text, its null terminator, then whatever
// bytes the device left in the rest of the field.
function paddedString(text: string, size: number, leftover: string) {
  const bytes = new Uint8Array(size)
  const encoded = FitEncoder.string(text)
  bytes.set(encoded)
  bytes.set(
    new TextEncoder().encode(leftover).slice(0, size - encoded.length),
    encoded.length,
  )
  return bytes
}

async function parseWorkoutStep(notes: Uint8Array) {
  const encoder = new FitEncoder()
  encoder.writeMessage(0, [
    { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 },
  ])
  encoder.writeMessage(27, [
    { number: 254, size: 2, baseType: FitBaseType.Uint16, value: 0 },
    {
      number: 8,
      size: notes.length,
      baseType: FitBaseType.String,
      value: notes,
    },
  ])
  const file = encoder.close()
  return new FitParser({ force: false }).parseAsync(file.buffer)
}

describe('string fields', () => {
  it('ends at the null terminator, ignoring bytes left after it', async () => {
    // Garmin watches leave bytes from other strings after the terminator,
    // e.g. in workout step notes
    const parsed = await parseWorkoutStep(
      paddedString('Easy', 32, 'Threshold\u0001Tempo'),
    )

    expect(parsed.workout_step?.notes).toBe('Easy')
  })

  it('reads a string that fills its field without a terminator', async () => {
    const parsed = await parseWorkoutStep(new TextEncoder().encode('Stride'))

    expect(parsed.workout_step?.notes).toBe('Stride')
  })

  it('reads an empty string', async () => {
    const parsed = await parseWorkoutStep(paddedString('', 16, 'Leftover'))

    expect(parsed.workout_step?.notes).toBe('')
  })

  it('preserves multibyte UTF-8 text before the terminator', async () => {
    const parsed = await parseWorkoutStep(paddedString('Éasy 🏃', 32, 'Leftover'))

    expect(parsed.workout_step?.notes).toBe('Éasy 🏃')
  })

  it.each(['list', 'cascade', 'both'] as const)(
    'preserves field boundaries and raw bytes in %s mode',
    async (mode) => {
      const notes = paddedString('Éasy 🏃', 32, 'Trailing bytes')
      const followingNotes = FitEncoder.string('Following step')
      const encoder = new FitEncoder()
        .writeMessage(27, [
          { number: 8, size: notes.length, baseType: FitBaseType.String, value: notes },
          { number: 254, size: 2, baseType: FitBaseType.Uint16, value: 17 },
        ])
        .writeMessage(27, [
          {
            number: 8,
            size: followingNotes.length,
            baseType: FitBaseType.String,
            value: followingNotes,
          },
          { number: 254, size: 2, baseType: FitBaseType.Uint16, value: 18 },
        ])
      const file = encoder.close()
      const original = file.slice()
      const options = { force: false, mode, includeRawMessages: true } as const
      const parsed = await new FitParser(options).parseAsync(file.buffer)
      const steps = parsed.messages?.workout_step

      expect(steps).toHaveLength(2)
      expect(steps?.[0]).toMatchObject({ notes: 'Éasy 🏃', message_index: { value: 17 } })
      expect(steps?.[1]).toMatchObject({ notes: 'Following step', message_index: { value: 18 } })
      expect(parsed.workout_step).toBe(steps?.[1])
      expect(parsed.raw_messages?.[0]?.fields).toEqual([
        { field_definition_number: 8, base_type: FitBaseType.String, raw_value: Array.from(notes) },
        { field_definition_number: 254, base_type: FitBaseType.Uint16, raw_value: [17, 0] },
      ])

      const rawOnly = await new FitParser({ ...options, rawMessagesOnly: true }).parseAsync(file.buffer)
      expect(rawOnly.raw_messages).toEqual(parsed.raw_messages)
      expect(rawOnly).not.toHaveProperty('messages')
      expect(file).toEqual(original)
    },
  )
})
