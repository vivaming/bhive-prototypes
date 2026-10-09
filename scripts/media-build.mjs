import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';

const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const problems=[];
let derived=0,masters=0;
for(const asset of lock.assets){
  const plan=asset.canonicalRebuild;
  if(!plan){problems.push(`${asset.assetId}: missing canonicalRebuild plan`);continue;}
  if(plan.method!=='checked-in-highest-resolution-WebP')problems.push(`${asset.assetId}: unsupported canonical rebuild method ${plan.method}`);
  const width=String(plan.masterWidth),masterPath=asset.variants?.[width];
  if(!masterPath||masterPath!==plan.masterFile){problems.push(`${asset.assetId}: canonical master path is not the locked ${width}px variant`);continue;}
  if(!fs.existsSync(masterPath)){problems.push(`${asset.assetId}: missing canonical master ${masterPath}`);continue;}
  const masterBytes=fs.readFileSync(masterPath),masterHash=sha(masterBytes);
  if(masterHash!==plan.masterSha256||masterHash!==asset.variantsSha256?.[width]){problems.push(`${asset.assetId}: canonical master SHA-256 mismatch`);continue;}
  const masterMeta=await sharp(masterBytes).metadata();
  if(masterMeta.format!=='webp'||!masterMeta.width||!masterMeta.height){problems.push(`${asset.assetId}: invalid canonical master image`);continue;}
  masters++;
  const derivedWidths=new Set((plan.derivedWidths||[]).map(String));
  if(derivedWidths.size!==Object.keys(asset.variants).length-1||Object.keys(asset.variants).some(size=>size!==width&&!derivedWidths.has(size))){problems.push(`${asset.assetId}: derivedWidths do not cover exactly the lower-resolution variants`);continue;}
  const enc=plan.encoder;
  if(enc?.name!=='sharp'||enc.version!==sharp.versions.sharp||enc.format!=='webp'||!Number.isInteger(enc.quality)||!Number.isInteger(enc.effort)){problems.push(`${asset.assetId}: invalid or unsupported canonical encoder lock`);continue;}
  for(const [size,file] of Object.entries(asset.variants||{})){
    let output;
    if(size===width)output=masterBytes;
    else {
      try{output=await sharp(masterBytes).resize({width:Number(size),withoutEnlargement:true}).webp({quality:enc.quality,effort:enc.effort,smartSubsample:enc.smartSubsample}).toBuffer();derived++;}
      catch(error){problems.push(`${asset.assetId}: could not rebuild ${size}px variant: ${error.message}`);continue;}
    }
    if(sha(output)!==asset.variantsSha256?.[size])problems.push(`${asset.assetId}: deterministic master-derived hash mismatch at ${size}px (${file})`);
    const meta=await sharp(output).metadata();
    if(meta.format!=='webp'||meta.width!==Math.min(Number(size),masterMeta.width))problems.push(`${asset.assetId}: invalid generated variant ${size}px`);
  }
}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`PASS: verified ${masters} checked-in canonical WebP masters and deterministically reproduced ${derived} lower-resolution variants from local bytes using sharp ${sharp.versions.sharp}; original JPEGs were not rebuilt.`);
