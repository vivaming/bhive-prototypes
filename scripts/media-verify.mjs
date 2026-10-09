import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const fail = [];
const canonicalTextBytes = file => Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'));
const lock = JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('content/media-policy.json', 'utf8'));
const allowed = new Set(['CC-BY-4.0', 'CC-BY-2.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'PD-self']);
for (const asset of lock.assets) {
  for (const field of ['assetId','storyIds','src','variants','sourcePage','creator','licenseId','licenseUrl','attributionText','modifications','sourceEvidencePath','sourceEvidenceSha256','fileSha256','sourceFileSha256','canonicalRebuild','subjectTags','relevanceReason','archiveDate','alt','objectPosition']) {
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
  const plan=asset.canonicalRebuild, masterWidth=String(plan?.masterWidth), masterFile=asset.variants?.[masterWidth];
  if (plan?.method!=='checked-in-highest-resolution-WebP' || !masterFile || masterFile!==plan.masterFile) fail.push(`${asset.assetId}: invalid canonical master declaration`);
  else if (crypto.createHash('sha256').update(fs.readFileSync(masterFile)).digest('hex')!==plan.masterSha256 || plan.masterSha256!==asset.variantsSha256?.[masterWidth]) fail.push(`${asset.assetId}: canonical master hash mismatch`);
  if (plan?.derivedWidths?.length!==Object.keys(asset.variants||{}).length-1) fail.push(`${asset.assetId}: canonical derived widths do not cover all non-master variants`);
  if (!asset.variants?.[String(asset.src?.match(/-(\d+)\.webp$/)?.[1])] || crypto.createHash('sha256').update(fs.readFileSync(asset.src)).digest('hex')!==asset.fileSha256) fail.push(`${asset.assetId}: selected src hash mismatch`);
  if (!fs.existsSync(asset.sourceEvidencePath)) fail.push(`${asset.assetId}: missing source evidence`);
  else {
    if (crypto.createHash('sha256').update(canonicalTextBytes(asset.sourceEvidencePath)).digest('hex') !== asset.sourceEvidenceSha256) fail.push(`${asset.assetId}: source evidence hash mismatch`);
    const evidence=JSON.parse(fs.readFileSync(asset.sourceEvidencePath,'utf8'));
    if(evidence.sourceFileSha256!==asset.sourceFileSha256) fail.push(`${asset.assetId}: original source hash provenance does not match its evidence record`);
  }
  for (const storyId of asset.storyIds) if (!policy.storyMedia[storyId] || policy.storyMedia[storyId].preferred !== asset.assetId) fail.push(`${asset.assetId}: no locked policy for ${storyId}`);
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log(`PASS: ${lock.assets.length} photo records, verified variants and evidence hashes (sharp ${sharp.versions.sharp}).`);
