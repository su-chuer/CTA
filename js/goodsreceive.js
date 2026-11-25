document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, toHyphenDate, toSlashDate, toast, alert: openAlertModal } = window.CTA;

  const GOODS_MANAGE_STORAGE_KEY = 'cta_goodsmanage_state_v1';
  const GOODS_RECEIVE_STORAGE_KEY = 'cta_goodsreceive_state_v1';

  const DEFAULT_AREA_REGION_MAP = {
    '金門': '北', '中和': '北', '中山': '北', '大同': '北', '萬華': '北', '信義': '北', '台北': '北',
    '台中': '中', '彰化': '中', '南投': '中', '苗栗': '中', '雲林': '中',
    '台南': '南', '高雄': '南', '屏東': '南', '嘉義': '南',
    '花蓮': '東', '台東': '東', '宜蘭': '東'
  };

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

  const loadReceiveFromStorage = () => {
    try {
      const raw = localStorage.getItem(GOODS_RECEIVE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (_) {
      return null;
    }
  };

  const saveReceiveToStorage = () => {
    try {
      localStorage.setItem(GOODS_RECEIVE_STORAGE_KEY, JSON.stringify({ receiveDatasets }));
    } catch (_) {}
  };

  const loadOrInitGoodsManageState = async () => {
    try {
      const raw = localStorage.getItem(GOODS_MANAGE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}

    try {
      const res = await fetch('json/goods_manage_data.json?v=349', { cache: 'no-store' });
      if (res && res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') {
          localStorage.setItem(GOODS_MANAGE_STORAGE_KEY, JSON.stringify(json));
          return json;
        }
      }
    } catch (_) {}
    return null;
  };

  const syncReceiveDeductionToInventory = async (areaName, itemName, qty = 1, nowRec) => {
    const state = await loadOrInitGoodsManageState();
    if (!state || !areaName || !itemName) return { ok: true };

    if (!state.areaInventoryDatasets || typeof state.areaInventoryDatasets !== 'object') {
      state.areaInventoryDatasets = {};
    }
    if (!state.areaInventoryDatasets[areaName]) {
      state.areaInventoryDatasets[areaName] = {};
    }
    if (!state.areaInventoryDatasets[areaName][itemName]) {
      state.areaInventoryDatasets[areaName][itemName] = {
        safetyStock: 2,
        openingStock: 0,
        movements: []
      };
    }

    const areaItemBook = state.areaInventoryDatasets[areaName][itemName];

    if (!state.counters || typeof state.counters !== 'object') {
      state.counters = { nextMovementId: 500 };
    }
    const movId = Number(state.counters.nextMovementId || 500);
    state.counters.nextMovementId = movId + 1;

    if (!Array.isArray(areaItemBook.movements)) areaItemBook.movements = [];
    areaItemBook.movements.push({
      id: movId,
      date: nowRec.hyphen,
      warehouse: '聯誼領取',
      inQty: 0,
      outQty: qty,
      transferQty: 0,
      diffQty: 0,
      diffReason: '',
      createdAtStr: nowRec.isoMs,
      createdAtMs: nowRec.ms,
      updatedAtStr: nowRec.isoMs,
      updatedAtMs: nowRec.ms
    });

    const areaRegionMap = (state.areaWarehouseRegions && typeof state.areaWarehouseRegions === 'object')
      ? { ...DEFAULT_AREA_REGION_MAP, ...state.areaWarehouseRegions }
      : DEFAULT_AREA_REGION_MAP;
    const parentRegion = areaRegionMap[areaName] || '';

    if (parentRegion) {
      if (!state.regionalInventoryDatasets || typeof state.regionalInventoryDatasets !== 'object') {
        state.regionalInventoryDatasets = {};
      }
      if (!state.regionalInventoryDatasets[parentRegion]) {
        state.regionalInventoryDatasets[parentRegion] = {};
      }
      if (!state.regionalInventoryDatasets[parentRegion][itemName]) {
        state.regionalInventoryDatasets[parentRegion][itemName] = {
          safetyStock: 2,
          openingStock: 0,
          movements: [],
          areaStocks: []
        };
      }
      const regItemBook = state.regionalInventoryDatasets[parentRegion][itemName];
      if (!Array.isArray(regItemBook.areaStocks)) regItemBook.areaStocks = [];
      let areaRow = regItemBook.areaStocks.find(a => a.warehouse === areaName);
      if (!areaRow) {
        areaRow = {
          warehouse: areaName,
          inQty: 0,
          receiveQty: 0,
          transferQty: 0,
          diffQty: 0,
          stockQty: 0
        };
        regItemBook.areaStocks.push(areaRow);
      }
      areaRow.receiveQty = Number(areaRow.receiveQty || 0) + qty;
      areaRow.stockQty = Math.max(0, Number(areaRow.stockQty || 0) - qty);

      if (state.inventoryDatasets && typeof state.inventoryDatasets === 'object') {
        Object.values(state.inventoryDatasets).forEach(whBook => {
          const hqItemRec = whBook && whBook[itemName];
          if (!hqItemRec || !Array.isArray(hqItemRec.regionalStocks)) return;
          const regRow = hqItemRec.regionalStocks.find(r => r.warehouse === parentRegion);
          if (regRow) {
            regRow.receiveQty = Number(regRow.receiveQty || 0) + qty;
            regRow.stockQty = Math.max(0, Number(regRow.stockQty || 0) - qty);
          }
        });
      }
    }

    try {
      localStorage.setItem(GOODS_MANAGE_STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('同步庫存至 localStorage 失敗：', err);
    }

    return { ok: true };
  };

  const dataReady = (async () => {
    const saved = loadReceiveFromStorage();
    if (saved && saved.receiveDatasets && typeof saved.receiveDatasets === 'object') {
      receiveDatasets = saved.receiveDatasets;
      areaOptions = Object.keys(receiveDatasets);
      if (typeof window.CTA.syncRecordedFloorMs === 'function') {
        window.CTA.syncRecordedFloorMs(Object.values(receiveDatasets).flat());
      }
      return;
    }

    const rData = await fetch('json/goods_receive_data.json?v=346', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);

    if (rData && typeof rData === 'object') {
      receiveDatasets = rData.receiveDatasets && typeof rData.receiveDatasets === 'object'
        ? rData.receiveDatasets
        : {};
      areaOptions = Object.keys(receiveDatasets);
      saveReceiveToStorage();
      if (typeof window.CTA.syncRecordedFloorMs === 'function') {
        window.CTA.syncRecordedFloorMs(Object.values(receiveDatasets).flat());
      }
    }
  })();

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

  $('btn-receive-confirm').addEventListener('click', async () => {
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
    const targetArea = activeAreaKey;

    await syncReceiveDeductionToInventory(targetArea, itemName, 1, nowRec);

    activeReceiveRecord.received = true;
    activeReceiveRecord.receiveDate = nowRec.slash;
    activeReceiveRecord.receivedAtStr = nowRec.fullMs;
    activeReceiveRecord.receivedAtMs = nowRec.ms;
    activeReceiveRecord.updatedAtStr = nowRec.fullMs;
    activeReceiveRecord.updatedAtMs = nowRec.ms;

    saveReceiveToStorage();
    closeReceiveModal();
    renderTable(getPendingReceiveList(activeAreaKey));
    toast(`已完成「${personName}」的「${itemName}」領取作業，已同步更新「${targetArea}」領用量。`);
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
