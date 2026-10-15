(() => {
 'use strict';
 const panel=document.getElementById('pushPanel');
 if(!panel)return;
 const status=document.getElementById('pushStatus');
 const enable=document.getElementById('enablePush');
 const test=document.getElementById('testPush');
 const disable=document.getElementById('disablePush');
 const hint=document.getElementById('pushInstallHint');
 const cfg=window.AZURI_CONFIG;
 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&window.isSecureContext;
 let registration, publicKey, currentSubscription, busy=false, initialized=false;
 function setState(message,on=false){status.textContent=message;panel.dataset.enabled=String(on);enable.hidden=on;test.hidden=!on;disable.hidden=!on;}
 function lock(value){busy=value;[enable,test,disable].forEach(b=>b.disabled=value);}
 async function request(action,data={}){
  const token=sessionStorage.getItem('azuriAdminToken');
  if(!token)throw Error('Sign in to your dashboard first.');
  const r=await fetch(cfg.supabaseUrl+'/functions/v1/order-push',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:'Bearer '+token},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(20000)});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(result.error||'Unable to connect notifications. Please try again.');
  return result;
 }
 function keyBytes(key){return Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
 async function bounded(promise,message,ms=15000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]);}
  finally{clearTimeout(timer);}
 }
 async function prepare(){
  if(!registration?.active){
   const reg=await bounded(navigator.serviceWorker.register('/azuri-order-sw.js',{scope:'/',updateViaCache:'none'}),'Device setup timed out. Close and reopen Azuri Orders, then try again.');
   if(!reg.active){
    await bounded(new Promise((resolve,reject)=>{
     const worker=reg.installing||reg.waiting;
     if(!worker){reject(Error('Notification setup could not start. Close and reopen Azuri Orders.'));return;}
     const changed=()=>{if(worker.state==='activated'){worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){worker.removeEventListener('statechange',changed);reject(Error('Notification setup failed. Please reload and try again.'));}};
     worker.addEventListener('statechange',changed);changed();
    }),'Device setup timed out. Close and reopen Azuri Orders, then try again.');
   }
   registration=reg;
  }
  if(!publicKey)publicKey=(await request('config')).publicKey;
  return registration;
 }
 function openOrder(){
  const id=new URLSearchParams(location.search).get('order');
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;
  const button=document.querySelector('[data-order="'+id+'"]');
  if(button){button.click();const u=new URL(location.href);u.searchParams.delete('order');history.replaceState(null,'',u);}
 }
 async function initialize(){
  openOrder();
  if(initialized||document.getElementById('adminContent').hidden)return;
  initialized=true;
  if(ios&&!standalone){
   hint.hidden=false;hint.textContent='On iPhone or iPad: open this dashboard in Safari, tap Share → Add to Home Screen, then open Azuri Orders from your Home Screen and enable notifications.';
   enable.disabled=true;setState('Add Azuri Orders to your Home Screen to connect this device.');return;
  }
  if(!supported){enable.disabled=true;setState('Push notifications are unavailable in this browser. Use an up-to-date supported browser.');return;}
  if(Notification.permission==='denied'){setState('Notifications are blocked. Allow them in iPhone Settings → Notifications → Azuri Orders, then reopen the app.');enable.disabled=true;return;}
  setState('Preparing this device for notifications…');
  lock(true);
  try{
   await bounded(prepare(),'Setup could not finish. Tap Retry setup to reconnect.',20000);
   const sub=await bounded(registration.pushManager.getSubscription(),'Could not read this device’s notification settings. Reopen Azuri Orders and try again.');
   currentSubscription=sub;
   const saved=sub?await request('status',{endpoint:sub.endpoint}):{enabled:false};
   enable.textContent='Enable on this device';
   if(Notification.permission==='denied'){enable.disabled=true;setState('Notifications are blocked. Allow them in your browser or device settings, then reload.');}
   else setState(saved.enabled?'Order alerts are enabled on this device.':'Connect this device to receive new order alerts.',saved.enabled);
  }catch(e){setState(e.message);enable.textContent='Retry setup';initialized=false;}
  finally{lock(false);if(Notification.permission==='denied')enable.disabled=true;}
 }
 enable.addEventListener('click',async()=>{
  if(busy)return;
  if(!registration?.active||!publicKey){
   initialized=false;await initialize();
   if(registration?.active&&publicKey)status.textContent='Device ready. Tap Enable on this device to allow notifications.';
   return;
  }
  lock(true);status.textContent='Allow notifications in the iPhone prompt…';
  try{
   // Safari requires subscribe itself to run directly in the tap handler.
   // Registration and VAPID configuration are prepared before the tap.
   const subscriptionPromise=currentSubscription?Promise.resolve(currentSubscription):registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
   const sub=await bounded(subscriptionPromise,'iPhone did not finish the permission request. Check Settings → Notifications → Azuri Orders, then try again.',20000);
   currentSubscription=sub;
   status.textContent='Saving this device’s notification connection…';
   await request('subscribe',{endpoint:sub.endpoint,subscription:sub.toJSON(),label:ios?'iPhone / iPad':/Mac/.test(navigator.platform)?'Mac':'Desktop / Android'});
   setState('Connected. Use “Send test notification” to check the alert and sound.',true);
  }catch(e){status.textContent=e.name==='NotAllowedError'?'Notifications were not allowed. Check your device notification settings, then try again.':e.message;}
  finally{lock(false);}
 });
 test.addEventListener('click',async()=>{
  if(busy)return;lock(true);
  try{
   await prepare();const sub=await bounded(registration.pushManager.getSubscription(),'Could not read this device’s notification settings. Reopen Azuri Orders and try again.');
   if(!sub)throw Error('Enable notifications again on this device.');
   await request('test',{endpoint:sub.endpoint});
   status.textContent='Test accepted for delivery. Check your notifications; sound follows your device and Focus settings.';
  }catch(e){status.textContent=e.message;}
  finally{lock(false);}
 });
 async function disconnect(){
  if(!supported)return;
  const reg=registration||await navigator.serviceWorker.getRegistration('/');
  const sub=await reg?.pushManager.getSubscription();
  if(!sub)return;
  let serverError;
  try{await request('unsubscribe',{endpoint:sub.endpoint});}catch(e){serverError=e;}
  // Unsubscribe locally even if the admin session expired or the connection failed.
  const removed=await sub.unsubscribe();currentSubscription=null;
  if(serverError&&!removed)throw serverError;
  const alerts=await reg.getNotifications();alerts.forEach(n=>n.close());
 }
 disable.addEventListener('click',async()=>{
  if(busy)return;lock(true);
  try{await disconnect();setState('Order alerts are off on this device.');}catch(e){status.textContent=e.message;}
  finally{lock(false);}
 });
 // App logout awaits local unsubscription before discarding the admin session.
 window.azuriOrderPush={disconnect};
 window.addEventListener('azuri:admin-ready',initialize);
 navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='AZURI_NEW_ORDER'&&!document.getElementById('adminContent').hidden){
   document.getElementById('refresh').click();
  }
 });
 const observer=new MutationObserver(()=>{if(!document.getElementById('adminContent').hidden)initialize();});
 observer.observe(document.getElementById('adminContent'),{attributes:true,attributeFilter:['hidden']});
 initialize();
})();
