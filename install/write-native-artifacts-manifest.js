#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const installDir = __dirname
const packageRoot = path.resolve(installDir, '..')
const manifestPath = path.join(installDir, 'native-artifacts.json')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function resolveArchivePath(assetName) {
  return path.join(packageRoot, assetName)
}

let updated = 0

manifest.artifacts.forEach((artifact) => {
  const archivePath = resolveArchivePath(artifact.assetName)

  if (!fs.existsSync(archivePath)) {
    console.warn(`skip (missing archive): ${artifact.assetName}`)
    return
  }

  artifact.sha256 = sha256File(archivePath)
  updated += 1
  console.log(`${artifact.name}: ${artifact.sha256}`)
})

if (updated === 0) {
  throw new Error(
    'No native artifact archives found next to package root to hash',
  )
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${updated} sha256 value(s) to ${manifestPath}`)
