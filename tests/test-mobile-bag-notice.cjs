const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function run(native){
 const node=()=>({events:{},setAttribute(){},addEventListener(k,f){this.events[k]=f;}});
 const image=node(),name=node(),details=node(),close=node(),view=node(),panel=node();let bagClicks=0,shows=0;
 panel.querySelector=s=>({'.bag-notice-image':image,'.bag-notice-name':name,'.bag-notice-details':details,'.bag-notice-close':close,'.bag-notice-actions button':view})[s];
 panel.contains=()=>false;panel.matches=s=>s===':popover-open'?!!panel.open:false;
 if(native){panel.showPopover=()=>{panel.open=true;shows++;};panel.hidePopover=()=>{panel.open=false;};}
 const context={window:{},document:{createElement:()=>panel,body:{append(){}},getElementById:id=>id==='bag'?{click:()=>bagClicks++}:{focus(){}},addEventListener(){},querySelector:()=>null,activeElement:null},setTimeout:()=>1,clearTimeout(){}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('bag-notice.js','utf8'),context);
 context.window.azuriBagNotice.show({image:'navy.png',color:'Navy',price:500},'M');
 assert.equal(panel.hidden,false);assert.equal(bagClicks,0);assert.equal(name.textContent,'Élan · Navy');assert.match(details.textContent,/Size M/);
 if(native){assert.equal(shows,1);assert.equal(panel.open,true);}
 view.events.click();assert.equal(bagClicks,1);assert.equal(panel.hidden,true);if(native)assert.equal(panel.open,false);
}
run(true);run(false);console.log('PASS: top-layer popup and legacy fixed fallback both show notice first; only View Bag opens the bag.');
