import {createHash} from 'node:crypto';
import {canonical} from '../workflow/review-protocol.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const canonicalHash=value=>sha256(canonical(value));
const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function sealHumanApprovalPacket(packet){
  const locked={approvalPacketId:packet.approvalPacketId,reviewPacketHash:packet.reviewPacketHash,reviewProtocolStatus:packet.reviewProtocolStatus,decision:packet.decision,approverId:packet.approverId,approvedVersionPins:packet.approvedVersionPins,createdAt:packet.createdAt,evidenceRef:packet.evidenceRef,provenance:packet.provenance};
  return {...packet,packetHash:canonicalHash(locked)};
}

/** Validate local release/rollback manifests only. No deploy or publish capability is exposed. */
export function validateReleaseDryRun({manifest,buildManifestBytes,observedArtifacts,currentPins,approvalPacket,knownReleaseIds=[],rollback=null}){
  const errors=[];
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))return report(['manifest must be an object']);
  const required=['releaseId','intent','releaseGate','buildManifestSha256','artifacts','versionPins','humanApprovalPacketHash'];
  for(const key of required)if(!(key in manifest))errors.push(`manifest.${key} is required`);
  if(typeof manifest.releaseId!=='string'||!manifest.releaseId.trim())errors.push('manifest.releaseId must be non-empty');
  if((knownReleaseIds||[]).includes(manifest.releaseId))errors.push(`duplicate release ID: ${manifest.releaseId}`);
  if(manifest.releaseGate==='HOLD')errors.push('release manifest is HOLD');
  else if(manifest.releaseGate!=='READY_FOR_DRY_RUN')errors.push('releaseGate must be READY_FOR_DRY_RUN');
  if(!['RELEASE_DRY_RUN','ROLLBACK_DRY_RUN'].includes(manifest.intent))errors.push('intent must be RELEASE_DRY_RUN or ROLLBACK_DRY_RUN');
  if(!Buffer.isBuffer(buildManifestBytes)&&typeof buildManifestBytes!=='string')errors.push('buildManifestBytes must contain exact build-manifest bytes');
  let buildManifest=null,buildHash=null;
  if(Buffer.isBuffer(buildManifestBytes)||typeof buildManifestBytes==='string'){
    const bytes=Buffer.isBuffer(buildManifestBytes)?buildManifestBytes:Buffer.from(buildManifestBytes,'utf8');
    buildHash=sha256(bytes);
    try{buildManifest=JSON.parse(bytes.toString('utf8'));}catch{errors.push('build manifest bytes are not valid JSON');}
  }
  if(!isHash(manifest.buildManifestSha256)||manifest.buildManifestSha256!==buildHash)errors.push('build manifest hash mismatch');
  const buildFiles=Array.isArray(buildManifest?.files)?buildManifest.files:[];
  if(!buildManifest||buildFiles.length===0)errors.push('build manifest has no file records');
  const paths=new Set();
  for(const file of buildFiles){
    if(!file||typeof file.path!=='string'||!isHash(file.sha256)){errors.push('build manifest contains an invalid file record');continue;}
    if(paths.has(file.path))errors.push(`duplicate build artifact path: ${file.path}`);paths.add(file.path);
  }
  if(!Array.isArray(manifest.artifacts))errors.push('manifest.artifacts must be an array');
  else{
    const releaseFiles=new Map(manifest.artifacts.filter(a=>a&&typeof a.path==='string').map(a=>[a.path,a.sha256]));
    if(releaseFiles.size!==manifest.artifacts.length||releaseFiles.size!==buildFiles.length)errors.push('release artifact list must exactly cover the build manifest');
    for(const file of buildFiles)if(releaseFiles.get(file.path)!==file.sha256)errors.push(`release artifact does not match build manifest: ${file.path}`);
    const observed=observedArtifacts instanceof Map?observedArtifacts:new Map(Object.entries(observedArtifacts||{}));
    for(const file of buildFiles)if(observed.get(file.path)!==file.sha256)errors.push(`observed artifact missing or changed: ${file.path}`);
  }
  const pinKeys=['articleHash','chartHash','dataHash','policyHash'];
  if(!manifest.versionPins||typeof manifest.versionPins!=='object')errors.push('manifest.versionPins is required');
  else for(const key of pinKeys)if(!isHash(manifest.versionPins[key]))errors.push(`manifest.versionPins.${key} must be a SHA-256 hash`);
  if(!currentPins||canonical(manifest.versionPins)!==canonical(currentPins))errors.push('release version pins are stale or changed');
  if(!approvalPacket||typeof approvalPacket!=='object')errors.push('human approval packet is missing');
  else{
    const sealed=sealHumanApprovalPacket(approvalPacket);
    if(approvalPacket.packetHash!==sealed.packetHash)errors.push('human approval packet hash is invalid or changed');
    if(manifest.humanApprovalPacketHash!==approvalPacket.packetHash)errors.push('human approval packet hash does not match release manifest');
    if(approvalPacket.reviewProtocolStatus==='HOLD'||approvalPacket.decision==='HOLD')errors.push('review or human approval packet is HOLD');
    if(approvalPacket.reviewProtocolStatus!=='READY_FOR_HUMAN_RELEASE_REVIEW'||approvalPacket.decision!=='APPROVE_FOR_DRY_RUN')errors.push('human approval packet is not ready for dry-run validation');
    if(!approvalPacket.approverId||!approvalPacket.evidenceRef)errors.push('human approval packet lacks approver or evidence reference');
    if(!approvalPacket.provenance)errors.push('human approval packet provenance is required');
    if(canonical(approvalPacket.approvedVersionPins)!==canonical(currentPins))errors.push('human approval packet is stale for current article/chart/data/policy versions');
  }
  if(manifest.intent==='ROLLBACK_DRY_RUN'){
    if(!rollback||typeof rollback!=='object')errors.push('rollback target is required');
    else validateRollback(rollback,errors);
  }else if(rollback)errors.push('rollback target is not valid for RELEASE_DRY_RUN');
  if(errors.length)return report(errors,manifest,buildHash);
  const manifestHash=canonicalHash(manifest);
  return {reportType:'LOCAL_RELEASE_SAFETY_DRY_RUN',status:'DRY_RUN_VALIDATION_PASS',errors:[],manifestHash,buildManifestSha256:buildHash,releaseId:manifest.releaseId,intent:manifest.intent,releaseAuthorized:false,deployRequested:false,publishRequested:false,externalCalls:0,verificationReceipt:{validationStatus:'DRY_RUN_VALIDATION_PASS',manifestHash,buildManifestSha256:buildHash,releaseId:manifest.releaseId}};
}

function validateRollback(rollback,errors){
  const prior=rollback.verifiedPriorManifest;
  if(!prior||typeof prior!=='object'||!prior.manifest||!prior.receipt){errors.push('rollback requires an already verified prior manifest and receipt');return;}
  const actualHash=canonicalHash(prior.manifest);
  if(prior.receipt.validationStatus!=='DRY_RUN_VALIDATION_PASS'||prior.receipt.manifestHash!==actualHash||prior.receipt.releaseId!==prior.manifest.releaseId||prior.receipt.buildManifestSha256!==prior.manifest.buildManifestSha256)errors.push('prior rollback manifest is not already verified or its receipt is stale');
  if(rollback.targetReleaseId!==prior.manifest.releaseId)errors.push('rollback target release ID mismatch');
  if(rollback.targetManifestSha256!==actualHash)errors.push('rollback manifest hash mismatch');
  if(rollback.targetBuildManifestSha256!==prior.manifest.buildManifestSha256)errors.push('rollback build manifest hash mismatch');
}

function report(errors,manifest=null,buildHash=null){return {reportType:'LOCAL_RELEASE_SAFETY_DRY_RUN',status:'HOLD',errors,manifestHash:manifest?canonicalHash(manifest):null,buildManifestSha256:buildHash,releaseId:manifest?.releaseId||null,releaseAuthorized:false,deployRequested:false,publishRequested:false,externalCalls:0};}
