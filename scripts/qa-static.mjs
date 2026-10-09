import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const html=fs.readFileSync('treemap-v3-12.html','utf8');
const canonicalTextBytes=file=>Buffer.from(fs.readFileSync(file,'utf8').replace(/\r\n?/g,'\n'));
const problems=[];const ok=[];
function check(name, condition, detail='') { (condition?ok:problems).push({name,detail}); }
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
for(let i=0;i<scripts.length;i++){try{new vm.Script(scripts[i],{filename:`inline-${i}.js`});}catch(e){problems.push({name:`inline script ${i} syntax`,detail:e.message});}}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
check('unique DOM IDs',new Set(ids).size===ids.length,`found ${ids.length} ids`);
check('no invalid fetchpriority',!html.includes('fetchpriority="lazy"'));
check('s18 Herald aggregate only',/drawHeraldCoalitionMetric/.test(html)&&/nz-herald-poll-of-polls/.test(html)&&!/if \(c\.id === 's18'\) \{[^}]*drawPollSnapshot/.test(html));
check('story ordering ignores image presence',!/hasImg\s*=/.test(html)&&/return a\.tier - b\.tier/.test(html));
check('baseline values remain literal data', ['453','134','336','36','29.0','25.9'].every(value=>html.includes(value)));
check('s18 explanatory copy avoids Curia substitution',(()=>{const start=html.indexOf('"art-s18":'),end=html.indexOf('\n "art-',start+1);const section=html.slice(start,end);return start>=0&&end>start&&!/Curia|National 29|Labour 25/.test(section);})());
const vendor=JSON.parse(fs.readFileSync('assets/vendor/vendor-lock.json','utf8'));
check('runtime libraries and fonts are locally locked',vendor.runtime.every(v=>fs.existsSync(v.file)&&fs.existsSync(v.licenseFile))&&vendor.fonts.every(f=>fs.existsSync(f.licenseFile))&&vendor.files.every(f=>fs.existsSync(f.file)&&crypto.createHash('sha256').update(fs.readFileSync(f.file)).digest('hex')===f.sha256)&&!/(?:fonts\.googleapis\.com|cdn\.jsdelivr\.net|gsap\.)/.test(html));
check('stable article media and progress nodes',ids.filter(x=>x==='a-media').length===1&&ids.filter(x=>x==='a-progress').length===1);
check('reduced-motion changes are observed',/prefers-reduced-motion: reduce/.test(html)&&/addEventListener\('change'/.test(html));
check('QA snapshot API',/window\.BIHIVE_QA=\{getSnapshot:function/.test(html));
const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const policy=JSON.parse(fs.readFileSync('content/media-policy.json','utf8'));
const evidence=lock.assets.every(a=>fs.existsSync(a.sourceEvidencePath)&&crypto.createHash('sha256').update(canonicalTextBytes(a.sourceEvidencePath)).digest('hex')===a.sourceEvidenceSha256);
check('photo source evidence',evidence,`${lock.assets.length} assets`);
const storyIds=[...new Set([...html.matchAll(/\{\s*id:'([^']+)'/g)].map(m=>m[1]))].filter(id=>id!=='logo');
check('photo coverage and exclusions recorded',storyIds.every(id=>policy.storyMedia[id]||policy.coverPreservedForChartStories.includes(id)||policy.unmatchedPhotoStories[id]?.reason),`${Object.keys(policy.storyMedia).length} photos; ${Object.keys(policy.unmatchedPhotoStories).length} NO_APPROVED_PHOTO decisions`);
const staticCheck=execFileSync(process.execPath,['scripts/media-verify.mjs'],{encoding:'utf8'});check('photo variants and license hashes',staticCheck.includes('PASS:'),staticCheck.trim());
if(problems.length){for(const p of problems)console.error(`FAIL ${p.name}: ${p.detail}`);process.exitCode=1;}else console.log(`PASS ${ok.length} static checks`);
