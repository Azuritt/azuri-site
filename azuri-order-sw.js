'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Deliberately no fetch handler or offline cache: admin and customer data stay live.
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil((async()=>{
  await self.registration.showNotification(data.title||'Azuri · Order update',{
   body:data.body||'Open your dashboard to view store activity.',
   icon:'/favicon-azuri.png',badge:'/favicon-azuri.png',
   tag:data.tag||'azuri-order-update',data:{url:data.url||'/admin.html#ordersPanel'},
   silent:false,
  });
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  windows.filter(c=>new URL(c.url).pathname==='/admin.html').forEach(c=>c.postMessage({type:'AZURI_NEW_ORDER'}));
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let url=new URL(event.notification.data?.url||'/admin.html#ordersPanel',self.location.origin);
  if(url.origin!==self.location.origin||url.pathname!=='/admin.html')url=new URL('/admin.html#ordersPanel',self.location.origin);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).pathname==='/admin.html');
  if(existing){await existing.navigate(url.href);await existing.focus();}
  else await self.clients.openWindow(url.href);
 })());
});
