document.addEventListener("DOMContentLoaded", () => {
  const { $, toast } = window.CTA;
  const money = n => 'NT$ ' + window.CTA.money(n);
  
  const toTimestampMs = (dateStr) => {
    if (!dateStr) return 0;
    const parsed = Date.parse(dateStr.split('/').join('-'));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  let heqiData = [];
  let unitOverridesMap = {};

  const syncGroupSpouseCharity = (memberObj, teamMembers = []) => {
    if (!memberObj || memberObj.charity) return;
    const sp = String(memberObj.spouseId || '').trim();
    if (sp && sp.includes('/')) {
      const charityPart = sp.split('/')[1].trim();
      if (charityPart && charityPart !== '—') {
        memberObj.charity = charityPart;
        return;
      }
    }
    if (memberObj.member && Array.isArray(teamMembers)) {
      const matched = teamMembers.find(t => t.member === memberObj.member && t.charity);
      if (matched) memberObj.charity = matched.charity;
    }
  };

  const unitRecordsMap = {};
  const indexUnitRecords = (list) => {
    const entries = Array.isArray(list) ? list : [];
    const teamByYearHeqi = {};
    entries.forEach(entry => {
      if (entry.unit === '隊') {
        const yh = `${String(entry.year || '2026')}|${entry.heqi}`;
        if (!teamByYearHeqi[yh]) teamByYearHeqi[yh] = [];
        teamByYearHeqi[yh].push(...(Array.isArray(entry.rows) ? entry.rows : []));
      }
    });
    entries.forEach(entry => {
      const y = String(entry.year || '2026');
      const key = `${y}|${entry.heqi}|${entry.xieli}|${entry.unit}`;
      const rows = Array.isArray(entry.rows) ? entry.rows : [];
      if (entry.unit === '組') {
        const teamRows = teamByYearHeqi[`${y}|${entry.heqi}`] || [];
        rows.forEach(r => syncGroupSpouseCharity(r, teamRows));
      }
      unitRecordsMap[key] = rows;
    });
  };
  const reviewDataReady = Promise.all([
    fetch('json/review_data.json?v=346', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).catch(() => null),
    fetch('json/data.json?v=346', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).catch(() => null)
  ]).then(([revJson, unitList]) => {
    if (revJson && Array.isArray(revJson.heqiList)) {
      heqiData = revJson.heqiList.map(item => ({
        ...item,
        updatedAt: item.updatedAtStr ? toTimestampMs(item.updatedAtStr) : (item.updatedAt || 0)
      }));
    }
    if (revJson && revJson.unitOverrides && typeof revJson.unitOverrides === 'object') {
      unitOverridesMap = revJson.unitOverrides;
    }
    if (Array.isArray(unitList)) {
      indexUnitRecords(unitList);
    }
  });

  let currentMasterRecords = [];
  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentMasterRecords)
  });

  const renderTable = (data) => {
    const tbody = $('master-tbody');
    const visibleData = (Array.isArray(data) ? data : []).filter(r => r.status !== 'draft');
    if (visibleData.length === 0) {
      currentMasterRecords = [];
      tbody.innerHTML = `<tr><td colspan="8" class="empty">查無符合條件的資料</td></tr>`;
      pager.render(0, 1, 1);
      return;
    }

    // 依更新時間（精確至毫秒）由新到舊排序，無更新時間者排在最下面
    visibleData.sort((a, b) => {
      const ta = a.updatedAt || 0;
      const tb = b.updatedAt || 0;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb - ta;
    });

    currentMasterRecords = visibleData;
    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(visibleData.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = visibleData.slice(startIndex, startIndex + itemsPerPage);
    pager.render(visibleData.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map(r => `
      <tr>
        <td>${r.name}</td>
        <td class="center"><span class="status-badge ${r.status}">${r.statusText}</span></td>
        <td class="center" style="color: #556477;">${r.date || '<span class="blank">—</span>'}</td>
        <td class="num-col">${r.people > 0 ? r.people : '<span class="blank">0</span>'}</td>
        <td class="num-col">${r.teamAmount > 0 ? money(r.teamAmount) : '<span class="blank">NT$ 0</span>'}</td>
        <td class="num-col">${r.groupAmount > 0 ? money(r.groupAmount) : '<span class="blank">NT$ 0</span>'}</td>
        <td class="num-col">${r.amount > 0 ? money(r.amount) : '<span class="blank">NT$ 0</span>'}</td>
        <td class="center">
          <button type="button" class="btn primary small review-btn" data-id="${r.id}" data-name="${r.name}" data-status="${r.status}" data-statustext="${r.statusText}">詳細</button>
        </td>
      </tr>
    `).join('');

    // 綁定審核按鈕
    document.querySelectorAll('.review-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        openReviewModal(e.target.dataset);
      });
    });
  };

  // 初始渲染 (預設不載入資料，需等待選擇)
  $('master-tbody').innerHTML = `<tr><td colspan="8" class="empty">請選擇條件搜尋</td></tr>`;

  reviewDataReady.then(() => {
    // 若從編輯頁點擊「待審核」導轉過來，同步最新送審資訊並自動依網址參數撈出對應狀態資料
    try {
      const syncRaw = sessionStorage.getItem('cta_pending_sync');
      if (syncRaw) {
        const syncData = JSON.parse(syncRaw);
        const targetItem = heqiData.find(d => d.year === String(syncData.year) && d.name === syncData.name);
        if (targetItem && syncData.amount > 0) {
          targetItem.status = 'pending';
          targetItem.statusText = '待審核';
          targetItem.people = syncData.people;
          targetItem.teamAmount = syncData.teamAmount;
          targetItem.groupAmount = syncData.groupAmount;
          targetItem.amount = syncData.amount;
        }
        sessionStorage.removeItem('cta_pending_sync');
      }
    } catch (_) {}

    const urlParams = new URLSearchParams(window.location.search);
    const paramYear = urlParams.get('year');
    const paramStatus = urlParams.get('status');

    if (paramYear && Array.from($('filter-year').options).some(o => o.value === paramYear)) {
      $('filter-year').value = paramYear;
    }

    if (paramStatus && Array.from($('filter-status').options).some(o => o.value === paramStatus)) {
      $('filter-status').value = paramStatus;
      $('filter-status').classList.remove('highlight-error');
      const yearFilter = $('filter-year').value;
      let initialFiltered = heqiData.filter(d => d.year === yearFilter && d.status !== 'draft');
      if (paramStatus !== 'all') {
        initialFiltered = initialFiltered.filter(d => d.status === paramStatus);
      }
      pager.setPage(1);
      renderTable(initialFiltered);
    }
  });

  // 搜尋功能
  $('btn-search').addEventListener('click', async () => {
    const statusSelect = $('filter-status');
    if (!statusSelect.value) {
      statusSelect.classList.add('highlight-error');
      statusSelect.focus();
      return;
    }
    await reviewDataReady;
    
    $('table-loading').classList.remove('hidden');
    setTimeout(() => {
      const statusFilter = statusSelect.value;
      const yearFilter = $('filter-year').value;
      let filtered = heqiData.filter(d => d.year === yearFilter && d.status !== 'draft');
      if(statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(d => d.status === statusFilter);
      }
      pager.setPage(1);
      renderTable(filtered);
      $('table-loading').classList.add('hidden');
    }, 300);
  });

  // 選擇改變時，移除紅框
  $('filter-status').addEventListener('change', (e) => {
    e.target.classList.remove('highlight-error');
  });

  // 清除功能
  $('btn-reset').addEventListener('click', () => {
    $('filter-year').value = '2026';
    $('filter-status').value = '';
    $('filter-status').classList.remove('highlight-error');
    if (window.location.search && window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // 預設清空後，表格資料呈現清空狀態 (直到使用者再次選擇並搜尋)
    currentMasterRecords = [];
    pager.setPage(1);
    pager.render(0, 1, 1);
    $('master-tbody').innerHTML = `<tr><td colspan="8" class="empty">請選擇條件搜尋</td></tr>`;
  });

  // ========== 審核彈窗邏輯 ==========
  let currentReviewId = null;
  let activeDetailTab = 'team';

  const tabs = document.querySelectorAll('.tab');
  const tableGroup = $('tbody-group');
  const tableTeam = $('tbody-team');
  const filterCheckbox = $('filter-paid');

  const updateKpiDisplay = () => {
    const item = heqiData.find(d => d.id === currentReviewId);
    $('kpi-total').textContent = money(item ? item.amount : 0);
    $('kpi-team-amount').textContent = money(item ? item.teamAmount : 0);
    $('kpi-group-amount').textContent = money(item ? item.groupAmount : 0);
  };

  const toggleRows = () => {
    const isChecked = filterCheckbox.checked;
    [tableTeam, tableGroup].forEach(tbl => {
      tbl.querySelectorAll('.no-payment').forEach(row => {
        row.classList.toggle('hidden', isChecked);
      });
      tbl.querySelectorAll('.has-payment').forEach(row => {
        row.classList.remove('hidden');
      });
      const emptyRow = tbl.querySelector('.empty-row');
      if (emptyRow) {
        const visibleDataRows = tbl.querySelectorAll('tr:not(.empty-row):not(.hidden)').length;
        emptyRow.classList.toggle('hidden', visibleDataRows > 0);
      }
    });
  };
  filterCheckbox.addEventListener('change', toggleRows);

  const setRowState = (row, count, amount, members = []) => {
    if (!row) return;
    row.cells[1].textContent = String(count);
    row.cells[3].textContent = money(amount);
    row.dataset.members = JSON.stringify(members);
    if (amount > 0) {
      row.classList.remove('no-payment');
      row.classList.add('has-payment');
      row.cells[3].style.color = 'var(--blue)';
    } else {
      row.classList.remove('has-payment');
      row.classList.add('no-payment');
      row.cells[3].style.color = '#6a7994';
    }
  };


  const compareIdAsc = (aVal, bVal) => {
    const sa = String(aVal || '').trim();
    const sb = String(bVal || '').trim();
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb, 'en', { numeric: true });
  };

  const sortMembersByUnit = (members, unitType) => {
    const field = unitType === '隊' ? 'charity' : 'member';
    return [...members].sort((a, b) => compareIdAsc(a[field], b[field]));
  };

  const parseUnitLabel = (label) => {
    const unitPattern = new RegExp('^(.+?)\\s*\\(([隊組])\\)$');
    const m = label.match(unitPattern);
    return m ? { xieli: m[1].trim(), unit: m[2] } : { xieli: label, unit: '組' };
  };

  const buildUnitMembersList = (year, heqiName, unitLabel, totalCount, paidOverrides) => {
    const { xieli, unit } = parseUnitLabel(unitLabel);
    const key = `${year}|${heqiName}|${xieli}|${unit}`;
    const sourceRows = unitRecordsMap[key];

    if (Array.isArray(sourceRows) && sourceRows.length > 0) {
      return sortMembersByUnit(sourceRows.map((r, idx) => {
        const payments = Array.isArray(r.payments) ? r.payments : [];
        const unposted = payments.filter(p => !p.ledgerDate);
        const postedCount = payments.filter(p => p.ledgerDate).length;
        const paidCount = typeof r.paid === 'number' ? r.paid : postedCount;
        const currentTimes = unposted.length;
        const currentAmt = unposted.reduce((s, p) => s + Number(p.amount || 0), 0);
        return {
          id: r.id || (idx + 1),
          name: r.name || '慈濟人',
          member: r.member || '',
          charity: r.charity || '',
          paid: paidCount,
          times: currentTimes,
          amount: currentAmt,
          certYear: r.certYear || (r.charity === '02410' ? '1997' : '2010'),
          dharmaName: r.dharmaName || (r.charity === '02410' ? '本馨' : '—'),
          alive: r.alive || '存',
          spouseId: r.spouseId || '— / —',
          spouseName: r.spouseName || '—',
          spouseDharma: r.spouseDharma || '—',
          spouseAlive: r.spouseAlive || '—',
          remark: r.remark || '',
          payments: payments
        };
      }), unit);
    }

    // 其他模擬單位：依總人數與已繳明細補足完整會員列表
    const count = Math.max(Number(totalCount) || 20, paidOverrides.length);
    const list = [];
    const baseCode = (heqiName.charCodeAt(0) * 100 + xieli.charCodeAt(xieli.length - 1) * 10) % 70000 + 10000;

    paidOverrides.forEach((ov, i) => {
      const monthlyFee = ov.times > 0 ? Math.round(ov.amount / ov.times) : 200;
      const startM = 12 - ov.times + 1;
      const genPayments = Array.from({ length: ov.times }, (_, k) => ({
        month: Math.max(1, startM + k),
        amount: monthlyFee,
        date: ov.date || `${year}/11/10`,
        settleDate: `${year}/12/31`,
        ledgerDate: ''
      }));
      list.push({
        id: i + 1,
        name: ov.name || '慈濟人',
        member: ov.member || '',
        charity: ov.charity || '',
        paid: 0,
        times: ov.times || 0,
        amount: ov.amount || 0,
        certYear: '2010',
        dharmaName: '—',
        alive: '存',
        spouseId: '— / —',
        spouseName: '—',
        spouseDharma: '—',
        spouseAlive: '—',
        remark: '',
        payments: genPayments
      });
    });

    for (let i = paidOverrides.length; i < count; i++) {
      const seq = i + 1;
      const codeStr = String(baseCode + seq).padStart(5, '0');
      list.push({
        id: seq,
        name: seq <= 9 ? '慈濟人' : `測試人員${seq}`,
        member: unit === '組' ? codeStr : '',
        charity: unit === '隊' ? codeStr : '',
        paid: 0,
        times: 0,
        amount: 0,
        certYear: '2010',
        dharmaName: '—',
        alive: '存',
        spouseId: '— / —',
        spouseName: '—',
        spouseDharma: '—',
        spouseAlive: '—',
        remark: '',
        payments: []
      });
    }
    return sortMembersByUnit(list, unit);
  };

  const openMemberDetailModal = (member, ctx) => {
    $('member-detail-title').textContent = `${ctx.year} 年度｜${ctx.heqiName} - ${ctx.unitLabel}（${member.name}）`;
    const payments = Array.isArray(member.payments) ? member.payments : [];
    const sortedPaymentsHtml = [...payments]
      .sort((a, b) => Number(a.month) - Number(b.month))
      .map(p => `<tr style="border-bottom: 1px solid #ecf0f6;">
        <td style="padding:12px 16px;">${p.month} 月</td>
        <td style="padding:12px 16px; color:#3d5176;">${p.date || ''}</td>
        <td style="padding:12px 16px; color:#3d5176;">${p.settleDate || ''}</td>
        <td style="padding:12px 16px; color:#3d5176;">${p.ledgerDate || ''}</td>
        <td class="num-col" style="padding:12px 16px;">${money(p.amount)}</td>
      </tr>`)
      .join('') || '<tr><td colspan="5" class="empty" style="padding:30px; text-align:center; color:#5c6b7d;">目前尚無繳款紀錄</td></tr>';

    const safeRemark = (member.remark || '').split('"').join('&quot;');
    $('member-detail-body').innerHTML = `
      <div style="font-size: 15px; color: #122a55; font-weight: 700; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #c9d8eb; display: flex; align-items: center; gap: 6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a6b9c" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        基本資料
      </div>
      <div class="detail-grid" style="gap: 6px 8px; margin-bottom: 16px;">
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">年度</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${ctx.year}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">受證年度</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.certYear || '2010'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">和氣名稱</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${ctx.heqiName}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">組別名稱</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${ctx.unitLabel}</div></div>

        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">委員 (委員號)</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.member || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">姓名</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.name}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">法號</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.dharmaName || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">存歿</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.alive || '存'}</div></div>

        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶委員 (慈誠號)</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.charity || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶姓名</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.spouseName || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶法號</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.spouseDharma || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶存歿</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:14px;">${member.spouseAlive || '—'}</div></div>
      </div>

      <div style="margin-bottom: 18px;">
        <label style="display:block; color:#3d5176; margin-bottom:4px; font-size:14px; font-weight:700;">備註：</label>
        <input type="text" class="remark-input" disabled placeholder="無備註內容" value="${safeRemark}">
      </div>

      <div>
        <div style="font-size: 15px; color: #122a55; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #c9d8eb; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4291" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            繳款明細
          </div>
          <span style="font-size: 13px; color: #556477; font-weight: 500;">已繳 ${member.paid} 次 ／ 本次繳交 ${member.times} 次</span>
        </div>
        <div class="table-scroll" style="margin:0; border-radius:6px; overflow-x:auto;">
          <table class="detail-table">
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
    `;
    $('member-detail-modal').classList.remove('hidden');
  };

  const closeMemberDetail = () => $('member-detail-modal').classList.add('hidden');
  $('close-member-detail').addEventListener('click', closeMemberDetail);
  $('btn-member-detail-ok').addEventListener('click', closeMemberDetail);

  let currentUnitMembers = [];
  let currentUnitContext = null;

  const renderUnitMembersTable = () => {
    const onlyPaid = $('unit-filter-paid').checked;
    const list = onlyPaid ? currentUnitMembers.filter(m => m.amount > 0) : currentUnitMembers;
    const tbody = $('unit-detail-tbody');

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">查無符合條件的資料</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((m, idx) => {
      const origIndex = currentUnitMembers.indexOf(m);
      const amtStyle = m.amount > 0 ? 'color:var(--blue); font-weight:600;' : 'color:#6a7994;';
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td>${m.name}</td>
          <td>${m.member || '<span class="blank">—</span>'}</td>
          <td>${m.charity || '<span class="blank">—</span>'}</td>
          <td class="center">${m.paid}</td>
          <td class="center">${m.times}</td>
          <td class="num-col" style="${amtStyle}">${money(m.amount)}</td>
          <td class="center"><button type="button" class="btn primary small member-detail-btn" data-index="${origIndex}">詳細</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.member-detail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memberIdx = parseInt(e.currentTarget.dataset.index, 10);
        const member = currentUnitMembers[memberIdx];
        if (member && currentUnitContext) {
          openMemberDetailModal(member, currentUnitContext);
        }
      });
    });
  };

  $('unit-filter-paid').addEventListener('change', renderUnitMembersTable);

  const openUnitDetailModal = (row) => {
    const item = heqiData.find(d => d.id === currentReviewId);
    const year = item ? item.year : $('filter-year').value;
    const heqiName = item ? item.name : '';
    const unitLabel = row.cells[0].textContent.trim();
    const paidCount = row.cells[1].textContent.trim();
    const totalCount = row.cells[2].textContent.trim();
    const amtText = row.cells[3].textContent.trim();
    const paidOverrides = JSON.parse(row.dataset.members || '[]');

    currentUnitContext = { year, heqiName, unitLabel };
    currentUnitMembers = buildUnitMembersList(year, heqiName, unitLabel, totalCount, paidOverrides);

    $('unit-detail-title').textContent = `${year} 年度｜${heqiName} - ${unitLabel}`;
    $('unit-detail-people').textContent = `${paidCount} / ${currentUnitMembers.length}`;
    $('unit-detail-amount').textContent = amtText;
    $('unit-filter-paid').checked = false;

    renderUnitMembersTable();
    $('unit-detail-modal').classList.remove('hidden');
  };

  const closeUnitDetail = () => $('unit-detail-modal').classList.add('hidden');
  $('close-unit-detail').addEventListener('click', closeUnitDetail);
  $('btn-unit-detail-ok').addEventListener('click', closeUnitDetail);

  [tableTeam, tableGroup].forEach(tbl => {
    tbl.querySelectorAll('tr:not(.empty-row) button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row) openUnitDetailModal(row);
      });
    });
  });

  const openReviewModal = (dataset) => {
    currentReviewId = parseInt(dataset.id, 10);
    const item = heqiData.find(d => d.id === currentReviewId);
    const modalYear = item ? item.year : $('filter-year').value;
    $('modal-title').textContent = `${modalYear} 年度｜${dataset.name} - 收入明細審核`;
    
    const badge = $('modal-status-badge');
    badge.className = `status-badge ${dataset.status}`;
    badge.textContent = dataset.statustext;

    // 預設切回「隊」頁籤
    activeDetailTab = 'team';
    tabs.forEach(t => t.classList.toggle('active', t.dataset.target === 'team'));
    tableTeam.classList.remove('hidden');
    tableGroup.classList.add('hidden');

    const btnApprove = $('btn-modal-approve');
    const btnReject = $('btn-modal-reject');
    const remark = $('remark');
    const tDate = $('transfer-date');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    tDate.value = `${yyyy}-${mm}-${dd}`;
    
    const isDraft = dataset.status === 'draft';
    updateKpiDisplay();

    // 依各單位實際隊/組金額與人數配置明細列（總和與外層列表及 KPI 完全一致）
    const teamRows = tableTeam.querySelectorAll('tr:not(.empty-row)');
    const groupRows = tableGroup.querySelectorAll('tr:not(.empty-row)');
    teamRows.forEach(r => setRowState(r, 0, 0, []));
    groupRows.forEach(r => setRowState(r, 0, 0, []));

    if (!isDraft && item) {
      const ov = unitOverridesMap[`${item.year}|${item.name}`];
      if (ov) {
        (ov.team || []).forEach(entry => {
          setRowState(teamRows[entry.rowIndex], entry.people, entry.amount, entry.members || []);
        });
        (ov.group || []).forEach(entry => {
          setRowState(groupRows[entry.rowIndex], entry.people, entry.amount, entry.members || []);
        });
      } else {
        setRowState(teamRows[0], item.people, item.teamAmount, []);
        if (item.groupAmount > 0) setRowState(groupRows[0], 1, item.groupAmount, []);
      }
    }
    toggleRows();

    if(dataset.status === 'pending') {
      btnApprove.style.display = 'inline-flex';
      btnReject.style.display = 'inline-flex';
      remark.value = '';
      remark.placeholder = '可選填備註...';
      remark.disabled = false;
    } else if (dataset.status === 'approved') {
      btnApprove.style.display = 'none';
      btnReject.style.display = 'none';
      const rawDate = item ? (item.date || item.updatedAtStr || '') : '';
      const approvedDate = rawDate ? rawDate.split(' ')[0] : '';
      remark.value = (item && item.remark)
        ? item.remark
        : (approvedDate ? `已於 ${approvedDate} 由王4核可。` : '已由王4核可。');
      remark.disabled = true;
    } else if (dataset.status === 'revise') {
      btnApprove.style.display = 'none';
      btnReject.style.display = 'none';
      const rawDate = item ? (item.date || item.updatedAtStr || '') : '';
      const reviseDate = rawDate ? rawDate.split(' ')[0] : '';
      remark.value = (item && item.remark)
        ? item.remark
        : (reviseDate ? `${reviseDate} 已由王4退回修正。` : '已由王4退回修正。');
      remark.disabled = true;
    } else {
      btnApprove.style.display = 'none';
      btnReject.style.display = 'none';
      remark.value = '';
      remark.placeholder = '尚未送出編輯資料';
      remark.disabled = true;
    }

    $('review-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // 防止背景滾動
  };

  const closeReviewModal = () => {
    $('review-modal').classList.add('hidden');
    document.body.style.overflow = '';
  };
  $('close-review').addEventListener('click', closeReviewModal);
  $('btn-modal-close').addEventListener('click', closeReviewModal);

  // 頁籤切換（同步更新 (隊) 總金額 / (組) 總金額）
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeDetailTab = tab.dataset.target;
      if(activeDetailTab === 'group') {
        tableGroup.classList.remove('hidden');
        tableTeam.classList.add('hidden');
      } else {
        tableTeam.classList.remove('hidden');
        tableGroup.classList.add('hidden');
      }
      updateKpiDisplay();
      toggleRows();
    });
  });


  // 取得現在時間：顯示用 (YYYY/MM/DD HH:mm) 與排序記錄用（精確至毫秒）
  let lastRecordedMs = 0;
  const getNowRecord = () => {
    heqiData.forEach(h => {
      if (h && typeof h.updatedAt === 'number' && h.updatedAt > lastRecordedMs) {
        lastRecordedMs = h.updatedAt;
      }
    });
    const d = new Date();
    const rawMs = d.getTime();
    const updatedAt = rawMs <= lastRecordedMs ? lastRecordedMs + 1 : rawMs;
    lastRecordedMs = updatedAt;
    const precise = new Date(updatedAt);
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const display = `${precise.getFullYear()}/${pad(precise.getMonth()+1)}/${pad(precise.getDate())} ${pad(precise.getHours())}:${pad(precise.getMinutes())}`;
    const fullMs = `${display}:${pad(precise.getSeconds())}.${pad(precise.getMilliseconds(), 3)}`;
    return { display, fullMs, updatedAt };
  };

  window.CTA.registerModalEsc('review-modal', closeReviewModal);
  window.CTA.registerModalEsc('unit-detail-modal', closeUnitDetail);
  window.CTA.registerModalEsc('member-detail-modal', closeMemberDetail);

  // 核可
  $('btn-modal-approve').addEventListener('click', () => {
    const item = heqiData.find(d => d.id === currentReviewId);
    if (!item) return;

    window.CTA.confirm(
      `您確定核可「${item.name}」嗎？<br>核可後，表單將送往「待列帳」。`,
      { title: '確認核可', okClass: 'btn btn-approve', okText: '✓ 核可' },
      () => {
        const remarkVal = $('remark').value.trim();
        const nowRec = getNowRecord();
        item.status = 'approved';
        item.statusText = '待列帳';
        item.date = nowRec.display;
        item.fullDate = nowRec.fullMs;
        item.updatedAt = nowRec.updatedAt;
        item.remark = remarkVal || `已於 ${item.date} 由王4核可。`;

        toast('已成功核可該筆收入明細並送交列帳。');
        closeReviewModal();
        $('btn-search').click();
      }
    );
  });

  // 退回 (不核可)
  $('btn-modal-reject').addEventListener('click', () => {
    const item = heqiData.find(d => d.id === currentReviewId);
    if (!item) return;

    window.CTA.confirm(
      `您確定不核可「${item.name}」嗎？<br>不核可後，表單將退回「待修正」。`,
      { title: '確認不核可', okClass: 'btn btn-reject', okText: '✕ 不核可' },
      () => {
        const remarkVal = $('remark').value.trim();
        const nowRec = getNowRecord();
        item.status = 'revise';
        item.statusText = '待修正';
        item.date = nowRec.display;
        item.fullDate = nowRec.fullMs;
        item.updatedAt = nowRec.updatedAt;
        item.remark = remarkVal || `${item.date} 已由王4退回修正。`;

        toast('已將該筆明細退回給建立者。');
        closeReviewModal();
        $('btn-search').click();
      }
    );
  });

});
