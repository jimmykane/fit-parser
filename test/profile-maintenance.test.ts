import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  files?: string[]
  scripts?: Record<string, string>
}

describe('profile maintenance boundary', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as PackageJson
  const ciWorkflow = readFileSync(
    new URL('../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )
  const publishWorkflow = readFileSync(
    new URL('../.github/workflows/publish.yml', import.meta.url),
    'utf8',
  )

  it('does not depend on or generate from the Garmin SDK', () => {
    expect(packageJson.dependencies?.['@garmin/fitsdk']).toBeUndefined()
    expect(packageJson.devDependencies?.['@garmin/fitsdk']).toBeUndefined()
    expect(packageJson.scripts?.['codegen:profile']).toBeUndefined()
    expect(packageJson.scripts?.['profile:diff:local']).toBeUndefined()
    expect(packageJson.scripts?.build).toContain('npm run clean')
    expect(existsSync(new URL('../codegen/garmin-profile.ts', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../scripts/profile-diff-local.ts', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../src/garmin_profile.generated.ts', import.meta.url))).toBe(false)
  })

  it('publishes the profile provenance document', () => {
    expect(packageJson.files).toContain('PROFILE.md')
    expect(publishWorkflow).toMatch(/'PROFILE\.md'/)
  })

  it('uses the static profile check in CI', () => {
    expect(ciWorkflow).toContain('npm run profile:check')
    expect(ciWorkflow).not.toContain('npm run profile:audit')
  })
})
