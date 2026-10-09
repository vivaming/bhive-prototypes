import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig,devices} from '@playwright/test';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
fs.mkdirSync(path.join(repoRoot,'work'),{recursive:true});
const externalUrl=process.env.BIHIVE_QA_URL;
const loopback='http://127.0.0.1:4173';
export default defineConfig({
  testDir:'.',testMatch:'*.spec.mjs',fullyParallel:true,workers:2,forbidOnly:!!process.env.CI,retries:process.env.CI?1:0,
  reporter:[['list'],['json',{outputFile:path.join(repoRoot,'work','playwright-report.json')}]],
  use:{baseURL:externalUrl||loopback,browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
  ...(externalUrl?{}:{webServer:{command:'node scripts/qa-server.mjs',cwd:repoRoot,url:loopback,reuseExistingServer:!process.env.CI,timeout:15000}}),
  projects:[
    {name:'desktop-motion',use:{...devices['Desktop Chrome'],browserName:'chromium',viewport:{width:1440,height:900},reducedMotion:'no-preference'}},
    {name:'mobile-reduced',use:{...devices['iPhone 13'],browserName:'chromium',viewport:{width:390,height:844},reducedMotion:'reduce'}}
  ]
});
