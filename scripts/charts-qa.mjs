import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const spec=JSON.parse(fs.readFileSync('charts/specs/legacy-curia-fixture.json','utf8'));
const runtime=fs.readFileSync('charts/chart-spec.js','utf8');
const context=vm.createContext({});
vm.runInContext(runtime,context,{filename:'charts/chart-spec.js'});
const charts=context.BIHIVE_CHARTS;
if(process.argv.includes('--write-hash')){
  spec.datasetHash=crypto.createHash('sha256').update(charts.canonicalData(spec),'utf8').digest('hex');
  fs.writeFileSync('charts/specs/legacy-curia-fixture.json',JSON.stringify(spec,null,2)+'\n');
  console.log(`Updated canonical dataset hash: ${spec.datasetHash}`);
  process.exit(0);
}
const errors=[];let passes=0;
function check(name,ok,detail=''){if(ok){passes++;console.log(`PASS ${name}${detail?`: ${detail}`:''}`);}else errors.push(`FAIL ${name}${detail?`: ${detail}`:''}`);}
const canonical=charts.canonicalData(spec);
const hash=crypto.createHash('sha256').update(canonical,'utf8').digest('hex');
check('ChartSpec structural validation',charts.validate(spec).length===0,charts.validate(spec).join('; '));
check('canonical locked dataset hash',hash===spec.datasetHash,hash);
check('unverified fixture remains on HOLD',charts.gate(spec,hash).status==='HOLD',JSON.stringify(charts.gate(spec,hash)));
const ids=spec.snapshotView.seriesIds;
check('snapshot plotted IDs exactly match locked values',ids.length===spec.dataset.partySnapshot.length&&ids.every((id,i)=>id===spec.dataset.partySnapshot[i].id));
const history=new Map(spec.dataset.series.map(s=>[s.id,s.values.at(-1)]));
check('latest observations match snapshot for every plotted series',spec.dataset.partySnapshot.every(p=>!history.has(p.id)||history.get(p.id)===p.value));
check('gap transform is derived from locked snapshot',charts.gap(spec.dataset.partySnapshot,'national','labour')===3.1);
const verifiedHeld=structuredClone(spec);verifiedHeld.provenance={...verifiedHeld.provenance,status:'VERIFIED'};verifiedHeld.sourceIds=['source-record-test'];
check('explicit release HOLD overrides verified provenance',charts.gate(verifiedHeld,charts.canonicalData(verifiedHeld)===canonical?hash:crypto.createHash('sha256').update(charts.canonicalData(verifiedHeld)).digest('hex')).status==='HOLD');
const badLatest=structuredClone(spec);badLatest.dataset.partySnapshot.find(p=>p.id==='national').value+=0.1;
check('snapshot mismatch is rejected',charts.validate(badLatest).some(e=>e.includes('partySnapshot and latest series value differ')));
const badBars=structuredClone(spec);badBars.snapshotView.scalePolicy.baseline=5;
check('non-zero snapshot bar baseline is rejected',charts.validate(badBars).some(e=>e.includes('snapshot horizontal bars')));
const staleHash=structuredClone(spec);staleHash.dataset.series[0].values[0]+=0.1;
check('data edit invalidates stored dataset hash',charts.gate(staleHash,crypto.createHash('sha256').update(charts.canonicalData(staleHash)).digest('hex')).status==='FAIL');
check('legacy values preserved verbatim',JSON.stringify(spec.dataset.partySnapshot.map(p=>[p.id,p.value]))===JSON.stringify([['national',29],['labour',25.9],['green',13.9],['act',10.5],['nzfirst',8.4],['opp',4.5]]));
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}else console.log(`PASS: ${passes} ChartSpec checks; data release gate remains HOLD by design`);
