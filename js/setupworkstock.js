document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, escapeAttr, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  const SETUP_WORKSTOCK_STORAGE_KEY = 'cta_setupworkstock_state_v2';

  let relayWarehouses = [];            // ['北', '中', '南', '東']
  let areaWarehousesByRelay = {};      // { '南': ['(大林)嘉義', '台南', '高雄', '屏東'], ... }
  let allTeams = [];                   // [{ code, name }]
  let savedWarehouseAssignments = {};  // { '台南': ['ETE01', ...], ... }

  let activeRelay = '';
  let activeWarehouse = '';
  let draftAssignedCodes = [];

  let leftCheckedCodes = new Set();
  let rightCheckedCodes = new Set();
  let dragSourceSide = null;
  let draggedCodes = [];

  const saveStateToLocalStorage = () => {
    try {
      localStorage.setItem(SETUP_WORKSTOCK_STORAGE_KEY, JSON.stringify({
        relayWarehouses,
        areaWarehousesByRelay,
        allTeams,
        warehouseAssignments: savedWarehouseAssignments
      }));
    } catch (err) {
      console.error('儲存作業區倉庫設定失敗：', err);
    }
  };

  const loadInitialData = async () => {
    let loaded = null;
    try {
      const raw = localStorage.getItem(SETUP_WORKSTOCK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.relayWarehouses) && Array.isArray(parsed.allTeams)) {
          loaded = parsed;
        }
      }
    } catch (_) {}

    if (!loaded) {
      try {
        const res = await fetch('json/setup_workstock_data.json?v=399', { cache: 'no-store' });
        if (res && res.ok) {
          loaded = await res.json();
        }
      } catch (err) {
        console.error('讀取 setup_workstock_data.json 失敗：', err);
      }
    }

    if (loaded && typeof loaded === 'object') {
      relayWarehouses = Array.isArray(loaded.relayWarehouses) ? loaded.relayWarehouses : ['北', '中', '南', '東'];
      areaWarehousesByRelay = (loaded.areaWarehousesByRelay && typeof loaded.areaWarehousesByRelay === 'object')
        ? loaded.areaWarehousesByRelay
        : {};
      allTeams = Array.isArray(loaded.allTeams) ? loaded.allTeams : [];
      savedWarehouseAssignments = (loaded.warehouseAssignments && typeof loaded.warehouseAssignments === 'object')
        ? loaded.warehouseAssignments
        : {};
    }

    activeRelay = '';
    activeWarehouse = '';
    if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
  };

  const relayInput = $('relay-warehouse-select');
  const relayWrap = $('relay-combo-wrap');
  const areaWhInput = $('area-warehouse-select');
  const areaWhWrap = $('area-wh-combo-wrap');

  const measureComboTextWidth = (text, inputEl) => {
    if (!text) return 185;
    const canvas = measureComboTextWidth._canvas || (measureComboTextWidth._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    const style = window.getComputedStyle(inputEl);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    return Math.max(185, textWidth + 68);
  };

  const syncRelayComboWidth = (val) => {
    if (!relayWrap || !relayInput) return;
    const cleaned = cleanTrim(val != null ? val : relayInput.value);
    relayInput.title = cleaned;
    relayWrap.style.width = `${measureComboTextWidth(cleaned, relayInput)}px`;
  };

  const syncAreaWhComboWidth = (val) => {
    if (!areaWhWrap || !areaWhInput) return;
    const cleaned = cleanTrim(val != null ? val : areaWhInput.value);
    areaWhInput.title = cleaned;
    areaWhWrap.style.width = `${measureComboTextWidth(cleaned, areaWhInput)}px`;
  };

  const getAvailableAreaWarehouses = () => {
    const rawRelay = cleanTrim(relayInput.value);
    const matchedRelay = window.CTA.resolveOptionKey(rawRelay, relayWarehouses);
    if (matchedRelay && Array.isArray(areaWarehousesByRelay[matchedRelay])) {
      return areaWarehousesByRelay[matchedRelay];
    }
    if (!rawRelay) {
      return Object.values(areaWarehousesByRelay).flat();
    }
    return [];
  };

  const findRelayByAreaWarehouse = (whName) => {
    if (!whName) return '';
    for (const [relay, list] of Object.entries(areaWarehousesByRelay)) {
      if (Array.isArray(list) && list.includes(whName)) return relay;
    }
    return '';
  };

  const relayCombo = window.CTA.createComboSelect({
    inputId: 'relay-warehouse-select',
    wrapId: 'relay-combo-wrap',
    menuId: 'relay-combo-menu',
    clearBtnId: 'btn-clear-relay',
    toggleBtnId: 'btn-toggle-relay',
    getOptions: () => relayWarehouses,
    beforeOpen: () => dataReady,
    emptyText: '無相符中繼倉庫',
    onSelect: (val) => {
      syncRelayComboWidth(val);
      const allowedAreas = Array.isArray(areaWarehousesByRelay[val]) ? areaWarehousesByRelay[val] : [];
      const curArea = cleanTrim(areaWhInput.value);
      if (curArea && !allowedAreas.includes(curArea)) {
        areaWhCombo.setValue('');
        syncAreaWhComboWidth('');
      }
      areaWhInput.placeholder = '請選擇作業區倉庫';
      areaWhInput.classList.remove('highlight-error');
    },
    onInput: (val) => {
      syncRelayComboWidth(val);
      const matched = window.CTA.resolveOptionKey(cleanTrim(val), relayWarehouses);
      areaWhInput.placeholder = matched ? '請選擇作業區倉庫' : '請先選擇中繼倉庫';
    },
    onClear: () => {
      syncRelayComboWidth('');
      areaWhCombo.setValue('');
      syncAreaWhComboWidth('');
      areaWhInput.placeholder = '請先選擇中繼倉庫';
    },
    onEnter: () => {
      if (!cleanTrim(areaWhInput.value)) {
        areaWhInput.focus();
      } else {
        executeSearch();
      }
    }
  });

  const areaWhCombo = window.CTA.createComboSelect({
    inputId: 'area-warehouse-select',
    wrapId: 'area-wh-combo-wrap',
    menuId: 'area-wh-combo-menu',
    clearBtnId: 'btn-clear-area-wh',
    toggleBtnId: 'btn-toggle-area-wh',
    getOptions: () => getAvailableAreaWarehouses(),
    beforeOpen: () => dataReady,
    emptyText: '請先選擇中繼倉庫',
    onSelect: (val) => {
      syncAreaWhComboWidth(val);
      if (!cleanTrim(relayInput.value)) {
        const inferredRelay = findRelayByAreaWarehouse(val);
        if (inferredRelay) {
          relayCombo.setValue(inferredRelay);
          syncRelayComboWidth(inferredRelay);
          relayInput.classList.remove('highlight-error');
        }
      }
    },
    onInput: (val) => syncAreaWhComboWidth(val),
    onClear: () => syncAreaWhComboWidth(''),
    onEnter: () => executeSearch()
  });

  const getSavedCodesForWarehouse = (whName) => {
    const raw = savedWarehouseAssignments[whName];
    return Array.isArray(raw) ? [...raw] : [];
  };

  const isWarehouseDirty = () => {
    if (!activeWarehouse) return false;
    const saved = getSavedCodesForWarehouse(activeWarehouse);
    if (saved.length !== draftAssignedCodes.length) return true;
    const savedSet = new Set(saved);
    return draftAssignedCodes.some(c => !savedSet.has(c));
  };

  const syncDirtyStatusUI = () => {
    const dirty = isWarehouseDirty();
    const hintEl = $('dirty-status-hint');
    const resetBtn = $('btn-reset-warehouse');
    if (hintEl) {
      hintEl.textContent = dirty
        ? '您已調整組隊配置，請點擊「儲存」生效。'
        : '目前尚未有未儲存的變更';
      hintEl.style.color = dirty ? '#0869ed' : '#64748b';
      hintEl.style.fontWeight = dirty ? '600' : '400';
    }
    if (resetBtn) {
      resetBtn.disabled = !dirty;
    }
  };

  const loadWarehouseIntoDraft = (relayName, whName) => {
    if (!whName) {
      activeRelay = '';
      activeWarehouse = '';
      if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
      return;
    }
    activeRelay = relayName;
    activeWarehouse = whName;
    if ($('shuttle-panel')) $('shuttle-panel').classList.remove('hidden');
    draftAssignedCodes = getSavedCodesForWarehouse(whName);
    leftCheckedCodes.clear();
    rightCheckedCodes.clear();
    $('left-filter-input').value = '';
    $('right-filter-input').value = '';
    $('btn-clear-left-filter').classList.add('hidden');
    $('btn-clear-right-filter').classList.add('hidden');
    $('notice-warehouse-name').textContent = `${relayName} - ${whName}`;
    $('right-warehouse-label').textContent = whName;
    renderBothTables();
  };

  // 取得其他作業區倉庫已認領的組隊（避免同一和氣組隊重複歸屬多個作業區倉庫）
  const getClaimedByOtherWarehousesSet = () => {
    const claimed = new Set();
    Object.entries(savedWarehouseAssignments).forEach(([wh, codes]) => {
      if (wh === activeWarehouse || !Array.isArray(codes)) return;
      codes.forEach(c => claimed.add(c));
    });
    return claimed;
  };

  const getLeftFilteredTeams = () => {
    const assignedSet = new Set(draftAssignedCodes);
    const otherClaimedSet = getClaimedByOtherWarehousesSet();
    const kw = cleanTrim($('left-filter-input').value).toLowerCase();

    return allTeams.filter(team => {
      if (assignedSet.has(team.code)) return false;
      if (otherClaimedSet.has(team.code)) return false;
      if (!kw) return true;
      return team.code.toLowerCase().includes(kw) || team.name.toLowerCase().includes(kw);
    });
  };

  const getRightFilteredTeams = () => {
    const teamMap = new Map(allTeams.map(t => [t.code, t]));
    const kw = cleanTrim($('right-filter-input').value).toLowerCase();

    return draftAssignedCodes
      .map(code => teamMap.get(code) || { code, name: code })
      .filter(team => {
        if (!kw) return true;
        return team.code.toLowerCase().includes(kw) || team.name.toLowerCase().includes(kw);
      });
  };

  const renderShuttleSide = ({
    side,
    list,
    tbodyEl,
    checkedSet,
    checkAllEl,
    countPillEl,
    selectedHintEl,
    moveBtnEl
  }) => {
    countPillEl.textContent = `${list.length} 筆`;

    const visibleCodes = new Set(list.map(t => t.code));
    Array.from(checkedSet).forEach(code => {
      if (!visibleCodes.has(code)) checkedSet.delete(code);
    });

    selectedHintEl.textContent = `已勾選 ${checkedSet.size} 筆`;
    moveBtnEl.disabled = checkedSet.size === 0;

    if (list.length === 0) {
      checkAllEl.checked = false;
      checkAllEl.indeterminate = false;
      checkAllEl.disabled = true;
      const colSpan = side === 'right' ? 5 : 4;
      const emptyMsg = side === 'left' ? '無可選取的未分配組隊' : '尚未設定所屬組隊（可由左側移轉或拖曳加入）';
      tbodyEl.innerHTML = `<tr><td colspan="${colSpan}" class="empty" style="padding: 36px 12px;">${emptyMsg}</td></tr>`;
      return;
    }

    checkAllEl.disabled = false;
    checkAllEl.checked = checkedSet.size === list.length;
    checkAllEl.indeterminate = checkedSet.size > 0 && checkedSet.size < list.length;

    tbodyEl.innerHTML = list.map(team => {
      const isChecked = checkedSet.has(team.code);
      const delCellHtml = side === 'right'
        ? `<td class="center"><button type="button" class="btn btn-danger-solid small btn-del-right-row" data-code="${escapeAttr(team.code)}">刪除</button></td>`
        : '';
      return `
        <tr class="${isChecked ? 'is-checked' : ''}" draggable="true" data-side="${side}" data-code="${escapeAttr(team.code)}">
          <td class="center"><input type="checkbox" class="submit-row-checkbox row-chk" data-code="${escapeAttr(team.code)}" ${isChecked ? 'checked' : ''} aria-label="選取 ${escapeAttr(team.code)} ${escapeAttr(team.name)}"></td>
          <td class="center"><span class="shuttle-drag-handle" title="拖曳移動">⋮⋮</span></td>
          <td style="font-weight: 600; color: #14264b;">${escapeAttr(team.code)}</td>
          <td>${escapeAttr(team.name)}</td>
          ${delCellHtml}
        </tr>
      `;
    }).join('');

    tbodyEl.querySelectorAll('tr[data-code]').forEach(tr => {
      const code = tr.dataset.code;
      const chk = tr.querySelector('.row-chk');

      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chk.checked) checkedSet.add(code);
        else checkedSet.delete(code);
        renderBothTables();
      });

      const delBtn = tr.querySelector('.btn-del-right-row');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          moveCodesToLeft([code]);
        });
      }

      tr.addEventListener('click', () => {
        if (checkedSet.has(code)) checkedSet.delete(code);
        else checkedSet.add(code);
        renderBothTables();
      });

      tr.addEventListener('dblclick', () => {
        if (side === 'left') {
          moveCodesToRight([code]);
        } else {
          moveCodesToLeft([code]);
        }
      });

      tr.addEventListener('dragstart', (e) => {
        dragSourceSide = side;
        draggedCodes = checkedSet.has(code) ? Array.from(checkedSet) : [code];
        tr.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggedCodes.join(','));
        }
      });

      tr.addEventListener('dragend', () => {
        tr.classList.remove('is-dragging');
        $('left-shuttle-box').classList.remove('drag-over');
        $('right-shuttle-box').classList.remove('drag-over');
        dragSourceSide = null;
        draggedCodes = [];
      });
    });
  };

  const renderBothTables = () => {
    const leftList = getLeftFilteredTeams();
    const rightList = getRightFilteredTeams();

    renderShuttleSide({
      side: 'left',
      list: leftList,
      tbodyEl: $('left-team-tbody'),
      checkedSet: leftCheckedCodes,
      checkAllEl: $('check-all-left'),
      countPillEl: $('left-count-pill'),
      selectedHintEl: $('left-selected-hint'),
      moveBtnEl: $('btn-move-right')
    });

    renderShuttleSide({
      side: 'right',
      list: rightList,
      tbodyEl: $('right-team-tbody'),
      checkedSet: rightCheckedCodes,
      checkAllEl: $('check-all-right'),
      countPillEl: $('right-count-pill'),
      selectedHintEl: $('right-selected-hint'),
      moveBtnEl: $('btn-move-left')
    });

    syncDirtyStatusUI();
  };

  const moveCodesToRight = (codes) => {
    if (!Array.isArray(codes) || codes.length === 0) return;
    const existingSet = new Set(draftAssignedCodes);
    codes.forEach(code => {
      if (!existingSet.has(code)) {
        draftAssignedCodes.unshift(code);
        existingSet.add(code);
      }
      leftCheckedCodes.delete(code);
    });
    renderBothTables();
  };

  const moveCodesToLeft = (codes) => {
    if (!Array.isArray(codes) || codes.length === 0) return;
    const removeSet = new Set(codes);
    draftAssignedCodes = draftAssignedCodes.filter(c => !removeSet.has(c));
    codes.forEach(code => rightCheckedCodes.delete(code));
    renderBothTables();
  };

  $('check-all-left').addEventListener('change', (e) => {
    const leftList = getLeftFilteredTeams();
    if (e.target.checked) leftList.forEach(t => leftCheckedCodes.add(t.code));
    else leftCheckedCodes.clear();
    renderBothTables();
  });

  $('check-all-right').addEventListener('change', (e) => {
    const rightList = getRightFilteredTeams();
    if (e.target.checked) rightList.forEach(t => rightCheckedCodes.add(t.code));
    else rightCheckedCodes.clear();
    renderBothTables();
  });

  $('btn-move-right').addEventListener('click', () => {
    moveCodesToRight(Array.from(leftCheckedCodes));
  });

  $('btn-move-left').addEventListener('click', () => {
    moveCodesToLeft(Array.from(rightCheckedCodes));
  });

  const bindDropZone = (boxEl, targetSide) => {
    boxEl.addEventListener('dragover', (e) => {
      if (!dragSourceSide || dragSourceSide === targetSide) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      boxEl.classList.add('drag-over');
    });

    boxEl.addEventListener('dragleave', (e) => {
      if (!boxEl.contains(e.relatedTarget)) {
        boxEl.classList.remove('drag-over');
      }
    });

    boxEl.addEventListener('drop', (e) => {
      e.preventDefault();
      boxEl.classList.remove('drag-over');
      if (!dragSourceSide || dragSourceSide === targetSide || draggedCodes.length === 0) return;
      if (targetSide === 'right') {
        moveCodesToRight(draggedCodes);
      } else {
        moveCodesToLeft(draggedCodes);
      }
    });
  };

  bindDropZone($('right-shuttle-box'), 'right');
  bindDropZone($('left-shuttle-box'), 'left');

  $('left-filter-input').addEventListener('input', (e) => {
    const upper = e.target.value.toUpperCase();
    if (e.target.value !== upper) e.target.value = upper;
    $('btn-clear-left-filter').classList.toggle('hidden', !upper);
    renderBothTables();
  });

  $('btn-clear-left-filter').addEventListener('click', () => {
    $('left-filter-input').value = '';
    $('btn-clear-left-filter').classList.add('hidden');
    renderBothTables();
    $('left-filter-input').focus();
  });

  $('right-filter-input').addEventListener('input', (e) => {
    const val = e.target.value;
    $('btn-clear-right-filter').classList.toggle('hidden', !val);
    renderBothTables();
  });

  $('btn-clear-right-filter').addEventListener('click', () => {
    $('right-filter-input').value = '';
    $('btn-clear-right-filter').classList.add('hidden');
    renderBothTables();
    $('right-filter-input').focus();
  });

  const executeSearch = async () => {
    await dataReady;
    const rawRelay = cleanTrim(relayInput.value);
    const rawAreaWh = cleanTrim(areaWhInput.value);
    relayInput.value = rawRelay;
    areaWhInput.value = rawAreaWh;
    relayInput.classList.remove('highlight-error');
    areaWhInput.classList.remove('highlight-error');

    if (!rawRelay) {
      relayInput.classList.add('highlight-error');
      openAlertModal('請先選擇或輸入「中繼倉庫」！', () => relayInput.focus());
      return;
    }

    const matchedRelay = window.CTA.resolveOptionKey(rawRelay, relayWarehouses);
    if (!matchedRelay) {
      relayInput.classList.add('highlight-error');
      openAlertModal(`查無中繼倉庫「${rawRelay}」，請從下拉選單選擇有效的中繼倉庫！`, () => relayInput.focus());
      return;
    }

    const candidateAreas = Array.isArray(areaWarehousesByRelay[matchedRelay])
      ? areaWarehousesByRelay[matchedRelay]
      : [];

    if (!rawAreaWh) {
      areaWhInput.classList.add('highlight-error');
      openAlertModal('請先選擇或輸入「作業區倉庫」！', () => areaWhInput.focus());
      return;
    }

    const matchedAreaWh = window.CTA.resolveOptionKey(rawAreaWh, candidateAreas);
    if (!matchedAreaWh) {
      areaWhInput.classList.add('highlight-error');
      openAlertModal(`中繼倉庫「${matchedRelay}」下查無作業區倉庫「${rawAreaWh}」，請從下拉選單選擇有效的作業區倉庫！`, () => areaWhInput.focus());
      return;
    }

    const runQuery = () => {
      relayCombo.close();
      areaWhCombo.close();
      relayCombo.setValue(matchedRelay);
      syncRelayComboWidth(matchedRelay);
      areaWhCombo.setValue(matchedAreaWh);
      syncAreaWhComboWidth(matchedAreaWh);
      $('table-loading').classList.remove('hidden');
      setTimeout(() => {
        loadWarehouseIntoDraft(matchedRelay, matchedAreaWh);
        $('table-loading').classList.add('hidden');
      }, 150);
    };

    if (isWarehouseDirty() && activeWarehouse && activeWarehouse !== matchedAreaWh) {
      openConfirmModal(
        `「${escapeAttr(activeRelay)} - ${escapeAttr(activeWarehouse)}」的組隊變更尚未儲存，確定要切換查詢「${escapeAttr(matchedRelay)} - ${escapeAttr(matchedAreaWh)}」嗎？`,
        { title: '切換作業區倉庫確認', okClass: 'btn primary', okText: '確定' },
        runQuery
      );
    } else {
      runQuery();
    }
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    const runReset = () => {
      relayCombo.setValue('');
      syncRelayComboWidth('');
      relayCombo.close();
      areaWhCombo.setValue('');
      syncAreaWhComboWidth('');
      areaWhCombo.close();
      areaWhInput.placeholder = '請先選擇中繼倉庫';
      relayInput.classList.remove('highlight-error');
      areaWhInput.classList.remove('highlight-error');
      activeRelay = '';
      activeWarehouse = '';
      draftAssignedCodes = [];
      leftCheckedCodes.clear();
      rightCheckedCodes.clear();
      if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
    };

    if (isWarehouseDirty()) {
      openConfirmModal(
        `「${escapeAttr(activeRelay)} - ${escapeAttr(activeWarehouse)}」的組隊變更尚未儲存，確定要清除嗎？`,
        { title: '清除確認', okClass: 'btn primary', okText: '確定' },
        runReset
      );
    } else {
      runReset();
    }
  });

  $('btn-reset-warehouse').addEventListener('click', () => {
    if (!isWarehouseDirty()) return;
    openConfirmModal(
      `確定要還原「<strong>${escapeAttr(activeRelay)} - ${escapeAttr(activeWarehouse)}</strong>」尚未儲存的組隊變更嗎？`,
      { title: '還原確認', okClass: 'btn primary', okText: '確定' },
      () => {
        loadWarehouseIntoDraft(activeRelay, activeWarehouse);
        toast(`已還原「${activeRelay} - ${activeWarehouse}」的組隊設定`);
      }
    );
  });

  $('btn-save-warehouse').addEventListener('click', () => {
    if (!activeWarehouse) return;
    openConfirmModal(
      `確定要儲存「<strong>${escapeAttr(activeRelay)} - ${escapeAttr(activeWarehouse)}</strong>」的所屬組隊設定（共 ${draftAssignedCodes.length} 筆）嗎？`,
      { title: '儲存確認', okClass: 'btn primary', okText: '確定' },
      () => {
        savedWarehouseAssignments[activeWarehouse] = [...draftAssignedCodes];
        saveStateToLocalStorage();
        syncDirtyStatusUI();
        toast(`已成功儲存「${activeRelay} - ${activeWarehouse}」的所屬組隊設定（共 ${draftAssignedCodes.length} 筆）。`);
      }
    );
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => isWarehouseDirty()
  });

  const dataReady = loadInitialData();
});
