import {test,expect} from '@playwright/test';
test('filters, pages and accessible article return stay coherent',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.locator('#grid .cell').first()).toBeVisible();
  await page.getByRole('button',{name:/Health/i}).click();await expect(page.locator('#grid .cell').first()).toBeVisible();
  const card=page.locator('#grid .cell[role="button"]').first(); await card.focus(); await page.keyboard.press('Space');await expect(page.locator('#article-view')).toHaveClass(/active/);
  await page.getByRole('button',{name:/BACK/}).click();await expect(page.locator('#treemap-view')).toHaveClass(/active/);expect(errors).toEqual([]);
});
test('Herald aggregate stays separate from Curia party snapshot',async({page})=>{
  await page.goto('/?a=s18');await expect(page.locator('#a-chart')).toContainText('47.8%');await expect(page.locator('#a-chart')).toContainText('Herald Poll of Polls');await expect(page.locator('#a-chart')).not.toContainText('Curia');
});
test('cards stay within the responsive viewport and photos decode locally',async({page})=>{
  await page.goto('/');await expect(page.locator('#grid .cell').first()).toBeVisible();
  const bounds=await page.evaluate(()=>{const grid=document.querySelector('#grid'),g=grid.getBoundingClientRect();return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,grid:{left:g.left,right:g.right,top:g.top,bottom:g.bottom,clientWidth:grid.clientWidth,cssWidth:getComputedStyle(grid).width},overflowing:Array.from(document.querySelectorAll('body *')).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className:'',left:r.left,right:r.right,width:r.width};}).filter(x=>x.right>innerWidth+1).slice(0,12),cards:Array.from(document.querySelectorAll('#grid .cell')).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,styleLeft:el.style.left,styleWidth:el.style.width,cssWidth:s.width,minWidth:s.minWidth,boxSizing:s.boxSizing,padding:s.padding,transform:s.transform,id:el.dataset.id};})};});
  expect(bounds.scrollWidth,JSON.stringify(bounds.overflowing)).toBeLessThanOrEqual(bounds.viewport+1);
  for(const card of bounds.cards){expect(card.left,`${card.id} left`).toBeGreaterThanOrEqual(bounds.grid.left-1);expect(card.right,`${card.id} right`).toBeLessThanOrEqual(bounds.grid.right+1);expect(card.top,`${card.id} top`).toBeGreaterThanOrEqual(bounds.grid.top-1);expect(card.bottom,`${card.id} bottom ${card.bottom} exceeds grid bottom ${bounds.grid.bottom}`).toBeLessThanOrEqual(bounds.grid.bottom+1);}
  const cards=page.locator('#grid .cell');for(let i=0;i<await cards.count();i++){const style=await cards.nth(i).evaluate(el=>getComputedStyle(el).borderTopWidth);expect(parseFloat(style)).toBeGreaterThan(0);}
  const imgs=page.locator('#grid img[src*="/assets/photos/"]');
  for(let i=0;i<await imgs.count();i++){const img=imgs.nth(i);const result=await img.evaluate(async el=>{el.loading='eager';await el.decode();return {width:el.naturalWidth,alt:el.alt,src:el.currentSrc};});expect(result.width).toBeGreaterThan(0);expect(result.alt.length).toBeGreaterThan(8);expect(result.src).toContain('/assets/photos/');}
});
test('reduced motion preference is honored after runtime media change',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>window.BIHIVE_QA?.getSnapshot().motion.reducedMotion)).toBe(true);
  await page.getByRole('button',{name:/Health/i}).click();
  await expect.poll(()=>page.evaluate(()=>window.BIHIVE_QA.getSnapshot().motion.flipping)).toBe(false);
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
});
test('rapid page and article actions settle on the last requested view',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.locator('#pg-next').click();await page.locator('#pg-prev').click();
  await page.locator('#grid .cell[role="button"]').first().focus();await page.keyboard.press('Enter');
  await expect(page.locator('#article-view')).toHaveClass(/active/);
  await page.getByRole('button',{name:/BACK/}).click();
  await expect(page.locator('#treemap-view')).toHaveClass(/active/);
  await expect.poll(()=>page.evaluate(()=>window.BIHIVE_QA.getSnapshot().motion.flipping)).toBe(false);
  expect(errors).toEqual([]);
});
