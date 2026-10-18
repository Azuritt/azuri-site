(() => {
 'use strict';
 const toggle=document.getElementById('openMenu');
 const drawer=document.getElementById('siteMenu');
 const close=document.getElementById('closeMenu');
 if(!toggle||!drawer||!close)return;
 toggle.addEventListener('click',()=>{
  if(drawer.open)return;
  drawer.showModal();document.body.classList.add('menu-open');toggle.setAttribute('aria-expanded','true');
 });
 close.addEventListener('click',()=>drawer.close());
 drawer.addEventListener('close',()=>{
  document.body.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');
 });
 drawer.addEventListener('click',event=>{
  if(event.target.closest('nav a')){drawer.close();return;}
  if(event.target!==drawer)return;
  const rect=drawer.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)drawer.close();
 });
})();
