import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '@playwright/test';

test('hero poll chart keeps the latest values and source badge readable at desktop widths',async({page},testInfo)=>{
  const viewports=[{width:2048,height:1002},{width:1024,height:768},{width:520,height:844}];
  fs.mkdirSync('work/chart-review',{recursive:true});
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    await page.goto('/');
    const hero=page.locator('#grid .cell[data-id="election"]');
    const chart=hero.locator('.election-chart svg');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.poll-legend-kicker')).toHaveText('LATEST · 3 SEP');
    await expect(chart.locator('.poll-legend-name')).toHaveText(['National','Labour']);
    await expect(chart.locator('.poll-legend-value')).toHaveText(['29.0%','25.9%']);
    await expect(hero.locator('.gap-callout')).not.toContainText(/Curia|Sep/i);
    const geometry=await page.evaluate(()=>{
      const svg=document.querySelector('#grid .cell[data-id="election"] .election-chart svg');
      const box=svg.viewBox.baseVal,divider=svg.querySelector('.poll-legend-divider').getBBox();
      const labels=Array.from(svg.querySelectorAll('.poll-legend-name,.poll-legend-value')).map(el=>{
        const r=el.getBBox();return {text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height};
      });
      const hero=document.querySelector('#grid .cell[data-id="election"]');
      const gap=hero.querySelector('.gap-callout').getBoundingClientRect(),source=hero.querySelector('.gap-meta').getBoundingClientRect();
      const rendered=svg.getBoundingClientRect();
      const legendFont=parseFloat(getComputedStyle(svg.querySelector('.poll-legend-name')).fontSize);
      const scale=Math.min(rendered.width/box.width,rendered.height/box.height);
      return {viewBox:{width:box.width,height:box.height},rendered:{width:rendered.width,height:rendered.height},legendFont,renderedLegendFont:legendFont*scale,dividerX:divider.x,labels,gapBottom:gap.bottom,sourceTop:source.top,sourceText:hero.querySelector('.gap-meta').textContent};
    });
    expect(geometry.rendered.width/geometry.viewBox.width).toBeGreaterThanOrEqual(0.95);
    expect(geometry.rendered.height/geometry.viewBox.height).toBeGreaterThanOrEqual(0.95);
    expect(geometry.renderedLegendFont,`legend renders at ${geometry.renderedLegendFont.toFixed(1)} CSS px`).toBeGreaterThanOrEqual(8.5);
    expect(geometry.labels.every(label=>label.x>geometry.dividerX+4)).toBe(true);
    expect(geometry.labels.every(label=>label.x>=0&&label.x+label.width<=geometry.viewBox.width)).toBe(true);
    for(let i=0;i<geometry.labels.length;i++)for(let j=i+1;j<geometry.labels.length;j++){
      const a=geometry.labels[i],b=geometry.labels[j];
      const overlaps=a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
      expect(overlaps,`${a.text} overlaps ${b.text}`).toBe(false);
    }
    expect(geometry.sourceTop).toBeGreaterThanOrEqual(geometry.gapBottom-1);
    expect(geometry.sourceText).toMatch(/CURIA POLL · 3 SEP/);
    await page.screenshot({path:path.resolve(`work/chart-review/hero-${testInfo.project.name}-${viewport.width}x${viewport.height}.png`)});
  }
});
