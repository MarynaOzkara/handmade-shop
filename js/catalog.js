/* ═══════════════════════════════════
   CATALOG — рендер каталогу, фільтри, модальне вікно
═══════════════════════════════════ */
'use strict';

const Catalog = (() => {
  let currentCat = 'all';
  let currentModal = null;

  // ── Ініціалізація ──
  function init() {
    renderCats();
    renderProducts('all');
    initModal();
    updateNavCart();
    Store.on('cart', updateNavCart);
    Store.on('wish', () => renderProducts(currentCat));
  }

  // ── Категорії ──
  function renderCats() {
    const wrap = document.getElementById('cats');
    if (!wrap) return;
    wrap.innerHTML = MOTTY_CATEGORIES.map(c => `
      <button class="cat-btn ${c.id === 'all' ? 'active' : ''}"
        data-cat="${c.id}" onclick="Catalog.filterByCat('${c.id}')">
        ${c.icon} ${c.name}
      </button>
    `).join('');
  }

  // ── Фільтрація ──
  function filterByCat(cat) {
    currentCat = cat;
    document.querySelectorAll('.cat-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.cat === cat)
    );
    renderProducts(cat);
  }

  // ── Рендер товарів ──
  function renderProducts(cat) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const list = cat === 'all'
      ? MOTTY_PRODUCTS
      : MOTTY_PRODUCTS.filter(p => p.cat === cat);
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <h3>Товарів не знайдено</h3><p>Спробуйте іншу категорію</p>
      </div>`;
      return;
    }
    grid.innerHTML = list.map(p => productCardHtml(p)).join('');
  }

  function productCardHtml(p) {
    const wished = Store.isWished(p.id);
    const lowStock = p.left > 0 && p.left <= 5;
    return `
    <div class="product-card" onclick="Catalog.openModal('${p.id}')">
      <div class="card-img">
        <img src="${p.images[0]}" alt="${p.title}" loading="lazy">
        <div class="card-badge">${badgeHtml(p.badge)}</div>
        <button class="card-wish ${wished ? 'active' : ''}"
          onclick="event.stopPropagation();Catalog.toggleWish('${p.id}',this)"
          aria-label="Вибране">
          <svg width="15" height="15" fill="${wished ? 'var(--acc)' : 'none'}"
            stroke="var(--acc)" stroke-width="2" viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div class="card-body">
        <div class="card-cat">${catName(p.cat)}</div>
        <div class="card-title">${p.title}</div>
        <div class="card-short">${p.short}</div>
        <div class="card-footer">
          <div>
            <span class="card-price">${fmt(p.price)}</span>
            ${p.old ? `<span class="card-old">${fmt(p.old)}</span>` : ''}
          </div>
          <button class="card-add" onclick="event.stopPropagation();Catalog.quickAdd('${p.id}')"
            aria-label="Додати до кошика">
            <svg width="15" height="15" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        ${lowStock ? `<div class="card-stock-low">⚡ Залишилось лише ${p.left} шт.</div>` : ''}
      </div>
    </div>`;
  }

  function quickAdd(id) {
    const p = MOTTY_PRODUCTS.find(p => p.id === id);
    if (!p) return;
    if (p.options && p.options.length) openModal(id);
    else { Store.addToCart(id); openCart(); }
  }

  function toggleWish(id, btn) {
    const added = Store.toggleWish(id);
    const svg = btn.querySelector('svg');
    svg.setAttribute('fill', added ? 'var(--acc)' : 'none');
    btn.classList.toggle('active', added);
    showToast(added ? 'Додано до вибраного ♥' : 'Видалено з вибраного');
  }

  // ── Модальне вікно ──
  function initModal() {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openModal(id) {
    const p = MOTTY_PRODUCTS.find(p => p.id === id);
    if (!p) return;
    currentModal = p;

    document.getElementById('modalImg').src = p.images[0];
    document.getElementById('modalCat').textContent = catName(p.cat);
    document.getElementById('modalTitle').textContent = p.title;
    document.getElementById('modalDesc').textContent = p.desc;
    document.getElementById('modalSpecs').innerHTML = p.specs.replace(/\\n/g, '<br>');
    document.getElementById('modalPrice').textContent = fmt(p.price);
    document.getElementById('modalOld').textContent = p.old ? fmt(p.old) : '';

    // Мініатюри
    const thumbs = document.getElementById('modalThumbs');
    thumbs.innerHTML = p.images.map((src, i) => `
      <div class="modal-thumb ${i === 0 ? 'active' : ''}" onclick="Catalog.setThumb(this,'${src}')">
        <img src="${src}" alt="">
      </div>`).join('');

    // Опції
    const optWrap = document.getElementById('modalOptions');
    if (p.options && p.options.length) {
      optWrap.innerHTML = `<label>Оберіть варіант</label>
        <select id="modalOptionSel">
          ${p.options.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>`;
      optWrap.style.display = 'block';
    } else {
      optWrap.innerHTML = '';
      optWrap.style.display = 'none';
    }

    // Наявність
    const addBtn = document.getElementById('modalAddBtn');
    if (p.stock === 'order') {
      addBtn.textContent = 'Замовити індивідуально';
      addBtn.onclick = () => { closeModal(); document.getElementById('motty-quiz')?.scrollIntoView({behavior:'smooth'}); };
    } else {
      addBtn.textContent = 'Додати до кошика';
      addBtn.onclick = () => { addFromModal(); };
    }

    document.getElementById('modalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function setThumb(el, src) {
    document.getElementById('modalImg').src = src;
    document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  }

  function addFromModal() {
    if (!currentModal) return;
    const sel = document.getElementById('modalOptionSel');
    const option = sel ? sel.value : '';
    Store.addToCart(currentModal.id, option);
    closeModal();
    openCart();
  }

  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.body.style.overflow = '';
    currentModal = null;
  }

  // ── Кошик (drawer) ──
  function openCart() {
    renderCartDrawer();
    document.getElementById('cartOverlay').classList.add('open');
    document.getElementById('cartDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    document.getElementById('cartOverlay').classList.remove('open');
    document.getElementById('cartDrawer').classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderCartDrawer() {
    const body = document.getElementById('cartBody');
    const foot = document.getElementById('cartFoot');
    const items = Store.getCartItems();
    if (!items.length) {
      body.innerHTML = `<div class="empty-state">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 01-8 0"/>
        </svg>
        <h3>Кошик порожній</h3><p>Оберіть щось особливе</p>
      </div>`;
      foot.style.display = 'none';
      return;
    }
    body.innerHTML = items.map(i => `
      <div class="cart-item">
        <img class="cart-item-img" src="${i.product.images[0]}" alt="${i.product.title}">
        <div class="cart-item-info">
          <h5>${i.product.title}${i.option ? ' — ' + i.option : ''}</h5>
          <p>${fmt(i.product.price)} / шт.</p>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="Catalog.changeQty('${i.key}',-1)">−</button>
            <span class="qty-val">${i.qty}</span>
            <button class="qty-btn" onclick="Catalog.changeQty('${i.key}',1)">+</button>
          </div>
          <div class="cart-item-price">${fmt(i.product.price * i.qty)}</div>
        </div>
        <button class="cart-item-remove" onclick="Catalog.removeItem('${i.key}')">×</button>
      </div>`).join('');

    const total = Store.getCartTotal();
    const free = total >= MOTTY_SETTINGS.freeFrom;
    foot.innerHTML = `
      <div class="cart-total-row"><span>Разом:</span><span>${fmt(total)}</span></div>
      <div class="cart-delivery-note">
        ${free ? '✅ Безкоштовна доставка' : `🚚 До безкоштовної доставки: ${fmt(MOTTY_SETTINGS.freeFrom - total)}`}
      </div>
      <a href="cart.html" class="btn btn-primary btn-block">Оформити замовлення</a>
    `;
    foot.style.display = 'block';
  }

  function changeQty(key, delta) {
    const items = Store.getCartItems();
    const item = items.find(i => i.key === key);
    if (item) Store.updateQty(key, item.qty + delta);
    renderCartDrawer();
    updateNavCart();
  }
  function removeItem(key) {
    Store.removeFromCart(key);
    renderCartDrawer();
    updateNavCart();
  }

  function updateNavCart() {
    const count = Store.getCartCount();
    document.querySelectorAll('.cart-count-badge').forEach(el => {
      el.textContent = count;
      el.style.display = count ? 'flex' : 'none';
    });
  }

  return {
    init, filterByCat, openModal, closeModal, setThumb, addFromModal,
    quickAdd, toggleWish, openCart, closeCart, changeQty, removeItem,
    renderCartDrawer, updateNavCart,
  };
})();
