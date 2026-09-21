import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  exports?: Record<string, {
    types: string
    import: string
    require: string
  }>
  files?: string[]
  scripts?: Record<string, string>
  typesVersions?: Record<string, Record<string, string[]>>
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

  it('uses one static maintained profile', () => {
    expect(packageJson.scripts?.['codegen:profile']).toBeUndefined()
    expect(packageJson.scripts?.['profile:diff:local']).toBeUndefined()
    expect(packageJson.scripts?.build).toContain('npm run clean')
    expect(packageJson.exports?.['./profile']).toEqual({
      types: './dist/profile-lookup.d.ts',
      import: './dist/profile-lookup.js',
      require: './dist/cjs/profile-lookup.js',
    })
    expect(packageJson.exports?.['./encoder']).toEqual({
      types: './dist/fit-encoder.d.ts',
      import: './dist/fit-encoder.js',
      require: './dist/cjs/fit-encoder.js',
    })
    expect(packageJson.exports?.['./raw']).toEqual({
      types: './dist/raw-message-reader.d.ts',
      import: './dist/raw-message-reader.js',
      require: './dist/cjs/raw-message-reader.js',
    })
    expect(packageJson.typesVersions?.['*']?.encoder).toEqual(['dist/fit-encoder.d.ts'])
    expect(packageJson.typesVersions?.['*']?.profile).toEqual(['dist/profile-lookup.d.ts'])
    expect(packageJson.typesVersions?.['*']?.raw).toEqual(['dist/raw-message-reader.d.ts'])
    expect(readdirSync(new URL('../codegen/', import.meta.url))).not.toContainEqual(
      expect.stringMatching(/profile[._-]generated/i),
    )
    expect(readdirSync(new URL('../src/', import.meta.url))).not.toContainEqual(
      expect.stringMatching(/profile[._-]generated/i),
    )
  })

  it('publishes the profile maintenance document', () => {
    expect(packageJson.files).toContain('PROFILE.md')
    expect(publishWorkflow).toMatch(/'PROFILE\.md'/)
  })

  it('uses the static profile check in CI', () => {
    expect(ciWorkflow).toContain('npm run profile:check')
    expect(ciWorkflow).not.toContain('npm run profile:audit')
  })
})
