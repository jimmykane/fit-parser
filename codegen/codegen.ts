import fs from 'node:fs'
import process from 'node:process'
import { ESLint } from 'eslint'
import { main } from '../src/type_generator.js'

async function generateTypes(): Promise<void> {
  const outputPath = `${import.meta.dirname}/../src/fit_types.ts`
  const eslint = new ESLint({ fix: true })
  const generated = main()
  const [result] = await eslint.lintText(generated, { filePath: outputPath })
  const output = result.output ?? generated

  if (process.argv.includes('--check')) {
    const current = fs.readFileSync(outputPath, 'utf8')

    if (current !== output) {
      console.error('src/fit_types.ts is out of date; run npm run codegen and commit the result.')
      process.exitCode = 1
    }
  }
  else {
    fs.writeFileSync(outputPath, output)
  }
}

generateTypes().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
