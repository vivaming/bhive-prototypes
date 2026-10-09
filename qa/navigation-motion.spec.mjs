import {test,expect} from '@playwright/test';
const target=process.env.BIHIVE_QA_URL;
test.beforeEach(()=>{test.skip(!target,'Set BIHIVE_QA_URL to a browser target that this execution environment explicitly permits.');});
test('filters, pages and accessible article return stay coherent',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.locator('#grid .cell').first()).toBeVisible();
  await page.getByRole('button',{name:'Health'}).click();await expect(page.locator('#grid .cell').first()).toBeVisible();
  await page.locator('#grid .cell').first().focus();await page.keyboard.press('Space');await expect(page.locator('#article-view')).toHaveClass(/active/);
  await page.getByRole('button',{name:/BACK/}).click();await expect(page.locator('#treemap-view')).toHaveClass(/active/);expect(errors).toEqual([]);
});
test('Herald aggregate stays separate from Curia party snapshot',async({page})=>{
  await page.goto('/?a=s18');await expect(page.locator('#a-chart')).toContainText('47.8%');await expect(page.locator('#a-chart')).toContainText('Herald Poll of Polls');await expect(page.locator('#a-chart')).not.toContainText('Curia');
});
test('visible photos decode with their editorial alt text and card borders remain present',async({page})=>{
  await page.goto('/');const cards=page.locator('#grid .cell');for(let i=0;i<await cards.count();i++){const style=await cards.nth(i).evaluate(el=>getComputedStyle(el).borderTopWidth);expect(parseFloat(style)).toBeGreaterThan(0);}
  const imgs=page.locator('#grid img');for(let i=0;i<await imgs.count();i++){const img=imgs.nth(i);await expect(img).toHaveJSProperty('complete',true);expect(await img.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);}
});
