import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const fail = [];
const lock = JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('content/media-policy.json', 'utf8'));
const allowed = new Set(['CC-BY-4.0', 'CC-BY-2.0', 'CC-BY-SA-4.0', 'CC0-1.0']);
for (const asset of lock.assets) {
  for (const field of ['assetId','storyIds','src','variants','sourcePage','creator','licenseId','licenseUrl','attributionText','modifications','sourceEvidencePath','sourceEvidenceSha256','fileSha256','sourceFileSha256','subjectTags','relevanceReason','archiveDate','alt','objectPosition']) {
    if (!asset[field]) fail.push(`${asset.assetId}: missing ${field}`);
  }
  if (!allowed.has(asset.licenseId)) fail.push(`${asset.assetId}: unapproved license ${asset.licenseId}`);
  for (const [size, file] of Object.entries(asset.variants || {})) {
    if (!fs.existsSync(file)) { fail.push(`${asset.assetId}: missing variant ${file}`); continue; }
    const bytes = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha !== asset.variantsSha256?.[size]) fail.push(`${asset.assetId}: hash mismatch ${file}`);
    const meta = await sharp(path.resolve(file)).metadata();
    if (meta.format !== 'webp' || !meta.width || !meta.height) fail.push(`${asset.assetId}: invalid image ${file}`);
  }
  if (!fs.existsSync(asset.sourceEvidencePath)) fail.push(`${asset.assetId}: missing source evidence`);
  else if (crypto.createHash('sha256').update(fs.readFileSync(asset.sourceEvidencePath)).digest('hex') !== asset.sourceEvidenceSha256) fail.push(`${asset.assetId}: source evidence hash mismatch`);
  for (const storyId of asset.storyIds) if (!policy.storyMedia[storyId] || policy.storyMedia[storyId].preferred !== asset.assetId) fail.push(`${asset.assetId}: no locked policy for ${storyId}`);
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log(`PASS: ${lock.assets.length} photo records, verified variants and evidence hashes (sharp ${sharp.versions.sharp}).`);
