import {createHash} from 'node:crypto';
import {canonical} from './review-protocol.mjs';

const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');

/** Deterministic, offline-only daily schedule simulator. It has no transport or paid-lane adapter. */
export function simulateDailySchedule({date,target=15,candidates,lanes,quotaGroups,maxAttemptsPerTopic=2,existingJobs=[],events=[]}){
  const errors=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))errors.push('date must be YYYY-MM-DD');
  if(!Number.isInteger(target)||target<1)errors.push('target must be a positive integer');
  if(!Array.isArray(candidates)||!Array.isArray(lanes)||!Array.isArray(quotaGroups))errors.push('candidates, lanes, and quotaGroups must be arrays');
  if(!Array.isArray(existingJobs)||!Array.isArray(events))errors.push('existingJobs and events must be arrays');
  if(!Number.isInteger(maxAttemptsPerTopic)||maxAttemptsPerTopic<1)errors.push('maxAttemptsPerTopic must be positive');
  if(errors.length)return {status:'INVALID',errors,dispatchEnabled:false,paidFallbackUsed:false};
  if(lanes.some(l=>!l||typeof l!=='object'))errors.push('each lane must be an object');
  if(quotaGroups.some(g=>!g||typeof g!=='object'))errors.push('each quota group must be an object');
  if(errors.length)return {status:'INVALID',errors,dispatchEnabled:false,paidFallbackUsed:false};
  const groups=new Map(quotaGroups.map(g=>[g.id,g]));
  if(groups.size!==quotaGroups.length)errors.push('quota group IDs must be unique');
  const configuredLanes=new Map(lanes.filter(l=>l&&typeof l.id==='string').map(l=>[l.id,l]));
  if(configuredLanes.size!==lanes.length)errors.push('lane IDs must be unique and present');
  const freeLanes=lanes.filter(l=>l.freeEligible===true&&l.paid!==true&&l.enabled!==false).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(new Set(freeLanes.map(l=>l.id)).size!==freeLanes.length)errors.push('free lane IDs must be unique');
  for(const lane of freeLanes)if(typeof lane.id!=='string'||!lane.id||!groups.has(lane.quotaGroup)||!Number.isInteger(lane.quota)||lane.quota<0||typeof lane.version!=='string'||!lane.version)errors.push(`invalid free lane contract: ${lane.id}`);
  for(const group of quotaGroups)if(typeof group.id!=='string'||!group.id||!Number.isInteger(group.dailyQuota)||group.dailyQuota<0)errors.push(`invalid quota group: ${group.id||'(missing id)'}`);
  if(existingJobs.some(j=>!j||typeof j!=='object'))errors.push('each existing job must be an object');
  if(events.some(e=>!e||typeof e!=='object'))errors.push('each event must be an object');
  if(errors.length)return {status:'INVALID',errors,dispatchEnabled:false,paidFallbackUsed:false};
  const laneUsage=Object.fromEntries(freeLanes.map(l=>[l.id,0]));
  const groupUsage=Object.fromEntries(quotaGroups.map(g=>[g.id,0]));
  const available=lane=>laneUsage[lane.id]<lane.quota&&groupUsage[lane.quotaGroup]<groups.get(lane.quotaGroup).dailyQuota;
  const takeLane=()=>freeLanes.find(available)||null;
  const eligible=[];const duplicateCandidateIds=[];const seen=new Set();
  const sorted=[...candidates].filter(c=>c&&c.approval==='APPROVED'&&c.topicId&&c.topicEligible===true).sort((a,b)=>(b.priority||0)-(a.priority||0)||a.topicId.localeCompare(b.topicId));
  for(const candidate of sorted){if(seen.has(candidate.topicId)){duplicateCandidateIds.push(candidate.topicId);continue;}seen.add(candidate.topicId);eligible.push(candidate);}
  const old=new Map();const staleExisting=[];
  for(const prior of existingJobs.filter(j=>j.date===date)){
    const reservations=prior.quotaReservations||[{laneId:prior.laneId,laneVersion:prior.laneVersion}];
    let valid=typeof prior.idempotencyKey==='string'&&['SCHEDULED','COMPLETED'].includes(prior.status)&&Array.isArray(reservations)&&reservations.length>0;
    for(const reservation of Array.isArray(reservations)?reservations:[]){
      const laneId=typeof reservation==='string'?reservation:reservation?.laneId;
      const lane=configuredLanes.get(laneId);
      if(lane?.freeEligible===true&&lane.paid!==true&&groups.has(lane.quotaGroup)){
        groupUsage[lane.quotaGroup]++;
        if(laneUsage[lane.id]!==undefined)laneUsage[lane.id]++;
      }
      if(!lane||lane.freeEligible!==true||lane.paid===true||lane.enabled===false||lane.version!==(typeof reservation==='string'?null:reservation?.laneVersion))valid=false;
    }
    const finalReservation=Array.isArray(reservations)?reservations.at(-1):null;
    const finalLaneId=typeof finalReservation==='string'?finalReservation:finalReservation?.laneId;
    const finalLaneVersion=typeof finalReservation==='string'?null:finalReservation?.laneVersion;
    if(prior.laneId!==finalLaneId||prior.laneVersion!==finalLaneVersion)valid=false;
    if(valid)old.set(prior.idempotencyKey,prior);
    else staleExisting.push({topicId:prior.topicId||null,oldKey:prior.idempotencyKey||null,reason:'prior lane reservation is paid, disabled, unknown, or stale; prior result cannot be reused'});
  }
  const jobs=[];
  for(const candidate of eligible.slice(0,target)){
    const candidateHash=candidate.candidateHash||digest({topicId:candidate.topicId,title:candidate.title,angle:candidate.angle||''});
    const idempotencyKey=digest({date,topicId:candidate.topicId,candidateHash});
    const prior=old.get(idempotencyKey);
    if(prior){jobs.push({...prior,reused:true});continue;}
    const sameTopic=[...old.values()].find(j=>j.topicId===candidate.topicId&&j.idempotencyKey!==idempotencyKey);
    if(sameTopic)staleExisting.push({topicId:candidate.topicId,oldKey:sameTopic.idempotencyKey,newKey:idempotencyKey,reason:'candidate version changed; old approval/job is stale'});
    const lane=takeLane();
    if(!lane){jobs.push({date,topicId:candidate.topicId,candidateHash,idempotencyKey,status:'SHORTFALL',attempts:0,reused:false,reason:'free-eligible lane quota exhausted'});continue;}
    laneUsage[lane.id]++;groupUsage[lane.quotaGroup]++;
    jobs.push({date,topicId:candidate.topicId,candidateHash,idempotencyKey,status:'SCHEDULED',laneId:lane.id,laneVersion:lane.version,attempts:1,quotaReservations:[{laneId:lane.id,laneVersion:lane.version}],reused:false});
  }
  const seenEvents=new Set(),seenAttempts=new Set(),ignoredEvents=[];
  for(const event of events){
    const job=jobs.find(j=>j.idempotencyKey===event.idempotencyKey);
    if(!job){ignoredEvents.push({eventId:event.eventId,reason:'unknown idempotency key'});continue;}
    if(seenEvents.has(event.eventId)){ignoredEvents.push({eventId:event.eventId,reason:'duplicate event id'});continue;}
    seenEvents.add(event.eventId);
    if(job.status!=='SCHEDULED'){ignoredEvents.push({eventId:event.eventId,reason:`job already ${job.status.toLowerCase()}`});continue;}
    const attemptKey=`${event.idempotencyKey}:${event.attempt}:${event.laneId}`;
    if(seenAttempts.has(attemptKey)){ignoredEvents.push({eventId:event.eventId,reason:'late duplicate attempt result'});continue;}
    seenAttempts.add(attemptKey);
    if(event.laneId!==job.laneId||event.laneVersion!==job.laneVersion||event.attempt!==job.attempts){ignoredEvents.push({eventId:event.eventId,reason:'stale lane version or attempt'});continue;}
    if(event.outcome==='success'){job.status='COMPLETED';job.completedAt=event.completedAt||null;continue;}
    if(event.outcome!=='429'&&event.outcome!=='failure'){ignoredEvents.push({eventId:event.eventId,reason:'unsupported simulated outcome'});continue;}
    if(job.attempts>=maxAttemptsPerTopic){job.status='SHORTFALL';job.reason=`${event.outcome}; max attempts exhausted; paid fallback prohibited`;continue;}
    const retryLane=freeLanes.find(l=>l.id!==job.laneId&&available(l));
    if(!retryLane){job.status='SHORTFALL';job.reason=`${event.outcome}; no free quota remains; paid fallback prohibited`;continue;}
    laneUsage[retryLane.id]++;groupUsage[retryLane.quotaGroup]++;
    job.status='SCHEDULED';job.laneId=retryLane.id;job.laneVersion=retryLane.version;job.attempts++;job.quotaReservations=[...(job.quotaReservations||[]),{laneId:retryLane.id,laneVersion:retryLane.version}];
  }
  const selected=jobs.length;
  const shortfallTopics=jobs.filter(j=>j.status==='SHORTFALL').map(j=>j.topicId);
  const unfilledSlots=Math.max(0,target-selected);
  return {protocol:'OFFLINE_DAILY_SCHEDULER_DRY_RUN_V1',status:'DRY_RUN',date,target,eligibleUniqueCandidates:eligible.length,selected,completed:jobs.filter(j=>j.status==='COMPLETED').length,scheduled:jobs.filter(j=>j.status==='SCHEDULED').length,shortfall:shortfallTopics.length+unfilledSlots,shortfallTopics,unfilledSlots,duplicateCandidateIds,staleExisting,quotaUsage:{lanes:laneUsage,groups:groupUsage},jobs,ignoredEvents,dispatchEnabled:false,paidFallbackUsed:false,externalCalls:0};
}
