import webpush from 'npm:web-push@3.6.7';

const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const origins = new Set(['https://azuri.fit','https://www.azuri.fit']);
const headers = {apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
async function db(path:string, method='GET', body?:unknown) {
 const response = await fetch(base+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok) throw new Error('Notification storage unavailable');
 return response.status===204?null:await response.json().catch(()=>null);
}
export function validSubscription(s:any) {
 try {
  const u=new URL(s.endpoint);
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com','notify.windows.com'];
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!hosts.some(h=>u.hostname===h || (h==='notify.windows.com'&&u.hostname.endsWith('.'+h)))) return false;
  if(s.endpoint.length>4096) return false;
  const decode=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(v)?atob(v.replace(/-/g,'+').replace(/_/g,'/')).length:0;
  return decode(s.keys?.p256dh)===65 && decode(s.keys?.auth)===16;
 } catch {return false;}
}
async function send(subscription:any,payload:any,config:any,topic:string) {
 if(!validSubscription(subscription)) return 410;
 const details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{
  TTL:86400,urgency:'high',topic,
  vapidDetails:{subject:'mailto:azuriclothingtt@gmail.com',publicKey:config.azuri_push_public_key,privateKey:config.azuri_push_private_key},
 });
 const r=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});
 await r.body?.cancel();
 return r.status;
}
async function dispatch(config:any) {
 const jobs=await db('rpc/azuri_claim_push','POST',{});
 let accepted=0;
 // A bounded batch with independent per-device outcomes.
 for(let i=0;i<jobs.length;i+=5) await Promise.all(jobs.slice(i,i+5).map(async (job:any)=>{
  let code=0;
  try {
   if(job.order_status==='Cancelled') {
    await db('azuri_push_deliveries?id=eq.'+job.id,'PATCH',{status:'failed',locked_until:null}); return;
   }
   code=await send(job.subscription,{
    title:'Azuri · New order',
    body:'TT$'+Number(job.total).toLocaleString('en-TT',{minimumFractionDigits:2,maximumFractionDigits:2})+' · '+job.item_count+' item'+(job.item_count===1?'':'s')+'\nReference '+job.order_id.slice(0,8).toUpperCase(),
    tag:'azuri-order-'+job.order_id,url:'/admin.html?order='+job.order_id+'#ordersPanel',
   },config,job.order_id.replace(/-/g,''));
  } catch { code=0; }
  if(code===404||code===410) {await db('azuri_push_devices?id=eq.'+job.device_id,'DELETE');return;}
  const ok=code>=200&&code<300;
  const transient=code===0||code===408||code===429||code>=500;
  await db('azuri_push_deliveries?id=eq.'+job.id,'PATCH',{
   status:ok?'sent':(transient&&job.attempts<6?'pending':'failed'),http_status:code||null,locked_until:null,
   sent_at:ok?new Date().toISOString():null,
   next_attempt_at:new Date(Date.now()+Math.min(900000,30000*2**job.attempts)).toISOString(),
  });
  if(ok) accepted++;
 }));
 return {processed:jobs.length,accepted};
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 const cors=origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS') return new Response(null,{status:origins.has(origin)?204:403,headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  if(Number(req.headers.get('content-length')||0)>16384) return reply({error:'Request too large'},413);
  const text=await req.text();if(text.length>16384)return reply({error:'Request too large'},413);
  const body=JSON.parse(text);
  // The gateway JWT check is disabled because the dispatcher uses its own secret.
  // Every device-management request is separately verified against Supabase Auth.
  if(body.action==='dispatch') {
   const config=await db('rpc/azuri_push_config','POST',{});
   if(!config?.azuri_push_worker_secret||req.headers.get('x-azuri-push-secret')!==config.azuri_push_worker_secret) return reply({error:'Unauthorized'},401);
   return reply(await dispatch(config));
  }
  if(origin&&!origins.has(origin)) return reply({error:'Origin not allowed'},403);
  const auth=req.headers.get('Authorization')||'';
  if(!/^Bearer .+/i.test(auth)) return reply({error:'Sign in to your dashboard first.'},401);
  const userResponse=await fetch(base+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:auth}});
  if(!userResponse.ok) return reply({error:'Your session has expired. Please sign in again.'},401);
  const user=await userResponse.json();
  if(user.app_metadata?.azuri_admin!==true) return reply({error:'Admin access required'},403);
  if(body.action==='config') {
   const config=await db('rpc/azuri_push_config','POST',{});
   return reply({publicKey:config.azuri_push_public_key});
  }
  if(!['subscribe','status','unsubscribe','test'].includes(body.action)) return reply({error:'Unknown action'},400);
  if(typeof body.endpoint!=='string'||body.endpoint.length>4096)return reply({error:'Invalid device'},400);
  const filter='endpoint=eq.'+encodeURIComponent(body.endpoint)+'&user_id=eq.'+user.id;
  if(body.action==='subscribe') {
   if(!validSubscription(body.subscription)||body.endpoint!==body.subscription.endpoint)return reply({error:'This browser subscription is unsupported.'},400);
   const existing=await db('azuri_push_devices?select=id,user_id&endpoint=eq.'+encodeURIComponent(body.endpoint));
   if(existing.length&&existing[0].user_id!==user.id)return reply({error:'Disable notifications for the previous account on this device first.'},409);
   const other=await db('azuri_push_devices?select=id&user_id=eq.'+user.id);
   if(!existing.length&&other.length>=20)return reply({error:'Device limit reached. Remove an old device first.'},409);
   const data={user_id:user.id,endpoint:body.endpoint,subscription:{endpoint:body.endpoint,keys:body.subscription.keys},label:String(body.label||'Device').slice(0,80),updated_at:new Date().toISOString()};
   if(existing.length) await db('azuri_push_devices?'+filter,'PATCH',data);
   else await db('azuri_push_devices','POST',data);
   return reply({enabled:true});
  }
  if(body.action==='unsubscribe') {await db('azuri_push_devices?'+filter,'DELETE');return reply({enabled:false});}
  const devices=await db('azuri_push_devices?select=*&'+filter);
  const device=devices[0];
  if(body.action==='status')return reply({enabled:!!device});
  if(!device)return reply({error:'Enable notifications on this device first.'},409);
  if(device.last_test_at && Date.now()-new Date(device.last_test_at).getTime()<15000)return reply({error:'Please wait a few seconds before testing again.'},429);
  await db('azuri_push_devices?'+filter,'PATCH',{last_test_at:new Date().toISOString()});
  const config=await db('rpc/azuri_push_config','POST',{});
  const code=await send(device.subscription,{title:'Azuri · Notifications ready',body:'New order alerts are connected on this device.',tag:'azuri-push-test',url:'/admin.html#overview'},config,'azuri-push-test');
  if(code===404||code===410) {await db('azuri_push_devices?'+filter,'DELETE');return reply({error:'This subscription has expired. Enable notifications again.'},410);}
  if(code<200||code>=300)return reply({error:'The notification service could not accept the test. Please try again.'},502);
  return reply({accepted:true});
 } catch {
  console.error('Azuri push request failed');
  return reply({error:'Notifications are temporarily unavailable. Please try again.'},500);
 }
});
