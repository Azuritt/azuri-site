(() => {
  const SUPABASE_URL = 'https://yfdmjgjrgttgqxpqshen.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_I7AJRhx7jmI5Od7MRRsyLw_4TEN6XR3';

  const KEY = 'azuriCart';

  const cart = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  })();

  const money = n => `$${Number(n).toFixed(0)}`;

  const items = document.getElementById('summaryItems');
  const subtotalEl = document.getElementById('summarySubtotal');
  const totalEl = document.getElementById('summaryTotal');
  const form = document.getElementById('checkoutForm');
  const confirmation = document.getElementById('confirmation');

  if (!cart.length) {
    items.innerHTML =
      '<div class="summary-empty">Your bag is empty. Return to the shop to add an Élan polo.</div>';

    form.querySelector('.place-order').disabled = true;
    return;
  }

  items.innerHTML = cart.map(item => `
    <div class="summary-item">
      <img src="${item.image}" alt="${item.name}">
      <div>
        <h3>${item.name}</h3>
        <p>Size ${item.size} · Qty ${item.quantity}</p>
      </div>
      <span class="summary-price">${money(item.price * item.quantity)}</span>
    </div>
  `).join('');

  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  const shipping = 0;
  const total = subtotal + shipping;

  subtotalEl.textContent = money(subtotal);
  totalEl.textContent = money(total);

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const formData = new FormData(form);

    const firstName = formData.get('firstName');
    const lastName = formData.get('lastName');
    const email = formData.get('email');
    const address = formData.get('address');
    const city = formData.get('city');
    const postal = formData.get('postal');
    const country = formData.get('country');

    const placeOrderButton = form.querySelector('.place-order');

    placeOrderButton.disabled = true;
    placeOrderButton.textContent = 'Processing...';

    try {
      const orderNumber = `AZ-${Date.now()}`;

      // Generate the order ID ourselves
      const orderId = crypto.randomUUID();

      // Create the order
      const orderResponse = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          id: orderId,
          order_number: orderNumber,
          customer_order: email,
          first_name: firstName,
          last_name: lastName,
          address: address,
          city: city,
          postal: postal,
          country: country,
          subtotal_ttd: subtotal,
          shipping_ttd: shipping,
          total_ttd: total,
          status: 'pending'
        })
      });

      if (!orderResponse.ok) {
        const error = await orderResponse.text();
        throw new Error(error);
      }

      // Create the order items
      const orderItems = cart.map(item => ({
        order_id: orderId,
        product_id: item.id,
        product_name: item.name,
        color: item.color || '',
        size: item.size,
        quantity: item.quantity,
        unit_price_ttd: Number(item.price)
      }));

      const itemsResponse = await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify(orderItems)
      });

      if (!itemsResponse.ok) {
        const error = await itemsResponse.text();
        throw new Error(error);
      }

      // Clear cart after successful order
      localStorage.removeItem(KEY);

      confirmation.querySelector('h2').textContent = 'Order received.';
      confirmation.querySelector('p:nth-of-type(2)').textContent =
        `Thank you, ${firstName}. Your order ${orderNumber} has been received.`;

      confirmation.hidden = false;

    } catch (error) {
      console.error('Order submission failed:', error);

      alert(
        'We could not submit your order right now. Please try again.'
      );

      placeOrderButton.disabled = false;
      placeOrderButton.textContent = 'Place order';
    }
  });

  document.getElementById('backToShop').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
})();
