import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const sourceDir=path.resolve(process.argv[2]||'work/source-photos');
const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const problems=[];
for(const asset of lock.assets){
  const source=path.join(sourceDir,`${asset.assetId}.jpg`);
  if(!fs.existsSync(source)){problems.push(`${asset.assetId}: source missing at ${source}`);continue;}
  const input=fs.readFileSync(source);
  if(sha(input)!==asset.sourceFileSha256){problems.push(`${asset.assetId}: source SHA-256 differs from lock`);continue;}
  const sourceMeta=await sharp(input).metadata();
  for(const [width,file] of Object.entries(asset.variants)){
    const output=await sharp(input).rotate().resize({width:Number(width),withoutEnlargement:true}).webp({quality:asset.encoder.quality,effort:asset.encoder.effort,smartSubsample:asset.encoder.smartSubsample}).toBuffer();
    if(sha(output)!==asset.variantsSha256[width])problems.push(`${asset.assetId}: deterministic encode mismatch at ${width}px (${file})`);
    const meta=await sharp(output).metadata();if(meta.format!=='webp'||meta.width!==Math.min(Number(width),sourceMeta.width))problems.push(`${asset.assetId}: invalid generated variant ${width}px`);
  }
}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`PASS: reproduced ${lock.assets.reduce((n,a)=>n+Object.keys(a.variants).length,0)} WebP variants from source files in ${sourceDir} using sharp ${sharp.versions.sharp}.`);
