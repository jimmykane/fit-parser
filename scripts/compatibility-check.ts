import type { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

interface FitParserConstructor {
  new (options?: { force?: boolean }): {
    parseAsync: (content: Buffer<ArrayBufferLike>) => Promise<unknown>
  }
}

interface CompatibilityReport {
  files: number
  strictMatches: number
  forceRecoveryMatches: number
  sharedFailures: number
  outputMismatches: number
  errorMismatches: number
  currentOnlyFailures: number
  previousOnlyFailures: number
}

async function collectFitFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      return collectFitFiles(entryPath)
    }
    return entry.isFile() && entry.name.toLowerCase().endsWith('.fit')
      ? [entryPath]
      : []
  }))
  return nested.flat()
}

async function parse(
  Parser: FitParserConstructor,
  content: Buffer<ArrayBufferLike>,
  force: boolean,
): Promise<PromiseSettledResult<unknown>> {
  try {
    return { status: 'fulfilled', value: await new Parser({ force }).parseAsync(content) }
  }
  catch (reason) {
    return { status: 'rejected', reason }
  }
}

function resolvePreviousEntry(input: string): string {
  return input.endsWith('.js') ? input : path.join(input, 'dist', 'fit-parser.js')
}

async function main(): Promise<void> {
  const previousInput = process.argv[2]
  const corpusRoot = process.argv[3]
  if (!previousInput || !corpusRoot) {
    process.stderr.write(
      'Usage: npm run compatibility:check -- /path/to/reference-package /path/to/fit-corpus\n',
    )
    process.exitCode = 2
    return
  }

  const previousModule = await import(pathToFileURL(resolvePreviousEntry(previousInput)).href)
  const PreviousFitParser = previousModule.default as FitParserConstructor
  const currentModule = await import(
    pathToFileURL(path.resolve('dist/fit-parser.js')).href,
  )
  const CurrentFitParser = currentModule.default as FitParserConstructor
  const fitFiles = await collectFitFiles(corpusRoot)
  const report: CompatibilityReport = {
    files: fitFiles.length,
    strictMatches: 0,
    forceRecoveryMatches: 0,
    sharedFailures: 0,
    outputMismatches: 0,
    errorMismatches: 0,
    currentOnlyFailures: 0,
    previousOnlyFailures: 0,
  }

  async function compareFile(fitFile: string): Promise<void> {
    const content = await readFile(fitFile)
    let current = await parse(CurrentFitParser, content, false)
    let previous = await parse(PreviousFitParser, content, false)

    if (current.status === 'rejected' && previous.status === 'rejected') {
      if (String(current.reason) !== String(previous.reason)) {
        report.errorMismatches++
      }
      current = await parse(CurrentFitParser, content, true)
      previous = await parse(PreviousFitParser, content, true)
      if (current.status === 'fulfilled' && previous.status === 'fulfilled') {
        if (isDeepStrictEqual(current.value, previous.value)) {
          report.forceRecoveryMatches++
        }
        else {
          report.outputMismatches++
        }
      }
      else if (current.status === 'rejected' && previous.status === 'rejected') {
        if (String(current.reason) === String(previous.reason)) {
          report.sharedFailures++
        }
        else {
          report.errorMismatches++
        }
      }
      else if (current.status === 'rejected') {
        report.currentOnlyFailures++
      }
      else {
        report.previousOnlyFailures++
      }
      return
    }

    if (current.status === 'rejected') {
      report.currentOnlyFailures++
    }
    else if (previous.status === 'rejected') {
      report.previousOnlyFailures++
    }
    else if (isDeepStrictEqual(current.value, previous.value)) {
      report.strictMatches++
    }
    else {
      report.outputMismatches++
    }
  }

  let nextFile = 0
  const workerCount = Math.min(8, fitFiles.length)
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextFile < fitFiles.length) {
      const fitFile = fitFiles[nextFile++]
      await compareFile(fitFile)
    }
  }))

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (
    report.outputMismatches > 0
    || report.errorMismatches > 0
    || report.currentOnlyFailures > 0
    || report.previousOnlyFailures > 0
  ) {
    process.exitCode = 1
  }
}

void main()
