import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const run=(script,...args)=>execFileSync(process.execPath,[script,...args],{encoding:'utf8'}).trim();
run('scripts/media-verify.mjs');run('scripts/qa-static.mjs');
const outputs=[];for(const dir of ['work/repro-a','work/repro-b'])run('scripts/build-repro.mjs',dir);
for(const dir of ['work/repro-a','work/repro-b']){const root=`${dir}/build-manifest.json`;outputs.push(crypto.createHash('sha256').update(fs.readFileSync(root)).digest('hex'));}
const reproducible=outputs[0]===outputs[1];
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const policy=JSON.parse(fs.readFileSync('content/media-policy.json','utf8'));
const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const photoStories=Object.keys(policy.storyMedia);
const report={schemaVersion:1,status:reproducible?'BLOCKED':'FAIL',generatedAt:'2026-10-09',head,environment:{node:process.version,sharp:'0.35.5',playwright:'1.62.1'},checks:{Q1:'PASS: source records, local WebP, hash and license fields verified',Q2:`PARTIAL: ${lock.assets.length} admitted photos have locked relevance; every remaining story has a chart-cover exemption or explicit NO_APPROVED_PHOTO reason`,Q3:'BLOCKED: browser image/crop verification prohibited in this session',Q4:'BLOCKED: responsive DOM geometry/overlap needs permitted browser runtime',Q5:'BLOCKED: browser interaction and race scenarios not run',Q6:'PASS: s18 limited to Herald 47.8 aggregate; baseline values protected by static checks; browser cross-view checks blocked',Q7:'BLOCKED: motion timing and reduced-motion browser state not run',Q8:'BLOCKED: axe, contrast sampling, layout shift and repeated-navigation memory checks need browser runtime',Q9:reproducible?'PASS: two clean builds produced identical manifests':'FAIL: build manifests differ'},reproducibleBuildHashes:outputs,photoAssets:lock.assets.length,photoStories,uncoveredStories:{count:Object.keys(policy.unmatchedPhotoStories).length,storyIds:Object.keys(policy.unmatchedPhotoStories),reason:'NO_APPROVED_PHOTO; existing editorial art or text card retained'},browserVisualQA:'BLOCKED: no browser UI navigation was performed',screenshots:[]};
fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/qa-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!reproducible)process.exitCode=1;
