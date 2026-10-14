import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTransform,validateEvidenceBundle} from './contract.mjs';

const valid=JSON.parse(fs.readFileSync(new URL('./examples/synthetic-bundle.json',import.meta.url),'utf8'));
const attacks=JSON.parse(fs.readFileSync(new URL('./examples/adversarial-cases.json',import.meta.url),'utf8'));
function hasIssue(bundle,fragment){return validateEvidenceBundle(bundle).errors.some(e=>`${e.path}: ${e.message}`.includes(fragment));}
test('synthetic evidence bundle validates deterministically and remains release HOLD',()=>{
  const result=validateEvidenceBundle(valid);assert.equal(result.validationStatus,'PASS');assert.equal(result.releaseGate,'HOLD');
  assert.deepEqual(result.computedResults,{'index-difference':{value:20,unit:'index points',sourceRowIds:['row-2024','row-2025']},'index-percent-change':{value:25,unit:'%',sourceRowIds:['row-2024','row-2025']},'share-change-pp':{value:2,unit:'percentage points',sourceRowIds:['row-2024','row-2025']}});
});
test('percent-change transform uses baseline denominator and declared precision',()=>{
  const result=calculateTransform(valid.analysisPlan.transformations.find(t=>t.id==='index-percent-change'),valid);assert.equal(result.value,25);assert.equal(result.unit,'%');
});
test('percentage-point arithmetic remains distinct from percent change',()=>{
  const pp=valid.analysisResults.find(r=>r.resultId==='share-change-pp'),pct=valid.analysisResults.find(r=>r.resultId==='index-percent-change');assert.equal(pp.value,2);assert.equal(pp.unit,'percentage points');assert.equal(pct.unit,'%');
});

const cases=[
  ['stale-snapshot-hash',b=>{b.snapshot.rows[1].fields.index=101;}],
  ['stale-source-bytes-hash',b=>{b.sources[0].rawSnapshotText+='edit';}],
  ['unlocated-row',b=>{b.snapshot.rows[0].sourceLocator='';}],
  ['undefined-field',b=>{b.snapshot.rows[0].fields.extra=1;}],
  ['dictionary-unit-missing',b=>{b.dataDictionary.find(d=>d.field==='index').unit='';}],
  ['mixed-vintage',b=>{b.snapshot.rows[1].vintage='synthetic-v2';}],
  ['unknown-operation',b=>{b.analysisPlan.transformations[0].type='impute';}],
  ['zero-baseline-percent-change',b=>{b.snapshot.rows[0].fields.index=0;}],
  ['wrong-calculation',b=>{b.analysisResults.find(r=>r.resultId==='index-difference').value=21;}],
  ['wrong-result-snapshot',b=>{b.analysisResults[0].snapshotHash='0'.repeat(64);}],
  ['unknown-claim-row',b=>{b.claimLedger[0].evidenceRefs[0].rowId='not-a-row';}],
  ['unsupported-numeric-claim',b=>{b.claimLedger[0].numericAssertions[0].value=101;}],
  ['quote-not-in-snapshot',b=>{b.claimLedger.push({claimId:'bad-quote',kind:'quote',text:'unverified quote',evidenceRefs:[{snapshotId:b.snapshot.snapshotId,rowId:'row-2024',field:'period'}],exactQuote:'Not present in captured bytes.',sourceLocator:'unknown'});}],
  ['plan-snapshot-mismatch',b=>{b.analysisPlan.snapshotId='another-snapshot';}],
  ['no-limitations',b=>{b.analysisPlan.limitations=[];}],
  ['insecure-source-url',b=>{b.sources[0].kind='official';b.sources[0].url='http://example.invalid/data';}],
  ['percentage-points-misuse',b=>{b.analysisPlan.transformations[0].type='percentage_points';}],
  ['duplicate-source-id',b=>{b.sources.push(structuredClone(b.sources[0]));}],
  ['missing-claim-evidence',b=>{b.claimLedger[0].evidenceRefs=[];}],
  ['attempted-release',b=>{b.releaseGate='PASS';}]
];
for(const [id,mutate] of cases){
  const expected=attacks.cases.find(c=>c.id===id)?.expected;test(`adversarial bundle is rejected: ${id}`,()=>{const b=structuredClone(valid);mutate(b);assert.ok(expected,`case ${id} documented`);assert.ok(hasIssue(b,expected),JSON.stringify(validateEvidenceBundle(b).errors));assert.equal(validateEvidenceBundle(b).releaseGate,'HOLD');});
}
test('unsupported transformation cannot be executed',()=>{assert.throws(()=>calculateTransform({id:'unsafe',type:'arbitrary-code',inputs:[]},valid),/Unsupported transform/);});
