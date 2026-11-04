/* Public ATD questionnaire. No customer details are saved in browser storage. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), schema=window.ATDEnquiry;
 const config=window.ATD_CLIENT_CONFIG||{};
 const steps=[...document.querySelectorAll('.form-step')];
 let currentStep=0, furthestStep=0, renderedSelection='', renderedRequestType='', renderedService='', propertyTypeTouched=false, paintingCounter=0, wallpaperCounter=0, roomCounter=0, sending=false, saved=false;
 let lastFrameHeight=0;
 const drafts={};
 const requestType=()=> 'quote';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const options=(items,value='')=>items.map(item=>{const option=typeof item==='object'?item:{value:item,label:item};return `<option value="${esc(option.value)}"${option.value===value?' selected':''}>${esc(option.label)}</option>`;}).join('');
 function field(prefix,key,label,type='text',choices=[],required=false,placeholder='') {
  const id=prefix+'-'+key, common=`id="${id}" data-key="${key}" ${required?'required':''}`;
  let input=type==='select'?`<select ${common}>${options(choices)}</select>`:type==='textarea'?`<textarea ${common} maxlength="700" rows="3" placeholder="${esc(placeholder)}"></textarea>`:`<input ${common} type="${type}" ${type==='number'?'min="0" max="10000" step="0.01" inputmode="decimal"':'maxlength="250"'} placeholder="${esc(placeholder)}">`;
  return `<div class="field"><label for="${id}">${label}${required?' *':''}</label>${input}</div>`;
 }
 function checks(prefix,key,label,choices){return `<fieldset class="checks"><legend>${label}</legend><div class="check-grid">${choices.map((x,i)=>`<label class="check-row"><input type="checkbox" data-key="${key}" value="${esc(x)}" id="${prefix}-${key}-${i}"><span>${esc(x)}</span></label>`).join('')}</div></fieldset>`;}
 function readFields(host){const obj={};host.querySelectorAll('[data-key]').forEach(el=>{if(el.type==='checkbox'){if(!obj[el.dataset.key])obj[el.dataset.key]=[];if(el.checked)obj[el.dataset.key].push(el.value);}else obj[el.dataset.key]=el.value.trim();});return obj;}
 function restoreFields(host,obj={}){host.querySelectorAll('[data-key]').forEach(el=>{if(el.type==='checkbox')el.checked=(obj[el.dataset.key]||[]).includes(el.value);else if(obj[el.dataset.key]!==undefined)el.value=obj[el.dataset.key];});}
 const COLOURS=['Not sure — please advise','Plain white','A colour'];
 const WOOD_FINISH=[{value:'Not sure — please advise',label:'Not sure — please advise'},{value:'Eggshell',label:'Eggshell — a soft sheen'},{value:'Satin / satinwood',label:'Satin / satinwood — a gentle sheen'},{value:'Gloss',label:'Gloss — a shiny finish'}];
 const WALL_FINISH=[{value:'Not sure — please advise',label:'Not sure — please advise'},{value:'Matt',label:'Matt — no shine'},{value:'Durable / washable matt',label:'Washable matt — easier to clean'},{value:'Soft sheen',label:'Soft sheen — a subtle glow'},{value:'Silk',label:'Silk — a smooth sheen'}];
 const CONDITION=['Not sure — please assess','Good existing finish','Scuffed or marked','Cracks / dents / damage','Peeling / flaking paint','Bare or new surface'];
 const KINDS=['Doors','Walls & ceilings','Windows','Skirting & other woodwork','Front / external doors','External windows','Exterior walls / house front','Exterior woodwork','Railings / gates / fences'];
 const INTERIOR_WORK=['Walls','Ceilings','Doors','Windows','Skirting & other woodwork'];
 const EXTERIOR_WORK=['Front / external doors','External windows','Exterior walls / house front','Exterior woodwork','Railings / gates / fences'];
 const WALLPAPER_WORK=['Feature wall','Complete room','Several walls','Remove old wallpaper','Wall preparation','Not sure yet'];
 const REFURB_WORK=['Painting & decorating','Wallpapering','Bathroom refurbishment','Kitchen work','Flooring','Woodwork / doors','Plastering / surface repairs','Layout changes','Plumbing','Electrical work','Not sure yet'];
 function priorWork(scope,legacy=[]){return Array.isArray(scope.work)?scope.work:legacy.filter((value,index,list)=>value&&list.indexOf(value)===index);}
 function roomDetails(card){const data=readFields(card),previous=JSON.parse(card.dataset.legacyWork||'[]');return {...data,...(previous.length?{work:previous}:{})};}

 function paintingFields(card,previous={}){
  const prefix=card.dataset.prefix,selected=card.querySelector('[data-key=kind]').value,type=schema.paintingKind(selected),kind=type.kind,exterior=type.exterior;
  const host=card.querySelector('.item-fields');
  if(!selected){host.innerHTML='<p class="item-empty">Choose what needs painting to see the relevant questions.</p>';notifyHeight();return;}
  let html='';
  if(kind==='Doors'){
   html='<h4 class="field-group full">Door & frame</h4>'+field(prefix,'quantity','How many doors?','number',[],true)+field(prefix,'location','Interior or exterior?','select',exterior?['Exterior']:['Not sure','Interior','Exterior'],true)+field(prefix,'sides','Which sides need painting?','select',exterior?['Not sure','Outside only','Inside only','Inside and outside']:['Not sure','One side','Both sides'],true)+field(prefix,'include','Include the frame?','select',['Not sure','Door only','Door and frame','Frame only'],true);
  }else{
   html=field(prefix,'area','Room, location or item name','text',[],true,'For example: front bedroom, kitchen window or staircase');
   if(kind==='Walls & ceilings')html+=field(prefix,'work','Which surfaces?','select',[{value:'',label:'Choose surfaces…'},'Walls and ceiling','Walls only','Ceiling only','Not sure'],true);
   if(kind==='Windows')html+=field(prefix,'quantity','How many windows?','number',[],true)+field(prefix,'sides','Which faces need painting?','select',(exterior?['Not sure','Outside only','Inside and outside']:['Not sure','Inside only','Outside only','Inside and outside']),true);
   if(['Skirting & other woodwork','Exterior woodwork','Railings / gates / fences'].includes(kind))html+=field(prefix,'units','Approximate quantity or length (optional)','text',[],false,'For example: 12 metres of skirting or one staircase');
   if(['Walls & ceilings','Exterior walls'].includes(kind))html+='<details class="optional-details full"><summary>Measurements <span>Optional — add them if you know</span></summary><div class="fields two">'+field(prefix,'length','Approximate length (metres, optional)','number')+field(prefix,'width','Approximate width (metres, optional)','number')+field(prefix,'height','Approximate height (metres, optional)','number')+'</div></details>';
   if(kind==='Exterior walls'||(kind==='Windows'&&exterior))html+=field(prefix,'access_height','Height / storeys to reach','select',['Not sure','Ground floor only','Up to two storeys','Three or more storeys'],true);
  }
  const essential=html;
  const colourFields=field(prefix,'colour','White or a colour?','select',COLOURS,true)+field(prefix,'colour_name','Colour name or code (optional)','text',[],false,'Brand and colour code, if chosen')+field(prefix,'finish','Paint finish','select',kind==='Exterior walls'?['Not sure — please advise','Smooth masonry matt','Textured masonry finish']:['Exterior woodwork','Railings / gates / fences'].includes(kind)?['Not sure — please advise','Satin / satinwood','Gloss','Woodstain','Clear varnish']:['Doors','Windows','Skirting & other woodwork'].includes(kind)?WOOD_FINISH:WALL_FINISH,true);
  host.innerHTML=essential+'<details class="optional-details full"><summary>Colour, finish & surface condition <span>Optional — leave “Not sure” if you need advice</span></summary><div class="fields two">'+colourFields+field(prefix,'condition','Current surface condition','select',CONDITION,true)+'</div>'+field(prefix,'preparation','Repairs or preparation to discuss (optional)','textarea',[],false,'For example: filling dents, sanding old gloss or loose paint')+'</details>';

  restoreFields(host,previous);
  host.querySelectorAll('select').forEach(select=>{if(select.selectedIndex<0)select.selectedIndex=0;});
  if(exterior&&host.querySelector('[data-key=location]'))host.querySelector('[data-key=location]').value='Exterior';
  const colour=host.querySelector('[data-key=colour]'),colourName=host.querySelector('[data-key=colour_name]');
  const updateColour=()=>{colourName.closest('.field').hidden=colour.value!=='A colour';if(colour.value==='Plain white')colourName.value='';notifyHeight();};colour.addEventListener('change',updateColour);updateColour();
  if(kind==='Doors'||kind==='Windows'){
   const count=host.querySelector('[data-key=quantity]');count.min='1';count.max='200';count.step='1';
  }
  notifyHeight();
 }
 function addPainting(initial={},activate=false){
  const host=$('paintingItems');if(host.children.length>=12){showError('You can add up to 12 separate items here. Use the notes for additional areas.');return;}
  const prefix='paint'+(++paintingCounter),card=document.createElement('details');card.className='item-card';card.open=true;card.dataset.prefix=prefix;
  card.innerHTML=`<summary class="item-summary"><span class="item-number"></span><strong data-item-title>New room or item</strong><span class="item-toggle">Edit</span></summary><div class="item-content"><div class="item-head"><p>Tell us about this room or item.</p><button type="button" data-remove>Remove</button></div>${field(prefix,'kind','What needs painting?','select',[{value:'',label:'Choose a room or item…'},...(renderedSelection==='exterior-painting'?[...KINDS.slice(4),...KINDS.slice(0,4)]:KINDS)],true)}<div class="fields two item-fields"></div><button type="button" class="button secondary item-done" data-item-done>Done with this item ✓</button></div>`;
  host.appendChild(card);if(initial.item_type||initial.kind)card.querySelector('[data-key=kind]').value=initial.item_type||initial.kind;
  paintingFields(card,initial);setupItem(card,activate);
  card.querySelector('[data-key=kind]').addEventListener('change',()=>{const previous=readFields(card.querySelector('.item-fields'));paintingFields(card,previous);});
  card.querySelector('[data-remove]').addEventListener('click',()=>{card.remove();renumber(host);notifyHeight();});renumber(host);notifyHeight();
 }
 function addWallpaper(initial={},activate=false){
  const host=$('wallpaperItems');if(host.children.length>=12){showError('Add up to 12 wallpaper areas. Use the notes for further areas.');return;}
  const prefix='paper'+(++wallpaperCounter),card=document.createElement('details');card.className='item-card';card.open=true;
  card.innerHTML=`<summary class="item-summary"><span class="item-number"></span><strong data-item-title>New wall or room</strong><span class="item-toggle">Edit</span></summary><div class="item-content"><div class="item-head"><p>Tell us where the wallpaper will go.</p><button type="button" data-remove>Remove</button></div><div class="fields two">${field(prefix,'wall','Wall or room name','text',[],true,'For example: bedroom feature wall')}${field(prefix,'work','Extent for this area (optional)','select',[{value:'',label:'Choose if known'},'Feature wall','Complete room','Several walls','Not sure'])}</div><details class="optional-details"><summary>Measurements & wall preparation <span>Optional — add what you know</span></summary><div class="fields two">${field(prefix,'width','Approximate wall width (metres)','number')}${field(prefix,'height','Approximate wall height (metres)','number')}${field(prefix,'covering','Existing covering','select',['Not sure','Painted wall','Old wallpaper','Bare / new surface'])}${field(prefix,'removal','Does old paper need removing?','select',['Not sure','Yes','No'])}${field(prefix,'condition','Wall condition','select',CONDITION)}</div></details><details class="optional-details"><summary>Wallpaper product & roll details <span>Optional — if you have chosen your paper</span></summary><div class="fields two">${field(prefix,'product','Chosen wallpaper name or product link','text')}${field(prefix,'pattern_repeat','Pattern repeat (cm)','number')}${field(prefix,'roll_width','Roll width (cm)','number')}${field(prefix,'roll_length','Roll length (metres)','number')}${field(prefix,'rolls','Rolls already supplied','number')}</div></details></div>`;
  card.querySelector('.item-content').insertAdjacentHTML('beforeend','<button type="button" class="button secondary item-done" data-item-done>Done with this area ✓</button>');host.appendChild(card);restoreFields(card,initial);setupItem(card,activate);card.querySelector('[data-remove]').addEventListener('click',()=>{card.remove();renumber(host);notifyHeight();});renumber(host);notifyHeight();
 }
 function addRoom(initial={},activate=false){
  const host=$('refurbRooms');if(host.children.length>=12){showError('Add up to 12 rooms or areas. Describe further areas in the notes.');return;}
  const prefix='room'+(++roomCounter),card=document.createElement('details');card.className='item-card';card.open=true;card.dataset.legacyWork=JSON.stringify(Array.isArray(initial.work)?initial.work:[]);
  card.innerHTML=`<summary class="item-summary"><span class="item-number"></span><strong data-item-title>New room or area</strong><span class="item-toggle">Edit</span></summary><div class="item-content"><div class="item-head"><p>Tell us what you would like to change.</p><button type="button" data-remove>Remove</button></div>${field(prefix,'area','Room or area','text',[],true,'For example: kitchen, bathroom, bedroom or whole flat')}${field(prefix,'priorities','What would you like changed here? (optional)','textarea',[],false,'What stays, what changes, and the finish you would like')}</div>`;
  card.querySelector('.item-content').insertAdjacentHTML('beforeend','<button type="button" class="button secondary item-done" data-item-done>Done with this area ✓</button>');host.appendChild(card);restoreFields(card,initial);setupItem(card,activate);card.querySelector('[data-remove]').addEventListener('click',()=>{card.remove();renumber(host);notifyHeight();});renumber(host);notifyHeight();
 }
 function revealControl(control){let ancestor=control.parentElement;while(ancestor){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}}
 function setupItem(card,activate){
  function title(){const data=readFields(card),name=data.area||data.wall||data.kind||'New room or item';card.querySelector('[data-item-title]').textContent=name;}
  card.addEventListener('input',title);card.addEventListener('change',title);card.addEventListener('toggle',notifyHeight);
  card.querySelector('[data-item-done]').addEventListener('click',()=>{
   const invalid=[...card.querySelectorAll('input,select,textarea')].find(el=>!el.checkValidity());
   if(invalid){revealControl(invalid);invalid.reportValidity();return;}
   card.open=false;card.querySelector('summary').focus();notifyHeight();
  });
  title();
  if(activate){[...card.parentElement.children].forEach(other=>{if(other!==card)other.open=false;});card.scrollIntoView({block:'start',behavior:'auto'});card.querySelector('input,select,textarea')?.focus({preventScroll:true});}
 }
 function renumber(host){host.querySelectorAll('.item-number').forEach((el,i)=>el.textContent=i+1);host.querySelectorAll('[data-remove]').forEach(el=>el.disabled=host.children.length===1);}
 function captureScope(){
  if(renderedService==='painting-decorating')return {...readFields($('paintingWork')),items:[...$('paintingItems').children].map(card=>schema.normalizePaintingItem(readFields(card)))};
  if(renderedService==='wallpapering')return {...readFields($('wallpaperWork')),walls:[...$('wallpaperItems').children].map(readFields)};
  if(renderedService==='bathroom-refurbishments')return readFields($('bathroomScope'));
  if(renderedService==='full-refurbishments')return {...readFields($('refurbWork')),...readFields($('refurbCommon')),rooms:[...$('refurbRooms').children].map(roomDetails)};
  return {};
 }
 function renderService(){
  const selection=$('service').value,goal=requestType(),project=schema.resolveService(selection),service=project?.key||'';if(selection===renderedSelection&&goal===renderedRequestType)return;
  if(renderedSelection)drafts[renderedSelection+':'+renderedRequestType]=captureScope();
  renderedSelection=selection;renderedRequestType=goal;renderedService=service;const scope=drafts[selection+':'+goal]||{},host=$('serviceFields');
  $('stepTitle1').textContent='What work do you need?';
  if(project?.propertyType&&!propertyTypeTouched)$('property_type').value=project.propertyType;
  if(service==='painting-decorating'){
   const work=priorWork(scope,(scope.items||[]).map(item=>item.item_type||item.kind));
   const choices=[...(selection==='exterior-painting'?EXTERIOR_WORK:INTERIOR_WORK)];
   work.forEach(value=>{if(!choices.includes(value))choices.push(value);});
   host.innerHTML='<div id="paintingWork" class="work-checklist">'+checks('paint-work','work','Choose the work you have in mind *',choices)+'</div><p class="work-help">Select all that apply. You can add room or item details below if you have them.</p><details class="optional-details scope-detail-disclosure"><summary>Rooms, quantities & finishes <span>Optional — add details for individual rooms or items</span></summary><div id="paintingItems"></div><button class="button secondary add-item" type="button" id="addPainting">+ Add a room or item</button></details>';
   restoreFields($('paintingWork'),{work});
   (scope.items||[]).forEach(item=>addPainting(item));$('addPainting').addEventListener('click',()=>addPainting({},true));
  }else if(service==='wallpapering'){
   const legacy=(scope.walls||[]).map(wall=>wall.work).filter(value=>typeof value==='string');
   const work=priorWork(scope,legacy),choices=[...WALLPAPER_WORK];work.forEach(value=>{if(!choices.includes(value))choices.push(value);});
   host.innerHTML='<div id="wallpaperWork" class="work-checklist">'+checks('paper-work','work','Choose the work you have in mind *',choices)+'</div><p class="work-help">Select all that apply. Wall sizes and wallpaper product details can be discussed later.</p><details class="optional-details scope-detail-disclosure"><summary>Walls, measurements & chosen wallpaper <span>Optional — add detail for a particular wall or room</span></summary><div id="wallpaperItems"></div><button class="button secondary add-item" type="button" id="addWallpaper">+ Add a wall or room</button></details>';
   restoreFields($('wallpaperWork'),{work});
   (scope.walls||[]).forEach(item=>addWallpaper(item));$('addWallpaper').addEventListener('click',()=>addWallpaper({},true));
  }else if(service==='bathroom-refurbishments'){
   host.innerHTML=`<div id="bathroomScope">${checks('bath','work','Choose the work you have in mind *',['Decorating / refresh','Wall tiling','Floor tiling','Bath / shower','Basin / vanity','Toilet','A fuller refurbishment','Not sure yet'])}<div class="fields two">${field('bath','layout','Does the layout need changing?','select',['Not sure','Keep the existing layout','Move fittings / change layout'])}${field('bath','only_bathroom','Is this your only bathroom?','select',['Not sure','Yes','No'])}</div><details class="optional-details"><summary>Measurements, fittings & other details <span>Optional — we can discuss these with you</span></summary><div class="fields two">${field('bath','length','Room length (metres)','number')}${field('bath','width','Room width (metres)','number')}${field('bath','wall_tiles','Wall tiling area (m²)','number')}${field('bath','floor_tiles','Floor tiling area (m²)','number')}${field('bath','plumbing','Plumbing changes','select',['Not sure','Keep existing positions','Move / replace connections'])}${field('bath','electrical','Electrical changes','select',['Not sure','No changes requested','Changes requested'])}${field('bath','ventilation','Ventilation changes','select',['Not sure','No changes requested','Changes requested'])}</div>${field('bath','issues','Leaks, damp or other issues','textarea')}${field('bath','product','Fittings, tiles or product links','textarea')}</details></div>`;
   restoreFields($('bathroomScope'),scope);
  }else if(service==='full-refurbishments'){
   const legacy=(scope.rooms||[]).flatMap(room=>Array.isArray(room.work)?room.work:[]);
   const work=priorWork(scope,legacy),choices=[...REFURB_WORK];work.forEach(value=>{if(!choices.includes(value))choices.push(value);});
   host.innerHTML='<div id="refurbWork" class="work-checklist">'+checks('refurb-work','work','Choose the work you have in mind *',choices)+'</div><p class="work-help">Select all that apply for the property. Add room notes only if useful; specialist requirements and responsibilities are agreed before work is included.</p>'+`<details class="optional-details scope-detail-disclosure"><summary>Rooms & priorities <span>Optional — tell us more about particular rooms or areas</span></summary><div id="refurbRooms"></div><button class="button secondary add-item" type="button" id="addRoom">+ Add a room or area</button></details><details class="optional-details"><summary>Property size, plans & specialist work <span>Optional — add what you know</span></summary><div id="refurbCommon"><div class="fields two">${field('refurb','bedrooms','Number of bedrooms','number')}${field('refurb','floor_area','Property floor area (m²)','number')}</div>${field('refurb','plans','Plans / permissions already available?','select',['Not sure / to discuss','No plans yet','Plans available','Permissions / approvals being discussed'])}${field('refurb','specialists','Structural or specialist changes to discuss','textarea',[],false,'Describe any layout changes or specialist work you have in mind.')}</div></details>`;
   restoreFields($('refurbWork'),{work});restoreFields($('refurbCommon'),scope);(scope.rooms||[]).forEach(item=>addRoom(item));$('addRoom').addEventListener('click',()=>addRoom({},true));
  }else host.innerHTML='';notifyHeight();
 }
 function collect(){const contact={name:$('customer_name').value,email:$('customer_email').value,phone:$('customer_phone').value,address:$('property_address').value,postcode:$('property_postcode').value};const details={schema_version:1,attribution:window.ATDAttribution||{source:'direct'},request_type:requestType(),service_key:schema.resolveService($('service').value)?.key||'',service_variant:schema.resolveService($('service').value)?.label||'',scope:captureScope(),property:{address:contact.address.trim(),postcode:contact.postcode.trim().toUpperCase(),property_type:$('property_type').value,occupancy:$('occupancy').value,access:$('access').value.trim(),parking:$('parking').value.trim()},preferences:{preferred_date:$('preferred_date').value,timing:$('timing').value.trim(),materials:$('materials').value,budget:$('budget').value.trim(),discount_requested:$('labour_offer').checked},notes:$('project_notes').value.trim()};return {contact,details};}
 function showError(message){$('formError').textContent=message;$('formError').classList.remove('hidden');$('formError').focus();$('formError').scrollIntoView({block:'center',behavior:'auto'});notifyHeight();}
 function clearErrors(){ $('formError').classList.add('hidden');document.querySelectorAll('[aria-invalid=true]').forEach(el=>el.removeAttribute('aria-invalid')); }
 function nativeValid(step){const controls=[...steps[step].querySelectorAll('input,select,textarea')];const invalid=controls.find(el=>!el.checkValidity());if(invalid){revealControl(invalid);if(currentStep!==step)showStep(step);invalid.setAttribute('aria-invalid','true');invalid.reportValidity();return false;}return true;}
 function revealScopeError(details){const ids={'painting-decorating':'paintingWork',wallpapering:'wallpaperWork','full-refurbishments':'refurbWork'},host=$(ids[details.service_key]);if(host&&!readFields(host).work?.length){host.querySelector('fieldset')?.setAttribute('aria-invalid','true');host.querySelector('input')?.focus();}}
 function validateStep(step){clearErrors();if(!nativeValid(step))return false;
  if(step===0){if($('service').value==='project-discussion'&&requestType()!=='appointment'){showError('Choose a service for your quotation.');return false;}if(!$('service').value){showError('Choose your main service to continue.');return false;}renderService();}
  if(step===1){const {details}=collect(),errors=schema.validateProject(details);if(Object.keys(errors).length){revealScopeError(details);showError(Object.values(errors)[0]);return false;}if(details.request_type!=='appointment'&&details.service_key==='wallpapering'&&details.scope.walls.some(x=>!x.wall.trim())){showError('Give each wallpaper area a room or wall name.');return false;}}
  if(step===2){const {contact}=collect(),errors=schema.validateContact(contact);if(Object.keys(errors).length){const key=Object.keys(errors)[0],ids={name:'customer_name',email:'customer_email',phone:'customer_phone',address:'property_address',postcode:'property_postcode'},el=$(ids[key]);if(currentStep!==step)showStep(step);el.setAttribute('aria-invalid','true');el.focus();showError(errors[key]);return false;}}
  return true;
 }
 const stepLabels=['Choose project','Work needed','Your details','Check & send'];
 function showStep(step){
  currentStep=step;furthestStep=Math.max(furthestStep,step);steps.forEach((el,i)=>el.classList.toggle('hidden',i!==step));
  document.querySelectorAll('.steps li').forEach((el,i)=>{el.classList.toggle('is-complete',i<step);if(i===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');el.querySelector('button').disabled=i>furthestStep;});
  $('backBtn').classList.toggle('hidden',step===0);$('nextBtn').classList.toggle('hidden',step===3);$('submitBtn').classList.toggle('hidden',step!==3);
  $('nextBtn').textContent=['Next: work needed →','Next: your details →','Next: check request →'][step]||'Next →';
  if(step===3)renderReview();updateContext();$('stepTitle'+step).focus({preventScroll:true});
  if(window===window.parent)window.scrollTo({top:document.querySelector('.step-navigation').getBoundingClientRect().top+window.scrollY-12,behavior:'auto'});
  notifyHeight();if(window!==window.parent)postToParent({type:'ATD_ENQUIRY_STEP',step});
 }
 function updateContext(){const host=$('projectContext'),project=schema.resolveService($('service').value);host.classList.toggle('hidden',currentStep===0||!project);host.textContent=project?project.label:'';}
 document.querySelectorAll('[data-edit-step]').forEach(button=>button.addEventListener('click',()=>{if(sending||saved)return;clearErrors();showStep(Number(button.dataset.editStep));}));
 document.querySelectorAll('[data-progress-step]').forEach(button=>button.addEventListener('click',()=>{
  const target=Number(button.dataset.progressStep);if(target>furthestStep||sending||saved)return;
  if(target>currentStep){for(let i=currentStep;i<target;i++)if(!validateStep(i)){showStep(i);return;}}
  clearErrors();showStep(target);
 }));
 function renderReview(){
  const {contact,details}=collect();$('reviewContact').textContent=`${contact.name.trim()}\n${contact.email.trim()}\n${contact.phone.trim()}\n${contact.address.trim()}\n${contact.postcode.trim().toUpperCase()}`;
  const host=$('reviewScope');host.replaceChildren();
  schema.summary(details).replace('ATD PROJECT SPEC v1\nRequest: Quotation','Project overview').split(/\n\s*\n/).filter(Boolean).forEach(text=>{const card=document.createElement('section');card.className='review-block';text.split('\n').forEach((line,i)=>{const row=document.createElement(i===0?'h4':'p');row.textContent=line;card.append(row);});host.append(card);});
 }
 $('nextBtn').addEventListener('click',()=>{if(sending||saved)return;if(validateStep(currentStep))showStep(Math.min(3,currentStep+1));});$('backBtn').addEventListener('click',()=>{if(sending||saved)return;clearErrors();showStep(Math.max(0,currentStep-1));});
 $('service').addEventListener('change',()=>{clearErrors();renderService();});document.querySelectorAll('[data-service-choice]').forEach(radio=>radio.addEventListener('change',()=>{$('service').value=radio.value;clearErrors();renderService();}));$('property_type').addEventListener('change',()=>{propertyTypeTouched=true;});
 $('bookingForm').addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');});
 function ready(){return config.submissionEnabled===true&&config.verificationEnabled!==false&&typeof config.endpoint==='string'&&/^https:\/\//.test(config.endpoint)&&typeof config.publishableKey==='string'&&config.publishableKey.length>10&&Array.isArray(config.allowedOrigins)&&config.allowedOrigins.includes(window.location.origin);}
 async function callFunction(payload){if(!ready())throw new Error('This preview does not send enquiries or emails. Please contact ATD directly if you would like to discuss a real project.');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);try{const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':config.publishableKey},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit'});let data={};try{data=await response.json();}catch{}if(!response.ok)throw new Error(data.error||'The enquiry service could not complete this request. Please try later or contact ATD.');return data;}catch(error){if(error.name==='AbortError')throw new Error('The service took too long to respond. Please contact ATD before sending again, in case the enquiry was saved.');throw error;}finally{clearTimeout(timeout);}}
 $('bookingForm').addEventListener('submit',async event=>{
  event.preventDefault();if(sending||saved)return;if(currentStep<3){if(validateStep(currentStep))showStep(currentStep+1);return;}
  for(let step=0;step<3;step++){if(!validateStep(step)){showStep(step);return;}}
  const {contact,details}=collect();let payload;try{payload=schema.toPayload(contact,details,$('website').value);}catch(error){showError(error.message);return;}
  if(!ready()){showError('Preview only: no enquiry or verification email has been sent. You can review the form here, or contact Landi on 07557 954457.');return;}
  sending=true;$('submitBtn').disabled=true;$('submitBtn').textContent='Sending enquiry…';clearErrors();
  try{
   const data=await callFunction(payload);
   if(!data.ok||data.verification_required!==true||!data.request_id){if(data.ok)saved=true;throw new Error('The service did not confirm the email-verification step. Please contact ATD before submitting again.');}
   saved=true;const status=$('submitStatus');status.replaceChildren();
   const heading=document.createElement('strong'),text=document.createElement('p');
   if(data.verification_sent===true){heading.textContent='Check your email to confirm your enquiry.';text.textContent='Open the confirmation link sent to '+contact.email.trim()+'. Your enquiry is saved, but it is not ready for review until your email is confirmed. Check Spam or Junk if it does not arrive.';}
   else{heading.textContent='Your enquiry was saved, but the confirmation email could not be sent.';text.textContent='Please contact ATD on 07557 954457 or tdermyshi88@gmail.com and quote the reference below. Your email remains unverified. Do not submit a second copy.';}
   const reference=document.createElement('p');reference.textContent='Enquiry reference: '+data.request_id;
   status.append(heading,text,reference);const photos=document.createElement('a');photos.href='https://wa.me/447557954457?text='+encodeURIComponent('Hello ATD, I would like to send project photos for enquiry '+data.request_id+'.');photos.target='_blank';photos.rel='noopener noreferrer';photos.textContent='Send project photos separately on WhatsApp ↗';status.appendChild(photos);status.classList.remove('hidden');status.scrollIntoView({block:'center'});$('submitBtn').textContent='Enquiry saved — awaiting confirmation';$('backBtn').disabled=true;
  }catch(error){showError(error.message||'The request could not be completed. Your form details are still here.');}
  finally{sending=false;$('submitBtn').disabled=saved;if(!saved)$('submitBtn').textContent='Send quote request ↗';notifyHeight();}
 });
 async function showVerification(token){$('enquiryPanel').classList.add('hidden');$('verificationPanel').classList.remove('hidden');$('verificationTitle').textContent='Confirm your email';const host=$('verificationStatus');host.replaceChildren();if(!/^[A-Za-z0-9_-]{32,256}$/.test(token)){host.textContent='This confirmation link does not look valid. Please contact ATD for help.';return;}
  if(!ready()){host.textContent='This is a preview. Email confirmation is not enabled here and no request has been verified.';return;}
  const text=document.createElement('p');text.textContent='Select the button below to confirm you can access this email address. This does not agree to a price, booking or contract.';const button=document.createElement('button');button.type='button';button.className='button';button.textContent='Confirm my email';host.append(text,button);
  button.addEventListener('click',async()=>{button.disabled=true;button.textContent='Confirming…';try{const data=await callFunction({action:'verify_email',token});if(!data.ok||data.email_verified!==true)throw new Error(data.error||'Email confirmation could not be confirmed.');$('verificationTitle').textContent='Your email is confirmed.';host.textContent='Thank you. ATD can now review your project details and contact you about the next step. Confirmation does not verify your identity or phone number and does not confirm a booking.';if(/^[a-f0-9]{64}$/i.test(data.tracking_token||'')){const trackingUrl=new URL(window.location.href);trackingUrl.search='';trackingUrl.hash='';trackingUrl.searchParams.set('token',data.tracking_token);const savedLink=document.createElement('a');savedLink.href=trackingUrl.toString();savedLink.className='button secondary';savedLink.textContent='Save / open your private enquiry-status page';host.appendChild(document.createElement('br'));host.appendChild(savedLink);}window.dispatchEvent(new CustomEvent('atd:email-confirmed',{detail:{token:data.tracking_token}}));history.replaceState(null,'',window.location.pathname);}
   catch(error){text.textContent=error.message||'The link could not be confirmed. It may have expired. Please contact ATD.';button.disabled=false;button.textContent='Try confirmation again';}finally{notifyHeight();}});notifyHeight();
 }
 const params=new URLSearchParams(window.location.search);
 if(params.get('embed')==='1')document.body.classList.add('embedded');
 const requestedService=schema.resolveService(params.get('service'));if(requestedService&&(requestedService.key!=='project-discussion'||requestType()==='appointment')){$('service').value=requestedService.ui;const chosen=document.querySelector('[data-service-choice][value="'+requestedService.ui+'"]');if(chosen)chosen.checked=true;renderService();}
 if(params.get('verify'))showVerification(params.get('verify'));
 if(params.get('token')||params.get('tracking')==='1'){
  $('enquiryPanel').classList.add('hidden');$('legacyTracking').classList.remove('hidden');if(params.get('token'))$('trackingToken').value=params.get('token');
 }
 $('statusForm').addEventListener('submit',async event=>{event.preventDefault();const status=$('trackingStatus'),token=$('trackingToken').value.trim();status.classList.remove('hidden');if(!/^[a-fA-F0-9]{64}$/.test(token)){status.textContent='Enter the complete private tracking code from your link.';return;}status.textContent='Checking request…';try{const data=await callFunction({action:'status',token});const labels={pending:'Awaiting review',approved:'Approved',rejected:'Not approved',deposit_received:'Deposit received'};let result='Status: '+(labels[data.status]||'Not available');if(data.quoted_total!=null)result+='\nQuoted total: '+new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(data.quoted_total);if(data.deposit_amount!=null)result+='\nDeposit: '+new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(data.deposit_amount);result+='\nContact ATD to discuss the approved quotation and payment arrangements.';status.textContent=result;}catch(error){status.textContent=error.message;}notifyHeight();});
 updateContext();
 if(ready())$('previewNotice').classList.add('hidden');
 if(typeof config.privacyUrl==='string'&&/^(https?:\/\/|\/|\.\/|\.\.\/)/.test(config.privacyUrl)){$('privacyLink').href=config.privacyUrl;$('privacyLink').classList.remove('hidden');}
 function postToParent(message){if(window===window.parent)return;if(location.protocol==='file:'){window.parent.postMessage(message,'*');return;}let origin='';try{origin=new URL(document.referrer).origin;}catch{}const allowed=Array.isArray(config.parentOrigins)?config.parentOrigins:[];if(origin&&origin!=='null'&&allowed.includes(origin))window.parent.postMessage(message,origin);}
 function notifyHeight(){if(window===window.parent)return;const bounds=document.body.getBoundingClientRect();const height=Math.min(16000,Math.max(400,Math.ceil(bounds.height+bounds.top+window.scrollY)));if(Math.abs(height-lastFrameHeight)<2)return;lastFrameHeight=height;postToParent({type:'ATD_ENQUIRY_HEIGHT',height});}
 if('ResizeObserver'in window)new ResizeObserver(notifyHeight).observe(document.body);
 window.addEventListener('load',notifyHeight);
})();
