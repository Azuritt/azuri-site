(() => {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('body > header');
  if (header) {
    let queued = false;
    const update = () => { document.body.classList.toggle('lux-scrolled', window.scrollY > 24); queued = false; };
    update();
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  }
  if (reduceMotion.matches || !('IntersectionObserver' in window)) return;
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('lux-reveal-pending');
      entry.target.classList.add('lux-reveal-visible');
      reveal.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
  const prepare = element => {
    if (element.dataset.luxReveal) return;
    element.dataset.luxReveal = 'true';
    // Never hide content already in view; animation is progressive enhancement.
    if (element.getBoundingClientRect().top < window.innerHeight - 20) return;
    element.classList.add('lux-reveal', 'lux-reveal-pending');
    reveal.observe(element);
  };
  document.querySelectorAll('.lux-home .section-title,.lux-signature,.lux-home .story h2,.lux-home .story > div,.product-card').forEach(prepare);
  const products = document.getElementById('products');
  if (products) new MutationObserver(() => products.querySelectorAll('.product-card').forEach(prepare)).observe(products, { childList: true });
  reduceMotion.addEventListener('change', () => {
    if (!reduceMotion.matches) return;
    reveal.disconnect();
    document.querySelectorAll('.lux-reveal-pending').forEach(el => el.classList.remove('lux-reveal-pending'));
  });
})();
