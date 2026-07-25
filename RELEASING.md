# Releasing

Publishing is handled by `.github/workflows/publish.yml` after `.github/workflows/ci.yml` succeeds.

## One-time setup

1. In the npm package settings for `fit-file-parser`, add a GitHub Actions Trusted Publisher:
   - Organization or user: `jimmykane`
   - Repository: `fit-parser`
   - Workflow filename: `publish.yml`
   - Environment: `npm`
   - Allowed action: `npm publish`
2. Set the GitHub repository variable `NPM_PUBLISH_ENABLED` to `true` after the Trusted Publisher has been configured and verified.
3. Prefer npm's package setting **Require two-factor authentication and disallow tokens** once the first trusted publish succeeds.

## Normal release flow

1. Update `package.json` and `package-lock.json` to the intended semantic version in the same pull request.
2. Merge that change into `master`.
3. CI verifies the build, tests, lint, types, and generated FIT types on every supported Node version. After that CI run succeeds, the separate publish workflow verifies package contents, publishes the exact CI-tested commit to npm, and creates the matching `v<version>` tag.

The workflow rejects mismatched manifest versions and refuses to republish an existing npm version. Publishing never begins until CI has passed.
