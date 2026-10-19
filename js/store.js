/* ═══════════════════════════════════
   STORE — стан додатку, кошик, localStorage
═══════════════════════════════════ */
'use strict';

const Store = (() => {
  const CART_KEY   = 'motty_cart';
  const WISH_KEY   = 'motty_wish';
  const ORDERS_KEY = 'motty_orders';

  // ── Кошик ──
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    _emit('cart');
  }
  function addToCart(productId, option = '') {
    const cart = getCart();
    const key = productId + (option ? ':' + option : '');
    const existing = cart.find(i => i.key === key);
    if (existing) { existing.qty++; }
    else {
      const p = MOTTY_PRODUCTS.find(p => p.id === productId);
      if (!p) return;
      cart.push({ key, id: productId, option, qty: 1 });
    }
    saveCart(cart);
    showToast('Додано до кошика 🛍');
  }
  function removeFromCart(key) {
    saveCart(getCart().filter(i => i.key !== key));
  }
  function updateQty(key, qty) {
    const cart = getCart();
    const item = cart.find(i => i.key === key);
    if (!item) return;
    if (qty < 1) { removeFromCart(key); return; }
    item.qty = qty;
    saveCart(cart);
  }
  function clearCart() { saveCart([]); }
  function getCartTotal() {
    return getCart().reduce((sum, i) => {
      const p = MOTTY_PRODUCTS.find(p => p.id === i.id);
      return sum + (p ? p.price * i.qty : 0);
    }, 0);
  }
  function getCartCount() {
    return getCart().reduce((s, i) => s + i.qty, 0);
  }
  function getCartItems() {
    return getCart().map(i => {
      const p = MOTTY_PRODUCTS.find(p => p.id === i.id);
      return { ...i, product: p };
    }).filter(i => i.product);
  }

  // ── Вибране ──
  function getWish() {
    try { return JSON.parse(localStorage.getItem(WISH_KEY)) || []; }
    catch { return []; }
  }
  function toggleWish(id) {
    const wish = getWish();
    const idx = wish.indexOf(id);
    if (idx >= 0) wish.splice(idx, 1);
    else wish.push(id);
    localStorage.setItem(WISH_KEY, JSON.stringify(wish));
    _emit('wish');
    return idx < 0;
  }
  function isWished(id) { return getWish().includes(id); }

  // ── Замовлення ──
  function getOrders() {
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }
    catch { return []; }
  }
  function saveOrder(order) {
    const orders = getOrders();
    order.id     = 'ORD-' + Date.now();
    order.date   = new Date().toISOString();
    order.status = 'new';
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    return order;
  }
  function updateOrderStatus(orderId, status) {
    const orders = getOrders();
    const o = orders.find(o => o.id === orderId);
    if (o) {
      o.status = status;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
  }

  // ── Telegram ──
  async function sendToTelegram(order) {
    const { tgToken, tgChat } = MOTTY_SETTINGS;
    if (!tgToken || !tgChat) return false;

    const delivery = MOTTY_SETTINGS.delivery.find(d => d.id === order.delivery);
    const payment  = MOTTY_SETTINGS.payment.find(p => p.id === order.payment);
    const items    = order.items.map(i =>
      `• ${i.product.title}${i.option ? ' (' + i.option + ')' : ''} × ${i.qty} = ${(i.product.price * i.qty).toLocaleString()} ₴`
    ).join('\n');

    const lines = [
      `🎁 *Нове замовлення ${order.id}*`,
      ``,
      `👤 *Покупець:* ${order.name}`,
      `📞 *Телефон:* ${order.phone}`,
      order.telegram ? `✈️ *Telegram:* @${order.telegram}` : '',
      ``,
      `📦 *Доставка:* ${delivery?.name || order.delivery}`,
      order.city      ? `🏙 *Місто:* ${order.city}`            : '',
      order.warehouse ? `📍 *Відділення:* ${order.warehouse}`  : '',
      order.address   ? `🏠 *Адреса:* ${order.address}`        : '',
      ``,
      `💳 *Оплата:* ${payment?.name || order.payment}`,
      ``,
      `🛍 *Товари:*\n${items}`,
      ``,
      `💰 *Разом: ${order.total.toLocaleString()} ₴*`,
      order.comment ? `\n💬 *Коментар:* ${order.comment}` : '',
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChat, text: lines, parse_mode: 'Markdown' }),
        }
      );
      return res.ok;
    } catch { return false; }
  }

  // ── Google Sheets ──
  async function sendToSheets(order) {
    const url = MOTTY_SETTINGS.sheetsUrl;
    if (!url) return false;

    const delivery = MOTTY_SETTINGS.delivery.find(d => d.id === order.delivery);
    const payment  = MOTTY_SETTINGS.payment.find(p => p.id === order.payment);
    const itemsText = order.items
      .map(i => `${i.product.title}${i.option ? ' (' + i.option + ')' : ''} ×${i.qty}`)
      .join('; ');

    const payload = {
      id:        order.id,
      date:      order.date,
      name:      order.name,
      phone:     order.phone,
      telegram:  order.telegram  || '',
      itemsText,
      total:     order.total,
      delivery:  delivery?.name  || order.delivery,
      city:      order.city      || '',
      warehouse: order.warehouse || order.address || '',
      payment:   payment?.name   || order.payment,
      comment:   order.comment   || '',
    };

    try {
      // no-cors бо Google Apps Script не повертає CORS-заголовків на деплої
      await fetch(url, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      return true;
    } catch { return false; }
  }

  // ── Відправити замовлення скрізь ──
  async function submitOrder(order) {
    const saved = saveOrder(order);
    const [tgOk, shOk] = await Promise.allSettled([
      sendToTelegram(saved),
      sendToSheets(saved),
    ]);
    return {
      order:   saved,
      telegram: tgOk.value === true,
      sheets:   shOk.value === true,
    };
  }

  // ── Events ──
  const _listeners = {};
  function _emit(event) {
    (_listeners[event] || []).forEach(fn => fn());
  }
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }

  return {
    getCart, addToCart, removeFromCart, updateQty,
    clearCart, getCartTotal, getCartCount, getCartItems,
    getWish, toggleWish, isWished,
    getOrders, saveOrder, updateOrderStatus,
    sendToTelegram, sendToSheets, submitOrder,
    on,
  };
})();

// ── Toast ──
function showToast(msg, duration = 2500) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Helpers ──
function fmt(n) { return Number(n).toLocaleString('uk-UA') + ' ₴'; }
function catName(id) {
  const c = MOTTY_CATEGORIES.find(c => c.id === id);
  return c ? c.name : id;
}
function badgeHtml(badge) {
  if (!badge) return '';
  const map = { hit: ['badge-hit','Хіт'], new: ['badge-new','Нове'], sale: ['badge-sale','Знижка'] };
  const [cls, label] = map[badge] || [];
  return cls ? `<span class="badge ${cls}">${label}</span>` : '';
}
