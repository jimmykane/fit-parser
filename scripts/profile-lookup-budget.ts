import { relative, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const entryPoint = fileURLToPath(new URL('../src/profile-lookup.ts', import.meta.url))
const maximumBytes = 25_000
const expectedInputs = new Set([
  'src/profile-lookup-data.ts',
  'src/profile-lookup.ts',
])

const result = await build({
  absWorkingDir: repositoryRoot,
  bundle: true,
  entryPoints: [entryPoint],
  format: 'esm',
  metafile: true,
  minify: true,
  platform: 'neutral',
  treeShaking: true,
  write: false,
})

const bytes = result.outputFiles.reduce((total, file) => total + file.contents.byteLength, 0)
const inputs = Object.keys(result.metafile.inputs)
  .map((input) => {
    const relativeInput = input.startsWith(repositoryRoot) ? relative(repositoryRoot, input) : input
    return relativeInput.split(sep).join('/')
  })
  .sort()
const unexpectedInputs = inputs.filter(input => !expectedInputs.has(input))
const errors: string[] = []

if (bytes > maximumBytes) {
  errors.push(`Profile lookup bundle exceeds ${maximumBytes} bytes: received ${bytes}`)
}
if (unexpectedInputs.length > 0) {
  errors.push(`Profile lookup bundle contains unexpected inputs: ${unexpectedInputs.join(', ')}`)
}

process.stdout.write(`${JSON.stringify({
  bytes,
  maximumBytes,
  inputs,
  errors,
}, null, 2)}\n`)

if (errors.length > 0) {
  process.exitCode = 1
}
