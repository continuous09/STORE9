// Order Form Handling – localStorage only (GitHub Pages compatible)
(function () {
  function log() {
    if (typeof console !== 'undefined' && console.log) {
      console.log.apply(console, ['[order]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  window.proceedToCheckout = function () {
    var cartItems = window.getCartData && window.getCartData();
    if (!cartItems || cartItems.length === 0) {
      alert('Your cart is empty');
      return;
    }
    try {
      sessionStorage.setItem('checkoutCart', JSON.stringify(cartItems));
    } catch (e) {
      log('sessionStorage set failed', e);
    }
    window.location.href = './order.html';
  };

  function validateOrderForm() {
    var form = document.getElementById('order-form');
    if (!form) return false;

    var fullName = (form.querySelector('[name="fullName"]') || {}).value;
    var phone = (form.querySelector('[name="phone"]') || {}).value;
    var city = (form.querySelector('[name="city"]') || {}).value;

    fullName = fullName ? fullName.trim() : '';
    phone = phone ? phone.trim() : '';
    city = city ? city.trim() : '';

    if (!fullName) {
      alert('Please enter your full name');
      return false;
    }
    if (!phone) {
      alert('Please enter your phone number');
      return false;
    }
    if (!/^[0-9+\s-]+$/.test(phone)) {
      alert('Please enter a valid phone number');
      return false;
    }
    if (!city) {
      alert('Please enter your city');
      return false;
    }
    var cartRaw = '';
    try { cartRaw = sessionStorage.getItem('checkoutCart') || '[]'; } catch (e) {}
    var items = [];
    try { items = JSON.parse(cartRaw); } catch (e) {}
    if (!items || items.length === 0) {
      alert('Your cart is empty. Please add products before checkout.');
      return false;
    }
    return true;
  }

  function buildOrderPayload() {
    var form = document.getElementById('order-form');
    var formData = form ? new FormData(form) : null;
    var cartRaw = '';
    try {
      cartRaw = sessionStorage.getItem('checkoutCart') || '[]';
    } catch (e) {
      log('sessionStorage get failed', e);
    }
    var items = [];
    try {
      items = JSON.parse(cartRaw);
    } catch (e) {
      log('parse checkoutCart failed', e);
    }
    var total = (window.getCartTotal && window.getCartTotal()) || 0;

    return {
      fullName: formData ? formData.get('fullName') : '',
      phone: formData ? formData.get('phone') : '',
      city: formData ? formData.get('city') : '',
      notes: (formData && formData.get('notes')) || '',
      items: items,
      total: total,
      date: new Date().toISOString()
    };
  }

  function saveOrderToLocalStore(orderData) {
    if (typeof Store !== 'undefined' && Store.addOrder) {
      try {
        Store.addOrder(orderData);
        log('Order saved to localStorage (Store.addOrder)');
        return true;
      } catch (e) {
        log('Store.addOrder failed', e);
      }
    } else {
      log('Store not available (store.js not loaded?)');
    }
    return false;
  }

  function finishOrderSuccess() {
    if (window.clearCartAfterOrder) window.clearCartAfterOrder();
    try {
      sessionStorage.removeItem('checkoutCart');
    } catch (e) {}
    var msg = (typeof t !== 'undefined' && t('orderSuccess')) ? t('orderSuccess') : 'Order submitted successfully! We will contact you soon.';
    alert(msg);
    window.location.href = './';
  }

  function finishOrderFailure(msg) {
    var submitBtn = document.getElementById('submit-order-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = (typeof t !== 'undefined' && t('confirmOrder')) ? t('confirmOrder') : 'Confirm Order';
    }
    alert(msg || 'Unable to submit order. Please try again or contact us.');
  }

  /** POST order to Orders API if configured. Returns a promise that resolves to true on success, false on failure. */
  function sendOrderToApi(orderData) {
    var apiUrl = typeof Store !== 'undefined' && Store.getOrdersApiUrl ? Store.getOrdersApiUrl() : null;
    if (!apiUrl) return Promise.resolve(false);

    var url = apiUrl.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) return Promise.resolve(false);

    log('POSTing order to API', url);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    })
      .then(function (r) {
        if (!r.ok) {
          log('Orders API error', r.status, r.statusText);
          return false;
        }
        log('Orders API success');
        return true;
      })
      .catch(function (err) {
        log('Orders API request failed', err);
        return false;
      });
  }

  window.submitOrder = function () {
    if (!validateOrderForm()) return;

    var orderData = buildOrderPayload();
    log('Submitting order', orderData.fullName, orderData.total, 'MAD', orderData.items.length, 'items');

    var submitBtn = document.getElementById('submit-order-btn');
    var originalText = submitBtn ? submitBtn.textContent : 'Confirm Order';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = (typeof t !== 'undefined' && t('submitting')) ? t('submitting') : 'Submitting...';
    }

    var apiUrl = typeof Store !== 'undefined' && Store.getOrdersApiUrl ? Store.getOrdersApiUrl() : null;

    function done(saved) {
      if (saved) {
        finishOrderSuccess();
      } else {
        finishOrderFailure((typeof t !== 'undefined' && t('orderSaveError')) ? t('orderSaveError') : 'Order could not be saved. Please try again or contact us directly.');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    if (apiUrl) {
      sendOrderToApi(orderData).then(function (apiOk) {
        if (apiOk) {
          done(true);
        } else {
          var saved = saveOrderToLocalStore(orderData);
          done(saved);
        }
      }).catch(function () {
        var saved = saveOrderToLocalStore(orderData);
        done(saved);
      });
      return;
    }

    try {
      var saved = saveOrderToLocalStore(orderData);
      done(saved);
    } catch (err) {
      log('Save order failed', err);
      done(false);
    }
  };

  function formatOrderItems(items) {
    return (items || []).map(function (item) {
      return item.name + ' - Size: ' + item.size + ', Color: ' + item.color + ', Quantity: ' + item.quantity + ', Price: ' + (item.price * item.quantity) + ' MAD';
    }).join('\n');
  }

  window.formatOrderItems = formatOrderItems;

  // Load cart on order page
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.location.pathname.includes('order.html') && !window.location.href.includes('order.html')) return;
    var cartRaw = '';
    try {
      cartRaw = sessionStorage.getItem('checkoutCart') || '[]';
    } catch (e) {}
    var cartItems = [];
    try {
      cartItems = JSON.parse(cartRaw);
    } catch (e) {}
    if (cartItems.length === 0) {
      alert('Your cart is empty. Redirecting to products...');
      window.location.href = './products.html';
      return;
    }
    renderOrderSummary(cartItems);
  });

  function renderOrderSummary(items) {
    var orderItemsEl = document.getElementById('order-items');
    var orderTotalEl = document.getElementById('order-total');
    if (!orderItemsEl) return;

    orderItemsEl.innerHTML = (items || []).map(function (item, index) {
      return (
        '<div class="order-item">' +
          '<div class="order-item-number">' + (index + 1) + '</div>' +
          '<div class="order-item-details">' +
            '<h4>' + (item.name || '') + '</h4>' +
            '<p>Size: ' + (item.size || '') + ' · Color: ' + (item.color || '') + ' · Quantity: ' + (item.quantity || 0) + '</p>' +
          '</div>' +
          '<div class="order-item-price">' + ((item.price || 0) * (item.quantity || 0)) + ' MAD</div>' +
        '</div>'
      );
    }).join('');

    if (orderTotalEl && window.getCartTotal) {
      orderTotalEl.textContent = window.getCartTotal() + ' MAD';
    }
  }

  window.renderOrderSummary = renderOrderSummary;
})();
