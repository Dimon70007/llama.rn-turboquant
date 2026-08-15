#!/usr/bin/env node
/**
 * Validate llama-rn-android-jni-libs.tar.gz layout for postinstall.
 *
 * download-native-artifacts.js extracts into the package root and expects:
 *   android/src/main/jniLibs/...
 * A top-level jniLibs/ archive extracts to the wrong place and breaks install.
 *
 * CLI:
 *   node install/validate-android-jni-archive.js [path-to-tar.gz]
 *   node install/validate-android-jni-archive.js --sha256 <hex> [path]
 *
 * Exit 0 on success, 1 on failure.
 */

const crypto = require('crypto')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REQUIRED_PREFIX = 'android/src/main/jniLibs'
const REQUIRED_ENTRY =
  'android/src/main/jniLibs/arm64-v8a/librnllama.so'

function listTarEntries(archivePath) {
  const out = execFileSync('tar', ['tzf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeEntry(entry) {
  return entry.replace(/^\.\//, '').replace(/\/+$/, '')
}

function isAllowedJniArchiveEntry(entry) {
  if (entry === REQUIRED_PREFIX || entry.startsWith(`${REQUIRED_PREFIX}/`)) {
    return true
  }

  // tar may include parent dirs: android/, android/src/, android/src/main/
  const parts = REQUIRED_PREFIX.split('/')
  for (let i = 1; i < parts.length; i += 1) {
    if (entry === parts.slice(0, i).join('/')) {
      return true
    }
  }

  return false
}

/**
 * @param {string} archivePath
 * @param {{ expectedSha256?: string | null }} [options]
 * @returns {{ ok: true, entries: string[], sha256: string } | { ok: false, errors: string[], entries: string[], sha256?: string }}
 */
function validateAndroidJniArchive(archivePath, options = {}) {
  const errors = []
  const absolutePath = path.resolve(archivePath)

  if (!fs.existsSync(absolutePath)) {
    return {
      ok: false,
      errors: [`archive not found: ${absolutePath}`],
      entries: [],
    }
  }

  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(absolutePath))
    .digest('hex')

  if (
    typeof options.expectedSha256 === 'string' &&
    options.expectedSha256.length > 0 &&
    options.expectedSha256.toLowerCase() !== sha256
  ) {
    errors.push(
      `sha256 mismatch: expected ${options.expectedSha256}, got ${sha256}`,
    )
  }

  let entries = []
  try {
    entries = listTarEntries(absolutePath).map(normalizeEntry)
  } catch (error) {
    return {
      ok: false,
      errors: [
        `failed to list tar entries: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      entries: [],
      sha256,
    }
  }

  if (entries.length === 0) {
    errors.push('archive is empty')
  }

  // Classic footgun: tar from android/src/main → top-level jniLibs/
  const hasTopLevelJniLibs = entries.some(
    (entry) => entry === 'jniLibs' || entry.startsWith('jniLibs/'),
  )
  if (hasTopLevelJniLibs) {
    errors.push(
      'forbidden top-level jniLibs/ layout — pack with: tar czf … -C . android/src/main/jniLibs',
    )
  }

  const badPrefix = entries.filter((entry) => !isAllowedJniArchiveEntry(entry))
  if (badPrefix.length > 0) {
    const sample = badPrefix.slice(0, 5).join(', ')
    errors.push(
      `entries must be under ${REQUIRED_PREFIX}/ (got e.g. ${sample})`,
    )
  }

  const hasRequiredSo = entries.some(
    (entry) =>
      entry === REQUIRED_ENTRY ||
      /^android\/src\/main\/jniLibs\/arm64-v8a\/librnllama.*\.so$/.test(entry),
  )
  if (!hasRequiredSo) {
    errors.push(
      `missing arm64 core lib (expected ${REQUIRED_ENTRY} or librnllama*.so under arm64-v8a)`,
    )
  }

  if (errors.length > 0) {
    return { ok: false, errors, entries, sha256 }
  }

  return { ok: true, entries, sha256 }
}

function parseArgs(argv) {
  const args = { archivePath: null, expectedSha256: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--sha256') {
      args.expectedSha256 = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`)
    }
    args.archivePath = arg
  }
  return args
}

function main() {
  const packageRoot = path.resolve(__dirname, '..')
  let archivePath = path.join(packageRoot, 'llama-rn-android-jni-libs.tar.gz')
  let expectedSha256 = null

  try {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.archivePath) {
      archivePath = path.resolve(parsed.archivePath)
    }
    expectedSha256 = parsed.expectedSha256
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
    return
  }

  const result = validateAndroidJniArchive(archivePath, { expectedSha256 })

  if (!result.ok) {
    console.error(`invalid android jni archive: ${archivePath}`)
    result.errors.forEach((message) => console.error(`  - ${message}`))
    process.exitCode = 1
    return
  }

  console.log(`ok: ${archivePath}`)
  console.log(`sha256: ${result.sha256}`)
  console.log(`entries: ${result.entries.length}`)
}

module.exports = {
  REQUIRED_PREFIX,
  REQUIRED_ENTRY,
  listTarEntries,
  isAllowedJniArchiveEntry,
  validateAndroidJniArchive,
}

if (require.main === module) {
  main()
}
