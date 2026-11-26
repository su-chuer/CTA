document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, escapeAttr, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  const SETUP_CREW_STORAGE_KEY = 'cta_setupcrew_state_v2';

  let ldapDirectory = {};          // { 'test1': '蘇1', 'test2': '林1', 'test3': '王1', ... }
  let allTeams = [];               // [{ code, name }]
  let savedCrewAssignments = {};   // { 'test1': ['ETE03', ...], 'test2': ['ETE05', ...], ... }
  let activeLdap = '';
  let draftAssignedCodes = [];     // 目前人員右側的組隊代碼陣列

  let leftCheckedCodes = new Set();
  let rightCheckedCodes = new Set();
  let dragSourceSide = null;       // 'left' | 'right'
  let draggedCodes = [];

  const saveStateToLocalStorage = () => {
    try {
      localStorage.setItem(SETUP_CREW_STORAGE_KEY, JSON.stringify({
        ldapDirectory,
        allTeams,
        crewAssignments: savedCrewAssignments
      }));
    } catch (err) {
      console.error('儲存人員設定失敗：', err);
    }
  };

  const loadInitialData = async () => {
    let loaded = null;
    try {
      const raw = localStorage.getItem(SETUP_CREW_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.ldapDirectory && Array.isArray(parsed.allTeams)) {
          loaded = parsed;
        }
      }
    } catch (_) {}

    if (!loaded) {
      try {
        const res = await fetch('json/setup_crew_data.json?v=406', { cache: 'no-store' });
        if (res && res.ok) {
          loaded = await res.json();
        }
      } catch (err) {
        console.error('讀取 setup_crew_data.json 失敗：', err);
      }
    }

    if (loaded && typeof loaded === 'object') {
      const fallbackLdap = {
        chang01: '張1', chang02: '張2', lin01: '林1', lin02: '林2',
        su02: '蘇2', chiu01: '丘1', huang01: '黃1',
        kuo01: '郭1', kuo02: '郭2', wang01: '王1',
        chen01: '陳1', wu01: '吳1', test1: '蘇1', test2: '林1', test3: '王1'
      };
      const mergedLdap = Object.assign(
        {},
        fallbackLdap,
        (loaded.ldapDirectory && typeof loaded.ldapDirectory === 'object') ? loaded.ldapDirectory : {}
      );
      delete mergedLdap.shih01;
      delete mergedLdap.wang02;
      ldapDirectory = mergedLdap;
      allTeams = Array.isArray(loaded.allTeams) ? loaded.allTeams : [];
      savedCrewAssignments = (loaded.crewAssignments && typeof loaded.crewAssignments === 'object')
        ? { ...loaded.crewAssignments }
        : {};
      delete savedCrewAssignments.shih01;
      delete savedCrewAssignments.wang02;
    }

    activeLdap = '';
    if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
  };

  const ldapInput = $('ldap-account-input');

  const resolveLdapKey = (rawVal) => {
    const cleaned = cleanTrim(rawVal);
    if (!cleaned) return '';
    const lower = cleaned.toLowerCase();
    const exactEntry = Object.entries(ldapDirectory).find(([ldap]) => ldap.toLowerCase() === lower);
    return exactEntry ? exactEntry[0] : '';
  };

  const formatPersonDisplay = (ldap) => {
    if (!ldap) return '';
    const name = ldapDirectory[ldap];
    return name ? `${name} (${ldap})` : ldap;
  };

  ldapInput.addEventListener('input', () => {
    ldapInput.classList.remove('highlight-error');
  });

  ldapInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  const getSavedCodesForLdap = (ldap) => {
    const raw = savedCrewAssignments[ldap];
    return Array.isArray(raw) ? [...raw] : [];
  };

  const isCrewDirty = () => {
    if (!activeLdap) return false;
    const saved = getSavedCodesForLdap(activeLdap);
    if (saved.length !== draftAssignedCodes.length) return true;
    const savedSet = new Set(saved);
    return draftAssignedCodes.some(c => !savedSet.has(c));
  };

  const syncDirtyStatusUI = () => {
    const dirty = isCrewDirty();
    const hintEl = $('dirty-status-hint');
    const resetBtn = $('btn-reset-crew');
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

  const loadLdapIntoDraft = (ldap) => {
    if (!ldap) {
      activeLdap = '';
      if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
      return;
    }
    activeLdap = ldap;
    if ($('shuttle-panel')) $('shuttle-panel').classList.remove('hidden');
    draftAssignedCodes = getSavedCodesForLdap(ldap);
    leftCheckedCodes.clear();
    rightCheckedCodes.clear();
    $('left-filter-input').value = '';
    $('right-filter-input').value = '';
    $('btn-clear-left-filter').classList.add('hidden');
    $('btn-clear-right-filter').classList.add('hidden');
    const personName = ldapDirectory[ldap] || ldap;
    $('notice-person-name').textContent = personName;
    $('right-person-label').textContent = personName;
    renderBothTables();
  };

  const getLeftFilteredTeams = () => {
    const assignedSet = new Set(draftAssignedCodes);
    const kw = cleanTrim($('left-filter-input').value).toLowerCase();

    return allTeams.filter(team => {
      if (assignedSet.has(team.code)) return false;
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

  // 拖曳放置區綁定
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

  // 查詢 LDAP 帳號所屬組隊
  const executeSearch = async () => {
    await dataReady;
    const rawVal = cleanTrim(ldapInput.value);
    ldapInput.value = rawVal;
    ldapInput.classList.remove('highlight-error');

    if (!rawVal) {
      ldapInput.classList.add('highlight-error');
      openAlertModal('請先輸入「LDAP帳號」！', () => ldapInput.focus());
      return;
    }

    const matchedLdap = resolveLdapKey(rawVal);
    if (!matchedLdap) {
      ldapInput.classList.add('highlight-error');
      openAlertModal('此 LDAP 帳號無效！', () => ldapInput.focus());
      return;
    }

    const runQuery = () => {
      ldapInput.value = matchedLdap;
      $('table-loading').classList.remove('hidden');
      setTimeout(() => {
        loadLdapIntoDraft(matchedLdap);
        $('table-loading').classList.add('hidden');
      }, 150);
    };

    if (isCrewDirty() && activeLdap && activeLdap !== matchedLdap) {
      openConfirmModal(
        `「${escapeAttr(formatPersonDisplay(activeLdap))}」的組隊變更尚未儲存，確定要切換查詢「${escapeAttr(formatPersonDisplay(matchedLdap))}」嗎？`,
        { title: '切換人員確認', okClass: 'btn primary', okText: '確定' },
        runQuery
      );
    } else {
      runQuery();
    }
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    const runReset = () => {
      ldapInput.value = '';
      ldapInput.classList.remove('highlight-error');
      activeLdap = '';
      draftAssignedCodes = [];
      leftCheckedCodes.clear();
      rightCheckedCodes.clear();
      if ($('shuttle-panel')) $('shuttle-panel').classList.add('hidden');
    };

    if (isCrewDirty()) {
      openConfirmModal(
        `「${escapeAttr(formatPersonDisplay(activeLdap))}」的組隊變更尚未儲存，確定要清除嗎？`,
        { title: '清除確認', okClass: 'btn primary', okText: '確定' },
        runReset
      );
    } else {
      runReset();
    }
  });

  // 還原變更
  $('btn-reset-crew').addEventListener('click', () => {
    if (!isCrewDirty()) return;
    openConfirmModal(
      `確定要還原「<strong>${escapeAttr(formatPersonDisplay(activeLdap))}</strong>」尚未儲存的組隊變更嗎？`,
      { title: '還原確認', okClass: 'btn primary', okText: '確定' },
      () => {
        loadLdapIntoDraft(activeLdap);
        toast(`已還原「${formatPersonDisplay(activeLdap)}」的組隊設定`);
      }
    );
  });

  // 儲存人員組隊設定
  $('btn-save-crew').addEventListener('click', () => {
    if (!activeLdap) return;
    openConfirmModal(
      `確定要儲存「<strong>${escapeAttr(formatPersonDisplay(activeLdap))}</strong>」的所屬組隊設定（共 ${draftAssignedCodes.length} 筆）嗎？`,
      { title: '儲存確認', okClass: 'btn primary', okText: '確定' },
      () => {
        savedCrewAssignments[activeLdap] = [...draftAssignedCodes];
        saveStateToLocalStorage();
        syncDirtyStatusUI();
        toast(`已成功儲存「${formatPersonDisplay(activeLdap)}」的所屬組隊設定（共 ${draftAssignedCodes.length} 筆）。`);
      }
    );
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => isCrewDirty()
  });


  // ==================== 清空名單 & 觀看範例 / 套用範例 ====================
  const fetchFreshSetupCrewJson = async () => {
    const res = await fetch('json/setup_crew_data.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res || !res.ok) throw new Error('無法讀取 setup_crew_data.json');
    return await res.json();
  };

  $('btn-clear-all-sample').addEventListener('click', () => {
    openConfirmModal(
      '確定要清空所有人員的所屬組隊設定與瀏覽器快取嗎？<br>清空後所有人員組隊配置將歸零（可隨時點擊「觀看範例」重新套用）。',
      { title: '清空名單確認', okClass: 'btn btn-danger-solid', okText: '確定清空' },
      () => {
        try { localStorage.removeItem(SETUP_CREW_STORAGE_KEY); } catch (_) {}
        savedCrewAssignments = {};
        draftAssignedCodes = [];
        leftCheckedCodes.clear();
        rightCheckedCodes.clear();
        saveStateToLocalStorage();
        if (activeLdap) renderBothTables();
        toast('已清空所有人員組隊設定與快取。');
      }
    );
  });

  const closeSampleModal = () => $('sample-data-modal').classList.add('hidden');
  $('close-sample-modal').addEventListener('click', closeSampleModal);
  $('btn-sample-modal-close').addEventListener('click', closeSampleModal);
  window.CTA.registerModalEsc('sample-data-modal', closeSampleModal);

  let cachedFreshCrewSample = null;

  $('btn-view-sample').addEventListener('click', async () => {
    await dataReady;
    try {
      cachedFreshCrewSample = await fetchFreshSetupCrewJson();
    } catch (_) {
      cachedFreshCrewSample = { ldapDirectory, allTeams, crewAssignments: savedCrewAssignments };
    }
    const sampleLdap = cachedFreshCrewSample.ldapDirectory || ldapDirectory;
    const sampleAssign = cachedFreshCrewSample.crewAssignments || {};
    const teamNameMap = new Map((cachedFreshCrewSample.allTeams || allTeams).map(t => [t.code, t.name]));
    const ldapEntries = Object.entries(sampleLdap);

    $('sample-modal-title').textContent = '人員設定｜預設 LDAP 人員與所屬組隊範例總表';
    $('sample-data-modal-body').innerHTML = `
      <div style="background: #eef5ff; border: 1px solid #c9ddf8; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; color: #14264b; font-size: 14px; line-height: 1.65;">
        <strong>操作說明：</strong><br>
        • 下表為系統預設可用之 <strong>LDAP 帳號</strong> 與各人員所屬和氣組隊範例。<br>
        • 點擊下方「<strong>套用此範例資料至系統</strong>」，會自動清除瀏覽器舊快取並載入此份最新名單。
      </div>

      <div class="table-scroll" style="background: #fff;">
        <table class="detail-table" style="min-width: 680px;">
          <thead>
            <tr>
              <th class="center" style="width: 68px;">序號</th>
              <th style="width: 140px;">LDAP 帳號</th>
              <th style="width: 120px;">姓名</th>
              <th>預設所屬組隊</th>
            </tr>
          </thead>
          <tbody>
            ${ldapEntries.map(([code, name], idx) => {
              const codes = Array.isArray(sampleAssign[code]) ? sampleAssign[code] : [];
              const teamsText = codes.length > 0
                ? codes.map(c => `${escapeAttr(teamNameMap.get(c) || c)} (${escapeAttr(c)})`).join('、')
                : '<span class="blank">尚未分配組隊</span>';
              return `
                <tr>
                  <td class="center">${idx + 1}</td>
                  <td style="font-weight: 600; color: #0869ed;">${escapeAttr(code)}</td>
                  <td style="font-weight: 600;">${escapeAttr(name)}</td>
                  <td>${teamsText}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    $('sample-data-modal').classList.remove('hidden');
  });

  $('btn-load-sample-data').addEventListener('click', async () => {
    try { localStorage.removeItem(SETUP_CREW_STORAGE_KEY); } catch (_) {}
    const fresh = cachedFreshCrewSample || await fetchFreshSetupCrewJson();
    if (fresh && typeof fresh === 'object') {
      if (fresh.ldapDirectory && typeof fresh.ldapDirectory === 'object') {
        ldapDirectory = { ...fresh.ldapDirectory };
      }
      if (Array.isArray(fresh.allTeams)) {
        allTeams = fresh.allTeams;
      }
      savedCrewAssignments = (fresh.crewAssignments && typeof fresh.crewAssignments === 'object')
        ? JSON.parse(JSON.stringify(fresh.crewAssignments))
        : {};
    }
    saveStateToLocalStorage();
    closeSampleModal();
    if (activeLdap && ldapDirectory[activeLdap]) {
      loadLdapIntoDraft(activeLdap);
    }
    toast('已清除舊快取並套用最新範例資料至系統。');
  });

  const dataReady = loadInitialData();
});
