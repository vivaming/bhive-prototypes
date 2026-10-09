import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function settled(page){
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect.poll(()=>page.evaluate(()=>window.BIHIVE_QA.getSnapshot().motion.flipping)).toBe(false);
}
test('photos fade into captions, portraits preserve their framing and filler covers never render',async({page})=>{
  for(const width of [2048,1024,390]){
    await page.setViewportSize({width,height:width===1024?768:1002});await page.goto('/');await settled(page);
    if(width===1024){
      const bounds=await page.locator('.cell.p0').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,note:el.querySelector('.mmp-note').getBoundingClientRect().bottom}));
      expect(bounds.note).toBeLessThanOrEqual(bounds.bottom-2);
    }
    const count=await page.evaluate(()=>window.BIHIVE_QA.getSnapshot().pageCount);
    for(let n=1;n<=count;n++){
      await expect(page.locator('#grid img[src*="/assets/editorial/"]')).toHaveCount(0);
      const geometry=await page.locator('#grid .has-photo').evaluateAll(cards=>cards.map(card=>{
        const photo=card.querySelector('.cell-photo'),title=card.querySelector('.cell-title'),caption=card.querySelector('.cell-caption');
        const p=photo.getBoundingClientRect(),t=title.getBoundingClientRect();
        const img=card.querySelector('img');
        return {id:card.dataset.id,bottom:p.bottom,titleTop:t.top,portrait:card.classList.contains('has-portrait'),fit:getComputedStyle(img).objectFit,caption:getComputedStyle(caption).backgroundColor};
      }));
      for(const g of geometry){expect(g.titleTop,`${g.id}: headline crosses the photo`).toBeGreaterThanOrEqual(g.bottom-1);if(g.portrait)expect(g.fit).toBe('contain');}
      if(n===1&&geometry.length){
        const photo=page.locator('#grid .has-photo .cell-photo').first();
        await photo.locator('img').evaluate(async img=>{img.loading='eager';await img.decode();});
        const {data,info}=await sharp(await photo.screenshot({animations:'disabled'})).removeAlpha().raw().toBuffer({resolveWithObject:true});
        const background=geometry[0].caption.match(/[\d.]+/g).slice(0,3).map(Number);
        const offset=((info.height-1)*info.width+Math.floor(info.width/2))*info.channels;
        for(let channel=0;channel<3;channel++)expect(Math.abs(data[offset+channel]-background[channel]),`${geometry[0].id}: photo/caption seam color`).toBeLessThanOrEqual(18);
      }
      if(n<count){await page.locator('#pg-next').click();await expect.poll(()=>page.evaluate(()=>window.BIHIVE_QA.getSnapshot().page)).toBe(n+1);await settled(page);}
    }
    if(width===390){await page.goto('/');await settled(page);const title=page.locator('.mobile-hero .cell-title');expect(await title.evaluate(el=>el.clientHeight+1>=el.scrollHeight)).toBe(true);await expect(title).toContainText('Threshold');}
  }
});

async function denseBars(page,selector,count){
  const bars=await page.locator(selector).evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
  expect(bars).toHaveLength(count);
  for(let i=1;i<bars.length;i++){const gap=bars[i].top-bars[i-1].bottom;expect(gap,`${selector}: bars overlap`).toBeGreaterThanOrEqual(0);expect(gap,`${selector}: gap is ${gap}px`).toBeLessThanOrEqual(2.1);}
}
test('bar charts keep near-adjacent bars, readable labels and correctly aligned scale',async({page})=>{
  await page.setViewportSize({width:2048,height:1002});await page.goto('/');await settled(page);
  await denseBars(page,'.thresholds .th-track',6);
  await denseBars(page,'.poll-mini .poll-snapshot-track',6);
  const label=await page.locator('.poll-mini .poll-snapshot-row').first().evaluate(el=>({color:getComputedStyle(el).color,size:parseFloat(getComputedStyle(el).fontSize)}));
  expect(label.color).toBe('rgb(199, 207, 216)');expect(label.size).toBeGreaterThanOrEqual(9);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1002});await page.goto('/?a=wp6-2');await settled(page);
    await denseBars(page,'#a-chart .inz-track',4);
    const axis=await page.evaluate(()=>{const bar=document.querySelector('.inz-track').getBoundingClientRect(),ticks=document.querySelector('.inz-axis-ticks').getBoundingClientRect();return {left:bar.left-ticks.left,right:bar.right-ticks.right};});
    expect(Math.abs(axis.left)).toBeLessThanOrEqual(1);expect(Math.abs(axis.right)).toBeLessThanOrEqual(1);
    await page.goto('/?a=wp8-2');await settled(page);await denseBars(page,'#a-chart .poll-snapshot-track',6);
  }
});
