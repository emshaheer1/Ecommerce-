const state = {
  products: [],
  cart: [],
  selectedProduct: null
};

function formatCurrency(value) {
  return `$${value.toFixed(2)}`;
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem('feliciaCart');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.cart = parsed;
    }
  } catch {
    // ignore
  }
}

function persistCart() {
  try {
    localStorage.setItem('feliciaCart', JSON.stringify(state.cart));
  } catch {
    // ignore
  }
}

function findCartItem(productId) {
  return state.cart.find((item) => item.productId === productId);
}

function cartTotals() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateCartBadge() {
  const cartCountEl = document.getElementById('cart-count');
  const totalQty = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCountEl) cartCountEl.textContent = totalQty;
}

function renderProducts(categoryFilter = 'all') {
  const grid = document.getElementById('product-grid');
  const loading = document.getElementById('products-loading');
  const error = document.getElementById('products-error');

  if (!grid || !loading || !error) return;

  grid.innerHTML = '';
  loading.hidden = true;
  error.hidden = true;

  const products =
    categoryFilter === 'all'
      ? state.products
      : state.products.filter((p) => p.category === categoryFilter);

  if (!products.length) {
    grid.innerHTML =
      '<p class="small muted" style="grid-column: 1 / -1; text-align: center;">No products found.</p>';
    return;
  }

  for (const product of products) {
    const inCart = findCartItem(product.id);
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}" />
      </div>
      <div class="product-meta">
        <span class="product-category">${product.category}</span>
        <span class="product-price">${formatCurrency(product.price)}</span>
      </div>
      <h3 class="product-title">${product.name}</h3>
      <p class="product-description">${product.description}</p>
      <div class="product-actions">
        <span class="qty-badge">${
          inCart ? `In cart: ${inCart.quantity}` : '&nbsp;'
        }</span>
        <div style="display:flex; gap:0.35rem;">
          <button class="view-details-btn" data-product-id="${product.id}">View details</button>
          <button class="add-to-cart-btn" data-product-id="${product.id}">
            <span>+</span> Add
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

function renderCart() {
  const cartItemsEl = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const checkoutSummaryEl = document.getElementById('checkout-cart-summary');
  const checkoutTotalEl = document.getElementById('checkout-total-amount');

  const subtotal = cartTotals();

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);

  if (cartItemsEl) {
    cartItemsEl.innerHTML = '';
    if (!state.cart.length) {
      cartItemsEl.innerHTML =
        '<p class="small muted" style="padding:0.75rem; text-align:center;">Your cart is empty.</p>';
    } else {
      for (const item of state.cart) {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div class="cart-item-thumb">
            <img src="${item.image}" alt="${item.name}" />
          </div>
          <div class="cart-item-main">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-meta">
              Size: ${item.size || 'Medium'} • Color: ${item.color || '—'}
            </div>
            <div class="cart-item-meta">Unit: ${formatCurrency(item.price)}</div>
          </div>
          <div class="cart-item-controls">
            <div class="qty-controls">
              <button class="qty-control" data-action="decrease" data-product-id="${
                item.productId
              }">-</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-control" data-action="increase" data-product-id="${
                item.productId
              }">+</button>
            </div>
            <button class="remove-btn" data-action="remove" data-product-id="${
              item.productId
            }">Remove</button>
          </div>
        `;
        cartItemsEl.appendChild(row);
      }
    }
  }

  if (checkoutSummaryEl && checkoutTotalEl) {
    checkoutSummaryEl.innerHTML = '';
    if (!state.cart.length) {
      checkoutSummaryEl.innerHTML =
        '<li class="small muted" style="border-bottom:none;">Your cart is empty.</li>';
    } else {
      for (const item of state.cart) {
        const li = document.createElement('li');
        li.innerHTML = `
          <span>${item.name} × ${item.quantity}</span>
          <span>${formatCurrency(item.price * item.quantity)}</span>
        `;
        checkoutSummaryEl.appendChild(li);
      }
    }
    checkoutTotalEl.textContent = formatCurrency(subtotal);
  }

  updateCartBadge();
  persistCart();
}

function addToCart(product) {
  if (!product) return;
  const existing = findCartItem(product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      quantity: 1,
      size: product.size || 'Medium',
      color: product.color || '',
      image: product.image
    });
  }
  renderProducts(currentFilter);
  renderCart();
}

function updateCartQuantity(productId, delta) {
  const item = findCartItem(productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((i) => i.productId !== productId);
  }
  renderProducts(currentFilter);
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((i) => i.productId !== productId);
  renderProducts(currentFilter);
  renderCart();
}

let currentFilter = 'all';

async function fetchProducts() {
  const loading = document.getElementById('products-loading');
  const error = document.getElementById('products-error');

  if (loading) loading.hidden = false;
  if (error) error.hidden = true;

  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Failed to load products');
    const data = await res.json();
    state.products = Array.isArray(data) ? data : [];
    renderProducts(currentFilter);
  } catch (e) {
    console.error(e);
    if (error) error.hidden = false;
  } finally {
    if (loading) loading.hidden = true;
  }
}

function openModal(modalId, backdropId) {
  const modal = document.getElementById(modalId);
  const backdrop = document.getElementById(backdropId);
  if (!modal || !backdrop) return;
  modal.classList.add('open');
  backdrop.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modalId, backdropId) {
  const modal = document.getElementById(modalId);
  const backdrop = document.getElementById(backdropId);
  if (!modal || !backdrop) return;
  modal.classList.remove('open');
  backdrop.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
}

function openCheckoutModal() {
  if (!state.cart.length) {
    openModal('empty-cart-modal', 'empty-cart-backdrop');
    return;
  }
  renderCart();
  openModal('checkout-modal', 'checkout-backdrop');
}

function setupFilters() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.category || 'all';
      renderProducts(currentFilter);
    });
  });
}

function setupProductInteractions() {
  const grid = document.getElementById('product-grid');
  grid?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const addBtn = target.closest('button.add-to-cart-btn');
    const detailsBtn = target.closest('button.view-details-btn');

    if (addBtn) {
      const id = addBtn.dataset.productId;
      const product = state.products.find((p) => p.id === id);
      addToCart(product);
      return;
    }

    if (detailsBtn) {
      const id = detailsBtn.dataset.productId;
      const product = state.products.find((p) => p.id === id);
      if (product) openProductDetails(product);
    }
  });
}

function openProductDetails(product) {
  state.selectedProduct = product;

  const nameEl = document.getElementById('details-name');
  const imgEl = document.getElementById('details-image');
  const catEl = document.getElementById('details-category');
  const descEl = document.getElementById('details-description');
  const sizeEl = document.getElementById('details-size');
  const colorEl = document.getElementById('details-color');
  const materialEl = document.getElementById('details-material');
  const fitEl = document.getElementById('details-fit');
  const priceEl = document.getElementById('details-price');

  if (
    !nameEl ||
    !imgEl ||
    !catEl ||
    !descEl ||
    !sizeEl ||
    !colorEl ||
    !materialEl ||
    !fitEl ||
    !priceEl
  ) {
    return;
  }

  nameEl.textContent = product.name;
  imgEl.src = product.image;
  imgEl.alt = product.name;
  catEl.textContent = product.category;
  descEl.textContent = product.description;
  sizeEl.textContent = product.size || 'Medium';
  colorEl.textContent = product.color || '—';
  materialEl.textContent = product.material || '—';
  fitEl.textContent = product.fit || '—';
  priceEl.textContent = formatCurrency(product.price);

  openModal('product-details-modal', 'product-details-backdrop');
}

function setupProductDetailsModal() {
  const closeBtn = document.getElementById('product-details-close');
  const backdrop = document.getElementById('product-details-backdrop');
  const modal = document.getElementById('product-details-modal');
  const addBtn = document.getElementById('details-add-to-cart');

  closeBtn?.addEventListener('click', () =>
    closeModal('product-details-modal', 'product-details-backdrop')
  );
  backdrop?.addEventListener('click', () =>
    closeModal('product-details-modal', 'product-details-backdrop')
  );
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal('product-details-modal', 'product-details-backdrop');
    }
  });

  addBtn?.addEventListener('click', () => {
    if (state.selectedProduct) {
      addToCart(state.selectedProduct);
      closeModal('product-details-modal', 'product-details-backdrop');
      openCheckoutModal();
    }
  });
}

function setupCartModal() {
  const cartToggle = document.getElementById('cart-toggle');
  const heroCartBtn = document.getElementById('btn-open-cart-hero');
  const closeBtn = document.getElementById('checkout-close');
  const backdrop = document.getElementById('checkout-backdrop');
  const modal = document.getElementById('checkout-modal');
  const cartItemsEl = document.getElementById('cart-items');

  cartToggle?.addEventListener('click', openCheckoutModal);
  heroCartBtn?.addEventListener('click', openCheckoutModal);

  closeBtn?.addEventListener('click', () =>
    closeModal('checkout-modal', 'checkout-backdrop')
  );
  backdrop?.addEventListener('click', () =>
    closeModal('checkout-modal', 'checkout-backdrop')
  );
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal('checkout-modal', 'checkout-backdrop');
    }
  });

  cartItemsEl?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const productId = target.dataset.productId;
    if (!action || !productId) return;

    if (action === 'increase') {
      updateCartQuantity(productId, 1);
    } else if (action === 'decrease') {
      updateCartQuantity(productId, -1);
    } else if (action === 'remove') {
      removeFromCart(productId);
    }
  });
}

function setupCheckoutForm() {
  const form = document.getElementById('checkout-form');
  const messageEl = document.getElementById('checkout-message');
  const placeOrderBtn = document.getElementById('place-order-btn');

  if (!form || !messageEl || !placeOrderBtn) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    messageEl.hidden = true;
    messageEl.textContent = '';
    messageEl.className = 'checkout-message';

    if (!state.cart.length) {
      messageEl.textContent = 'Your cart is empty. Please add items before placing an order.';
      messageEl.classList.add('error');
      messageEl.hidden = false;
      return;
    }

    const formData = new FormData(form);
    const customer = {
      name: formData.get('name')?.toString().trim(),
      email: formData.get('email')?.toString().trim(),
      phone: formData.get('phone')?.toString().trim(),
      address: formData.get('address')?.toString().trim(),
      city: formData.get('city')?.toString().trim(),
      postalCode: formData.get('postalCode')?.toString().trim(),
      country: formData.get('country')?.toString().trim()
    };

    if (!customer.name || !customer.email || !customer.address) {
      messageEl.textContent = 'Please fill in all required fields (marked with *).';
      messageEl.classList.add('error');
      messageEl.hidden = false;
      return;
    }

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = 'Placing order...';

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItems: state.cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            size: item.size,
            color: item.color
          })),
          customer
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to place order. Please try again.');
      }

      state.cart = [];
      renderCart();
      form.reset();
      closeModal('checkout-modal', 'checkout-backdrop');
      document.getElementById('order-confirmation-id').textContent = data.orderId;
      openModal('order-confirmation-modal', 'order-confirmation-backdrop');
    } catch (e) {
      console.error(e);
      messageEl.textContent =
        e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      messageEl.classList.add('error');
      messageEl.hidden = false;
    } finally {
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = 'Place order';
    }
  });
}

function setFooterYear() {
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }
}

function _removedSetupReviewsSlider() {
  const track = document.querySelector('.reviews-track');
  const prevBtn = document.querySelector('.slider-prev');
  const nextBtn = document.querySelector('.slider-next');
  const dotsContainer = document.querySelector('.slider-dots');
  if (!track || !prevBtn || !nextBtn) return;

  const cards = track.querySelectorAll('.review-card');
  const total = cards.length;
  let current = 0;

  function updateDots() {
    if (!dotsContainer) return;
    dotsContainer.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('button');
      dot.className = 'slider-dot' + (i === current ? ' active' : '');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    }
  }

  function goTo(index) {
    current = Math.max(0, Math.min(index, total - 1));
    const card = cards[current];
    if (card) {
      const cardWidth = card.offsetWidth || 280;
      const gap = parseFloat(getComputedStyle(track).gap) || 20;
      track.style.transform = `translateX(-${current * (cardWidth + gap)}px)`;
    }
    dotsContainer?.querySelectorAll('.slider-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
  }

  updateDots();
  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));
  window.addEventListener('resize', () => goTo(Math.min(current, total - 1)));
}

function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
  );
  document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
}

function setupInfoModals() {
  const orderClose = document.getElementById('order-confirmation-close');
  const orderBackdrop = document.getElementById('order-confirmation-backdrop');
  const orderDismiss = document.getElementById('order-confirmation-dismiss');
  const emptyClose = document.getElementById('empty-cart-close');
  const emptyBackdrop = document.getElementById('empty-cart-backdrop');
  const emptyShop = document.getElementById('empty-cart-shop');

  orderClose?.addEventListener('click', () =>
    closeModal('order-confirmation-modal', 'order-confirmation-backdrop')
  );
  orderBackdrop?.addEventListener('click', () =>
    closeModal('order-confirmation-modal', 'order-confirmation-backdrop')
  );
  orderDismiss?.addEventListener('click', () =>
    closeModal('order-confirmation-modal', 'order-confirmation-backdrop')
  );

  emptyClose?.addEventListener('click', () =>
    closeModal('empty-cart-modal', 'empty-cart-backdrop')
  );
  emptyBackdrop?.addEventListener('click', () =>
    closeModal('empty-cart-modal', 'empty-cart-backdrop')
  );
  emptyShop?.addEventListener('click', () =>
    closeModal('empty-cart-modal', 'empty-cart-backdrop')
  );
}

function setupHeroImageRotation() {
  const img = document.getElementById('hero-hoodie-img');
  if (!img) return;
  const sources = [
    'images/hoodie-hm1.png',
    'images/hoodie-hm2.png',
    'images/hoodie-black.png',
    'images/hoodie-white.png'
  ];
  let index = 0;
  img.style.transition = 'opacity 0.5s ease';
  setInterval(() => {
    index = (index + 1) % sources.length;
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = sources[index];
      img.style.opacity = '1';
    }, 500);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  loadCartFromStorage();
  updateCartBadge();
  setFooterYear();
  setupFilters();
  setupProductInteractions();
  setupProductDetailsModal();
  setupCartModal();
  setupCheckoutForm();
  setupInfoModals();
  setupScrollAnimations();
  setupHeroImageRotation();
  renderCart();
  fetchProducts();
});

