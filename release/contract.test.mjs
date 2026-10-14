import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sealHumanApprovalPacket,validateReleaseDryRun} from './contract.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const pins={articleHash:'a'.repeat(64),chartHash:'b'.repeat(64),dataHash:'c'.repeat(64),policyHash:'d'.repeat(64)};
const buildManifest={schemaVersion:1,entry:'index.html',files:[{path:'index.html',sha256:'1'.repeat(64),bytes:100},{path:'charts/spec.json',sha256:'2'.repeat(64),bytes:80}]};
const buildManifestBytes=JSON.stringify(buildManifest)+'\n';
const buildHash=hash(buildManifestBytes);
const observedArtifacts={'index.html':'1'.repeat(64),'charts/spec.json':'2'.repeat(64)};
const approval=sealHumanApprovalPacket({approvalPacketId:'approval-fixture-1',reviewPacketHash:'e'.repeat(64),reviewProtocolStatus:'READY_FOR_HUMAN_RELEASE_REVIEW',decision:'APPROVE_FOR_DRY_RUN',approverId:'fixture-approver',approvedVersionPins:pins,createdAt:'2026-10-10T00:00:00.000Z',evidenceRef:'synthetic-test-fixture:approval',provenance:'SYNTHETIC_QA_FIXTURE'});
const manifest={releaseId:'release-fixture-1',intent:'RELEASE_DRY_RUN',releaseGate:'READY_FOR_DRY_RUN',buildManifestSha256:buildHash,artifacts:buildManifest.files.map(({path,sha256})=>({path,sha256})),versionPins:pins,humanApprovalPacketHash:approval.packetHash};
const run=(overrides={})=>validateReleaseDryRun({manifest,buildManifestBytes,observedArtifacts,currentPins:pins,approvalPacket:approval,...overrides});

test('release manifest validates as local dry run without authorizing deployment',()=>{
  const result=run();assert.equal(result.status,'DRY_RUN_VALIDATION_PASS');assert.equal(result.releaseAuthorized,false);assert.equal(result.deployRequested,false);assert.equal(result.publishRequested,false);assert.equal(result.externalCalls,0);assert.equal(result.buildManifestSha256,buildHash);
});
test('HOLD release gate and HOLD approval are rejected',()=>{
  assert.match(run({manifest:{...manifest,releaseGate:'HOLD'}}).errors.join(' '),/release manifest is HOLD/);
  const hold=sealHumanApprovalPacket({...approval,decision:'HOLD'});assert.match(run({approvalPacket:hold,manifest:{...manifest,humanApprovalPacketHash:hold.packetHash}}).errors.join(' '),/HOLD/);
});
test('missing manifest, approval, build bytes, or current pins fail closed',()=>{
  assert.equal(validateReleaseDryRun({manifest:null}).status,'HOLD');
  assert.match(run({approvalPacket:null}).errors.join(' '),/approval packet is missing/);
  assert.match(run({buildManifestBytes:null}).errors.join(' '),/exact build-manifest bytes/);
  assert.match(run({currentPins:null}).errors.join(' '),/version pins are stale/);
});
test('duplicate release ID is rejected',()=>assert.match(run({knownReleaseIds:[manifest.releaseId]}).errors.join(' '),/duplicate release ID/));
test('changed build manifest hash is rejected',()=>assert.match(run({manifest:{...manifest,buildManifestSha256:'f'.repeat(64)}}).errors.join(' '),/build manifest hash mismatch/));
test('build manifest bytes are hashed exactly and invalid bytes are rejected',()=>{
  assert.match(run({buildManifestBytes:buildManifestBytes.replace('bytes', 'Bytes')}).errors.join(' '),/build manifest hash mismatch/);
  assert.match(run({buildManifestBytes:'not json'}).errors.join(' '),/not valid JSON/);
});
test('missing or changed artifact files fail validation',()=>{
  const missing={...observedArtifacts};delete missing['charts/spec.json'];assert.match(run({observedArtifacts:missing}).errors.join(' '),/observed artifact missing or changed/);
  assert.match(run({observedArtifacts:{...observedArtifacts,'charts/spec.json':'f'.repeat(64)}}).errors.join(' '),/observed artifact missing or changed/);
});
test('release artifact list must exactly match the locked production build',()=>{
  assert.match(run({manifest:{...manifest,artifacts:[manifest.artifacts[0]]}}).errors.join(' '),/exactly cover/);
  assert.match(run({manifest:{...manifest,artifacts:[...manifest.artifacts,{path:'extra.js',sha256:'f'.repeat(64)}]}}).errors.join(' '),/exactly cover/);
});
test('article, chart, data, and policy changes invalidate the release pins',()=>{
  for(const key of Object.keys(pins)){const changed={...pins,[key]:'f'.repeat(64)};assert.match(run({currentPins:changed}).errors.join(' '),/version pins are stale or changed/);}
});
test('stale or tampered human approval packet is rejected',()=>{
  const changed=sealHumanApprovalPacket({...approval,approvedVersionPins:{...pins,dataHash:'f'.repeat(64)}});
  assert.match(run({approvalPacket:changed,manifest:{...manifest,humanApprovalPacketHash:changed.packetHash}}).errors.join(' '),/approval packet is stale/);
  assert.match(run({approvalPacket:{...approval,approverId:'tampered'}}).errors.join(' '),/approval packet hash is invalid/);
});
test('approval records without provenance are rejected',()=>{
  const missing=sealHumanApprovalPacket({...approval,provenance:''});assert.match(run({approvalPacket:missing,manifest:{...manifest,humanApprovalPacketHash:missing.packetHash}}).errors.join(' '),/provenance is required/);
});
test('release manifest must bind the exact human approval packet hash',()=>assert.match(run({manifest:{...manifest,humanApprovalPacketHash:'f'.repeat(64)}}).errors.join(' '),/does not match release manifest/));
test('rollback passes only with a prior manifest plus a matching verification receipt',()=>{
  const prior=run();const rollbackManifest={...manifest,releaseId:'rollback-fixture-1',intent:'ROLLBACK_DRY_RUN'};
  const rollback={targetReleaseId:prior.releaseId,targetManifestSha256:prior.verificationReceipt.manifestHash,targetBuildManifestSha256:prior.buildManifestSha256,verifiedPriorManifest:{manifest,receipt:prior.verificationReceipt}};
  const r=validateReleaseDryRun({manifest:rollbackManifest,buildManifestBytes,observedArtifacts,currentPins:pins,approvalPacket:approval,rollback});assert.equal(r.status,'DRY_RUN_VALIDATION_PASS');assert.equal(r.intent,'ROLLBACK_DRY_RUN');
});
test('rollback without an already verified prior manifest is rejected',()=>{
  const r=run({manifest:{...manifest,intent:'ROLLBACK_DRY_RUN'},rollback:{targetReleaseId:'old'}});assert.match(r.errors.join(' '),/already verified prior manifest/);
});
test('rollback target manifest and build hashes must both match',()=>{
  const prior=run(),rollbackManifest={...manifest,releaseId:'rollback-fixture-2',intent:'ROLLBACK_DRY_RUN'};
  const base={verifiedPriorManifest:{manifest,receipt:prior.verificationReceipt},targetReleaseId:manifest.releaseId,targetManifestSha256:prior.verificationReceipt.manifestHash,targetBuildManifestSha256:buildHash};
  assert.match(run({manifest:rollbackManifest,rollback:{...base,targetManifestSha256:'f'.repeat(64)}}).errors.join(' '),/rollback manifest hash mismatch/);
  assert.match(run({manifest:rollbackManifest,rollback:{...base,targetBuildManifestSha256:'f'.repeat(64)}}).errors.join(' '),/rollback build manifest hash mismatch/);
});
test('tampered prior manifest invalidates its rollback verification receipt',()=>{
  const prior=run(),tampered={...manifest,versionPins:{...pins,policyHash:'f'.repeat(64)}};
  const rollbackManifest={...manifest,releaseId:'rollback-fixture-3',intent:'ROLLBACK_DRY_RUN'};
  const rollback={targetReleaseId:manifest.releaseId,targetManifestSha256:prior.verificationReceipt.manifestHash,targetBuildManifestSha256:buildHash,verifiedPriorManifest:{manifest:tampered,receipt:prior.verificationReceipt}};
  assert.match(run({manifest:rollbackManifest,rollback}).errors.join(' '),/prior rollback manifest is not already verified/);
});
test('rollback target is not accepted for ordinary release intent',()=>assert.match(run({rollback:{targetReleaseId:'unused'}}).errors.join(' '),/not valid for RELEASE_DRY_RUN/));
