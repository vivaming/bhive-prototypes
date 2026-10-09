import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'*.spec.mjs',fullyParallel:true,forbidOnly:!!process.env.CI,retries:0,reporter:[['list'],['json',{outputFile:'work/playwright-report.json'}]],
  use:{baseURL:process.env.BIHIVE_QA_URL,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'desktop-motion',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900},reducedMotion:'no-preference'}},
    {name:'mobile-reduced',use:{...devices['iPhone 13'],viewport:{width:390,height:844},reducedMotion:'reduce'}}
  ]
});
