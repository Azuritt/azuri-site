'use strict';
(() => {
  const byId=id=>document.getElementById(id);
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stars=n=>'★'.repeat(n)+'☆'.repeat(5-n);
  const date=s=>new Date(s).toLocaleDateString('en-TT',{month:'short',day:'numeric',year:'numeric'});
  const request=async(path,options={},admin=false)=>{
    const cfg=window.AZURI_CONFIG||{};
    const access=admin?sessionStorage.getItem('azuriAdminToken'):null;
    if(admin&&!access)throw Error('Please sign in to manage reviews.');
    const response=await fetch(cfg.supabaseUrl+path,{...options,headers:{apikey:cfg.anonKey,'Content-Type':'application/json',...(access?{Authorization:'Bearer '+access}:{}),...options.headers}});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw Error(response.status===401?'Your session has expired. Please sign in again.':'Unable to save or load reviews. Please try again.');
    return data;
  };
  const accordion=byId('reviewsAccordion'),dialog=byId('reviewsDialog');
  if(dialog&&accordion){
    let variants=[],current='',page=0,loading=false,generation=0,total=0;
    const list=byId('reviewList'),status=byId('reviewsStatus'),form=byId('reviewForm'),formPanel=byId('reviewFormPanel');
    const getVariant=()=>new URLSearchParams(location.search).get('product')||'ivory';
    const card=r=>`<article class="review-card"><div class="review-card-head"><span class="reviews-stars" role="img" aria-label="${r.rating} out of 5 stars">${stars(r.rating)}</span><time datetime="${safe(r.created_at)}">${date(r.created_at)}</time></div><h3>${safe(r.title)}</h3><p>${safe(r.body)}</p><small>${safe(r.display_name)} · ${safe(variants.find(p=>p.id===r.product_id)?.color||'')}</small></article>`;
    async function load(reset=true){
      const run=++generation;loading=true;byId('reviewMore').hidden=true;status.textContent='';
      if(reset){page=0;list.innerHTML='<p class="reviews-status">Loading reviews…</p>';}
      try{
        current=getVariant();
        if(!variants.length)variants=await request('/rest/v1/products?select=id,product_name,color&active=eq.true');
        const product=variants.find(p=>p.id===current)||variants.find(p=>p.id==='ivory');
        if(!product)throw Error('Unavailable');
        current=product.id;
        byId('reviewProductName').textContent=product.product_name||'Élan';
        const ids=variants.filter(p=>p.product_name===product.product_name).map(p=>p.id);
        const sort=byId('reviewSort').value==='highest'?'rating.desc,created_at.desc':'created_at.desc';
        const [summary,rows]=await Promise.all([request('/rest/v1/rpc/product_review_summary',{method:'POST',body:JSON.stringify({variant_id:current})}),request('/rest/v1/product_reviews?select=id,product_id,display_name,rating,title,body,created_at&status=eq.published&product_id=in.('+ids.map(id=>encodeURIComponent(id)).join(',')+')&order='+sort+'&limit=10&offset='+page*10)]);
        if(run!==generation)return;
        total=summary.count;
        byId('reviewAverage').textContent=total?Number(summary.average).toFixed(1):'—';
        byId('reviewAverageStars').textContent=total?stars(Math.round(summary.average)):'☆☆☆☆☆';
        byId('reviewAverageStars').setAttribute('aria-label',total?`${summary.average} out of 5 stars`:'No ratings yet');
        byId('reviewCount').textContent=total?`${total} customer review${total===1?'':'s'}`:'No ratings yet';
        ['five','four','three','two','one'].forEach((key,index)=>{const value=Number(summary[key]);byId('reviewBar'+(5-index)).style.width=(total?value/total*100:0)+'%';byId('reviewBarCount'+(5-index)).textContent=value;});
        const empty='<div class="reviews-empty"><span class="reviews-empty-star" aria-hidden="true">☆</span><h3>The first word is yours.</h3><p>No reviews yet. Share how your Azuri piece feels, fits and wears.</p></div>';
        if(reset)list.innerHTML=rows.length?rows.map(card).join(''):empty;else list.insertAdjacentHTML('beforeend',rows.map(card).join(''));
        byId('reviewMore').hidden=(page+1)*10>=total;
      }catch{if(run===generation){if(reset)list.innerHTML='';status.textContent='Reviews could not be loaded. Close and reopen to try again.';}}
      finally{if(run===generation){loading=false;byId('reviewMore').disabled=false;}}
    }
    accordion.querySelector('summary').addEventListener('click',e=>{e.preventDefault();dialog.showModal();load();});
    byId('closeReviews').onclick=()=>dialog.close();
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    byId('writeReview').onclick=()=>{formPanel.hidden=false;formPanel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});form.elements.display_name.focus({preventScroll:true});};
    byId('cancelReview').onclick=()=>{formPanel.hidden=true;byId('writeReview').focus();};
    byId('reviewSort').onchange=()=>load();
    byId('reviewMore').onclick=()=>{if(loading)return;page++;byId('reviewMore').disabled=true;load(false);};
    form.onsubmit=async e=>{
      e.preventDefault();const message=byId('reviewSubmitStatus'),button=byId('submitReview');
      const values=Object.fromEntries(new FormData(form));
      if(!values.rating){message.textContent='Choose a star rating before submitting.';form.querySelector('[name=rating]').focus();return;}
      const record={product_id:current||getVariant(),display_name:values.display_name.trim(),rating:Number(values.rating),title:values.title.trim(),body:values.body.trim()};
      if(record.display_name.length<2||record.title.length<3||record.body.length<10){message.textContent='Please add your name, a title and at least 10 characters about your experience.';return;}
      button.disabled=true;message.textContent='';
      try{await request('/rest/v1/product_reviews',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(record)});form.reset();message.textContent='Thank you. Your review has been received and will appear after approval by Azuri.';}
      catch(error){message.textContent=error.message;}finally{button.disabled=false;}
    };
  }
  const panel=byId('reviewsAdminPanel');
  if(panel){
    let offset=0;
    async function loadAdminReviews(reset=true){
      const message=byId('reviewAdminStatus'),list=byId('reviewAdminList');
      if(reset)offset=0;message.textContent='Loading reviews…';
      try{
        const filter=byId('reviewAdminFilter').value;
        const rows=await request('/rest/v1/product_reviews?select=*&order=created_at.desc&limit=20&offset='+offset+(filter?'&status=eq.'+filter:''),{},true);
        const markup=rows.map(r=>`<article class="review-admin-card"><small>${safe(r.product_id)} · ${safe(r.status)} · ${date(r.created_at)}</small><h3>${safe(r.title)}</h3><span class="reviews-stars" aria-label="${r.rating} out of 5 stars">${stars(r.rating)}</span><p>${safe(r.body)}</p><small>${safe(r.display_name)}</small><div class="review-admin-actions"><button data-review="${safe(r.id)}" data-status="published" ${r.status==='published'?'disabled':''}>Publish</button><button data-review="${safe(r.id)}" data-status="hidden" ${r.status==='hidden'?'disabled':''}>Hide</button></div></article>`).join('');
        if(reset)list.innerHTML=markup||'<p class="muted">No reviews in this view yet.</p>';else list.insertAdjacentHTML('beforeend',markup);
        byId('reviewAdminMore').hidden=rows.length<20;message.textContent='';
      }catch(error){message.textContent=error.message;}
    }
    byId('refreshReviews').onclick=()=>loadAdminReviews();
    byId('reviewAdminFilter').onchange=()=>loadAdminReviews();
    byId('reviewAdminMore').onclick=()=>{offset+=20;loadAdminReviews(false);};
    byId('reviewAdminList').onclick=async e=>{const b=e.target.closest('[data-review]');if(!b)return;b.disabled=true;try{const rows=await request('/rest/v1/product_reviews?id=eq.'+encodeURIComponent(b.dataset.review),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.dataset.status})},true);if(!rows?.length)throw Error('Your account cannot moderate reviews.');await loadAdminReviews();}catch(error){byId('reviewAdminStatus').textContent=error.message;b.disabled=false;}};
    const content=byId('adminContent');
    new MutationObserver(()=>{if(!content.hidden)loadAdminReviews();}).observe(content,{attributes:true,attributeFilter:['hidden']});
    if(!content.hidden)loadAdminReviews();
  }
})();
