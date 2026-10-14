import fs from 'node:fs';
import {canonical,sha256} from '../contract.mjs';

const rawSnapshotText='SYNTHETIC QA FIXTURE — NOT A REAL SOURCE\nPeriod,synthetic index,synthetic share\n2024,80,10.0\n2025,100,12.0\n';
const snapshot={snapshotId:'synthetic-example-snapshot-v1',sourceId:'synthetic-fixture',vintage:'synthetic-v1',publishedAt:'2026-10-08T00:00:00Z',capturedAt:'2026-10-09T00:00:00Z',rows:[
  {rowId:'row-2024',sourceId:'synthetic-fixture',vintage:'synthetic-v1',sourceLocator:'Synthetic QA table · row 1 · all values are fabricated',fields:{period:'2024',index:80,share:10}},
  {rowId:'row-2025',sourceId:'synthetic-fixture',vintage:'synthetic-v1',sourceLocator:'Synthetic QA table · row 2 · all values are fabricated',fields:{period:'2025',index:100,share:12}}
]};
snapshot.snapshotHash=sha256(canonical(snapshot));
const plan={planId:'synthetic-example-plan-v1',question:'How does a fabricated index change between two demonstration rows?',snapshotId:snapshot.snapshotId,transformations:[
  {id:'index-difference',type:'difference',inputs:[{rowId:'row-2024',field:'index'},{rowId:'row-2025',field:'index'}],outputUnit:'index points',precision:1},
  {id:'index-percent-change',type:'percent_change',inputs:[{rowId:'row-2024',field:'index'},{rowId:'row-2025',field:'index'}],precision:1},
  {id:'share-change-pp',type:'percentage_points',inputs:[{rowId:'row-2024',field:'share'},{rowId:'row-2025',field:'share'}],precision:1}
],limitations:['Entire bundle is synthetic and does not represent a real population or source.','Two example rows cannot establish a trend or causal explanation.']};
plan.planHash=sha256(canonical(plan));
const provisional={schemaVersion:1,bundleId:'synthetic-analytics-contract-example-v1',releaseGate:'HOLD',sources:[{sourceId:'synthetic-fixture',kind:'synthetic',title:'Synthetic QA fixture (not a source)',url:null,retrievedAt:'2026-10-09T00:00:00Z',rawSnapshotText,rawSnapshotSha256:sha256(rawSnapshotText),syntheticNotice:'Fabricated solely to test validation; not observed facts.'}],snapshot,dataDictionary:[
  {field:'period',description:'Synthetic display period',type:'string',unit:'label',temporalRole:'illustrative-only',required:true},
  {field:'index',description:'Synthetic scale value',type:'number',unit:'index points',denominator:null,periodicity:'illustrative',required:true},
  {field:'share',description:'Synthetic share value',type:'number',unit:'%',denominator:'synthetic demonstration base',periodicity:'illustrative',required:true}
],analysisPlan:plan,analysisResults:[],claimLedger:[]};
const results=[
  {resultId:'index-difference',value:20,unit:'index points',snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,sourceRowIds:['row-2024','row-2025']},
  {resultId:'index-percent-change',value:25,unit:'%',snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,sourceRowIds:['row-2024','row-2025']},
  {resultId:'share-change-pp',value:2,unit:'percentage points',snapshotHash:snapshot.snapshotHash,planHash:plan.planHash,sourceRowIds:['row-2024','row-2025']}
];
provisional.analysisResults=results;
provisional.claimLedger=[
  {claimId:'claim-final-index',kind:'fact',text:'Synthetic 2025 index value: 100 index points.',evidenceRefs:[{snapshotId:snapshot.snapshotId,rowId:'row-2025',field:'index'}],numericAssertions:[{value:100,unit:'index points',sourceRef:{snapshotId:snapshot.snapshotId,rowId:'row-2025',field:'index'}}]},
  {claimId:'claim-index-difference',kind:'calculation',text:'The synthetic index difference is 20.0 index points.',evidenceRefs:[{resultId:'index-difference'}],numericAssertions:[{value:20,unit:'index points',resultId:'index-difference'}]},
  {claimId:'claim-index-percent',kind:'calculation',text:'The synthetic index rose 25.0 percent relative to its illustrative baseline.',evidenceRefs:[{resultId:'index-percent-change'}],numericAssertions:[{value:25,unit:'%',resultId:'index-percent-change'}]},
  {claimId:'claim-share-pp',kind:'calculation',text:'The synthetic share difference is 2.0 percentage points.',evidenceRefs:[{resultId:'share-change-pp'}],numericAssertions:[{value:2,unit:'percentage points',resultId:'share-change-pp'}]},
  {claimId:'claim-limitation',kind:'interpretation',text:'These fabricated rows cannot support a real-world trend claim.',evidenceRefs:[{snapshotId:snapshot.snapshotId,rowId:'row-2024',field:'index'},{snapshotId:snapshot.snapshotId,rowId:'row-2025',field:'index'}]}
];
const out='analytics/examples/synthetic-bundle.json';fs.writeFileSync(out,JSON.stringify(provisional,null,2)+'\n');console.log(`Wrote explicitly synthetic example to ${out}`);
