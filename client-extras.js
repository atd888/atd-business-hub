/* Optional private photos and aggregate, cookie-free enquiry measurement. */
(()=>{'use strict';
 const cfg=window.ATD_CLIENT_CONFIG||{},endpoint='https://ujopvetvzfxgcxrphonx.supabase.co/functions/v1/atd-enquiry-tools';
 const enabled=()=>cfg.submissionEnabled===true&&cfg.allowedOrigins?.includes(location.origin);
 const sources=['google','instagram','youtube','facebook','other','direct'];
 function source(){
  const p=new URLSearchParams(location.search),given=(p.get('utm_source')||p.get('source')||'').toLowerCase();
  if(sources.includes(given))return given;
  let host='';try{host=new URL(document.referrer).hostname;}catch{}
  for(const [domain,name] of [['google.com','google'],['google.co.uk','google'],['instagram.com','instagram'],['youtube.com','youtube'],['youtu.be','youtube'],['facebook.com','facebook']])if(host===domain||host.endsWith('.'+domain))return name;
  return host&&host!==location.hostname?'other':'direct';
 }
 const channel=source();window.ATDAttribution={source:channel};
 const measure=!navigator.globalPrivacyControl&&navigator.doNotTrack!=='1';
 async function call(body){if(!enabled())throw new Error('Photos are disabled in this preview.');const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey},body:JSON.stringify(body),credentials:'omit',signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'The photo service is unavailable.');return data;}
 const params=new URLSearchParams(location.search);let started=false;
 if(!params.has('verify')&&!params.has('token'))document.getElementById('bookingForm')?.addEventListener('change',()=>{if(!started&&measure&&enabled()){started=true;call({action:'count',event:'form_start',source:channel}).catch(()=>{});}},{once:false});
 let photoToken='',busy=false,host;
 async function prepare(token){
  if(!enabled()||!/^[a-f0-9]{64}$/i.test(token))return;
  photoToken=token;
  if(!host){host=document.createElement('section');host.className='panel photo-attachments';host.innerHTML='<h2>Add project photos</h2><p>Optional: attach up to four photos to your email-confirmed enquiry. Only ATD can view them. Avoid people, documents and personal information unrelated to the work.</p><label for="projectPhotoFiles">Choose project photos</label><input id="projectPhotoFiles" type="file" accept="image/*" multiple><p class="small-print">Photos are resized before upload. Keep your originals. If a format cannot be opened, try JPEG or send it on WhatsApp.</p><button id="uploadProjectPhotos" class="button" type="button">Attach selected photos</button><p id="photoUploadStatus" role="status" aria-live="polite"></p>';document.querySelector('main').append(host);host.querySelector('button').addEventListener('click',upload);}
  try{const data=await call({action:'photo_status',token});host.hidden=false;host.querySelector('[role=status]').textContent=data.count+' of 4 photos attached.';host.querySelector('button').disabled=data.count>=4;host.dataset.count=data.count;}
  catch(error){host.hidden=true;}
 }
 async function resize(file){
  if(file.size>20000000)throw new Error('Choose a photo smaller than 20 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This photo format could not be opened. Try JPEG or PNG.'));image.src=url;});
   if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>50000000)throw new Error('This photo is too large to process on this device.');
   const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL('image/jpeg',.75);if(data.length>2000000)throw new Error('This photo is still too large. Choose a smaller copy.');return data;
  }finally{URL.revokeObjectURL(url);}
 }
 async function upload(){
  if(busy||!photoToken)return;const files=[...host.querySelector('input').files],status=host.querySelector('[role=status]'),button=host.querySelector('button');
  if(!files.length){status.textContent='Choose at least one photo first.';return;}
  if(files.length+Number(host.dataset.count||0)>4){status.textContent='Up to four photos can be attached in total. Choose fewer photos.';return;}
  busy=true;button.disabled=true;let sent=0;
  try{for(const file of files){status.textContent='Attaching photo '+(sent+1)+' of '+files.length+'…';const photo=await resize(file);const data=await call({action:'photo_upload',token:photoToken,photo});if(data.saved)sent++;}host.querySelector('input').value='';await prepare(photoToken);status.textContent=sent+' photo'+(sent===1?'':'s')+' attached. ATD can view them with your enquiry.';}
  catch(error){host.querySelector('input').value='';let count='';try{const data=await call({action:'photo_status',token:photoToken});host.dataset.count=data.count;count=' Current attached count: '+data.count+' of 4.';}catch{}status.textContent=(sent?sent+' photo(s) attached. ':'')+error.message+' Your enquiry remains saved.'+count+' Choose only missing photos before retrying.';}
  finally{busy=false;button.disabled=Number(host.dataset.count||0)>=4;}
 }
 window.addEventListener('atd:email-confirmed',event=>prepare(event.detail.token));
 if(params.get('token'))prepare(params.get('token'));
})();
