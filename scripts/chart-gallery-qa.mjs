import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderSpec,validateGallerySpec} from '../charts/render-spec.mjs';

const catalog=JSON.parse(fs.readFileSync('charts/gallery/catalog.json','utf8'));
const outDir='work/chart-gallery';fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(outDir,{recursive:true});
const tests=[];function scenario(name,fn){tests.push({name,fn});}
function rejected(fn,pattern){assert.throws(fn,pattern);}
const specs=catalog.specimens;
scenario('gallery catalog is explicit synthetic development-only material',()=>{assert.equal(catalog.status,'DEVELOPMENT_GALLERY_ONLY');assert.match(catalog.warning,/not observed New Zealand data/);assert.ok(specs.length>=12);assert.equal(new Set(specs.map(s=>s.id)).size,specs.length);});
for(const spec of specs){
  scenario(`specimen ${spec.id} validates and renders with an explicit HOLD`,()=>{
    assert.deepEqual(validateGallerySpec(spec),[]);
    const svg=renderSpec(spec);assert.match(svg,/data-release-gate="HOLD"/);assert.match(svg,/SYNTHETIC LAYOUT SPECIMEN/);assert.match(svg,/<title/);assert.match(svg,/role="img"/);
  });
}
scenario(`shared dark and light themes produce PNG exports for all ${specs.length} specimens`,async()=>{
  const manifest=[];
  for(const spec of specs){for(const theme of ['dark','light']){
    const svg=renderSpec(spec,{theme});const svgPath=path.join(outDir,`${spec.id}.${theme}.svg`),pngPath=path.join(outDir,`${spec.id}.${theme}.png`);
    fs.writeFileSync(svgPath,svg);await sharp(Buffer.from(svg)).png({compressionLevel:9,adaptiveFiltering:false}).toFile(pngPath);
    const meta=await sharp(pngPath).metadata();assert.equal(meta.width,spec.width);assert.equal(meta.height,spec.height);
    manifest.push({id:spec.id,theme,svgSha256:crypto.createHash('sha256').update(svg).digest('hex'),pngSha256:crypto.createHash('sha256').update(fs.readFileSync(pngPath)).digest('hex'),width:meta.width,height:meta.height});
  }}
  const thumbW=300,thumbH=190,cols=3,rows=Math.ceil(specs.length/cols),composites=[];
  for(let i=0;i<specs.length;i++){const buffer=await sharp(path.join(outDir,`${specs[i].id}.dark.png`)).resize(thumbW,thumbH,{fit:'contain',background:'#0b1117'}).png().toBuffer();composites.push({input:buffer,left:(i%cols)*thumbW,top:Math.floor(i/cols)*thumbH});}
  await sharp({create:{width:cols*thumbW,height:rows*thumbH,channels:3,background:'#0b1117'}}).composite(composites).png().toFile(path.join(outDir,'contact-sheet.png'));
  fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify({schemaVersion:1,status:'SYNTHETIC_PREVIEW_ONLY',specimens:manifest},null,2)+'\n');
});
const sample=structuredClone(specs.find(s=>s.id==='synth-diverging-bars'));
scenario('non-zero bar baseline is rejected',()=>{const s=structuredClone(sample);s.scale.baseline=2;rejected(()=>renderSpec(s),/zero baseline/);});
scenario('bar domain must include zero',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-compact-bars'));s.scale.domain=[2,40];rejected(()=>renderSpec(s),/include the zero baseline/);});
scenario('bar domain must contain every data value',()=>{const s=structuredClone(sample);s.scale.domain=[0,10];rejected(()=>renderSpec(s),/domain must contain/);});
scenario('negative and positive bars share the zero coordinate',()=>{const svg=renderSpec(sample),xs=[...svg.matchAll(/<line x1="([\d.]+)" x2="\1"[^>]*stroke-width="1.3"/g)].map(m=>m[1]);assert.equal(xs.length,1);assert.ok(Number(xs[0])>0);});
scenario('bar gap is clamped to the specified 1–2 pixel interval',()=>{for(const gap of [0,1,1.5,2,9]){const s=structuredClone(sample);s.barGap=gap;const svg=renderSpec(s);const bars=[...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].slice(1,5).map(m=>({y:Number(m[1]),h:Number(m[2])}));assert.ok(bars.length>=2);const actual=bars[1].y-(bars[0].y+bars[0].h);assert.ok(actual>=1&&actual<=2);}});
scenario('oversized bar value label stays inside the SVG viewBox',()=>{const s=structuredClone(sample);s.scale.domain=[-30,30];s.data.items[0].value=30;const svg=renderSpec(s);assert.match(svg,/text-anchor="end"/);});
scenario('line missing observations split the path instead of bridging',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-employment-gap'));const svg=renderSpec(s);assert.equal((svg.match(/<polyline/g)||[]).length,3);});
scenario('line series preserve every non-missing observation marker',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-employment-gap'));const svg=renderSpec(s);assert.equal((svg.match(/<circle/g)||[]).length,15);});
scenario('line labels follow period count and are decimated on dense data',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-price-index'));s.width=320;s.data.labels=Array.from({length:18},(_,i)=>`Period ${i+1}`);s.data.series[0].values=Array.from({length:18},(_,i)=>96+i);const svg=renderSpec(s);const labels=[...svg.matchAll(/text x="([\d.]+)" y="[\d.]+" text-anchor="middle" font-size="9" fill="#[a-f\d]+">Period/g)];assert.ok(labels.length<=7);});
scenario('line rejects a series with mismatched point count',()=>{const s=structuredClone(specs.find(x=>x.template==='line'));s.data.series[0].values.pop();rejected(()=>renderSpec(s),/align finite-or-null values/);});
scenario('line rejects values outside declared domain',()=>{const s=structuredClone(specs.find(x=>x.template==='line'));s.data.series[0].values[0]=999;rejected(()=>renderSpec(s),/domain must contain/);});
scenario('line retains true zero and negative values',()=>{const s=structuredClone(specs.find(x=>x.template==='line'));s.scale.domain=[-5,5];s.data.labels=['a','b','c'];s.data.series=[{id:'x',label:'x',values:[-3,0,4]}];const svg=renderSpec(s);assert.equal((svg.match(/<circle/g)||[]).length,3);});
scenario('dot plot supports a negative comparison on a signed axis',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-long-label-dots'));assert.deepEqual(validateGallerySpec(s),[]);assert.match(renderSpec(s),/text-anchor="middle"/);});
scenario('dot plot handles one category without division by zero',()=>{const s=structuredClone(specs.find(x=>x.template==='dot-plot'));s.data.items=[{label:'One',value:12}];assert.match(renderSpec(s),/<circle/);});
scenario('dot plot rejects values outside the domain',()=>{const s=structuredClone(specs.find(x=>x.template==='dot-plot'));s.data.items[0].value=999;rejected(()=>renderSpec(s),/domain must contain/);});
scenario('long dot labels wrap rather than escape their label column',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-long-label-dots'));const svg=renderSpec(s);assert.match(svg,/<tspan/);assert.match(svg,/fictional category/);});
scenario('slope chart preserves endpoints and endpoint labels',()=>{const s=structuredClone(specs.find(x=>x.template==='slope'));const svg=renderSpec(s);assert.match(svg,/Period A/);assert.match(svg,/Period B/);assert.equal((svg.match(/<line x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+" stroke="#[a-f\d]{6}" stroke-width="2.4"/gi)||[]).length,s.data.items.length);});
scenario('slope chart rejects an endpoint outside its scale',()=>{const s=structuredClone(specs.find(x=>x.template==='slope'));s.data.items[0].end=999;rejected(()=>renderSpec(s),/domain must contain/);});
scenario('slope chart handles tied endpoints without NaN coordinates',()=>{const s=structuredClone(specs.find(x=>x.template==='slope'));s.data.items=[{label:'Tie',start:50,end:50}];assert.doesNotMatch(renderSpec(s),/NaN/);});
scenario('contribution waterfall reconciles and renders every step',()=>{const s=structuredClone(specs.find(x=>x.template==='contribution'));assert.deepEqual(validateGallerySpec(s),[]);assert.equal((renderSpec(s).match(/<rect /g)||[]).length,s.data.steps.length+1);});
scenario('contribution waterfall rejects a non-reconciling total',()=>{const s=structuredClone(specs.find(x=>x.template==='contribution'));s.data.steps.at(-1).total+=1;rejected(()=>renderSpec(s),/reconcile/);});
scenario('contribution includes negative changes with a connector',()=>{const s=structuredClone(specs.find(x=>x.template==='contribution'));const svg=renderSpec(s);assert.match(svg,/fill="#ef6754"/);assert.match(svg,/stroke-dasharray="3 3"/);});
scenario('scatter validates both independent axes',()=>{const s=structuredClone(specs.find(x=>x.template==='scatter'));s.scale.yDomain=[-10,120];assert.deepEqual(validateGallerySpec(s),[]);});
scenario('scatter rejects invalid vertical domain',()=>{const s=structuredClone(specs.find(x=>x.template==='scatter'));s.scale.yDomain=[10,10];rejected(()=>renderSpec(s),/yDomain/);});
scenario('scatter rejects non-finite coordinates',()=>{const s=structuredClone(specs.find(x=>x.template==='scatter'));s.data.points[0].x=NaN;rejected(()=>renderSpec(s),/finite x and y/);});
scenario('scatter accessible point tooltips contain escaped label and units',()=>{const s=structuredClone(specs.find(x=>x.template==='scatter'));s.data.points[0].label='A < B';const svg=renderSpec(s);assert.match(svg,/A &lt; B/);assert.match(svg,/units/);});
scenario('render rejects unknown themes and out-of-range dimensions',()=>{rejected(()=>renderSpec(sample,{theme:'neon'}),/unknown theme/);rejected(()=>renderSpec(sample,{width:179}),/dimensions outside/);});
scenario('compact 320px bars retain bounded dimensions and 1px gap',()=>{const s=structuredClone(specs.find(x=>x.id==='synth-compact-bars'));const svg=renderSpec(s);assert.match(svg,/viewBox="0 0 320 250"/);assert.match(svg,/data-release-gate="HOLD"/);});
scenario('synthetic label classification cannot be removed',()=>{const s=structuredClone(sample);s.provenance.status='VERIFIED';rejected(()=>renderSpec(s),/explicitly synthetic/);});
scenario('release gate cannot be promoted for gallery output',()=>{const s=structuredClone(sample);s.releaseGate='PASS';rejected(()=>renderSpec(s),/release HOLD/);});
scenario('unsafe XML characters are escaped in title and labels',()=>{const s=structuredClone(sample);s.title='A < B & C';s.data.items[0].label='One " two';const svg=renderSpec(s);assert.match(svg,/A &lt; B &amp; C/);assert.match(svg,/One &quot; two/);});
scenario('generated gallery is kept outside production build inputs',()=>{const build=fs.readFileSync('scripts/build-repro.mjs','utf8');assert.doesNotMatch(build,/charts\/gallery/);assert.doesNotMatch(build,/render-spec\.mjs/);});

let completed=0;for(const {name,fn} of tests){try{await fn();completed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}: ${error.stack||error}`);}}
if(completed<30||tests.length<30){console.error(`Expected at least 30 passing scenarios, got ${completed}/${tests.length}`);process.exitCode=1;}else console.log(`PASS: ${completed} chart gallery QA scenarios; ${specs.length} synthetic specimens exported to ${outDir}`);
