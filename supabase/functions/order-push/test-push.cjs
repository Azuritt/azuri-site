const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const crypto=require('node:crypto');
const webpush=require('web-push');
const keys=webpush.generateVAPIDKeys();
const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
let handler,mode='admin',calls=[],jobs=[],device=null,transportStatus=201;
const config={azuri_push_worker_secret:'test-worker-secret',azuri_push_public_key:keys.publicKey,azuri_push_private_key:keys.privateKey};
const context={URL,Request,Response,AbortSignal,console,atob,Date,JSON,Set,Number,String,Promise,webpush,
 Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://test.supabase.co':'test-key'},serve:fn=>handler=fn},
 fetch:async(url,options={})=>{
  calls.push({url,options});
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
  if(url.endsWith('/auth/v1/user'))return mode==='invalid'?json({},401):json({id:'admin-user',app_metadata:{azuri_admin:mode==='admin'}});
  if(url.endsWith('/rpc/azuri_push_config'))return json(config);
  if(url.endsWith('/rpc/azuri_claim_push'))return json(jobs);
  if(url.startsWith(subscription.endpoint))return new Response(null,{status:transportStatus});
  if(url.includes('azuri_push_devices')&&(!options.method||options.method==='GET'))return json(device?[device]:[]);
  return new Response(null,{status:204});
 }};
const ts=fs.readFileSync('index.ts','utf8').replace("import webpush from 'npm:web-push@3.6.7';",'').replace('export function validSubscription','function validSubscription');
vm.createContext(context);vm.runInContext(stripTypeScriptTypes(ts),context);
async function invoke(body,headers={}){return handler(new Request('https://test/functions/v1/order-push',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));}
const admin={Authorization:'Bearer valid'};
(async()=>{
 assert.equal(context.validSubscription(subscription),true);
 for(const endpoint of ['http://web.push.apple.com/test','https://web.push.apple.com.evil.com/test','https://127.0.0.1/test','https://example.com/test','https://user:pass@web.push.apple.com/test'])assert.equal(context.validSubscription({...subscription,endpoint}),false);
 assert.equal((await invoke({action:'config'})).status,401);
 mode='invalid';assert.equal((await invoke({action:'config'},admin)).status,401);
 mode='customer';assert.equal((await invoke({action:'config'},admin)).status,403);
 mode='admin';const pub=await(await invoke({action:'config'},admin)).json();assert.deepEqual(pub,{publicKey:keys.publicKey});
 assert.equal((await invoke({action:'dispatch'},admin)).status,401);
 assert.equal((await invoke({action:'subscribe',endpoint:'https://127.0.0.1',subscription:{...subscription,endpoint:'https://127.0.0.1'}},admin)).status,400);
 assert.equal((await invoke({action:'subscribe',endpoint:subscription.endpoint,subscription},admin)).status,200);
 device={...subscription,id:'device',user_id:'admin-user',subscription,last_test_at:null};
 assert.equal((await invoke({action:'test',endpoint:subscription.endpoint},admin)).status,200);
 jobs=[{id:'job',device_id:'device',subscription,order_id:'12345678-1234-4234-8234-123456789012',total:1000,item_count:2,attempts:1,order_status:'Pending'}];
 const dispatchHeaders={'x-azuri-push-secret':'test-worker-secret'};
 calls=[];assert.equal((await invoke({action:'dispatch'},dispatchHeaders)).status,200);
 let patch=calls.find(c=>c.url.includes('azuri_push_deliveries')&&c.options.method==='PATCH');assert.equal(JSON.parse(patch.options.body).status,'sent');
 transportStatus=503;calls=[];await invoke({action:'dispatch'},dispatchHeaders);
 patch=calls.find(c=>c.url.includes('azuri_push_deliveries'));assert.equal(JSON.parse(patch.options.body).status,'pending');
 transportStatus=410;calls=[];await invoke({action:'dispatch'},dispatchHeaders);
 assert(calls.some(c=>c.url.includes('azuri_push_devices')&&c.options.method==='DELETE'));
 jobs[0].order_status='Cancelled';calls=[];await invoke({action:'dispatch'},dispatchHeaders);assert(!calls.some(c=>c.url.startsWith(subscription.endpoint)));
 console.log('PASS: endpoint allowlist, anonymous/expired/non-admin auth, private-key isolation, subscribe, encrypted test, dispatch, retry, expired-device cleanup, cancelled-order skip.');
})().catch(e=>{console.error(e);process.exitCode=1;});
