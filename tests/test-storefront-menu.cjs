const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const classes=new Set();
function element(){return{events:{},attrs:{},addEventListener(name,fn){this.events[name]=fn;},setAttribute(k,v){this.attrs[k]=v;}};}
const toggle=element(),close=element(),drawer=element();
drawer.showModal=()=>{drawer.open=true;};drawer.close=()=>{drawer.open=false;drawer.events.close();};drawer.getBoundingClientRect=()=>({left:0,right:380,top:0,bottom:844});drawer.closest=()=>null;
const elements={openMenu:toggle,siteMenu:drawer,closeMenu:close};
const ctx={document:{getElementById:id=>elements[id],body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('storefront-header.js','utf8'),ctx);
toggle.events.click();assert.equal(drawer.open,true);assert.equal(toggle.attrs['aria-expanded'],'true');assert(classes.has('menu-open'));
close.events.click();assert.equal(drawer.open,false);assert.equal(toggle.attrs['aria-expanded'],'false');assert(!classes.has('menu-open'));
toggle.events.click();drawer.events.click({target:{closest:()=>({})}});assert.equal(drawer.open,false);
toggle.events.click();drawer.events.click({target:drawer,clientX:500,clientY:200});assert.equal(drawer.open,false);
console.log('PASS: menu open/close, expanded state, body scroll unlock, navigation link close, and backdrop close.');
