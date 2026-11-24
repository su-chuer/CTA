document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, money, toast, alert: openAlertModal } = window.CTA;
  const openConfirmModal = (message, okBtnClass = 'btn primary', okBtnText = '確定', onOk = null, title = '操作確認') =>
    window.CTA.confirm(message, { okClass: okBtnClass, okText: okBtnText, title }, onOk);

  let reviewDatasets = {};
  let heqiOptions = [];
  let activeHeqiKey = '';
  let activeCategoryFilter = '全部';
  let selectedReviewIds = new Set();
  let currentDetailId = null;

  const dataReady = fetch('json/review_expenses_data.json?v=347', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : null)
    .then(json => {
      if (json && json.reviewDatasets && typeof json.reviewDatasets === 'object') {
        reviewDatasets = json.reviewDatasets;
        heqiOptions = Object.keys(reviewDatasets);
        if (typeof window.CTA.syncRecordedFloorMs === 'function') {
          window.CTA.syncRecordedFloorMs(Object.values(reviewDatasets).flat());
        }
      }
    })
    .catch(err => {
      console.error('讀取 json/review_expenses_data.json 失敗：', err);
      reviewDatasets = {};
      heqiOptions = [];
    });

  const closeRemarkModal = () => $('remark-modal').classList.add('hidden');
  $('close-remark').addEventListener('click', closeRemarkModal);
  $('btn-remark-ok').addEventListener('click', closeRemarkModal);
  window.CTA.registerModalEsc('remark-modal', closeRemarkModal);

  const closeDetailModal = () => {
    $('detail-modal').classList.add('hidden');
    currentDetailId = null;
  };
  $('close-detail').addEventListener('click', closeDetailModal);
  $('btn-detail-close').addEventListener('click', closeDetailModal);
  window.CTA.registerModalEsc('detail-modal', closeDetailModal);

  // ==================== 和氣組別 Combo-box ====================
  const heqiInput = $('filter-heqi');
  const heqiCombo = window.CTA.createComboSelect({
    inputId: 'filter-heqi',
    wrapId: 'heqi-combo-wrap',
    menuId: 'heqi-combo-menu',
    clearBtnId: 'btn-clear-heqi',
    toggleBtnId: 'btn-toggle-heqi',
    getOptions: () => heqiOptions,
    beforeOpen: () => dataReady,
    emptyText: '無相符和氣組別',
    onEnter: () => executeSearch()
  });

  // ==================== 列表與詳細彈窗渲染 ====================
  const resolveHeqiKey = (rawVal) => window.CTA.resolveOptionKey(rawVal, heqiOptions);

  const getPendingReviewList = (heqiKey, categoryFilter = activeCategoryFilter) => {
    if (!heqiKey) return [];
    const pending = (reviewDatasets[heqiKey] || []).filter(item => item.status === '待審核');
    if (!categoryFilter || categoryFilter === '全部') return pending;
    return pending.filter(item => item.type === categoryFilter);
  };

  const syncCheckAllState = () => {
    const checkAll = $('check-all-review');
    if (!checkAll) return;
    const boxes = Array.from(document.querySelectorAll('#review-expense-tbody .submit-row-checkbox'));
    if (boxes.length === 0) {
      checkAll.disabled = true;
      checkAll.checked = false;
      checkAll.indeterminate = false;
      return;
    }
    checkAll.disabled = false;
    const checkedCount = boxes.filter(cb => cb.checked).length;
    checkAll.checked = checkedCount === boxes.length;
    checkAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
  };

  $('check-all-review').addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('#review-expense-tbody .submit-row-checkbox').forEach(cb => {
      cb.checked = isChecked;
      const id = Number(cb.dataset.id);
      if (isChecked) selectedReviewIds.add(id);
      else selectedReviewIds.delete(id);
    });
    syncCheckAllState();
  });

  const openDetailModal = (record) => {
    if (!record) return;
    currentDetailId = record.id;
    const parts = (activeHeqiKey || '').split(' ').filter(Boolean);
    const groupName = parts[0] || '';
    const groupCode = parts[1] || '';

    $('detail-modal-title').textContent = `支出管理 / 活動、聯誼金審核作業 / ${record.type}明細（${record.name}）`;

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

    const safeRemark = String(record.remark || '').split('"').join('&quot;');
    $('detail-modal-body').innerHTML = `
      <div class="claim-grid-6">
        <div class="claim-field">
          <label>作業日期</label>
          <input type="text" class="claim-control" value="${record.processDate || ''}" readonly>
        </div>
        <div class="claim-field">
          <label>填表人</label>
          <input type="text" class="claim-control" value="${record.creator || '蘇2'}" readonly>
        </div>
        <div class="claim-field">
          <label>目前狀態</label>
          <input type="text" class="claim-control" value="${record.status || '待審核'}" readonly>
        </div>
        <div class="claim-field">
          <label>申請日</label>
          <input type="text" class="claim-control" value="${record.applyDate || ''}" readonly>
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
      <div class="claim-field" style="margin-bottom: 18px;">
        <label>備註</label>
        <input type="text" class="claim-control" value="${safeRemark || '無備註內容'}" readonly>
      </div>
      ${specificHtml}
    `;

    $('detail-modal').classList.remove('hidden');
  };

  let currentReviewRecords = [];
  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentReviewRecords)
  });

  const renderTable = (data) => {
    const tbody = $('review-expense-tbody');
    const listFooter = $('list-footer');
    currentReviewRecords = window.CTA.sortByApplyDateDesc(data);

    if (currentReviewRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" class="empty">查無符合條件的資料</td></tr>`;
      $('total-amount-display').textContent = '0';
      listFooter.classList.add('hidden');
      pager.render(0, 1, 1);
      syncCheckAllState();
      return;
    }

    listFooter.classList.remove('hidden');
    const totalAmt = currentReviewRecords.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $('total-amount-display').textContent = money(totalAmt);

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentReviewRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentReviewRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentReviewRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((item, idx) => {
      const isChecked = selectedReviewIds.has(item.id);
      return `
        <tr>
          <td class="center">${startIndex + idx + 1}</td>
          <td>${item.name}</td>
          <td>${item.type}</td>
          <td>${item.applyDate}</td>
          <td>${item.processDate}</td>
          <td>${item.member || '<span class="blank">—</span>'}</td>
          <td>${item.charity || '<span class="blank">—</span>'}</td>
          <td>${item.relation || '<span class="blank">—</span>'}</td>
          <td class="center">${item.receiptCount != null ? item.receiptCount : 0}</td>
          <td class="center"><button type="button" class="btn small btn-remark" data-id="${item.id}">查看</button></td>
          <td class="num-col">${money(item.amount)}</td>
          <td class="center"><button type="button" class="btn primary small btn-detail" data-id="${item.id}">詳細</button></td>
          <td class="center"><input type="checkbox" class="submit-row-checkbox" data-id="${item.id}" aria-label="勾選審核第 ${startIndex + idx + 1} 筆" ${isChecked ? 'checked' : ''}></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-remark').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const list = reviewDatasets[activeHeqiKey] || [];
        const record = list.find(r => r.id === id);
        $('remark-modal-body').textContent = (record && record.remark) ? record.remark : '無備註內容';
        $('remark-modal').classList.remove('hidden');
      });
    });

    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const list = reviewDatasets[activeHeqiKey] || [];
        const record = list.find(r => r.id === id);
        if (record) openDetailModal(record);
      });
    });

    tbody.querySelectorAll('.submit-row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        if (e.currentTarget.checked) selectedReviewIds.add(id);
        else selectedReviewIds.delete(id);
        syncCheckAllState();
      });
    });

    syncCheckAllState();
  };

  // ==================== 查詢 / 清除 / 核可 / 不核可 ====================
  const executeSearch = async () => {
    const rawVal = cleanTrim(heqiInput.value);
    heqiInput.value = rawVal;
    if (!rawVal) {
      heqiInput.classList.add('highlight-error');
      heqiInput.focus();
      return;
    }

    const selectedCategory = $('filter-category').value || '全部';
    heqiCombo.close();
    $('table-loading').classList.remove('hidden');
    await dataReady;
    setTimeout(() => {
      selectedReviewIds.clear();
      pager.setPage(1);
      const matchedKey = resolveHeqiKey(rawVal);
      if (matchedKey) {
        activeHeqiKey = matchedKey;
        activeCategoryFilter = selectedCategory;
        heqiCombo.setValue(matchedKey);
        renderTable(getPendingReviewList(matchedKey, activeCategoryFilter));
      } else {
        activeHeqiKey = '';
        activeCategoryFilter = selectedCategory;
        renderTable([]);
      }
      $('table-loading').classList.add('hidden');
    }, 220);
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    heqiCombo.setValue('');
    heqiInput.classList.remove('highlight-error');
    heqiCombo.close();
    $('filter-category').value = '全部';
    activeHeqiKey = '';
    activeCategoryFilter = '全部';
    selectedReviewIds.clear();
    currentReviewRecords = [];
    pager.setPage(1);
    pager.render(0, 1, 1);
    syncCheckAllState();
    $('total-amount-display').textContent = '0';
    $('list-footer').classList.add('hidden');
    $('review-expense-tbody').innerHTML = `<tr><td colspan="13" class="empty">請選擇條件搜尋</td></tr>`;
  });

  const processReviewAction = (targetItems, isApprove) => {
    if (!targetItems || targetItems.length === 0) {
      openAlertModal('請先勾選要審核的請領單！');
      return;
    }

    const count = targetItems.length;
    const msg = isApprove
      ? `請問確定核可嗎？（已勾選 ${count} 筆）`
      : `請問確定不核可嗎？（已勾選 ${count} 筆）<br>表單將退回「待修正」。`;
    const btnClass = isApprove ? 'btn primary' : 'btn btn-reject';
    const btnText = isApprove ? '✓ 核可' : '✕ 不核可';
    const modalTitle = isApprove ? '確認核可' : '確認不核可';

    openConfirmModal(msg, btnClass, btnText, () => {
      targetItems.forEach(item => {
        const nowRec = window.CTA.getNowMsRecord();
        item.status = isApprove ? '已核可' : '待修正';
        item.reviewDate = nowRec.slash;
        item.reviewedAtStr = nowRec.fullMs;
        item.reviewedAtMs = nowRec.ms;
        item.updatedAtStr = nowRec.fullMs;
        item.updatedAtMs = nowRec.ms;
        selectedReviewIds.delete(item.id);
      });
      closeDetailModal();
      renderTable(getPendingReviewList(activeHeqiKey, activeCategoryFilter));
      toast(isApprove ? `已核可 ${count} 筆請領單。` : `已不核可 ${count} 筆請領單，退回「待修正」。`);
    }, modalTitle);
  };

  $('btn-approve-forms').addEventListener('click', () => {
    const list = activeHeqiKey ? getPendingReviewList(activeHeqiKey, activeCategoryFilter) : [];
    const checkedItems = list.filter(item => selectedReviewIds.has(item.id));
    processReviewAction(checkedItems, true);
  });

  $('btn-reject-forms').addEventListener('click', () => {
    const list = activeHeqiKey ? getPendingReviewList(activeHeqiKey, activeCategoryFilter) : [];
    const checkedItems = list.filter(item => selectedReviewIds.has(item.id));
    processReviewAction(checkedItems, false);
  });

  $('btn-detail-approve').addEventListener('click', () => {
    if (currentDetailId == null || !activeHeqiKey) return;
    const rec = (reviewDatasets[activeHeqiKey] || []).find(r => r.id === currentDetailId && r.status === '待審核');
    if (rec) processReviewAction([rec], true);
  });

  $('btn-detail-reject').addEventListener('click', () => {
    if (currentDetailId == null || !activeHeqiKey) return;
    const rec = (reviewDatasets[activeHeqiKey] || []).find(r => r.id === currentDetailId && r.status === '待審核');
    if (rec) processReviewAction([rec], false);
  });
});
