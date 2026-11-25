(()=>{
'use strict';

// ==========================================
// 一、DOM 捷徑、常數設定與狀態管理
// ==========================================
const { $, money, toast } = window.CTA;
const strokeCollator = new Intl.Collator('zh-Hant-u-co-stroke', { sensitivity: 'variant', numeric: true });

const DEFINITIONS = [
  ['id', '序號'],
  ['name', '名字'],
  ['member', '委員號'],
  ['charity', '慈誠號'],
  ['paid', '已繳次數'],
  ['times', '本次繳交次數'],
  ['amount', '本次會費'],
  ['action', '詳細']
];

const records = {};
let activeKey = '';
let filtered = [];
let currentPage = 1;

const getUnit = () => document.querySelector('input[name="unit"]:checked').value;
const getKey = () => [$('year').value, $('heqi').value, $('xieli').value, getUnit()].join('|');

function getSet() {
  const key = getKey();
  if (!records[key]) {
    records[key] = { rows: [], submitted: false };
  }
  return records[key];
}

function getHeqiSets(year, heqi) {
  return Object.keys(records)
    .filter(k => k.startsWith(`${year}|${heqi}|`))
    .map(k => records[k]);
}

// ==========================================
// 二、資料格式化、計算與排序工具
// ==========================================
const currentPayments = r => (r.payments || []).filter(p => !p.ledgerDate);
const total = r => currentPayments(r).reduce((sum, p) => sum + p.amount, 0);
const compareIdAsc = (aVal, bVal) => {
  const sa = String(aVal || '').trim();
  const sb = String(bVal || '').trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, 'en', { numeric: true });
};
const sortRowsByUnit = (rows, unitType) => {
  const field = unitType === '隊' ? 'charity' : 'member';
  return [...rows].sort((a, b) => compareIdAsc(a[field], b[field]));
};

function getTableState() {
  const heqiSets = getHeqiSets($('year').value, $('heqi').value);
  if (heqiSets.some(s => s.submitted)) return '待審核';

  const set = getSet();
  const hasCurrent = set.rows.some(r => currentPayments(r).length > 0);
  const hasHistorical = set.rows.some(r => r.payments && r.payments.some(p => p.ledgerDate));
  return hasCurrent ? '待修正' : (hasHistorical ? '已列帳' : '未編輯');
}

function sortDropdownByStroke(id) {
  const select = $(id);
  const options = Array.from(select.options);
  const placeholder = options.filter(opt => !opt.value);
  const choices = options
    .filter(opt => opt.value)
    .sort((a, b) => strokeCollator.compare(a.textContent.trim(), b.textContent.trim()));
  select.replaceChildren(...placeholder, ...choices);
  select.value = '';
}

// ==========================================
// 三、外部資料載入 (data.json)
// ==========================================
const dataReady = fetch('json/data.json?v=346', { cache: 'no-store' })
  .then(res => res.json())
  .then(list => {
    const entries = Array.isArray(list) ? list : [];
    const teamByYearHeqi = {};
    entries.forEach(item => {
      if (item.unit === '隊') {
        const yh = `${String(item.year || '2026')}|${item.heqi}`;
        if (!teamByYearHeqi[yh]) teamByYearHeqi[yh] = [];
        teamByYearHeqi[yh].push(...(Array.isArray(item.rows) ? item.rows : []));
      }
    });
    entries.forEach(item => {
      const y = String(item.year || '2026');
      const key = [y, item.heqi, item.xieli, item.unit].join('|');
      const rows = Array.isArray(item.rows) ? item.rows : [];
      if (item.unit === '組') {
        const teamRows = teamByYearHeqi[`${y}|${item.heqi}`] || [];
        rows.forEach(r => {
          if (!r.charity) {
            const sp = String(r.spouseId || '').trim();
            if (sp && sp.includes('/')) {
              const charityPart = sp.split('/')[1].trim();
              if (charityPart && charityPart !== '—') {
                r.charity = charityPart;
                return;
              }
            }
            if (r.member) {
              const matched = teamRows.find(t => t.member === r.member && t.charity);
              if (matched) r.charity = matched.charity;
            }
          }
        });
      }
      records[key] = {
        rows: sortRowsByUnit(rows, item.unit),
        submitted: Boolean(item.submitted)
      };
    });
  })
  .catch(err => {
    console.error('讀取 json/data.json 失敗：', err);
    $('tbody').innerHTML = '<tr><td colspan="8" class="empty">無法讀取資料 (請使用 Live Server 或伺服器環境開啟)</td></tr>';
  });

// ==========================================
// 四、通用 UI 互動、Loading 與彈窗元件
// ==========================================
function modal(name, body, foot = '') {
  $('modal-title').textContent = name;
  $('modal-content').innerHTML = body;
  $('modal-foot').innerHTML = foot;
  $('overlay').classList.remove('hidden');
}

function hideModal() {
  $('overlay').classList.add('hidden');
}

function withButtonLoading(buttonId, asyncTask) {
  const btn = $(buttonId);
  if (!btn || btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  btn.disabled = true;

  setTimeout(() => {
    try {
      asyncTask();
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }, 600);
}

function withTableLoading(asyncTask, delay = 700) {
  $('table-loading').classList.remove('hidden');

  setTimeout(() => {
    try {
      asyncTask();
    } finally {
      $('table-loading').classList.add('hidden');
    }
  }, delay);
}

function setupCustomSelect(triggerId, optionsId, hiddenInputId, textId) {
  const trigger = $(triggerId);
  const options = $(optionsId);
  const hidden = $(hiddenInputId);
  const text = $(textId);
  if (!trigger || !options) return;

  trigger.onclick = e => {
    if (trigger.classList.contains('disabled')) return;
    e.stopPropagation();
    document.querySelectorAll('.elegant-select-options').forEach(el => {
      if (el !== options) el.classList.add('hidden');
    });
    options.classList.toggle('hidden');
  };

  options.querySelectorAll('.elegant-option').forEach(opt => {
    opt.onclick = e => {
      e.stopPropagation();
      options.querySelectorAll('.elegant-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      hidden.value = opt.dataset.value;
      text.textContent = opt.textContent;
      options.classList.add('hidden');
    };
  });
}

// ==========================================
// 五、主畫面狀態列、分頁與表格渲染
// ==========================================
function renderStatusAndSubmit() {
  const set = getSet();
  const currentState = getTableState();
  const pill = $('status-label');

  const currentYear = $('year').value;
  const currentHeqi = $('heqi').value;
  $('section-title').textContent = `${currentYear} 年度｜${currentHeqi} - ${$('xieli').value} (${getUnit()})`;
  pill.textContent = currentState;
  pill.className = 'pill ' + (
    currentState === '待修正' ? 'warning' :
    currentState === '待審核' ? 'info' :
    currentState === '已列帳' ? 'success' : ''
  );

  if (currentState === '待審核') {
    const targetUrl = `reviewincome.html?year=${encodeURIComponent(currentYear)}&status=pending`;
    pill.setAttribute('href', targetUrl);
    pill.style.cursor = 'pointer';
    pill.title = '點擊前往審核收入明細（待審核）';
    pill.onclick = (e) => {
      e.preventDefault();
      try {
        const heqiSets = getHeqiSets(currentYear, currentHeqi);
        let people = 0, teamAmount = 0, groupAmount = 0;
        Object.keys(records).forEach(k => {
          if (!k.startsWith(`${currentYear}|${currentHeqi}|`)) return;
          const unitType = k.split('|')[3];
          const rows = records[k].rows || [];
          rows.forEach(r => {
            const amt = total(r);
            if (amt > 0) {
              people += 1;
              if (unitType === '隊') teamAmount += amt;
              else if (unitType === '組') groupAmount += amt;
            }
          });
        });
        sessionStorage.setItem('cta_pending_sync', JSON.stringify({
          year: currentYear,
          name: currentHeqi,
          people,
          teamAmount,
          groupAmount,
          amount: teamAmount + groupAmount
        }));
      } catch (_) {}
      window.location.href = targetUrl;
    };
  } else {
    pill.setAttribute('href', '#');
    pill.style.cursor = 'default';
    pill.removeAttribute('title');
    pill.onclick = (e) => e.preventDefault();
  }

  $('paid-count').textContent = `${set.rows.filter(r => currentPayments(r).length > 0).length} / ${set.rows.length}`;
  $('paid-sum').textContent = money(set.rows.reduce((sum, r) => sum + total(r), 0));

  // 僅在目前表單為「待修正」（已有本次編輯繳款且尚未送審）時顯示送審按鈕；「未編輯」、「已列帳」、「待審核」皆隱藏
  const canSubmit = currentState === '待修正';
  $('submit').disabled = !canSubmit;
  $('submit').classList.toggle('hidden', !canSubmit);
}

function renderPagination(totalCount, totalPages) {
  if (totalCount === 0) {
    $('pagination').classList.add('hidden');
    return;
  }

  $('pagination').classList.remove('hidden');
  $('total-items').textContent = totalCount;
  $('total-pages').textContent = totalPages;

  $('page-numbers').innerHTML = Array.from({ length: totalPages }, (_, i) => {
    const page = i + 1;
    return `<button class="page-btn ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`;
  }).join('');

  document.querySelectorAll('#page-numbers .page-btn').forEach(btn => {
    btn.onclick = () => {
      currentPage = parseInt(btn.dataset.page, 10);
      render();
    };
  });

  $('page-prev').classList.toggle('disabled', currentPage === 1);
  $('page-next').classList.toggle('disabled', currentPage === totalPages);
}

function render() {
  const visible = Boolean(activeKey && filtered.length);
  $('income-status').classList.toggle('hidden', !visible);

  if (visible) {
    renderStatusAndSubmit();
  } else {
    $('submit').classList.add('hidden');
  }

  const itemsPerPage = parseInt($('per-page-select').value, 10) || 20;
  const isFilterPaid = $('filter-paid-checkbox').checked;
  const activeUnit = activeKey ? activeKey.split('|')[3] : getUnit();
  const sortedFiltered = sortRowsByUnit(filtered, activeUnit);
  const displayData = isFilterPaid ? sortedFiltered.filter(r => total(r) > 0) : sortedFiltered;

  const totalPages = Math.max(1, Math.ceil(displayData.length / itemsPerPage));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageData = displayData.slice(startIndex, startIndex + itemsPerPage);

  renderPagination(displayData.length, totalPages);

  $('headers').innerHTML = DEFINITIONS
    .map(([key, label]) => `<th class="${['id', 'paid', 'times', 'amount', 'action'].includes(key) ? 'center' : ''}">${label}</th>`)
    .join('');

  $('tbody').innerHTML = pageData.map((r, idx) => `<tr>${DEFINITIONS.map(([key]) => {
    let v = key === 'id' ? (startIndex + idx + 1) :
            key === 'times' ? currentPayments(r).length :
            key === 'amount' ? money(total(r)) :
            key === 'action' ? `<button class="btn primary small payment" data-id="${r.id}">詳細</button>` :
            r[key];
    if (((key === 'member' || key === 'charity') && !v) || (key === 'paid' && v == null)) {
      v = '<span class="blank">—</span>';
    }
    return `<td class="${['id', 'paid', 'times', 'amount', 'action'].includes(key) ? 'center' : ''}">${v}</td>`;
  }).join('')}</tr>`).join('') || `<tr><td class="empty" colspan="${DEFINITIONS.length}">${activeKey ? '查無符合條件的資料' : '請選擇條件搜尋'}</td></tr>`;

  document.querySelectorAll('.payment').forEach(btn => {
    btn.onclick = () => {
      btn.classList.add('loading');
      btn.disabled = true;
      setTimeout(() => {
        btn.classList.remove('loading');
        btn.disabled = false;
        payment(Number(btn.dataset.id));
      }, 400);
    };
  });
}

// ==========================================
// 六、詳細明細彈窗 (Payment Detail Modal)
// ==========================================
function payment(id, detailYear) {
  const set = getSet();
  const r = set.rows.find(row => row.id === id);
  if (!r) return;

  const searchedYear = $('year').value || '2026';
  const currentDetailYear = detailYear || searchedYear;
  const heqi = $('heqi').value;
  const xieli = $('xieli').value;
  const unit = getUnit();
  const unitName = `${xieli} (${unit})`;

  const certYear = r.certYear || (r.charity === '02410' ? '1997' : '2010');
  const dharmaName = r.dharmaName || (r.charity === '02410' ? '本馨' : '—');
  const isAlive = '存';
  const spouseId = '— / —';
  const spouseName = '—';
  const spouseDharma = '—';
  const spouseAlive = '—';

  const detailKey = [currentDetailYear, heqi, xieli, unit].join('|');
  const detailSet = records[detailKey];
  const detailRow = detailSet ? detailSet.rows.find(row =>
    (r.charity && row.charity === r.charity) ||
    (r.member && row.member === r.member) ||
    row.id === r.id
  ) : null;
  const detailPayments = detailRow ? detailRow.payments : [];

  const isDetailSub = detailSet ? detailSet.submitted : set.submitted;
  const detailHasCurrent = detailSet ? detailSet.rows.some(row => currentPayments(row).length > 0) : false;
  const detailHasHistorical = detailSet ? detailSet.rows.some(row => row.payments && row.payments.some(p => p.ledgerDate)) : false;
  const isClosed = isDetailSub || Number(currentDetailYear) < 2026 || (detailHasHistorical && !detailHasCurrent);

  const hasExistingPayments = detailPayments.length > 0;
  const maxPaidMonth = hasExistingPayments
    ? Math.max(...detailPayments.map(p => Number(p.month) || 0))
    : 0;
  let maxCount = hasExistingPayments ? Math.max(0, 12 - maxPaidMonth) : 12;

  const startMonthBlockHtml = hasExistingPayments ? '' : `<div class="inline-underline-field custom-select-group ${isClosed ? 'disabled' : ''}">
          <label>起始月份：</label>
          <div class="elegant-select" id="wrapper-start-month">
            <input type="hidden" id="payment-start-month" value="">
            <div class="elegant-select-trigger ${isClosed ? 'disabled' : ''}" id="trigger-start-month">
              <span id="text-start-month"></span>
              <span class="elegant-select-arrow">▾</span>
            </div>
            <div class="elegant-select-options hidden" id="options-start-month">
              ${Array.from({ length: 12 }, (_, i) => `<div class="elegant-option" data-value="${i + 1}">${i + 1}</div>`).join('')}
            </div>
          </div>
        </div>`;

  const yearOptionsHtml = Array.from($('year').options)
    .map(opt => `<option value="${opt.value}" ${opt.value === currentDetailYear ? 'selected' : ''}>${opt.value} 年</option>`)
    .join('');

  const sortedPaymentsHtml = [...detailPayments]
    .sort((a, b) => a.month - b.month)
    .map(p => `<tr style="border-bottom: 1px solid #ecf0f6;">
      <td style="padding:12px 16px;">${p.month} 月</td>
      <td style="padding:12px 16px; color:#3d5176;">${p.date}</td>
      <td style="padding:12px 16px; color:#3d5176;">${p.settleDate || ''}</td>
      <td style="padding:12px 16px; color:#3d5176;">${p.ledgerDate || ''}</td>
      <td class="num-col" style="padding:12px 16px;">${p.amount}</td>
    </tr>`)
    .join('') || '<tr><td colspan="5" class="empty" style="padding:30px; text-align:center; color:#5c6b7d;">目前尚無繳款紀錄</td></tr>';

  const form = `
    <div style="font-size: 15px; color: #122a55; font-weight: 700; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #c9d8eb; display: flex; align-items: center; gap: 6px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a6b9c" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      基本資料
    </div>
    <div class="detail-grid" style="gap: 6px 8px; margin-bottom: 16px;">
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">受證年度</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${certYear}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">和氣名稱</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${heqi}</div></div>
      <div class="detail-grid-span-2" style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">組別名稱</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${unitName}</div></div>

      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">委員 (委員號)</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${r.member || '—'}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">姓名</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${r.name}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">法號</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${dharmaName}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">存歿</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${isAlive}</div></div>

      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶委員 (慈誠號)</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${r.charity || '—'}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶姓名</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${spouseName}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶法號</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${spouseDharma}</div></div>
      <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶存歿</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${spouseAlive}</div></div>
    </div>

    <div style="margin-bottom: 24px;">
      <label style="display:block; color:#3d5176; margin-bottom:4px; font-size:14px; font-weight:700;">備註：</label>
      <input type="text" id="remark-input" class="remark-input" placeholder="請輸入備註內容..." value="${(r.remark || '').replace(/"/g, '&quot;')}">
    </div>

    <div class="bottom-split-grid">
      <div>
        <div style="font-size: 15px; color: #122a55; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #c9d8eb; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4291" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            繳款明細
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <label for="detail-year-select" style="font-size: 14px; color: #3d5176; font-weight: 600;">年度：</label>
            <select id="detail-year-select" class="page-select" style="margin-right: 0; font-weight: 600; color: #14264b;">
              ${yearOptionsHtml}
            </select>
          </div>
        </div>
        <div class="table-scroll" style="margin:0; border-radius:6px; overflow-x:auto;">
          <table class="detail-table" style="min-width:0; width:100%;">
            <thead style="background: #eaf1fa;">
              <tr>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">繳款月份</th>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">作業日</th>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">結帳日</th>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">列帳日</th>
                <th class="num-col" style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:right; border-bottom:1px solid #d9e3f1;">金額</th>
              </tr>
            </thead>
            <tbody>${sortedPaymentsHtml}</tbody>
          </table>
        </div>
      </div>

      <div style="padding:6px 0; display:flex; flex-direction:column; gap:14px;">
        ${startMonthBlockHtml}

        <div class="inline-underline-field ${(isClosed || maxCount === 0) ? 'disabled' : ''}">
          <label for="payment-count">次數：</label>
          <input id="payment-count" type="number" min="${maxCount > 0 ? 1 : 0}" max="${maxCount}" step="1" value="" class="elegant-input" ${(isClosed || maxCount === 0) ? 'disabled' : ''}>
        </div>

        <div class="inline-underline-field custom-select-group ${isClosed ? 'disabled' : ''}">
          <label>金額：</label>
          <div class="elegant-select" id="wrapper-amount">
            <input type="hidden" id="payment-amount" value="">
            <div class="elegant-select-trigger ${isClosed ? 'disabled' : ''}" id="trigger-amount">
              <span id="text-amount"></span>
              <span class="elegant-select-arrow">▾</span>
            </div>
            <div class="elegant-select-options hidden" id="options-amount">
              <div class="elegant-option" data-value="200">200 / 月</div>
              <div class="elegant-option" data-value="300">300 / 月</div>
            </div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px; margin-top:6px;">
          <button class="btn elegant-btn-add" id="savepay" ${isClosed ? 'disabled' : ''}>批次新增</button>
          <button class="btn elegant-btn-del" id="deletepay" ${isClosed ? 'disabled' : ''}>刪除</button>
        </div>
      </div>
    </div>
  `;

  modal('收入管理 / 編輯收入明細 / 詳細', form, `
    <button class="btn" id="history">下載歷史繳款紀錄</button>
    <button class="btn" id="modal-leave">關閉</button>
    <button class="btn primary" id="modal-save" style="background:#25aae1; border-color:#25aae1;">儲存</button>
  `);

  const initialRemark = (r.remark || '').trim();
  const isDetailModalDirty = () => {
    const ov = $('overlay');
    const saveBtn = $('modal-save');
    if (!ov || ov.classList.contains('hidden') || !saveBtn || saveBtn.disabled) return false;
    const curRemark = $('remark-input') ? $('remark-input').value.trim() : initialRemark;
    const curStartMonth = $('payment-start-month') ? $('payment-start-month').value.trim() : '';
    const curCount = $('payment-count') ? $('payment-count').value.trim() : '';
    const curAmount = $('payment-amount') ? $('payment-amount').value.trim() : '';
    return curRemark !== initialRemark || Boolean(curStartMonth) || Boolean(curCount) || Boolean(curAmount);
  };

  const requestCloseDetailModal = () => {
    if (isDetailModalDirty()) {
      window.CTA.confirm('你的資料尚未儲存，確定要離開嗎？', '確定', () => {
        hideModal();
      });
    } else {
      hideModal();
    }
  };

  window.__searchIncomeRequestClose = requestCloseDetailModal;
  window.__searchIncomeIsModalDirty = isDetailModalDirty;

  $('detail-year-select').onchange = e => payment(id, e.target.value);
  $('modal-leave').onclick = requestCloseDetailModal;
  $('modal-save').onclick = () => {
    if ($('remark-input')) r.remark = $('remark-input').value.trim();
    toast('已儲存更新');
    hideModal();
    render();
  };
  $('savepay').onclick = () => { if (!isClosed) toast('批次新增功能目前為靜態展示'); };
  $('deletepay').onclick = () => { if (!isClosed) toast('刪除功能目前為靜態展示'); };
  $('history').onclick = () => toast('下載歷史繳款紀錄尚未串接後端');

  const countInput = $('payment-count');
  const clampCount = () => {
    if (!countInput) return;
    if (maxCount === 0) {
      countInput.value = '';
      return;
    }
    const raw = countInput.value.trim();
    if (raw === '') return;
    const val = parseInt(raw, 10);
    if (!Number.isFinite(val) || val < 1) countInput.value = 1;
    else if (val > maxCount) countInput.value = maxCount;
  };
  if (countInput) {
    countInput.addEventListener('input', clampCount);
    countInput.addEventListener('change', clampCount);
    countInput.addEventListener('blur', clampCount);
  }

  setupCustomSelect('trigger-start-month', 'options-start-month', 'payment-start-month', 'text-start-month');
  setupCustomSelect('trigger-amount', 'options-amount', 'payment-amount', 'text-amount');

  // 若無既有繳款資料、切換起始月份時，同步更新次數上限 (12 - 起始月份 + 1)
  const startMonthOptions = $('options-start-month');
  if (startMonthOptions && countInput) {
    startMonthOptions.querySelectorAll('.elegant-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const startMonth = parseInt(opt.dataset.value, 10) || 1;
        maxCount = Math.max(1, 12 - startMonth + 1);
        countInput.max = String(maxCount);
        clampCount();
      });
    });
  }
}

// ==========================================
// 七、事件綁定與初始化啟動
// ==========================================
['heqi', 'xieli'].forEach(sortDropdownByStroke);

$('search').onclick = () => {
  const heqi = $('heqi');
  const xieli = $('xieli');
  let hasError = false;

  if (!heqi.value) { heqi.classList.add('highlight-error'); hasError = true; }
  if (!xieli.value) { xieli.classList.add('highlight-error'); hasError = true; }
  if (hasError) {
    (!heqi.value ? heqi : xieli).focus();
    return;
  }

  withButtonLoading('search', () => {
    dataReady.then(() => {
      activeKey = getKey();
      filtered = getSet().rows;
      withTableLoading(render);
    });
  });
};

$('reset').onclick = () => {
  withButtonLoading('reset', () => {
    $('year').value = '2026';
    $('heqi').value = '';
    $('xieli').value = '';
    $('heqi').classList.remove('highlight-error');
    $('xieli').classList.remove('highlight-error');
    document.querySelector('input[value="隊"]').checked = true;
    $('filter-paid-checkbox').checked = false;
    activeKey = '';
    filtered = [];
    render();
  });
};

$('total').onclick = () => {
  const heqi = $('heqi');
  const year = $('year').value;
  if (!heqi.value) {
    heqi.classList.add('highlight-error');
    heqi.focus();
    return;
  }

  withButtonLoading('total', () => {
    dataReady.then(() => {
      const heqiValue = heqi.value;
      const summary = {
        隊: { total: 0, subgroups: [] },
        組: { total: 0, subgroups: [] }
      };

      Object.keys(records).forEach(k => {
        const [y, h, xieli, unit] = k.split('|');
        if (y === year && h === heqiValue && summary[unit]) {
          const amount = records[k].rows.reduce((sum, r) => sum + total(r), 0);
          if (amount > 0) {
            summary[unit].total += amount;
            const existing = summary[unit].subgroups.find(s => s.name === xieli);
            if (existing) existing.amount += amount;
            else summary[unit].subgroups.push({ name: xieli, amount });
          }
        }
      });

      const buildSubSection = unit => {
        const subs = summary[unit].subgroups;
        if (!subs.length) return '';
        const itemsHtml = subs.map(sub => `<a class="sub-link" data-unit="${unit}" data-xieli="${sub.name}" style="display:flex;align-items:center;justify-content:flex-start;width:100%;text-align:left;"><span class="bullet" style="display:inline-block;color:#0869ed;margin-right:8px;font-size:16px;line-height:1;">•</span><span class="sub-name" style="text-decoration:underline;">${sub.name}</span><strong class="sub-amt" style="margin-left:auto;color:#14264b;font-weight:700;">${money(sub.amount)}</strong></a>`).join('');
        return `<div class="summary-sub-container" style="padding:0 16px 16px;text-align:left;"><div class="sub-list" style="display:flex;flex-direction:column;gap:12px;border-top:1px dashed #d1d9e6;padding-top:16px;">${itemsHtml}</div></div>`;
      };

      const content = `
        <div class="total-summary">
          <div class="summary-item">
            <div class="summary-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px;">
              <span class="summary-label">和氣 (隊) 總額：</span>
              <strong class="summary-amount">${money(summary['隊'].total)}</strong>
            </div>
            ${buildSubSection('隊')}
          </div>
          <div class="summary-item" style="margin-top:16px;">
            <div class="summary-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px;">
              <span class="summary-label">和氣 (組) 總額：</span>
              <strong class="summary-amount">${money(summary['組'].total)}</strong>
            </div>
            ${buildSubSection('組')}
          </div>
        </div>
      `;

      modal('和氣總金額', content, '<button class="btn" id="total-close">關閉</button>');
      $('total-close').onclick = hideModal;

      document.querySelectorAll('.sub-link').forEach(link => {
        link.onclick = e => {
          e.preventDefault();
          $('xieli').value = link.dataset.xieli;
          document.querySelector(`input[name="unit"][value="${link.dataset.unit}"]`).checked = true;
          hideModal();
          $('search').click();
        };
      });
    });
  });
};

window.CTA.registerModalEsc('overlay', () => {
  if (typeof window.__searchIncomeRequestClose === 'function') {
    window.__searchIncomeRequestClose();
  } else {
    hideModal();
  }
});

window.CTA.bindFormLeaveGuard({
  isActive: () => {
    return typeof window.__searchIncomeIsModalDirty === 'function'
      ? Boolean(window.__searchIncomeIsModalDirty())
      : false;
  }
});

$('submit').onclick = () => {
  if (!activeKey || getTableState() !== '待修正') return;
  const y = $('year').value;
  const h = $('heqi').value;
  const heqiSets = getHeqiSets(y, h);

  window.CTA.confirm(
    `您確定送審「${h}」嗎？<br>送審後，表單將送往「待審核」。`,
    { title: '確認送審', okClass: 'btn primary', okText: '確認送審' },
    () => {
      heqiSets.forEach(s => { s.submitted = true; });
      withTableLoading(render);
    }
  );
};

// 查詢條件異動監聽（統一不重複）
$('heqi').addEventListener('change', e => {
  e.target.classList.remove('highlight-error');
  const xieli = $('xieli');
  if (!xieli.value) {
    xieli.classList.add('highlight-error');
    xieli.focus();
  }
});

$('xieli').addEventListener('change', e => {
  e.target.classList.remove('highlight-error');
});

// $('year').addEventListener('change', ...); // 移除自動清空邏輯

document.querySelectorAll('input[name="unit"]').forEach(radio => {
  radio.onchange = () => {
    // 移除自動清空與渲染，僅保留狀態變更。
    // 使用者需點擊「搜尋」按鈕才會撈取資料
  };
});

// 分頁與篩選監聽
$('page-prev').onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    render();
  }
};

$('page-next').onclick = () => {
  const itemsPerPage = parseInt($('per-page-select').value, 10) || 20;
  const displayCount = $('filter-paid-checkbox').checked ? filtered.filter(r => total(r) > 0).length : filtered.length;
  const totalPages = Math.ceil(displayCount / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    render();
  }
};

$('filter-paid-checkbox').addEventListener('change', () => {
  currentPage = 1;
  withTableLoading(render, 150);
});

$('per-page-select').onchange = () => {
  currentPage = 1;
  withTableLoading(render, 300);
};

// 彈窗與下拉選單全域關閉事件
$('leave').onclick = () => {};
$('close').onclick = () => {
  if (typeof window.__searchIncomeRequestClose === 'function') {
    window.__searchIncomeRequestClose();
  } else {
    hideModal();
  }
};
// 取消點擊灰色背景關閉彈窗： $('overlay').addEventListener('click', e => { if (e.target === $('overlay')) hideModal(); });

document.addEventListener('click', () => {
  document.querySelectorAll('.elegant-select-options').forEach(el => el.classList.add('hidden'));
});

render();
})();
