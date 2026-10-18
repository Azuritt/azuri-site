const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/../app.js','utf8');
const options=[['st-joseph',40],['tunapuna-arima',40],['san-juan',40],['port-of-spain',45],['north-west',50],['central',45],['couva',50],['san-fernando',55],['princes-town',60],['south-west',65],['north-east',55],['south-east',65],['remote-coast',75],['remote',80],['tobago',80]].map(([id,fee])=>({id,label:id,fee}));
const tick=()=>new Promise(setImmediate);
async function setup(failOptions=false){
 const node=()=>({textContent:'',innerHTML:'',value:'',style:{},events:{},disabled:false,hidden:false,addEventListener(k,f){this.events[k]=f;},querySelectorAll(){return []},setAttribute(){},showModal(){},close(){}});
 const ids=Object.fromEntries(['count','bagItems','bagTotal','checkoutLink','bagDialog','bag','closeBag','summaryItems','summaryTotal','summarySubtotal','deliveryTotal','deliverySelection','deliveryArea','placeOrder','checkoutStatus','orderForm','toast','orderDetails','saveStatus','orderDialog','orderStatus'].map(id=>[id,node()]));
 const fields=[node(),node()];ids.orderForm.querySelectorAll=()=>fields;
 let calls=[],rejectOrder=true;
 const productData=['ivory','navy','black'].map(id=>({id,color:id,price:500,image:id+'.png',stock:{S:20}}));
 const context={console,URLSearchParams,crypto,location:{search:''},history:{replaceState(){}},window:{AZURI_CONFIG:{supabaseUrl:'https://test.invalid',anonKey:'test'}},document:{getElementById:id=>ids[id]||null,createElement:node,head:{append(){}},body:{style:{},append(){},classList:{add(){},remove(){}}}},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>JSON.stringify([{id:'black',size:'S',qty:1}]),setItem(){}},setTimeout:()=>0,FormData:class{constructor(){return new Map(Object.entries({email:'test@example.invalid',firstName:'Test',lastName:'Buyer',phone:'1',address:'Test',city:'Test',country:'Trinidad and Tobago',deliveryArea:ids.deliveryArea.value}));}},fetch:async(url,req)=>{
  if(url.includes('delivery_options')){if(failOptions)throw Error('Offline');return {ok:true,json:async()=>options};}
  if(url.includes('/products?'))return {ok:true,json:async()=>productData};
  if(url.includes('/place_order')){calls.push(JSON.parse(req.body));await tick();return rejectOrder?{ok:false,json:async()=>({message:'Please retry.'})}:{ok:true,json:async()=>({id:'test-order',subtotal:500,delivery_fee:80,total:580})};}
  throw Error(url);
 }};
 vm.createContext(context);vm.runInContext(code,context);await tick();await tick();
 return {ids,context,fields,calls,allowOrder(){rejectOrder=false;}};
}
(async()=>{
 const {ids,context,fields,calls,allowOrder}=await setup();
 assert.equal(ids.placeOrder.disabled,true);assert.equal(ids.summaryTotal.textContent,'—');
 assert.equal(ids.deliveryArea.disabled,false);
 for(const option of options){ids.deliveryArea.value=option.id;ids.deliveryArea.events.change();assert.equal(ids.deliveryTotal.textContent,'TT$'+option.fee.toFixed(2));assert.equal(ids.summaryTotal.textContent,'TT$'+(500+option.fee).toFixed(2));assert.equal(ids.placeOrder.disabled,false);}
 vm.runInContext('cart[0].qty=2;renderBag()',context);assert.equal(ids.summaryTotal.textContent,'TT$1,080.00');
 vm.runInContext('cart[0].qty=1;renderBag()',context);
 const event={preventDefault(){},target:ids.orderForm};
 const first=ids.orderForm.onsubmit(event);await ids.orderForm.onsubmit(event);await first;
 assert.equal(calls.length,1);assert.equal(ids.checkoutStatus.textContent,'Please retry.');assert.equal(ids.placeOrder.disabled,false);assert.ok(fields.every(f=>!f.disabled));
 assert.equal(calls[0].customer.deliveryArea,'tobago');assert.equal(calls[0].customer.deliveryFee,undefined);
 allowOrder();await ids.orderForm.onsubmit(event);assert.equal(calls.length,2);assert.equal(calls[0].request_id,calls[1].request_id);assert.equal(ids.summaryTotal.textContent,'TT$580.00');assert.match(ids.orderForm.innerHTML,/Request received/);
 vm.runInContext("orders=[{id:'order-1',customer:{firstName:'Test',lastName:'Buyer',address:'Test',city:'Test',country:'Trinidad and Tobago'},items:[],total:580,delivery_fee:80,delivery_area:'Tobago — Islandwide',status:'Pending',created_at:new Date().toISOString()}]",context);
 // The real dashboard detail rendering is part of the admin-only handler.
 const legacy=await setup(true);assert.equal(legacy.ids.placeOrder.disabled,true);assert.equal(legacy.ids.deliveryArea.disabled,true);assert.match(legacy.ids.checkoutStatus.textContent,/Delivery fees could not be loaded/);
 const analytics={};vm.runInNewContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),analytics);
 const paid={status:'Paid',created_at:'2026-10-18T12:00:00Z',total:580,delivery_fee:80,items:[{price:500,qty:1,color:'Black'}]};
 assert.equal(analytics.AZURI_ANALYTICS.summarize([paid],7,new Date('2026-10-18T12:00:00Z')).total,500);
 console.log('PASS: all 15 checkout fees, quantity recalculation, submission and retry, duplicate-submit prevention, loading failure, and merchandise analytics excluding delivery.');
})();
