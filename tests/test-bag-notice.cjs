const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf("$('addBag').onclick=()=>{");const end=source.indexOf(';}',start);
const code=source.slice(start,end+2)+';';
function run({stock=5,qty=0,popup=true}={}){
 const button={};let saves=0,shows=0,opens=0,warnings=0;
 const p={id:'navy',color:'Navy',price:500,image:'navy.png',stock:{M:stock}};
 const cart=qty?[{id:'navy',size:'M',qty}]:[];
 const context={$:()=>button,products:[p],productId:'navy',selectedSize:'M',cart,connected:true,notify:()=>warnings++,saveBag:()=>saves++,openBag:()=>opens++,window:{azuriBagNotice:popup?{show:(product,size)=>{assert.equal(product,p);assert.equal(size,'M');shows++;}}:null}};
 vm.createContext(context);vm.runInContext(code,context);button.onclick();return{cart,saves,shows,opens,warnings};
}
let r=run();assert.equal(r.cart[0].qty,1);assert.equal(r.saves,1);assert.equal(r.shows,1);assert.equal(r.opens,0);
r=run({qty:1});assert.equal(r.cart[0].qty,2);assert.equal(r.shows,1);
r=run({stock:0});assert.equal(r.saves,0);assert.equal(r.shows,0);assert.equal(r.warnings,1);
r=run({qty:60,stock:100});assert.equal(r.saves,0);assert.equal(r.shows,0);
r=run({popup:false});assert.equal(r.opens,0);assert.equal(r.saves,1);assert.equal(r.warnings,1);
console.log('PASS: additions show notice; stock limits block invalid adds; missing notification script never auto-opens bag.');
