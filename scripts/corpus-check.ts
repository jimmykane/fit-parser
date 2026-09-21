import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import FitParser from '../src/fit-parser.js'

interface CorpusReport {
  total: number
  strictPassed: number
  forceRecovered: number
  unrecoverable: number
  strictFailures: Record<string, number>
  forceFailures: Record<string, number>
  unmapped?: UnmappedSummary
}

interface UnmappedFieldAggregate {
  fieldDefinitionNumber: number
  developerDataIndex?: number
  occurrences: number
  files: number
  baseTypes: Record<string, number>
  sizes: Record<string, number>
}

interface UnmappedMessageAggregate {
  globalMessageNumber: number
  occurrences: number
  files: number
  fields: Map<number, UnmappedFieldAggregate>
  developerFields: Map<string, UnmappedFieldAggregate>
}

interface UnmappedSummary {
  messages: Array<{
    globalMessageNumber: number
    occurrences: number
    files: number
    fields: UnmappedFieldAggregate[]
    developerFields: UnmappedFieldAggregate[]
  }>
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function increment(errors: Record<string, number>, error: unknown): void {
  const message = errorText(error)
  errors[message] = (errors[message] ?? 0) + 1
}

async function collectFitFiles(directory: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
      }
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.fit')) {
        files.push(entryPath)
      }
    }
  }

  await walk(directory)
  return files.sort()
}

function incrementCount(counts: Record<string, number>, value: number): void {
  const key = String(value)
  counts[key] = (counts[key] ?? 0) + 1
}

function collectUnmapped(
  messages: NonNullable<Awaited<ReturnType<FitParser['parseAsync']>>['unmapped_messages']>,
  aggregates: Map<number, UnmappedMessageAggregate>,
): void {
  const fileMessages = new Set<UnmappedMessageAggregate>()
  const fileFields = new Set<UnmappedFieldAggregate>()

  messages.forEach((message) => {
    let messageAggregate = aggregates.get(message.global_message_number)
    if (!messageAggregate) {
      messageAggregate = {
        globalMessageNumber: message.global_message_number,
        occurrences: 0,
        files: 0,
        fields: new Map(),
        developerFields: new Map(),
      }
      aggregates.set(message.global_message_number, messageAggregate)
    }
    messageAggregate.occurrences++
    fileMessages.add(messageAggregate)

    message.fields.forEach((field) => {
      let aggregate = messageAggregate.fields.get(field.field_definition_number)
      if (!aggregate) {
        aggregate = {
          fieldDefinitionNumber: field.field_definition_number,
          occurrences: 0,
          files: 0,
          baseTypes: {},
          sizes: {},
        }
        messageAggregate.fields.set(field.field_definition_number, aggregate)
      }
      aggregate.occurrences++
      incrementCount(aggregate.baseTypes, field.base_type)
      incrementCount(aggregate.sizes, field.raw_value.length)
      fileFields.add(aggregate)
    })

    message.developer_fields.forEach((field) => {
      const key = `${field.developer_data_index}:${field.field_definition_number}`
      let aggregate = messageAggregate.developerFields.get(key)
      if (!aggregate) {
        aggregate = {
          developerDataIndex: field.developer_data_index,
          fieldDefinitionNumber: field.field_definition_number,
          occurrences: 0,
          files: 0,
          baseTypes: {},
          sizes: {},
        }
        messageAggregate.developerFields.set(key, aggregate)
      }
      aggregate.occurrences++
      incrementCount(aggregate.sizes, field.raw_value.length)
      fileFields.add(aggregate)
    })
  })

  fileMessages.forEach(message => message.files++)
  fileFields.forEach(field => field.files++)
}

function summarizeUnmapped(
  aggregates: Map<number, UnmappedMessageAggregate>,
): UnmappedSummary {
  return {
    messages: [...aggregates.values()]
      .sort((a, b) => a.globalMessageNumber - b.globalMessageNumber)
      .map(message => ({
        globalMessageNumber: message.globalMessageNumber,
        occurrences: message.occurrences,
        files: message.files,
        fields: [...message.fields.values()]
          .sort((a, b) => a.fieldDefinitionNumber - b.fieldDefinitionNumber),
        developerFields: [...message.developerFields.values()]
          .sort((a, b) => (
            (a.developerDataIndex ?? 0) - (b.developerDataIndex ?? 0)
            || a.fieldDefinitionNumber - b.fieldDefinitionNumber
          )),
      })),
  }
}

async function main(): Promise<void> {
  const directory = process.argv[2]
  const allowForceRecovery = process.argv.includes('--allow-force-recovery')
  const rawMessagesWithDecodedOutput = process.argv.includes(
    '--raw-messages-with-decoded-output',
  )
  const rawMessages = process.argv.includes('--raw-messages')
    || rawMessagesWithDecodedOutput
  const includeUnmappedSummary = process.argv.includes('--unmapped-summary')
  if (!directory) {
    process.stderr.write(
      'Usage: npm run corpus:check -- /path/to/fit-files [--allow-force-recovery] [--unmapped-summary] [--raw-messages | --raw-messages-with-decoded-output]\n',
    )
    process.exitCode = 1
    return
  }

  const files = await collectFitFiles(path.resolve(directory))
  const report: CorpusReport = {
    total: files.length,
    strictPassed: 0,
    forceRecovered: 0,
    unrecoverable: 0,
    strictFailures: {},
    forceFailures: {},
  }
  const unmappedAggregates = new Map<number, UnmappedMessageAggregate>()

  for (const file of files) {
    const content = await fs.readFile(file)
    let parsed: Awaited<ReturnType<FitParser['parseAsync']>> | undefined
    try {
      parsed = await new FitParser({
        force: false,
        includeUnmappedMessages: includeUnmappedSummary,
        ...(rawMessages
          ? {
              includeRawMessages: true,
              rawMessagesOnly: !rawMessagesWithDecodedOutput,
            }
          : {}),
      }).parseAsync(content)
      report.strictPassed++
    }
    catch (strictError) {
      increment(report.strictFailures, strictError)
      try {
        parsed = await new FitParser({
          force: true,
          includeUnmappedMessages: includeUnmappedSummary,
          ...(rawMessages
            ? {
                includeRawMessages: true,
                rawMessagesOnly: !rawMessagesWithDecodedOutput,
              }
            : {}),
        }).parseAsync(content)
        report.forceRecovered++
      }
      catch (forceError) {
        increment(report.forceFailures, forceError)
        report.unrecoverable++
      }
    }
    if (includeUnmappedSummary && parsed?.unmapped_messages) {
      collectUnmapped(parsed.unmapped_messages, unmappedAggregates)
    }
  }

  if (includeUnmappedSummary) {
    report.unmapped = summarizeUnmapped(unmappedAggregates)
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.total === 0) {
    process.stderr.write('No FIT files found in the corpus directory.\n')
  }
  if (
    report.total === 0
    || report.unrecoverable > 0
    || (!allowForceRecovery && report.forceRecovered > 0)
  ) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${errorText(error)}\n`)
  process.exitCode = 1
})
