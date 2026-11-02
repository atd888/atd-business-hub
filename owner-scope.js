/* ATD owner-only enquiry review and manual quote pricing. No submission or email side effects. */
(function(global){
 'use strict';
 const categories=['labour','materials','other'];
 function quoteTotals(items,discount){
  const sums={labour:0,materials:0,other:0},errors=[],normalised=[];
  if(!Array.isArray(items))items=[];
  if(items.length>50)errors.push('Use no more than 50 quotation lines.');
  items.slice(0,50).forEach((line,index)=>{
   const description=String(line.description||'').trim(),quantityRaw=String(line.quantity??'').trim(),rateRaw=String(line.unitRate??'').trim();
   if(!description&&!quantityRaw&&!rateRaw)return;
   const quantity=Number(quantityRaw),unitRate=Number(rateRaw),category=line.category;
   if(!description||description.length>300){errors.push(`Line ${index+1}: enter a description (up to 300 characters).`);return;}
   if(!categories.includes(category)){errors.push(`Line ${index+1}: choose labour, materials or other.`);return;}
   if(!quantityRaw||!Number.isFinite(quantity)||quantity<=0){errors.push(`Line ${index+1}: enter a quantity greater than zero.`);return;}
   if(!rateRaw||!Number.isFinite(unitRate)||unitRate<0){errors.push(`Line ${index+1}: enter a non-negative unit rate.`);return;}
   const cents=Math.round(quantity*unitRate*100);
   if(!Number.isSafeInteger(cents)){errors.push(`Line ${index+1}: the amount is too large.`);return;}
   sums[category]+=cents;
   normalised.push({description,category,quantity,unit:String(line.unit||'').trim().slice(0,30),unitRate,amount:cents/100});
  });
  if(!normalised.length)errors.push('Add at least one complete quotation line.');
  const discountCents=discount?Math.round(sums.labour*.10):0;
  const totalCents=sums.labour+sums.materials+sums.other-discountCents;
  if(!Number.isSafeInteger(totalCents))errors.push('The total is too large.');
  return {items:normalised,labour:sums.labour/100,materials:sums.materials/100,other:sums.other/100,discount:discountCents/100,total:totalCents/100,errors};
 }
 function verificationState(request){
  const required=request?.email_verification_required===true||request?.verification_required===true;
  const verified=Boolean(request?.email_verified_at);
  return {required,verified,canQuote:!required||verified,label:verified?'Email verified':required?'Email confirmation required':'Email not verified (legacy)'};
 }
 function formatDetails(value,depth=0){
  if(depth>6||value==null)return '';
  if(Array.isArray(value))return value.map((item,i)=>typeof item==='object'?`Item ${i+1}:\n${formatDetails(item,depth+1)}`:String(item)).filter(Boolean).join('\n');
  if(typeof value==='object')return Object.entries(value).map(([key,item])=>{
   const label=key.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
   const text=typeof item==='object'?formatDetails(item,depth+1):typeof item==='boolean'?(item?'Yes':'No'):String(item??'');
   return text?label+': '+text:'';
  }).filter(Boolean).join('\n');
  return String(value);
 }
 function questionnaireText(details){return details&&typeof details==='object'?(global.ATDEnquiry?.summary&&details.service_key?global.ATDEnquiry.summary(details):formatDetails(details)):'';}
 function fullScope(request){
  const structured=questionnaireText(request?.project_details);
  return (request?.job_description||'')+(structured?'\n\nStructured questionnaire\n'+structured:'');
 }
 function suggestedLines(details){
  const scope=details?.scope||{},service=details?.service_key,lines=[];
  const line=(description,quantity='',unit='')=>({description,category:'labour',quantity,unit,unitRate:''});
  const positive=value=>String(value??'').trim()!==''&&Number.isFinite(Number(value))&&Number(value)>0;
  if(service==='painting-decorating')for(const item of scope.items||[]){
   const context=[item.area,item.location,item.sides,item.include,item.colour_name||item.colour,item.finish].filter(Boolean).join(' · ');
   const door=item.kind==='Doors'&&positive(item.quantity)&&Number.isInteger(Number(item.quantity));
   lines.push(line((item.kind||'Painting')+(context?' — '+context:''),door?Number(item.quantity):'',door?'doors':''));
  }
  if(service==='wallpapering')for(const wall of scope.walls||[])lines.push(line('Wallpapering'+(wall.wall?' — '+wall.wall:'')));
  if(service==='bathroom-refurbishments'){
   for(const [key,label]of [['wall_tiles','Bathroom wall tiling'],['floor_tiles','Bathroom floor tiling']])if(positive(scope[key]))lines.push(line(label+' — customer-stated area',Number(scope[key]),'m²'));
   if(!lines.length)lines.push(line('Bathroom refurbishment — agreed scope'));
  }
  if(service==='full-refurbishments')for(const room of scope.rooms||[])lines.push(line('Refurbishment'+(room.area||room.name?' — '+(room.area||room.name):'')));
  return lines.length?lines:[line('')];
 }
 function filterEnquiries(rows,query='',filter='all'){
  const words=String(query).trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean);
  return rows.filter(row=>{
   const v=verificationState(row),purpose=requestPurpose(row);
   if(filter==='verified'&&!v.verified)return false;
   if(filter==='unverified'&&(!v.required||v.verified))return false;
   if(filter==='appointment'&&!purpose.wantsAppointment)return false;
   if(filter==='approved'&&row.status!=='approved')return false;
   const haystack=[row.customer_name,row.customer_email,row.customer_phone,row.property_address,row.service,row.id,row.job_description].filter(Boolean).join(' ').toLocaleLowerCase('en-GB');
   return words.every(word=>haystack.includes(word));
  });
 }
 function requestPurpose(request){
  const type=request?.project_details?.request_type||'quote';
  return {type,label:type==='appointment'?'Call / site visit request':type==='both'?'Quotation + call / site visit':'Quotation enquiry',wantsAppointment:type==='appointment'||type==='both'};
 }
 function appointmentDraft(request){
  const appointment=request?.project_details?.appointment||{},requestedType=appointment.type||'Please advise';
  const date=String(appointment.preferred_date||'');
  const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(new Date(date+'T00:00:00Z').getTime())&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
  const type=requestedType==='Phone call'?'Phone call':requestedType==='Site visit'?'Site visit':'Other';
  const title=(type==='Other'?'Call / site visit to discuss':type)+' — '+(request?.customer_name||'Website enquiry');
  const notes=['Customer appointment request — date and exact time must be agreed separately.',
   'Requested type: '+requestedType,
   'Preferred date: '+(date||'Not specified'),
   'Preferred time window: '+(appointment.preferred_time||'Anytime')+' (not a confirmed start time)',
   'Flexible: '+(typeof appointment.flexible==='boolean'?(appointment.flexible?'Yes':'No'):'Not specified'),
   'Customer: '+(request?.customer_name||''),'Phone: '+(request?.customer_phone||''),'Email: '+(request?.customer_email||''),
   'Property: '+(request?.property_address||''),'Service / discussion: '+(request?.service||'To discuss'),
   'Website enquiry reference: '+(request?.id||'')];
  if(appointment.notes)notes.push('Appointment notes: '+String(appointment.notes));
  return {title,date:validDate?date:'',customer:request?.customer_name||'',type,notes:notes.join('\n')};
 }
 const api={filterEnquiries,quoteTotals,verificationState,formatDetails,suggestedLines,requestPurpose,appointmentDraft};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
 global.ATDOwnerScope=api;
 if(typeof document==='undefined'||typeof state==='undefined')return;
 const byId=id=>document.getElementById(id);
 let editingItems=[];
 const form=byId('quoteForm');
 const firstGrid=form.querySelector('.fieldgrid');
 firstGrid.insertAdjacentHTML('beforeend',`<div class="field"><label for="qCustomerEmail">Customer email</label><input id="qCustomerEmail" type="email" autocomplete="off"></div><div class="field"><label for="qCustomerPhone">Customer phone</label><input id="qCustomerPhone" type="tel" autocomplete="off"></div><div class="field full"><label for="qPropertyAddress">Property address</label><input id="qPropertyAddress" autocomplete="off"></div><div class="field full"><label for="qBookingRequestId">Linked website enquiry reference</label><input id="qBookingRequestId" readonly><p class="quote-items-hint">Reference only. Saving this document does not change the website enquiry status.</p></div><div id="quoteBookingContext" class="owner-quote-context" hidden></div>`);
 byId('quoteCalc').insertAdjacentHTML('beforebegin',`<section class="quote-items"><h3>Itemised quotation</h3><label class="owner-check"><input id="qItemised" type="checkbox"><span>Calculate the total from labour, materials and other costs</span></label><p class="quote-items-hint">Enter your own quantities and unit rates. No rates or project prices are supplied automatically. Review any customer-stated quantities before pricing; room dimensions are not converted into guessed areas. Keep any tax treatment explicit in your scope and agreed price.</p><div id="quoteItemisedPanel" hidden><div id="quoteLineItems"></div><div class="add-cost-actions"><button type="button" class="btn secondary" id="addQuoteLine">+ Add labour</button><button type="button" class="btn secondary" data-add-cost="materials">+ Add materials</button><button type="button" class="btn secondary" data-add-cost="other">+ Add other costs</button></div><datalist id="quoteUnits"><option value="doors"><option value="windows"><option value="m²"><option value="metres"><option value="hours"><option value="days"><option value="items"><option value="allowance"></datalist><label class="owner-check" style="margin-top:20px"><input id="qLabourDiscount" type="checkbox"><span>Apply 10% off labour only<br><small>Materials and other costs are excluded.</small></span></label><dl id="quotePricingSummary" class="pricing-summary"></dl></div><p id="quoteBuilderStatus" class="quote-builder-status" role="status"></p></section>`);
 form.querySelectorAll('.field').forEach(field=>{const label=field.querySelector('label'),control=field.querySelector('input,select,textarea');if(label&&control?.id)label.htmlFor=control.id;});
 firstGrid.appendChild(byId('qNotes').closest('.field'));
 const totalLabel=byId('qTotal').closest('.field').querySelector('label');totalLabel.textContent='Final total (£) *';totalLabel.htmlFor='qTotal';
 function emptyLine(){return {description:'',category:'labour',quantity:'',unit:'',unitRate:''};}
 function readItems(){
  return [...byId('quoteLineItems').querySelectorAll('.quote-item')].map(row=>({description:row.querySelector('[data-key="description"]').value,category:row.querySelector('[data-key="category"]').value,quantity:row.querySelector('[data-key="quantity"]').value,unit:row.querySelector('[data-key="unit"]').value,unitRate:row.querySelector('[data-key="unitRate"]').value}));
 }
 function renderItems(){
  byId('quoteLineItems').innerHTML=editingItems.map((line,i)=>`<div class="quote-item" data-line="${i}"><div class="quote-item-fields"><label>Description<input data-key="description" value="${esc(line.description||'')}" maxlength="300" placeholder="Describe this part of the work"></label><label>Cost type<select data-key="category">${categories.map(c=>`<option value="${c}" ${line.category===c?'selected':''}>${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></label></div><div class="quote-item-numbers"><label>Quantity<input data-key="quantity" type="number" min="0.0001" step="any" inputmode="decimal" value="${esc(line.quantity??'')}" placeholder="Enter quantity"></label><label>Unit<input data-key="unit" list="quoteUnits" value="${esc(line.unit||'')}" maxlength="30" placeholder="m², hours, items…"></label><label>Unit rate (£)<input data-key="unitRate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(line.unitRate??'')}" placeholder="Enter your rate"></label></div><div class="quote-item-bottom"><strong data-line-total>Line total: —</strong><button type="button" class="btn danger" data-remove-line="${i}">Remove line</button></div></div>`).join('');
  byId('quoteLineItems').querySelectorAll('input,select').forEach(el=>el.disabled=!byId('qItemised').checked);
 }
 const oldUpdateQuoteCalc=updateQuoteCalc;
 function syncPricing(){
  const itemised=byId('qItemised').checked;
  byId('quoteItemisedPanel').hidden=!itemised;byId('qTotal').readOnly=itemised;
  byId('quoteLineItems').querySelectorAll('input,select').forEach(el=>el.disabled=!itemised);
  byId('qLabourDiscount').disabled=!itemised;
  if(itemised){
   const items=readItems(),totals=quoteTotals(items,byId('qLabourDiscount').checked);
   byId('qTotal').value=totals.total.toFixed(2);
   byId('quotePricingSummary').innerHTML=`<dt>Labour</dt><dd>${money(totals.labour)}</dd><dt>Materials</dt><dd>${money(totals.materials)}</dd><dt>Other costs</dt><dd>${money(totals.other)}</dd><dt>Labour discount (10%)</dt><dd>−${money(totals.discount)}</dd><dt><strong>Final total</strong></dt><dd><strong>${money(totals.total)}</strong></dd>`;
   [...byId('quoteLineItems').querySelectorAll('.quote-item')].forEach((row,i)=>{const one=quoteTotals([items[i]],false);row.querySelector('[data-line-total]').textContent='Line total: '+(one.errors.length?'—':money(one.total));});
  }
  oldUpdateQuoteCalc();
 }
 updateQuoteCalc=syncPricing;
 ['qTotal','qDeposit','qMidPercent','qPaid'].forEach(id=>{byId(id).removeEventListener('input',oldUpdateQuoteCalc);byId(id).addEventListener('input',syncPricing);});
 byId('qItemised').addEventListener('change',()=>{if(byId('qItemised').checked&&!byId('quoteLineItems').children.length){editingItems=[emptyLine()];renderItems();}syncPricing();});
 byId('qLabourDiscount').addEventListener('change',syncPricing);
 byId('quoteLineItems').addEventListener('input',syncPricing);byId('quoteLineItems').addEventListener('change',syncPricing);
 byId('quoteLineItems').addEventListener('click',event=>{const remove=event.target.closest('[data-remove-line]');if(!remove)return;editingItems=readItems();editingItems.splice(Number(remove.dataset.removeLine),1);renderItems();syncPricing();});
 function addCostLine(category){editingItems=readItems();if(editingItems.length>=50){byId('quoteBuilderStatus').textContent='Use no more than 50 price lines.';return;}editingItems.push({...emptyLine(),category});renderItems();syncPricing();byId('quoteLineItems').lastElementChild.querySelector('input').focus();}
 byId('addQuoteLine').addEventListener('click',()=>addCostLine('labour'));
 document.querySelectorAll('[data-add-cost]').forEach(button=>button.addEventListener('click',()=>addCostLine(button.dataset.addCost)));

 function openQuote(quote){
  showPage('quotes');form.classList.remove('hidden');form.reset();
  const x=quote||{};
  for(const [key,value] of Object.entries({quoteId:x.id||'',qCustomer:x.customer||'',qJob:x.job||'',qType:x.type||'Quotation',qStatus:x.status||'Draft',qTotal:x.total??'',qDeposit:x.deposit??30,qMidPercent:x.midPercent??40,qPaid:x.paid??0,qDue:x.due||'',qNotes:x.notes||'',qCustomerEmail:x.customerEmail||'',qCustomerPhone:x.customerPhone||'',qPropertyAddress:x.propertyAddress||'',qBookingRequestId:x.bookingRequestId||''}))byId(key).value=value;
  byId('qItemised').checked=x.pricingMode==='itemised'||(!quote);
  byId('qLabourDiscount').checked=x.labourDiscount===true;
  editingItems=Array.isArray(x.lineItems)&&x.lineItems.length?x.lineItems.map(line=>({...line})):[emptyLine()];
  renderItems();byId('quoteBuilderStatus').textContent='';
  const linked=!!x.bookingRequestId,request=linked?bookingRows.find(row=>row.id===x.bookingRequestId):null,strict=verificationState(request).required;byId('qDeposit').readOnly=linked;
  byId('qCustomerEmail').readOnly=strict;byId('qCustomerEmail').required=strict;byId('qCustomerPhone').required=strict;byId('qPropertyAddress').required=strict;
  const context=byId('quoteBookingContext');context.hidden=!linked;
  context.textContent=linked?'Website enquiry '+x.bookingRequestId+'\nDraft only: no email is sent and the request remains unchanged. Website approval uses a 40% deposit. Review the complete scope and pricing before using the separate approval action.'+(request?.project_details?.preferences?.discount_requested?'\nCustomer requested the 10% labour offer. Check the labour-only discount toggle when preparing the agreed quotation.':''):'';
  if(linked)byId('qDeposit').value=40;
  syncPricing();form.scrollIntoView({behavior:'smooth',block:'start'});
 }
 global.editQuote=id=>{const quote=state.quotes.find(x=>x.id===id);if(quote)openQuote(quote);};
 byId('newQuote').onclick=()=>openQuote();
 global.makeQuote=enquiryId=>{const enquiry=state.enquiries.find(x=>x.id===enquiryId);openQuote({customer:enquiry?.name||'',job:enquiry?.service||'',customerEmail:enquiry?.email||'',customerPhone:enquiry?.phone||'',propertyAddress:enquiry?.address||'',notes:enquiry?.description||'',pricingMode:'itemised'});};
 function linkedQuote(requestId){return state.quotes.find(x=>x.bookingRequestId===requestId);}
 function createBookingQuote(requestId){
  if(!currentUser){alert('Sign in to prepare a quotation.');return;}
  const request=bookingRows.find(x=>x.id===requestId);if(!request)return;
  if(!verificationState(request).canQuote){alert('The customer must confirm their email before this enquiry is ready for a quotation.');return;}
  const existing=linkedQuote(requestId);if(existing){openQuote(existing);return existing.id;}
  const draft={id:id(),customer:request.customer_name||'',customerEmail:request.customer_email||'',customerPhone:request.customer_phone||'',propertyAddress:request.property_address||'',bookingRequestId:request.id,customerScope:fullScope(request),job:request.service||'',type:'Quotation',status:'Draft',total:0,deposit:40,midPercent:0,paid:0,due:'',notes:fullScope(request),pricingMode:'itemised',lineItems:suggestedLines(request.project_details),labourDiscount:false};
  state.quotes.push(draft);persist('quotes');openQuote(draft);return draft.id;
 }
 api.createBookingQuote=createBookingQuote;
 const calendarForm=byId('calendarForm');
 calendarForm.insertAdjacentHTML('afterbegin','<p id="preparedAppointmentNote" class="notice" role="status" hidden></p>');
 function prepareAppointment(requestId){
  if(!currentUser){alert('Sign in to prepare an appointment.');return;}
  const request=bookingRows.find(row=>row.id===requestId);if(!request||!requestPurpose(request).wantsAppointment)return;
  if(!verificationState(request).verified){alert('The customer must confirm their email before appointment planning is available.');return;}
  const draft=appointmentDraft(request);showPage('calendar');calendarForm.classList.remove('hidden');calendarForm.reset();
  for(const [key,value]of Object.entries({cTitle:draft.title,cDate:draft.date,cCustomer:draft.customer,cType:draft.type,cNotes:draft.notes})){const field=byId(key);if(field)field.value=value;}
  const notice=byId('preparedAppointmentNote');notice.hidden=false;notice.textContent='Prepared only: nothing has been saved or confirmed. Agree the date and exact time with the customer, review these details, then use Save calendar item. A requested morning, afternoon or evening is a preference, not a booked start time.';
  calendarForm.scrollIntoView({behavior:'smooth',block:'start'});
 }
 api.prepareAppointment=prepareAppointment;
 byId('newCalendarItem').addEventListener('click',()=>{byId('preparedAppointmentNote').hidden=true;});
 calendarForm.addEventListener('submit',()=>{byId('preparedAppointmentNote').hidden=true;});
 form.onsubmit=event=>{
  event.preventDefault();if(!currentUser){byId('quoteBuilderStatus').textContent='Sign in before saving a quotation.';return;}
  if(!form.reportValidity())return;
  const itemised=byId('qItemised').checked,pricing=itemised?quoteTotals(readItems(),byId('qLabourDiscount').checked):null;
  if(pricing?.errors.length){byId('quoteBuilderStatus').textContent=pricing.errors.join('\n');return;}
  const deposit=Number(byId('qDeposit').value),mid=Number(byId('qMidPercent').value),paid=Number(byId('qPaid').value),total=itemised?pricing.total:Number(byId('qTotal').value);
  if(!Number.isFinite(total)||total<0||!Number.isFinite(paid)||paid<0||!Number.isFinite(deposit)||!Number.isFinite(mid)||deposit<0||mid<0||deposit+mid>100){byId('quoteBuilderStatus').textContent='Check the total, amount paid and payment percentages. Deposit plus during-work payment must not exceed 100%.';return;}
  const quoteId=byId('quoteId').value||id(),old=state.quotes.find(x=>x.id===quoteId),requestId=byId('qBookingRequestId').value;
  const linkedRequest=requestId&&bookingRows.find(row=>row.id===requestId);
  if(linkedRequest&&!verificationState(linkedRequest).canQuote){byId('quoteBuilderStatus').textContent='Email confirmation is required before this enquiry is ready for quotation.';return;}
  const duplicate=requestId&&state.quotes.find(x=>x.bookingRequestId===requestId&&x.id!==quoteId);
  if(duplicate){openQuote(duplicate);byId('quoteBuilderStatus').textContent='An existing quotation is already linked to this enquiry. It has been opened instead.';return;}
  const item={...old,id:quoteId,customer:byId('qCustomer').value.trim(),customerEmail:byId('qCustomerEmail').value.trim(),customerPhone:byId('qCustomerPhone').value.trim(),propertyAddress:byId('qPropertyAddress').value.trim(),bookingRequestId:requestId||null,job:byId('qJob').value,type:byId('qType').value,status:byId('qStatus').value,total,deposit,midPercent:mid,paid,due:byId('qDue').value,notes:byId('qNotes').value,pricingMode:itemised?'itemised':'total',lineItems:itemised?pricing.items:(old?.lineItems||[]),labourDiscount:itemised&&byId('qLabourDiscount').checked,pricingSummary:pricing?{labour:pricing.labour,materials:pricing.materials,other:pricing.other,discount:pricing.discount,total:pricing.total}:null};
  const index=state.quotes.findIndex(x=>x.id===quoteId);if(index>=0)state.quotes[index]=item;else state.quotes.push(item);persist('quotes');form.classList.add('hidden');
 };
 const bookingHost=byId('bookingTable');
 bookingHost.insertAdjacentHTML('beforebegin',`<section class="enquiry-tools" id="enquiryTools" hidden aria-label="Find website enquiries"><div class="enquiry-overview" id="enquiryOverview"></div><div class="enquiry-find"><label for="websiteEnquirySearch">Find an enquiry<input id="websiteEnquirySearch" type="search" autocomplete="off" placeholder="Name, postcode, service or reference"></label><label for="websiteEnquiryFilter">Show<select id="websiteEnquiryFilter"><option value="all">All enquiries</option><option value="verified">Email confirmed</option><option value="unverified">Awaiting email confirmation</option><option value="appointment">Call / site visit requests</option><option value="approved">Approved enquiries</option></select></label><button class="btn secondary" type="button" id="clearEnquiryFilters">Clear</button></div><p id="enquiryResults" class="muted" role="status" aria-live="polite"></p></section>`);
 byId('websiteEnquirySearch').addEventListener('input',()=>renderBookingRequests());
 byId('websiteEnquiryFilter').addEventListener('change',()=>renderBookingRequests());
 byId('clearEnquiryFilters').addEventListener('click',()=>{byId('websiteEnquirySearch').value='';byId('websiteEnquiryFilter').value='all';renderBookingRequests();byId('websiteEnquirySearch').focus();});
 renderBookingRequests=function(){
  const host=byId('bookingTable');if(!host)return;
  byId('enquiryTools').hidden=!currentUser;
  if(!currentUser){byId('websiteEnquirySearch').value='';byId('websiteEnquiryFilter').value='all';host.innerHTML='<div class="card empty">Sign in to review website enquiries.</div>';return;}
  const confirmed=bookingRows.filter(row=>verificationState(row).verified).length;
  const waiting=bookingRows.filter(row=>{const v=verificationState(row);return v.required&&!v.verified;}).length;
  const visits=bookingRows.filter(row=>row.status==='pending'&&requestPurpose(row).wantsAppointment).length;
  byId('enquiryOverview').innerHTML='<div><strong>'+bookingRows.length+'</strong><span>Loaded enquiries</span></div><div><strong>'+confirmed+'</strong><span>Email confirmed</span></div><div><strong>'+waiting+'</strong><span>Awaiting email</span></div><div><strong>'+visits+'</strong><span>Discussion requests pending</span></div>';
  const visible=filterEnquiries(bookingRows,byId('websiteEnquirySearch').value,byId('websiteEnquiryFilter').value);
  byId('enquiryResults').textContent='Showing '+visible.length+' of '+bookingRows.length+' loaded enquiries';
  if(!bookingRows.length){host.innerHTML='<div class="card empty">No website enquiries loaded. Use Refresh requests after signing in.</div>';return;}
  if(!visible.length){host.innerHTML='<div class="card empty">No enquiries match. Try a name, postcode or service, or clear the filters.</div>';return;}
  host.innerHTML='<div class="website-enquiry-list">'+visible.map(request=>{
   const purpose=requestPurpose(request),appointment=request.project_details?.appointment||{},verification=verificationState(request),blocked=!verification.canQuote,linked=linkedQuote(request.id),date=request.preferred_date||'Flexible / not specified',received=new Date(request.created_at).toLocaleString('en-GB');
   const appointmentOnly=request.status==='pending'&&purpose.type==='appointment'&&!(linked&&Number(linked.total)>0)&&!(Number(request.quoted_total)>0);
   const phone=String(request.customer_phone||'').replace(/[^+0-9]/g,''),email=String(request.customer_email||'');
   const contactLinks='<div class="enquiry-contact-actions">'+(/^[+]?[0-9]{10,15}$/.test(phone)?'<a class="btn secondary" href="tel:'+esc(phone)+'">Call customer</a>':'')+(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'<a class="btn secondary" href="mailto:'+esc(encodeURIComponent(email))+'">Email customer</a>':'')+'</div>';
   const approval=appointmentOnly?`<div class="enquiry-approval"><p>This is an appointment request, not an accepted quotation. Agree the date and exact time with the customer. A quotation can be prepared separately after the discussion.</p><button type="button" class="btn danger" data-owner-action="reject" data-request="${esc(request.id)}">Reject request</button></div>`:request.status==='pending'?`<div class="enquiry-approval"><p>Approval is separate from saving a draft. It makes the total, a <strong>40% deposit</strong> and business bank details visible on the customer’s private tracking page.</p><div class="enquiry-approval-grid"><div><label for="quote-${esc(request.id)}">Agreed quotation total (£)</label><input id="quote-${esc(request.id)}" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter agreed total" ${blocked?'disabled':''} value="${esc(request.quoted_total??'')}"></div><div class="actions">${linked&&Number(linked.total)>0?`<button type="button" class="btn secondary" data-owner-action="use-total" data-request="${esc(request.id)}" ${blocked?'disabled':''}>Use saved draft total (${money(linked.total)})</button>`:''}<button type="button" class="btn" data-owner-action="approve" data-request="${esc(request.id)}" ${blocked?'disabled':''}>Approve + set 40% deposit</button><button type="button" class="btn danger" data-owner-action="reject" data-request="${esc(request.id)}">Reject enquiry</button></div></div></div>`:`<div class="enquiry-approval">${request.quoted_total==null?'':'Approved total: <strong>'+money(request.quoted_total)+'</strong> · Deposit: '+money(request.deposit_amount)}<p class="muted">Status changes are handled separately from private draft quotations.</p></div>`;
   return `<article class="card website-enquiry"><div class="enquiry-card-head"><div><h3>${esc(request.customer_name||'Website enquiry')}</h3><div class="muted">${esc(purpose.label)} · ${esc(request.service||'Project discussion')} · Received ${esc(received)}</div></div>${statusPill(request.status||'pending')}<span class="pill ${verification.verified?'green':verification.required?'amber':''}">${verification.label}</span></div><dl class="enquiry-meta"><div><dt>Email</dt><dd>${esc(request.customer_email||'Not supplied')}</dd></div><div><dt>Phone</dt><dd>${esc(request.customer_phone||'Not supplied')}</dd></div><div><dt>Property</dt><dd>${esc(request.property_address||'Not supplied')}</dd></div><div><dt>Preferred date</dt><dd>${esc(date)}</dd></div></dl>${contactLinks}${purpose.wantsAppointment?'<section class="appointment-request"><h4>Requested call / site visit</h4><p><strong>Type:</strong> '+esc(appointment.type||'Please advise')+'<br><strong>Preferred date:</strong> '+esc(appointment.preferred_date||'Not specified')+'<br><strong>Time preference:</strong> '+esc(appointment.preferred_time||'Anytime')+'<br><strong>Flexible:</strong> '+(typeof appointment.flexible==='boolean'?(appointment.flexible?'Yes':'No'):'Not specified')+'</p>'+(appointment.notes?'<p>'+esc(appointment.notes)+'</p>':'')+'<p class="muted">Requested only. No appointment or start time has been confirmed.</p></section>':''}<h4 class="enquiry-scope-heading">Full project details</h4><div class="enquiry-scope">${esc(request.job_description||'No project description supplied.')}</div>${request.project_details?'<details class="structured-answers"><summary>Full structured questionnaire</summary><div class="enquiry-scope">'+esc(questionnaireText(request.project_details))+'</div></details>':''}${blocked?'<p class="verification-note">This enquiry can be reviewed now. The customer must confirm their email before quotation preparation, appointment planning or approval becomes available.</p>':''}<p class="enquiry-ref">Website enquiry reference: ${esc(request.id)}</p><button type="button" class="btn secondary" data-owner-action="draft" data-request="${esc(request.id)}" ${blocked?'disabled':''}>${linked?'Open linked draft quote':purpose.type==='appointment'?'Prepare draft quote after discussion':'Create draft quote'}</button>${purpose.wantsAppointment?'<button type="button" class="btn secondary" data-owner-action="appointment" data-request="'+esc(request.id)+'" '+(!verification.verified?'disabled':'')+'>Prepare appointment</button>':''}${approval}</article>`;
  }).join('')+'</div>';
 };
 byId('bookingTable').addEventListener('click',event=>{
  const action=event.target.closest('[data-owner-action]');if(!action||!currentUser)return;
  const requestId=action.dataset.request;if(!bookingRows.some(x=>x.id===requestId))return;
  if(action.dataset.ownerAction==='draft')createBookingQuote(requestId);
  if(action.dataset.ownerAction==='appointment')prepareAppointment(requestId);
  if(action.dataset.ownerAction==='use-total'){const quote=linkedQuote(requestId);if(quote&&Number.isFinite(Number(quote.total)))byId('quote-'+requestId).value=Number(quote.total).toFixed(2);}
  if(action.dataset.ownerAction==='approve')global.updateBookingRequest(requestId,'approved');
  if(action.dataset.ownerAction==='reject')global.updateBookingRequest(requestId,'rejected');
 });
 let bookingSessionUser=currentUser?.id||null;
 const previousSignedInUI=setSignedInUI;
 setSignedInUI=function(signedIn){const nextUser=signedIn?currentUser?.id||null:null;if(nextUser!==bookingSessionUser||!signedIn){bookingRows=[];bookingSessionUser=nextUser;renderBookingRequests();}return previousSignedInUI(signedIn);};
 const originalBookingUpdate=global.updateBookingRequest;
 global.updateBookingRequest=function(requestId,status){const request=bookingRows.find(row=>row.id===requestId);if(status==='approved'&&request&&!verificationState(request).canQuote){alert('Email confirmation is required before approval.');return;}return originalBookingUpdate(requestId,status);};
 global.printQuote=quoteId=>{
  const x=state.quotes.find(quote=>quote.id===quoteId);if(!x)return;
  const output=global.open('','_blank');if(!output){alert('Allow pop-ups to print this quotation.');return;}
  const calculation=x.pricingMode==='itemised'?quoteTotals(x.lineItems,x.labourDiscount):null;
  const pricing=calculation&&!calculation.errors.length?calculation:null;
  const lines=pricing?`<table><thead><tr><th>Description</th><th>Type</th><th>Quantity</th><th>Unit rate</th><th>Amount</th></tr></thead><tbody>${pricing.items.map(line=>`<tr><td>${esc(line.description)}</td><td>${esc(line.category)}</td><td>${esc(line.quantity)} ${esc(line.unit)}</td><td>${money(line.unitRate)}</td><td>${money(line.amount)}</td></tr>`).join('')}</tbody></table><p>Labour: ${money(pricing.labour)}<br>Materials: ${money(pricing.materials)}<br>Other costs: ${money(pricing.other)}<br>Labour discount (${x.labourDiscount?'10%':'0%'}; materials excluded): −${money(pricing.discount)}</p>`:'';
  output.document.write(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(x.type)} — ATD</title><style>body{font:16px/1.6 Arial;margin:35px;color:#1c2430}h1{font-size:28px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #ddd}.scope{white-space:pre-wrap}.total{font-size:24px}@media print{button{display:none}}</style></head><body><h1>AT DERMYSHI LTD</h1><p>ATD North London Painters<br>07557 954457 · tdermyshi88@gmail.com<br>94 Lausanne Road, London N8 0HP · Company number 16124001</p><h2>${esc(x.type)}${x.status==='Draft'?' — Draft':''}</h2><p><strong>${esc(x.customer)}</strong><br>${esc(x.customerEmail||'')}<br>${esc(x.customerPhone||'')}<br>${esc(x.propertyAddress||'')}</p><p>Job: ${esc(x.job||'')}<br>Document reference: ${esc(x.id)}${x.bookingRequestId?'<br>Website enquiry: '+esc(x.bookingRequestId):''}<br>Due date: ${esc(x.due||'To be agreed')}</p><h3>Scope and notes</h3><p class="scope">${esc(x.notes||'')}</p>${lines}<p class="total"><strong>Total: ${money(x.total)}</strong></p><p>Deposit (${esc(x.deposit??30)}%): ${money(x.total*(x.deposit??30)/100)}<br>During work (${esc(x.midPercent??40)}%): ${money(x.total*(x.midPercent??40)/100)}<br>On completion (${100-(x.deposit??30)-(x.midPercent??40)}%): ${money(x.total*(100-(x.deposit??30)-(x.midPercent??40))/100)}<br>Amount paid: ${money(x.paid)}<br>Balance: ${money(Math.max(0,x.total-(Number(x.paid)||0)))}</p>${x.status==='Draft'?'<p>Draft for owner review. This document has not been sent or approved automatically.</p>':''}<button onclick="window.print()">Print / save PDF</button></body></html>`);output.document.close();
 };
 renderBookingRequests();
})(typeof window!=='undefined'?window:globalThis);
