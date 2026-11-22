'use strict';
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const normalize = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let lastJson = '';
let busy = false;
async function refreshHealth() {
  try {
    const response = await fetch('/health', { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    const healthy = response.ok && data.status === 'healthy';
    $('system-status').className = `status ${healthy ? '' : 'down'}`;
    $('system-status').innerHTML = `<span class="small-dot"></span>${healthy ? 'All systems operational' : 'Service needs attention'}`;
    const names = { temporal: 'Temporal', worker: 'Workflow worker', redis: 'Redis', supplierA: 'Supplier A', supplierB: 'Supplier B' };
    $('health-list').innerHTML = Object.entries(names).map(([key, name]) => {
      const check = data.checks?.[key];
      const up = check?.status === 'up';
      return `<div class="health-row"><span>${name}</span><span><small>${escapeHtml(check?.latencyMs ?? '—')} ms</small><span class="health-value ${up ? '' : 'down'}"><span class="small-dot"></span>${up ? 'Healthy' : 'Unavailable'}</span></span></div>`;
    }).join('');
  } catch {
    $('system-status').className = 'status down';
    $('system-status').innerHTML = '<span class="small-dot"></span>Unable to reach services';
    $('health-list').innerHTML = '<p class="muted">Health check unavailable. Try refreshing.</p>';
  }
}
function showNotice(text) { $('notice').textContent = text; $('notice').classList.remove('hidden'); }
async function compare(event) {
  event?.preventDefault();
  if (busy) return;
  const min = $('min-price').value;
  const max = $('max-price').value;
  if (min !== '' && max !== '' && Number(min) > Number(max)) { showNotice('Minimum price must not exceed maximum price.'); return; }
  if (!$('search-form').reportValidity()) return;
  busy = true;
  $('notice').classList.add('hidden');
  $('search-button').disabled = true;
  $('search-button').textContent = 'Comparing…';
  $('copy-response').disabled = true;
  const query = new URLSearchParams({ city: $('city').value.trim() });
  if (min !== '') query.set('minPrice', min);
  if (max !== '') query.set('maxPrice', max);
  const url = `/api/hotels?${query}`;
  $('request-url').textContent = url;
  $('http-status').textContent = 'Running workflow…';
  $('results').innerHTML = '<div class="loading-bar"></div><div class="empty-state busy"><span class="empty-icon">⇄</span><h3>Comparing both suppliers</h3><p>Temporal is orchestrating the search.<br>Redis will apply your price bounds.</p></div>';
  for (const id of ['listing-count', 'unique-count', 'match-count', 'lowest-price']) $(id).textContent = '—';
  $('lowest-hotel').textContent = 'Comparison in progress';
  const start = performance.now();
  try {
    const inventoryQuery = new URLSearchParams({ city: $('city').value.trim() });
    const inventories = Promise.allSettled(['/supplierA/hotels', '/supplierB/hotels'].map(async path => {
      const response = await fetch(`${path}?${inventoryQuery}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Inventory unavailable');
      return response.json();
    }));
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    const body = await response.json();
    lastJson = JSON.stringify(body, null, 2);
    $('json-response').textContent = lastJson;
    $('copy-response').disabled = false;
    $('workflow-id').textContent = response.headers.get('x-workflow-id') || 'No workflow started';
    $('http-status').textContent = `${response.status} ${response.statusText}`;
    $('search-timing').textContent = `Response in ${((performance.now() - start) / 1000).toFixed(2)}s · request ${response.headers.get('x-request-id') || 'unavailable'}`;
    if (!response.ok) throw new Error(body.error?.message || 'Comparison unavailable');
    const lists = await inventories;
    const inventoryAvailable = lists.every(item => item.status === 'fulfilled');
    const inventory = lists.flatMap((item, index) => item.status === 'fulfilled' ? item.value.map(hotel => ({ ...hotel, supplier: index === 0 ? 'Supplier A' : 'Supplier B' })) : []);
    $('listing-count').textContent = inventoryAvailable ? String(inventory.length) : '—';
    $('unique-count').textContent = inventoryAvailable ? String(new Set(inventory.map(hotel => normalize(hotel.name))).size) : '—';
    $('match-count').textContent = String(body.length);
    $('lowest-price').textContent = body.length ? money(body[0].price) : '—';
    $('lowest-hotel').textContent = body.length ? body[0].name : 'No offers within these bounds';
    $('results-caption').textContent = `${body.length} ${body.length === 1 ? 'offer' : 'offers'} in ${normalize($('city').value)} · all prices in INR`;
    if (!body.length) {
      $('results').innerHTML = '<div class="empty-state"><span class="empty-icon">⌖</span><h3>No matching stays</h3><p>Try another destination or widen the price range.<br>Unknown cities correctly return an empty list.</p></div>';
    } else {
      $('results').innerHTML = body.map(hotel => {
        const comparisons = inventory.filter(item => normalize(item.name) === normalize(hotel.name));
        const higher = Math.max(hotel.price, ...comparisons.map(item => item.price));
        const initials = hotel.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('');
        const comparison = inventoryAvailable ? comparisons.map(item => `${item.supplier.replace('Supplier ', '')}: ${money(item.price)}`).join('  ·  ') : 'Supplier inventory detail unavailable';
        return `<article class="hotel-row"><div class="hotel-icon">${escapeHtml(initials)}</div><div class="hotel-info"><div class="hotel-name">${escapeHtml(hotel.name)}</div><span class="supplier-badge ${hotel.supplier === 'Supplier B' ? 'b' : ''}">${escapeHtml(hotel.supplier)}</span><span class="commission">${escapeHtml(hotel.commissionPct)}% commission</span><div class="comparison">${escapeHtml(comparison)}</div></div><div class="hotel-price"><strong>${money(hotel.price)}</strong><small>selected offer</small>${higher > hotel.price ? `<span class="saving">Save ${money(higher - hotel.price)}</span>` : ''}</div></article>`;
      }).join('');
    }
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'The request timed out. The service may be waking up; retry shortly.' : error.message;
    showNotice(message);
    $('results-caption').textContent = 'Comparison could not be completed';
    $('lowest-hotel').textContent = 'No verified result';
    $('results').innerHTML = '<div class="empty-state"><span class="empty-icon">!</span><h3>Comparison unavailable</h3><p>We require both suppliers to verify the lowest price.<br>Check service health and try again.</p></div>';
    if ($('http-status').textContent === 'Running workflow…') {
      $('http-status').textContent = 'Request failed';
      $('json-response').textContent = message;
      $('workflow-id').textContent = 'No workflow response received';
    }
  } finally {
    busy = false;
    $('search-button').disabled = false;
    $('search-button').innerHTML = 'Compare offers <span>→</span>';
    void refreshHealth();
  }
}
$('search-form').addEventListener('submit', compare);
$('refresh-health').addEventListener('click', refreshHealth);
document.querySelectorAll('[data-max]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  $('min-price').value = button.dataset.min || '';
  $('max-price').value = button.dataset.max || '';
  void compare();
}));
$('clear-filters').addEventListener('click', () => { if (!busy) { $('min-price').value = ''; $('max-price').value = ''; void compare(); } });
$('copy-response').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(lastJson); $('copy-response').textContent = 'Copied'; setTimeout(() => { $('copy-response').textContent = 'Copy JSON'; }, 1500); }
  catch { showNotice('Clipboard access is unavailable. Select and copy the JSON below.'); }
});
void refreshHealth();
void compare();
