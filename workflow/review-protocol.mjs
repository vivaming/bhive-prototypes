import {createHash} from 'node:crypto';

const REQUIRED_ROLES=['fact-check','rebuttal','data-risk','legal-ethics-risk','editorial'];
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export function sealReviewPacket(packet){
  const locked={articleId:packet.articleId,contentHash:packet.contentHash,chartHash:packet.chartHash,dataHash:packet.dataHash,rubricVersion:packet.rubricVersion,policyHash:packet.policyHash,identityRegistryVersion:packet.identityRegistryVersion,writerIdentityHash:hash(packet.writerIdentityRecord||null)};
  return {...packet,versionLock:locked,packetHash:hash(locked)};
}

export function evaluateReviewPacket({packet,registry,identityRegistry,reviews,claims,current,priorApproval=null}){
  const errors=[];
  if(!Array.isArray(registry))errors.push('registry must be an array');
  if(!Array.isArray(identityRegistry))errors.push('identityRegistry must be an array');
  if(!Array.isArray(reviews))errors.push('reviews must be an array');
  if(!Array.isArray(claims))errors.push('claims must be an array');
  const registryRows=Array.isArray(registry)?registry:[];
  const identityRows=Array.isArray(identityRegistry)?identityRegistry:[];
  const reviewRows=Array.isArray(reviews)?reviews:[];
  const claimRows=Array.isArray(claims)?claims:[];
  const required=['articleId','contentHash','chartHash','dataHash','rubricVersion','policyHash','identityRegistryVersion','writerIdentityRecord','authorId','versionLock','packetHash'];
  if(!packet||typeof packet!=='object')errors.push('packet must be an object');
  else for(const key of required)if(!(key in packet))errors.push(`packet.${key} is required`);
  if(!packet||typeof packet!=='object'||errors.some(e=>['registry must be an array','identityRegistry must be an array','reviews must be an array','claims must be an array'].includes(e)))return result('HOLD',errors,packet?.packetHash);
  const expected=sealReviewPacket(packet);
  if(packet.packetHash!==expected.packetHash||canonical(packet.versionLock)!==canonical(expected.versionLock))errors.push('packet hash/version lock is invalid');
  const expectedCurrent={articleId:packet.articleId,contentHash:packet.contentHash,chartHash:packet.chartHash,dataHash:packet.dataHash,rubricVersion:packet.rubricVersion,policyHash:packet.policyHash,identityRegistryVersion:packet.identityRegistryVersion};
  if(!current||canonical(expectedCurrent)!==canonical(current))errors.push('content, chart, data, rubric, or policy version changed; prior review is stale');
  if(priorApproval&&(priorApproval.packetHash!==packet.packetHash||priorApproval.releaseAuthorized!==false))errors.push('prior approval does not match the locked packet; approval invalidated');

  const registryById=new Map(registryRows.filter(r=>r&&typeof r==='object').map(r=>[r.reviewerId,r]));
  const identityById=new Map(identityRows.filter(r=>r&&typeof r==='object').map(r=>[r.identityId,r]));
  if(identityById.size!==identityRows.length)errors.push('identity registry IDs must be unique and records must be objects');
  const writer=packet.writerIdentityRecord;
  if(!writer||writer.identityId!==packet.authorId||writer.registryStatus!=='VERIFIED'||writer.registryVersion!==packet.identityRegistryVersion||!writer.registryEvidenceRef||!writer.modelFamilyId||!writer.modelFamilyEvidenceRef)errors.push('writer identity/model-family registry record is missing, unverified, or unversioned');
  const familyOwners=new Map();
  if(writer?.modelFamilyId)familyOwners.set(writer.modelFamilyId,writer.identityId);
  const seenRoles=new Set(),seenPeople=new Set([packet.authorId]);
  for(const review of reviewRows){
    if(!review||typeof review!=='object'){errors.push('each review must be an object');continue;}
    if(!REQUIRED_ROLES.includes(review.role)){errors.push(`unsupported review role: ${review.role}`);continue;}
    if(seenRoles.has(review.role))errors.push(`duplicate review role: ${review.role}`);seenRoles.add(review.role);
    if(seenPeople.has(review.reviewerId))errors.push(`reviewer is not independent from another assigned role: ${review.reviewerId}`);seenPeople.add(review.reviewerId);
    const entry=registryById.get(review.reviewerId);
    if(!entry||!entry.allowedRoles?.includes(review.role)||!entry.registryEvidenceRef||entry.registryStatus!=='VERIFIED')errors.push(`reviewer registry evidence missing or invalid for ${review.reviewerId}/${review.role}`);
    if(review.independent===true&&(!entry||review.independenceEvidenceRef!==entry.registryEvidenceRef))errors.push(`independence claim lacks matching registry evidence for ${review.reviewerId}`);
    const identity=identityById.get(review.reviewerId);
    if(!identity||identity.registryStatus!=='VERIFIED'||identity.registryVersion!==packet.identityRegistryVersion||!identity.registryEvidenceRef||!identity.modelFamilyId||!identity.modelFamilyEvidenceRef)errors.push(`model-family provenance missing or invalid for ${review.reviewerId}`);
    if(identity?.modelFamilyId){if(familyOwners.has(identity.modelFamilyId))errors.push(`model-family ID is duplicated: ${identity.modelFamilyId}`);else familyOwners.set(identity.modelFamilyId,identity.identityId);}
    if(!['approve','hold'].includes(review.decision))errors.push(`invalid decision for ${review.role}`);
    if(!Array.isArray(review.claimIds)||review.claimIds.length===0)errors.push(`${review.role} review must name reviewed claims`);
    if(review.decision==='hold')errors.push(`${review.role} review is HOLD`);
  }
  for(const role of REQUIRED_ROLES)if(!seenRoles.has(role))errors.push(`missing required review role: ${role}`);
  const claimIds=new Set(claimRows.filter(c=>c&&typeof c==='object').map(c=>c.claimId));
  if(claimIds.size!==claimRows.length)errors.push('claim IDs must be unique and claims must be objects');
  for(const claim of claimRows){
    if(!claim||typeof claim!=='object')continue;
    if(!claim.claimId||!claim.text)errors.push('each claim requires claimId and text');
    if(!Array.isArray(claim.evidenceRefs)||claim.evidenceRefs.length===0)errors.push(`claim ${claim.claimId} lacks explicit evidence references`);
    for(const ref of claim.evidenceRefs||[])if(!ref.sourceHash||!ref.snapshotId||!ref.rowLocator)errors.push(`claim ${claim.claimId} evidence reference is not exact`);
  }
  for(const review of reviewRows)if(review&&typeof review==='object')for(const id of review.claimIds||[])if(!claimIds.has(id))errors.push(`${review.role} review references unknown claim ${id}`);
  const flags=reviewRows.filter(r=>r&&typeof r==='object').flatMap(r=>Array.isArray(r.flags)?r.flags:[]);
  if(flags.some(f=>f.severity==='critical'&&f.kind==='contradiction'&&f.resolved!==true))errors.push('unresolved critical contradiction overrides reviewer majority');
  if(flags.some(f=>f.severity==='high'&&f.kind==='risk'&&f.resolved!==true))errors.push('unresolved high-risk flag overrides reviewer majority');
  if(errors.length)return result('HOLD',errors,packet.packetHash);
  return result('READY_FOR_HUMAN_RELEASE_REVIEW',[],packet.packetHash);
}

function result(status,errors,packetHash){return {protocol:'OFFLINE_REVIEW_HARNESS_V1',status,errors,packetHash:packetHash||null,releaseAuthorized:false,modelCalled:false};}
