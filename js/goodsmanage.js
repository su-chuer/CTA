document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, money, getTodayDates, getNowMsRecord, getRecordTimeMs, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  let currentRole = ''; // '' | 'hq' | 'region' | 'area'
  let myPermittedWarehouses = [];

  let warehouses = [];
  let regionalWarehouses = [];
  let areaWarehouses = [];
  let areaWarehouseRegions = {};
  let goodsItems = [];
  let diffReasons = [];

  let inventoryDatasets = {};
  let regionalInventoryDatasets = {};
  let areaInventoryDatasets = {};
  let vendorInRecords = [];
  let signInRecords = [];
  let transferOutRecords = [];
  let diffRecords = [];

  let nextVendorRecordId = 100;
  let editingVendorRecordId = null;
  let nextSignInRecordId = 100;
  let nextTransferRecordId = 100;
  let editingTransferRecordId = null;
  let nextDiffRecordId = 100;
  let editingDiffRecordId = null;
  let nextMovementId = 500;
  let currentMovements = [];
  const GOODS_MANAGE_ROLE_KEY = 'cta_goodsmanage_role';
  const GOODS_MANAGE_TAB_KEY = 'cta_goodsmanage_active_tab';
  const GOODS_MANAGE_STORAGE_KEY = 'cta_goodsmanage_state_v1';

  const saveGoodsManageSessionUI = (tabKey = '') => {
    try {
      if (currentRole) {
        sessionStorage.setItem(GOODS_MANAGE_ROLE_KEY, currentRole);
      } else {
        sessionStorage.removeItem(GOODS_MANAGE_ROLE_KEY);
      }
      const activeBtn = document.querySelector('#manage-sub-tabs .sub-tab-btn.active');
      const resolvedTab = tabKey || (activeBtn ? activeBtn.dataset.tab : '');
      if (currentRole && resolvedTab) {
        sessionStorage.setItem(GOODS_MANAGE_TAB_KEY, resolvedTab);
      } else if (!currentRole) {
        sessionStorage.removeItem(GOODS_MANAGE_TAB_KEY);
      }
    } catch (_) {}
  };

  const resetUnsavedFieldsOnLoad = () => {
    editingVendorRecordId = null;
    editingTransferRecordId = null;
    editingDiffRecordId = null;

    ['vendor-warehouse', 'vendor-item', 'vendor-qty'].forEach(fid => {
      const el = $(fid);
      if (el) {
        el.value = '';
        el.classList.remove('highlight-error');
      }
    });
    if ($('vendor-edit-actions')) $('vendor-edit-actions').classList.add('hidden');
    if ($('btn-vendor-add')) $('btn-vendor-add').classList.remove('hidden');
    if ($('btn-vendor-reset')) $('btn-vendor-reset').classList.remove('hidden');

    const defaultTransferRadio = document.querySelector('input[name="transfer-mode"][value="出庫"]');
    if (defaultTransferRadio) defaultTransferRadio.checked = true;
    ['transfer-out-warehouse', 'transfer-item', 'transfer-in-warehouse', 'transfer-qty'].forEach(fid => {
      const el = $(fid);
      if (el) {
        el.value = '';
        el.classList.remove('highlight-error');
      }
    });
    if ($('transfer-edit-actions')) $('transfer-edit-actions').classList.add('hidden');
    if ($('btn-transfer-add')) $('btn-transfer-add').classList.remove('hidden');
    if ($('btn-transfer-reset')) $('btn-transfer-reset').classList.remove('hidden');
    if (typeof syncTransferWarehouseDropdowns === 'function') syncTransferWarehouseDropdowns(false);

    const defaultDiffRadio = document.querySelector('input[name="diff-wh-tier"][value="hq"]');
    if (defaultDiffRadio) defaultDiffRadio.checked = true;
    if (typeof syncDiffWarehouseTierUI === 'function') syncDiffWarehouseTierUI(false);
    ['diff-item', 'diff-qty', 'diff-reason'].forEach(fid => {
      const el = $(fid);
      if (el) {
        el.value = '';
        el.classList.remove('highlight-error');
      }
    });
    if ($('diff-edit-actions')) $('diff-edit-actions').classList.add('hidden');
    if ($('btn-diff-add')) $('btn-diff-add').classList.remove('hidden');
    if ($('btn-diff-reset')) $('btn-diff-reset').classList.remove('hidden');
  };

  let vendorSortState = { key: 'date', dir: 'desc' };
  let hasActiveVendorFilter = false;
  let filteredVendorRows = [];

  let signInSortState = { key: 'date', dir: 'desc' };
  let hasActiveSignInFilter = false;
  let filteredSignInRows = [];

  let transferSortState = { key: 'date', dir: 'desc' };
  let hasActiveTransferFilter = false;
  let filteredTransferRows = [];
  let diffSortState = { key: 'date', dir: 'desc' };
  let hasActiveDiffFilter = false;
  let filteredDiffRows = [];

  const getTransferMode = () => {
    const checked = document.querySelector('input[name="transfer-mode"]:checked');
    return checked ? checked.value : '出庫';
  };

  const getWarehouseItemStock = (wh, item) => {
    if (!wh || !item) return 0;
    const hqRec = inventoryDatasets[wh] && inventoryDatasets[wh][item];
    if (hqRec) {
      const opening = Number(hqRec.openingStock || 0);
      const netMov = (Array.isArray(hqRec.movements) ? hqRec.movements : []).reduce((sum, m) => {
        return sum + Number(m.inQty || 0) - Number(m.outQty || 0) + Number(m.diffQty || 0);
      }, 0);
      return Math.max(0, opening + netMov);
    }
    const regRec = regionalInventoryDatasets[wh] && regionalInventoryDatasets[wh][item];
    if (regRec) {
      const opening = Number(regRec.openingStock || 0);
      const netMov = (Array.isArray(regRec.movements) ? regRec.movements : []).reduce((sum, m) => {
        return sum + Number(m.inQty || 0) - Number(m.outQty || 0) + Number(m.transferQty || 0) + Number(m.diffQty || 0);
      }, 0);
      return Math.max(0, opening + netMov);
    }
    const areaRec = areaInventoryDatasets[wh] && areaInventoryDatasets[wh][item];
    if (areaRec) {
      const opening = Number(areaRec.openingStock || 0);
      const netMov = (Array.isArray(areaRec.movements) ? areaRec.movements : []).reduce((sum, m) => {
        return sum + Number(m.inQty || 0) - Number(m.outQty || 0) + Number(m.transferQty || 0) + Number(m.diffQty || 0);
      }, 0);
      return Math.max(0, opening + netMov);
    }
    return 0;
  };

  const getPendingTransferOutQty = (wh, item, excludeTransferId = null) => {
    if (!wh || !item) return 0;
    return transferOutRecords.reduce((sum, r) => {
      if (excludeTransferId != null && r.id === excludeTransferId) return sum;
      if (r.signed || r.returned || r.status === '已簽收' || r.status === '退回') return sum;
      if (r.outWarehouse === wh && r.goodsItem === item) {
        return sum + Number(r.outQty || 0);
      }
      return sum;
    }, 0);
  };

  const getSignedTransferOutQty = (wh, item) => {
    if (!wh || !item) return 0;
    return transferOutRecords.reduce((sum, r) => {
      if ((r.signed || r.status === '已簽收') && r.outWarehouse === wh && r.goodsItem === item) {
        return sum + Number(r.outQty || 0);
      }
      return sum;
    }, 0);
  };

  const formatShippedOutSummary = (signedQty, pendingQty) => {
    if (signedQty > 0 && pendingQty > 0) {
      return `已出貨 ${money(signedQty)} 件、待簽收 ${money(pendingQty)} 件（合計 ${money(signedQty + pendingQty)} 件）`;
    }
    if (signedQty > 0) {
      return `已出貨 ${money(signedQty)} 件`;
    }
    if (pendingQty > 0) {
      return `待簽收出貨 ${money(pendingQty)} 件`;
    }
    return '';
  };

  const updateTransferCurrentStockDisplay = () => {
    const outWh = $('transfer-out-warehouse').value.trim();
    const item = $('transfer-item').value.trim();
    const bookStock = getWarehouseItemStock(outWh, item);
    const pendingQty = getPendingTransferOutQty(outWh, item, editingTransferRecordId);
    const availableStock = Math.max(0, bookStock - pendingQty);
    $('transfer-current-stock').textContent = money(availableStock);
    const pendingEl = $('transfer-pending-stock');
    if (pendingEl) pendingEl.textContent = money(pendingQty);
  };

  const syncTransferWarehouseDropdowns = (preserveSelection = false) => {
    const mode = getTransferMode();
    const outSel = $('transfer-out-warehouse');
    const inSel = $('transfer-in-warehouse');
    const prevOut = preserveSelection ? outSel.value : '';
    const prevIn = preserveSelection ? inSel.value : '';

    let outOptions = [];
    if (currentRole === 'region') {
      outOptions = [...myPermittedWarehouses];
    } else {
      outOptions = mode === '調貨' ? [...regionalWarehouses] : [...warehouses];
    }

    const validOut = outOptions.includes(prevOut) ? prevOut : '';
    outSel.innerHTML = `<option value="" ${validOut ? '' : 'selected'} disabled>請選擇</option>` +
      outOptions.map(wh => `<option value="${wh}" ${wh === validOut ? 'selected' : ''}>${wh}</option>`).join('');

    let rawInOptions = [];
    if (currentRole === 'region') {
      if (mode === '調貨') {
        rawInOptions = regionalWarehouses.filter(wh => wh !== validOut);
      } else {
        rawInOptions = validOut
          ? areaWarehouses.filter(a => areaWarehouseRegions[a] === validOut)
          : [];
      }
    } else {
      rawInOptions = mode === '調貨'
        ? regionalWarehouses.filter(wh => wh !== validOut)
        : [...regionalWarehouses];
    }

    const validIn = rawInOptions.includes(prevIn) ? prevIn : '';
    inSel.innerHTML = `<option value="" ${validIn ? '' : 'selected'} disabled>請選擇</option>` +
      rawInOptions.map(wh => `<option value="${wh}" ${wh === validIn ? 'selected' : ''}>${wh}</option>`).join('');

    $('btn-transfer-add').textContent = mode === '調貨' ? '新增調貨物品' : '新增出庫物品';
    updateTransferCurrentStockDisplay();
  };

  const getDiffWarehouseTier = () => {
    const checked = document.querySelector('input[name="diff-wh-tier"]:checked');
    return checked ? checked.value : 'hq';
  };

  const syncDiffAreaOptions = (regionFilter = '', preserveArea = false) => {
    const areaSel = $('diff-wh-area');
    const prevArea = preserveArea ? areaSel.value : '';
    const hasRegion = Boolean(regionFilter);
    const candidates = hasRegion
      ? areaWarehouses.filter(a => areaWarehouseRegions[a] === regionFilter)
      : [];
    const validArea = candidates.includes(prevArea) ? prevArea : '';
    areaSel.disabled = !hasRegion;
    areaSel.innerHTML = `<option value="" ${validArea ? '' : 'selected'} disabled>請選擇</option>` +
      candidates.map(a => `<option value="${a}" ${a === validArea ? 'selected' : ''}>${a}</option>`).join('');
  };

  const triggerDiffBluePulse = (el) => {
    if (!el || el.disabled || el.classList.contains('hidden')) return;
    el.classList.remove('blue-pulse');
    void el.offsetWidth;
    el.classList.add('blue-pulse');
  };

  const syncDiffWarehouseTierUI = (preserveValues = false) => {
    const tier = getDiffWarehouseTier();
    const hqSel = $('diff-wh-hq');
    const regSel = $('diff-wh-region');
    const areaSel = $('diff-wh-area');

    [hqSel, regSel, areaSel].forEach(el => el.classList.remove('highlight-error'));

    if (!preserveValues) {
      hqSel.value = '';
      regSel.value = '';
      syncDiffAreaOptions('', false);
    }

    hqSel.classList.toggle('hidden', tier !== 'hq');
    regSel.classList.toggle('hidden', tier === 'hq');
    areaSel.classList.toggle('hidden', tier !== 'area');

    if (tier === 'area') {
      syncDiffAreaOptions(regSel.value.trim(), preserveValues);
    }

    if (!preserveValues) {
      if (tier === 'hq') {
        triggerDiffBluePulse(hqSel);
      } else {
        triggerDiffBluePulse(regSel);
      }
    }
  };

  const populateSelectOptions = () => {
    // 1. 庫存查詢：物品 *（不含「全部」）
    const queryItemSel = $('filter-item');
    if (queryItemSel) {
      const prevQueryItem = queryItemSel.value;
      queryItemSel.innerHTML = `<option value="" ${prevQueryItem ? '' : 'selected'} disabled>請選擇</option>` +
        goodsItems.map(item => `<option value="${item}" ${item === prevQueryItem ? 'selected' : ''}>${item}</option>`).join('');
    }

    // 2. 廠商入庫、簽收入庫、出庫 / 調貨、盤差作業：查詢條件物品選項（含「全部」）
    const defaultAllItemIds = new Set(['vendor-query-item', 'signin-query-item', 'transfer-query-item', 'diff-query-item']);
    ['vendor-query-item', 'signin-query-item', 'transfer-query-item', 'diff-query-item'].forEach(selId => {
      const sel = $(selId);
      if (!sel) return;
      const isDefaultAll = defaultAllItemIds.has(selId);
      const prev = sel.value || (isDefaultAll ? '全部' : '');
      const placeholderHtml = isDefaultAll
        ? ''
        : `<option value="" ${prev ? '' : 'selected'} disabled>請選擇</option>`;
      sel.innerHTML = `${placeholderHtml}
        <option value="全部" ${prev === '全部' ? 'selected' : ''}>全部</option>` +
        goodsItems.map(item => `<option value="${item}" ${item === prev ? 'selected' : ''}>${item}</option>`).join('');
    });

    // 2. 廠商入庫：入庫倉庫 * & 物品 *
    const vendorWhSel = $('vendor-warehouse');
    const prevVendorWh = vendorWhSel.value;
    vendorWhSel.innerHTML = `<option value="" ${prevVendorWh ? '' : 'selected'} disabled>請選擇</option>` +
      warehouses.map(wh => `<option value="${wh}" ${wh === prevVendorWh ? 'selected' : ''}>${wh}</option>`).join('');

    const vendorItemSel = $('vendor-item');
    const prevVendorItem = vendorItemSel.value;
    vendorItemSel.innerHTML = `<option value="" ${prevVendorItem ? '' : 'selected'} disabled>請選擇</option>` +
      goodsItems.map(item => `<option value="${item}" ${item === prevVendorItem ? 'selected' : ''}>${item}</option>`).join('');

    // 3. 出庫 / 調貨：物品 * & 倉庫
    const transferItemSel = $('transfer-item');
    const prevTransferItem = transferItemSel.value;
    transferItemSel.innerHTML = `<option value="" ${prevTransferItem ? '' : 'selected'} disabled>請選擇</option>` +
      goodsItems.map(item => `<option value="${item}" ${item === prevTransferItem ? 'selected' : ''}>${item}</option>`).join('');
    syncTransferWarehouseDropdowns(true);

    // 4. 盤差維護：三層倉庫、物品 *、盤差原因 *
    const diffHqSel = $('diff-wh-hq');
    const prevDiffHq = diffHqSel.value;
    diffHqSel.innerHTML = `<option value="" ${prevDiffHq ? '' : 'selected'} disabled>請選擇</option>` +
      warehouses.map(wh => `<option value="${wh}" ${wh === prevDiffHq ? 'selected' : ''}>${wh}</option>`).join('');

    const diffRegSel = $('diff-wh-region');
    const prevDiffReg = diffRegSel.value;
    diffRegSel.innerHTML = `<option value="" ${prevDiffReg ? '' : 'selected'} disabled>請選擇</option>` +
      regionalWarehouses.map(rg => `<option value="${rg}" ${rg === prevDiffReg ? 'selected' : ''}>${rg}</option>`).join('');

    syncDiffWarehouseTierUI(true);

    const diffItemSel = $('diff-item');
    const prevDiffItem = diffItemSel.value;
    diffItemSel.innerHTML = `<option value="" ${prevDiffItem ? '' : 'selected'} disabled>請選擇</option>` +
      goodsItems.map(item => `<option value="${item}" ${item === prevDiffItem ? 'selected' : ''}>${item}</option>`).join('');

    const diffReasonSel = $('diff-reason');
    const prevDiffReason = diffReasonSel.value;
    diffReasonSel.innerHTML = `<option value="" ${prevDiffReason ? '' : 'selected'} disabled>請選擇</option>` +
      diffReasons.map(rs => `<option value="${rs}" ${rs === prevDiffReason ? 'selected' : ''}>${rs}</option>`).join('');
  };

  const REGIONAL_WAREHOUSE_ORDER = ['北', '中', '南', '東'];

  const sortRegionalStocksFixedOrder = (rows) => {
    const list = Array.isArray(rows) ? [...rows] : [];
    return list.sort((a, b) => {
      const ia = REGIONAL_WAREHOUSE_ORDER.indexOf(String(a && a.warehouse || '').trim());
      const ib = REGIONAL_WAREHOUSE_ORDER.indexOf(String(b && b.warehouse || '').trim());
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });
  };

  const strokeCollator = new Intl.Collator('zh-Hant-u-co-stroke', { sensitivity: 'variant', numeric: true });

  const numericSortKeys = new Set(['inQty', 'outQty', 'diffQty', 'receiveQty', 'transferQty', 'stockQty']);

  const sortRowsByState = (rows, sortState, fallbackDateDesc = false) => {
    const list = Array.isArray(rows) ? [...rows] : [];
    const { key, dir } = sortState || {};
    if (!key || !dir) return list;
    const factor = dir === 'asc' ? 1 : -1;

    return list.sort((a, b) => {
      let cmp = 0;
      if (numericSortKeys.has(key)) {
        cmp = Number(a[key] || 0) - Number(b[key] || 0);
      } else if (key === 'date') {
        cmp = String(a.date || '').localeCompare(String(b.date || ''));
        if (cmp === 0) {
          cmp = getRecordTimeMs(a) - getRecordTimeMs(b);
        }
      } else {
        const sa = String(a[key] || '').trim();
        const sb = String(b[key] || '').trim();
        if (!sa && !sb) {
          cmp = 0;
        } else if (!sa) {
          return 1;
        } else if (!sb) {
          return -1;
        } else {
          const ia = REGIONAL_WAREHOUSE_ORDER.indexOf(sa);
          const ib = REGIONAL_WAREHOUSE_ORDER.indexOf(sb);
          if (ia !== -1 && ib !== -1) {
            cmp = ia - ib;
          } else {
            cmp = strokeCollator.compare(sa, sb);
          }
        }
      }
      if (cmp !== 0) return cmp * factor;
      if (fallbackDateDesc && key !== 'date') {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        const msCmp = getRecordTimeMs(b) - getRecordTimeMs(a);
        if (msCmp !== 0) return msCmp;
      }
      if (fallbackDateDesc) {
        return Number(b.id || 0) - Number(a.id || 0);
      }
      return 0;
    });
  };

  const buildSortableTh = (label, sortKey, currentState, extraClass = '') => {
    const isActive = currentState && currentState.key === sortKey && Boolean(currentState.dir);
    const dir = isActive ? currentState.dir : '';
    const icon = dir === 'asc' ? '▲' : (dir === 'desc' ? '▼' : '⇅');
    const ariaSort = dir === 'asc' ? 'ascending' : (dir === 'desc' ? 'descending' : 'none');
    const cls = [extraClass, 'sortable', isActive ? 'is-sorted' : ''].filter(Boolean).join(' ');
    return `<th class="${cls}" data-sort="${sortKey}" aria-sort="${ariaSort}" title="點擊排序">${label}<span class="sort-icon" aria-hidden="true">${icon}</span></th>`;
  };

  const cycleSortState = (currentState, clickedKey, numericKeys = []) => {
    if (clickedKey === 'date') {
      return {
        key: 'date',
        dir: (currentState.key === 'date' && currentState.dir === 'desc') ? 'asc' : 'desc'
      };
    }
    const isNumeric = numericKeys.includes(clickedKey);
    const firstDir = isNumeric ? 'desc' : 'asc';
    const secondDir = isNumeric ? 'asc' : 'desc';
    if (currentState.key !== clickedKey) {
      return { key: clickedKey, dir: firstDir };
    }
    if (currentState.dir === firstDir) {
      return { key: clickedKey, dir: secondDir };
    }
    return { key: 'date', dir: 'desc' };
  };

  const bindRecordQueryFilter = ({
    inputId, wrapId, menuId, clearBtnId, toggleBtnId,
    itemId, startId, endId, searchBtnId, resetBtnId, loadingId,
    warehouseLabel = '倉庫',
    requireWarehouse = true,
    onSearch, onReset
  }) => {
    const whInput = $(inputId);
    const combo = window.CTA.createComboSelect({
      inputId, wrapId, menuId, clearBtnId, toggleBtnId,
      getOptions: () => myPermittedWarehouses,
      beforeOpen: () => dataReady,
      emptyText: '無相符倉庫',
      onEnter: () => execute()
    });

    [itemId, startId, endId].forEach(fid => {
      const el = $(fid);
      if(el) {
        el.addEventListener('change', (e) => e.target.classList.remove('highlight-error'));
        el.addEventListener('input', (e) => e.target.classList.remove('highlight-error'));
      }
    });

    const execute = async () => {
      const rawWarehouse = cleanTrim(whInput.value);
      const itemVal = $(itemId).value.trim();
      const startVal = $(startId).value.trim();
      const endVal = $(endId).value.trim();

      whInput.value = rawWarehouse;
      [inputId, itemId, startId, endId].forEach(fid => $(fid).classList.remove('highlight-error'));

      let firstInvalid = null;
      if (requireWarehouse && !rawWarehouse) { $(inputId).classList.add('highlight-error'); firstInvalid = firstInvalid || $(inputId); }
      if (!itemVal) { $(itemId).classList.add('highlight-error'); firstInvalid = firstInvalid || $(itemId); }
      if (!startVal) { $(startId).classList.add('highlight-error'); firstInvalid = firstInvalid || $(startId); }
      if (!endVal) { $(endId).classList.add('highlight-error'); firstInvalid = firstInvalid || $(endId); }

      if (firstInvalid) {
        firstInvalid.focus();
        const reqFieldsText = requireWarehouse
          ? `${warehouseLabel}、物品、起始日、結束日`
          : '物品、起始日、結束日';
        openAlertModal(`請完整填寫必填查詢條件（${reqFieldsText}）！`);
        return;
      }
      if (startVal > endVal) {
        $(startId).classList.add('highlight-error');
        $(endId).classList.add('highlight-error');
        $(startId).focus();
        openAlertModal('起始日不可大於結束日！');
        return;
      }

      combo.close();
      $(loadingId).classList.remove('hidden');
      await dataReady;

      setTimeout(() => {
        const matchedWarehouse = rawWarehouse
          ? window.CTA.resolveOptionKey(rawWarehouse, myPermittedWarehouses)
          : '';
        if (matchedWarehouse) combo.setValue(matchedWarehouse);
        onSearch({ rawWarehouse, matchedWarehouse, itemVal, startVal, endVal });
        $(loadingId).classList.add('hidden');
      }, 220);
    };

    const applyDefaultTodayDates = () => {
      const todayHyphen = getTodayDates().hyphen;
      if ($(startId)) $(startId).value = todayHyphen;
      if ($(endId)) $(endId).value = todayHyphen;
    };
    applyDefaultTodayDates();

    const reset = () => {
      combo.setValue('');
      combo.close();
      const defaultAllItemIds = new Set(['vendor-query-item', 'signin-query-item', 'transfer-query-item', 'diff-query-item']);
      $(itemId).value = defaultAllItemIds.has(itemId) ? '全部' : '';
      applyDefaultTodayDates();
      [inputId, itemId, startId, endId].forEach(fid => $(fid).classList.remove('highlight-error'));
      onReset();
    };

    $(searchBtnId).addEventListener('click', execute);
    $(resetBtnId).addEventListener('click', reset);
    return { combo, reset };
  };

  // ==================== 分頁二：廠商入庫（列表與排序） ====================
  const vendorPager = window.CTA.createPagination({
    containerId: 'vendor-pagination',
    perPageId: 'vendor-per-page-select',
    prevId: 'vendor-page-prev',
    nextId: 'vendor-page-next',
    numbersId: 'vendor-page-numbers',
    totalPagesId: 'vendor-total-pages',
    totalItemsId: 'vendor-total-items',
    onChange: () => renderVendorInTable()
  });

  const syncVendorTableHeaders = () => {
    const thead = $('vendor-in-thead');
    if (!thead) return;
    thead.innerHTML = `<tr>
      <th class="center" style="width: 68px;">序號</th>
      ${buildSortableTh('入庫日期', 'date', vendorSortState)}
      ${buildSortableTh('入庫倉庫', 'warehouse', vendorSortState)}
      ${buildSortableTh('物品', 'goodsItem', vendorSortState)}
      ${buildSortableTh('入庫數量', 'inQty', vendorSortState, 'num-col')}
      ${buildSortableTh('入庫人員', 'operator', vendorSortState)}
      <th class="center" style="width: 80px;">編輯</th>
    </tr>`;
  };

  const enterVendorEditMode = (record) => {
    if (!record) return;
    editingVendorRecordId = record.id;
    ['vendor-warehouse', 'vendor-item', 'vendor-qty'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });
    $('vendor-warehouse').value = record.warehouse || '';
    $('vendor-item').value = record.goodsItem || '';
    $('vendor-qty').value = record.inQty != null ? record.inQty : '';

    $('btn-vendor-add').classList.add('hidden');
    $('btn-vendor-reset').classList.add('hidden');
    $('vendor-edit-actions').classList.remove('hidden');
    renderVendorInTable();
  };

  const exitVendorEditMode = () => {
    editingVendorRecordId = null;
    ['vendor-warehouse', 'vendor-item', 'vendor-qty'].forEach(fid => {
      const el = $(fid);
      el.value = '';
      el.classList.remove('highlight-error');
    });
    $('vendor-edit-actions').classList.add('hidden');
    $('btn-vendor-add').classList.remove('hidden');
    $('btn-vendor-reset').classList.remove('hidden');
    renderVendorInTable();
  };

  const vendorFilter = bindRecordQueryFilter({
    inputId: 'vendor-query-warehouse', wrapId: 'vendor-wh-combo-wrap', menuId: 'vendor-wh-combo-menu',
    clearBtnId: 'btn-clear-vendor-wh', toggleBtnId: 'btn-toggle-vendor-wh',
    itemId: 'vendor-query-item', startId: 'vendor-query-start-date', endId: 'vendor-query-end-date',
    searchBtnId: 'btn-vendor-search', resetBtnId: 'btn-vendor-query-reset', loadingId: 'vendor-loading',
    warehouseLabel: '倉庫入庫',
    requireWarehouse: false,
    onSearch: ({ rawWarehouse, matchedWarehouse, itemVal, startVal, endVal }) => {
      hasActiveVendorFilter = true;
      filteredVendorRows = vendorInRecords.filter(r => {
        if (rawWarehouse && (!matchedWarehouse || r.warehouse !== matchedWarehouse)) return false;
        if (itemVal !== '全部' && r.goodsItem !== itemVal) return false;
        const d = String(r.date || '').trim();
        if (startVal && d < startVal) return false;
        if (endVal && d > endVal) return false;
        return true;
      });
      vendorPager.setPage(1);
      renderVendorInTable();
    },
    onReset: () => {
      hasActiveVendorFilter = false;
      filteredVendorRows = [];
      vendorPager.setPage(1);
      renderVendorInTable();
    }
  });

  const renderVendorInTable = () => {
    const tbody = $('vendor-in-tbody');
    syncVendorTableHeaders();

    if (!hasActiveVendorFilter) {
      $('vendor-count-display').textContent = '0';
      tbody.innerHTML = `<tr><td colspan="7" class="empty">請選擇條件搜尋</td></tr>`;
      vendorPager.render(0, 1, 1);
      return;
    }

    const list = sortRowsByState(filteredVendorRows, vendorSortState, true);
    $('vendor-count-display').textContent = String(list.length);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">查無符合條件的資料</td></tr>`;
      vendorPager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = vendorPager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, vendorPager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = list.slice(startIndex, startIndex + itemsPerPage);
    vendorPager.render(list.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((row, idx) => `
      <tr class="${row.id === editingVendorRecordId ? 'is-editing-row' : ''}">
        <td class="center">${startIndex + idx + 1}</td>
        <td>${row.date || ''}</td>
        <td>${row.warehouse || ''}</td>
        <td>${row.goodsItem || ''}</td>
        <td class="num-col">${money(row.inQty)}</td>
        <td>${row.operator || '蘇2'}</td>
        <td class="center"><button type="button" class="btn primary small btn-vendor-edit" data-id="${row.id}">編輯</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-vendor-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const rec = vendorInRecords.find(r => r.id === id);
        if (rec) enterVendorEditMode(rec);
      });
    });
  };

  $('vendor-in-thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable[data-sort]');
    if (!th) return;
    vendorSortState = cycleSortState(vendorSortState, th.dataset.sort, ['inQty']);
    vendorPager.setPage(1);
    renderVendorInTable();
  });

  // ==================== 分頁三：簽收入庫（列表、排序與簽收） ====================
  const signInPager = window.CTA.createPagination({
    containerId: 'signin-pagination',
    perPageId: 'signin-per-page-select',
    prevId: 'signin-page-prev',
    nextId: 'signin-page-next',
    numbersId: 'signin-page-numbers',
    totalPagesId: 'signin-total-pages',
    totalItemsId: 'signin-total-items',
    onChange: () => renderSignInTable()
  });

  const syncSignInTableHeaders = () => {
    const thead = $('sign-in-thead');
    if (!thead) return;
    thead.innerHTML = `<tr>
      <th class="center" style="width: 68px;">序號</th>
      ${buildSortableTh('出庫日期', 'date', signInSortState)}
      ${buildSortableTh('出庫倉庫', 'outWarehouse', signInSortState)}
      ${buildSortableTh('物品', 'goodsItem', signInSortState)}
      ${buildSortableTh('出庫數量', 'outQty', signInSortState, 'num-col')}
      ${buildSortableTh('入庫倉庫', 'inWarehouse', signInSortState)}
      ${buildSortableTh('出庫人員', 'operator', signInSortState)}
      <th class="center" style="width: 152px;">簽收</th>
    </tr>`;
  };

  const getRoleFilteredSignInRecords = () => {
    const all = Array.isArray(signInRecords) ? signInRecords : [];
    if (currentRole === 'hq') {
      return all.filter(r => (warehouses.includes(r.inWarehouse) || warehouses.includes(r.outWarehouse)) && !r.returned && r.status !== '退回');
    }
    if (currentRole === 'region') {
      return all.filter(r => (regionalWarehouses.includes(r.inWarehouse) || regionalWarehouses.includes(r.outWarehouse)) && !r.returned && r.status !== '退回');
    }
    return all.filter(r => areaWarehouses.includes(r.inWarehouse) && !r.returned && r.status !== '退回');
  };

  const getSignInOutWarehouseOptions = () => {
    if (currentRole === 'hq') return [...warehouses, ...regionalWarehouses];
    if (currentRole === 'region') return [...warehouses, ...regionalWarehouses];
    return [...regionalWarehouses];
  };

  const getSignInInWarehouseOptions = () => {
    if (currentRole === 'hq') return [...warehouses, ...regionalWarehouses];
    if (currentRole === 'region') return [...regionalWarehouses, ...areaWarehouses];
    return [...areaWarehouses];
  };

  const signinFilter = (() => {
    const outWhInput = $('signin-query-out-warehouse');
    const inWhInput = $('signin-query-in-warehouse');

    const outCombo = window.CTA.createComboSelect({
      inputId: 'signin-query-out-warehouse',
      wrapId: 'signin-out-wh-combo-wrap',
      menuId: 'signin-out-wh-combo-menu',
      clearBtnId: 'btn-clear-signin-out-wh',
      toggleBtnId: 'btn-toggle-signin-out-wh',
      getOptions: () => getSignInOutWarehouseOptions(),
      beforeOpen: () => dataReady,
      emptyText: '無相符倉庫',
      onEnter: () => execute()
    });

    const inCombo = window.CTA.createComboSelect({
      inputId: 'signin-query-in-warehouse',
      wrapId: 'signin-in-wh-combo-wrap',
      menuId: 'signin-in-wh-combo-menu',
      clearBtnId: 'btn-clear-signin-in-wh',
      toggleBtnId: 'btn-toggle-signin-in-wh',
      getOptions: () => getSignInInWarehouseOptions(),
      beforeOpen: () => dataReady,
      emptyText: '無相符倉庫',
      onEnter: () => execute()
    });

    ['signin-query-item', 'signin-query-start-date', 'signin-query-end-date'].forEach(fid => {
      const el = $(fid);
      if (el) {
        el.addEventListener('change', (e) => e.target.classList.remove('highlight-error'));
        el.addEventListener('input', (e) => e.target.classList.remove('highlight-error'));
      }
    });

    const execute = async () => {
      const rawOutWh = cleanTrim(outWhInput.value);
      const rawInWh = cleanTrim(inWhInput.value);
      const itemVal = $('signin-query-item').value.trim();
      const startVal = $('signin-query-start-date').value.trim();
      const endVal = $('signin-query-end-date').value.trim();

      outWhInput.value = rawOutWh;
      inWhInput.value = rawInWh;
      ['signin-query-out-warehouse', 'signin-query-in-warehouse', 'signin-query-item', 'signin-query-start-date', 'signin-query-end-date'].forEach(fid => {
        $(fid).classList.remove('highlight-error');
      });

      let firstInvalid = null;
      if (!itemVal) {
        $('signin-query-item').classList.add('highlight-error');
        firstInvalid = firstInvalid || $('signin-query-item');
      }
      if (!startVal) {
        $('signin-query-start-date').classList.add('highlight-error');
        firstInvalid = firstInvalid || $('signin-query-start-date');
      }
      if (!endVal) {
        $('signin-query-end-date').classList.add('highlight-error');
        firstInvalid = firstInvalid || $('signin-query-end-date');
      }

      if (firstInvalid) {
        firstInvalid.focus();
        openAlertModal('請完整填寫必填查詢條件（物品、起始日、結束日）！');
        return;
      }

      if (startVal > endVal) {
        $('signin-query-start-date').classList.add('highlight-error');
        $('signin-query-end-date').classList.add('highlight-error');
        $('signin-query-start-date').focus();
        openAlertModal('起始日不可大於結束日！');
        return;
      }

      outCombo.close();
      inCombo.close();
      $('signin-loading').classList.remove('hidden');
      await dataReady;

      setTimeout(() => {
        const outOptions = getSignInOutWarehouseOptions();
        const inOptions = getSignInInWarehouseOptions();
        const matchedOutWh = rawOutWh ? window.CTA.resolveOptionKey(rawOutWh, outOptions) : '';
        const matchedInWh = rawInWh ? window.CTA.resolveOptionKey(rawInWh, inOptions) : '';
        if (matchedOutWh) outCombo.setValue(matchedOutWh);
        if (matchedInWh) inCombo.setValue(matchedInWh);

        hasActiveSignInFilter = true;
        const baseList = getRoleFilteredSignInRecords().filter(r => !r.returned && r.status !== '退回');
        filteredSignInRows = baseList.filter(r => {
          if (r.returned || r.status === '退回') return false;
          if (rawOutWh && (!matchedOutWh || r.outWarehouse !== matchedOutWh)) return false;
          if (rawInWh && (!matchedInWh || r.inWarehouse !== matchedInWh)) return false;
          if (itemVal !== '全部' && r.goodsItem !== itemVal) return false;
          const d = String(r.date || '').trim();
          if (startVal && d < startVal) return false;
          if (endVal && d > endVal) return false;
          return true;
        });
        signInPager.setPage(1);
        renderSignInTable();
        $('signin-loading').classList.add('hidden');
      }, 220);
    };

    const applySigninDefaults = () => {
      const todayHyphen = getTodayDates().hyphen;
      if ($('signin-query-item')) $('signin-query-item').value = '全部';
      if ($('signin-query-start-date')) $('signin-query-start-date').value = todayHyphen;
      if ($('signin-query-end-date')) $('signin-query-end-date').value = todayHyphen;
    };
    applySigninDefaults();

    const reset = () => {
      outCombo.setValue('');
      outCombo.close();
      inCombo.setValue('');
      inCombo.close();
      applySigninDefaults();
      ['signin-query-out-warehouse', 'signin-query-in-warehouse', 'signin-query-item', 'signin-query-start-date', 'signin-query-end-date'].forEach(fid => {
        $(fid).classList.remove('highlight-error');
      });
      hasActiveSignInFilter = false;
      filteredSignInRows = [];
      signInPager.setPage(1);
      renderSignInTable();
    };

    $('btn-signin-search').addEventListener('click', execute);
    $('btn-signin-query-reset').addEventListener('click', reset);
    return { outCombo, inCombo, reset };
  })();

  const renderSignInTable = () => {
    const tbody = $('sign-in-tbody');
    syncSignInTableHeaders();

    if (!hasActiveSignInFilter) {
      $('signin-count-display').textContent = '0';
      $('signin-pending-pill').textContent = '待簽收：0 筆';
      tbody.innerHTML = `<tr><td colspan="8" class="empty">請選擇條件搜尋</td></tr>`;
      signInPager.render(0, 1, 1);
      return;
    }

    const sourceList = filteredSignInRows.filter(r => !r.returned && r.status !== '退回');
    const list = sortRowsByState(sourceList, signInSortState, true);

    $('signin-count-display').textContent = String(list.length);
    const pendingCount = list.filter(r => !r.signed && !r.returned).length;
    $('signin-pending-pill').textContent = `待簽收：${pendingCount} 筆`;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">查無符合條件的資料</td></tr>`;
      signInPager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = signInPager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, signInPager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = list.slice(startIndex, startIndex + itemsPerPage);
    signInPager.render(list.length, totalPages, currentPage);

    const findLinkedTransferRecord = (signRec) => {
      if (!signRec) return null;
      if (signRec.transferId != null) {
        const direct = transferOutRecords.find(t => t.id === signRec.transferId);
        if (direct) return direct;
      }
      return transferOutRecords.find(t =>
        !t.signed &&
        !t.returned &&
        t.date === signRec.date &&
        t.outWarehouse === signRec.outWarehouse &&
        t.inWarehouse === signRec.inWarehouse &&
        t.goodsItem === signRec.goodsItem &&
        Number(t.outQty || 0) === Number(signRec.outQty || 0)
      ) || null;
    };

    tbody.innerHTML = pageData.map((row, idx) => {
      let actionHtml = '';
      if (row.returned || row.status === '退回') {
        actionHtml = '<span class="status-badge revise">退回</span>';
      } else if (!row.signed) {
        actionHtml = `
          <div style="display: inline-flex; gap: 6px; justify-content: center; align-items: center;">
            <button type="button" class="btn primary small btn-sign-receive" data-id="${row.id}">簽收</button>
            <button type="button" class="btn btn-danger-solid small btn-sign-return" data-id="${row.id}">退回</button>
          </div>
        `;
      }
      return `
        <tr>
          <td class="center">${startIndex + idx + 1}</td>
          <td>${row.date || ''}</td>
          <td>${row.outWarehouse || ''}</td>
          <td>${row.goodsItem || ''}</td>
          <td class="num-col">${money(row.outQty)}</td>
          <td>${row.inWarehouse || ''}</td>
          <td>${row.operator || '蘇2'}</td>
          <td class="center">${actionHtml}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-sign-receive').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const rec = signInRecords.find(r => r.id === id);
        if (!rec || rec.signed || rec.returned) return;
        openConfirmModal(
          `您確定要簽收「<strong>${rec.outWarehouse} → ${rec.inWarehouse}</strong>」的「<strong>${rec.goodsItem}（${money(rec.outQty)} 件）</strong>」嗎？`,
          '確定',
          () => {
            const signNow = getNowMsRecord();
            const qty = Number(rec.outQty || 0);
            const outAvailable = getWarehouseItemStock(rec.outWarehouse, rec.goodsItem);
            if (qty > outAvailable) {
              openAlertModal(`「${rec.outWarehouse} - ${rec.goodsItem}」目前存量僅剩 ${money(outAvailable)} 件，不足以完成 ${money(qty)} 件簽收！`);
              return;
            }

            rec.signed = true;
            rec.returned = false;
            rec.status = '已簽收';
            rec.signedAtStr = signNow.isoMs;
            rec.signedAtMs = signNow.ms;
            rec.updatedAtStr = signNow.isoMs;
            rec.updatedAtMs = signNow.ms;

            // 簽收確認後，才正式扣減「出庫倉庫」庫存並增加「入庫倉庫」庫存
            if (warehouses.includes(rec.outWarehouse)) {
              if (!inventoryDatasets[rec.outWarehouse]) inventoryDatasets[rec.outWarehouse] = {};
              if (!inventoryDatasets[rec.outWarehouse][rec.goodsItem]) {
                inventoryDatasets[rec.outWarehouse][rec.goodsItem] = {
                  safetyStock: 0,
                  openingStock: 0,
                  movements: [],
                  regionalStocks: []
                };
              }
              const outMovNow = getNowMsRecord();
              inventoryDatasets[rec.outWarehouse][rec.goodsItem].movements.push({
                id: nextMovementId++,
                date: outMovNow.hyphen,
                warehouse: rec.inWarehouse,
                inQty: 0,
                outQty: qty,
                diffQty: 0,
                diffReason: '',
                createdAtStr: outMovNow.isoMs,
                createdAtMs: outMovNow.ms,
                updatedAtStr: outMovNow.isoMs,
                updatedAtMs: outMovNow.ms
              });
            } else if (regionalWarehouses.includes(rec.outWarehouse)) {
              const isTransferBetweenRegions = regionalWarehouses.includes(rec.inWarehouse);
              const isToAreaWarehouse = areaWarehouses.includes(rec.inWarehouse);
              if (!regionalInventoryDatasets[rec.outWarehouse]) regionalInventoryDatasets[rec.outWarehouse] = {};
              if (!regionalInventoryDatasets[rec.outWarehouse][rec.goodsItem]) {
                regionalInventoryDatasets[rec.outWarehouse][rec.goodsItem] = {
                  safetyStock: 2,
                  openingStock: 0,
                  movements: [],
                  areaStocks: []
                };
              }
              const regItemBook = regionalInventoryDatasets[rec.outWarehouse][rec.goodsItem];
              if (!isToAreaWarehouse) {
                const outRegMovNow = getNowMsRecord();
                regItemBook.movements.push({
                  id: nextMovementId++,
                  date: outRegMovNow.hyphen,
                  warehouse: rec.inWarehouse,
                  inQty: 0,
                  outQty: isTransferBetweenRegions ? 0 : qty,
                  transferQty: isTransferBetweenRegions ? -qty : 0,
                  diffQty: 0,
                  diffReason: '',
                  createdAtStr: outRegMovNow.isoMs,
                  createdAtMs: outRegMovNow.ms,
                  updatedAtStr: outRegMovNow.isoMs,
                  updatedAtMs: outRegMovNow.ms
                });
              } else {
                // 出庫至下轄作業區倉庫（如：北 → 台北）：反映在下方「作業區庫存明細」，不混入上方中繼區倉庫明細
                if (!Array.isArray(regItemBook.areaStocks)) regItemBook.areaStocks = [];
                let areaRow = regItemBook.areaStocks.find(a => a.warehouse === rec.inWarehouse);
                if (!areaRow) {
                  areaRow = {
                    warehouse: rec.inWarehouse,
                    inQty: 0,
                    receiveQty: 0,
                    transferQty: 0,
                    diffQty: 0,
                    stockQty: 0
                  };
                  regItemBook.areaStocks.push(areaRow);
                }
                areaRow.inQty = Number(areaRow.inQty || 0) + qty;
                areaRow.stockQty = Math.max(0, Number(areaRow.stockQty || 0) + qty);
              }
              Object.values(inventoryDatasets).forEach(whBook => {
                const itemRec = whBook && whBook[rec.goodsItem];
                if (!itemRec || !Array.isArray(itemRec.regionalStocks)) return;
                const regRow = itemRec.regionalStocks.find(r => r.warehouse === rec.outWarehouse);
                if (regRow) {
                  regRow.stockQty = Math.max(0, Number(regRow.stockQty || 0) - qty);
                  if (isTransferBetweenRegions) {
                    regRow.transferQty = Number(regRow.transferQty || 0) - qty;
                  }
                }
              });
            }

            if (warehouses.includes(rec.inWarehouse)) {
              if (!inventoryDatasets[rec.inWarehouse]) inventoryDatasets[rec.inWarehouse] = {};
              if (!inventoryDatasets[rec.inWarehouse][rec.goodsItem]) {
                inventoryDatasets[rec.inWarehouse][rec.goodsItem] = {
                  safetyStock: 0,
                  openingStock: 0,
                  movements: [],
                  regionalStocks: []
                };
              }
              const inMovNow = getNowMsRecord();
              inventoryDatasets[rec.inWarehouse][rec.goodsItem].movements.push({
                id: nextMovementId++,
                date: inMovNow.hyphen,
                warehouse: rec.outWarehouse,
                inQty: qty,
                outQty: 0,
                diffQty: 0,
                diffReason: '',
                createdAtStr: inMovNow.isoMs,
                createdAtMs: inMovNow.ms,
                updatedAtStr: inMovNow.isoMs,
                updatedAtMs: inMovNow.ms
              });
            } else if (regionalWarehouses.includes(rec.inWarehouse)) {
              const isTransferBetweenRegions = regionalWarehouses.includes(rec.outWarehouse);
              if (!regionalInventoryDatasets[rec.inWarehouse]) regionalInventoryDatasets[rec.inWarehouse] = {};
              if (!regionalInventoryDatasets[rec.inWarehouse][rec.goodsItem]) {
                regionalInventoryDatasets[rec.inWarehouse][rec.goodsItem] = {
                  safetyStock: 2,
                  openingStock: 0,
                  movements: [],
                  areaStocks: []
                };
              }
              const inRegMovNow = getNowMsRecord();
              regionalInventoryDatasets[rec.inWarehouse][rec.goodsItem].movements.push({
                id: nextMovementId++,
                date: inRegMovNow.hyphen,
                warehouse: rec.outWarehouse,
                inQty: isTransferBetweenRegions ? 0 : qty,
                outQty: 0,
                transferQty: isTransferBetweenRegions ? qty : 0,
                diffQty: 0,
                diffReason: '',
                createdAtStr: inRegMovNow.isoMs,
                createdAtMs: inRegMovNow.ms,
                updatedAtStr: inRegMovNow.isoMs,
                updatedAtMs: inRegMovNow.ms
              });
              Object.values(inventoryDatasets).forEach(whBook => {
                const itemRec = whBook && whBook[rec.goodsItem];
                if (!itemRec || !Array.isArray(itemRec.regionalStocks)) return;
                const regRow = itemRec.regionalStocks.find(r => r.warehouse === rec.inWarehouse);
                if (regRow) {
                  regRow.stockQty = Math.max(0, Number(regRow.stockQty || 0) + qty);
                  if (isTransferBetweenRegions) {
                    regRow.transferQty = Number(regRow.transferQty || 0) + qty;
                  } else {
                    regRow.inQty = Number(regRow.inQty || 0) + qty;
                  }
                }
              });
            } else if (areaWarehouses.includes(rec.inWarehouse)) {
              if (!areaInventoryDatasets[rec.inWarehouse]) areaInventoryDatasets[rec.inWarehouse] = {};
              if (!areaInventoryDatasets[rec.inWarehouse][rec.goodsItem]) {
                areaInventoryDatasets[rec.inWarehouse][rec.goodsItem] = {
                  safetyStock: 2,
                  openingStock: 0,
                  movements: []
                };
              }
              const inAreaMovNow = getNowMsRecord();
              areaInventoryDatasets[rec.inWarehouse][rec.goodsItem].movements.push({
                id: nextMovementId++,
                date: inAreaMovNow.hyphen,
                warehouse: rec.outWarehouse,
                inQty: qty,
                outQty: 0,
                transferQty: 0,
                diffQty: 0,
                diffReason: '',
                createdAtStr: inAreaMovNow.isoMs,
                createdAtMs: inAreaMovNow.ms,
                updatedAtStr: inAreaMovNow.isoMs,
                updatedAtMs: inAreaMovNow.ms
              });
              const parentReg = areaWarehouseRegions[rec.inWarehouse];
              if (parentReg && parentReg !== rec.outWarehouse) {
                if (!regionalInventoryDatasets[parentReg]) regionalInventoryDatasets[parentReg] = {};
                if (!regionalInventoryDatasets[parentReg][rec.goodsItem]) {
                  regionalInventoryDatasets[parentReg][rec.goodsItem] = {
                    safetyStock: 2,
                    openingStock: 0,
                    movements: [],
                    areaStocks: []
                  };
                }
                const regBook = regionalInventoryDatasets[parentReg][rec.goodsItem];
                if (!Array.isArray(regBook.areaStocks)) regBook.areaStocks = [];
                let areaRow = regBook.areaStocks.find(a => a.warehouse === rec.inWarehouse);
                if (!areaRow) {
                  areaRow = { warehouse: rec.inWarehouse, inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 };
                  regBook.areaStocks.push(areaRow);
                }
                areaRow.inQty = Number(areaRow.inQty || 0) + qty;
                areaRow.stockQty = Math.max(0, Number(areaRow.stockQty || 0) + qty);
              }
            }

            // 同步更新「出庫 / 調貨」紀錄狀態為「已簽收」
            const linkedTransfer = findLinkedTransferRecord(rec);
            if (linkedTransfer) {
              linkedTransfer.signed = true;
              linkedTransfer.returned = false;
              linkedTransfer.status = '已簽收';
              linkedTransfer.updatedAtStr = signNow.isoMs;
              linkedTransfer.updatedAtMs = signNow.ms;
              if (editingTransferRecordId === linkedTransfer.id) {
                exitTransferEditMode();
              }
            }

            updateTransferCurrentStockDisplay();
            if (hasActiveTransferFilter) {
              $('btn-transfer-search').click();
            } else {
              renderTransferOutTable();
            }
            if (hasActiveSignInFilter) {
              $('btn-signin-search').click();
            } else {
              renderSignInTable();
            }
            syncGoodsApi(GOODS_API_CONFIG.endpoints.signInConfirm, 'POST', { action: 'confirm', signInId: rec.id, transferId: rec.transferId });
            toast(`已完成「${rec.inWarehouse} - ${rec.goodsItem}」簽收入庫，庫存數量已更新。`);
          }
        );
      });
    });

    tbody.querySelectorAll('.btn-sign-return').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const rec = signInRecords.find(r => r.id === id);
        if (!rec || rec.signed || rec.returned) return;
        openConfirmModal(
          `您確定要退回「<strong>${rec.outWarehouse} → ${rec.inWarehouse}</strong>」的「<strong>${rec.goodsItem}（${money(rec.outQty)} 件）</strong>」嗎？`,
          { title: '確認退回', okClass: 'btn btn-danger-solid', okText: '確定' },
          () => {
            const returnNow = getNowMsRecord();
            rec.returned = true;
            rec.signed = false;
            rec.status = '退回';
            rec.returnedAtStr = returnNow.isoMs;
            rec.returnedAtMs = returnNow.ms;
            rec.updatedAtStr = returnNow.isoMs;
            rec.updatedAtMs = returnNow.ms;

            // 尚未簽收前本來就未異動庫存，退回時僅同步將「出庫 / 調貨」紀錄狀態標示為「退回」
            const linkedTransfer = findLinkedTransferRecord(rec);
            if (linkedTransfer) {
              linkedTransfer.returned = true;
              linkedTransfer.signed = false;
              linkedTransfer.status = '退回';
              linkedTransfer.updatedAtStr = returnNow.isoMs;
              linkedTransfer.updatedAtMs = returnNow.ms;
              if (editingTransferRecordId === linkedTransfer.id) {
                exitTransferEditMode();
              }
            }

            if (Array.isArray(filteredSignInRows) && filteredSignInRows.length > 0) {
              filteredSignInRows = filteredSignInRows.filter(r => r.id !== rec.id && !r.returned && r.status !== '退回');
            }
            renderTransferOutTable();
            renderSignInTable();
            updateTransferCurrentStockDisplay();
            syncGoodsApi(GOODS_API_CONFIG.endpoints.signInReturn, 'POST', { action: 'return', signInId: rec.id, transferId: rec.transferId });
            toast(`已退回「${rec.outWarehouse} → ${rec.inWarehouse}」的「${rec.goodsItem}」。`);
          }
        );
      });
    });
  };

  $('sign-in-thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable[data-sort]');
    if (!th) return;
    signInSortState = cycleSortState(signInSortState, th.dataset.sort, ['outQty']);
    signInPager.setPage(1);
    renderSignInTable();
  });

  // ==================== 分頁四：出庫 / 調貨（列表與排序） ====================
  const transferPager = window.CTA.createPagination({
    containerId: 'transfer-pagination',
    perPageId: 'transfer-per-page-select',
    prevId: 'transfer-page-prev',
    nextId: 'transfer-page-next',
    numbersId: 'transfer-page-numbers',
    totalPagesId: 'transfer-total-pages',
    totalItemsId: 'transfer-total-items',
    onChange: () => renderTransferOutTable()
  });

  const syncTransferTableHeaders = () => {
    const thead = $('transfer-out-thead');
    if (!thead) return;
    thead.innerHTML = `<tr>
      <th class="center" style="width: 68px;">序號</th>
      ${buildSortableTh('出庫日期', 'date', transferSortState)}
      ${buildSortableTh('出庫倉庫', 'outWarehouse', transferSortState)}
      ${buildSortableTh('入庫倉庫', 'inWarehouse', transferSortState)}
      ${buildSortableTh('物品', 'goodsItem', transferSortState)}
      ${buildSortableTh('出庫數量', 'outQty', transferSortState, 'num-col')}
      ${buildSortableTh('出庫人員', 'operator', transferSortState)}
      <th class="center" style="width: 80px;">編輯</th>
      ${buildSortableTh('狀態', 'status', transferSortState, 'center')}
    </tr>`;
  };

  const enterTransferEditMode = (record) => {
    if (!record || record.signed || record.status === '已簽收') return;
    editingTransferRecordId = record.id;
    const targetMode = record.mode === '調貨' ? '調貨' : '出庫';
    const modeRadio = document.querySelector(`input[name="transfer-mode"][value="${targetMode}"]`);
    if (modeRadio) modeRadio.checked = true;

    syncTransferWarehouseDropdowns(false);
    $('transfer-out-warehouse').value = record.outWarehouse || '';
    syncTransferWarehouseDropdowns(true);
    $('transfer-item').value = record.goodsItem || '';
    updateTransferCurrentStockDisplay();
    $('transfer-in-warehouse').value = record.inWarehouse || '';
    $('transfer-qty').value = record.outQty != null ? record.outQty : '';

    ['transfer-out-warehouse', 'transfer-item', 'transfer-in-warehouse', 'transfer-qty'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });

    $('btn-transfer-add').classList.add('hidden');
    $('btn-transfer-reset').classList.add('hidden');
    $('transfer-edit-actions').classList.remove('hidden');
    renderTransferOutTable();
  };

  const exitTransferEditMode = () => {
    editingTransferRecordId = null;
    const defaultRadio = document.querySelector('input[name="transfer-mode"][value="出庫"]');
    if (defaultRadio) defaultRadio.checked = true;
    ['transfer-out-warehouse', 'transfer-item', 'transfer-in-warehouse', 'transfer-qty'].forEach(fid => {
      const el = $(fid);
      el.value = '';
      el.classList.remove('highlight-error');
    });
    syncTransferWarehouseDropdowns(false);
    $('transfer-edit-actions').classList.add('hidden');
    $('btn-transfer-add').classList.remove('hidden');
    $('btn-transfer-reset').classList.remove('hidden');
    renderTransferOutTable();
  };

  const getTransferStatusBadge = (row) => {
    if (row.returned || row.status === '退回') {
      return '<span class="status-badge revise">退回</span>';
    }
    if (row.signed || row.status === '已簽收') {
      return '<span class="status-badge approved">已簽收</span>';
    }
    return '<span class="status-badge pending">待簽收</span>';
  };

  const getRoleFilteredTransferRecords = () => {
    const all = Array.isArray(transferOutRecords) ? transferOutRecords : [];
    if (currentRole === 'hq') {
      return all.filter(r => warehouses.includes(r.outWarehouse) || (r.mode === '調貨' && regionalWarehouses.includes(r.outWarehouse)));
    }
    return all.filter(r => regionalWarehouses.includes(r.outWarehouse));
  };

  const transferFilter = bindRecordQueryFilter({
    inputId: 'transfer-query-warehouse', wrapId: 'transfer-wh-combo-wrap', menuId: 'transfer-wh-combo-menu',
    clearBtnId: 'btn-clear-transfer-wh', toggleBtnId: 'btn-toggle-transfer-wh',
    itemId: 'transfer-query-item', startId: 'transfer-query-start-date', endId: 'transfer-query-end-date',
    searchBtnId: 'btn-transfer-search', resetBtnId: 'btn-transfer-query-reset', loadingId: 'transfer-loading',
    requireWarehouse: false,
    onSearch: ({ rawWarehouse, matchedWarehouse, itemVal, startVal, endVal }) => {
      hasActiveTransferFilter = true;
      const baseList = getRoleFilteredTransferRecords();
      filteredTransferRows = baseList.filter(r => {
        if (rawWarehouse && (!matchedWarehouse || (r.outWarehouse !== matchedWarehouse && r.inWarehouse !== matchedWarehouse))) return false;
        if (itemVal !== '全部' && r.goodsItem !== itemVal) return false;
        const d = String(r.date || '').trim();
        if (startVal && d < startVal) return false;
        if (endVal && d > endVal) return false;
        return true;
      });
      transferPager.setPage(1);
      renderTransferOutTable();
    },
    onReset: () => {
      hasActiveTransferFilter = false;
      filteredTransferRows = [];
      transferPager.setPage(1);
      renderTransferOutTable();
    }
  });

  const renderTransferOutTable = () => {
    const tbody = $('transfer-out-tbody');
    syncTransferTableHeaders();

    if (!hasActiveTransferFilter) {
      $('transfer-count-display').textContent = '0';
      tbody.innerHTML = `<tr><td colspan="9" class="empty">請選擇條件搜尋</td></tr>`;
      transferPager.render(0, 1, 1);
      return;
    }

    const list = sortRowsByState(filteredTransferRows, transferSortState, true);
    $('transfer-count-display').textContent = String(list.length);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">查無符合條件的資料</td></tr>`;
      transferPager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = transferPager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, transferPager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = list.slice(startIndex, startIndex + itemsPerPage);
    transferPager.render(list.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((row, idx) => {
      const isFinalized = Boolean(row.signed || row.status === '已簽收');
      const isReturned = Boolean(row.returned || row.status === '退回');
      const editBtnColorClass = isReturned ? 'btn-warning-solid' : 'primary';
      const editCellHtml = isFinalized
        ? ''
        : `<button type="button" class="btn ${editBtnColorClass} small btn-transfer-edit" data-id="${row.id}">編輯</button>`;
      return `
        <tr class="${row.id === editingTransferRecordId ? 'is-editing-row' : ''}">
          <td class="center">${startIndex + idx + 1}</td>
          <td>${row.date || ''}</td>
          <td>${row.outWarehouse || ''}</td>
          <td>${row.inWarehouse || ''}</td>
          <td>${row.goodsItem || ''}</td>
          <td class="num-col">${money(row.outQty)}</td>
          <td>${row.operator || '蘇2'}</td>
          <td class="center">${editCellHtml}</td>
          <td class="center">${getTransferStatusBadge(row)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-transfer-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const rec = transferOutRecords.find(r => r.id === id);
        if (rec) enterTransferEditMode(rec);
      });
    });
  };

  $('transfer-out-thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable[data-sort]');
    if (!th) return;
    transferSortState = cycleSortState(transferSortState, th.dataset.sort, ['outQty']);
    transferPager.setPage(1);
    renderTransferOutTable();
  });

  // ==================== 分頁五：盤差作業（列表與排序） ====================
  const diffPager = window.CTA.createPagination({
    containerId: 'diff-pagination',
    perPageId: 'diff-per-page-select',
    prevId: 'diff-page-prev',
    nextId: 'diff-page-next',
    numbersId: 'diff-page-numbers',
    totalPagesId: 'diff-total-pages',
    totalItemsId: 'diff-total-items',
    onChange: () => renderDiffTable()
  });

  const syncDiffTableHeaders = () => {
    const thead = $('diff-thead');
    if (!thead) return;
    const canEditDiff = currentRole === 'hq';
    thead.innerHTML = `<tr>
      <th class="center" style="width: 68px;">序號</th>
      ${buildSortableTh('盤差日期', 'date', diffSortState)}
      ${buildSortableTh('倉庫', 'warehouse', diffSortState)}
      ${buildSortableTh('物品', 'goodsItem', diffSortState)}
      ${buildSortableTh('盤差數量', 'diffQty', diffSortState, 'num-col')}
      ${buildSortableTh('盤差原因', 'diffReason', diffSortState)}
      ${buildSortableTh('作業人員', 'operator', diffSortState)}
      ${canEditDiff ? '<th class="center" style="width: 80px;">編輯</th>' : ''}
    </tr>`;
  };

  const renderDiffTable = () => {
    const tbody = $('diff-tbody');
    const canEditDiff = currentRole === 'hq';
    const colCount = canEditDiff ? 8 : 7;
    syncDiffTableHeaders();

    if (!hasActiveDiffFilter) {
      $('diff-count-display').textContent = '0';
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty">請選擇條件搜尋</td></tr>`;
      diffPager.render(0, 1, 1);
      return;
    }

    const list = sortRowsByState(filteredDiffRows, diffSortState, true);

    $('diff-count-display').textContent = String(list.length);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty">查無符合條件的資料</td></tr>`;
      diffPager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = diffPager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, diffPager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = list.slice(startIndex, startIndex + itemsPerPage);
    diffPager.render(list.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((row, idx) => `
      <tr class="${row.id === editingDiffRecordId ? 'is-editing-row' : ''}">
        <td class="center">${startIndex + idx + 1}</td>
        <td>${row.date || ''}</td>
        <td>${row.warehouse || ''}</td>
        <td>${row.goodsItem || ''}</td>
        <td class="num-col">${money(row.diffQty)}</td>
        <td>${row.diffReason || ''}</td>
        <td>${row.operator || '蘇2'}</td>
        ${canEditDiff ? `<td class="center"><button type="button" class="btn primary small btn-diff-edit" data-id="${row.id}">編輯</button></td>` : ''}
      </tr>
    `).join('');

    if (canEditDiff) {
      tbody.querySelectorAll('.btn-diff-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = Number(e.currentTarget.dataset.id);
          const rec = diffRecords.find(r => r.id === id);
          if (rec) enterDiffEditMode(rec);
        });
      });
    }
  };

  $('diff-thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable[data-sort]');
    if (!th) return;
    diffSortState = cycleSortState(diffSortState, th.dataset.sort, ['diffQty']);
    diffPager.setPage(1);
    renderDiffTable();
  });


  // ==================== localStorage 持久化與 API 設定（V351） ====================
  const GOODS_API_CONFIG = window.GOODS_API_CONFIG || {
    enableApi: false,
    baseUrl: '/api/goods-manage',
    fallbackJsonUrl: 'json/goods_manage_data.json?v=349',
    endpoints: {
      state: '/state',
      vendorIn: '/vendor-in',
      transferOut: '/transfer-out',
      signInConfirm: '/sign-in/confirm',
      signInReturn: '/sign-in/return',
      diff: '/diff',
      clearAll: '/clear-all'
    }
  };

  const buildGoodsStateSnapshot = () => ({
    warehouses: [...warehouses],
    regionalWarehouses: [...regionalWarehouses],
    areaWarehouses: [...areaWarehouses],
    areaWarehouseRegions: { ...areaWarehouseRegions },
    goodsItems: [...goodsItems],
    diffReasons: [...diffReasons],
    inventoryDatasets: JSON.parse(JSON.stringify(inventoryDatasets || {})),
    regionalInventoryDatasets: JSON.parse(JSON.stringify(regionalInventoryDatasets || {})),
    areaInventoryDatasets: JSON.parse(JSON.stringify(areaInventoryDatasets || {})),
    vendorInRecords: vendorInRecords.map(r => ({ ...r })),
    signInRecords: signInRecords.map(r => ({ ...r })),
    transferOutRecords: transferOutRecords.map(r => ({ ...r })),
    diffRecords: diffRecords.map(r => ({ ...r })),
    counters: {
      nextVendorRecordId,
      nextSignInRecordId,
      nextTransferRecordId,
      nextDiffRecordId,
      nextMovementId
    }
  });

  const applyGoodsStateFromPayload = (json) => {
    if (!json || typeof json !== 'object') return false;
    if (Array.isArray(json.warehouses)) warehouses = json.warehouses;
    if (Array.isArray(json.regionalWarehouses)) regionalWarehouses = json.regionalWarehouses;
    if (Array.isArray(json.areaWarehouses)) areaWarehouses = json.areaWarehouses;
    if (json.areaWarehouseRegions && typeof json.areaWarehouseRegions === 'object') {
      areaWarehouseRegions = json.areaWarehouseRegions;
    }
    if (Array.isArray(json.goodsItems)) goodsItems = json.goodsItems;
    if (Array.isArray(json.diffReasons)) diffReasons = json.diffReasons;
    if (json.inventoryDatasets && typeof json.inventoryDatasets === 'object') {
      inventoryDatasets = json.inventoryDatasets;
      Object.values(inventoryDatasets).forEach(whBook => {
        Object.values(whBook || {}).forEach(itemRec => {
          if (itemRec && Array.isArray(itemRec.regionalStocks)) {
            itemRec.regionalStocks = sortRegionalStocksFixedOrder(itemRec.regionalStocks);
          }
        });
      });
    }
    if (json.regionalInventoryDatasets && typeof json.regionalInventoryDatasets === 'object') {
      regionalInventoryDatasets = json.regionalInventoryDatasets;
    }
    if (json.areaInventoryDatasets && typeof json.areaInventoryDatasets === 'object') {
      areaInventoryDatasets = json.areaInventoryDatasets;
    }
    if (Array.isArray(json.vendorInRecords)) {
      vendorInRecords = json.vendorInRecords.map(r => ({ ...r }));
      nextVendorRecordId = vendorInRecords.reduce((m, r) => Math.max(m, Number(r.id || 0)), 0) + 1;
    }
    if (Array.isArray(json.signInRecords)) {
      signInRecords = json.signInRecords.map(r => ({ ...r }));
      nextSignInRecordId = signInRecords.reduce((m, r) => Math.max(m, Number(r.id || 0)), 0) + 1;
    }
    if (Array.isArray(json.transferOutRecords)) {
      transferOutRecords = json.transferOutRecords.map(r => ({ ...r }));
      nextTransferRecordId = transferOutRecords.reduce((m, r) => Math.max(m, Number(r.id || 0)), 0) + 1;
    }
    if (Array.isArray(json.diffRecords)) {
      diffRecords = json.diffRecords.map(r => ({ ...r }));
      nextDiffRecordId = diffRecords.reduce((m, r) => Math.max(m, Number(r.id || 0)), 0) + 1;
    }
    if (json.counters && typeof json.counters === 'object') {
      if (Number.isFinite(Number(json.counters.nextMovementId))) {
        nextMovementId = Math.max(nextMovementId, Number(json.counters.nextMovementId));
      }
    }
    return true;
  };

  const saveGoodsStateToLocalStorage = (snapshot) => {
    try {
      const dataToSave = snapshot || buildGoodsStateSnapshot();
      localStorage.setItem(GOODS_MANAGE_STORAGE_KEY, JSON.stringify(dataToSave));
      return true;
    } catch (err) {
      console.error('寫入 localStorage 失敗：', err);
      return false;
    }
  };

  const loadGoodsStateFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(GOODS_MANAGE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (err) {
      console.error('讀取 localStorage 失敗：', err);
      return null;
    }
  };

  const clearGoodsStateLocalStorage = () => {
    try {
      localStorage.removeItem(GOODS_MANAGE_STORAGE_KEY);
      localStorage.removeItem('cta_goodsreceive_state_v1');
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('cta_goods')) {
          localStorage.removeItem(k);
        }
      });
    } catch (_) {}
  };

  const syncGoodsApi = async (endpointPath, method = 'POST', payload = {}) => {
    const snapshot = buildGoodsStateSnapshot();
    if (endpointPath === GOODS_API_CONFIG.endpoints.clearAll) {
      clearGoodsStateLocalStorage();
    } else {
      saveGoodsStateToLocalStorage(snapshot);
    }

    if (!GOODS_API_CONFIG.enableApi) {
      return { ok: true, mode: 'local-storage', data: snapshot };
    }

    const url = `${GOODS_API_CONFIG.baseUrl}${endpointPath}`;
    const bodyObj = {
      ...payload,
      _snapshot: snapshot
    };
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj)
      });
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data === 'object') {
          const nextState = data.state || data.data || (data.warehouses ? data : null);
          if (nextState && applyGoodsStateFromPayload(nextState)) {
            saveGoodsStateToLocalStorage();
            populateSelectOptions();
            renderVendorInTable();
            renderSignInTable();
            renderTransferOutTable();
            renderDiffTable();
            updateTransferCurrentStockDisplay();
          }
        }
        return { ok: true, mode: 'api', data };
      }
      return { ok: true, mode: 'local-storage', status: res ? res.status : 0 };
    } catch (err) {
      return { ok: true, mode: 'local-storage', error: err };
    }
  };

  // ==================== 資料載入（優先讀取 localStorage，無資料時載入初始 JSON） ====================
  const loadInitialGoodsState = async () => {
    let loadedJson = loadGoodsStateFromLocalStorage();

    if (!loadedJson && GOODS_API_CONFIG.enableApi) {
      try {
        const apiRes = await fetch(`${GOODS_API_CONFIG.baseUrl}${GOODS_API_CONFIG.endpoints.state}`, {
          method: 'GET',
          cache: 'no-store'
        });
        if (apiRes && apiRes.ok) {
          const apiData = await apiRes.json().catch(() => null);
          loadedJson = (apiData && (apiData.state || apiData.data || (apiData.warehouses ? apiData : null))) || null;
        }
      } catch (_) {}
    }

    if (!loadedJson) {
      try {
        const fallbackRes = await fetch(GOODS_API_CONFIG.fallbackJsonUrl, { cache: 'no-store' });
        if (fallbackRes && fallbackRes.ok) {
          loadedJson = await fallbackRes.json();
        }
      } catch (err) {
        console.error('讀取初始資料失敗：', err);
      }
    }

    if (loadedJson && typeof loadedJson === 'object') {
      applyGoodsStateFromPayload(loadedJson);
    }

    if (typeof window.CTA.syncRecordedFloorMs === 'function') {
      window.CTA.syncRecordedFloorMs([
        ...vendorInRecords,
        ...signInRecords,
        ...transferOutRecords,
        ...diffRecords
      ]);
    }
    populateSelectOptions();
    renderVendorInTable();
    renderSignInTable();
    renderTransferOutTable();
    renderDiffTable();
  };

  const reloadGoodsStateFromLocalStorage = () => {
    const latest = loadGoodsStateFromLocalStorage();
    if (latest && typeof latest === 'object') {
      applyGoodsStateFromPayload(latest);
      if (typeof window.CTA.syncRecordedFloorMs === 'function') {
        window.CTA.syncRecordedFloorMs([
          ...vendorInRecords,
          ...signInRecords,
          ...transferOutRecords,
          ...diffRecords
        ]);
      }
      return true;
    }
    return false;
  };

  window.addEventListener('storage', (e) => {
    if (e.key === GOODS_MANAGE_STORAGE_KEY && reloadGoodsStateFromLocalStorage()) {
      populateSelectOptions();
      renderVendorInTable();
      renderSignInTable();
      renderTransferOutTable();
      renderDiffTable();
      updateTransferCurrentStockDisplay();
    }
  });

  const dataReady = loadInitialGoodsState();


  // ==================== 次分頁頁籤切換 ====================
  const tabViewIds = {
    'query': 'tab-query-view',
    'vendor-in': 'tab-vendor-in-view',
    'sign-in': 'tab-sign-in-view',
    'transfer-out': 'tab-transfer-out-view',
    'diff': 'tab-diff-view'
  };
  const formTabs = new Set(['vendor-in', 'transfer-out']);

  const switchManageTab = (tabKey) => {
    if (!currentRole) return;
    const targetTab = tabViewIds[tabKey] ? tabKey : 'query';
    const tabsBar = $('manage-sub-tabs');
    let activeBtn = null;
    document.querySelectorAll('#manage-sub-tabs .sub-tab-btn').forEach(b => {
      const isTarget = b.dataset.tab === targetTab;
      b.classList.toggle('active', isTarget);
      b.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      if (isTarget) activeBtn = b;
    });
    if (tabsBar && activeBtn && tabsBar.scrollWidth > tabsBar.clientWidth) {
      const targetLeft = activeBtn.offsetLeft - (tabsBar.clientWidth - activeBtn.offsetWidth) / 2;
      tabsBar.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }

    Object.entries(tabViewIds).forEach(([key, viewId]) => {
      const el = $(viewId);
      if (el) el.classList.toggle('hidden', key !== targetTab);
    });

    if (targetTab !== 'vendor-in' && editingVendorRecordId != null) {
      exitVendorEditMode();
    }
    if (targetTab !== 'transfer-out' && editingTransferRecordId != null) {
      exitTransferEditMode();
    }
    if (targetTab !== 'diff' && editingDiffRecordId != null) {
      exitDiffEditMode();
    }
    if (targetTab === 'transfer-out') {
      updateTransferCurrentStockDisplay();
    }

    saveGoodsManageSessionUI(targetTab);
  };

  document.querySelectorAll('#manage-sub-tabs .sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchManageTab(btn.dataset.tab));
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => {
      return Array.from(formTabs).some(tabKey => {
        const el = $(tabViewIds[tabKey]);
        return Boolean(el && !el.classList.contains('hidden'));
      });
    },
    onClearState: () => {
      resetUnsavedFieldsOnLoad();
    }
  });

  // ==================== 分頁二：廠商入庫右側表單互動 ====================
  ['vendor-warehouse', 'vendor-item'].forEach(fid => {
    $(fid).addEventListener('change', (e) => e.currentTarget.classList.remove('highlight-error'));
  });

  $('vendor-qty').addEventListener('input', (e) => {
    const el = e.currentTarget;
    el.classList.remove('highlight-error');
    if (el.value !== '' && Number(el.value) < 1) {
      el.value = '';
    }
  });

  $('vendor-qty').addEventListener('keydown', (e) => {
    if (['-', '+', '.', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingVendorRecordId != null) {
        $('btn-vendor-save').click();
      } else {
        $('btn-vendor-add').click();
      }
    }
  });

  const validateVendorForm = () => {
    const whSel = $('vendor-warehouse');
    const itemSel = $('vendor-item');
    const qtyInput = $('vendor-qty');

    const whVal = whSel.value.trim();
    const itemVal = itemSel.value.trim();
    const qtyNum = Number(qtyInput.value);

    [whSel, itemSel, qtyInput].forEach(el => el.classList.remove('highlight-error'));

    let firstInvalid = null;
    if (!whVal) {
      whSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || whSel;
    }
    if (!itemVal) {
      itemSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || itemSel;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      qtyInput.classList.add('highlight-error');
      firstInvalid = firstInvalid || qtyInput;
    }

    if (firstInvalid) {
      openAlertModal('欄位填寫不完整！', () => firstInvalid.focus());
      return null;
    }

    return { whVal, itemVal, intQty: Math.floor(qtyNum) };
  };

  const removeLinkedVendorMovement = (rec) => {
    if (!rec) return;
    const book = inventoryDatasets[rec.warehouse] && inventoryDatasets[rec.warehouse][rec.goodsItem];
    if (!book || !Array.isArray(book.movements)) return;
    let mIdx = rec.movementId != null
      ? book.movements.findIndex(m => m.id === rec.movementId)
      : -1;
    if (mIdx === -1) {
      mIdx = book.movements.findIndex(m =>
        m.warehouse === '廠商' && m.date === rec.date && Number(m.inQty || 0) === Number(rec.inQty || 0)
      );
    }
    if (mIdx !== -1) {
      book.movements.splice(mIdx, 1);
    }
  };

  const appendVendorMovement = (whVal, itemVal, dateStr, intQty, nowRec) => {
    if (!inventoryDatasets[whVal]) inventoryDatasets[whVal] = {};
    if (!inventoryDatasets[whVal][itemVal]) {
      inventoryDatasets[whVal][itemVal] = {
        safetyStock: 0,
        openingStock: 0,
        movements: [],
        regionalStocks: []
      };
    }
    const movId = nextMovementId++;
    inventoryDatasets[whVal][itemVal].movements.push({
      id: movId,
      date: dateStr,
      warehouse: '廠商',
      inQty: intQty,
      outQty: 0,
      diffQty: 0,
      diffReason: '',
      createdAtStr: nowRec.isoMs,
      createdAtMs: nowRec.ms,
      updatedAtStr: nowRec.isoMs,
      updatedAtMs: nowRec.ms
    });
    return movId;
  };

  $('btn-vendor-add').addEventListener('click', async () => {
    await dataReady;
    const valid = validateVendorForm();
    if (!valid) return;

    const { whVal, itemVal, intQty } = valid;
    const nowRec = getNowMsRecord();
    const todayHyphen = nowRec.hyphen;
    const operatorName = '蘇2';
    const movId = appendVendorMovement(whVal, itemVal, todayHyphen, intQty, nowRec);

    vendorInRecords.unshift({
      id: nextVendorRecordId++,
      movementId: movId,
      date: todayHyphen,
      warehouse: whVal,
      goodsItem: itemVal,
      inQty: intQty,
      operator: operatorName,
      createdAtStr: nowRec.isoMs,
      createdAtMs: nowRec.ms,
      updatedAtStr: nowRec.isoMs,
      updatedAtMs: nowRec.ms
    });

    $('vendor-warehouse').value = '';
    $('vendor-item').value = '';
    $('vendor-qty').value = '';
    if (hasActiveVendorFilter) {
      $('btn-vendor-search').click();
    } else {
      renderVendorInTable();
    }
    updateTransferCurrentStockDisplay();
    syncGoodsApi(GOODS_API_CONFIG.endpoints.vendorIn, 'POST', { action: 'create', record: vendorInRecords[0] });
    toast(`已新增「${whVal} - ${itemVal}」入庫 ${money(intQty)} 件，庫存數量已更新。`);
  });

  $('btn-vendor-reset').addEventListener('click', () => {
    ['vendor-warehouse', 'vendor-item', 'vendor-qty'].forEach(fid => {
      const el = $(fid);
      el.value = '';
      el.classList.remove('highlight-error');
    });
  });

  $('btn-vendor-save').addEventListener('click', async () => {
    await dataReady;
    if (editingVendorRecordId == null) return;
    const valid = validateVendorForm();
    if (!valid) return;

    const rec = vendorInRecords.find(r => r.id === editingVendorRecordId);
    if (!rec) {
      exitVendorEditMode();
      return;
    }

    const { whVal, itemVal, intQty } = valid;
    const oldWh = rec.warehouse;
    const oldItem = rec.goodsItem;
    const oldQty = Number(rec.inQty || 0);
    const oldBookStock = getWarehouseItemStock(oldWh, oldItem);
    const oldPendingQty = getPendingTransferOutQty(oldWh, oldItem);
    const oldAvailableStock = Math.max(0, oldBookStock - oldPendingQty);
    const signedOutQty = getSignedTransferOutQty(oldWh, oldItem);
    const shippedSummary = formatShippedOutSummary(signedOutQty, oldPendingQty);

    if (whVal === oldWh && itemVal === oldItem) {
      if (intQty < oldQty) {
        const reduceBy = oldQty - intQty;
        if (reduceBy > oldAvailableStock) {
          const qtyInput = $('vendor-qty');
          qtyInput.classList.add('highlight-error');
          const minRequiredQty = Math.max(1, oldQty - oldAvailableStock);
          const alertMsg = shippedSummary
            ? `「${oldWh} - ${oldItem}」目前${shippedSummary}，入庫數量不可減少至低於已出貨數量（本筆最低需保留 ${money(minRequiredQty)} 件）！`
            : `「${oldWh} - ${oldItem}」目前剩餘可用存量僅剩 ${money(oldAvailableStock)} 件，減少數量不可大於目前可用存量（本筆最低需保留 ${money(minRequiredQty)} 件）！`;
          openAlertModal(alertMsg, () => qtyInput.focus());
          return;
        }
      }
    } else if (oldQty > oldAvailableStock) {
      const alertMsg = shippedSummary
        ? `「${oldWh} - ${oldItem}」目前${shippedSummary}，扣除原入庫數量後庫存將不足，不可變更入庫倉庫或物品！`
        : `「${oldWh} - ${oldItem}」目前剩餘可用存量僅剩 ${money(oldAvailableStock)} 件，小於原入庫數量（${money(oldQty)} 件），不可變更入庫倉庫或物品！`;
      openAlertModal(alertMsg);
      return;
    }

    const nowRec = getNowMsRecord();

    removeLinkedVendorMovement(rec);
    const newMovId = appendVendorMovement(whVal, itemVal, rec.date || nowRec.hyphen, intQty, nowRec);

    rec.movementId = newMovId;
    rec.warehouse = whVal;
    rec.goodsItem = itemVal;
    rec.inQty = intQty;
    rec.updatedAtStr = nowRec.isoMs;
    rec.updatedAtMs = nowRec.ms;

    if (hasActiveVendorFilter) {
      $('btn-vendor-search').click();
    }
    exitVendorEditMode();
    updateTransferCurrentStockDisplay();
    syncGoodsApi(`${GOODS_API_CONFIG.endpoints.vendorIn}/${encodeURIComponent(rec.id)}`, 'PUT', { action: 'update', record: { ...rec } });
    toast('已成功儲存入庫紀錄，庫存數量已更新。');
  });

  $('btn-vendor-leave').addEventListener('click', () => {
    openConfirmModal('你的資料尚未儲存，確定要離開嗎？', '確定', () => {
      exitVendorEditMode();
    });
  });

  $('btn-vendor-delete').addEventListener('click', () => {
    if (editingVendorRecordId == null) return;
    const rec = vendorInRecords.find(r => r.id === editingVendorRecordId);
    if (!rec) {
      exitVendorEditMode();
      return;
    }

    const oldWh = rec.warehouse;
    const oldItem = rec.goodsItem;
    const oldQty = Number(rec.inQty || 0);
    const oldBookStock = getWarehouseItemStock(oldWh, oldItem);
    const oldPendingQty = getPendingTransferOutQty(oldWh, oldItem);
    const oldAvailableStock = Math.max(0, oldBookStock - oldPendingQty);

    if (oldQty > oldAvailableStock) {
      const signedOutQty = getSignedTransferOutQty(oldWh, oldItem);
      const shippedSummary = formatShippedOutSummary(signedOutQty, oldPendingQty);
      const alertMsg = shippedSummary
        ? `「${oldWh} - ${oldItem}」目前${shippedSummary}，扣除本筆入庫（${money(oldQty)} 件）後庫存將不足，不可刪除此入庫紀錄！`
        : `「${oldWh} - ${oldItem}」目前剩餘可用存量僅剩 ${money(oldAvailableStock)} 件，小於本筆入庫數量（${money(oldQty)} 件），不可刪除此入庫紀錄！`;
      openAlertModal(alertMsg);
      return;
    }

    openConfirmModal('確定刪除入庫紀錄嗎？', '確認', () => {
      const idx = vendorInRecords.findIndex(r => r.id === editingVendorRecordId);
      if (idx !== -1) {
        const [removed] = vendorInRecords.splice(idx, 1);
        filteredVendorRows = filteredVendorRows.filter(r => r.id !== removed.id);
        removeLinkedVendorMovement(removed);
      }
          exitVendorEditMode();
      updateTransferCurrentStockDisplay();
      syncGoodsApi(`${GOODS_API_CONFIG.endpoints.vendorIn}/${encodeURIComponent(rec.id)}`, 'DELETE', { action: 'delete', id: rec.id });
      toast('已成功刪除入庫紀錄，庫存數量已更新。');
    });
  });

  // ==================== 分頁四：出庫 / 調貨右側表單互動 ====================
  document.querySelectorAll('input[name="transfer-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ['transfer-out-warehouse', 'transfer-item', 'transfer-in-warehouse', 'transfer-qty'].forEach(fid => {
        $(fid).classList.remove('highlight-error');
      });
      syncTransferWarehouseDropdowns(true);
    });
  });

  $('transfer-out-warehouse').addEventListener('change', (e) => {
    e.currentTarget.classList.remove('highlight-error');
    if (getTransferMode() === '調貨' || currentRole === 'region') {
      syncTransferWarehouseDropdowns(true);
    } else {
      updateTransferCurrentStockDisplay();
    }
  });

  $('transfer-item').addEventListener('change', (e) => {
    e.currentTarget.classList.remove('highlight-error');
    updateTransferCurrentStockDisplay();
  });

  $('transfer-in-warehouse').addEventListener('change', (e) => {
    e.currentTarget.classList.remove('highlight-error');
  });

  $('transfer-qty').addEventListener('input', (e) => {
    const el = e.currentTarget;
    el.classList.remove('highlight-error');
    if (el.value !== '' && Number(el.value) < 1) {
      el.value = '';
    }
  });

  $('transfer-qty').addEventListener('keydown', (e) => {
    if (['-', '+', '.', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingTransferRecordId != null) {
        $('btn-transfer-save').click();
      } else {
        $('btn-transfer-add').click();
      }
    }
  });

  const validateTransferForm = (excludeTransferId = null) => {
    const mode = getTransferMode();
    const outSel = $('transfer-out-warehouse');
    const itemSel = $('transfer-item');
    const inSel = $('transfer-in-warehouse');
    const qtyInput = $('transfer-qty');

    const outWh = outSel.value.trim();
    const itemVal = itemSel.value.trim();
    const inWh = inSel.value.trim();
    const qtyNum = Number(qtyInput.value);

    [outSel, itemSel, inSel, qtyInput].forEach(el => el.classList.remove('highlight-error'));

    let firstInvalid = null;
    if (!outWh) {
      outSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || outSel;
    }
    if (!itemVal) {
      itemSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || itemSel;
    }
    if (!inWh) {
      inSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || inSel;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      qtyInput.classList.add('highlight-error');
      firstInvalid = firstInvalid || qtyInput;
    }

    if (firstInvalid) {
      openAlertModal('欄位填寫不完整！', () => firstInvalid.focus());
      return null;
    }

    if (outWh === inWh) {
      inSel.classList.add('highlight-error');
      openAlertModal('「入庫倉庫」不可與「出庫倉庫」相同！', () => inSel.focus());
      return null;
    }

    const intQty = Math.floor(qtyNum);
    const currentStock = getWarehouseItemStock(outWh, itemVal);
    const pendingReserved = getPendingTransferOutQty(outWh, itemVal, excludeTransferId);
    const availableStock = Math.max(0, currentStock - pendingReserved);

    if (intQty > availableStock) {
      qtyInput.classList.add('highlight-error');
      const hintDetail = pendingReserved > 0
        ? `目前存量為 ${money(availableStock)}（另有待簽收 ${money(pendingReserved)} 件）`
        : `目前存量為 ${money(availableStock)}`;
      openAlertModal(
        `「${outWh} - ${itemVal}」${hintDetail}，出庫數量不可大於目前存量！`,
        () => qtyInput.focus()
      );
      return null;
    }

    return { mode, outWh, itemVal, inWh, intQty };
  };

  $('btn-transfer-add').addEventListener('click', async () => {
    await dataReady;
    const valid = validateTransferForm(null);
    if (!valid) return;

    const { mode, outWh, itemVal, inWh, intQty } = valid;
    const nowRec = getNowMsRecord();
    const todayHyphen = nowRec.hyphen;
    const operatorName = '蘇2';
    const createdTransferId = nextTransferRecordId++;
    const createdSignInId = nextSignInRecordId++;

    // 新增出庫 / 調貨時僅建立「待簽收」紀錄，尚未簽收前不異動任何倉庫庫存數量
    transferOutRecords.unshift({
      id: createdTransferId,
      signInId: createdSignInId,
      date: todayHyphen,
      mode,
      outWarehouse: outWh,
      inWarehouse: inWh,
      goodsItem: itemVal,
      outQty: intQty,
      operator: operatorName,
      signed: false,
      returned: false,
      status: '待簽收',
      createdAtStr: nowRec.isoMs,
      createdAtMs: nowRec.ms,
      updatedAtStr: nowRec.isoMs,
      updatedAtMs: nowRec.ms
    });

    // 同步新增一筆待簽收紀錄至「簽收入庫」
    signInRecords.unshift({
      id: createdSignInId,
      transferId: createdTransferId,
      date: todayHyphen,
      outWarehouse: outWh,
      goodsItem: itemVal,
      outQty: intQty,
      operator: operatorName,
      inWarehouse: inWh,
      signed: false,
      returned: false,
      status: '待簽收',
      createdAtStr: nowRec.isoMs,
      createdAtMs: nowRec.ms,
      updatedAtStr: nowRec.isoMs,
      updatedAtMs: nowRec.ms
    });

    $('transfer-out-warehouse').value = '';
    $('transfer-item').value = '';
    $('transfer-in-warehouse').value = '';
    $('transfer-qty').value = '';
    syncTransferWarehouseDropdowns(false);
    if (hasActiveTransferFilter) {
      $('btn-transfer-search').click();
    } else {
      renderTransferOutTable();
    }
    if (hasActiveSignInFilter) {
      $('btn-signin-search').click();
    } else {
      renderSignInTable();
    }
    syncGoodsApi(GOODS_API_CONFIG.endpoints.transferOut, 'POST', { action: 'create', transferRecord: transferOutRecords[0], signInRecord: signInRecords[0] });
    toast(`已新增「${outWh} → ${inWh}」${mode} ${itemVal} ${money(intQty)} 件（待簽收）。`);
  });

  $('btn-transfer-reset').addEventListener('click', () => {
    const defaultRadio = document.querySelector('input[name="transfer-mode"][value="出庫"]');
    if (defaultRadio) defaultRadio.checked = true;
    ['transfer-out-warehouse', 'transfer-item', 'transfer-in-warehouse', 'transfer-qty'].forEach(fid => {
      const el = $(fid);
      el.value = '';
      el.classList.remove('highlight-error');
    });
    syncTransferWarehouseDropdowns(false);
  });

  $('btn-transfer-save').addEventListener('click', async () => {
    await dataReady;
    if (editingTransferRecordId == null) return;
    const valid = validateTransferForm(editingTransferRecordId);
    if (!valid) return;
    
    openConfirmModal('確定送出出庫 / 調貨紀錄嗎？', '確認', () => {


    const rec = transferOutRecords.find(r => r.id === editingTransferRecordId);
    if (!rec || rec.signed || rec.status === '已簽收') {
      exitTransferEditMode();
      return;
    }

    const { mode, outWh, itemVal, inWh, intQty } = valid;
    const nowRec = getNowMsRecord();

    // 同步更新「簽收入庫」對應的待簽收紀錄，若原為退回則重設為待簽收
    let linkedSignIn = (rec.signInId != null ? signInRecords.find(s => s.id === rec.signInId) : null)
      || signInRecords.find(s => s.transferId === rec.id);
    if (linkedSignIn && !linkedSignIn.signed) {
      linkedSignIn.outWarehouse = outWh;
      linkedSignIn.inWarehouse = inWh;
      linkedSignIn.goodsItem = itemVal;
      linkedSignIn.outQty = intQty;
      linkedSignIn.returned = false;
      linkedSignIn.status = '待簽收';
      linkedSignIn.updatedAtStr = nowRec.isoMs;
      linkedSignIn.updatedAtMs = nowRec.ms;
    } else if (!linkedSignIn && rec.returned) {
      // 若原簽收單已不存在但出庫單被重新編輯，則重新產生一筆待簽收紀錄
      const createdSignInId = nextSignInRecordId++;
      linkedSignIn = {
        id: createdSignInId,
        transferId: rec.id,
        date: rec.date,
        outWarehouse: outWh,
        goodsItem: itemVal,
        outQty: intQty,
        operator: rec.operator,
        inWarehouse: inWh,
        signed: false,
        returned: false,
        status: '待簽收',
        createdAtStr: nowRec.isoMs,
        createdAtMs: nowRec.ms,
        updatedAtStr: nowRec.isoMs,
        updatedAtMs: nowRec.ms
      };
      signInRecords.unshift(linkedSignIn);
      rec.signInId = createdSignInId;
    }

    rec.mode = mode;
    rec.outWarehouse = outWh;
    rec.inWarehouse = inWh;
    rec.goodsItem = itemVal;
    rec.outQty = intQty;
    rec.returned = false;
    rec.status = '待簽收';
    rec.updatedAtStr = nowRec.isoMs;
    rec.updatedAtMs = nowRec.ms;

    if (hasActiveTransferFilter) {
      $('btn-transfer-search').click();
    }
    if (hasActiveSignInFilter) {
      $('btn-signin-search').click();
    }
    exitTransferEditMode();
    syncGoodsApi(`${GOODS_API_CONFIG.endpoints.transferOut}/${encodeURIComponent(rec.id)}`, 'PUT', { action: 'update', record: { ...rec } });
    toast('已成功儲存出庫 / 調貨紀錄。');
    });
  });

  $('btn-transfer-leave').addEventListener('click', () => {
    openConfirmModal('你的資料尚未儲存，確定要離開嗎？', '確定', () => {
      exitTransferEditMode();
    });
  });

  $('btn-transfer-delete').addEventListener('click', () => {
    if (editingTransferRecordId == null) return;
    openConfirmModal('確定刪除出庫 / 調貨紀錄嗎？', '確認', () => {
      const idx = transferOutRecords.findIndex(r => r.id === editingTransferRecordId);
      if (idx !== -1) {
        const [removed] = transferOutRecords.splice(idx, 1);
        filteredTransferRows = filteredTransferRows.filter(r => r.id !== removed.id);
        const sIdx = removed.signInId != null
          ? signInRecords.findIndex(s => s.id === removed.signInId)
          : signInRecords.findIndex(s => s.transferId === removed.id);
        if (sIdx !== -1 && !signInRecords[sIdx].signed) {
          filteredSignInRows = filteredSignInRows.filter(s => s.id !== signInRecords[sIdx].id);
          signInRecords.splice(sIdx, 1);
        }
      }
          exitTransferEditMode();
      renderSignInTable();
      const delTransferId = editingTransferRecordId;
      syncGoodsApi(`${GOODS_API_CONFIG.endpoints.transferOut}/${encodeURIComponent(delTransferId)}`, 'DELETE', { action: 'delete', id: delTransferId });
      toast('已成功刪除出庫 / 調貨紀錄。');
    });
  });

  // ==================== 分頁五：盤差維護右側表單互動 ====================
  const clearDiffWarehouseErrors = () => {
    ['diff-wh-hq', 'diff-wh-region', 'diff-wh-area'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });
  };

  document.querySelectorAll('input[name="diff-wh-tier"]').forEach(radio => {
    radio.addEventListener('change', () => {
      syncDiffWarehouseTierUI(false);
    });
  });

  $('diff-wh-hq').addEventListener('change', () => {
    clearDiffWarehouseErrors();
  });

  ['diff-wh-hq', 'diff-wh-region', 'diff-wh-area'].forEach(fid => {
    const el = $(fid);
    if (el) {
      el.addEventListener('animationend', () => el.classList.remove('blue-pulse'));
    }
  });

  $('diff-wh-region').addEventListener('change', (e) => {
    clearDiffWarehouseErrors();
    if (getDiffWarehouseTier() === 'area') {
      syncDiffAreaOptions(e.currentTarget.value, false);
      triggerDiffBluePulse($('diff-wh-area'));
    }
  });

  $('diff-wh-area').addEventListener('change', () => {
    clearDiffWarehouseErrors();
  });

  ['diff-item', 'diff-reason'].forEach(fid => {
    $(fid).addEventListener('change', (e) => e.currentTarget.classList.remove('highlight-error'));
  });

  $('diff-qty').addEventListener('input', (e) => {
    e.currentTarget.classList.remove('highlight-error');
  });

  $('diff-qty').addEventListener('keydown', (e) => {
    if (['.', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      $('btn-diff-add').click();
    }
  });

  $('btn-diff-add').addEventListener('click', async () => {
    await dataReady;
    const tier = getDiffWarehouseTier();
    const hqSel = $('diff-wh-hq');
    const regSel = $('diff-wh-region');
    const areaSel = $('diff-wh-area');
    const itemSel = $('diff-item');
    const qtyInput = $('diff-qty');
    const reasonSel = $('diff-reason');

    const itemVal = itemSel.value.trim();
    const rawQtyStr = qtyInput.value.trim();
    const qtyNum = rawQtyStr === '' ? NaN : Number(rawQtyStr);
    const reasonVal = reasonSel.value.trim();

    clearDiffWarehouseErrors();
    [itemSel, qtyInput, reasonSel].forEach(el => el.classList.remove('highlight-error'));

    let firstInvalid = null;
    const missingFields = [];
    let targetWh = '';

    if (tier === 'hq') {
      targetWh = hqSel.value.trim();
      if (!targetWh) {
        hqSel.classList.add('highlight-error');
        firstInvalid = firstInvalid || hqSel;
        missingFields.push('盤差倉庫');
      }
    } else if (tier === 'region') {
      targetWh = regSel.value.trim();
      if (!targetWh) {
        regSel.classList.add('highlight-error');
        firstInvalid = firstInvalid || regSel;
        missingFields.push('盤差倉庫');
      }
    } else {
      const regVal = regSel.value.trim();
      const areaVal = areaSel.value.trim();
      if (!regVal) {
        regSel.classList.add('highlight-error');
        firstInvalid = firstInvalid || regSel;
        missingFields.push('盤差倉庫');
      } else if (!areaVal) {
        areaSel.classList.add('highlight-error');
        firstInvalid = firstInvalid || areaSel;
        missingFields.push('盤差倉庫');
      } else {
        targetWh = areaVal;
      }
    }

    if (!itemVal) {
      itemSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || itemSel;
      missingFields.push('物品');
    }
    if (!Number.isFinite(qtyNum) || Math.trunc(qtyNum) === 0) {
      qtyInput.classList.add('highlight-error');
      firstInvalid = firstInvalid || qtyInput;
      missingFields.push('盤差數量');
    }
    if (!reasonVal) {
      reasonSel.classList.add('highlight-error');
      firstInvalid = firstInvalid || reasonSel;
      missingFields.push('盤差原因');
    }

    if (firstInvalid) {
      let msg = '請完整填寫必填欄位（盤差倉庫、物品、盤差數量、盤差原因）！';
      if (missingFields.length === 1) {
        if (missingFields[0] === '盤差數量') {
          msg = '請輸入不可為 0 的「盤差數量」（可為正數或負數）！';
        } else if (missingFields[0] === '盤差倉庫' && tier === 'area' && !regSel.value.trim()) {
          msg = '請先選擇「中繼倉庫」，再選擇「作業區倉庫」！';
        } else {
          msg = `請選擇「${missingFields[0]}」！`;
        }
      }
      openAlertModal(msg, () => firstInvalid.focus());
      return;
    }

    const intQty = Math.trunc(qtyNum);
    const nowRec = getNowMsRecord();
    const todayHyphen = nowRec.hyphen;
    const operatorName = '蘇2';

    const createdMovId = nextMovementId++;
    diffRecords.unshift({
      id: nextDiffRecordId++,
      movementId: createdMovId,
      date: todayHyphen,
      warehouse: targetWh,
      goodsItem: itemVal,
      diffQty: intQty,
      diffReason: reasonVal,
      operator: operatorName,
      createdAtStr: nowRec.isoMs,
      createdAtMs: nowRec.ms,
      updatedAtStr: nowRec.isoMs,
      updatedAtMs: nowRec.ms
    });

    // 依盤差倉庫所屬層級，同步寫入對應庫存明細
    if (warehouses.includes(targetWh)) {
      if (!inventoryDatasets[targetWh]) inventoryDatasets[targetWh] = {};
      if (!inventoryDatasets[targetWh][itemVal]) {
        inventoryDatasets[targetWh][itemVal] = {
          safetyStock: 0,
          openingStock: 0,
          movements: [],
          regionalStocks: []
        };
      }
      inventoryDatasets[targetWh][itemVal].movements.push({
        id: createdMovId,
        date: todayHyphen,
        warehouse: targetWh,
        inQty: 0,
        outQty: 0,
        diffQty: intQty,
        diffReason: reasonVal,
        createdAtStr: nowRec.isoMs,
        createdAtMs: nowRec.ms,
        updatedAtStr: nowRec.isoMs,
        updatedAtMs: nowRec.ms
      });
    } else if (regionalWarehouses.includes(targetWh)) {
      if (!regionalInventoryDatasets[targetWh]) regionalInventoryDatasets[targetWh] = {};
      if (!regionalInventoryDatasets[targetWh][itemVal]) {
        regionalInventoryDatasets[targetWh][itemVal] = {
          safetyStock: 2,
          openingStock: 0,
          movements: [],
          areaStocks: []
        };
      }
      regionalInventoryDatasets[targetWh][itemVal].movements.push({
        id: createdMovId,
        date: todayHyphen,
        warehouse: targetWh,
        inQty: 0,
        outQty: 0,
        transferQty: 0,
        diffQty: intQty,
        diffReason: reasonVal,
        createdAtStr: nowRec.isoMs,
        createdAtMs: nowRec.ms,
        updatedAtStr: nowRec.isoMs,
        updatedAtMs: nowRec.ms
      });
      Object.values(inventoryDatasets).forEach(whBook => {
        const itemRec = whBook && whBook[itemVal];
        if (!itemRec || !Array.isArray(itemRec.regionalStocks)) return;
        const regRow = itemRec.regionalStocks.find(r => r.warehouse === targetWh);
        if (regRow) {
          regRow.diffQty = Number(regRow.diffQty || 0) + intQty;
          regRow.stockQty = Math.max(0, Number(regRow.stockQty || 0) + intQty);
        }
      });
    } else if (areaWarehouses.includes(targetWh)) {
      if (!areaInventoryDatasets[targetWh]) areaInventoryDatasets[targetWh] = {};
      if (!areaInventoryDatasets[targetWh][itemVal]) {
        areaInventoryDatasets[targetWh][itemVal] = {
          safetyStock: 2,
          openingStock: 0,
          movements: []
        };
      }
      areaInventoryDatasets[targetWh][itemVal].movements.push({
        id: createdMovId,
        date: todayHyphen,
        warehouse: targetWh,
        inQty: 0,
        outQty: 0,
        transferQty: 0,
        diffQty: intQty,
        diffReason: reasonVal,
        createdAtStr: nowRec.isoMs,
        createdAtMs: nowRec.ms,
        updatedAtStr: nowRec.isoMs,
        updatedAtMs: nowRec.ms
      });
      const parentReg = areaWarehouseRegions[targetWh];
      if (parentReg) {
        if (!regionalInventoryDatasets[parentReg]) regionalInventoryDatasets[parentReg] = {};
        if (!regionalInventoryDatasets[parentReg][itemVal]) {
          regionalInventoryDatasets[parentReg][itemVal] = {
            safetyStock: 2,
            openingStock: 0,
            movements: [],
            areaStocks: []
          };
        }
        const regBook = regionalInventoryDatasets[parentReg][itemVal];
        if (!Array.isArray(regBook.areaStocks)) regBook.areaStocks = [];
        let areaRow = regBook.areaStocks.find(a => a.warehouse === targetWh);
        if (!areaRow) {
          areaRow = { warehouse: targetWh, inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 };
          regBook.areaStocks.push(areaRow);
        }
        areaRow.diffQty = Number(areaRow.diffQty || 0) + intQty;
        areaRow.stockQty = Math.max(0, Number(areaRow.stockQty || 0) + intQty);
      }
    }

    const defaultTierRadio = document.querySelector('input[name="diff-wh-tier"][value="hq"]');
    if (defaultTierRadio) defaultTierRadio.checked = true;
    syncDiffWarehouseTierUI(false);
    itemSel.value = '';
    qtyInput.value = '';
    reasonSel.value = '';

    if (hasActiveDiffFilter) {
      $('btn-diff-search').click();
    } else {
      renderDiffTable();
    }
    updateTransferCurrentStockDisplay();
    syncGoodsApi(GOODS_API_CONFIG.endpoints.diff, 'POST', { action: 'create', record: diffRecords[0] });
    toast(`已新增「${targetWh} - ${itemVal}」盤差紀錄（${intQty > 0 ? '+' + money(intQty) : money(intQty)}），庫存數量已更新。`);
  });

  const enterDiffEditMode = (record) => {
    if (!record) return;
    editingDiffRecordId = record.id;
    let targetTier = 'hq';
    if (areaWarehouses.includes(record.warehouse)) {
      targetTier = 'area';
    } else if (regionalWarehouses.includes(record.warehouse)) {
      targetTier = 'region';
    }
    
    const tierRadio = document.querySelector(`input[name="diff-wh-tier"][value="${targetTier}"]`);
    if (tierRadio) tierRadio.checked = true;
    syncDiffWarehouseTierUI(false);
    
    if (targetTier === 'hq') {
      $('diff-wh-hq').value = record.warehouse;
    } else if (targetTier === 'region') {
      $('diff-wh-region').value = record.warehouse;
      syncDiffAreaOptions(record.warehouse, false);
    } else if (targetTier === 'area') {
      const parentReg = areaWarehouseRegions[record.warehouse];
      $('diff-wh-region').value = parentReg || '';
      syncDiffAreaOptions(parentReg, false);
      $('diff-wh-area').value = record.warehouse;
    }
    
    $('diff-item').value = record.goodsItem || '';
    $('diff-qty').value = record.diffQty != null ? record.diffQty : '';
    $('diff-reason').value = record.diffReason || '';
    
    clearDiffWarehouseErrors();
    ['diff-item', 'diff-qty', 'diff-reason'].forEach(fid => $(fid).classList.remove('highlight-error'));
    
    $('btn-diff-add').classList.add('hidden');
    $('btn-diff-reset').classList.add('hidden');
    $('diff-edit-actions').classList.remove('hidden');
    renderDiffTable();
  };

  const exitDiffEditMode = () => {
    editingDiffRecordId = null;
    const defaultTierRadio = document.querySelector('input[name="diff-wh-tier"][value="hq"]');
    if (defaultTierRadio) defaultTierRadio.checked = true;
    syncDiffWarehouseTierUI(false);
    ['diff-item', 'diff-qty', 'diff-reason'].forEach(fid => {
      const el = $(fid);
      el.value = '';
      el.classList.remove('highlight-error');
    });
    $('diff-edit-actions').classList.add('hidden');
    $('btn-diff-add').classList.remove('hidden');
    $('btn-diff-reset').classList.remove('hidden');
    renderDiffTable();
  };

  const syncStockForDiffChange = (oldRec, newTargetWh, newItemVal, newIntQty, newReasonVal) => {
    // Revert old changes
    if (oldRec) {
      const oldWh = oldRec.warehouse;
      const oldItem = oldRec.goodsItem;
      const oldQty = Number(oldRec.diffQty || 0);
      const datasets = [inventoryDatasets, regionalInventoryDatasets, areaInventoryDatasets];
      datasets.forEach(ds => {
        const book = ds[oldWh] && ds[oldWh][oldItem];
        if (book && Array.isArray(book.movements)) {
          let idx = oldRec.movementId != null
            ? book.movements.findIndex(m => m.id === oldRec.movementId)
            : -1;
          if (idx === -1) {
            idx = book.movements.findIndex(m => m.date === oldRec.date && m.diffReason === oldRec.diffReason && Number(m.diffQty || 0) === oldQty);
          }
          if (idx !== -1) book.movements.splice(idx, 1);
        }
      });
      if (regionalWarehouses.includes(oldWh)) {
        Object.values(inventoryDatasets).forEach(whBook => {
          const iRec = whBook && whBook[oldItem];
          if (iRec && Array.isArray(iRec.regionalStocks)) {
            const regRow = iRec.regionalStocks.find(r => r.warehouse === oldWh);
            if (regRow) {
              regRow.diffQty = Number(regRow.diffQty || 0) - oldQty;
              regRow.stockQty = Math.max(0, Number(regRow.stockQty || 0) - oldQty);
            }
          }
        });
      } else if (areaWarehouses.includes(oldWh)) {
        const pReg = areaWarehouseRegions[oldWh];
        const rBook = pReg && regionalInventoryDatasets[pReg] && regionalInventoryDatasets[pReg][oldItem];
        if (rBook && Array.isArray(rBook.areaStocks)) {
          const aRow = rBook.areaStocks.find(a => a.warehouse === oldWh);
          if (aRow) {
            aRow.diffQty = Number(aRow.diffQty || 0) - oldQty;
            aRow.stockQty = Math.max(0, Number(aRow.stockQty || 0) - oldQty);
          }
        }
      }
    }

    // Apply new changes
    if (newTargetWh && newItemVal && newIntQty != null) {
      const nowRec = getNowMsRecord();
      const movDate = (oldRec && oldRec.date) ? oldRec.date : nowRec.hyphen;
      const newMovId = nextMovementId++;
      if (warehouses.includes(newTargetWh)) {
        if (!inventoryDatasets[newTargetWh]) inventoryDatasets[newTargetWh] = {};
        if (!inventoryDatasets[newTargetWh][newItemVal]) {
          inventoryDatasets[newTargetWh][newItemVal] = { safetyStock: 0, openingStock: 0, movements: [], regionalStocks: [] };
        }
        inventoryDatasets[newTargetWh][newItemVal].movements.push({
          id: newMovId, date: movDate, warehouse: newTargetWh,
          inQty: 0, outQty: 0, diffQty: newIntQty, diffReason: newReasonVal,
          createdAtStr: nowRec.isoMs, createdAtMs: nowRec.ms, updatedAtStr: nowRec.isoMs, updatedAtMs: nowRec.ms
        });
      } else if (regionalWarehouses.includes(newTargetWh)) {
        if (!regionalInventoryDatasets[newTargetWh]) regionalInventoryDatasets[newTargetWh] = {};
        if (!regionalInventoryDatasets[newTargetWh][newItemVal]) {
          regionalInventoryDatasets[newTargetWh][newItemVal] = { safetyStock: 2, openingStock: 0, movements: [], areaStocks: [] };
        }
        regionalInventoryDatasets[newTargetWh][newItemVal].movements.push({
          id: newMovId, date: movDate, warehouse: newTargetWh,
          inQty: 0, outQty: 0, transferQty: 0, diffQty: newIntQty, diffReason: newReasonVal,
          createdAtStr: nowRec.isoMs, createdAtMs: nowRec.ms, updatedAtStr: nowRec.isoMs, updatedAtMs: nowRec.ms
        });
        Object.values(inventoryDatasets).forEach(whBook => {
          const itemRec = whBook && whBook[newItemVal];
          if (itemRec && Array.isArray(itemRec.regionalStocks)) {
            const regRow = itemRec.regionalStocks.find(r => r.warehouse === newTargetWh);
            if (regRow) {
              regRow.diffQty = Number(regRow.diffQty || 0) + newIntQty;
              regRow.stockQty = Math.max(0, Number(regRow.stockQty || 0) + newIntQty);
            }
          }
        });
      } else if (areaWarehouses.includes(newTargetWh)) {
        if (!areaInventoryDatasets[newTargetWh]) areaInventoryDatasets[newTargetWh] = {};
        if (!areaInventoryDatasets[newTargetWh][newItemVal]) {
          areaInventoryDatasets[newTargetWh][newItemVal] = { safetyStock: 2, openingStock: 0, movements: [] };
        }
        areaInventoryDatasets[newTargetWh][newItemVal].movements.push({
          id: newMovId, date: movDate, warehouse: newTargetWh,
          inQty: 0, outQty: 0, transferQty: 0, diffQty: newIntQty, diffReason: newReasonVal,
          createdAtStr: nowRec.isoMs, createdAtMs: nowRec.ms, updatedAtStr: nowRec.isoMs, updatedAtMs: nowRec.ms
        });
        const parentReg = areaWarehouseRegions[newTargetWh];
        if (parentReg) {
          if (!regionalInventoryDatasets[parentReg]) regionalInventoryDatasets[parentReg] = {};
          if (!regionalInventoryDatasets[parentReg][newItemVal]) {
            regionalInventoryDatasets[parentReg][newItemVal] = {
              safetyStock: 2,
              openingStock: 0,
              movements: [],
              areaStocks: []
            };
          }
          const regBook = regionalInventoryDatasets[parentReg][newItemVal];
          if (!Array.isArray(regBook.areaStocks)) regBook.areaStocks = [];
          let areaRow = regBook.areaStocks.find(a => a.warehouse === newTargetWh);
          if (!areaRow) {
            areaRow = { warehouse: newTargetWh, inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 };
            regBook.areaStocks.push(areaRow);
          }
          areaRow.diffQty = Number(areaRow.diffQty || 0) + newIntQty;
          areaRow.stockQty = Math.max(0, Number(areaRow.stockQty || 0) + newIntQty);
        }
      }
      return newMovId;
    }
    return null;
  };

  $('btn-diff-save').addEventListener('click', async () => {
    await dataReady;
    if (editingDiffRecordId == null) return;
    const rec = diffRecords.find(r => r.id === editingDiffRecordId);
    if (!rec) { exitDiffEditMode(); return; }

    const tier = getDiffWarehouseTier();
    const hqSel = $('diff-wh-hq');
    const regSel = $('diff-wh-region');
    const areaSel = $('diff-wh-area');
    const itemSel = $('diff-item');
    const qtyInput = $('diff-qty');
    const reasonSel = $('diff-reason');

    const itemVal = itemSel.value.trim();
    const rawQtyStr = qtyInput.value.trim();
    const qtyNum = rawQtyStr === '' ? NaN : Number(rawQtyStr);
    const reasonVal = reasonSel.value.trim();

    clearDiffWarehouseErrors();
    [itemSel, qtyInput, reasonSel].forEach(el => el.classList.remove('highlight-error'));

    let firstInvalid = null;
    const missingFields = [];
    let targetWh = '';

    if (tier === 'hq') {
      targetWh = hqSel.value.trim();
      if (!targetWh) { hqSel.classList.add('highlight-error'); firstInvalid = firstInvalid || hqSel; missingFields.push('盤差倉庫'); }
    } else if (tier === 'region') {
      targetWh = regSel.value.trim();
      if (!targetWh) { regSel.classList.add('highlight-error'); firstInvalid = firstInvalid || regSel; missingFields.push('盤差倉庫'); }
    } else {
      const regVal = regSel.value.trim();
      const areaVal = areaSel.value.trim();
      if (!regVal) { regSel.classList.add('highlight-error'); firstInvalid = firstInvalid || regSel; missingFields.push('盤差倉庫'); }
      else if (!areaVal) { areaSel.classList.add('highlight-error'); firstInvalid = firstInvalid || areaSel; missingFields.push('盤差倉庫'); }
      else { targetWh = areaVal; }
    }

    if (!itemVal) { itemSel.classList.add('highlight-error'); firstInvalid = firstInvalid || itemSel; missingFields.push('物品'); }
    if (!Number.isFinite(qtyNum) || Math.trunc(qtyNum) === 0) { qtyInput.classList.add('highlight-error'); firstInvalid = firstInvalid || qtyInput; missingFields.push('盤差數量'); }
    if (!reasonVal) { reasonSel.classList.add('highlight-error'); firstInvalid = firstInvalid || reasonSel; missingFields.push('盤差原因'); }

    if (firstInvalid) {
      let msg = '請完整填寫必填欄位（盤差倉庫、物品、盤差數量、盤差原因）！';
      if (missingFields.length === 1) {
        if (missingFields[0] === '盤差數量') msg = '請輸入不可為 0 的「盤差數量」（可為正數或負數）！';
        else if (missingFields[0] === '盤差倉庫' && tier === 'area' && !regSel.value.trim()) msg = '請先選擇「中繼倉庫」，再選擇「作業區倉庫」！';
        else msg = `請選擇「${missingFields[0]}」！`;
      }
      openAlertModal(msg, () => firstInvalid.focus());
      return;
    }

    const intQty = Math.trunc(qtyNum);

    const updatedMovId = syncStockForDiffChange(rec, targetWh, itemVal, intQty, reasonVal);
    const nowRec = getNowMsRecord();
    rec.movementId = updatedMovId;
    rec.warehouse = targetWh;
    rec.goodsItem = itemVal;
    rec.diffQty = intQty;
    rec.diffReason = reasonVal;
    rec.updatedAtStr = nowRec.isoMs;
    rec.updatedAtMs = nowRec.ms;

    if (hasActiveDiffFilter) {
      $('btn-diff-search').click();
    }
    exitDiffEditMode();
    updateTransferCurrentStockDisplay();
    syncGoodsApi(`${GOODS_API_CONFIG.endpoints.diff}/${encodeURIComponent(rec.id)}`, 'PUT', { action: 'update', record: { ...rec } });
    toast('已成功儲存盤差紀錄，庫存數量已更新。');
  });

  $('btn-diff-leave').addEventListener('click', () => {
    openConfirmModal('你的資料尚未儲存，確定要離開嗎？', '確定', () => {
      exitDiffEditMode();
    });
  });

  $('btn-diff-delete').addEventListener('click', () => {
    if (editingDiffRecordId == null) return;
    openConfirmModal('確定刪除盤差紀錄嗎？', '確認', () => {
      const idx = diffRecords.findIndex(r => r.id === editingDiffRecordId);
      if (idx !== -1) {
        const [removed] = diffRecords.splice(idx, 1);
        filteredDiffRows = filteredDiffRows.filter(r => r.id !== removed.id);
        syncStockForDiffChange(removed, null, null, null, null);
      }
          exitDiffEditMode();
      updateTransferCurrentStockDisplay();
      const delDiffId = editingDiffRecordId;
      syncGoodsApi(`${GOODS_API_CONFIG.endpoints.diff}/${encodeURIComponent(delDiffId)}`, 'DELETE', { action: 'delete', id: delDiffId });
      toast('已成功刪除盤差紀錄，庫存數量已更新。');
    });
  });

  $('btn-diff-reset').addEventListener('click', () => {
    const defaultTierRadio = document.querySelector('input[name="diff-wh-tier"][value="hq"]');
    if (defaultTierRadio) defaultTierRadio.checked = true;
    syncDiffWarehouseTierUI(false);
    ['diff-item', 'diff-qty', 'diff-reason'].forEach(fid => {
      const el = $(fid);
      el.value = '';
      el.classList.remove('highlight-error');
    });
  });

  // ==================== 分頁五：盤差作業查詢條件互動 ====================
  const diffFilter = bindRecordQueryFilter({
    inputId: 'diff-query-warehouse', wrapId: 'diff-wh-combo-wrap', menuId: 'diff-wh-combo-menu',
    clearBtnId: 'btn-clear-diff-wh', toggleBtnId: 'btn-toggle-diff-wh',
    itemId: 'diff-query-item', startId: 'diff-query-start-date', endId: 'diff-query-end-date',
    searchBtnId: 'btn-diff-search', resetBtnId: 'btn-diff-query-reset', loadingId: 'diff-loading',
    requireWarehouse: false,
    onSearch: ({ rawWarehouse, matchedWarehouse, itemVal, startVal, endVal }) => {
      hasActiveDiffFilter = true;
      filteredDiffRows = diffRecords.filter(r => {
        if (rawWarehouse) {
          if (!matchedWarehouse || r.warehouse !== matchedWarehouse) return false;
        } else if (currentRole !== 'hq' && !myPermittedWarehouses.includes(r.warehouse)) {
          return false;
        }
        if (itemVal !== '全部' && r.goodsItem !== itemVal) return false;
        const d = String(r.date || '').trim();
        if (startVal && d < startVal) return false;
        if (endVal && d > endVal) return false;
        return true;
      });
      diffPager.setPage(1);
      renderDiffTable();
    },
    onReset: () => {
      hasActiveDiffFilter = false;
      filteredDiffRows = [];
      diffPager.setPage(1);
      renderDiffTable();
    }
  });
  // ==================== 分頁一：庫存查詢 ====================
  const bindAccordion = (btnId, panelId) => {
    const btn = $(btnId);
    const panel = $(panelId);
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const willCollapse = !panel.classList.contains('is-collapsed');
      panel.classList.toggle('is-collapsed', willCollapse);
      btn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    });
  };
  bindAccordion('toggle-stock-detail', 'panel-stock-detail');
  bindAccordion('toggle-regional-detail', 'panel-regional-detail');

  const warehouseInput = $('filter-warehouse');
  const warehouseCombo = window.CTA.createComboSelect({
    inputId: 'filter-warehouse',
    wrapId: 'warehouse-combo-wrap',
    menuId: 'warehouse-combo-menu',
    clearBtnId: 'btn-clear-warehouse',
    toggleBtnId: 'btn-toggle-warehouse',
    getOptions: () => myPermittedWarehouses,
    beforeOpen: () => dataReady,
    emptyText: '無相符倉庫',
    onEnter: () => executeSearch()
  });

  ['filter-item', 'filter-start-date', 'filter-end-date'].forEach(fid => {
    $(fid).addEventListener('change', (e) => e.target.classList.remove('highlight-error'));
    $(fid).addEventListener('input', (e) => e.target.classList.remove('highlight-error'));
  });

  let activeSummaryTotals = { inQty: 0, outQty: 0, transferQty: 0, diffQty: 0 };
  let rawQueriedMovements = [];
  let rawQueriedRegional = [];
  let stockSortState = { key: 'date', dir: 'desc' };
  let regionalSortState = { key: '', dir: '' };

  const syncQueryTableHeaders = () => {
    const showTransferCol = currentRole !== 'hq';
    $('stock-detail-thead').innerHTML = `<tr>
      <th class="center" style="width: 68px;">序號</th>
      ${buildSortableTh('日期', 'date', stockSortState)}
      ${buildSortableTh('倉庫', 'warehouse', stockSortState)}
      ${buildSortableTh('入庫數量', 'inQty', stockSortState, 'num-col')}
      ${buildSortableTh('出庫數量', 'outQty', stockSortState, 'num-col')}
      ${showTransferCol ? buildSortableTh('調貨', 'transferQty', stockSortState, 'num-col') : ''}
      ${buildSortableTh('盤差', 'diffQty', stockSortState, 'num-col')}
      ${buildSortableTh('盤差原因', 'diffReason', stockSortState)}
    </tr>`;

    const regionWarehouseTh = currentRole === 'hq'
      ? '<th>倉庫</th>'
      : buildSortableTh('倉庫', 'warehouse', regionalSortState);

    $('regional-detail-thead').innerHTML = `<tr>
      <th class="center" style="width: 68px;">序號</th>
      ${regionWarehouseTh}
      ${buildSortableTh('入庫數量', 'inQty', regionalSortState, 'num-col')}
      ${buildSortableTh('領用量', 'receiveQty', regionalSortState, 'num-col')}
      ${buildSortableTh('調貨', 'transferQty', regionalSortState, 'num-col')}
      ${buildSortableTh('盤差', 'diffQty', regionalSortState, 'num-col')}
      ${buildSortableTh('庫存量', 'stockQty', regionalSortState, 'num-col')}
    </tr>`;
  };

  const pager = window.CTA.createPagination({
    onChange: () => renderStockDetailTable(currentMovements, activeSummaryTotals)
  });

  const renderStockDetailTable = (movements, totals) => {
    const tbody = $('stock-detail-tbody');
    const showTransferCol = currentRole !== 'hq';
    const colCount = showTransferCol ? 8 : 7;
    currentMovements = Array.isArray(movements) ? movements : [];
    activeSummaryTotals = totals || { inQty: 0, outQty: 0, transferQty: 0, diffQty: 0 };

    if (currentMovements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty">查無符合條件的資料</td></tr>`;
      pager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentMovements.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentMovements.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentMovements.length, totalPages, currentPage);

    const rowsHtml = pageData.map((row, idx) => `
      <tr class="${row.id === editingDiffRecordId ? 'is-editing-row' : ''}">
        <td class="center">${startIndex + idx + 1}</td>
        <td>${row.date || ''}</td>
        <td>${row.warehouse || ''}</td>
        <td class="num-col">${money(row.inQty)}</td>
        <td class="num-col">${money(row.outQty)}</td>
        ${showTransferCol ? `<td class="num-col">${money(row.transferQty || 0)}</td>` : ''}
        <td class="num-col">${money(row.diffQty)}</td>
        <td>${row.diffReason || ''}</td>
      </tr>
    `).join('');

    const summaryHtml = `
      <tr class="table-summary-row">
        <td class="center"></td>
        <td>合計</td>
        <td></td>
        <td class="num-col">${money(activeSummaryTotals.inQty)}</td>
        <td class="num-col">${money(activeSummaryTotals.outQty)}</td>
        ${showTransferCol ? `<td class="num-col">${money(activeSummaryTotals.transferQty || 0)}</td>` : ''}
        <td class="num-col">${money(activeSummaryTotals.diffQty)}</td>
        <td></td>
      </tr>
    `;

    tbody.innerHTML = rowsHtml + summaryHtml;
  };

  const renderRegionalDetailTable = (regionalRows) => {
    const tbody = $('regional-detail-tbody');
    const list = Array.isArray(regionalRows) ? regionalRows : [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">查無符合條件的資料</td></tr>`;
      $('regional-stock-total-row').classList.add('hidden');
      $('regional-stock-total-val').textContent = '0';
      return 0;
    }

    tbody.innerHTML = list.map((row, idx) => `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${row.warehouse || ''}</td>
        <td class="num-col">${money(row.inQty)}</td>
        <td class="num-col">${money(row.receiveQty)}</td>
        <td class="num-col">${money(row.transferQty)}</td>
        <td class="num-col">${money(row.diffQty)}</td>
        <td class="num-col">${money(row.stockQty)}</td>
      </tr>
    `).join('');

    const totalRegional = list.reduce((sum, r) => sum + Number(r.stockQty || 0), 0);
    $('regional-stock-total-val').textContent = money(totalRegional);
    $('regional-stock-total-row').classList.remove('hidden');
    return totalRegional;
  };

  const applyStockSortAndRender = () => {
    syncQueryTableHeaders();
    if (rawQueriedMovements.length === 0) {
      renderStockDetailTable([], activeSummaryTotals);
      return;
    }
    const sorted = sortRowsByState(rawQueriedMovements, stockSortState, true);
    renderStockDetailTable(sorted, activeSummaryTotals);
  };

  const applyRegionalSortAndRender = () => {
    syncQueryTableHeaders();
    if (rawQueriedRegional.length === 0) {
      return renderRegionalDetailTable([]);
    }
    const sorted = sortRowsByState(rawQueriedRegional, regionalSortState, false);
    return renderRegionalDetailTable(sorted);
  };

  $('stock-detail-thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable[data-sort]');
    if (!th) return;
    stockSortState = cycleSortState(stockSortState, th.dataset.sort, ['inQty', 'outQty', 'transferQty', 'diffQty']);
    if (rawQueriedMovements.length > 0) {
      pager.setPage(1);
      applyStockSortAndRender();
    } else {
      syncQueryTableHeaders();
    }
  });

  $('regional-detail-thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    const isNum = numericSortKeys.has(key);

    if (regionalSortState.key !== key) {
      regionalSortState = { key, dir: isNum ? 'desc' : 'asc' };
    } else {
      const firstDir = isNum ? 'desc' : 'asc';
      const secondDir = firstDir === 'desc' ? 'asc' : 'desc';
      if (regionalSortState.dir === firstDir) {
        regionalSortState = { key, dir: secondDir };
      } else {
        regionalSortState = { key: '', dir: '' };
      }
    }

    if (rawQueriedRegional.length > 0) {
      applyRegionalSortAndRender();
    } else {
      syncQueryTableHeaders();
    }
  });

  const executeSearch = async () => {
    const rawWarehouse = cleanTrim(warehouseInput.value);
    const itemVal = $('filter-item').value.trim();
    const startVal = $('filter-start-date').value.trim();
    const endVal = $('filter-end-date').value.trim();

    warehouseInput.value = rawWarehouse;
    ['filter-warehouse', 'filter-item', 'filter-start-date', 'filter-end-date'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });

    let firstInvalid = null;
    if (!rawWarehouse) {
      $('filter-warehouse').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('filter-warehouse');
    }
    if (!itemVal) {
      $('filter-item').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('filter-item');
    }
    if (!startVal) {
      $('filter-start-date').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('filter-start-date');
    }
    if (!endVal) {
      $('filter-end-date').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('filter-end-date');
    }

    if (firstInvalid) {
      firstInvalid.focus();
      openAlertModal('請完整填寫必填查詢條件（倉庫、物品、起始日、結束日）！');
      return;
    }

    if (startVal > endVal) {
      $('filter-start-date').classList.add('highlight-error');
      $('filter-end-date').classList.add('highlight-error');
      $('filter-start-date').focus();
      openAlertModal('起始日不可大於結束日！');
      return;
    }

    warehouseCombo.close();
    $('table-loading').classList.remove('hidden');
    await dataReady;

    setTimeout(() => {
      reloadGoodsStateFromLocalStorage();
      pager.setPage(1);
      const matchedWarehouse = rawWarehouse
        ? window.CTA.resolveOptionKey(rawWarehouse, myPermittedWarehouses)
        : '';
      if (matchedWarehouse) {
        warehouseCombo.setValue(matchedWarehouse);
      }

      stockSortState = { key: 'date', dir: 'desc' };
      regionalSortState = { key: '', dir: '' };

      $('panel-regional-detail').classList.toggle('hidden', currentRole === 'area');
      if (currentRole === 'hq') {
        $('accordion-region-title').textContent = '中繼倉庫庫存明細';
      } else if (currentRole === 'region') {
        $('accordion-region-title').textContent = '作業區庫存明細';
      }

      if (rawWarehouse && !matchedWarehouse) {
        rawQueriedMovements = [];
        rawQueriedRegional = [];
        activeSummaryTotals = { inQty: 0, outQty: 0, transferQty: 0, diffQty: 0 };
        $('kpi-safety-stock').textContent = '0';
        $('kpi-opening-stock').textContent = '0';
        $('kpi-total-stock').textContent = '0';
        $('inventory-kpi-bar').classList.remove('hidden');
        $('current-warehouse-stock-row').classList.add('hidden');
        applyStockSortAndRender();
        if (currentRole !== 'area') applyRegionalSortAndRender();
        $('table-loading').classList.add('hidden');
        return;
      }

      const tierDatasets = currentRole === 'hq'
        ? inventoryDatasets
        : (currentRole === 'region' ? regionalInventoryDatasets : areaInventoryDatasets);

      const targetWarehouses = matchedWarehouse
        ? [matchedWarehouse]
        : [...myPermittedWarehouses];

      let safetyStock = 0;
      let openingStock = 0;
      let combinedMovements = [];
      let foundAnyRecord = false;

      targetWarehouses.forEach(whName => {
        const warehouseBook = tierDatasets[whName] || {};
        const itemRecord = warehouseBook[itemVal] || null;
        if (!itemRecord) return;
        foundAnyRecord = true;
        safetyStock += Number(itemRecord.safetyStock || 0);
        const baseOpening = Number(itemRecord.openingStock || 0);
        const allMovs = Array.isArray(itemRecord.movements) ? itemRecord.movements : [];
        const priorDelta = allMovs.reduce((acc, m) => {
          const d = String(m.date || '').trim();
          if (startVal && d < startVal) {
            return acc + Number(m.inQty || 0) - Number(m.outQty || 0) + Number(m.transferQty || 0) + Number(m.diffQty || 0);
          }
          return acc;
        }, 0);
        openingStock += Math.max(0, baseOpening + priorDelta);

        allMovs.forEach(m => {
          if (currentRole === 'region' && areaWarehouses.includes(m.warehouse)) return;
          const d = String(m.date || '').trim();
          if ((!startVal || d >= startVal) && (!endVal || d <= endVal)) {
            combinedMovements.push({
              ...m,
              warehouse: matchedWarehouse ? (m.warehouse || whName) : (m.warehouse || whName)
            });
          }
        });
      });



      const totals = combinedMovements.reduce((acc, m) => {
        acc.inQty += Number(m.inQty || 0);
        acc.outQty += Number(m.outQty || 0);
        acc.transferQty += Number(m.transferQty || 0);
        acc.diffQty += Number(m.diffQty || 0);
        return acc;
      }, { inQty: 0, outQty: 0, transferQty: 0, diffQty: 0 });

      rawQueriedMovements = combinedMovements;
      activeSummaryTotals = totals;

      const rawCurrentWarehouseStock = totals.inQty - totals.outQty + totals.transferQty + totals.diffQty;
      const currentWarehouseStock = Math.max(0, rawCurrentWarehouseStock);
      let subTableTotal = 0;

      if (currentRole === 'hq') {
        // 固定顯示「北、中、南、東」四個中繼倉庫明細，並同步彙整各中繼倉庫該物品的入庫、領用、調貨、盤差與庫存量
        const regList = (regionalWarehouses.length > 0 ? regionalWarehouses : ['北', '中', '南', '東']);
        const itemRecord = (inventoryDatasets[matchedWarehouse] || {})[itemVal] || {};
        const hqRegMap = new Map(
          (Array.isArray(itemRecord.regionalStocks) ? itemRecord.regionalStocks : []).map(r => [r.warehouse, { ...r }])
        );
        const mergedRegions = regList.map(rgName => {
          const baseRow = hqRegMap.get(rgName) || {
            warehouse: rgName,
            inQty: 0,
            receiveQty: 0,
            transferQty: 0,
            diffQty: 0,
            stockQty: 0
          };
          const regBook = regionalInventoryDatasets[rgName] && regionalInventoryDatasets[rgName][itemVal];
          const childAreas = areaWarehouses.filter(a => areaWarehouseRegions[a] === rgName);
          // 領用量（receiveQty）：統計該中繼區下轄所有作業區在【聯誼物資領取作業】實際領取的數量
          const areaReceivedTotal = childAreas.reduce((sum, areaName) => {
            const aBook = areaInventoryDatasets[areaName] && areaInventoryDatasets[areaName][itemVal];
            if (aBook && Array.isArray(aBook.movements)) {
              const movRecv = aBook.movements.reduce((s, m) => s + Number(m.outQty || 0), 0);
              return sum + movRecv;
            }
            const aRow = regBook && Array.isArray(regBook.areaStocks)
              ? regBook.areaStocks.find(a => a.warehouse === areaName)
              : null;
            return sum + Number(aRow ? aRow.receiveQty : 0);
          }, 0);

          if (regBook) {
            const movs = Array.isArray(regBook.movements) ? regBook.movements : [];
            let directOutToArea = 0;
            const sums = movs.reduce((acc, m) => {
              if (areaWarehouses.includes(m.warehouse)) {
                directOutToArea += Number(m.outQty || 0);
                return acc;
              }
              acc.inQty += Number(m.inQty || 0);
              directOutToArea += Number(m.outQty || 0);
              acc.transferQty += Number(m.transferQty || 0);
              acc.diffQty += Number(m.diffQty || 0);
              return acc;
            }, { inQty: 0, transferQty: 0, diffQty: 0 });
            const areaOutFromTransfers = transferOutRecords.reduce((sum, t) => {
              if ((t.signed || t.status === '已簽收') && t.outWarehouse === rgName && t.goodsItem === itemVal && areaWarehouses.includes(t.inWarehouse)) {
                return sum + Number(t.outQty || 0);
              }
              return sum;
            }, 0);
            const openQty = Number(regBook.openingStock || 0);
            const totalTransferredToArea = directOutToArea + areaOutFromTransfers;
            baseRow.inQty = sums.inQty;
            baseRow.receiveQty = areaReceivedTotal;
            baseRow.transferQty = sums.transferQty;
            baseRow.diffQty = sums.diffQty;
            baseRow.stockQty = openQty + sums.inQty - areaReceivedTotal - totalTransferredToArea + sums.transferQty + sums.diffQty;
          } else {
            baseRow.receiveQty = areaReceivedTotal;
          }
          return baseRow;
        });
        rawQueriedRegional = sortRegionalStocksFixedOrder(mergedRegions);
        subTableTotal = applyRegionalSortAndRender();
      } else if (currentRole === 'region') {
        const targetRegions = matchedWarehouse ? [matchedWarehouse] : [...regionalWarehouses];
        const mergedAreas = [];
        targetRegions.forEach(rg => {
          const itemRecord = (regionalInventoryDatasets[rg] || {})[itemVal] || {};
          const existingMap = new Map(
            (Array.isArray(itemRecord.areaStocks) ? itemRecord.areaStocks : []).map(r => [r.warehouse, { ...r }])
          );
          const childAreas = areaWarehouses.filter(a => areaWarehouseRegions[a] === rg);
          childAreas.forEach(areaName => {
            const baseRow = existingMap.get(areaName) || {
              warehouse: areaName,
              inQty: 0,
              receiveQty: 0,
              transferQty: 0,
              diffQty: 0,
              stockQty: 0
            };
            const areaBook = areaInventoryDatasets[areaName] && areaInventoryDatasets[areaName][itemVal];
            if (areaBook && Array.isArray(areaBook.movements) && areaBook.movements.length > 0) {
              const sums = areaBook.movements.reduce((acc, m) => {
                acc.inQty += Number(m.inQty || 0);
                acc.receiveQty += Number(m.outQty || 0);
                acc.transferQty += Number(m.transferQty || 0);
                acc.diffQty += Number(m.diffQty || 0);
                return acc;
              }, { inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0 });
              const openQty = Number(areaBook.openingStock || 0);
              baseRow.inQty = sums.inQty;
              baseRow.receiveQty = sums.receiveQty;
              baseRow.transferQty = sums.transferQty;
              baseRow.diffQty = sums.diffQty;
              baseRow.stockQty = Math.max(0, openQty + sums.inQty - sums.receiveQty + sums.transferQty + sums.diffQty);
            }
            mergedAreas.push(baseRow);
          });
        });
        rawQueriedRegional = mergedAreas;
        subTableTotal = applyRegionalSortAndRender();
      } else {
        rawQueriedRegional = [];
      }

      const grandTotalStock = Math.max(0, openingStock + rawCurrentWarehouseStock + subTableTotal);

      $('kpi-safety-stock').textContent = money(safetyStock);
      $('kpi-opening-stock').textContent = money(openingStock);
      $('kpi-total-stock').textContent = money(grandTotalStock);
      $('inventory-kpi-bar').classList.remove('hidden');

      $('current-warehouse-stock-val').textContent = money(currentWarehouseStock);
      $('current-warehouse-stock-row').classList.toggle('hidden', combinedMovements.length === 0);

      applyStockSortAndRender();
      $('table-loading').classList.add('hidden');
    }, 220);
  };

  $('btn-search').addEventListener('click', executeSearch);

  const applyQueryDefaultTodayDates = () => {
    const todayHyphen = getTodayDates().hyphen;
    if ($('filter-start-date')) $('filter-start-date').value = todayHyphen;
    if ($('filter-end-date')) $('filter-end-date').value = todayHyphen;
  };
  applyQueryDefaultTodayDates();

  $('btn-reset').addEventListener('click', () => {
    warehouseCombo.setValue('');
    warehouseCombo.close();
    $('filter-item').value = '';
    applyQueryDefaultTodayDates();
    applyQueryDefaultTodayDates();
    ['filter-warehouse', 'filter-item', 'filter-start-date', 'filter-end-date'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });

    rawQueriedMovements = [];
    rawQueriedRegional = [];
    currentMovements = [];
    stockSortState = { key: 'date', dir: 'desc' };
    regionalSortState = { key: '', dir: '' };
    syncQueryTableHeaders();
    pager.setPage(1);
    pager.render(0, 1, 1);

    $('kpi-safety-stock').textContent = '0';
    $('kpi-opening-stock').textContent = '0';
    $('kpi-total-stock').textContent = '0';
    $('inventory-kpi-bar').classList.remove('hidden');
    $('current-warehouse-stock-row').classList.add('hidden');
    $('regional-stock-total-row').classList.add('hidden');
    const stockColSpan = currentRole === 'hq' ? 7 : 8;
    $('stock-detail-tbody').innerHTML = `<tr><td colspan="${stockColSpan}" class="empty">請選擇條件搜尋</td></tr>`;
    $('regional-detail-tbody').innerHTML = `<tr><td colspan="8" class="empty">請選擇條件搜尋</td></tr>`;
  });

  const applyRoleUI = () => {
    const roleSelect = $('simulated-role');
    if (roleSelect && roleSelect.value !== currentRole) {
      roleSelect.value = currentRole;
    }

    if (!currentRole) {
      $('manage-sub-tabs').classList.add('hidden');
      $('tab-empty-view').classList.remove('hidden');
      Object.values(tabViewIds).forEach(viewId => {
        const el = $(viewId);
        if (el) el.classList.add('hidden');
      });
      return;
    } else {
      $('manage-sub-tabs').classList.remove('hidden');
      $('tab-empty-view').classList.add('hidden');
    }

    $('tab-btn-vendor-in').classList.toggle('hidden', currentRole !== 'hq');
    $('tab-btn-transfer-out').classList.toggle('hidden', currentRole === 'area');
    const diffTabBtn = $('tab-btn-diff');
    if (diffTabBtn) {
      diffTabBtn.textContent = currentRole === 'hq' ? '盤差作業' : '盤差查詢';
    }
    $('diff-edit-box').classList.toggle('hidden', currentRole !== 'hq');
    $('diff-split-wrap').classList.toggle('no-editor', currentRole !== 'hq');

    if (currentRole === 'hq') {
      myPermittedWarehouses = [...warehouses];
    } else if (currentRole === 'region') {
      myPermittedWarehouses = [...regionalWarehouses];
    } else if (currentRole === 'area') {
      myPermittedWarehouses = [...areaWarehouses];
    }

    let preferredTab = '';
    try {
      preferredTab = sessionStorage.getItem(GOODS_MANAGE_TAB_KEY) || '';
    } catch (_) {}
    const activeBtn = document.querySelector('#manage-sub-tabs .sub-tab-btn.active');
    const candidateTab = preferredTab || (activeBtn ? activeBtn.dataset.tab : 'query');
    const candidateBtn = document.querySelector(`#manage-sub-tabs .sub-tab-btn[data-tab="${candidateTab}"]`);
    if (!candidateBtn || candidateBtn.classList.contains('hidden')) {
      switchManageTab('query');
    } else {
      switchManageTab(candidateTab);
    }

    if (editingVendorRecordId != null) exitVendorEditMode();
    if (editingTransferRecordId != null) exitTransferEditMode();
    if (editingDiffRecordId != null) exitDiffEditMode();

    populateSelectOptions();
    signInPager.setPage(1);
    transferPager.setPage(1);
    renderSignInTable();
    renderTransferOutTable();

    // Reset all queries to fit permitted warehouses
    if (vendorFilter) vendorFilter.reset();
    if (signinFilter) signinFilter.reset();
    if (transferFilter) transferFilter.reset();
    warehouseCombo.setValue('');
    warehouseCombo.close();
    $('filter-item').value = '';
    rawQueriedMovements = [];
    rawQueriedRegional = [];
    currentMovements = [];
    $('kpi-safety-stock').textContent = '0';
    $('kpi-opening-stock').textContent = '0';
    $('kpi-total-stock').textContent = '0';
    const stockColSpan = currentRole === 'hq' ? 7 : 8;
    syncQueryTableHeaders();
    $('current-warehouse-stock-row').classList.add('hidden');
    $('regional-stock-total-row').classList.add('hidden');
    $('stock-detail-tbody').innerHTML = `<tr><td colspan="${stockColSpan}" class="empty">請選擇條件搜尋</td></tr>`;
    $('regional-detail-tbody').innerHTML = `<tr><td colspan="8" class="empty">請選擇條件搜尋</td></tr>`;

    const regPanel = $('panel-regional-detail');
    const regTitle = $('accordion-region-title');
    if (currentRole === 'area') {
      regPanel.classList.add('hidden');
    } else {
      regPanel.classList.remove('hidden');
      if (regTitle) {
        regTitle.textContent = currentRole === 'region' ? '作業區庫存明細' : '中繼倉庫庫存明細';
      }
    }

    if (typeof diffFilter !== 'undefined') diffFilter.reset();
  };

  $('btn-clear-all-inventory').addEventListener('click', () => {
    openConfirmModal(
      '確定要清空所有庫存與單據紀錄嗎？<br>清空後所有倉庫存量與入庫、出庫、簽收、盤差紀錄皆會歸零。',
      { title: '清空庫存確認', okClass: 'btn btn-danger-solid', okText: '確定清空' },
      () => {
        inventoryDatasets = {};
        regionalInventoryDatasets = {};
        areaInventoryDatasets = {};
        vendorInRecords = [];
        signInRecords = [];
        transferOutRecords = [];
        diffRecords = [];

        nextVendorRecordId = 1;
        nextSignInRecordId = 1;
        nextTransferRecordId = 1;
        nextDiffRecordId = 1;
        nextMovementId = 1;

        if (editingVendorRecordId != null) exitVendorEditMode();
        if (editingTransferRecordId != null) exitTransferEditMode();
        if (editingDiffRecordId != null) exitDiffEditMode();

    
        if (vendorFilter) vendorFilter.reset();
        if (signinFilter) signinFilter.reset();
        if (transferFilter) transferFilter.reset();
        if (typeof diffFilter !== 'undefined') diffFilter.reset();

        const queryResetBtn = $('btn-reset');
        if (queryResetBtn) queryResetBtn.click();

            renderVendorInTable();
        renderSignInTable();
        renderTransferOutTable();
        renderDiffTable();
        updateTransferCurrentStockDisplay();

        clearGoodsStateLocalStorage();
        syncGoodsApi(GOODS_API_CONFIG.endpoints.clearAll, 'POST', { action: 'clearAll' });
        toast('已清空所有庫存與單據紀錄，並清除 localStorage。');
      }
    );
  });

  // ==================== 觀看範例：預設倉庫庫存總表（嚴格勾稽計算） ====================
  const buildDefaultSampleDataset = () => {
    const todayHyphen = getTodayDates().hyphen;
    const sampleTs = `${todayHyphen} 09:00:00.000`;
    const sampleMs = Date.now();

    // 預設單據與異動（所有庫存數字皆由期初 + 廠商入庫 - 已簽收出庫 ± 調貨 - 作業區領用 ± 盤差精確推導）
    // 1. 「飛天」帳務流向：
    //    - 花蓮本會：期初 10 + 廠商入庫 20 - 出庫至北(已簽收) 8 - 出庫至南(已簽收) 5 + 盤差(-1, 包裝不完整有瑕疵) = 16
    //    - 內湖倉儲：期初 5 + 廠商入庫 15 - 出庫至中(已簽收) 6 - 出庫至東(待簽收, 未扣帳) 4 = 14 (待簽收 4)
    //    - 北中繼：期初 2 + 本會入庫 8 - 調貨至中(已簽收) 2 - 下撥台北(已簽收) 3 = 5；下轄台北進貨 3 - 領用 1 = 2
    //    - 中中繼：期初 0 + 內湖入庫 6 + 北調入(已簽收) 2 - 下撥台中(已簽收) 3 = 5；下轄台中進貨 3 - 領用 1 = 2
    //    - 南中繼：期初 3 + 花蓮入庫 5 - 下撥台南(已簽收) 4 = 4；下轄台南進貨 4 - 領用 2 = 2
    //    - 東中繼：期初 1 + 盤差(+1, 到貨點收誤差) = 2（另有內湖出庫 4 件待簽收）
    // 2. 「生育禮盒」帳務流向：
    //    - 三重國際倉儲：期初 8 + 廠商入庫 12 - 出庫至北(已簽收) 5 = 15
    //    - 北中繼：期初 0 + 三重入庫 5 - 下撥大安(已簽收) 2 = 3；下轄大安進貨 2 - 領用 1 = 1
    // 3. 「賀匾」帳務流向：
    //    - 台中清水：期初 6 + 廠商入庫 10 - 出庫至中(已簽收) 4 = 12
    //    - 中中繼：期初 1 + 台中清水入庫 4 = 5
    // 4. 「法船」帳務流向：
    //    - 花蓮本會：期初 4 + 廠商入庫 6 = 10

    const sampleVendorIn = [
      { id: 1, movementId: 101, date: todayHyphen, warehouse: '花蓮本會', goodsItem: '飛天', inQty: 20, operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 2, movementId: 102, date: todayHyphen, warehouse: '內湖倉儲', goodsItem: '飛天', inQty: 15, operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 3, movementId: 103, date: todayHyphen, warehouse: '三重國際倉儲', goodsItem: '生育禮盒', inQty: 12, operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 4, movementId: 104, date: todayHyphen, warehouse: '台中清水', goodsItem: '賀匾', inQty: 10, operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 5, movementId: 105, date: todayHyphen, warehouse: '花蓮本會', goodsItem: '法船', inQty: 6, operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
    ];

    const sampleTransfers = [
      { id: 1, signInId: 1, date: todayHyphen, mode: '出庫', outWarehouse: '花蓮本會', inWarehouse: '北', goodsItem: '飛天', outQty: 8, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 2, signInId: 2, date: todayHyphen, mode: '出庫', outWarehouse: '花蓮本會', inWarehouse: '南', goodsItem: '飛天', outQty: 5, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 3, signInId: 3, date: todayHyphen, mode: '出庫', outWarehouse: '內湖倉儲', inWarehouse: '中', goodsItem: '飛天', outQty: 6, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 4, signInId: 4, date: todayHyphen, mode: '調貨', outWarehouse: '北', inWarehouse: '中', goodsItem: '飛天', outQty: 2, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 5, signInId: 5, date: todayHyphen, mode: '出庫', outWarehouse: '北', inWarehouse: '台北', goodsItem: '飛天', outQty: 3, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 6, signInId: 6, date: todayHyphen, mode: '出庫', outWarehouse: '中', inWarehouse: '台中', goodsItem: '飛天', outQty: 3, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 7, signInId: 7, date: todayHyphen, mode: '出庫', outWarehouse: '南', inWarehouse: '台南', goodsItem: '飛天', outQty: 4, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 8, signInId: 8, date: todayHyphen, mode: '出庫', outWarehouse: '內湖倉儲', inWarehouse: '東', goodsItem: '飛天', outQty: 4, operator: '蘇2', signed: false, returned: false, status: '待簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 9, signInId: 9, date: todayHyphen, mode: '出庫', outWarehouse: '三重國際倉儲', inWarehouse: '北', goodsItem: '生育禮盒', outQty: 5, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 10, signInId: 10, date: todayHyphen, mode: '出庫', outWarehouse: '北', inWarehouse: '大安', goodsItem: '生育禮盒', outQty: 2, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 11, signInId: 11, date: todayHyphen, mode: '出庫', outWarehouse: '台中清水', inWarehouse: '中', goodsItem: '賀匾', outQty: 4, operator: '蘇2', signed: true, returned: false, status: '已簽收', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
    ];

    const sampleSignIns = sampleTransfers.map(t => ({
      id: t.signInId,
      transferId: t.id,
      date: t.date,
      outWarehouse: t.outWarehouse,
      goodsItem: t.goodsItem,
      outQty: t.outQty,
      operator: t.operator,
      inWarehouse: t.inWarehouse,
      signed: t.signed,
      returned: false,
      status: t.status,
      createdAtStr: sampleTs,
      createdAtMs: sampleMs,
      updatedAtStr: sampleTs,
      updatedAtMs: sampleMs
    }));

    const sampleDiffs = [
      { id: 1, movementId: 201, date: todayHyphen, warehouse: '花蓮本會', goodsItem: '飛天', diffQty: -1, diffReason: '包裝不完整有瑕疵', operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
      { id: 2, movementId: 202, date: todayHyphen, warehouse: '東', goodsItem: '飛天', diffQty: 1, diffReason: '到貨點收誤差', operator: '蘇2', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
    ];

    const sampleInv = {
      '花蓮本會': {
        '飛天': {
          safetyStock: 5,
          openingStock: 10,
          movements: [
            { id: 101, date: todayHyphen, warehouse: '廠商', inQty: 20, outQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 111, date: todayHyphen, warehouse: '北', inQty: 0, outQty: 8, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 112, date: todayHyphen, warehouse: '南', inQty: 0, outQty: 5, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 201, date: todayHyphen, warehouse: '花蓮本會', inQty: 0, outQty: 0, diffQty: -1, diffReason: '包裝不完整有瑕疵', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          regionalStocks: [
            { warehouse: '北', inQty: 8, receiveQty: 1, transferQty: -2, diffQty: 0, stockQty: 5 },
            { warehouse: '中', inQty: 6, receiveQty: 1, transferQty: 2, diffQty: 0, stockQty: 5 },
            { warehouse: '南', inQty: 5, receiveQty: 2, transferQty: 0, diffQty: 0, stockQty: 4 },
            { warehouse: '東', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 1, stockQty: 2 }
          ]
        },
        '法船': {
          safetyStock: 3,
          openingStock: 4,
          movements: [
            { id: 105, date: todayHyphen, warehouse: '廠商', inQty: 6, outQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          regionalStocks: [
            { warehouse: '北', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '中', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '南', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '東', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        }
      },
      '內湖倉儲': {
        '飛天': {
          safetyStock: 5,
          openingStock: 5,
          movements: [
            { id: 102, date: todayHyphen, warehouse: '廠商', inQty: 15, outQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 113, date: todayHyphen, warehouse: '中', inQty: 0, outQty: 6, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          regionalStocks: [
            { warehouse: '北', inQty: 8, receiveQty: 1, transferQty: -2, diffQty: 0, stockQty: 5 },
            { warehouse: '中', inQty: 6, receiveQty: 1, transferQty: 2, diffQty: 0, stockQty: 5 },
            { warehouse: '南', inQty: 5, receiveQty: 2, transferQty: 0, diffQty: 0, stockQty: 4 },
            { warehouse: '東', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 1, stockQty: 2 }
          ]
        }
      },
      '三重國際倉儲': {
        '生育禮盒': {
          safetyStock: 4,
          openingStock: 8,
          movements: [
            { id: 103, date: todayHyphen, warehouse: '廠商', inQty: 12, outQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 114, date: todayHyphen, warehouse: '北', inQty: 0, outQty: 5, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          regionalStocks: [
            { warehouse: '北', inQty: 5, receiveQty: 1, transferQty: 0, diffQty: 0, stockQty: 3 },
            { warehouse: '中', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '南', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '東', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        }
      },
      '台中清水': {
        '賀匾': {
          safetyStock: 4,
          openingStock: 6,
          movements: [
            { id: 104, date: todayHyphen, warehouse: '廠商', inQty: 10, outQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 115, date: todayHyphen, warehouse: '中', inQty: 0, outQty: 4, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          regionalStocks: [
            { warehouse: '北', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '中', inQty: 4, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 5 },
            { warehouse: '南', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '東', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        }
      }
    };

    const sampleRegionalInv = {
      '北': {
        '飛天': {
          safetyStock: 2,
          openingStock: 2,
          movements: [
            { id: 121, date: todayHyphen, warehouse: '花蓮本會', inQty: 8, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 122, date: todayHyphen, warehouse: '中', inQty: 0, outQty: 0, transferQty: -2, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          areaStocks: [
            { warehouse: '台北', inQty: 3, receiveQty: 1, transferQty: 0, diffQty: 0, stockQty: 2 },
            { warehouse: '大安', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '蘆洲', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        },
        '生育禮盒': {
          safetyStock: 2,
          openingStock: 0,
          movements: [
            { id: 123, date: todayHyphen, warehouse: '三重國際倉儲', inQty: 5, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          areaStocks: [
            { warehouse: '台北', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '大安', inQty: 2, receiveQty: 1, transferQty: 0, diffQty: 0, stockQty: 1 },
            { warehouse: '蘆洲', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        }
      },
      '中': {
        '飛天': {
          safetyStock: 2,
          openingStock: 0,
          movements: [
            { id: 124, date: todayHyphen, warehouse: '內湖倉儲', inQty: 6, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 125, date: todayHyphen, warehouse: '北', inQty: 0, outQty: 0, transferQty: 2, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          areaStocks: [
            { warehouse: '台中', inQty: 3, receiveQty: 1, transferQty: 0, diffQty: 0, stockQty: 2 }
          ]
        },
        '賀匾': {
          safetyStock: 2,
          openingStock: 1,
          movements: [
            { id: 126, date: todayHyphen, warehouse: '台中清水', inQty: 4, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          areaStocks: [
            { warehouse: '台中', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        }
      },
      '南': {
        '飛天': {
          safetyStock: 2,
          openingStock: 3,
          movements: [
            { id: 127, date: todayHyphen, warehouse: '花蓮本會', inQty: 5, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          areaStocks: [
            { warehouse: '(大林)嘉義', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 },
            { warehouse: '台南', inQty: 4, receiveQty: 2, transferQty: 0, diffQty: 0, stockQty: 2 },
            { warehouse: '高雄', inQty: 0, receiveQty: 0, transferQty: 0, diffQty: 0, stockQty: 0 }
          ]
        }
      },
      '東': {
        '飛天': {
          safetyStock: 2,
          openingStock: 1,
          movements: [
            { id: 202, date: todayHyphen, warehouse: '東', inQty: 0, outQty: 0, transferQty: 0, diffQty: 1, diffReason: '到貨點收誤差', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ],
          areaStocks: []
        }
      }
    };

    const sampleAreaInv = {
      '台北': {
        '飛天': {
          safetyStock: 2,
          openingStock: 0,
          movements: [
            { id: 131, date: todayHyphen, warehouse: '北', inQty: 3, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 132, date: todayHyphen, warehouse: '聯誼領取', inQty: 0, outQty: 1, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ]
        }
      },
      '大安': {
        '生育禮盒': {
          safetyStock: 2,
          openingStock: 0,
          movements: [
            { id: 133, date: todayHyphen, warehouse: '北', inQty: 2, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 134, date: todayHyphen, warehouse: '聯誼領取', inQty: 0, outQty: 1, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ]
        }
      },
      '台中': {
        '飛天': {
          safetyStock: 2,
          openingStock: 0,
          movements: [
            { id: 135, date: todayHyphen, warehouse: '中', inQty: 3, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 136, date: todayHyphen, warehouse: '聯誼領取', inQty: 0, outQty: 1, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ]
        }
      },
      '台南': {
        '飛天': {
          safetyStock: 2,
          openingStock: 0,
          movements: [
            { id: 137, date: todayHyphen, warehouse: '南', inQty: 4, outQty: 0, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs },
            { id: 138, date: todayHyphen, warehouse: '聯誼領取', inQty: 0, outQty: 2, transferQty: 0, diffQty: 0, diffReason: '', createdAtStr: sampleTs, createdAtMs: sampleMs, updatedAtStr: sampleTs, updatedAtMs: sampleMs }
          ]
        }
      }
    };

    return {
      todayHyphen,
      inventoryDatasets: sampleInv,
      regionalInventoryDatasets: sampleRegionalInv,
      areaInventoryDatasets: sampleAreaInv,
      vendorInRecords: sampleVendorIn,
      signInRecords: sampleSignIns,
      transferOutRecords: sampleTransfers,
      diffRecords: sampleDiffs
    };
  };

  const renderSampleInventoryModal = () => {
    const sample = buildDefaultSampleDataset();
    const hqList = warehouses.length > 0 ? warehouses : ['花蓮本會', '內湖倉儲', '三重國際倉儲', '台中清水'];
    const regList = regionalWarehouses.length > 0 ? regionalWarehouses : ['北', '中', '南', '東'];
    const areaList = ['台北', '大安', '台中', '台南'];
    const items = goodsItems.length > 0 ? goodsItems : ['飛天', '生育禮盒', '賀匾', '法船'];

    // 1. 計算本會倉庫各物品精確明細（期初 + 入庫 - 已簽收出庫 ± 盤差 = 當前庫存；另列待簽收保留數）
    const hqRows = [];
    hqList.forEach(wh => {
      items.forEach(it => {
        const rec = sample.inventoryDatasets[wh] && sample.inventoryDatasets[wh][it];
        if (!rec) return;
        const opening = Number(rec.openingStock || 0);
        const sums = (rec.movements || []).reduce((acc, m) => {
          acc.inQty += Number(m.inQty || 0);
          acc.outQty += Number(m.outQty || 0);
          acc.diffQty += Number(m.diffQty || 0);
          return acc;
        }, { inQty: 0, outQty: 0, diffQty: 0 });
        const pendingOut = sample.transferOutRecords.reduce((s, t) => (!t.signed && t.outWarehouse === wh && t.goodsItem === it ? s + Number(t.outQty || 0) : s), 0);
        const stockQty = opening + sums.inQty - sums.outQty + sums.diffQty;
        hqRows.push({ warehouse: wh, item: it, opening, ...sums, pendingOut, stockQty });
      });
    });

    // 2. 計算中繼倉庫（北、中、南、東）各物品精確明細（期初 + 本會入庫 ± 調貨 - 已簽收下撥作業區 ± 盤差 = 中繼現存）
    const regRows = [];
    regList.forEach(rg => {
      items.forEach(it => {
        const rec = sample.regionalInventoryDatasets[rg] && sample.regionalInventoryDatasets[rg][it];
        if (!rec) return;
        const opening = Number(rec.openingStock || 0);
        const sums = (rec.movements || []).reduce((acc, m) => {
          acc.inQty += Number(m.inQty || 0);
          acc.transferQty += Number(m.transferQty || 0);
          acc.diffQty += Number(m.diffQty || 0);
          return acc;
        }, { inQty: 0, transferQty: 0, diffQty: 0 });
        const outToArea = sample.transferOutRecords.reduce((s, t) => (t.signed && t.outWarehouse === rg && t.goodsItem === it && areaWarehouses.includes(t.inWarehouse) ? s + Number(t.outQty || 0) : s), 0);
        const stockQty = opening + sums.inQty + sums.transferQty - outToArea + sums.diffQty;
        regRows.push({ warehouse: rg, item: it, opening, ...sums, outToArea, stockQty });
      });
    });

    // 3. 計算作業區倉庫各物品精確明細（中繼撥入 - 聯誼領用 = 作業區現存）
    const areaRows = [];
    areaList.forEach(ar => {
      items.forEach(it => {
        const rec = sample.areaInventoryDatasets[ar] && sample.areaInventoryDatasets[ar][it];
        if (!rec) return;
        const opening = Number(rec.openingStock || 0);
        const sums = (rec.movements || []).reduce((acc, m) => {
          acc.inQty += Number(m.inQty || 0);
          acc.receiveQty += Number(m.outQty || 0);
          return acc;
        }, { inQty: 0, receiveQty: 0 });
        const stockQty = opening + sums.inQty - sums.receiveQty;
        areaRows.push({ region: areaWarehouseRegions[ar] || '', warehouse: ar, item: it, opening, ...sums, stockQty });
      });
    });

    // 4. 全系統「飛天」總庫存核對（本會現存 30 + 中繼現存 16 + 作業區現存 6 = 全系統總庫存 52）
    const feitianHqTotal = hqRows.filter(r => r.item === '飛天').reduce((s, r) => s + r.stockQty, 0);
    const feitianRegTotal = regRows.filter(r => r.item === '飛天').reduce((s, r) => s + r.stockQty, 0);
    const feitianAreaTotal = areaRows.filter(r => r.item === '飛天').reduce((s, r) => s + r.stockQty, 0);

    const bodyEl = $('sample-inventory-modal-body');
    bodyEl.innerHTML = `
      <div style="background: #eef5ff; border: 1px solid #c9ddf8; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; color: #14264b; font-size: 14px; line-height: 1.65;">
        <strong>計算公式驗證（範例基準日：${sample.todayHyphen}）：</strong><br>
        • <strong>本會倉庫現存</strong> ＝ 期初庫存 ＋ 廠商入庫 － 已簽收出庫 ± 盤差（註：未簽收之「待簽收」單據尚未扣減帳面庫存）。<br>
        • <strong>中繼倉庫現存</strong> ＝ 期初庫存 ＋ 本會撥入 ± 區間調貨 － 撥出至作業區 ± 盤差。<br>
        • <strong>作業區倉庫現存</strong> ＝ 期初庫存 ＋ 中繼撥入 － 聯誼物資領用量。<br>
        • 以「<strong>飛天</strong>」為例：本會現存 <strong>${feitianHqTotal}</strong> ＋ 中繼現存 <strong>${feitianRegTotal}</strong> ＋ 作業區現存 <strong>${feitianAreaTotal}</strong> ＝ 全系統總庫存 <strong>${feitianHqTotal + feitianRegTotal + feitianAreaTotal}</strong> 件。
      </div>

      <h3 style="margin: 0 0 10px; font-size: 16px; color: #14264b;">一、本會倉庫庫存預設表</h3>
      <div class="table-scroll" style="margin-bottom: 20px; background: #fff;">
        <table class="detail-table" style="min-width: 780px;">
          <thead>
            <tr>
              <th>倉庫</th>
              <th>物品</th>
              <th class="num-col">前期庫存</th>
              <th class="num-col">廠商入庫</th>
              <th class="num-col">已簽收出庫</th>
              <th class="num-col">盤差</th>
              <th class="num-col">待簽收(未扣帳)</th>
              <th class="num-col">當前庫存量</th>
            </tr>
          </thead>
          <tbody>
            ${hqRows.map(r => `
              <tr>
                <td>${r.warehouse}</td>
                <td>${r.item}</td>
                <td class="num-col">${money(r.opening)}</td>
                <td class="num-col">${money(r.inQty)}</td>
                <td class="num-col">${money(r.outQty)}</td>
                <td class="num-col">${r.diffQty > 0 ? '+' + money(r.diffQty) : money(r.diffQty)}</td>
                <td class="num-col" style="color: #d97706;">${money(r.pendingOut)}</td>
                <td class="num-col" style="font-weight: 700; color: #0869ed;">${money(r.stockQty)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h3 style="margin: 0 0 10px; font-size: 16px; color: #14264b;">二、中繼倉庫庫存預設表（北、中、南、東）</h3>
      <div class="table-scroll" style="margin-bottom: 20px; background: #fff;">
        <table class="detail-table" style="min-width: 780px;">
          <thead>
            <tr>
              <th>中繼倉庫</th>
              <th>物品</th>
              <th class="num-col">前期庫存</th>
              <th class="num-col">本會入庫</th>
              <th class="num-col">區間調貨</th>
              <th class="num-col">撥出作業區</th>
              <th class="num-col">盤差</th>
              <th class="num-col">當前庫存量</th>
            </tr>
          </thead>
          <tbody>
            ${regRows.map(r => `
              <tr>
                <td>${r.warehouse}</td>
                <td>${r.item}</td>
                <td class="num-col">${money(r.opening)}</td>
                <td class="num-col">${money(r.inQty)}</td>
                <td class="num-col">${r.transferQty > 0 ? '+' + money(r.transferQty) : money(r.transferQty)}</td>
                <td class="num-col">${money(r.outToArea)}</td>
                <td class="num-col">${r.diffQty > 0 ? '+' + money(r.diffQty) : money(r.diffQty)}</td>
                <td class="num-col" style="font-weight: 700; color: #0869ed;">${money(r.stockQty)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h3 style="margin: 0 0 10px; font-size: 16px; color: #14264b;">三、作業區倉庫庫存預設表</h3>
      <div class="table-scroll" style="background: #fff;">
        <table class="detail-table" style="min-width: 680px;">
          <thead>
            <tr>
              <th>所屬中繼</th>
              <th>作業區倉庫</th>
              <th>物品</th>
              <th class="num-col">前期庫存</th>
              <th class="num-col">中繼撥入</th>
              <th class="num-col">聯誼領用量</th>
              <th class="num-col">當前庫存量</th>
            </tr>
          </thead>
          <tbody>
            ${areaRows.map(r => `
              <tr>
                <td>${r.region}</td>
                <td>${r.warehouse}</td>
                <td>${r.item}</td>
                <td class="num-col">${money(r.opening)}</td>
                <td class="num-col">${money(r.inQty)}</td>
                <td class="num-col">${money(r.receiveQty)}</td>
                <td class="num-col" style="font-weight: 700; color: #0869ed;">${money(r.stockQty)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    $('sample-inventory-modal').classList.remove('hidden');
  };

  const closeSampleInventoryModal = () => {
    $('sample-inventory-modal').classList.add('hidden');
  };

  $('btn-view-sample').addEventListener('click', async () => {
    await dataReady;
    renderSampleInventoryModal();
  });
  $('close-sample-modal').addEventListener('click', closeSampleInventoryModal);
  $('btn-sample-modal-close').addEventListener('click', closeSampleInventoryModal);
  window.CTA.registerModalEsc('sample-inventory-modal', closeSampleInventoryModal);

  $('btn-load-sample-data').addEventListener('click', () => {
    const sample = buildDefaultSampleDataset();
    inventoryDatasets = sample.inventoryDatasets;
    regionalInventoryDatasets = sample.regionalInventoryDatasets;
    areaInventoryDatasets = sample.areaInventoryDatasets;
    vendorInRecords = sample.vendorInRecords;
    signInRecords = sample.signInRecords;
    transferOutRecords = sample.transferOutRecords;
    diffRecords = sample.diffRecords;

    nextVendorRecordId = vendorInRecords.length + 1;
    nextSignInRecordId = signInRecords.length + 1;
    nextTransferRecordId = transferOutRecords.length + 1;
    nextDiffRecordId = diffRecords.length + 1;
    nextMovementId = 300;

    saveGoodsStateToLocalStorage();
    closeSampleInventoryModal();

    if (!currentRole) {
      currentRole = 'hq';
      $('simulated-role').value = 'hq';
      applyRoleUI();
      saveGoodsManageSessionUI();
    } else {
      renderVendorInTable();
      renderSignInTable();
      renderTransferOutTable();
      renderDiffTable();
      updateTransferCurrentStockDisplay();
    }
    toast('已套用預設範例庫存資料，可直接進行查詢與單據操作。');
  });

  $('simulated-role').addEventListener('change', (e) => {
    e.currentTarget.classList.remove('highlight-error');
  });

  const confirmRoleBtn = $('btn-confirm-role');
  if (confirmRoleBtn) {
    confirmRoleBtn.addEventListener('click', () => {
      const roleSelect = $('simulated-role');
      const selectedVal = roleSelect ? roleSelect.value : '';
      if (!selectedVal) {
        if (roleSelect) {
          roleSelect.classList.add('highlight-error');
          roleSelect.focus();
        }
        openAlertModal('請先選擇「作業倉庫」！');
        return;
      }
      if (roleSelect) roleSelect.classList.remove('highlight-error');
      const isRoleChanged = currentRole !== selectedVal;
      currentRole = selectedVal;
      if (isRoleChanged) {
        try { sessionStorage.removeItem(GOODS_MANAGE_TAB_KEY); } catch (_) {}
      }
      applyRoleUI();
      saveGoodsManageSessionUI();
    });
  }

  dataReady.then(() => {
    resetUnsavedFieldsOnLoad();
    try {
      sessionStorage.removeItem(GOODS_MANAGE_ROLE_KEY);
      sessionStorage.removeItem(GOODS_MANAGE_TAB_KEY);
    } catch (_) {}
    currentRole = '';
    applyRoleUI();
  });
});
