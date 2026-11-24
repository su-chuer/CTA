document.addEventListener("DOMContentLoaded", () => {
  const {
    $, cleanTrim, money, toHyphenDate, toSlashDate,
    toast, alert: openAlertModal, confirm: openConfirmModal
  } = window.CTA;

  const todayHyphen = '2026-11-18';
  const todaySlash = '2026/11/18';

  // ==================== 會員名冊（供「聯誼金」依委員號 / 慈誠號查詢，含夫妻同修選擇） ====================
  const extractTeamName = (xieliStr) => {
    const cleaned = String(xieliStr || '').replace(/\s*\([隊組]\)\s*$/, '').trim();
    if (!cleaned) return '仁中協力';
    const lastPart = cleaned.split(/\s+/).pop() || cleaned;
    return lastPart.replace(/^互愛/, '') || lastPart;
  };

  let memberDirectory = [];
  let expenseDatasets = {};
  let heqiOptions = [];

  const dataReady = Promise.all([
    fetch('json/expenses_data.json?v=346', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).catch(() => null),
    fetch('json/member_master.json?v=346', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).catch(() => null)
  ]).then(([expData, masterData]) => {
    if (expData && typeof expData === 'object') {
      expenseDatasets = expData.expenseDatasets && typeof expData.expenseDatasets === 'object' ? expData.expenseDatasets : {};
      heqiOptions = Object.keys(expenseDatasets);
      if (typeof window.CTA.syncRecordedFloorMs === 'function') {
        window.CTA.syncRecordedFloorMs(Object.values(expenseDatasets).flat());
      }
    }
    if (masterData && Array.isArray(masterData.members)) {
      memberDirectory = masterData.members.map(m => ({
        memberId: m.memberId || '',
        name: String(m.name || '慈濟人').trim(),
        member: String(m.member || '').trim(),
        charity: String(m.charity || '').trim(),
        dharmaName: String(m.dharmaName || '—').trim() || '—',
        heqi: String(m.heqi || '').trim(),
        teamName: String(m.teamName || '仁中協力').trim(),
        unitType: String(m.unitType || '').trim(),
        spouseName: String(m.spouseName || '').trim()
      }));
    }
  });

  let activeHeqiKey = '';
  let activeCategoryFilter = '全部';
  let selectedSubmitIds = new Set();
  let currentEditingId = null; // null = 新增請領單, number = 編輯請領單
  let currentLineItems = [];
  let nextClaimId = 500;

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
    emptyText: '無相符組別，可直接按「搜尋」比對關鍵字',
    onEnter: () => executeSearch()
  });

  // ==================== 列表視圖渲染 ====================
  const resolveHeqiKey = (rawVal) => window.CTA.resolveOptionKey(rawVal, heqiOptions);

  const syncCheckAllSubmitState = () => {
    const checkAll = $('check-all-submit');
    if (!checkAll) return;
    const enabledBoxes = Array.from(document.querySelectorAll('#expense-tbody .submit-row-checkbox:not(:disabled)'));
    if (enabledBoxes.length === 0) {
      checkAll.disabled = true;
      checkAll.checked = false;
      checkAll.indeterminate = false;
      return;
    }
    checkAll.disabled = false;
    const checkedCount = enabledBoxes.filter(cb => cb.checked).length;
    checkAll.checked = checkedCount === enabledBoxes.length;
    checkAll.indeterminate = checkedCount > 0 && checkedCount < enabledBoxes.length;
  };

  $('check-all-submit').addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('#expense-tbody .submit-row-checkbox:not(:disabled)').forEach(cb => {
      cb.checked = isChecked;
      const id = Number(cb.dataset.id);
      if (isChecked) {
        selectedSubmitIds.add(id);
      } else {
        selectedSubmitIds.delete(id);
      }
    });
    syncCheckAllSubmitState();
  });

  let currentExpenseRecords = [];
  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentExpenseRecords)
  });

  const renderTable = (data) => {
    const tbody = $('expense-tbody');
    const listFooter = $('list-footer');
    currentExpenseRecords = window.CTA.sortByApplyDateDesc(data);

    if (currentExpenseRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty">查無符合條件的資料</td></tr>`;
      $('total-amount-display').textContent = '0';
      listFooter.classList.toggle('hidden', !activeHeqiKey);
      $('btn-submit-forms').classList.add('hidden');
      pager.render(0, 1, 1);
      syncCheckAllSubmitState();
      return;
    }

    listFooter.classList.remove('hidden');
    $('btn-submit-forms').classList.remove('hidden');
    const totalAmt = currentExpenseRecords.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $('total-amount-display').textContent = money(totalAmt);

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentExpenseRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentExpenseRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentExpenseRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((item, idx) => {
      const badgeClass = item.status === '待修正'
        ? 'revise'
        : (item.status === '待審核' ? 'pending' : 'new-apply');
      const canSubmit = item.status === '待修正' || item.status === '新申請';
      if (!canSubmit) {
        selectedSubmitIds.delete(item.id);
      }
      const isChecked = canSubmit && selectedSubmitIds.has(item.id);
      return `
      <tr>
        <td class="center">${startIndex + idx + 1}</td>
        <td>${item.name}</td>
        <td>${item.type}</td>
        <td>${item.applyDate}</td>
        <td>${item.processDate}</td>
        <td>${item.member || '<span class="blank">—</span>'}</td>
        <td>${item.charity || '<span class="blank">—</span>'}</td>
        <td class="num-col">${money(item.amount)}</td>
        <td class="center"><span class="status-badge ${badgeClass}">${item.status}</span></td>
        <td class="center"><button type="button" class="btn primary small btn-detail" data-id="${item.id}">詳細</button></td>
        <td class="center"><input type="checkbox" class="submit-row-checkbox" data-id="${item.id}" aria-label="勾選送審第 ${startIndex + idx + 1} 筆" ${isChecked ? 'checked' : ''} ${canSubmit ? '' : 'disabled title="已送審"'}></td>
      </tr>
    `;
    }).join('');

    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const list = expenseDatasets[activeHeqiKey] || [];
        const record = list.find(r => r.id === id);
        if (record) openClaimFormView('edit', record);
      });
    });

    tbody.querySelectorAll('.submit-row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        if (e.currentTarget.checked) {
          selectedSubmitIds.add(id);
        } else {
          selectedSubmitIds.delete(id);
        }
        syncCheckAllSubmitState();
      });
    });

    syncCheckAllSubmitState();
  };

  const getFilteredExpenseList = (heqiKey, categoryFilter = activeCategoryFilter) => {
    if (!heqiKey) return [];
    const rawList = (expenseDatasets[heqiKey] || []).filter(item => item.status !== '待審核');
    if (!categoryFilter || categoryFilter === '全部') return rawList;
    return rawList.filter(item => item.type === categoryFilter);
  };

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
      selectedSubmitIds.clear();
      pager.setPage(1);
      const matchedKey = resolveHeqiKey(rawVal);
      if (matchedKey) {
        activeHeqiKey = matchedKey;
        activeCategoryFilter = selectedCategory;
        heqiCombo.setValue(matchedKey);
        renderTable(getFilteredExpenseList(matchedKey, activeCategoryFilter));
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
    selectedSubmitIds.clear();
    currentExpenseRecords = [];
    pager.setPage(1);
    pager.render(0, 1, 1);
    syncCheckAllSubmitState();
    $('total-amount-display').textContent = '0';
    $('list-footer').classList.add('hidden');
    $('expense-tbody').innerHTML = `<tr><td colspan="11" class="empty">請選擇條件搜尋</td></tr>`;
  });

  // 點擊「送審請領單」依勾選項目進行個別或批次送審（支援「待修正」與「新申請」狀態）
  $('btn-submit-forms').addEventListener('click', () => {
    const list = activeHeqiKey ? getFilteredExpenseList(activeHeqiKey) : [];
    const submittableItems = list.filter(item => item.status === '待修正' || item.status === '新申請');
    if (submittableItems.length === 0) {
      openAlertModal('目前無可送審的請領單資料！');
      return;
    }

    const checkedItems = submittableItems.filter(item => selectedSubmitIds.has(item.id));
    if (checkedItems.length === 0) {
      openAlertModal('請先勾選要送審的請領單！');
      return;
    }

    openConfirmModal(`請問確定送出審核嗎？（已勾選 ${checkedItems.length} 筆）`, '確定', () => {
      checkedItems.forEach(item => {
        const nowRec = window.CTA.getNowMsRecord();
        item.status = '待審核';
        item.submittedAtStr = nowRec.fullMs;
        item.submittedAtMs = nowRec.ms;
        item.updatedAtStr = nowRec.fullMs;
        item.updatedAtMs = nowRec.ms;
        selectedSubmitIds.delete(item.id);
      });
      renderTable(getFilteredExpenseList(activeHeqiKey));
      toast(`已成功送審 ${checkedItems.length} 筆請領單。`);
    });
  });

  // ==================== 新增 / 編輯請領單視圖（活動金 & 聯誼金） ====================
  const setCategoryRadiosDisabled = (disabled) => {
    document.querySelectorAll('input[name="claim-category"]').forEach(r => {
      r.disabled = disabled;
    });
    $('label-cat-activity').classList.toggle('is-disabled', disabled);
    $('label-cat-fellowship').classList.toggle('is-disabled', disabled);
  };

  const syncCategoryFields = () => {
    const cat = document.querySelector('input[name="claim-category"]:checked').value;
    const totalInput = $('form-total-amount');
    if (cat === '活動金') {
      $('activity-section').classList.remove('hidden');
      $('fellowship-section').classList.add('hidden');
      totalInput.readOnly = true;
      totalInput.type = 'text';
      totalInput.removeAttribute('inputmode');
      const totalAmt = currentLineItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      totalInput.value = money(totalAmt);
    } else {
      $('activity-section').classList.add('hidden');
      $('fellowship-section').classList.remove('hidden');
      totalInput.readOnly = false;
      totalInput.type = 'text';
      totalInput.inputMode = 'numeric';
      totalInput.placeholder = '請輸入金額';
      const numericVal = Number(String(totalInput.value || '').split(',').join(''));
      totalInput.value = numericVal > 0 ? numericVal : '';
    }
  };

  $('form-total-amount').addEventListener('input', (e) => {
    const el = e.currentTarget;
    if (el.readOnly) return;
    const cleaned = String(el.value || '').replace(/[^\d]/g, '').replace(/^0+/, '');
    if (el.value !== cleaned) el.value = cleaned;
    el.classList.remove('highlight-error');
  });

  document.querySelectorAll('input[name="claim-category"]').forEach(r => {
    r.addEventListener('change', () => {
      $('form-total-amount').classList.remove('highlight-error');
      syncCategoryFields();
      if (isInClaimFormView() && currentEditingId == null) {
        saveClaimFormState('add', null, r.value);
      }
    });
  });

  let selectedFellowshipMember = '';
  let selectedFellowshipCharity = '';

  // 聯誼金：套用選取人員資料至表單欄位（並完整保留該人員對應的委員號與慈誠號供儲存）
  const applySelectedFellowshipMember = (person, searchedVal = '') => {
    if (!person) return;
    const lookupInput = $('fellowship-lookup-id');
    lookupInput.classList.remove('highlight-error');

    $('fellowship-name').value = person.name || '';
    $('fellowship-dharma').value = person.dharmaName || '—';
    if (person.unitType === '組') {
      selectedFellowshipMember = person.member || '';
      selectedFellowshipCharity = '';
    } else {
      selectedFellowshipMember = person.member || '';
      selectedFellowshipCharity = person.charity || '';
    }

    const displayId = (searchedVal && (searchedVal === selectedFellowshipMember || searchedVal === selectedFellowshipCharity))
      ? searchedVal
      : (selectedFellowshipMember || selectedFellowshipCharity);
    lookupInput.value = displayId;
    toast(`已查詢帶入：${person.name}`);
  };

  // 聯誼金：依整合後的「委員號 / 慈誠號」欄位查詢（符合多筆時自動跳出「請選擇人員」彈窗）
  const lookupFellowshipMember = async () => {
    await dataReady;
    window.CTA.lookupMemberByCode({
      inputEl: $('fellowship-lookup-id'),
      directory: memberDirectory,
      onMatched: applySelectedFellowshipMember,
      onClear: () => {
        $('fellowship-name').value = '';
        $('fellowship-dharma').value = '';
        selectedFellowshipMember = '';
        selectedFellowshipCharity = '';
      }
    });
  };

  $('btn-lookup-member').addEventListener('click', lookupFellowshipMember);
  $('fellowship-lookup-id').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupFellowshipMember();
    }
  });
  $('fellowship-lookup-id').addEventListener('input', () => {
    const lookupInput = $('fellowship-lookup-id');
    lookupInput.classList.remove('highlight-error');
    const cur = cleanTrim(lookupInput.value);
    if (cur !== selectedFellowshipMember && cur !== selectedFellowshipCharity) {
      $('fellowship-name').value = '';
      $('fellowship-dharma').value = '';
      selectedFellowshipMember = '';
      selectedFellowshipCharity = '';
    }
  });

  const renderLineItemsTable = () => {
    const tbody = $('claim-items-tbody');
    const cat = document.querySelector('input[name="claim-category"]:checked').value;
    if (cat === '活動金') {
      const totalAmt = currentLineItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      $('form-total-amount').value = money(totalAmt);
    }

    if (currentLineItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty" style="padding: 28px;">尚未新增品項細項</td></tr>`;
      return;
    }

    tbody.innerHTML = currentLineItems.map((it, idx) => `
      <tr>
        <td>${it.name}</td>
        <td class="num-col">${money(it.amount)}</td>
        <td class="center"><button type="button" class="btn danger small btn-del-item" data-idx="${idx}">刪除</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-del-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        currentLineItems.splice(idx, 1);
        renderLineItemsTable();
      });
    });
  };

  const CLAIM_FORM_STATE_KEY = 'cta_claim_form_state';
  const saveClaimFormState = (mode, recordId = null, category = '活動金') => {
    try {
      sessionStorage.setItem(CLAIM_FORM_STATE_KEY, JSON.stringify({
        activeHeqiKey,
        mode,
        recordId,
        category
      }));
    } catch (_) {}
  };
  const clearClaimFormState = () => {
    try {
      sessionStorage.removeItem(CLAIM_FORM_STATE_KEY);
    } catch (_) {}
  };

  const openClaimFormView = (mode, record = null, initialCat = null) => {
    const targetHeqiKey = activeHeqiKey || resolveHeqiKey(heqiInput.value.trim()) || '仁德和氣 ETE05';
    activeHeqiKey = targetHeqiKey;
    heqiCombo.setValue(targetHeqiKey);

    const parts = targetHeqiKey.split(' ').filter(Boolean);
    const groupName = parts[0] || '仁德和氣';
    const groupCode = parts[1] || 'ETE05';

    $('form-group-name').value = groupName;
    $('form-group-code').value = groupCode;
    $('fellowship-group-name').value = groupName;
    $('fellowship-group-code').value = groupCode;

    // 清除任何舊紅框
    [
      'form-apply-date', 'form-total-amount', 'form-activity-type', 'form-activity-date',
      'item-name-select', 'item-amount-input',
      'fellowship-lookup-id', 'fellowship-item', 'fellowship-relation'
    ].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });

    if (mode === 'add') {
      currentEditingId = null;
      $('crumb-current').textContent = '申請 / 編輯活動、聯誼金 / 新增請領單';
      // 新增請領單時允許自由選擇「活動金」或「聯誼金」
      setCategoryRadiosDisabled(false);
      const initCat = initialCat === '聯誼金' ? '聯誼金' : '活動金';
      document.querySelector(`input[name="claim-category"][value="${initCat}"]`).checked = true;

      $('form-process-date').value = todayHyphen;
      $('form-creator').value = '蘇2';
      $('form-status').value = '新申請';
      $('form-apply-date').value = '';
      $('form-receipt-count').value = '';
      $('form-remark').value = '';

      // 活動金欄位重置
      $('form-activity-type').value = '';
      $('form-activity-date').value = '';
      currentLineItems = [];

      // 聯誼金欄位重置
      $('fellowship-lookup-id').value = '';
      selectedFellowshipMember = '';
      selectedFellowshipCharity = '';
      $('fellowship-name').value = '';
      $('fellowship-dharma').value = '';
      $('fellowship-item').value = '';
      $('fellowship-relation').value = '';

      syncCategoryFields();

      $('btn-form-delete').classList.add('hidden');
      // 順序：離開、儲存
      $('claim-form-footer').appendChild($('btn-form-leave'));
      $('claim-form-footer').appendChild($('btn-form-save'));
    } else if (record) {
      currentEditingId = record.id;
      $('crumb-current').textContent = '申請 / 編輯活動、聯誼金 / 編輯請領單';
      const cat = record.type === '聯誼金' ? '聯誼金' : '活動金';
      document.querySelector(`input[name="claim-category"][value="${cat}"]`).checked = true;
      // 圖一：開過的單，[活動金、聯誼金] 都不能選
      setCategoryRadiosDisabled(true);

      $('form-process-date').value = toHyphenDate(record.processDate || todaySlash);
      $('form-creator').value = '蘇2';
      $('form-status').value = record.status || '新申請';
      $('form-apply-date').value = toHyphenDate(record.applyDate || '');
      $('form-receipt-count').value = record.receiptCount != null ? record.receiptCount : 1;
      $('form-remark').value = record.remark || '';

      if (cat === '活動金') {
        $('form-activity-type').value = record.name || '';
        $('form-activity-date').value = toHyphenDate(record.activityDate || record.applyDate || '');
        currentLineItems = Array.isArray(record.items) ? record.items.map(x => ({ ...x })) : [];

        $('fellowship-lookup-id').value = '';
        selectedFellowshipMember = '';
        selectedFellowshipCharity = '';
        $('fellowship-name').value = '';
        $('fellowship-dharma').value = '';
        $('fellowship-item').value = '';
        $('fellowship-relation').value = '';
      } else {
        $('form-activity-type').value = '';
        $('form-activity-date').value = '';
        currentLineItems = [];

        selectedFellowshipMember = record.member || '';
        selectedFellowshipCharity = record.charity || '';
        $('fellowship-lookup-id').value = selectedFellowshipMember || selectedFellowshipCharity || '';
        $('fellowship-name').value = record.name || '';
        $('fellowship-dharma').value = record.dharmaName || '—';
        $('fellowship-item').value = record.fellowshipItem || '';
        $('fellowship-relation').value = record.relation || '';
      }

      syncCategoryFields();
      if (cat === '聯誼金') {
        $('form-total-amount').value = Number(record.amount || 0) || '';
      }

      $('btn-form-delete').classList.remove('hidden');
      // 順序：儲存、離開、刪除
      $('claim-form-footer').appendChild($('btn-form-save'));
      $('claim-form-footer').appendChild($('btn-form-leave'));
      $('claim-form-footer').appendChild($('btn-form-delete'));
    }

    $('item-name-select').value = '';
    $('item-amount-input').value = '';
    renderLineItemsTable();

    const activeCat = document.querySelector('input[name="claim-category"]:checked').value;
    saveClaimFormState(mode, record ? record.id : null, activeCat);

    $('list-view').classList.add('hidden');
    $('form-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const returnToListView = () => {
    clearClaimFormState();
    $('form-view').classList.add('hidden');
    $('list-view').classList.remove('hidden');
    $('crumb-current').textContent = '申請 / 編輯活動、聯誼金';
    if (activeHeqiKey) {
      renderTable(getFilteredExpenseList(activeHeqiKey));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 點擊「新增請領單」
  $('btn-add-form').addEventListener('click', () => {
    openClaimFormView('add');
  });

  // 活動金：右側新增品項細項（僅允許輸入大於 0 之正整數，無上下微調鍵）
  $('item-name-select').addEventListener('change', (e) => {
    e.currentTarget.classList.remove('highlight-error');
  });
  $('item-amount-input').addEventListener('input', (e) => {
    const el = e.currentTarget;
    const cleaned = String(el.value || '').replace(/[^\d]/g, '').replace(/^0+/, '');
    if (el.value !== cleaned) el.value = cleaned;
    el.classList.remove('highlight-error');
  });

  $('btn-add-line-item').addEventListener('click', () => {
    const itemSel = $('item-name-select');
    const amtInput = $('item-amount-input');
    const itemName = itemSel.value.trim();
    const amtVal = Number(amtInput.value);

    itemSel.classList.remove('highlight-error');
    amtInput.classList.remove('highlight-error');

    const missingItem = !itemName;
    const invalidAmt = !Number.isFinite(amtVal) || amtVal <= 0;
    if (missingItem || invalidAmt) {
      if (missingItem) itemSel.classList.add('highlight-error');
      if (invalidAmt) amtInput.classList.add('highlight-error');
      const alertMsg = (missingItem && invalidAmt)
        ? '請選擇項目並輸入大於 0 的金額！'
        : (missingItem ? '請選擇項目！' : '請輸入大於 0 的金額！');
      openAlertModal(alertMsg, () => {
        (missingItem ? itemSel : amtInput).focus();
      });
      return;
    }

    currentLineItems.push({ name: itemName, amount: Math.round(amtVal) });
    itemSel.value = '';
    amtInput.value = '';
    renderLineItemsTable();
  });

  const isInClaimFormView = () => {
    const fv = $('form-view');
    return Boolean(fv && !fv.classList.contains('hidden'));
  };
  window.CTA.bindFormLeaveGuard({
    isActive: isInClaimFormView,
    onClearState: clearClaimFormState
  });

  // 點選「離開」跳出 Popup 確認
  $('btn-form-leave').addEventListener('click', () => {
    openConfirmModal('你的資料尚未儲存，確定要離開嗎？', '確定', () => {
      returnToListView();
    });
  });

  // 點選「刪除」跳出 Popup 確認
  $('btn-form-delete').addEventListener('click', () => {
    if (currentEditingId == null) return;
    openConfirmModal('確定刪除請領單嗎？', '確認', () => {
      const list = expenseDatasets[activeHeqiKey] || [];
      const idx = list.findIndex(r => r.id === currentEditingId);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
      toast('已成功刪除請領單。');
      returnToListView();
    });
  });

  // 點選「儲存」檢核細項與必填欄位（支援活動金 & 聯誼金）
  $('btn-form-save').addEventListener('click', () => {
    const cat = document.querySelector('input[name="claim-category"]:checked').value;
    const applyDateVal = $('form-apply-date').value.trim();

    [
      'form-apply-date', 'form-total-amount', 'form-activity-type', 'form-activity-date',
      'fellowship-lookup-id', 'fellowship-item', 'fellowship-relation'
    ].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });

    let invalid = false;
    if (!applyDateVal) {
      $('form-apply-date').classList.add('highlight-error');
      invalid = true;
    }

    const list = expenseDatasets[activeHeqiKey] || (expenseDatasets[activeHeqiKey] = []);
    const existingIdx = currentEditingId == null ? -1 : list.findIndex(r => r.id === currentEditingId);
    const preservedStatus = existingIdx !== -1
      ? (list[existingIdx].status || '待修正')
      : '新申請';

    let payload = null;

    if (cat === '活動金') {
      const activityTypeVal = $('form-activity-type').value.trim();
      const activityDateVal = $('form-activity-date').value.trim();
      const totalAmt = currentLineItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);

      if (!activityTypeVal) {
        $('form-activity-type').classList.add('highlight-error');
        invalid = true;
      }
      if (!activityDateVal) {
        $('form-activity-date').classList.add('highlight-error');
        invalid = true;
      }

      if (invalid) {
        openAlertModal('欄位填寫不完整！');
        return;
      }
      if (currentLineItems.length === 0 || totalAmt <= 0) {
        openAlertModal('尚未新增品項細項！');
        return;
      }

      payload = {
        name: activityTypeVal,
        type: '活動金',
        applyDate: toSlashDate(applyDateVal),
        processDate: toSlashDate($('form-process-date').value),
        activityDate: toSlashDate(activityDateVal),
        receiptCount: Number($('form-receipt-count').value || 0),
        remark: $('form-remark').value.trim(),
        member: '',
        charity: '',
        amount: totalAmt,
        status: preservedStatus,
        items: currentLineItems.map(x => ({ ...x }))
      };
    } else {
      const amtVal = Math.round(Number($('form-total-amount').value || 0));
      const lookupVal = cleanTrim($('fellowship-lookup-id').value);
      const fName = $('fellowship-name').value.trim();
      const fDharma = $('fellowship-dharma').value.trim();
      const fItem = $('fellowship-item').value.trim();
      const fRel = $('fellowship-relation').value.trim();

      if (!Number.isFinite(amtVal) || amtVal <= 0) {
        $('form-total-amount').classList.add('highlight-error');
        invalid = true;
      }
      if (!lookupVal || !fName || (!selectedFellowshipMember && !selectedFellowshipCharity)) {
        $('fellowship-lookup-id').classList.add('highlight-error');
        invalid = true;
      }
      if (!fItem) {
        $('fellowship-item').classList.add('highlight-error');
        invalid = true;
      }
      if (!fRel) {
        $('fellowship-relation').classList.add('highlight-error');
        invalid = true;
      }

      if (invalid) {
        openAlertModal('欄位填寫不完整！');
        return;
      }

      payload = {
        name: fName,
        type: '聯誼金',
        applyDate: toSlashDate(applyDateVal),
        processDate: toSlashDate($('form-process-date').value),
        receiptCount: Number($('form-receipt-count').value || 0),
        remark: $('form-remark').value.trim(),
        member: selectedFellowshipMember,
        charity: selectedFellowshipCharity,
        dharmaName: fDharma || '—',
        fellowshipItem: fItem,
        relation: fRel,
        amount: amtVal,
        status: preservedStatus,
        items: []
      };
    }

    const nowRec = window.CTA.getNowMsRecord();
    if (existingIdx === -1) {
      list.push({
        id: nextClaimId++,
        ...payload,
        createdAtStr: nowRec.fullMs,
        createdAtMs: nowRec.ms,
        updatedAtStr: nowRec.fullMs,
        updatedAtMs: nowRec.ms
      });
    } else {
      const prevRec = list[existingIdx];
      list[existingIdx] = {
        ...prevRec,
        ...payload,
        createdAtStr: prevRec.createdAtStr || nowRec.fullMs,
        createdAtMs: prevRec.createdAtMs || nowRec.ms,
        updatedAtStr: nowRec.fullMs,
        updatedAtMs: nowRec.ms
      };
    }

    toast('已成功儲存請領單。');
    returnToListView();
  });

  // 若重新載入頁面時原本停留在請領單表單頁（#form-view），則在資料載入完成後重新停留在該表單頁並清除輸入資料
  dataReady.then(() => {
    try {
      const savedStateRaw = sessionStorage.getItem(CLAIM_FORM_STATE_KEY);
      if (savedStateRaw) {
        clearClaimFormState();
        const savedState = JSON.parse(savedStateRaw);
        if (savedState && savedState.activeHeqiKey) {
          activeHeqiKey = savedState.activeHeqiKey;
        }
        if (savedState && savedState.mode === 'edit' && savedState.recordId != null) {
          const list = expenseDatasets[activeHeqiKey] || [];
          const targetRec = list.find(r => r.id === savedState.recordId);
          if (targetRec) {
            openClaimFormView('edit', targetRec);
          } else {
            openClaimFormView('add', null, savedState.category);
          }
        } else if (savedState) {
          openClaimFormView('add', null, savedState.category);
        }
      }
    } catch (_) {}
  });
});
