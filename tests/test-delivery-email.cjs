const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const code=stripTypeScriptTypes(fs.readFileSync(__dirname+'/../supabase/functions/order-confirmation/index.ts','utf8'));
async function check(fee,area){
 let handler,sent;
 const order={id:'00000000-0000-4000-8000-000000000001',customer:{email:'test@example.invalid',firstName:'Test',lastName:'Buyer',address:'1 Test Street',city:'Test'},items:[{qty:1,price:500,color:'Black',size:'S'}],total:500+(fee||0),delivery_fee:fee,delivery_area:area,status:'Pending'};
 const context={Deno:{env:{get:()=> 'test'},serve:f=>handler=f},Response,console,fetch:async(url,options={})=>{
  if(url==='https://api.resend.com/emails'){sent=JSON.parse(options.body);return Response.json({id:'test-email'});}
  if(options.method==='PATCH')return Response.json({});
  return Response.json([order]);
 }};
 vm.runInNewContext(code,context);
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'x-order-email-secret':'test'},body:JSON.stringify({type:'INSERT',schema:'public',table:'orders',record:{id:order.id}})}));
 assert.equal(response.status,200);assert.ok(sent);assert.ok(!sent.attachments);
 assert.match(sent.text,/Merchandise subtotal: TT\$500\.00/);
 assert.match(sent.html,/@media\(prefers-color-scheme:dark\)/);
 assert.ok(!sent.html.includes('https://azuri.fit'));
 if(fee!=null){assert.ok(sent.text.includes('Delivery: TT$'+fee.toFixed(2)));assert.ok(sent.text.includes('Order total: TT$'+order.total.toFixed(2)));assert.ok(sent.html.includes('Delivery area: '+area));assert.ok(!sent.html.includes('Your final total will be confirmed'));assert.ok(sent.html.includes('Your total includes delivery'));}
 else {assert.match(sent.text,/Delivery charges are confirmed separately/);assert.ok(!sent.text.includes('Order total:'));assert.ok(sent.html.includes('To be confirmed'));}
}
(async()=>{await check(40,'St. Joseph');await check(80,'Tobago — Islandwide');await check(null,null);console.log('PASS: delivery subtotal, fee, area and total in text and HTML emails; legacy orders, dark-mode styles and no attachments preserved.');})();
