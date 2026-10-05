/* Paid merchandise analytics. Dates use the store's Trinidad & Tobago timezone. */
(function(root){
  const dayKey=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Port_of_Spain',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
  function summarize(orders,days,now=new Date(),productName="",catalogue=[]){
    const today=dayKey(now),end=new Date(today+'T12:00:00Z'),buckets=[];
    for(let n=days-1;n>=0;n--){const d=new Date(end);d.setUTCDate(d.getUTCDate()-n);buckets.push({date:d.toISOString().slice(0,10),revenue:0,units:0});}
    const dates=new Map(buckets.map(b=>[b.date,b])),colors={Black:0,Ivory:0,Navy:0};let total=0,count=0;
    for(const order of orders){if(order.status!=='Paid')continue;const date=new Date(order.created_at);if(Number.isNaN(date.getTime()))continue;const bucket=dates.get(dayKey(date));if(!bucket)continue;const selected=(order.items||[]).filter(i=>!productName||(i.product_name||catalogue.find(p=>p.id===i.id)?.product_name||'Élan I')===productName);if(productName&&!selected.length)continue;const amount=productName?selected.reduce((s,i)=>s+Number(i.price)*Number(i.qty),0):Number(order.total);if(!Number.isFinite(amount))continue;bucket.revenue+=amount;total+=amount;count++;
      for(const item of selected){const qty=Number(item.qty);if(!Number.isFinite(qty)||qty<=0)continue;const color=String(item.color||'Other');colors[color]=(colors[color]||0)+qty;bucket.units+=qty;}
    }
    return {buckets,colors,total,count,units:Object.values(colors).reduce((a,b)=>a+b,0)};
  }
  root.AZURI_ANALYTICS={summarize};
  if(typeof document==='undefined')return;
  const cash=n=>'TT$'+Number(n).toLocaleString('en-TT',{minimumFractionDigits:2,maximumFractionDigits:2});
  const short=date=>new Intl.DateTimeFormat('en-TT',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  let source=[],catalogue=[];
  function render(){
    const days=Number(document.getElementById('analyticsRange').value),data=summarize(source,days,new Date(),document.getElementById('analyticsProduct').value,catalogue),svg=document.getElementById('revenueGraph');
    document.getElementById('chartRevenue').textContent=cash(data.total);
    document.getElementById('chartUnits').textContent=data.units+' units';
    document.getElementById('chartPeriod').textContent=short(data.buckets[0].date)+' – '+short(data.buckets.at(-1).date);
    const width=620,height=220,left=66,right=16,top=20,bottom=36,max=Math.max(1,...data.buckets.map(b=>b.revenue)),scale=Math.pow(10,Math.floor(Math.log10(max))),ceiling=Math.ceil(max/scale)*scale;
    const x=i=>left+i*(width-left-right)/(days-1),y=n=>height-bottom-n*(height-top-bottom)/ceiling;
    const NS='http://www.w3.org/2000/svg';svg.replaceChildren();
    function add(tag,attrs,text){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;}
    add('title',{},'Daily merchandise revenue from Paid orders');add('desc',{},data.count?days+' days, total '+cash(data.total)+'. Exact daily values are in the table below.':'No Paid orders in this period.');
    for(let i=0;i<=4;i++){const n=ceiling*i/4;add('line',{x1:left,y1:y(n),x2:width-right,y2:y(n),stroke:'#e8dfd3'});add('text',{x:left-10,y:y(n)+4,'text-anchor':'end',class:'chart-axis'},n>=1000?(n/1000).toLocaleString('en-TT',{maximumFractionDigits:1})+'k':n.toLocaleString('en-TT',{maximumFractionDigits:0}));}
    const points=data.buckets.map((b,i)=>x(i)+','+y(b.revenue)).join(' ');
    add('polygon',{points:left+','+y(0)+' '+points+' '+x(days-1)+','+y(0),fill:'#806044',opacity:'.1'});
    add('polyline',{points,fill:'none',stroke:'#6b4730','stroke-width':2.5,'stroke-linejoin':'round'});
    for(const i of [0,Math.floor((days-1)/2),days-1])add('text',{x:x(i),y:height-10,'text-anchor':i===0?'start':i===days-1?'end':'middle',class:'chart-axis'},short(data.buckets[i].date));
    data.buckets.forEach((b,i)=>{if(b.revenue){const point=add('circle',{cx:x(i),cy:y(b.revenue),r:3.5,fill:'#6b4730'});const t=document.createElementNS(NS,'title');t.textContent=short(b.date)+': '+cash(b.revenue);point.append(t);}});
    document.getElementById('revenueEmpty').hidden=!!data.count;
    const list=document.getElementById('colorGraph');list.replaceChildren();const largest=Math.max(1,...Object.values(data.colors));
    for(const [color,qty]of Object.entries(data.colors)){const row=document.createElement('div');row.className='color-chart-row';const name=document.createElement('span');name.textContent=color;const value=document.createElement('strong');value.textContent=qty+' '+(qty===1?'unit':'units');const track=document.createElement('div');track.className='color-chart-track';const bar=document.createElement('div');bar.className='color-chart-bar';bar.style.width=(qty/largest*100)+'%';bar.style.background=color==='Navy'?'#34475a':color==='Ivory'?'#cbbca4':'#49382c';track.append(bar);row.append(name,value,track);list.append(row);}
    const table=document.getElementById('revenueData');table.replaceChildren();for(const b of data.buckets){const tr=document.createElement('tr');for(const value of [short(b.date),cash(b.revenue),b.units]){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}
  }
  root.renderAzuriAnalytics=(orders,products=[])=>{source=orders;catalogue=products;const select=document.getElementById('analyticsProduct'),previous=select.value;select.replaceChildren(new Option('All products',''));const names=new Set([...products.map(p=>p.product_name||'Élan I'),...orders.flatMap(o=>(o.items||[]).map(i=>i.product_name||products.find(p=>p.id===i.id)?.product_name||'Élan I'))]);for(const name of names)select.add(new Option(name,name));if(names.has(previous))select.value=previous;render();};document.getElementById('analyticsProduct').addEventListener('change',render);
  document.getElementById('analyticsRange').addEventListener('change',render);
})(typeof window==='undefined'?globalThis:window);
