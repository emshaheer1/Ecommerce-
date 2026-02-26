function formatCurrency(value) {
  return `$${value.toFixed(2)}`;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

async function fetchOrders(showStatus = true) {
  const statusEl = document.getElementById('dashboard-status');
  if (statusEl && showStatus) {
    statusEl.hidden = false;
    statusEl.textContent = 'Loading orders...';
    statusEl.classList.remove('error');
  }
  try {
    const res = await fetch('/api/orders', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/admin/login';
      return;
    }
    if (!res.ok) throw new Error('Failed to load orders');
    const data = await res.json();
    const orders = Array.isArray(data) ? data : [];
    updateDashboard(orders);
    if (statusEl && showStatus) {
      statusEl.textContent = `Loaded ${orders.length} order${orders.length === 1 ? '' : 's'}.`;
    }
  } catch (e) {
    console.error(e);
    if (statusEl && showStatus) {
      statusEl.textContent = 'Unable to load orders. Please try again.';
      statusEl.classList.add('error');
    }
  }
}

/** Sync from production then reload orders. Used by Refresh button and auto-refresh. */
async function syncFromProductionAndReload(showStatus = true) {
  const statusEl = document.getElementById('dashboard-status');
  if (statusEl && showStatus) {
    statusEl.hidden = false;
    statusEl.textContent = 'Syncing from store...';
    statusEl.classList.remove('error');
  }
  try {
    const res = await fetch('/api/admin/sync-from-production', {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.href = '/admin/login';
      return;
    }
    if (!res.ok) {
      if (statusEl && showStatus) {
        statusEl.textContent = data.error || 'Sync failed.';
        statusEl.classList.add('error');
      }
      return;
    }
    await fetchOrders(showStatus);
    if (statusEl && showStatus && data.orders !== undefined) {
      statusEl.textContent = `Synced: ${data.orders} order${data.orders === 1 ? '' : 's'}.`;
    }
  } catch (e) {
    console.error(e);
    if (statusEl && showStatus) {
      statusEl.textContent = 'Sync failed. Loaded local data.';
      statusEl.classList.add('error');
    }
    await fetchOrders(showStatus);
  }
}

function updateDashboard(orders) {
  updateStats(orders);
  updateRecentOrdersTable(orders);
  updateOrdersTable(orders);
  updateCustomersTable(orders);
}

function updateStats(orders) {
  const revenueEl = document.getElementById('stat-revenue');
  const ordersCountEl = document.getElementById('stat-orders-count');
  const aovEl = document.getElementById('stat-aov');
  const customersEl = document.getElementById('stat-customers');

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
  const orderCount = orders.length;
  const aov = orderCount ? totalRevenue / orderCount : 0;

  const customersByEmail = new Map();
  for (const order of orders) {
    const email = order.customer?.email?.toLowerCase();
    if (!email) continue;
    const existing = customersByEmail.get(email) || { count: 0, total: 0 };
    existing.count += 1;
    existing.total += order.total || 0;
    customersByEmail.set(email, existing);
  }

  if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue);
  if (ordersCountEl) ordersCountEl.textContent = `${orderCount} order${orderCount === 1 ? '' : 's'}`;
  if (aovEl) aovEl.textContent = formatCurrency(aov);
  if (customersEl) customersEl.textContent = customersByEmail.size.toString();
}

function updateRecentOrdersTable(orders) {
  const tbody = document.getElementById('recent-orders-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!orders.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="5" class="empty-row">No orders yet.</td>`;
    tbody.appendChild(row);
    return;
  }

  const recent = orders.slice(0, 5);
  for (const order of recent) {
    const row = document.createElement('tr');
    const itemCount = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
    row.innerHTML = `
      <td>${order.id || '-'}</td>
      <td>${formatDate(order.createdAt)}</td>
      <td>${order.customer?.name || '-'}<br /><span class="muted">${
      order.customer?.email || '-'
    }</span></td>
      <td>${formatCurrency(order.total || 0)}</td>
      <td>${itemCount} item${itemCount === 1 ? '' : 's'}</td>
    `;
    tbody.appendChild(row);
  }
}

function updateOrdersTable(orders) {
  const tbody = document.getElementById('orders-table-body');
  const filterInput = document.getElementById('filter-search');
  if (!tbody) return;

  const searchTerm = filterInput?.value?.toLowerCase().trim() || '';

  tbody.innerHTML = '';

  const filtered = !searchTerm
    ? orders
    : orders.filter((order) => {
        const haystack = [
          order.id,
          order.customer?.name,
          order.customer?.email,
          order.customer?.city,
          order.customer?.country
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      });

  if (!filtered.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="6" class="empty-row">No matching orders.</td>`;
    tbody.appendChild(row);
    return;
  }

  for (const order of filtered) {
    const itemSummary =
      order.items
        ?.map((item) => `${item.name || item.productId} × ${item.quantity || 1}`)
        .join(', ') || '-';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${order.id || '-'}</td>
      <td>${order.customer?.name || '-'}</td>
      <td>${order.customer?.email || '-'}</td>
      <td>${formatCurrency(order.total || 0)}</td>
      <td><span class="badge">${itemSummary}</span></td>
      <td>${formatDate(order.createdAt)}</td>
    `;
    tbody.appendChild(row);
  }
}

function updateCustomersTable(orders) {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  const byEmail = new Map();

  for (const order of orders) {
    const email = order.customer?.email?.toLowerCase();
    if (!email) continue;

    const existing = byEmail.get(email) || {
      name: order.customer?.name || '',
      email,
      phone: order.customer?.phone || '',
      address: order.customer?.address || '',
      city: order.customer?.city || '',
      postalCode: order.customer?.postalCode || '',
      country: order.customer?.country || '',
      orders: 0,
      totalSpend: 0
    };

    existing.orders += 1;
    existing.totalSpend += order.total || 0;
    if (!existing.name && order.customer?.name) existing.name = order.customer.name;
    if (!existing.phone && order.customer?.phone) existing.phone = order.customer.phone;
    if (!existing.address && order.customer?.address) existing.address = order.customer.address;
    if (!existing.city && order.customer?.city) existing.city = order.customer.city;
    if (!existing.postalCode && order.customer?.postalCode) existing.postalCode = order.customer.postalCode;
    if (!existing.country && order.customer?.country) existing.country = order.customer.country;

    byEmail.set(email, existing);
  }

  const customers = Array.from(byEmail.values());

  if (!customers.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="9" class="empty-row">No customers yet.</td>`;
    tbody.appendChild(row);
    return;
  }

  for (const customer of customers) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(customer.name || '-')}</td>
      <td>${escapeHtml(customer.email)}</td>
      <td>${escapeHtml(customer.phone || '-')}</td>
      <td>${escapeHtml(customer.address || '-')}</td>
      <td>${escapeHtml(customer.city || '-')}</td>
      <td>${escapeHtml(customer.postalCode || '-')}</td>
      <td>${escapeHtml(customer.country || '-')}</td>
      <td>${customer.orders}</td>
      <td>${formatCurrency(customer.totalSpend)}</td>
    `;
    tbody.appendChild(row);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupNav() {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view;
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
      views.forEach((v) => {
        v.classList.toggle('active', v.id === `view-${targetView}`);
      });
    });
  });
}

function setupLogout() {
  const logoutBtn = document.getElementById('btn-logout');
  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/admin/login';
  });
}

function aggregateCustomersFromOrders(orders) {
  var byEmail = new Map();
  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    var email = (order.customer && order.customer.email) ? order.customer.email.toLowerCase() : '';
    if (!email) continue;
    var existing = byEmail.get(email);
    if (!existing) {
      existing = {
        name: (order.customer && order.customer.name) || '',
        email: email,
        phone: (order.customer && order.customer.phone) || '',
        address: (order.customer && order.customer.address) || '',
        city: (order.customer && order.customer.city) || '',
        postalCode: (order.customer && order.customer.postalCode) || '',
        country: (order.customer && order.customer.country) || '',
        orders: 0,
        totalSpend: 0
      };
      byEmail.set(email, existing);
    }
    existing.orders += 1;
    existing.totalSpend += order.total || 0;
    if (!existing.name && order.customer && order.customer.name) existing.name = order.customer.name;
    if (!existing.phone && order.customer && order.customer.phone) existing.phone = order.customer.phone;
    if (!existing.address && order.customer && order.customer.address) existing.address = order.customer.address;
    if (!existing.city && order.customer && order.customer.city) existing.city = order.customer.city;
    if (!existing.postalCode && order.customer && order.customer.postalCode) existing.postalCode = order.customer.postalCode;
    if (!existing.country && order.customer && order.customer.country) existing.country = order.customer.country;
  }
  return Array.from(byEmail.values());
}

function setupDownload() {
  var btn = document.getElementById('download-btn');
  var statusEl = document.getElementById('dashboard-status');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.disabled = true;
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'Preparing PDF...';
      statusEl.classList.remove('error');
    }
    fetch('/api/orders', { credentials: 'include' })
      .then(function (res) {
        if (res.status === 401) {
          window.location.href = '/admin/login';
          return null;
        }
        if (!res.ok) throw new Error('Failed to load data');
        return res.json();
      })
      .then(function (orders) {
        if (!orders || !Array.isArray(orders)) return;
        var customers = aggregateCustomersFromOrders(orders);
        var doc = new jspdf.jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16);
        doc.text('Felicia Store - Customer List', 14, 15);
        doc.setFontSize(10);
        doc.text('Exported on ' + new Date().toLocaleDateString(), 14, 22);
        var headers = [['Name', 'Email', 'Phone', 'Address', 'City', 'Postal', 'Country', 'Orders', 'Total Spend']];
        var rows = customers.map(function (c) {
          return [
            c.name || '-',
            c.email || '-',
            c.phone || '-',
            c.address || '-',
            c.city || '-',
            c.postalCode || '-',
            c.country || '-',
            String(c.orders),
            '$' + (c.totalSpend || 0).toFixed(2)
          ];
        });
        if (rows.length === 0) {
          doc.setFontSize(11);
          doc.text('No customer data found.', 14, 35);
        } else {
          doc.autoTable({
            startY: 28,
            head: headers,
            body: rows,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [41, 99, 235] },
            margin: { left: 14 }
          });
        }
        doc.save('customers-' + new Date().toISOString().slice(0, 10) + '.pdf');
        if (statusEl) {
          statusEl.textContent = 'Download complete.';
          statusEl.classList.remove('error');
          setTimeout(function () { statusEl.hidden = true; }, 2500);
        }
      })
      .catch(function () {
        if (statusEl) {
          statusEl.textContent = 'Download failed. Try again.';
          statusEl.classList.add('error');
        }
      })
      .finally(function () {
        btn.disabled = false;
      });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupLogout();
  setupDownload();

  const refreshBtn = document.getElementById('refresh-btn');
  const filterInput = document.getElementById('filter-search');

  refreshBtn?.addEventListener('click', () => {
    syncFromProductionAndReload(true);
  });

  // Auto-refresh from production every 30 seconds when running locally
  const AUTO_REFRESH_INTERVAL_MS = 30 * 1000;
  let autoRefreshTimer = setInterval(() => {
    syncFromProductionAndReload(false);
  }, AUTO_REFRESH_INTERVAL_MS);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') clearInterval(autoRefreshTimer);
    else autoRefreshTimer = setInterval(() => syncFromProductionAndReload(false), AUTO_REFRESH_INTERVAL_MS);
  });

  filterInput?.addEventListener('input', () => {
    fetch('/api/orders', { credentials: 'include' })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = '/admin/login';
          return [];
        }
        return res.json();
      })
      .then((orders) => {
        if (!Array.isArray(orders)) return;
        updateOrdersTable(orders);
      })
      .catch((e) => console.error(e));
  });

  // Initial load: try to sync from production first (when local), then show data
  syncFromProductionAndReload(false);
});

