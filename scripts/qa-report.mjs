import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

fs.mkdirSync('work',{recursive:true});
fs.rmSync('work/playwright-report.json',{force:true});
fs.rmSync('test-results',{recursive:true,force:true});
const failures=[];const results={};
function run(name,script,...args){
  try{const output=execFileSync(process.execPath,[script,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});console.log(output.trim());results[name]='PASS';return true;}
  catch(error){const out=error.stdout?.toString().trim(),err=error.stderr?.toString().trim();if(out)console.log(out);if(err)console.error(err);const message=`${name}: ${err||error.message}`;failures.push(message);results[name]='FAIL';return false;}
}
run('mediaRebuild','scripts/media-build.mjs');
run('mediaVerify','scripts/media-verify.mjs');
run('static','scripts/qa-static.mjs');
const buildHashes=[];
for(const dir of ['work/repro-a','work/repro-b']){
  if(run(`build:${dir}`,'scripts/build-repro.mjs',dir))buildHashes.push(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'build-manifest.json'))).digest('hex'));
}
const reproducible=buildHashes.length===2&&buildHashes[0]===buildHashes[1];
results.reproducibleBuild=reproducible?'PASS':'FAIL';if(!reproducible)failures.push('reproducibleBuild: clean build manifests do not match');

const require=createRequire(import.meta.url);const playwrightCli=require.resolve('@playwright/test/cli');
const browserRun=spawnSync(process.execPath,[playwrightCli,'test','--config','qa/playwright.config.mjs'],{encoding:'utf8',env:process.env,windowsHide:true});
if(browserRun.stdout)console.log(browserRun.stdout.trim());if(browserRun.stderr)console.error(browserRun.stderr.trim());
let browserReport=null;try{browserReport=JSON.parse(fs.readFileSync('work/playwright-report.json','utf8'));}catch{}
const stats=browserReport?.stats;
const browserPassed=browserRun.status===0&&Number(stats?.expected||0)>0&&Number(stats?.unexpected||0)===0&&Number(stats?.skipped||0)===0&&Number(stats?.flaky||0)===0;
results.browser=browserPassed?'PASS':'FAIL';if(!browserPassed)failures.push(`browser: Chromium Playwright did not pass all tests (exit ${browserRun.status??browserRun.error?.message??'unknown'}, report ${browserReport?.status||'unavailable'})`);
const screenshotFiles=[];
if(fs.existsSync('test-results')){
  const walk=d=>{for(const entry of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,entry.name);if(entry.isDirectory())walk(p);else if(/\.png$/i.test(entry.name))screenshotFiles.push(p.replaceAll('\\','/'));}};walk('test-results');
}
const policy=JSON.parse(fs.readFileSync('content/media-policy.json','utf8'));
const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const activePhotos=Object.keys(policy.storyMedia);
const getCheck=(stage,pass,good,bad)=>results[stage]==='PASS'?(pass?good:bad):`FAIL: ${results[stage]||'not run'}; ${bad}`;
const report={schemaVersion:1,status:failures.length?'FAIL':'PASS',generatedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:{node:process.version,sharp:'0.35.5',playwright:'1.62.1',browser:'chromium',browserRunExitCode:browserRun.status},stages:results,checks:{Q1:results.mediaRebuild==='PASS'&&results.mediaVerify==='PASS'?'PASS: checked-in canonical WebP master hashes, deterministic lower-resolution variants and source-evidence records verified; original JPEGs are provenance only and are not rebuilt':`FAIL: ${results.mediaRebuild||'not run'} / ${results.mediaVerify||'not run'}`,Q2:`PARTIAL: ${lock.assets.length} admitted photos have locked relevance; every remaining story has a chart-cover exemption or explicit NO_APPROVED_PHOTO reason`,Q3:getCheck('browser',browserPassed,'PASS: browser decoded local story photos and checked their authored alt text','local photo decode/metadata browser assertions failed'),Q4:getCheck('browser',browserPassed,'PASS: desktop and mobile card bounds and horizontal overflow assertions passed','responsive geometry browser assertions failed'),Q5:getCheck('browser',browserPassed,'PASS: filters, paging, keyboard entry, back navigation and rapid state changes passed','interaction browser assertions failed'),Q6:getCheck('browser',browserPassed,'PASS: s18 Herald aggregate assertion passed; static values and data checks passed','browser chart-data assertions failed'),Q7:getCheck('browser',browserPassed,'PASS: reduced-motion preference remained active and motion state settled','reduced-motion browser assertions failed'),Q8:getCheck('browser',browserPassed,'PARTIAL: keyboard activation, article return, image alt text and responsive bounds passed; axe, contrast sampling and memory profiling are not included','basic browser accessibility assertions failed'),Q9:reproducible?'PASS: two clean builds produced identical manifests':'FAIL: build manifests differ'},reproducibleBuildHashes:buildHashes,photoAssets:lock.assets.length,photoStories:activePhotos,uncoveredStories:{count:Object.keys(policy.unmatchedPhotoStories).length,storyIds:Object.keys(policy.unmatchedPhotoStories),reason:'NO_APPROVED_PHOTO; existing editorial art or text card retained'},mediaRebuildBasis:'Checked-in highest-resolution WebP masters; sourceFileSha256 is retained as original-source provenance and is not re-created.',browserVisualQA:browserPassed?'Automated Chromium Playwright checks passed; no screenshot review is claimed.':'FAIL: Playwright browser checks did not pass.',screenshots:screenshotFiles,browserTestStats:stats||null,failures};
fs.writeFileSync('work/qa-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
