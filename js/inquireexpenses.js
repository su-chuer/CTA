document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, money, escapeAttr, alert: openAlertModal } = window.CTA;

  let inquireDatasets = {};
  let expenseItemsByCategory = { '活動金': [], '聯誼金': [] };
  let heqiOptions = [];
  let activeHeqiKey = '';
  let currentRenderedRecords = [];

  const populateItemOptions = (catVal) => {
    const itemSelect = $('filter-item');
    const actItems = Array.isArray(expenseItemsByCategory['活動金']) ? expenseItemsByCategory['活動金'] : [];
    const felItems = Array.isArray(expenseItemsByCategory['聯誼金']) ? expenseItemsByCategory['聯誼金'] : [];

    let list = [];
    if (catVal === '活動金') list = actItems;
    else if (catVal === '聯誼金') list = felItems;
    else list = Array.from(new Set([...actItems, ...felItems]));

    itemSelect.innerHTML = `<option value="全部" selected>全部</option>` +
      list.map(name => `<option value="${name}">${name}</option>`).join('');
  };

  const dataReady = fetch('json/inquire_expenses_data.json?v=346', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : null)
    .then(json => {
      if (json && typeof json === 'object') {
        if (json.inquireDatasets && typeof json.inquireDatasets === 'object') {
          inquireDatasets = json.inquireDatasets;
          heqiOptions = Object.keys(inquireDatasets);
        }
        if (json.expenseItemsByCategory && typeof json.expenseItemsByCategory === 'object') {
          expenseItemsByCategory = json.expenseItemsByCategory;
        }
      }
      const checkedCat = document.querySelector('input[name="expense-category"]:checked');
      populateItemOptions(checkedCat ? checkedCat.value : '全部');
    })
    .catch(err => {
      console.error('讀取 json/inquire_expenses_data.json 失敗：', err);
      inquireDatasets = {};
      heqiOptions = [];
    });

  document.querySelectorAll('input[name="expense-category"]').forEach(radio => {
    radio.addEventListener('change', (e) => populateItemOptions(e.target.value));
  });

  // ==================== 詳細資料彈窗 ====================
  const closeDetailModal = () => $('detail-modal').classList.add('hidden');
  $('close-detail').addEventListener('click', closeDetailModal);
  $('btn-detail-close').addEventListener('click', closeDetailModal);
  window.CTA.registerModalEsc('detail-modal', closeDetailModal);

  const eitherOrFieldIds = ['filter-heqi', 'filter-keyword'];
  const clearEitherOrErrors = () => eitherOrFieldIds.forEach(fid => $(fid).classList.remove('highlight-error'));
  const markEitherOrErrors = () => eitherOrFieldIds.forEach(fid => $(fid).classList.add('highlight-error'));

  const openDetailModal = (record) => {
    if (!record) return;
    const heqiKeyForRec = record._heqiKey || activeHeqiKey || '';
    const parts = heqiKeyForRec.split(' ').filter(Boolean);
    const groupName = record.groupName || parts[0] || '';
    const groupCode = parts[1] || '';

    $('detail-modal-title').textContent = `支出管理 / 活動、聯誼金支出查詢 / ${record.type}明細（${record.name}）`;

    const isActivity = record.type === '活動金';
    const itemsRowsHtml = (record.items || []).map(it => `
      <tr>
        <td>${it.name}</td>
        <td class="num-col">${money(it.amount)}</td>
      </tr>
    `).join('') || `<tr><td colspan="2" class="empty">無品項細項資料</td></tr>`;

    const specificHtml = isActivity
      ? `
        <div class="claim-grid-4">
          <div class="claim-field">
            <label>組別名稱</label>
            <input type="text" class="claim-control" value="${groupName}" readonly>
          </div>
          <div class="claim-field">
            <label>組別代碼</label>
            <input type="text" class="claim-control" value="${groupCode}" readonly>
          </div>
          <div class="claim-field">
            <label>活動別</label>
            <input type="text" class="claim-control" value="${record.activityName || record.name || ''}" readonly>
          </div>
          <div class="claim-field">
            <label>活動日期</label>
            <input type="text" class="claim-control" value="${record.activityDate || record.applyDate || ''}" readonly>
          </div>
        </div>
        <div class="table-scroll">
          <table class="detail-table" id="claim-items-table">
            <thead>
              <tr>
                <th>品項名稱</th>
                <th class="num-col">金額</th>
              </tr>
            </thead>
            <tbody>${itemsRowsHtml}</tbody>
          </table>
        </div>
      `
      : `
        <div class="fellowship-lookup-row">
          <div class="claim-field">
            <label>委員號</label>
            <input type="text" class="claim-control" value="${record.member || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>慈誠號</label>
            <input type="text" class="claim-control" value="${record.charity || '—'}" readonly>
          </div>
        </div>
        <div class="claim-grid-6" style="margin-bottom: 0;">
          <div class="claim-field">
            <label>姓名</label>
            <input type="text" class="claim-control" value="${record.personName || record.name || ''}" readonly>
          </div>
          <div class="claim-field">
            <label>法號</label>
            <input type="text" class="claim-control" value="${record.dharmaName || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>組別名稱</label>
            <input type="text" class="claim-control" value="${groupName}" readonly>
          </div>
          <div class="claim-field">
            <label>組別代碼</label>
            <input type="text" class="claim-control" value="${groupCode}" readonly>
          </div>
          <div class="claim-field">
            <label>項目</label>
            <input type="text" class="claim-control" value="${record.fellowshipItem || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>與申請人關係</label>
            <input type="text" class="claim-control" value="${record.relation || '—'}" readonly>
          </div>
        </div>
      `;

    const safeRemark = escapeAttr(record.remark || '');
    $('detail-modal-body').innerHTML = `
      <div class="claim-grid-6">
        <div class="claim-field">
          <label>作業日期</label>
          <input type="text" class="claim-control" value="${record.processDate || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>填表人</label>
          <input type="text" class="claim-control" value="${record.creator || '蘇2'}" readonly>
        </div>
        <div class="claim-field">
          <label>目前狀態</label>
          <input type="text" class="claim-control" value="${record.status || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>申請日</label>
          <input type="text" class="claim-control" value="${record.applyDate || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>金額</label>
          <input type="text" class="claim-control num-col" value="${money(record.amount)}" readonly>
        </div>
        <div class="claim-field">
          <label>單據 / 張</label>
          <input type="text" class="claim-control" value="${record.receiptCount != null ? record.receiptCount : 0}" readonly>
        </div>
      </div>
      <div class="claim-grid-4">
        <div class="claim-field">
          <label>匯款日</label>
          <input type="text" class="claim-control" value="${record.remitDate || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>列帳日</label>
          <input type="text" class="claim-control" value="${record.ledgerDate || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>支出類別</label>
          <input type="text" class="claim-control" value="${record.type || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>年度</label>
          <input type="text" class="claim-control" value="${record.year || '2026'}" readonly>
        </div>
      </div>
      <div class="claim-field" style="margin-bottom: 18px;">
        <label>備註</label>
        <input type="text" class="claim-control" value="${safeRemark || '無備註內容'}" readonly>
      </div>
      ${specificHtml}
    `;

    $('detail-modal').classList.remove('hidden');
  };

  // ==================== 和氣組別 Combo-box 與分頁 ====================
  const heqiInput = $('filter-heqi');
  const heqiCombo = window.CTA.createComboSelect({
    inputId: 'filter-heqi',
    autoWidth: true,
    wrapId: 'heqi-combo-wrap',
    menuId: 'heqi-combo-menu',
    clearBtnId: 'btn-clear-heqi',
    toggleBtnId: 'btn-toggle-heqi',
    getOptions: () => heqiOptions,
    beforeOpen: () => dataReady,
    emptyText: '無相符和氣組別',
    onSelect: clearEitherOrErrors,
    onInput: clearEitherOrErrors,
    onEnter: () => executeSearch()
  });

  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentRenderedRecords)
  });

  $('filter-keyword').addEventListener('input', clearEitherOrErrors);
  $('filter-keyword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  const getStatusBadgeClass = (status) => {
    if (status === '待審核') return 'pending';
    if (status === '待修正') return 'revise';
    if (status === '新申請') return 'new-apply';
    return 'approved';
  };

  const renderTable = (data) => {
    const tbody = $('inquire-expense-tbody');
    currentRenderedRecords = window.CTA.sortByApplyDateDesc(data);
    if (currentRenderedRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="14" class="empty">查無符合條件的資料</td></tr>`;
      $('result-count-display').textContent = '0';
      $('total-amount-display').textContent = '0';
      pager.render(0, 1, 1);
      return;
    }

    $('result-count-display').textContent = String(currentRenderedRecords.length);
    const totalAmt = currentRenderedRecords.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $('total-amount-display').textContent = money(totalAmt);

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentRenderedRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentRenderedRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentRenderedRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((item, idx) => {
      const badgeClass = getStatusBadgeClass(item.status);
      return `
        <tr>
          <td class="center">${startIndex + idx + 1}</td>
          <td>${item.groupName || '<span class="blank">—</span>'}</td>
          <td>${item.name}</td>
          <td>${item.type}</td>
          <td>${item.applyDate || '<span class="blank">—</span>'}</td>
          <td>${item.processDate || '<span class="blank">—</span>'}</td>
          <td>${item.remitDate || '<span class="blank">—</span>'}</td>
          <td>${item.ledgerDate || '<span class="blank">—</span>'}</td>
          <td>${item.member || '<span class="blank">—</span>'}</td>
          <td>${item.charity || '<span class="blank">—</span>'}</td>
          <td>${item.relation || '<span class="blank">—</span>'}</td>
          <td class="num-col">${money(item.amount)}</td>
          <td class="center"><span class="status-badge ${badgeClass}">${item.status || '已列帳'}</span></td>
          <td class="center"><button type="button" class="btn primary small btn-detail" data-id="${item.id}">詳細</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const record = currentRenderedRecords.find(r => r.id === id);
        if (record) openDetailModal(record);
      });
    });
  };

  const executeSearch = async () => {
    const rawHeqi = cleanTrim(heqiInput.value);
    const rawKeyword = cleanTrim($('filter-keyword').value);

    heqiInput.value = rawHeqi;
    $('filter-keyword').value = rawKeyword;
    clearEitherOrErrors();

    if (!rawHeqi && !rawKeyword) {
      markEitherOrErrors();
      openAlertModal('請選擇「和氣組別」或輸入「快速搜尋」再按搜尋！');
      return;
    }

    const yearVal = $('filter-year').value;
    const checkedCat = document.querySelector('input[name="expense-category"]:checked');
    const catVal = checkedCat ? checkedCat.value : '全部';
    const itemVal = $('filter-item').value || '全部';
    const kwLower = rawKeyword.toLowerCase();
    const actDateRaw = cleanTrim($('filter-activity-date').value);
    const actDateSlash = actDateRaw ? actDateRaw.split('-').join('/') : '';

    heqiCombo.close();
    $('table-loading').classList.remove('hidden');
    await dataReady;

    setTimeout(() => {
      let candidateList = [];
      if (rawHeqi) {
        const matchedKey = window.CTA.resolveOptionKey(rawHeqi, heqiOptions);
        if (!matchedKey) {
          activeHeqiKey = '';
          renderTable([]);
          $('table-loading').classList.add('hidden');
          return;
        }
        activeHeqiKey = matchedKey;
        heqiCombo.setValue(matchedKey);
        candidateList = (inquireDatasets[matchedKey] || []).map(r => ({ ...r, _heqiKey: matchedKey }));
      } else {
        activeHeqiKey = '';
        Object.keys(inquireDatasets).forEach(k => {
          (inquireDatasets[k] || []).forEach(r => candidateList.push({ ...r, _heqiKey: k }));
        });
      }

      const filtered = candidateList.filter(record => {
        if (yearVal && String(record.year || '2026') !== yearVal) return false;
        if (catVal && catVal !== '全部' && record.type !== catVal) return false;

        if (itemVal && itemVal !== '全部') {
          if (record.type === '活動金') {
            const lineItems = Array.isArray(record.items) ? record.items : [];
            if (!lineItems.some(it => it.name === itemVal)) return false;
          } else if (record.fellowshipItem !== itemVal) {
            return false;
          }
        }

        if (kwLower) {
          const hayAll = [
            record.name || '', record.personName || '', record.activityName || '',
            record.member || '', record.charity || ''
          ].join(' ').toLowerCase();
          if (!hayAll.includes(kwLower)) return false;
        }

        if (actDateSlash) {
          const recDate = record.activityDate || record.applyDate || '';
          if (recDate !== actDateSlash) return false;
        }

        return true;
      });

      pager.setPage(1);
      renderTable(filtered);
      $('table-loading').classList.add('hidden');
    }, 220);
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    $('filter-year').value = '2026';
    heqiCombo.setValue('');
    clearEitherOrErrors();
    heqiCombo.close();
    const allRadio = document.querySelector('input[name="expense-category"][value="全部"]');
    if (allRadio) allRadio.checked = true;
    populateItemOptions('全部');
    $('filter-keyword').value = '';
    $('filter-activity-date').value = '';
    activeHeqiKey = '';
    currentRenderedRecords = [];
    pager.setPage(1);
    $('result-count-display').textContent = '0';
    $('total-amount-display').textContent = '0';
    pager.render(0, 1, 1);
    $('inquire-expense-tbody').innerHTML = `<tr><td colspan="14" class="empty">請選擇條件搜尋</td></tr>`;
  });
});
