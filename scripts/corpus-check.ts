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

async function main(): Promise<void> {
  const directory = process.argv[2]
  const allowForceRecovery = process.argv.includes('--allow-force-recovery')
  if (!directory) {
    process.stderr.write(
      'Usage: npm run corpus:check -- /path/to/fit-files [--allow-force-recovery]\n',
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

  for (const file of files) {
    const content = await fs.readFile(file)
    try {
      await new FitParser({ force: false }).parseAsync(content)
      report.strictPassed++
    }
    catch (strictError) {
      increment(report.strictFailures, strictError)
      try {
        await new FitParser({ force: true }).parseAsync(content)
        report.forceRecovered++
      }
      catch (forceError) {
        increment(report.forceFailures, forceError)
        report.unrecoverable++
      }
    }
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
