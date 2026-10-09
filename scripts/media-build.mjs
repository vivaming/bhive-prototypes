import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const sourceDir=path.resolve(process.argv[2]||'work/source-photos');
fs.mkdirSync(sourceDir,{recursive:true});
const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const problems=[];
for(const asset of lock.assets){
  const source=path.join(sourceDir,`${asset.assetId}.jpg`);
  if(!fs.existsSync(source)){
    try{
      const download=new URL(asset.downloadUrl);
      if(download.protocol!=='https:'||!['commons.wikimedia.org','upload.wikimedia.org'].includes(download.hostname))throw new Error(`unapproved source host ${download.hostname}`);
      let response;
      for(let attempt=0;attempt<5;attempt++){
        response=await fetch(download,{headers:{'User-Agent':'BIHIVE-media-build/1.0 (reproducible asset verification; contact: project maintainers)'}});
        if(response.status!==429&&response.status<500)break;
        if(attempt===4)break;
        const retryAfter=Number(response.headers.get('retry-after'));
        const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,15000):Math.min(1000*2**attempt,8000);
        await wait(delay);
      }
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const finalUrl=new URL(response.url);
      if(finalUrl.protocol!=='https:'||!['commons.wikimedia.org','upload.wikimedia.org'].includes(finalUrl.hostname))throw new Error(`redirected to unapproved host ${finalUrl.hostname}`);
      const input=Buffer.from(await response.arrayBuffer());
      if(sha(input)!==asset.sourceFileSha256)throw new Error('download SHA-256 differs from sourceFileSha256 lock');
      fs.writeFileSync(source,input);
      console.log(`${asset.assetId}: fetched and SHA-256 verified from ${asset.downloadUrl}`);
    }catch(error){problems.push(`${asset.assetId}: source missing and verified download failed: ${error.message}`);continue;}
  }
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
