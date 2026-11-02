/* ATD owner home-screen app and opt-in push alerts. No offline data cache. */
(() => {
 'use strict';
 const panel=document.getElementById('ownerNotifications'),button=document.getElementById('ownerPushToggle'),status=document.getElementById('ownerPushStatus');
 const endpoint='https://ujopvetvzfxgcxrphonx.supabase.co/functions/v1/atd-owner-push';
 const scopeURL=new URL('./',location.href),workerURL=new URL('owner-push-sw.js',scopeURL);
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const iOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 let ownerStatus=null,busy=false,sequence=0;
 function signedIn(){return typeof currentUser!=='undefined'&&Boolean(currentUser)&&typeof supabaseClient!=='undefined'&&Boolean(supabaseClient);}
 function supported(){return window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;}
 function say(text){status.textContent=text;}
 function clearState(){ownerStatus=null;panel.hidden=true;button.disabled=true;button.textContent='Turn on notifications';}
 async function ownerCall(body){
  if(!signedIn())throw new Error('Sign in to your ATD account first.');
  const {data:{session},error}=await supabaseClient.auth.getSession();
  if(error||!session?.access_token)throw new Error('Please sign in to ATD again.');
  const connection=configValues();
  if(connection.url!=='https://ujopvetvzfxgcxrphonx.supabase.co')throw new Error('The ATD connection is unavailable.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:connection.key,'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',signal:controller.signal});
   let result={};try{result=await response.json();}catch{}
   if(!response.ok||result.ok!==true){const failure=new Error(result.error||'Phone alerts could not be updated. Enquiry emails remain available.');failure.status=response.status;throw failure;}
   return result;
  }finally{clearTimeout(timer);}
 }
 async function currentRegistration(){return supported()?navigator.serviceWorker.getRegistration(scopeURL.href):undefined;}
 async function currentSubscription(){const registration=await currentRegistration();return registration?registration.pushManager.getSubscription():null;}
 function publicKeyBytes(key){const padded=key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}
 function updateButton(subscription){
  const active=Notification.permission==='granted'&&Boolean(subscription)&&ownerStatus?.subscribed===true;
  button.textContent=active?'Turn off notifications':'Turn on notifications';
  button.dataset.active=String(active);button.disabled=false;
  if(active)say('Notifications are on for this device. New email-confirmed enquiries will alert you here; enquiry emails still go to Gmail.');
  else if(Notification.permission==='denied'){button.disabled=true;say('Notifications are blocked on this device. Allow them in your phone’s settings, then reopen ATD Hub. Enquiry emails still go to Gmail.');}
  else say('Turn on alerts for new email-confirmed enquiries on this device. Enquiry emails still go to Gmail.');
 }
 async function refreshStatus(){
  if(busy)return;
  const ticket=++sequence;clearState();
  if(!signedIn())return;
  try{
   const subscription=await currentSubscription();
   const data=await ownerCall({action:'status',...(subscription?{endpoint:subscription.endpoint}:{})});
   if(ticket!==sequence||!signedIn())return;
   ownerStatus=data;panel.hidden=false;
   if(!supported()){say('This browser cannot receive phone alerts. On iPhone, add ATD Hub to your Home Screen and open its icon. Enquiry emails still go to Gmail.');return;}
   if(iOS()&&!standalone()){say('To receive iPhone alerts, add ATD Hub to your Home Screen, then open its icon and turn on notifications.');return;}
   updateButton(subscription);
  }catch(error){
   if(ticket!==sequence)return;
   if(error.status===401||error.status===403){clearState();return;}
   if(signedIn()){panel.hidden=false;say('Phone alerts are not available yet. Enquiry emails still go to Gmail.');}
  }
 }
 async function activeWorker(registration){
  if(registration.active)return registration;
  await new Promise((resolve,reject)=>{
   const worker=registration.installing||registration.waiting;
   if(!worker){reject(new Error('The notification service is not ready. Please try again.'));return;}
   const timer=setTimeout(()=>reject(new Error('The notification service took too long. Please try again.')),15000);
   const check=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('The notification service could not start. Please reload ATD Hub.'));}};
   worker.addEventListener('statechange',check);check();
  });
  return registration;
 }
 button.addEventListener('click',async()=>{
  if(busy||!ownerStatus||!signedIn()||!supported())return;
  if(iOS()&&!standalone()){say('Open the ATD Hub Home Screen icon to enable iPhone notifications.');return;}
  const turnOff=button.dataset.active==='true';let failureMessage='';busy=true;button.disabled=true;
  try{
   if(turnOff){
    const subscription=await currentSubscription();
    if(subscription){await ownerCall({action:'unsubscribe',endpoint:subscription.endpoint});await subscription.unsubscribe();}
    say('Notifications are off on this device. Enquiry emails still go to Gmail.');
   }else{
    // Request permission directly from this tap, before any network await.
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){say('Notifications were not enabled. Enquiry emails still go to Gmail.');return;}
    say('Setting up phone alerts…');
    if(!ownerStatus.public_key)ownerStatus=await ownerCall({action:'initialize'});
    if(!ownerStatus.enabled||typeof ownerStatus.public_key!=='string')throw new Error('Phone alerts are not ready yet. Enquiry emails still go to Gmail.');
    const registration=await activeWorker(await navigator.serviceWorker.register(workerURL.href,{scope:scopeURL.pathname,updateViaCache:'none'}));
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(ownerStatus.public_key)});
    const result=await ownerCall({action:'subscribe',subscription:subscription.toJSON()});
    if(result.subscribed!==true)throw new Error('Phone alerts were not confirmed. Please try again.');
    say('Notifications are on for this device.');
   }
  }catch(error){failureMessage=error.name==='AbortError'?'Phone alerts took too long to respond. Try again; enquiry emails remain available.':error.message||'Phone alerts could not be updated. Enquiry emails remain available.';}
  finally{busy=false;button.disabled=false;await refreshStatus();if(failureMessage&&!panel.hidden)say(failureMessage);}
 });
 function openWebsiteEnquiries(){if(signedIn()&&typeof showPage==='function'){showPage('bookings');if(typeof loadBookingRequests==='function')loadBookingRequests();}}
 window.addEventListener('atd:session-changed',()=>{refreshStatus();if(new URLSearchParams(location.search).get('view')==='website-enquiries')openWebsiteEnquiries();});
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='ATD_OPEN_WEBSITE_ENQUIRIES')openWebsiteEnquiries();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshStatus();});
 refreshStatus();
 if(new URLSearchParams(location.search).get('view')==='website-enquiries')openWebsiteEnquiries();
})();
