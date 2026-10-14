import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifestObject,documentedManifestFields} from '../integrations/xpi/manifest-contract.mjs';

const valid={topic:'public-data-chart-fixture',run_id:'local-contract-test-001',max_concurrency:2,max_attempts_per_lane:1,timeout_per_lane:'10m',retry_failed:false,lanes:[{id:'chart-qa',quota_group:'unverified-local-fixture',workdir:'${BIHIVE_WORKDIR}/contract-test',taskbook:'taskbook.md',artifact_type:'structured-result',task:'Validate a local fixture only.',donemark:'LANE_DONE'}]};
test('documented shape validates locally but never enables dispatch',()=>{const result=validateManifestObject(valid);assert.equal(result.status,'LOCAL_STRUCTURE_VALID');assert.deepEqual(result.errors,[]);assert.equal(result.dispatchEnabled,false);assert.equal(documentedManifestFields.status,'DOCUMENTED_NOT_LIVE_VERIFIED');});
test('invalid concurrency and attempts are rejected',()=>{for(const override of [{max_concurrency:11},{max_attempts_per_lane:0}]){const result=validateManifestObject({...valid,...override});assert.equal(result.status,'INVALID');assert.ok(result.errors.length);}});
test('missing lane fields and multiline task are rejected',()=>{const result=validateManifestObject({...valid,lanes:[{...valid.lanes[0],donemark:'',task:'first line\nsecond line'}]});assert.equal(result.status,'INVALID');assert.ok(result.errors.some(e=>e.includes('donemark')));assert.ok(result.errors.some(e=>e.includes('single line')));});
test('duplicate lane ids are rejected',()=>{const result=validateManifestObject({...valid,lanes:[valid.lanes[0],{...valid.lanes[0]}]});assert.ok(result.errors.some(e=>e.includes('must be unique')));});
test('unknown parser-specific fields are not treated as live-supported',()=>{const result=validateManifestObject({...valid,lanes:[{...valid.lanes[0],artifact_type:'future-value'}]});assert.equal(result.status,'LOCAL_STRUCTURE_VALID');assert.equal(result.dispatchEnabled,false);});
