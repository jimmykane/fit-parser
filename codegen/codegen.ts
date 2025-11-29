import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { main } from '../src/type_generator.js'

const out = main()

fs.writeFileSync(`${import.meta.dirname}/../src/fit_types.ts`, out)

execSync('npx eslint --fix src/fit_types.ts', { stdio: 'inherit' })
