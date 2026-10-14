(function(root){
  'use strict';
  var themes={
    dark:{panel:'#10171d',text:'#e8edf2',muted:'#a8b6c3',grid:'#2b3741',blue:'#5a94d4',coral:'#ef6754',border:'#35434e'},
    light:{panel:'#ffffff',text:'#18212b',muted:'#475569',grid:'#d8e0e8',blue:'#1769aa',coral:'#b42318',border:'#9aa8b5'}
  };
  function finiteArray(values){return Array.isArray(values)&&values.length>0&&values.every(Number.isFinite);}
  function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
  function hashPayload(spec){return {periodLabels:spec.period?.displayLabels,snapshotView:spec.snapshotView,dataset:spec.dataset,scalePolicy:spec.scalePolicy};}
  function canonicalData(spec){return stable(hashPayload(spec));}
  function validate(spec){
    var errors=[];
    if(!spec||typeof spec!=='object')return ['ChartSpec must be an object'];
    ['schemaVersion','specId','datasetId','datasetHash','question','unit','period','templateId','scalePolicy','dataset','sourceIds','themeVersion','rendererVersion','provenance','releaseGate'].forEach(function(k){if(!(k in spec))errors.push('missing '+k);});
    if(spec.schemaVersion!==1)errors.push('unsupported schemaVersion');
    if(!['PASS','HOLD'].includes(spec.releaseGate))errors.push('releaseGate must be PASS or HOLD');
    if(typeof spec.datasetHash!=='string'||!/^[a-f0-9]{64}$/.test(spec.datasetHash))errors.push('datasetHash must be a SHA-256 hex digest');
    if(!Array.isArray(spec.sourceIds))errors.push('sourceIds must be an array');
    if(spec.provenance&&spec.provenance.status==='VERIFIED'&&(!Array.isArray(spec.sourceIds)||spec.sourceIds.length===0))errors.push('verified datasets require at least one sourceId');
    if(spec.releaseGate==='PASS'&&(!spec.provenance||spec.provenance.status!=='VERIFIED'||!spec.sourceIds?.length))errors.push('release PASS requires verified provenance and sourceIds');
    var labels=spec.period?.displayLabels;
    if(!Array.isArray(labels)||labels.length===0||labels.some(x=>typeof x!=='string'||!x.trim()))errors.push('period.displayLabels must contain non-empty labels');
    var series=spec.dataset?.series;
    if(!Array.isArray(series)||series.length===0)errors.push('dataset.series must be non-empty');
    else{
      var ids=new Set();
      series.forEach(function(s,i){
        if(!s||typeof s.id!=='string'||!s.id)errors.push('series['+i+'] requires id');
        if(ids.has(s.id))errors.push('duplicate series id '+s.id);ids.add(s.id);
        if(typeof s.label!=='string'||!s.label.trim())errors.push('series['+i+'] requires label');
        if(!/^#[0-9a-f]{6}$/i.test(s.color||''))errors.push('series['+i+'] requires hex color');
        if(!finiteArray(s.values))errors.push('series['+i+'] values must be finite numbers');
        if(Array.isArray(labels)&&s.values?.length!==labels.length)errors.push('series['+i+'] values must match period labels');
      });
    }
    var domain=spec.scalePolicy?.domain;
    if(!Array.isArray(domain)||domain.length!==2||!domain.every(Number.isFinite)||domain[0]>=domain[1])errors.push('scalePolicy.domain must be an increasing numeric pair');
    if(spec.templateId==='horizontal-bar'&&(spec.scalePolicy?.baseline!==0||domain?.[0]>0))errors.push('horizontal bars must use a zero baseline and include zero in the domain');
    var snapDomain=spec.snapshotView?.scalePolicy?.domain;
    if(spec.snapshotView?.templateId==='horizontal-bar'&&(spec.snapshotView.scalePolicy?.baseline!==0||!Array.isArray(snapDomain)||snapDomain[0]>0||snapDomain[1]<=snapDomain[0]))errors.push('snapshot horizontal bars must use an increasing domain containing zero');
    var snapshot=spec.dataset?.partySnapshot;
    if(!Array.isArray(snapshot)||!snapshot.length)errors.push('dataset.partySnapshot must be non-empty');
    else{
      var snapshotIds=snapshot.map(p=>p.id),expectedIds=spec.snapshotView?.seriesIds;
      if(new Set(snapshotIds).size!==snapshotIds.length)errors.push('dataset.partySnapshot ids must be unique');
      if(!Array.isArray(expectedIds)||snapshotIds.length!==expectedIds.length||snapshotIds.some(id=>!expectedIds.includes(id)))errors.push('snapshotView.seriesIds must exactly cover partySnapshot ids');
      var latest=new Map((series||[]).map(s=>[s.id,s.values?.[s.values.length-1]]));
      snapshot.forEach(function(p,i){
        if(!Number.isFinite(p.value))errors.push('partySnapshot['+i+'] value must be finite');
        if(latest.has(p.id)&&Number.isFinite(latest.get(p.id))&&p.value!==latest.get(p.id))errors.push('partySnapshot and latest series value differ for '+p.id);
      });
    }
    if(spec.provenance&&spec.provenance.status!=='VERIFIED'&&spec.releaseGate!=='HOLD')errors.push('unverified provenance must remain HOLD');
    return errors;
  }
  function gate(spec,computedHash){var errors=validate(spec);if(computedHash&&computedHash!==spec.datasetHash)errors.push('datasetHash does not match canonicalized data');var status=errors.length?'FAIL':(spec.releaseGate==='HOLD'||spec.provenance.status!=='VERIFIED'||!spec.sourceIds.length?'HOLD':'PASS');return {status:status,errors:errors};}
  function gap(snapshot,a,b){var values=new Map(snapshot.map(p=>[p.id,p.value]));if(!values.has(a)||!values.has(b))throw new Error('Unknown series in difference transform');return Number(Math.abs(values.get(a)-values.get(b)).toFixed(1));}
  root.BIHIVE_CHARTS=Object.freeze({schemaVersion:1,themes:Object.freeze(themes),validate:validate,gate:gate,gap:gap,canonicalData:canonicalData});
})(typeof window!=='undefined'?window:globalThis);
