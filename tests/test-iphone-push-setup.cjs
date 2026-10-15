const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
async function run(permission,hang=false){
 const elements=Object.fromEntries(['pushPanel','pushStatus','enablePush','testPush','disablePush','pushInstallHint','adminContent'].map(id=>[id,{hidden:false,disabled:false,dataset:{},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}}]));
 let subscribeCalls=0;
 const sub={endpoint:'https://web.push.apple.com/test',toJSON:()=>({})};
 const reg={active:{},pushManager:{getSubscription:async()=>null,subscribe:()=>{subscribeCalls++;return hang?new Promise(()=>{}):Promise.resolve(sub);}}};
 const context={document:{getElementById:id=>elements[id],querySelector:()=>null},window:{AZURI_CONFIG:{supabaseUrl:'https://test',anonKey:'public'},matchMedia:()=>({matches:true}),isSecureContext:true,addEventListener(){}},navigator:{userAgent:'iPhone',platform:'iPhone',standalone:true,serviceWorker:{register:async()=>reg,ready:new Promise(()=>{}),addEventListener(){}}},Notification:{permission,requestPermission(){throw Error('Must use direct subscribe');}},PushManager:function(){},sessionStorage:{getItem:()=> 'token'},location:{search:''},URLSearchParams,URL,Uint8Array,atob,AbortSignal,MutationObserver:class{observe(){}},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,30)),clearTimeout,fetch:async()=>new Response(JSON.stringify({publicKey:'AQID'})),Response};
 // Production feature detection checks window properties.
 context.window.Notification=context.Notification;context.window.PushManager=context.PushManager;
 vm.createContext(context);vm.runInContext(fs.readFileSync('order-notifications.js','utf8'),context);
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(elements.enablePush.disabled,false,'Enable must not stay locked');
 assert.match(elements.pushStatus.textContent,/Connect this device/);
 const result=elements.enablePush.handlers.click();
 assert.equal(subscribeCalls,1,'Subscribe must execute synchronously during the tap, before any await');
 await result;
 assert.equal(elements.enablePush.disabled,false,'Permission timeout must unlock the button');
 if(hang)assert.match(elements.pushStatus.textContent,/did not finish/);
 else {assert.equal(elements.testPush.hidden,false);assert.match(elements.pushStatus.textContent,/Connected/);}
}
(async()=>{await run('default');await run('granted');await run('default',true);console.log('PASS: iPhone preflight, synchronous tap-to-subscribe, no separate permission wait, test button after enrollment, and permission-hang recovery.');})().catch(e=>{console.error(e);process.exitCode=1;});
