const TOP_REQUIRED=['topic','run_id','max_concurrency','max_attempts_per_lane','timeout_per_lane','retry_failed','lanes'];
const LANE_REQUIRED=['id','quota_group','workdir','taskbook','artifact_type','task','donemark'];
const nonempty=value=>typeof value==='string'&&value.trim().length>0;

/** Validate only documented manifest structure. This never dispatches a task. */
export function validateManifestObject(value){
  const errors=[];
  if(!value||typeof value!=='object'||Array.isArray(value))return {status:'INVALID',errors:['manifest must be an object'],dispatchEnabled:false};
  for(const key of TOP_REQUIRED)if(!(key in value))errors.push(`missing top-level field: ${key}`);
  for(const key of ['topic','run_id'])if(key in value&&!nonempty(value[key]))errors.push(`${key} must be a non-empty string`);
  if('max_concurrency' in value&&(!Number.isInteger(value.max_concurrency)||value.max_concurrency<1||value.max_concurrency>10))errors.push('max_concurrency must be an integer from 1 through 10');
  if('max_attempts_per_lane' in value&&(!Number.isInteger(value.max_attempts_per_lane)||value.max_attempts_per_lane<1))errors.push('max_attempts_per_lane must be a positive integer');
  if('timeout_per_lane' in value){
    const t=value.timeout_per_lane;
    const validNumber=typeof t==='number'&&Number.isFinite(t)&&t>0;
    const validString=nonempty(t)&&/^[1-9]\d*(?:s|m|h)?$/.test(t.trim());
    if(!validNumber&&!validString)errors.push('timeout_per_lane must be a positive number or a positive integer with optional s/m/h suffix; units are not live-verified');
  }
  if('retry_failed' in value&&typeof value.retry_failed!=='boolean')errors.push('retry_failed must be boolean');
  if('lanes' in value&&(!Array.isArray(value.lanes)||value.lanes.length===0))errors.push('lanes must be a non-empty array');
  if(Array.isArray(value.lanes)){
    const ids=new Set();
    value.lanes.forEach((lane,index)=>{
      const prefix=`lanes[${index}]`;
      if(!lane||typeof lane!=='object'||Array.isArray(lane)){errors.push(`${prefix} must be an object`);return;}
      for(const key of LANE_REQUIRED)if(!(key in lane))errors.push(`${prefix} missing field: ${key}`);
      for(const key of ['id','quota_group','workdir','taskbook','artifact_type','task','donemark'])if(key in lane&&!nonempty(lane[key]))errors.push(`${prefix}.${key} must be a non-empty string`);
      if(nonempty(lane.id)){if(ids.has(lane.id))errors.push(`${prefix}.id must be unique: ${lane.id}`);ids.add(lane.id);}
      if(typeof lane.task==='string'&&/[\r\n]/.test(lane.task))errors.push(`${prefix}.task must be a single line`);
    });
  }
  return {status:errors.length?'INVALID':'LOCAL_STRUCTURE_VALID',errors,dispatchEnabled:false};
}

export const documentedManifestFields=Object.freeze({topLevel:[...TOP_REQUIRED],lane:[...LANE_REQUIRED],status:'DOCUMENTED_NOT_LIVE_VERIFIED'});
