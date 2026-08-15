const crypto = require('crypto')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  REQUIRED_PREFIX,
  validateAndroidJniArchive,
} = require('../validate-android-jni-archive')

function writeEmptySo(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.from('fake-so'))
}

function makeArchive(layoutRoot, topEntry, archivePath) {
  execFileSync('tar', ['czf', archivePath, '-C', layoutRoot, topEntry], {
    stdio: 'pipe',
  })
}

describe('validateAndroidJniArchive', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-rn-jni-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { force: true, recursive: true })
  })

  it('should accept archive packed as android/src/main/jniLibs/...', () => {
    const root = path.join(tempDir, 'good')
    writeEmptySo(
      path.join(root, REQUIRED_PREFIX, 'arm64-v8a', 'librnllama.so'),
    )
    writeEmptySo(
      path.join(root, REQUIRED_PREFIX, 'x86_64', 'librnllama_x86_64.so'),
    )
    const archivePath = path.join(tempDir, 'good.tar.gz')
    makeArchive(root, 'android', archivePath)

    const result = validateAndroidJniArchive(archivePath)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries.some((e) => e.includes('librnllama.so'))).toBe(true)
      expect(result.sha256).toHaveLength(64)
    }
  })

  it('should reject top-level jniLibs/ layout (postinstall footgun)', () => {
    const root = path.join(tempDir, 'bad')
    writeEmptySo(path.join(root, 'jniLibs', 'arm64-v8a', 'librnllama.so'))
    const archivePath = path.join(tempDir, 'bad.tar.gz')
    makeArchive(root, 'jniLibs', archivePath)

    const result = validateAndroidJniArchive(archivePath)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/top-level jniLibs/)
      expect(result.errors.join('\n')).toMatch(/android\/src\/main\/jniLibs/)
    }
  })

  it('should reject missing arm64 librnllama*.so', () => {
    const root = path.join(tempDir, 'no-so')
    writeEmptySo(
      path.join(root, REQUIRED_PREFIX, 'x86_64', 'librnllama_x86_64.so'),
    )
    const archivePath = path.join(tempDir, 'no-so.tar.gz')
    makeArchive(root, 'android', archivePath)

    const result = validateAndroidJniArchive(archivePath)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/missing arm64 core lib/)
    }
  })

  it('should reject sha256 mismatch when expectedSha256 is set', () => {
    const root = path.join(tempDir, 'sha')
    writeEmptySo(
      path.join(root, REQUIRED_PREFIX, 'arm64-v8a', 'librnllama.so'),
    )
    const archivePath = path.join(tempDir, 'sha.tar.gz')
    makeArchive(root, 'android', archivePath)
    const actual = crypto
      .createHash('sha256')
      .update(fs.readFileSync(archivePath))
      .digest('hex')

    const result = validateAndroidJniArchive(archivePath, {
      expectedSha256: '0'.repeat(64),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/sha256 mismatch/)
      expect(result.sha256).toBe(actual)
    }
  })

  it('should reject missing archive file', () => {
    const result = validateAndroidJniArchive(
      path.join(tempDir, 'does-not-exist.tar.gz'),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/archive not found/)
    }
  })
})
