document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, escapeAttr, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  const SETUP_WORK_STORAGE_KEY = 'cta_setupwork_state_v1';

  let workAreas = [];
  let allTeams = [];               // [{ code, name }]
  let savedAreaAssignments = {};   // { '台北': ['NTN35', ...], ... }
  let activeArea = '';
  let draftAssignedCodes = [];     // 目前作業區右側的組隊代碼陣列

  let leftCheckedCodes = new Set();
  let rightCheckedCodes = new Set();
  let dragSourceSide = null;       // 'left' | 'right'
  let draggedCodes = [];

  const saveStateToLocalStorage = () => {
    try {
      localStorage.setItem(SETUP_WORK_STORAGE_KEY, JSON.stringify({
        workAreas,
        allTeams,
        areaAssignments: savedAreaAssignments
      }));
    } catch (err) {
      console.error('儲存作業區設定失敗：', err);
    }
  };

  const loadInitialData = async () => {
    let loaded = null;
    try {
      const raw = localStorage.getItem(SETUP_WORK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.workAreas) && Array.isArray(parsed.allTeams)) {
          loaded = parsed;
        }
      }
    } catch (_) {}

    if (!loaded) {
      try {
        const res = await fetch('json/setup_work_data.json?v=374', { cache: 'no-store' });
        if (res && res.ok) {
          loaded = await res.json();
        }
      } catch (err) {
        console.error('讀取 setup_work_data.json 失敗：', err);
      }
    }

    if (loaded && typeof loaded === 'object') {
      workAreas = Array.isArray(loaded.workAreas) ? loaded.workAreas : ['台北'];
      allTeams = Array.isArray(loaded.allTeams) ? loaded.allTeams : [];
      savedAreaAssignments = (loaded.areaAssignments && typeof loaded.areaAssignments === 'object')
        ? loaded.areaAssignments
        : {};
    }

    activeArea = '';
    if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
  };

  const areaInput = $('work-area-select');
  const areaWrap = $('area-combo-wrap');

  const measureAreaTextWidth = (text, inputEl) => {
    if (!text) return 185;
    const canvas = measureAreaTextWidth._canvas || (measureAreaTextWidth._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    const style = window.getComputedStyle(inputEl);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    return Math.max(185, textWidth + 56);
  };

  const syncAreaComboWidth = (val) => {
    if (!areaWrap || !areaInput) return;
    const cleaned = cleanTrim(val != null ? val : areaInput.value);
    areaInput.title = cleaned;
    areaWrap.style.width = `${measureAreaTextWidth(cleaned, areaInput)}px`;
  };

  const areaCombo = window.CTA.createComboSelect({
    inputId: 'work-area-select',
    wrapId: 'area-combo-wrap',
    menuId: 'area-combo-menu',
    toggleBtnId: 'btn-toggle-area',
    getOptions: () => workAreas,
    beforeOpen: () => dataReady,
    emptyText: '無相符作業區',
    onSelect: (val) => syncAreaComboWidth(val),
    onInput: (val) => syncAreaComboWidth(val),
    onClear: () => syncAreaComboWidth(''),
    onEnter: () => executeSearch()
  });

  const getSavedCodesForArea = (areaName) => {
    const raw = savedAreaAssignments[areaName];
    return Array.isArray(raw) ? [...raw] : [];
  };

  const isAreaDirty = () => {
    if (!activeArea) return false;
    const saved = getSavedCodesForArea(activeArea);
    if (saved.length !== draftAssignedCodes.length) return true;
    const savedSet = new Set(saved);
    return draftAssignedCodes.some(c => !savedSet.has(c));
  };

  const syncDirtyStatusUI = () => {
    const dirty = isAreaDirty();
    const hintEl = $('dirty-status-hint');
    const resetBtn = $('btn-reset-area');
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

  const loadAreaIntoDraft = (areaName) => {
    if (!areaName) {
      activeArea = '';
      if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
      return;
    }
    activeArea = areaName;
    if ($('shuttle-panel')) $('shuttle-panel').classList.remove('hidden');
    draftAssignedCodes = getSavedCodesForArea(areaName);
    leftCheckedCodes.clear();
    rightCheckedCodes.clear();
    $('left-filter-input').value = '';
    $('right-filter-input').value = '';
    $('btn-clear-left-filter').classList.add('hidden');
    $('btn-clear-right-filter').classList.add('hidden');
    $('notice-area-name').textContent = areaName;
    $('right-area-label').textContent = areaName;
    renderBothTables();
  };

  // 取得其他作業區已認領的組隊（避免同一個和氣組隊重複歸屬多個作業區）
  const getClaimedByOtherAreasSet = () => {
    const claimed = new Set();
    Object.entries(savedAreaAssignments).forEach(([area, codes]) => {
      if (area === activeArea || !Array.isArray(codes)) return;
      codes.forEach(c => claimed.add(c));
    });
    return claimed;
  };

  const getLeftFilteredTeams = () => {
    const assignedSet = new Set(draftAssignedCodes);
    const otherClaimedSet = getClaimedByOtherAreasSet();
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

  // 全選切換
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

  // 中間 > 與 < 按鈕
  $('btn-move-right').addEventListener('click', () => {
    moveCodesToRight(Array.from(leftCheckedCodes));
  });

  $('btn-move-left').addEventListener('click', () => {
    moveCodesToLeft(Array.from(rightCheckedCodes));
  });

  // 拖曳放置區綁定（左拖到右、右拖到左）
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

  // 左右篩選框（左側自動轉大寫英文，並提供一鍵清除鈕）
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

  // 查詢作業區所屬組隊（與全站查詢條件列操作邏輯一致）
  const executeSearch = async () => {
    await dataReady;
    const rawVal = cleanTrim(areaInput.value);
    areaInput.value = rawVal;
    areaInput.classList.remove('highlight-error');

    if (!rawVal) {
      areaInput.classList.add('highlight-error');
      openAlertModal('請先選擇或輸入「作業區」！', () => areaInput.focus());
      return;
    }

    const matchedArea = window.CTA.resolveOptionKey(rawVal, workAreas);
    if (!matchedArea) {
      areaInput.classList.add('highlight-error');
      openAlertModal(`查無作業區「${rawVal}」，請從下拉選單選擇有效的作業區！`, () => areaInput.focus());
      return;
    }

    const runQuery = () => {
      areaCombo.close();
      areaCombo.setValue(matchedArea);
      syncAreaComboWidth(matchedArea);
      $('table-loading').classList.remove('hidden');
      setTimeout(() => {
        loadAreaIntoDraft(matchedArea);
        $('table-loading').classList.add('hidden');
      }, 150);
    };

    if (isAreaDirty() && activeArea && activeArea !== matchedArea) {
      openConfirmModal(
        `「${escapeAttr(activeArea)}」的組隊變更尚未儲存，確定要切換查詢「${escapeAttr(matchedArea)}」嗎？`,
        { title: '切換作業區確認', okClass: 'btn primary', okText: '確定' },
        runQuery
      );
    } else {
      runQuery();
    }
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    const runReset = () => {
      areaCombo.setValue('');
      syncAreaComboWidth('');
      areaCombo.close();
      areaInput.classList.remove('highlight-error');
      activeArea = '';
      draftAssignedCodes = [];
      leftCheckedCodes.clear();
      rightCheckedCodes.clear();
      if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
    };

    if (isAreaDirty()) {
      openConfirmModal(
        `「${escapeAttr(activeArea)}」的組隊變更尚未儲存，確定要清除嗎？`,
        { title: '清除確認', okClass: 'btn primary', okText: '確定' },
        runReset
      );
    } else {
      runReset();
    }
  });

  // 還原變更
  $('btn-reset-area').addEventListener('click', () => {
    if (!isAreaDirty()) return;
    openConfirmModal(
      `確定要還原「<strong>${escapeAttr(activeArea)}</strong>」尚未儲存的組隊變更嗎？`,
      { title: '還原確認', okClass: 'btn primary', okText: '確定' },
      () => {
        loadAreaIntoDraft(activeArea);
        toast(`已還原「${activeArea}」的組隊設定`);
      }
    );
  });

  // 儲存作業區組隊設定
  $('btn-save-area').addEventListener('click', () => {
    openConfirmModal(
      `確定要儲存「<strong>${escapeAttr(activeArea)}</strong>」的所屬組隊設定（共 ${draftAssignedCodes.length} 筆）嗎？`,
      { title: '儲存確認', okClass: 'btn primary', okText: '確定' },
      () => {
        savedAreaAssignments[activeArea] = [...draftAssignedCodes];
        saveStateToLocalStorage();
        syncDirtyStatusUI();
        toast(`已成功儲存「${activeArea}」的所屬組隊設定（共 ${draftAssignedCodes.length} 筆）。`);
      }
    );
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => isAreaDirty()
  });

  const dataReady = loadInitialData();
});
