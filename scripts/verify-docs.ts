import assert from 'node:assert/strict'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import process from 'node:process'

const root = new URL('../', import.meta.url)
const site = new URL('site/', root)
const config = JSON.parse(await readFile(new URL('typedoc.json', root), 'utf8'))
const hosted = new URL(config.hostedBaseUrl)
const guides = [
  'Parse_FIT_files',
  'Configure_parsing',
  'Handle_errors',
  'Read_raw_and_developer_data',
  'Encode_FIT_files',
  'Understand_decoded_fields',
].map(name => `documents/${name}.html`)
const required = [
  'index.html',
  'classes/API.FitParser.html',
  'classes/API.FitEncoder.html',
  'interfaces/API.FitParserOptions.html',
  'interfaces/DecodedFields.ParsedFit.html',
  'interfaces/DecodedFields.ParsedRecord.html',
  'functions/API.readFitMessages.html',
  'functions/API.getFitManufacturerName.html',
  ...guides,
]
await Promise.all(required.map(page => access(new URL(page, site))))

const landing = await readFile(new URL('index.html', site), 'utf8')
const readme = await readFile(new URL('README.md', root), 'utf8')
for (const page of guides) {
  assert(landing.includes(`href="${page}"`), `Landing page must link to ${page}`)
  assert(readme.includes(new URL(page, hosted).href), `README must link to ${page}`)
}

const cache = new Map<string, string>()
async function html(page: string): Promise<string> {
  if (!cache.has(page)) {
    cache.set(page, await readFile(new URL(page, site), 'utf8'))
  }
  return cache.get(page)!
}

async function checkDirectory(directory = ''): Promise<number> {
  let count = 0
  for (const entry of await readdir(new URL(directory, site), { withFileTypes: true })) {
    const page = directory + entry.name
    if (entry.isDirectory()) {
      count += await checkDirectory(`${page}/`)
    }
    else if (page.endsWith('.html')) {
      count++
      for (const match of (await html(page)).matchAll(/(?:href|src)\s*=\s*(["'])(.*?)\1/g)) {
        const link = match[2].replaceAll('&amp;', '&')
        const target = new URL(link, new URL(page, hosted))
        if (target.origin !== hosted.origin || !target.pathname.startsWith(hosted.pathname)) {
          continue
        }
        let relative = target.pathname.slice(hosted.pathname.length) || 'index.html'
        const local = new URL(relative, site)
        assert(local.href.startsWith(site.href), `Link escapes site: ${link}`)
        if ((await stat(local)).isDirectory()) {
          relative += relative.endsWith('/') ? 'index.html' : '/index.html'
          await access(new URL(relative, site))
        }
        if (target.hash && relative.endsWith('.html')) {
          const id = decodeURIComponent(target.hash.slice(1))
          assert((await html(relative)).includes(`id="${id}"`), `Broken anchor from ${page}: ${link}`)
        }
      }
    }
  }
  return count
}

const count = await checkDirectory()
process.stdout.write(`Verified ${count} documentation pages, required API pages and internal links.\n`)
