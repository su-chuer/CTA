document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, money, escapeAttr, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  const GOODS_STOCK_STORAGE_KEY = 'cta_goodsstock_state_v1';
  const GOODS_MANAGE_STORAGE_KEY = 'cta_goodsmanage_state_v1';

  let hqWarehouses = [];
  let regionalWarehouses = [];
  let areaWarehousesByRelay = {};
  let goodsItems = ['飛天', '生育禮盒', '賀匾', '法船'];
  let savedSafetyStocksByWarehouse = {};

  let activeTier = '';
  let activeRelay = '';
  let activeWarehouse = '';
  let draftStocks = {}; // { '飛天': 5, ... }

  const saveStateToLocalStorage = () => {
    try {
      localStorage.setItem(GOODS_STOCK_STORAGE_KEY, JSON.stringify({
        safetyStocksByWarehouse: savedSafetyStocksByWarehouse
      }));
    } catch (err) {
      console.error('儲存安全庫存量設定失敗：', err);
    }
  };

  // 同步更新物資庫存管理 (goodsmanage.html) 中的安全庫存量數值，達成跨頁連動
  const syncSafetyStockToGoodsManage = (whName, stockMap) => {
    try {
      const raw = localStorage.getItem(GOODS_MANAGE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      const applyToDataset = (ds) => {
        if (!ds || typeof ds !== 'object' || !ds[whName]) return false;
        let touched = false;
        goodsItems.forEach(item => {
          if (ds[whName][item] && typeof ds[whName][item] === 'object') {
            ds[whName][item].safetyStock = Number(stockMap[item] || 0);
            touched = true;
          }
        });
        return touched;
      };

      const changed =
        applyToDataset(parsed.inventoryDatasets) |
        applyToDataset(parsed.regionalInventoryDatasets) |
        applyToDataset(parsed.areaInventoryDatasets);

      if (changed) {
        localStorage.setItem(GOODS_MANAGE_STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch (_) {}
  };

  const getTierLabel = (tier) => {
    if (tier === 'hq') return '本會倉庫';
    if (tier === 'region') return '中繼倉庫';
    if (tier === 'area') return '作業區倉庫';
    return '';
  };

  const getSelectedTier = () => {
    const checked = document.querySelector('input[name="stock-wh-tier"]:checked');
    return checked ? checked.value : 'hq';
  };

  const triggerBluePulse = (el) => {
    if (!el || el.disabled || el.classList.contains('hidden')) return;
    el.classList.remove('blue-pulse');
    void el.offsetWidth;
    el.classList.add('blue-pulse');
  };

  const clearWarehouseErrors = () => {
    ['stock-wh-hq', 'stock-wh-region', 'stock-wh-area'].forEach(fid => {
      const el = $(fid);
      if (el) el.classList.remove('highlight-error');
    });
  };

  const syncAreaDropdownOptions = (regionFilter = '', preserveArea = false) => {
    const areaSel = $('stock-wh-area');
    const prevArea = preserveArea ? areaSel.value : '';
    const hasRegion = Boolean(regionFilter);
    const candidates = hasRegion && Array.isArray(areaWarehousesByRelay[regionFilter])
      ? areaWarehousesByRelay[regionFilter]
      : [];
    const validArea = candidates.includes(prevArea) ? prevArea : '';
    areaSel.disabled = !hasRegion;
    areaSel.innerHTML = `<option value="" ${validArea ? '' : 'selected'} disabled>請選擇</option>` +
      candidates.map(a => `<option value="${escapeAttr(a)}" ${a === validArea ? 'selected' : ''}>${escapeAttr(a)}</option>`).join('');
  };

  const syncTierUI = (preserveValues = false) => {
    const tier = getSelectedTier();
    const hqSel = $('stock-wh-hq');
    const regSel = $('stock-wh-region');
    const areaSel = $('stock-wh-area');

    clearWarehouseErrors();

    if (!preserveValues) {
      hqSel.value = '';
      regSel.value = '';
      syncAreaDropdownOptions('', false);
    }

    hqSel.classList.toggle('hidden', tier !== 'hq');
    regSel.classList.toggle('hidden', tier === 'hq');
    areaSel.classList.toggle('hidden', tier !== 'area');

    if (tier === 'area') {
      syncAreaDropdownOptions(regSel.value.trim(), preserveValues);
    }

    if (!preserveValues) {
      if (tier === 'hq') {
        triggerBluePulse(hqSel);
      } else {
        triggerBluePulse(regSel);
      }
    }
  };

  const populateDropdowns = () => {
    const hqSel = $('stock-wh-hq');
    const regSel = $('stock-wh-region');

    hqSel.innerHTML = '<option value="" selected disabled>請選擇</option>' +
      hqWarehouses.map(wh => `<option value="${escapeAttr(wh)}">${escapeAttr(wh)}</option>`).join('');

    regSel.innerHTML = '<option value="" selected disabled>請選擇</option>' +
      regionalWarehouses.map(rg => `<option value="${escapeAttr(rg)}">${escapeAttr(rg)}</option>`).join('');

    syncTierUI(false);
  };

  const getSavedStockMapForWarehouse = (whName) => {
    const rawMap = (savedSafetyStocksByWarehouse[whName] && typeof savedSafetyStocksByWarehouse[whName] === 'object')
      ? savedSafetyStocksByWarehouse[whName]
      : {};
    const res = {};
    goodsItems.forEach(item => {
      const val = Number(rawMap[item]);
      res[item] = Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0;
    });
    return res;
  };

  const isDirty = () => {
    if (!activeWarehouse) return false;
    const saved = getSavedStockMapForWarehouse(activeWarehouse);
    return goodsItems.some(item => Number(draftStocks[item] || 0) !== Number(saved[item] || 0));
  };

  const syncFooterAndEditorState = () => {
    const hasActive = Boolean(activeWarehouse);
    const dirty = isDirty();

    $('btn-stock-save').disabled = !hasActive;
    $('btn-stock-revert').disabled = !dirty;

    const hintEl = $('dirty-status-hint');
    if (!hasActive) {
      hintEl.textContent = '請先於右側選擇倉庫並點擊「查詢」';
      hintEl.style.color = '#64748b';
      hintEl.style.fontWeight = '400';
    } else if (dirty) {
      hintEl.textContent = '您已調整安全庫存量，請點擊「儲存」生效。';
      hintEl.style.color = '#0869ed';
      hintEl.style.fontWeight = '600';
    } else {
      hintEl.textContent = '目前尚未有未儲存的變更';
      hintEl.style.color = '#64748b';
      hintEl.style.fontWeight = '400';
    }
  };

  const renderStocksTable = () => {
    const tbody = $('goodsstock-tbody');
    const badgeEl = $('active-warehouse-badge');
    const countEl = $('item-count-display');

    if (!activeWarehouse) {
      badgeEl.textContent = '尚未查詢';
      badgeEl.style.color = '#64748b';
      countEl.textContent = '0';
      tbody.innerHTML = '<tr><td colspan="3" class="empty">請於右側選擇倉庫後點擊「查詢」</td></tr>';
      syncFooterAndEditorState();
      return;
    }

    const displayLabel = activeTier === 'area' && activeRelay
      ? `${getTierLabel(activeTier)}｜${activeRelay} - ${activeWarehouse}`
      : `${getTierLabel(activeTier)}｜${activeWarehouse}`;
    badgeEl.textContent = displayLabel;
    badgeEl.style.color = '#0869ed';
    countEl.textContent = String(goodsItems.length);

    const savedMap = getSavedStockMapForWarehouse(activeWarehouse);

    tbody.innerHTML = goodsItems.map((item, idx) => {
      const curVal = Number.isFinite(Number(draftStocks[item])) ? Math.max(0, Math.floor(Number(draftStocks[item]))) : 0;
      const isModified = curVal !== Number(savedMap[item] || 0);
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td style="font-weight: 600; color: #14264b;">${escapeAttr(item)}</td>
          <td class="num-col">
            <input type="number" class="safety-qty-input ${isModified ? 'is-modified' : ''}" data-item="${escapeAttr(item)}" min="0" step="1" value="${curVal}" aria-label="${escapeAttr(item)}安全庫存量">
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.safety-qty-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const el = e.currentTarget;
        const itemName = el.dataset.item;
        const raw = cleanTrim(el.value);
        if (raw === '') {
          draftStocks[itemName] = 0;
        } else {
          const parsed = Math.max(0, Math.floor(Number(raw) || 0));
          draftStocks[itemName] = parsed;
        }
        const isMod = Number(draftStocks[itemName] || 0) !== Number(savedMap[itemName] || 0);
        el.classList.toggle('is-modified', isMod);
        syncFooterAndEditorState();
      });

      input.addEventListener('blur', (e) => {
        const el = e.currentTarget;
        const itemName = el.dataset.item;
        const val = Math.max(0, Math.floor(Number(draftStocks[itemName]) || 0));
        draftStocks[itemName] = val;
        el.value = String(val);
        const isMod = val !== Number(savedMap[itemName] || 0);
        el.classList.toggle('is-modified', isMod);
        syncFooterAndEditorState();
      });

      input.addEventListener('keydown', (e) => {
        if (['-', '+', '.', 'e', 'E'].includes(e.key)) {
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          elBlurAndSave();
        }
      });
    });

    syncFooterAndEditorState();
  };

  const elBlurAndSave = () => {
    if (document.activeElement && document.activeElement.classList.contains('safety-qty-input')) {
      document.activeElement.blur();
    }
    if (activeWarehouse && !$('btn-stock-save').disabled) {
      $('btn-stock-save').click();
    }
  };

  const loadWarehouseStocks = (tier, relay, whName) => {
    activeTier = tier;
    activeRelay = relay;
    activeWarehouse = whName;
    draftStocks = getSavedStockMapForWarehouse(whName);
    renderStocksTable();
  };

  const loadInitialData = async () => {
    let baseData = null;
    try {
      const res = await fetch('json/goods_stock_data.json?v=414', { cache: 'no-store' });
      if (res && res.ok) {
        baseData = await res.json();
      }
    } catch (err) {
      console.error('讀取 goods_stock_data.json 失敗：', err);
    }

    let cachedStocks = null;
    try {
      const raw = localStorage.getItem(GOODS_STOCK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.safetyStocksByWarehouse && typeof parsed.safetyStocksByWarehouse === 'object') {
          cachedStocks = parsed.safetyStocksByWarehouse;
        }
      }
    } catch (_) {}

    if (baseData && typeof baseData === 'object') {
      hqWarehouses = Array.isArray(baseData.hqWarehouses) ? baseData.hqWarehouses : [];
      regionalWarehouses = Array.isArray(baseData.regionalWarehouses) ? baseData.regionalWarehouses : [];
      areaWarehousesByRelay = (baseData.areaWarehousesByRelay && typeof baseData.areaWarehousesByRelay === 'object')
        ? baseData.areaWarehousesByRelay
        : {};
      if (Array.isArray(baseData.goodsItems) && baseData.goodsItems.length > 0) {
        goodsItems = baseData.goodsItems;
      }
    }

    const rawStocks = cachedStocks !== null
      ? cachedStocks
      : ((baseData && baseData.safetyStocksByWarehouse && typeof baseData.safetyStocksByWarehouse === 'object')
          ? baseData.safetyStocksByWarehouse
          : {});
    savedSafetyStocksByWarehouse = JSON.parse(JSON.stringify(rawStocks));

    populateDropdowns();
    renderStocksTable();
  };

  // 倉庫層級單選切換（本會倉庫 / 中繼倉庫 / 作業區倉庫）
  document.querySelectorAll('input[name="stock-wh-tier"]').forEach(radio => {
    radio.addEventListener('change', () => {
      syncTierUI(false);
    });
  });

  ['stock-wh-hq', 'stock-wh-region', 'stock-wh-area'].forEach(fid => {
    const el = $(fid);
    if (el) {
      el.addEventListener('animationend', () => el.classList.remove('blue-pulse'));
    }
  });

  $('stock-wh-hq').addEventListener('change', () => {
    clearWarehouseErrors();
  });

  $('stock-wh-region').addEventListener('change', (e) => {
    clearWarehouseErrors();
    if (getSelectedTier() === 'area') {
      syncAreaDropdownOptions(e.currentTarget.value, false);
      triggerBluePulse($('stock-wh-area'));
    }
  });

  $('stock-wh-area').addEventListener('change', () => {
    clearWarehouseErrors();
  });

  // 查詢
  const executeSearch = async () => {
    await dataReady;
    const tier = getSelectedTier();
    const hqSel = $('stock-wh-hq');
    const regSel = $('stock-wh-region');
    const areaSel = $('stock-wh-area');

    clearWarehouseErrors();

    let targetRelay = '';
    let targetWh = '';
    let firstInvalid = null;

    if (tier === 'hq') {
      targetWh = hqSel.value.trim();
      if (!targetWh) {
        hqSel.classList.add('highlight-error');
        firstInvalid = hqSel;
      }
    } else if (tier === 'region') {
      targetWh = regSel.value.trim();
      if (!targetWh) {
        regSel.classList.add('highlight-error');
        firstInvalid = regSel;
      }
    } else {
      targetRelay = regSel.value.trim();
      targetWh = areaSel.value.trim();
      if (!targetRelay) {
        regSel.classList.add('highlight-error');
        firstInvalid = regSel;
      } else if (!targetWh) {
        areaSel.classList.add('highlight-error');
        firstInvalid = areaSel;
      }
    }

    if (firstInvalid) {
      const msg = (tier === 'area' && !regSel.value.trim())
        ? '請先選擇「中繼倉庫」，再選擇「作業區倉庫」！'
        : `請先選擇「${getTierLabel(tier)}」！`;
      openAlertModal(msg, () => firstInvalid.focus());
      return;
    }

    const runQuery = () => {
      $('table-loading').classList.remove('hidden');
      setTimeout(() => {
        loadWarehouseStocks(tier, targetRelay, targetWh);
        $('table-loading').classList.add('hidden');
      }, 150);
    };

    if (isDirty() && activeWarehouse && activeWarehouse !== targetWh) {
      openConfirmModal(
        `「${escapeAttr(activeWarehouse)}」的安全庫存量尚未儲存，確定要切換查詢「${escapeAttr(targetWh)}」嗎？`,
        { title: '切換倉庫確認', okClass: 'btn primary', okText: '確定' },
        runQuery
      );
    } else {
      runQuery();
    }
  };

  $('btn-stock-search').addEventListener('click', executeSearch);

  // 清除
  $('btn-stock-reset').addEventListener('click', () => {
    const runReset = () => {
      const defaultRadio = document.querySelector('input[name="stock-wh-tier"][value="hq"]');
      if (defaultRadio) defaultRadio.checked = true;
      syncTierUI(false);
      activeTier = '';
      activeRelay = '';
      activeWarehouse = '';
      draftStocks = {};
      renderStocksTable();
    };

    if (isDirty()) {
      openConfirmModal(
        `「${escapeAttr(activeWarehouse)}」的安全庫存量尚未儲存，確定要清除嗎？`,
        { title: '清除確認', okClass: 'btn primary', okText: '確定' },
        runReset
      );
    } else {
      runReset();
    }
  });

  // 還原變更
  $('btn-stock-revert').addEventListener('click', () => {
    if (!isDirty()) return;
    openConfirmModal(
      `確定要還原「<strong>${escapeAttr(activeWarehouse)}</strong>」尚未儲存的安全庫存量變更嗎？`,
      { title: '還原確認', okClass: 'btn primary', okText: '確定' },
      () => {
        loadWarehouseStocks(activeTier, activeRelay, activeWarehouse);
        toast(`已還原「${activeWarehouse}」的安全庫存量設定`);
      }
    );
  });

  // 儲存
  $('btn-stock-save').addEventListener('click', () => {
    if (!activeWarehouse) return;
    const normalizedMap = {};
    goodsItems.forEach(item => {
      const val = Number(draftStocks[item]);
      normalizedMap[item] = Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0;
    });

    openConfirmModal(
      `確定要儲存「<strong>${escapeAttr(activeWarehouse)}</strong>」的安全庫存量設定嗎？`,
      { title: '儲存確認', okClass: 'btn primary', okText: '確定' },
      () => {
        savedSafetyStocksByWarehouse[activeWarehouse] = { ...normalizedMap };
        draftStocks = { ...normalizedMap };
        saveStateToLocalStorage();
        syncSafetyStockToGoodsManage(activeWarehouse, normalizedMap);
        renderStocksTable();
        toast(`已成功儲存「${activeWarehouse}」的安全庫存量設定。`);
      }
    );
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => isDirty()
  });

  // ==================== 清空名單 & 觀看範例 / 套用範例 ====================
  const fetchFreshGoodsStockJson = async () => {
    const res = await fetch('json/goods_stock_data.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res || !res.ok) throw new Error('無法讀取 goods_stock_data.json');
    return await res.json();
  };

  $('btn-clear-all-sample').addEventListener('click', () => {
    openConfirmModal(
      '確定要清空所有倉庫的安全庫存量設定嗎？<br>清空後所有倉庫各物資安全庫存量將歸零（可隨時點擊「觀看範例」重新套用）。',
      { title: '清空名單確認', okClass: 'btn btn-danger-solid', okText: '確定清空' },
      () => {
        try { localStorage.removeItem(GOODS_STOCK_STORAGE_KEY); } catch (_) {}
        savedSafetyStocksByWarehouse = {};
        if (activeWarehouse) {
          draftStocks = getSavedStockMapForWarehouse(activeWarehouse);
        }
        saveStateToLocalStorage();
        renderStocksTable();
        toast('已清空所有倉庫的安全庫存量設定。');
      }
    );
  });

  const closeSampleModal = () => $('sample-data-modal').classList.add('hidden');
  $('close-sample-modal').addEventListener('click', closeSampleModal);
  $('btn-sample-modal-close').addEventListener('click', closeSampleModal);
  window.CTA.registerModalEsc('sample-data-modal', closeSampleModal);

  let cachedFreshStockSample = null;

  $('btn-view-sample').addEventListener('click', async () => {
    await dataReady;
    try {
      cachedFreshStockSample = await fetchFreshGoodsStockJson();
    } catch (_) {
      cachedFreshStockSample = { safetyStocksByWarehouse: savedSafetyStocksByWarehouse };
    }
    const sampleMap = cachedFreshStockSample.safetyStocksByWarehouse || {};

    const getWhTierName = (wh) => {
      if (hqWarehouses.includes(wh)) return '本會倉庫';
      if (regionalWarehouses.includes(wh)) return '中繼倉庫';
      for (const [rg, list] of Object.entries(areaWarehousesByRelay)) {
        if (Array.isArray(list) && list.includes(wh)) return `作業區倉庫（${rg}）`;
      }
      return '倉庫';
    };

    const entries = Object.entries(sampleMap);

    $('sample-modal-title').textContent = '安全庫存量設定｜預設範例總表';
    $('sample-data-modal-body').innerHTML = `
      <div style="background: #eef5ff; border: 1px solid #c9ddf8; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; color: #14264b; font-size: 14px; line-height: 1.65;">
        <strong>操作說明：</strong><br>
        • 下表為各層級倉庫（本會倉庫、中繼倉庫、作業區倉庫）之 <strong>預設安全庫存量範例</strong>。<br>
        • 點擊下方「<strong>套用此範例資料至系統</strong>」，會自動清除舊快取並載入此份最新設定（並同步更新物資庫存查詢之安全庫存量）。
      </div>

      <div class="table-scroll" style="background: #fff;">
        <table class="detail-table" style="min-width: 720px;">
          <thead>
            <tr>
              <th class="center" style="width: 60px;">序號</th>
              <th style="width: 160px;">倉庫層級</th>
              <th style="width: 140px;">倉庫名稱</th>
              ${goodsItems.map(it => `<th class="num-col">${escapeAttr(it)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${entries.map(([wh, sObj], idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td>${escapeAttr(getWhTierName(wh))}</td>
                <td style="font-weight: 600; color: #14264b;">${escapeAttr(wh)}</td>
                ${goodsItems.map(it => `<td class="num-col">${money(Number((sObj && sObj[it]) || 0))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    $('sample-data-modal').classList.remove('hidden');
  });

  $('btn-load-sample-data').addEventListener('click', async () => {
    try { localStorage.removeItem(GOODS_STOCK_STORAGE_KEY); } catch (_) {}
    const fresh = cachedFreshStockSample || await fetchFreshGoodsStockJson();
    if (fresh && typeof fresh === 'object') {
      if (Array.isArray(fresh.hqWarehouses)) hqWarehouses = fresh.hqWarehouses;
      if (Array.isArray(fresh.regionalWarehouses)) regionalWarehouses = fresh.regionalWarehouses;
      if (fresh.areaWarehousesByRelay && typeof fresh.areaWarehousesByRelay === 'object') {
        areaWarehousesByRelay = fresh.areaWarehousesByRelay;
      }
      if (Array.isArray(fresh.goodsItems) && fresh.goodsItems.length > 0) {
        goodsItems = fresh.goodsItems;
      }
      savedSafetyStocksByWarehouse = (fresh.safetyStocksByWarehouse && typeof fresh.safetyStocksByWarehouse === 'object')
        ? JSON.parse(JSON.stringify(fresh.safetyStocksByWarehouse))
        : {};
    }
    saveStateToLocalStorage();
    Object.entries(savedSafetyStocksByWarehouse).forEach(([wh, sMap]) => {
      syncSafetyStockToGoodsManage(wh, sMap);
    });
    closeSampleModal();
    if (activeWarehouse) {
      draftStocks = getSavedStockMapForWarehouse(activeWarehouse);
    }
    renderStocksTable();
    toast('已清除舊快取並套用最新安全庫存量範例資料至系統。');
  });

  const dataReady = loadInitialData();
});
