const products = {
  ivory: { color: 'Ivory', image: 'assets/elan-ivory.png' },
  navy: { color: 'Navy', image: 'assets/elan-navy.png' },
  black: { color: 'Black', image: 'assets/elan-black-correct.png' }
};

const key = new URLSearchParams(window.location.search).get('product') || 'ivory';
const product = products[key] || products.ivory;

document.getElementById('productTitle').textContent = `Élan slim fit polo- ${product.color}`;
document.getElementById('productImage').src = product.image;
document.getElementById('productImage').alt = `Azuri Élan in ${product.color}`;
document.title = `Azuri Élan — ${product.color}`;

let selectedSize = 'S';

document.querySelectorAll('.size-option').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.size-option').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
    selectedSize = button.textContent.trim();
  });
});

document.querySelector('.add-to-bag').addEventListener('click', () => {
  if (window.azuriCart) {
    window.azuriCart.add({
      id: `elan-${key}`,
      name: `Élan slim fit polo- ${product.color}`,
      color: product.color,
      size: selectedSize,
      price: 500,
      image: product.image
    });
  }
});

document.getElementById('year').textContent = new Date().getFullYear();
