import fs from 'node:fs';
const lock=JSON.parse(fs.readFileSync('assets/photos/photo-catalog.lock.json','utf8'));
const policy=JSON.parse(fs.readFileSync('content/media-policy.json','utf8'));
const media={};
for(const [id,p] of Object.entries(policy.storyMedia)){
  const a=lock.assets.find(x=>x.assetId===p.preferred);
  if(!a)throw new Error(`${id}: unknown media asset ${p.preferred}`);
  media[id]={assetId:a.assetId,src:'./'+a.src,alt:a.alt,attribution:a.attributionText,source:a.sourcePage,objectPosition:a.objectPosition,portrait:!!a.portrait};
}
const html=fs.readFileSync('treemap-v3-12.html','utf8');
const start=html.indexOf('var PHOTO_MEDIA =');
const end=html.indexOf('/* Cover media is restricted',start);
if(start<0||end<0)throw new Error('Photo-map source markers are missing.');
fs.writeFileSync('treemap-v3-12.html',html.slice(0,start)+'var PHOTO_MEDIA = '+JSON.stringify(media,null,2)+';\n'+html.slice(end));
console.log(`Synchronized ${Object.keys(media).length} photo stories from the locked catalog.`);
