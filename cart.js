(() => {
  const KEY = 'azuriCart';
  const getCart = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  };
  const saveCart = cart => localStorage.setItem(KEY, JSON.stringify(cart));
  const formatMoney = value => `$${Number(value).toFixed(0)}`;

  const bagButton = document.querySelector('.bag');
  if (!bagButton) return;

  const overlay = document.createElement('div');
  overlay.className = 'cart-overlay';
  overlay.innerHTML = `
    <aside class="cart-drawer" aria-label="Shopping bag" aria-hidden="true">
      <div class="cart-header">
        <div><p class="cart-eyebrow">Azuri</p><h2>Your Bag</h2></div>
        <button class="cart-close" type="button" aria-label="Close shopping bag">×</button>
      </div>
      <div class="cart-items"></div>
      <div class="cart-footer">
        <div class="cart-total"><span>Subtotal</span><strong>$0</strong></div>
        <button class="checkout-button" type="button">Checkout</button>
        <p class="cart-note">Secure checkout. Payment is processed at checkout.</p>
      </div>
    </aside>`;
  document.body.appendChild(overlay);

  const drawer = overlay.querySelector('.cart-drawer');
  const itemsEl = overlay.querySelector('.cart-items');
  const totalEl = overlay.querySelector('.cart-total strong');
  const checkout = overlay.querySelector('.checkout-button');
  const close = () => {
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-open');
  };
  const open = () => {
    render();
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cart-open');
  };

  const updateCount = () => {
    const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
    const countEl = bagButton.querySelector('span');
    if (countEl) countEl.textContent = count;
  };

  const render = () => {
    const cart = getCart();
    if (!cart.length) {
      itemsEl.innerHTML = `<div class="cart-empty"><p>Your bag is empty.</p><span>Add an Élan polo to get started.</span></div>`;
      totalEl.textContent = '$0';
      checkout.disabled = true;
      return;
    }
    checkout.disabled = false;
    itemsEl.innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div class="cart-item-copy">
          <h3>${item.name}</h3>
          <p>Size ${item.size}</p>
          <div class="cart-item-bottom">
            <span>${formatMoney(item.price)}</span>
            <div class="quantity-control" aria-label="Quantity">
              <button type="button" data-action="decrease" data-index="${index}">−</button>
              <span>${item.quantity}</span>
              <button type="button" data-action="increase" data-index="${index}">+</button>
            </div>
          </div>
          <button class="remove-item" type="button" data-action="remove" data-index="${index}">Remove</button>
        </div>
      </div>`).join('');
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    totalEl.textContent = formatMoney(total);
  };

  bagButton.addEventListener('click', open);
  overlay.querySelector('.cart-close').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  itemsEl.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const index = Number(button.dataset.index);
    const cart = getCart();
    if (!cart[index]) return;
    if (button.dataset.action === 'remove') cart.splice(index, 1);
    if (button.dataset.action === 'increase') cart[index].quantity += 1;
    if (button.dataset.action === 'decrease') {
      cart[index].quantity -= 1;
      if (cart[index].quantity <= 0) cart.splice(index, 1);
    }
    saveCart(cart); updateCount(); render();
  });

  checkout.addEventListener('click', () => {
    if (!checkout.disabled) window.location.href = 'checkout.html';
  });

  window.azuriCart = {
    add(item) {
      const cart = getCart();
      const existing = cart.find(x => x.id === item.id && x.size === item.size);
      if (existing) existing.quantity += 1;
      else cart.push({ ...item, quantity: 1 });
      saveCart(cart); updateCount(); open();
    }
  };

  updateCount();
})();
