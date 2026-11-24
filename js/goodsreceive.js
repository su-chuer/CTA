document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, toHyphenDate, toSlashDate, toast, alert: openAlertModal } = window.CTA;

  const formatUnitLabel = (raw) => {
    const text = cleanTrim(raw);
    if (!text) return '';
    const normalized = text.includes(' / ')
      ? text
      : text.replace(/^(.+?和氣(?:[一二三四五六七八九十\d]+)?)\s*(.+)$/, '$1 / $2');
    return normalized.replace(/([\u4e00-\u9fff]+互愛)([\u4e00-\u9fff]+協力)/g, '$1 $2');
  };

  let receiveDatasets = {};
  let areaOptions = [];
  let activeAreaKey = '';
  let activeItemFilter = '全部';
  let activeReceiveRecord = null;
  let currentReceiveRecords = [];

  const dataReady = fetch('json/goods_receive_data.json?v=346', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : null)
    .catch(() => null)
    .then(rData => {
      if (rData && typeof rData === 'object') {
        receiveDatasets = rData.receiveDatasets && typeof rData.receiveDatasets === 'object'
          ? rData.receiveDatasets
          : {};
        areaOptions = Object.keys(receiveDatasets);
        if (typeof window.CTA.syncRecordedFloorMs === 'function') {
          window.CTA.syncRecordedFloorMs(Object.values(receiveDatasets).flat());
        }
      }
    });

  // ==================== 領取作業彈窗 ====================
  const closeReceiveModal = () => {
    $('receive-modal').classList.add('hidden');
    activeReceiveRecord = null;
  };
  $('close-receive').addEventListener('click', closeReceiveModal);
  $('btn-receive-cancel').addEventListener('click', closeReceiveModal);
  window.CTA.registerModalEsc('receive-modal', closeReceiveModal);

  window.CTA.bindFormLeaveGuard({
    isActive: () => {
      const rm = $('receive-modal');
      return Boolean(rm && !rm.classList.contains('hidden') && activeReceiveRecord && activeReceiveRecord.goodsItem === '賀匾');
    }
  });

  const openReceiveModal = (record) => {
    if (!record) return;
    activeReceiveRecord = record;

    $('receive-modal-message').innerHTML = `您確定要領取「<strong>${record.name}</strong>」的「<strong>${record.goodsItem}</strong>」嗎？`;

    const plaqueBox = $('receive-plaque-fields');
    const embedEl = $('receive-embed-date');
    const frameEl = $('receive-frame-date');
    const finishEl = $('receive-finish-date');

    [embedEl, frameEl, finishEl].forEach(el => el.classList.remove('highlight-error'));

    if (record.goodsItem === '賀匾') {
      embedEl.value = toHyphenDate(record.embedDate || '');
      frameEl.value = toHyphenDate(record.frameDate || '');
      finishEl.value = toHyphenDate(record.finishDate || '');
      plaqueBox.classList.remove('hidden');
    } else {
      embedEl.value = '';
      frameEl.value = '';
      finishEl.value = '';
      plaqueBox.classList.add('hidden');
    }

    $('receive-modal').classList.remove('hidden');
    if (record.goodsItem === '賀匾') {
      setTimeout(() => embedEl.focus(), 0);
    } else {
      setTimeout(() => $('btn-receive-confirm').focus(), 0);
    }
  };

  ['receive-embed-date', 'receive-frame-date', 'receive-finish-date'].forEach(fid => {
    $(fid).addEventListener('change', (e) => e.target.classList.remove('highlight-error'));
    $(fid).addEventListener('input', (e) => e.target.classList.remove('highlight-error'));
  });

  $('btn-receive-confirm').addEventListener('click', () => {
    if (!activeReceiveRecord) return;

    if (activeReceiveRecord.goodsItem === '賀匾') {
      const embedEl = $('receive-embed-date');
      const frameEl = $('receive-frame-date');
      const finishEl = $('receive-finish-date');
      const embedVal = embedEl.value.trim();
      const frameVal = frameEl.value.trim();
      const finishVal = finishEl.value.trim();

      [embedEl, frameEl, finishEl].forEach(el => el.classList.remove('highlight-error'));

      let invalid = false;
      if (!embedVal) { embedEl.classList.add('highlight-error'); invalid = true; }
      if (!frameVal) { frameEl.classList.add('highlight-error'); invalid = true; }
      if (!finishVal) { finishEl.classList.add('highlight-error'); invalid = true; }

      if (invalid) {
        openAlertModal('欄位填寫不完整！');
        return;
      }

      activeReceiveRecord.embedDate = toSlashDate(embedVal);
      activeReceiveRecord.frameDate = toSlashDate(frameVal);
      activeReceiveRecord.finishDate = toSlashDate(finishVal);
    }

    const nowRec = window.CTA.getNowMsRecord();
    const personName = activeReceiveRecord.name;
    const itemName = activeReceiveRecord.goodsItem;
    activeReceiveRecord.received = true;
    activeReceiveRecord.receiveDate = nowRec.slash;
    activeReceiveRecord.receivedAtStr = nowRec.fullMs;
    activeReceiveRecord.receivedAtMs = nowRec.ms;
    activeReceiveRecord.updatedAtStr = nowRec.fullMs;
    activeReceiveRecord.updatedAtMs = nowRec.ms;

    closeReceiveModal();
    renderTable(getPendingReceiveList(activeAreaKey));
    toast(`已完成「${personName}」的「${itemName}」領取作業。`);
  });

  // ==================== 作業區 Combo-box 與分頁 ====================
  const areaInput = $('filter-area');
  const areaCombo = window.CTA.createComboSelect({
    inputId: 'filter-area',
    wrapId: 'area-combo-wrap',
    menuId: 'area-combo-menu',
    clearBtnId: 'btn-clear-area',
    toggleBtnId: 'btn-toggle-area',
    getOptions: () => areaOptions,
    beforeOpen: () => dataReady,
    emptyText: '無相符作業區，可直接按「搜尋」比對關鍵字',
    onEnter: () => executeSearch()
  });

  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentReceiveRecords)
  });

  const renderTable = (data) => {
    const tbody = $('receive-goods-tbody');
    currentReceiveRecords = window.CTA.sortByApplyDateDesc(data);

    if (currentReceiveRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">查無符合條件的資料</td></tr>`;
      pager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentReceiveRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentReceiveRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentReceiveRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((item, idx) => `
      <tr>
        <td class="center">${startIndex + idx + 1}</td>
        <td>${formatUnitLabel(item.unitLabel)}</td>
        <td>${item.name || ''}</td>
        <td>${item.goodsItem || ''}</td>
        <td>${item.applyDate || ''}</td>
        <td>${item.processDate || ''}</td>
        <td>${item.member || '<span class="blank">—</span>'}</td>
        <td>${item.charity || '<span class="blank">—</span>'}</td>
        <td class="center"><button type="button" class="btn primary small btn-receive" data-id="${item.id}">領取</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-receive').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const list = receiveDatasets[activeAreaKey] || [];
        const record = list.find(r => r.id === id);
        if (record) openReceiveModal(record);
      });
    });
  };

  const getPendingReceiveList = (areaKey, itemFilter = activeItemFilter) => {
    if (!areaKey) return [];
    const pending = (receiveDatasets[areaKey] || []).filter(item => !item.received);
    if (!itemFilter || itemFilter === '全部') return pending;
    return pending.filter(item => item.goodsItem === itemFilter);
  };

  const executeSearch = async () => {
    const rawVal = cleanTrim(areaInput.value);
    areaInput.value = rawVal;
    if (!rawVal) {
      areaInput.classList.add('highlight-error');
      areaInput.focus();
      return;
    }

    const selectedItem = $('filter-item').value || '全部';
    areaCombo.close();
    $('table-loading').classList.remove('hidden');
    await dataReady;
    setTimeout(() => {
      pager.setPage(1);
      const matchedKey = window.CTA.resolveOptionKey(rawVal, areaOptions);
      if (matchedKey) {
        activeAreaKey = matchedKey;
        activeItemFilter = selectedItem;
        areaCombo.setValue(matchedKey);
        renderTable(getPendingReceiveList(matchedKey, activeItemFilter));
      } else {
        activeAreaKey = '';
        activeItemFilter = selectedItem;
        renderTable([]);
      }
      $('table-loading').classList.add('hidden');
    }, 220);
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    areaCombo.setValue('');
    areaInput.classList.remove('highlight-error');
    areaCombo.close();
    $('filter-item').value = '全部';
    activeAreaKey = '';
    activeItemFilter = '全部';
    currentReceiveRecords = [];
    pager.setPage(1);
    pager.render(0, 1, 1);
    $('receive-goods-tbody').innerHTML = `<tr><td colspan="9" class="empty">請選擇條件搜尋</td></tr>`;
  });
});
