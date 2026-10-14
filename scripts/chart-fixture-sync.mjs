import fs from 'node:fs';

const jsonPath='charts/specs/legacy-curia-fixture.json';
const jsPath='charts/specs/legacy-curia-fixture.js';
const spec=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
const expected='/* Generated from legacy-curia-fixture.json by scripts/chart-fixture-sync.mjs. */\n(function(root){\n  root.BIHIVE_CHART_SPEC = '+JSON.stringify(spec,null,2).split('\n').join('\n  ')+';\n})(typeof window!=="undefined"?window:globalThis);\n';
if(process.argv.includes('--write')){
  fs.writeFileSync(jsPath,expected);
  console.log(`Wrote ${jsPath}`);
}else if(!fs.existsSync(jsPath)||fs.readFileSync(jsPath,'utf8')!==expected){
  console.error(`${jsPath} is stale; run pnpm charts:sync`);
  process.exitCode=1;
}else console.log('PASS: generated ChartSpec runtime module matches locked JSON');
