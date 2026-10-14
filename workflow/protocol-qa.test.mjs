import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateReviewPacket,sealReviewPacket} from './review-protocol.mjs';
import {simulateDailySchedule} from './daily-scheduler.mjs';

const identityRegistryVersion='identity-registry-v1';
const versions={articleId:'article-1',contentHash:'a'.repeat(64),chartHash:'b'.repeat(64),dataHash:'c'.repeat(64),rubricVersion:'rubric-3',policyHash:'d'.repeat(64),identityRegistryVersion};
const writerIdentityRecord={identityId:'writer-1',registryVersion:identityRegistryVersion,registryStatus:'VERIFIED',registryEvidenceRef:'identity:writer-1:v1',modelFamilyId:'family-writer',modelFamilyEvidenceRef:'family-evidence:writer-1'};
const packet=sealReviewPacket({...versions,authorId:'writer-1',writerIdentityRecord});
const registry=['fact-check','rebuttal','data-risk','legal-ethics-risk','editorial'].map((role,i)=>({reviewerId:`reviewer-${i+1}`,allowedRoles:[role],registryStatus:'VERIFIED',registryEvidenceRef:`registry:${role}:2026-01`}));
const identityRegistry=registry.map((r,i)=>({identityId:r.reviewerId,registryVersion:identityRegistryVersion,registryStatus:'VERIFIED',registryEvidenceRef:`identity:${r.reviewerId}:v1`,modelFamilyId:`family-${i+1}`,modelFamilyEvidenceRef:`family-evidence:${i+1}`}));
const reviews=registry.map(r=>({role:r.allowedRoles[0],reviewerId:r.reviewerId,decision:'approve',independent:true,independenceEvidenceRef:r.registryEvidenceRef,claimIds:['claim-1']}));
const claims=[{claimId:'claim-1',text:'Synthetic claim for contract testing.',evidenceRefs:[{sourceHash:'e'.repeat(64),snapshotId:'snapshot-1',rowLocator:'row 2, field value'}]}];
const current={...versions};
const review=(overrides={})=>evaluateReviewPacket({packet,registry,identityRegistry,reviews,claims,current,...overrides});

test('version-bound protocol returns only a human-release-review-ready result',()=>{
  const r=review();assert.equal(r.status,'READY_FOR_HUMAN_RELEASE_REVIEW');assert.equal(r.releaseAuthorized,false);assert.equal(r.modelCalled,false);assert.equal(r.packetHash,packet.packetHash);
});
test('writer cannot occupy an independent reviewer role',()=>{
  const bad=structuredClone(reviews);bad[0].reviewerId='writer-1';assert.match(review({reviews:bad}).errors.join(' '),/not independent/);
});
test('reviewer independence claim requires matching registry evidence',()=>{
  const bad=structuredClone(reviews);bad[1].independenceEvidenceRef='unverifiable';assert.match(review({reviews:bad}).errors.join(' '),/registry evidence/);
});
test('all five distinct protocol roles are required',()=>{
  assert.match(review({reviews:reviews.slice(0,4)}).errors.join(' '),/missing required review role: editorial/);
});
test('review roles cannot be reused by one reviewer identity',()=>{
  const bad=structuredClone(reviews);bad[1].reviewerId=bad[0].reviewerId;assert.match(review({reviews:bad}).errors.join(' '),/not independent/);
});
test('each important claim needs exact evidence references',()=>{
  const bad=structuredClone(claims);bad[0].evidenceRefs=[];assert.match(review({claims:bad}).errors.join(' '),/lacks explicit evidence/);
});
test('a majority cannot clear an unresolved critical contradiction',()=>{
  const bad=structuredClone(reviews);bad[0].flags=[{severity:'critical',kind:'contradiction',resolved:false}];const r=review({reviews:bad});assert.equal(r.status,'HOLD');assert.match(r.errors.join(' '),/overrides reviewer majority/);
});
test('a high-risk unresolved flag forces HOLD',()=>{
  const bad=structuredClone(reviews);bad[2].flags=[{severity:'high',kind:'risk',resolved:false}];assert.equal(review({reviews:bad}).status,'HOLD');
});
test('content edits invalidate a previously ready review packet',()=>{
  const r=review({current:{...current,contentHash:'f'.repeat(64)},priorApproval:{packetHash:packet.packetHash,releaseAuthorized:false}});assert.equal(r.status,'HOLD');assert.match(r.errors.join(' '),/version changed/);
});
test('data, policy, rubric, chart, or article edits each invalidate the version lock',()=>{
  for(const key of Object.keys(current)){const changed={...current,[key]:`${current[key]}-changed`};assert.equal(review({current:changed}).status,'HOLD',key);}
});
test('tampered packet hash and prior approval from another packet fail closed',()=>{
  const tampered={...packet,packetHash:'0'.repeat(64)};assert.equal(evaluateReviewPacket({packet:tampered,registry,reviews,claims,current}).status,'HOLD');
  assert.match(review({priorApproval:{packetHash:'0'.repeat(64),releaseAuthorized:false}}).errors.join(' '),/approval invalidated/);
});
test('a reviewer HOLD prevents handoff readiness regardless of majority',()=>{
  const bad=structuredClone(reviews);bad[0].decision='hold';assert.equal(review({reviews:bad}).status,'HOLD');
});
test('protocol rejects malformed collections and contains no model/transport invocation',()=>{
  const r=review({registry:{},identityRegistry:null,reviews:null,claims:{}});assert.equal(r.status,'HOLD');assert.equal(r.releaseAuthorized,false);assert.equal(r.modelCalled,false);
  const source=fs.readFileSync(new URL('./review-protocol.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|child_process|openai\.com|anthropic\.com/);
});
test('writer requires a separately versioned verified identity and model-family record',()=>{
  const missing={...packet,writerIdentityRecord:{...writerIdentityRecord,modelFamilyEvidenceRef:''}};assert.match(evaluateReviewPacket({packet:missing,registry,identityRegistry,reviews,claims,current}).errors.join(' '),/writer identity\/model-family registry/);
});
test('fact-check and rebuttal model families must differ from writer and one another',()=>{
  const sameWriter=identityRegistry.map(r=>r.identityId==='reviewer-1'?{...r,modelFamilyId:'family-writer'}:r);
  assert.match(review({identityRegistry:sameWriter}).errors.join(' '),/model-family ID is duplicated/);
  const samePeer=identityRegistry.map(r=>r.identityId==='reviewer-2'?{...r,modelFamilyId:'family-1'}:r);
  assert.match(review({identityRegistry:samePeer}).errors.join(' '),/model-family ID is duplicated/);
});
test('unversioned or missing reviewer family provenance fails closed',()=>{
  const bad=identityRegistry.map(r=>r.identityId==='reviewer-3'?{...r,registryVersion:'old-version'}:r);assert.match(review({identityRegistry:bad}).errors.join(' '),/model-family provenance missing or invalid/);
  const missing=identityRegistry.filter(r=>r.identityId!=='reviewer-2');assert.match(review({identityRegistry:missing}).errors.join(' '),/model-family provenance missing or invalid/);
});

const candidates=(n=20)=>Array.from({length:n},(_,i)=>({topicId:`topic-${String(i+1).padStart(2,'0')}`,title:`Synthetic topic ${i+1}`,angle:'test-only',approval:'APPROVED',topicEligible:true,priority:n-i}));
const lanes=[{id:'free-a',quotaGroup:'group-a',freeEligible:true,paid:false,enabled:true,quota:10,version:'v1'},{id:'free-b',quotaGroup:'group-a',freeEligible:true,paid:false,enabled:true,quota:10,version:'v1'},{id:'paid-x',quotaGroup:'paid',freeEligible:false,paid:true,enabled:true,quota:99,version:'v1'}];
const groups=[{id:'group-a',dailyQuota:15},{id:'paid',dailyQuota:99}];
const simulate=(overrides={})=>simulateDailySchedule({date:'2026-10-10',candidates:candidates(),lanes,quotaGroups:groups,...overrides});

test('daily simulator schedules 15 unique approved topics on free-eligible lanes only',()=>{
  const r=simulate();assert.equal(r.status,'DRY_RUN');assert.equal(r.selected,15);assert.equal(r.jobs.length,15);assert.ok(r.jobs.every(j=>j.laneId==='free-a'||j.laneId==='free-b'));assert.equal(r.paidFallbackUsed,false);assert.equal(r.dispatchEnabled,false);assert.equal(r.externalCalls,0);
});
test('duplicate topics collapse deterministically and rejected candidates are excluded',()=>{
  const c=candidates(16);c.push({...c[0],title:'duplicate angle'});c.push({...c[1],topicId:'rejected',approval:'REJECTED'});const r=simulate({candidates:c});assert.equal(r.selected,15);assert.deepEqual(r.duplicateCandidateIds,['topic-01']);assert.ok(!r.jobs.some(j=>j.topicId==='rejected'));
});
test('quota exhaustion reports shortfall without relaxing approval or buying paid capacity',()=>{
  const r=simulate({lanes:[{...lanes[0],quota:4}],quotaGroups:[{id:'group-a',dailyQuota:8}]});assert.equal(r.selected,15);assert.equal(r.shortfall,11);assert.equal(r.jobs.filter(j=>j.status==='SHORTFALL').length,11);assert.equal(r.paidFallbackUsed,false);
});
test('fewer than 15 approved unique candidates reports the unmet target',()=>{
  const r=simulate({candidates:candidates(9)});assert.equal(r.selected,9);assert.equal(r.unfilledSlots,6);assert.equal(r.shortfall,6);
});
test('same-day rerun reuses idempotency keys and prior work',()=>{
  const first=simulate({target:3}),second=simulate({target:3,existingJobs:first.jobs});assert.deepEqual(second.jobs.map(j=>j.idempotencyKey),first.jobs.map(j=>j.idempotencyKey));assert.ok(second.jobs.every(j=>j.reused));
});
test('a prior paid-lane completion cannot satisfy a free-lane schedule or be reused',()=>{
  const prior=simulate({target:1}).jobs[0];const paid={...prior,status:'COMPLETED',laneId:'paid-x',laneVersion:'v1',quotaReservations:[{laneId:'paid-x',laneVersion:'v1'}]};
  const r=simulate({target:1,existingJobs:[paid]});assert.equal(r.jobs[0].status,'SCHEDULED');assert.equal(r.jobs[0].reused,false);assert.equal(r.completed,0);assert.equal(r.staleExisting[0].reason.includes('paid'),true);
});
test('disabled, unknown, and outdated prior lane reservations are stale',()=>{
  const prior=simulate({target:1}).jobs[0];
  const disabledLanes=lanes.map(l=>l.id===prior.laneId?{...l,enabled:false}:l);
  const cases=[
    {existingJobs:[{...prior,quotaReservations:[{laneId:prior.laneId,laneVersion:'old'}]}]},
    {existingJobs:[{...prior,laneId:'unknown',laneVersion:'v1',quotaReservations:[{laneId:'unknown',laneVersion:'v1'}]}]},
    {existingJobs:[prior],lanes:disabledLanes}
  ];
  for(const args of cases){const r=simulate({target:1,...args});assert.equal(r.jobs[0].reused,false);assert.equal(r.staleExisting.length,1);}
});
test('late duplicate 429 after success cannot reopen or duplicate a completed job',()=>{
  const first=simulate({target:1}),job=first.jobs[0];const r=simulate({target:1,events:[{eventId:'e-success',idempotencyKey:job.idempotencyKey,laneId:job.laneId,laneVersion:job.laneVersion,attempt:1,outcome:'success'},{eventId:'e-late',idempotencyKey:job.idempotencyKey,laneId:job.laneId,laneVersion:job.laneVersion,attempt:1,outcome:'429'}]});assert.equal(r.completed,1);assert.equal(r.jobs[0].status,'COMPLETED');assert.match(r.ignoredEvents[0].reason,/already completed/);
});
test('429 retries once on another free lane under quota and keeps deterministic identity',()=>{
  const first=simulate({target:1}),job=first.jobs[0];const r=simulate({target:1,events:[{eventId:'e-429',idempotencyKey:job.idempotencyKey,laneId:job.laneId,laneVersion:job.laneVersion,attempt:1,outcome:'429'}]});assert.equal(r.jobs[0].attempts,2);assert.notEqual(r.jobs[0].laneId,job.laneId);assert.equal(r.paidFallbackUsed,false);
});
test('stale lane versions and stale attempts are ignored',()=>{
  const job=simulate({target:1}).jobs[0];const r=simulate({target:1,events:[{eventId:'stale',idempotencyKey:job.idempotencyKey,laneId:job.laneId,laneVersion:'old-version',attempt:1,outcome:'success'}]});assert.equal(r.completed,0);assert.match(r.ignoredEvents[0].reason,/stale lane version/);
});
test('duplicate 429 result for the same attempt is idempotently ignored',()=>{
  const job=simulate({target:1}).jobs[0];const event={idempotencyKey:job.idempotencyKey,laneId:job.laneId,laneVersion:job.laneVersion,attempt:1,outcome:'429'};const r=simulate({target:1,events:[{...event,eventId:'first'},{...event,eventId:'late-copy'}]});assert.equal(r.jobs[0].attempts,2);assert.match(r.ignoredEvents[0].reason,/late duplicate/);
});
test('exhausted retry lanes become shortfall and never use paid fallback',()=>{
  const oneLane=[{...lanes[0],quota:1}];const job=simulate({target:1,lanes:oneLane,quotaGroups:[{id:'group-a',dailyQuota:1}]}).jobs[0];const r=simulate({target:1,lanes:oneLane,quotaGroups:[{id:'group-a',dailyQuota:1}],events:[{eventId:'e429',idempotencyKey:job.idempotencyKey,laneId:job.laneId,laneVersion:job.laneVersion,attempt:1,outcome:'429'}]});assert.equal(r.jobs[0].status,'SHORTFALL');assert.equal(r.shortfall,1);assert.match(r.jobs[0].reason,/paid fallback prohibited/);assert.equal(r.paidFallbackUsed,false);
});
test('changed candidate version generates a new key and reports stale previous record',()=>{
  const original=simulate({target:1}).jobs[0],changed=candidates(1).map(c=>({...c,title:'Updated candidate version'}));const r=simulate({target:1,candidates:changed,existingJobs:[original]});assert.notEqual(r.jobs[0].idempotencyKey,original.idempotencyKey);assert.equal(r.staleExisting.length,1);assert.match(r.staleExisting[0].reason,/stale/);
});
test('invalid paid-only lane setup does not silently become schedulable capacity',()=>{
  const r=simulate({lanes:[lanes[2]],quotaGroups:groups});assert.equal(r.selected,15);assert.equal(r.shortfall,15);assert.ok(r.jobs.every(j=>j.status==='SHORTFALL'));assert.equal(r.paidFallbackUsed,false);
});
test('malformed lane, event, or existing-job collections fail closed',()=>{
  assert.equal(simulate({lanes:[null]}).status,'INVALID');assert.equal(simulate({events:[null]}).status,'INVALID');assert.equal(simulate({existingJobs:[null]}).status,'INVALID');
  const source=fs.readFileSync(new URL('./daily-scheduler.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|child_process|openai\.com|anthropic\.com/);
});
