import crypto from 'node:crypto';

export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const sha256=value=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
const refKey=ref=>`${ref?.snapshotId||''}/${ref?.rowId||''}/${ref?.field||''}`;
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9;
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
function rounded(value,precision){return Number(value.toFixed(precision));}

export function calculateTransform(transform,bundle){
  const rows=new Map(bundle.snapshot.rows.map(r=>[r.rowId,r]));
  const refs=transform.inputs||[];
  if(!['sum','difference','percentage_points','percent_change'].includes(transform.type))throw new Error(`Unsupported transform ${transform.type}`);
  if(!refs.length)throw new Error(`${transform.id}: no inputs`);
  const values=refs.map(ref=>{
    const row=rows.get(ref.rowId),value=row?.fields?.[ref.field];
    if(!row||!Number.isFinite(value))throw new Error(`${transform.id}: missing numeric input ${ref.rowId}.${ref.field}`);
    return {value,unit:bundle.dataDictionary.find(d=>d.field===ref.field)?.unit};
  });
  const units=new Set(values.map(v=>v.unit));
  let value,unit;
  if(transform.type==='sum'){
    if(units.size!==1)throw new Error(`${transform.id}: cannot sum different units`);
    value=values.reduce((s,v)=>s+v.value,0);unit=values[0].unit;
  }else{
    if(values.length!==2)throw new Error(`${transform.id}: requires exactly two inputs`);
    if(units.size!==1)throw new Error(`${transform.id}: inputs have different units`);
    if(transform.type==='difference'){value=values[1].value-values[0].value;unit=transform.outputUnit;}
    if(transform.type==='percentage_points'){
      if(values[0].unit!=='%')throw new Error(`${transform.id}: percentage-point transform requires percent inputs`);
      value=values[1].value-values[0].value;unit='percentage points';
    }
    if(transform.type==='percent_change'){
      if(values[0].value<=0)throw new Error(`${transform.id}: percent-change baseline must be positive`);
      value=(values[1].value-values[0].value)/values[0].value*100;unit='%';
    }
  }
  if(transform.type==='difference'&&(!transform.outputUnit||transform.outputUnit!==values[0].unit))throw new Error(`${transform.id}: difference output unit must equal input unit`);
  const precision=Number.isInteger(transform.precision)?transform.precision:6;
  return {value:rounded(value,precision),unit,sourceRowIds:refs.map(r=>r.rowId)};
}

export function validateEvidenceBundle(bundle){
  const errors=[];const add=(path,message)=>errors.push({path,message});
  if(!bundle||typeof bundle!=='object')return {validationStatus:'FAIL',releaseGate:'HOLD',errors:[{path:'$',message:'bundle must be an object'}]};
  if(bundle.schemaVersion!==1)add('schemaVersion','must be 1');
  if(typeof bundle.bundleId!=='string'||!bundle.bundleId)add('bundleId','required');
  if(bundle.releaseGate!=='HOLD')add('releaseGate','offline contract fixtures must remain HOLD');
  if(!Array.isArray(bundle.sources)||!bundle.sources.length)add('sources','at least one source record required');
  if(!bundle.snapshot||!Array.isArray(bundle.snapshot.rows)||!bundle.snapshot.rows.length)add('snapshot.rows','non-empty locked row set required');
  const sourceMap=new Map((bundle.sources||[]).map(s=>[s.sourceId,s]));
  if(sourceMap.size!==(bundle.sources||[]).length)add('sources','source IDs must be unique');
  for(let i=0;i<(bundle.sources||[]).length;i++){
    const s=bundle.sources[i],p=`sources[${i}]`;
    if(!s.sourceId||!s.title)add(p,'sourceId and title are required');
    if(!['synthetic','official','research','news','other'].includes(s.kind))add(`${p}.kind`,'unsupported source kind');
    if(!iso(s.retrievedAt))add(`${p}.retrievedAt`,'must be an ISO UTC timestamp');
    if(s.kind==='synthetic'){
      if(s.url!==null)add(`${p}.url`,'synthetic source must not carry a real-world URL');
      if(!s.syntheticNotice)add(`${p}.syntheticNotice`,'synthetic provenance notice required');
    }else if(typeof s.url!=='string'||!/^https:\/\//.test(s.url))add(`${p}.url`,'non-synthetic sources require an HTTPS source URL');
    if(typeof s.rawSnapshotText!=='string'||!s.rawSnapshotText.trim())add(`${p}.rawSnapshotText`,'retained source snapshot text required');
    else if(sha256(s.rawSnapshotText)!==s.rawSnapshotSha256)add(`${p}.rawSnapshotSha256`,'does not match retained snapshot bytes');
  }
  const snap=bundle.snapshot||{};
  if(!sourceMap.has(snap.sourceId))add('snapshot.sourceId','must refer to a registered source');
  if(!snap.snapshotId||!snap.vintage||!iso(snap.capturedAt)||!iso(snap.publishedAt))add('snapshot','snapshotId, vintage, publishedAt and capturedAt are required');
  const rows=new Map((snap.rows||[]).map(r=>[r.rowId,r]));if(rows.size!==(snap.rows||[]).length)add('snapshot.rows','row IDs must be unique');
  const withoutHash={snapshotId:snap.snapshotId,sourceId:snap.sourceId,vintage:snap.vintage,publishedAt:snap.publishedAt,capturedAt:snap.capturedAt,rows:snap.rows};
  if(snap.snapshotHash!==sha256(canonical(withoutHash)))add('snapshot.snapshotHash','does not match canonical locked snapshot');
  const dict=bundle.dataDictionary;const fields=new Map((Array.isArray(dict)?dict:[]).map(d=>[d.field,d]));
  if(!Array.isArray(dict)||!dict.length)add('dataDictionary','non-empty dictionary required');
  if(fields.size!==(dict||[]).length)add('dataDictionary','field names must be unique');
  for(let i=0;i<(dict||[]).length;i++){
    const d=dict[i];if(!d.field||!d.description||!d.type||!d.unit)add(`dataDictionary[${i}]`,'field, description, type, unit required');
    if(!['string','number','boolean'].includes(d.type))add(`dataDictionary[${i}].type`,'unsupported data type');
  }
  for(let i=0;i<(snap.rows||[]).length;i++){
    const row=snap.rows[i],p=`snapshot.rows[${i}]`;
    if(!row.rowId||!row.sourceLocator)add(p,'rowId and exact sourceLocator required');
    if(!row.fields||typeof row.fields!=='object')add(`${p}.fields`,'fields object required');
    else for(const [field,value] of Object.entries(row.fields)){
      const definition=fields.get(field);if(!definition)add(`${p}.fields.${field}`,'field missing from data dictionary');
      else if(definition.type==='number'&&!Number.isFinite(value))add(`${p}.fields.${field}`,'must be a finite number');
      else if(definition.type==='string'&&typeof value!=='string')add(`${p}.fields.${field}`,'must be a string');
      else if(definition.type==='boolean'&&typeof value!=='boolean')add(`${p}.fields.${field}`,'must be a boolean');
    }
    for(const definition of dict||[])if(definition.required!==false&&!Object.hasOwn(row.fields||{},definition.field))add(`${p}.fields.${definition.field}`,'required dictionary field is missing from row');
    if(row.vintage!==snap.vintage)add(`${p}.vintage`,'mixed vintage requires a separate explicitly approved comparison plan');
    if(row.sourceId!==snap.sourceId)add(`${p}.sourceId`,'row source must match snapshot source');
  }
  const plan=bundle.analysisPlan||{};if(!plan.planId||!plan.question||plan.snapshotId!==snap.snapshotId)add('analysisPlan','planId, question and matching snapshotId required');
  const {planHash,...planPayload}=plan;if(plan.planHash!==sha256(canonical(planPayload)))add('analysisPlan.planHash','does not match canonical analysis plan');
  if(!Array.isArray(plan.transformations)||!plan.transformations.length)add('analysisPlan.transformations','at least one deterministic transformation required');
  if(!Array.isArray(plan.limitations)||!plan.limitations.length)add('analysisPlan.limitations','explicit limitations required');
  const expected=new Map();const transforms=new Map((plan.transformations||[]).map(t=>[t.id,t]));
  if(transforms.size!==(plan.transformations||[]).length)add('analysisPlan.transformations','transformation IDs must be unique');
  for(const [id,t] of transforms){
    try{expected.set(id,calculateTransform(t,bundle));}catch(error){add(`analysisPlan.transformations.${id}`,error.message);}
  }
  const results=new Map((bundle.analysisResults||[]).map(r=>[r.resultId,r]));
  if(results.size!==(bundle.analysisResults||[]).length)add('analysisResults','result IDs must be unique');
  for(const [id,calculated] of expected){
    const result=results.get(id);if(!result){add(`analysisResults.${id}`,'computed result is missing');continue;}
    if(!near(result.value,calculated.value)||result.unit!==calculated.unit)add(`analysisResults.${id}`,'stored result does not match deterministic recomputation');
    if(result.snapshotHash!==snap.snapshotHash)add(`analysisResults.${id}.snapshotHash`,'result was not computed from the locked snapshot');
    if(result.planHash!==plan.planHash)add(`analysisResults.${id}.planHash`,'result was not computed from the locked analysis plan');
    if(canonical(result.sourceRowIds)!==canonical(calculated.sourceRowIds))add(`analysisResults.${id}.sourceRowIds`,'result lineage does not match transform inputs');
  }
  for(const id of results.keys())if(!expected.has(id))add(`analysisResults.${id}`,'result has no matching approved transformation');
  const claims=bundle.claimLedger;if(!Array.isArray(claims)||!claims.length)add('claimLedger','important claims must have an evidence ledger');
  const claimIds=new Set();
  for(let i=0;i<(claims||[]).length;i++){
    const c=claims[i],p=`claimLedger[${i}]`;if(!c.claimId||claimIds.has(c.claimId))add(`${p}.claimId`,'required and unique');claimIds.add(c.claimId);
    if(!['fact','quote','calculation','interpretation'].includes(c.kind))add(`${p}.kind`,'unsupported claim kind');
    if(!c.text||typeof c.text!=='string')add(`${p}.text`,'claim text required');
    const refs=c.evidenceRefs||[];if(!Array.isArray(refs)||!refs.length)add(`${p}.evidenceRefs`,'at least one exact evidence reference required');
    if(c.kind==='fact'&&!refs.some(ref=>ref.rowId))add(`${p}.evidenceRefs`,'fact claims require a source row reference');
    if(c.kind==='calculation'&&!refs.some(ref=>ref.resultId))add(`${p}.evidenceRefs`,'calculation claims require a computed result reference');
    for(const ref of refs){
      if(ref.resultId){if(!results.has(ref.resultId))add(`${p}.evidenceRefs`,'unknown analysis result '+ref.resultId);}
      else{
        const row=rows.get(ref.rowId);if(ref.snapshotId!==snap.snapshotId||!row||!Object.hasOwn(row.fields||{},ref.field))add(`${p}.evidenceRefs`,'source reference must identify the exact snapshot row and field');
      }
    }
    if(c.kind==='quote'){
      const source=sourceMap.get(refs[0]?.sourceId||snap.sourceId);
      if(!c.exactQuote||!c.sourceLocator||!source?.rawSnapshotText?.includes(c.exactQuote))add(`${p}.exactQuote`,'quote must be an exact substring of retained source snapshot with locator');
    }
    for(const n of c.numericAssertions||[]){
      if(n.resultId){const r=results.get(n.resultId);if(!r||!near(n.value,r.value)||n.unit!==r.unit)add(`${p}.numericAssertions`,'numeric claim does not match referenced computed result');}
      else if(n.sourceRef){const row=rows.get(n.sourceRef.rowId),actual=row?.fields?.[n.sourceRef.field],unit=fields.get(n.sourceRef.field)?.unit;if(n.sourceRef.snapshotId!==snap.snapshotId||!Number.isFinite(actual)||!near(n.value,actual)||n.unit!==unit)add(`${p}.numericAssertions`,'numeric claim does not match referenced source row and unit');}
      else add(`${p}.numericAssertions`,'numeric assertions must reference a source row or computed result');
    }
  }
  const synthetic=(bundle.sources||[]).some(s=>s.kind==='synthetic');
  return {validationStatus:errors.length?'FAIL':'PASS',releaseGate:'HOLD',gateReason:synthetic?'synthetic source material is never release eligible in this local adapter':'no trusted reviewer/sign-off service is configured',errors,computedResults:Object.fromEntries(expected)};
}
