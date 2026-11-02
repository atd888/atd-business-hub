/* ATD push only: no fetch handler, offline cache, credentials or customer records. */
const ATD_DASHBOARD=new URL('./index.html?view=website-enquiries',self.location.href).href;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil(self.registration.showNotification('New confirmed ATD enquiry',{
  body:'Open your dashboard to review the request.',
  icon:new URL('./atd-hub-icon-192.png',self.location.href).href,
  badge:new URL('./atd-hub-icon-192.png',self.location.href).href,
  data:{url:ATD_DASHBOARD}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL(ATD_DASHBOARD);
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=clients.find(client=>{try{const url=new URL(client.url);return url.origin===target.origin&&['/atd-business-hub/','/atd-business-hub/index.html'].includes(url.pathname);}catch{return false;}});
  if(existing){existing.postMessage({type:'ATD_OPEN_WEBSITE_ENQUIRIES'});return existing.focus();}
  return self.clients.openWindow(ATD_DASHBOARD);
 })());
});
