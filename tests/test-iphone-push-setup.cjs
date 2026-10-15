const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
async function run(permission){
 const elements=Object.fromEntries(['pushPanel','pushStatus','enablePush','testPush','disablePush','pushInstallHint','adminContent'].map(id=>[id,{hidden:false,disabled:false,dataset:{},addEventListener(){}}]));
 const reg={active:{},pushManager:{getSubscription:async()=>null}};
 const context={document:{getElementById:id=>elements[id],querySelector:()=>null},window:{AZURI_CONFIG:{supabaseUrl:'https://test',anonKey:'public'},matchMedia:()=>({matches:true}),isSecureContext:true,addEventListener(){}},navigator:{userAgent:'iPhone',platform:'iPhone',standalone:true,serviceWorker:{register:async()=>reg,ready:new Promise(()=>{}),addEventListener(){}}},Notification:{permission},PushManager:function(){},sessionStorage:{getItem:()=> 'token'},location:{search:''},URLSearchParams,URL,Uint8Array,atob,AbortSignal,MutationObserver:class{observe(){}},setTimeout,clearTimeout,fetch:async()=>new Response(JSON.stringify({publicKey:'public'})),Response};
 // Production feature detection checks window properties.
 context.window.Notification=context.Notification;context.window.PushManager=context.PushManager;
 vm.createContext(context);vm.runInContext(fs.readFileSync('order-notifications.js','utf8'),context);
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(elements.enablePush.disabled,false,'Enable must not stay locked');
 assert.match(elements.pushStatus.textContent,/Connect this device/);
}
(async()=>{await run('default');await run('granted');console.log('PASS: first-time iPhone enable remains available; granted-permission setup works even when serviceWorker.ready never resolves.');})().catch(e=>{console.error(e);process.exitCode=1;});
