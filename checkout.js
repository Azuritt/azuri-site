(() => {
  const KEY = 'azuriCart';
  const cart = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } })();
  const money = n => `$${Number(n).toFixed(0)}`;
  const items = document.getElementById('summaryItems');
  const subtotalEl = document.getElementById('summarySubtotal');
  const totalEl = document.getElementById('summaryTotal');

  if (!cart.length) {
    items.innerHTML = '<div class="summary-empty">Your bag is empty. Return to the shop to add an Élan polo.</div>';
    document.getElementById('checkoutForm').querySelector('.place-order').disabled = true;
    return;
  }

  items.innerHTML = cart.map(item => `
    <div class="summary-item">
      <img src="${item.image}" alt="${item.name}">
      <div><h3>${item.name}</h3><p>Size ${item.size} · Qty ${item.quantity}</p></div>
      <span class="summary-price">${money(item.price * item.quantity)}</span>
    </div>`).join('');

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  subtotalEl.textContent = money(subtotal);
  totalEl.textContent = money(subtotal);

  const form = document.getElementById('checkoutForm');
  const confirmation = document.getElementById('confirmation');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    confirmation.hidden = false;
  });
  document.getElementById('backToShop').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
})();
