import fs from 'node:fs';
import vm from 'node:vm';

const themeContext=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('./chart-spec.js',import.meta.url),'utf8'),themeContext);
const themes=themeContext.BIHIVE_CHARTS.themes;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const fmt=(v,precision=1)=>Number(v).toLocaleString('en-NZ',{minimumFractionDigits:precision,maximumFractionDigits:precision});
function ticks(domain,count=5){const [lo,hi]=domain,step=(hi-lo)/count;return Array.from({length:count+1},(_,i)=>lo+i*step);}
function renderLabel(x,y,label,{anchor='start',fontSize=12,fill,weight=400,maxChars=21}={}){
  const words=String(label).split(/\s+/),lines=[];let line='';
  for(const word of words){if(!line)line=word;else if((line+' '+word).length<=maxChars)line+=' '+word;else{lines.push(line);line=word;}}
  if(line)lines.push(line);const visible=lines.slice(0,2);if(lines.length>2)visible[1]=visible[1].slice(0,Math.max(1,maxChars-1))+'…';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${visible.map((s,i)=>`<tspan x="${x}" dy="${i?fontSize+2:0}">${esc(s)}</tspan>`).join('')}</text>`;
}
export function validateGallerySpec(spec){
  const errors=[];if(!spec||typeof spec!=='object')return ['spec must be an object'];
  for(const key of ['id','title','question','unit','template','width','height','data','provenance'])if(!(key in spec))errors.push(`missing ${key}`);
  if(!['horizontal-bar','line','dot-plot','slope','contribution','scatter'].includes(spec.template))errors.push('unsupported template');
  if(!Number.isInteger(spec.width)||spec.width<180||spec.width>1600)errors.push('width must be 180..1600');
  if(!Number.isInteger(spec.height)||spec.height<120||spec.height>1200)errors.push('height must be 120..1200');
  if(spec.provenance?.status!=='SYNTHETIC')errors.push('gallery specimens must be explicitly synthetic');
  if(spec.releaseGate!=='HOLD')errors.push('synthetic specimens must remain release HOLD');
  if(['horizontal-bar','dot-plot','line','scatter','slope'].includes(spec.template)){
    const d=spec.scale?.domain;if(!Array.isArray(d)||d.length!==2||!d.every(Number.isFinite)||d[0]>=d[1])errors.push('scale.domain must be increasing finite values');
  }
  if(spec.template==='horizontal-bar'&&spec.scale?.baseline!==0)errors.push('horizontal bars require a zero baseline');
  if(['horizontal-bar','dot-plot'].includes(spec.template)&&Array.isArray(spec.data?.items)&&Array.isArray(spec.scale?.domain)&&spec.data.items.some(item=>!Number.isFinite(item.value)||item.value<spec.scale.domain[0]||item.value>spec.scale.domain[1]))errors.push('scale domain must contain all data values');
  if(spec.template==='scatter'&&(!Array.isArray(spec.scale?.yDomain)||spec.scale.yDomain.length!==2||!spec.scale.yDomain.every(Number.isFinite)||spec.scale.yDomain[0]>=spec.scale.yDomain[1]))errors.push('scatter scale.yDomain must be increasing finite values');
  if(spec.template==='contribution'){
    if(!Array.isArray(spec.data.steps)||spec.data.steps.length<2)errors.push('contribution requires steps');
    const start=spec.data.steps[0]?.total,end=spec.data.steps.at(-1)?.total;
    const changes=spec.data.steps.slice(1,-1).reduce((sum,s)=>sum+s.change,0);
    if(!Number.isFinite(start)||!Number.isFinite(end)||Math.abs(start+changes-end)>1e-8)errors.push('contribution changes must reconcile start to end');
    let running=Number.isFinite(start)?start:0,lo=Math.min(0,running),hi=Math.max(0,running);
    for(const step of spec.data.steps.slice(1,-1)){if(!Number.isFinite(step.change))errors.push('contribution changes must be finite');running+=Number(step.change)||0;lo=Math.min(lo,running);hi=Math.max(hi,running);}
    const d=spec.scale?.domain;if(d&&(!Array.isArray(d)||d.length!==2||d[0]>lo||d[1]<hi))errors.push('contribution scale domain must contain cumulative values');
  }
  if(spec.template==='line'){
    if(!Array.isArray(spec.data.labels)||!spec.data.labels.length)errors.push('line requires labels');
    if(!Array.isArray(spec.data.series)||!spec.data.series.length)errors.push('line requires series');
    for(const s of spec.data.series||[])if(!Array.isArray(s.values)||s.values.length!==spec.data.labels.length||s.values.some(v=>v!==null&&!Number.isFinite(v)))errors.push(`line series ${s.id||'?'} must align finite-or-null values to labels`);
    if(Array.isArray(spec.scale?.domain)&&spec.data.series?.some(s=>s.values?.some(v=>v!==null&&(v<spec.scale.domain[0]||v>spec.scale.domain[1]))))errors.push('scale domain must contain all line values');
  }
  if(spec.template==='slope'&&Array.isArray(spec.data?.items)&&Array.isArray(spec.scale?.domain)&&spec.data.items.some(item=>[item.start,item.end].some(v=>!Number.isFinite(v)||v<spec.scale.domain[0]||v>spec.scale.domain[1])))errors.push('scale domain must contain all slope endpoints');
  if(spec.template==='scatter'&&(!Array.isArray(spec.data.points)||!spec.data.points.length||spec.data.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))))errors.push('scatter points require finite x and y');
  if(spec.template==='scatter'&&Array.isArray(spec.scale?.domain)&&Array.isArray(spec.scale?.yDomain)&&Array.isArray(spec.data?.points)&&spec.data.points.some(p=>p.x<spec.scale.domain[0]||p.x>spec.scale.domain[1]||p.y<spec.scale.yDomain[0]||p.y>spec.scale.yDomain[1]))errors.push('scatter scale domains must contain every point');
  return errors;
}

export function renderSpec(spec,{theme='dark',width=spec.width,height=spec.height}={}){
  const problems=validateGallerySpec(spec);if(problems.length)throw new Error(problems.join('; '));
  if(!Number.isInteger(width)||width<180||width>1600||!Number.isInteger(height)||height<120||height>1200)throw new Error('render dimensions outside supported bounds');
  const t=themes[theme];if(!t)throw new Error('unknown theme');
  const compact=width<480,fs=compact?10:12,small=compact?9:10;
  const margin={left:compact?86:166,right:compact?20:28,top:78,bottom:62};
  const plotW=width-margin.left-margin.right,plotH=height-margin.top-margin.bottom;
  const data=spec.data,parts=[];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title desc" data-spec-id="${esc(spec.id)}" data-template="${esc(spec.template)}" data-release-gate="HOLD">`);
  parts.push(`<title id="title">${esc(spec.title)}</title><desc id="desc">${esc(spec.question)}. Synthetic example only; not observed data.</desc>`);
  parts.push(`<rect width="${width}" height="${height}" fill="${t.panel}"/>`);
  parts.push(renderLabel(20,29,spec.title,{fontSize:compact?15:19,fill:t.text,weight:700,maxChars:compact?38:70}));
  parts.push(renderLabel(20,54,`${spec.question} · ${spec.unit}${spec.period?` · ${spec.period}`:''}`,{fontSize:small,fill:t.muted,maxChars:compact?47:100}));
  const x=v=>margin.left+(v-spec.scale.domain[0])/(spec.scale.domain[1]-spec.scale.domain[0])*plotW;
  const y=i=>margin.top+(i+.5)*plotH/Math.max(1,(data.items?.length||data.points?.length||data.labels?.length||data.steps?.length||1));
  const yScale=v=>margin.top+plotH-(v-spec.scale.domain[0])/(spec.scale.domain[1]-spec.scale.domain[0])*plotH;
  const gridLines=(vertical=true)=>ticks(spec.scale.domain).map(v=>vertical?`<line x1="${x(v)}" x2="${x(v)}" y1="${margin.top}" y2="${margin.top+plotH}" stroke="${t.grid}" stroke-width="1"/><text x="${x(v)}" y="${margin.top+plotH+19}" text-anchor="middle" font-size="${small}" fill="${t.muted}">${fmt(v)}</text>`:`<line x1="${margin.left}" x2="${margin.left+plotW}" y1="${yScale(v)}" y2="${yScale(v)}" stroke="${t.grid}"/><text x="${margin.left-7}" y="${yScale(v)+3}" text-anchor="end" font-size="${small}" fill="${t.muted}">${fmt(v)}</text>`).join('');
  if(spec.template==='horizontal-bar'){
    const baseline=x(0),zeroIn=baseline>=margin.left&&baseline<=margin.left+plotW;
    const gap=clamp(Number(spec.barGap??2),1,2),barH=Math.min(compact?13:22,Math.max(10,plotH/data.items.length-gap)),pitch=barH+gap,groupH=data.items.length*pitch-gap,top=margin.top+Math.max(0,(plotH-groupH)/2),bottom=top+groupH;
    ticks(spec.scale.domain).forEach(v=>{parts.push(`<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${bottom}" stroke="${t.grid}" stroke-width="1"/><text x="${x(v)}" y="${bottom+19}" text-anchor="middle" font-size="${small}" fill="${t.muted}">${fmt(v)}</text>`);});
    parts.push(`<line x1="${baseline}" x2="${baseline}" y1="${top}" y2="${bottom}" stroke="${t.muted}" stroke-width="1.3"/>`);
    data.items.forEach((item,i)=>{const yy=top+i*pitch,valueX=x(item.value),left=Math.min(baseline,valueX),barW=Math.abs(valueX-baseline),color=item.color||t.blue;parts.push(renderLabel(margin.left-10,yy+barH/2+3,item.label,{anchor:'end',fontSize:compact?9:11,fill:t.text,maxChars:compact?13:27}));parts.push(`<rect x="${left}" y="${yy}" width="${Math.max(1,barW)}" height="${barH}" rx="1" fill="${color}"/>`);const inside=(item.value>=0&&valueX>x(spec.scale.domain[1])-29)||(item.value<0&&valueX<x(spec.scale.domain[0])+29);const valueAnchor=inside?(item.value<0?'start':'end'):(item.value<0?'end':'start'),vx=inside?(item.value<0?left+5:left+barW-5):(item.value<0?left-5:left+barW+5);parts.push(`<text x="${vx}" y="${yy+barH/2+4}" text-anchor="${valueAnchor}" font-size="${compact?9:11}" font-weight="700" fill="${t.text}">${esc(fmt(item.value,spec.precision??1))}</text>`);});
    if(!zeroIn)throw new Error('bar scale domain must include the zero baseline');
  }else if(spec.template==='dot-plot'){
    parts.push(gridLines());const n=data.items.length,rowH=plotH/n;data.items.forEach((item,i)=>{const yy=y(i);parts.push(renderLabel(margin.left-10,yy+4,item.label,{anchor:'end',fontSize:fs,fill:t.text,maxChars:compact?13:25}));parts.push(`<line x1="${margin.left}" x2="${margin.left+plotW}" y1="${yy}" y2="${yy}" stroke="${t.grid}"/>`);parts.push(`<circle cx="${x(item.value)}" cy="${yy}" r="${Math.min(7,rowH/5)}" fill="${item.color||t.blue}"/><text x="${x(item.value)+9}" y="${yy+4}" font-size="${fs}" font-weight="700" fill="${t.text}">${esc(fmt(item.value,spec.precision??1))}</text>`);});
  }else if(spec.template==='line'){
    parts.push(gridLines(false));const n=data.labels.length,xx=i=>margin.left+(i/Math.max(1,n-1))*plotW;
    data.series.forEach((s,si)=>{let segment=[];const color=s.color||[t.blue,t.coral][si%2];const flush=()=>{if(segment.length>1)parts.push(`<polyline points="${segment.map(p=>`${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);segment.forEach(([cx,cy,v])=>parts.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}"><title>${esc(s.label)}: ${esc(v)} ${esc(spec.unit)}</title></circle>`));segment=[];};s.values.forEach((v,i)=>{if(v===null){flush();return;}segment.push([xx(i),margin.top+plotH-(v-spec.scale.domain[0])/(spec.scale.domain[1]-spec.scale.domain[0])*plotH,v]);});flush();});
    data.labels.forEach((label,i)=>{if(n>6&&i%Math.ceil(n/6)!==0&&i!==n-1)return;parts.push(`<text x="${xx(i)}" y="${margin.top+plotH+19}" text-anchor="middle" font-size="${small}" fill="${t.muted}">${esc(label)}</text>`);});
    data.series.forEach((s,i)=>{const lx=margin.left+i*Math.min(compact?86:128,plotW/data.series.length);parts.push(`<line x1="${lx}" x2="${lx+16}" y1="${height-19}" y2="${height-19}" stroke="${s.color||[t.blue,t.coral][i%2]}" stroke-width="2.5"/><text x="${lx+21}" y="${height-15}" font-size="${small}" fill="${t.text}">${esc(s.label)}</text>`);});
  }else if(spec.template==='slope'){
    const endpoints=data.periods,xx=[margin.left+20,margin.left+plotW-20];parts.push(gridLines(false));data.items.forEach((item,i)=>{const yy0=margin.top+plotH-(item.start-spec.scale.domain[0])/(spec.scale.domain[1]-spec.scale.domain[0])*plotH,yy1=margin.top+plotH-(item.end-spec.scale.domain[0])/(spec.scale.domain[1]-spec.scale.domain[0])*plotH,color=item.color||[t.blue,t.coral][i%2];parts.push(`<line x1="${xx[0]}" y1="${yy0}" x2="${xx[1]}" y2="${yy1}" stroke="${color}" stroke-width="2.4"/><circle cx="${xx[0]}" cy="${yy0}" r="4" fill="${color}"/><circle cx="${xx[1]}" cy="${yy1}" r="4" fill="${color}"/>`);parts.push(renderLabel(xx[0]-8,yy0+4,item.label,{anchor:'end',fontSize:small,fill:t.text,maxChars:18}));parts.push(`<text x="${xx[0]}" y="${yy0-8}" text-anchor="middle" font-size="${small}" fill="${t.text}">${fmt(item.start,spec.precision??1)}</text><text x="${xx[1]}" y="${yy1-8}" text-anchor="middle" font-size="${small}" fill="${t.text}">${fmt(item.end,spec.precision??1)}</text>`);});parts.push(`<text x="${xx[0]}" y="${margin.top+plotH+22}" text-anchor="middle" font-size="${fs}" fill="${t.muted}">${esc(endpoints[0])}</text><text x="${xx[1]}" y="${margin.top+plotH+22}" text-anchor="middle" font-size="${fs}" fill="${t.muted}">${esc(endpoints[1])}</text>`);
  }else if(spec.template==='contribution'){
    const values=data.steps.map(s=>s.type==='change'?s.change:s.total),lo=Math.min(0,...values),hi=Math.max(0,...values),domain=spec.scale?.domain||[lo,hi],zero=margin.top+plotH-(0-domain[0])/(domain[1]-domain[0])*plotH,stepW=plotW/data.steps.length,barW=Math.min(compact?22:42,stepW-2);parts.push(`<line x1="${margin.left}" x2="${margin.left+plotW}" y1="${zero}" y2="${zero}" stroke="${t.muted}"/>`);let running=0;data.steps.forEach((s,i)=>{let start,end;if(s.type==='start'){start=0;end=s.total;running=s.total;}else if(s.type==='end'){start=0;end=s.total;}else{start=running;running+=s.change;end=running;}const yv=v=>margin.top+plotH-(v-domain[0])/(domain[1]-domain[0])*plotH,top=Math.min(yv(start),yv(end)),barHeight=Math.max(1,Math.abs(yv(start)-yv(end))),xx=margin.left+i*stepW+(stepW-barW)/2,color=s.type==='change'?(s.change>=0?t.blue:t.coral):t.muted;parts.push(`<rect x="${xx}" y="${top}" width="${barW}" height="${barHeight}" fill="${color}"/><text x="${xx+barW/2}" y="${top-5}" text-anchor="middle" font-size="${small}" fill="${t.text}">${fmt(s.type==='change'?s.change:s.total,spec.precision??0)}</text>${renderLabel(xx+barW/2,margin.top+plotH+15,s.label,{anchor:'middle',fontSize:small,fill:t.muted,maxChars:11})}`);if(s.type==='change'&&i<data.steps.length-2)parts.push(`<line x1="${xx+barW}" x2="${margin.left+(i+1)*stepW+(stepW-barW)/2}" y1="${yv(running)}" y2="${yv(running)}" stroke="${t.grid}" stroke-dasharray="3 3"/>`);});
  }else if(spec.template==='scatter'){
    const [xmin,xmax]=spec.scale.domain,[ymin,ymax]=spec.scale.yDomain,sy=v=>margin.top+plotH-(v-ymin)/(ymax-ymin)*plotH,sx=v=>margin.left+(v-xmin)/(xmax-xmin)*plotW;
    ticks([ymin,ymax]).forEach(v=>{parts.push(`<line x1="${margin.left}" x2="${margin.left+plotW}" y1="${sy(v)}" y2="${sy(v)}" stroke="${t.grid}"/><text x="${margin.left-7}" y="${sy(v)+3}" text-anchor="end" font-size="${small}" fill="${t.muted}">${fmt(v)}</text>`);});
    data.points.forEach((p,i)=>parts.push(`<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5" fill="${p.color||[t.blue,t.coral][i%2]}" opacity=".9"><title>${esc(p.label)}: ${fmt(p.x)} ${esc(spec.xUnit||'')} · ${fmt(p.y)} ${esc(spec.yUnit||'')}</title></circle>`));
    parts.push(`<text x="${margin.left+plotW/2}" y="${height-25}" text-anchor="middle" font-size="${fs}" fill="${t.text}">${esc(spec.xLabel||spec.xUnit||'X')}</text><text transform="translate(16 ${margin.top+plotH/2}) rotate(-90)" text-anchor="middle" font-size="${fs}" fill="${t.text}">${esc(spec.yLabel||spec.yUnit||'Y')}</text>`);
  }
  parts.push(`<text x="${width-12}" y="${height-8}" text-anchor="end" font-size="${compact?7:9}" fill="${t.muted}">SYNTHETIC LAYOUT SPECIMEN · NOT OBSERVED DATA</text></svg>`);
  return parts.join('');
}

export const chartThemes=themes;
