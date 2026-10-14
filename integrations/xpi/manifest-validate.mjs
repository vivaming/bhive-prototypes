import fs from 'node:fs';
import {validateManifestObject} from './manifest-contract.mjs';

const file=process.argv[2];
if(!file){console.error('Usage: node integrations/xpi/manifest-validate.mjs <JSON object parsed from an authorized manifest>');process.exit(2);}
let value;
try{value=JSON.parse(fs.readFileSync(file,'utf8'));}
catch(error){console.error(`Could not parse JSON (${error.message}). YAML parsing and remote submission are intentionally not implemented.`);process.exit(2);}
const result=validateManifestObject(value);
console.log(JSON.stringify(result,null,2));
if(result.status!=='LOCAL_STRUCTURE_VALID')process.exit(1);
