import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonical} from '../workflow/review-protocol.mjs';
import {sealHumanApprovalPacket,validateReleaseDryRun} from '../release/contract.mjs';

const root=path.resolve('work/repro-a');
const manifestPath=path.join(root,'build-manifest.json');
if(!fs.existsSync(manifestPath))throw new Error('reproducible production build is missing; run the build stage first');
const buildManifestBytes=fs.readFileSync(manifestPath);
const buildManifest=JSON.parse(buildManifestBytes.toString('utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const artifactHashes={};
for(const file of buildManifest.files){const bytes=fs.readFileSync(path.join(root,file.path));artifactHashes[file.path]=sha(bytes);}
const hashFile=relative=>sha(fs.readFileSync(path.join(root,relative)));
const versionPins={
  articleHash:hashFile('index.html'),
  chartHash:hashFile('charts/chart-spec.js'),
  dataHash:hashFile('charts/specs/legacy-curia-fixture.json'),
  policyHash:hashFile('content/media-policy.json')
};
const approvalPacket=sealHumanApprovalPacket({
  approvalPacketId:'synthetic-qa-approval',
  reviewPacketHash:sha(Buffer.from(canonical({fixture:'synthetic-qa-review-packet',versionPins}))),
  reviewProtocolStatus:'READY_FOR_HUMAN_RELEASE_REVIEW',
  decision:'APPROVE_FOR_DRY_RUN',
  approverId:'synthetic-qa-fixture-only',
  approvedVersionPins:versionPins,
  createdAt:'2026-10-10T00:00:00.000Z',
  evidenceRef:'SYNTHETIC_QA_FIXTURE_ONLY',
  provenance:'SYNTHETIC_QA_FIXTURE'
});
const manifest={
  releaseId:`diagnostic-${sha(buildManifestBytes).slice(0,16)}`,
  intent:'RELEASE_DRY_RUN',
  releaseGate:'READY_FOR_DRY_RUN',
  buildManifestSha256:sha(buildManifestBytes),
  artifacts:buildManifest.files.map(({path,sha256})=>({path,sha256})),
  versionPins,
  humanApprovalPacketHash:approvalPacket.packetHash
};
const validation=validateReleaseDryRun({manifest,buildManifestBytes,observedArtifacts:artifactHashes,currentPins:versionPins,approvalPacket});
const report={...validation,syntheticApprovalFixture:true,evidenceBasis:'Exact bytes from the local reproducible build and repository lock files; approval record is synthetic and does not assert that a human reviewed or approved this release.',inputBuildManifest:'work/repro-a/build-manifest.json',artifactCount:buildManifest.files.length,approvalProvenance:approvalPacket.provenance};
fs.mkdirSync('work',{recursive:true});
fs.writeFileSync('work/release-dry-run.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(validation.status!=='DRY_RUN_VALIDATION_PASS')process.exitCode=1;
