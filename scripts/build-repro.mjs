import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out = path.resolve(process.argv[2] || 'work/build');
const files = ['treemap-v3-12.html','logo-new.jpg','fleet-skins/p5/pixeloid.sans-bold.ttf','content/media-policy.json','assets/editorial/manifest.json','assets/photos/photo-catalog.lock.json','assets/photos/credits.json','assets/vendor/vendor-lock.json'];
for (const dir of ['assets/editorial','assets/photos','assets/vendor']) for (const name of fs.readdirSync(dir,{withFileTypes:true})) {
  const full=path.join(dir,name.name); if(name.isDirectory()) for(const child of fs.readdirSync(full,{withFileTypes:true})) { const nested=path.join(full,child.name); if(child.isFile()) files.push(nested); } else files.push(full);
}
const unique=[...new Set(files)].filter(f=>fs.statSync(f).isFile()).sort();
fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
const records=[];
for(const file of unique){const dest=path.join(out,file==='treemap-v3-12.html'?'index.html':file);fs.mkdirSync(path.dirname(dest),{recursive:true});const bytes=fs.readFileSync(file);fs.writeFileSync(dest,bytes);records.push({path:path.relative(out,dest).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({schemaVersion:1,entry:'index.html',input:'treemap-v3-12.html',files:records},null,2)+'\n');
console.log(`Built ${records.length} locked files at ${out}`);
