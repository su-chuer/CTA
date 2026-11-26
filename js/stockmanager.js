document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, escapeAttr, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  const STOCK_MANAGER_STORAGE_KEY = 'cta_stockmanager_state_v2';

  let hqWarehouses = [];
  let regionalWarehouses = [];
  let areaWarehousesByRelay = {};
  let ldapDirectory = {};
  let savedManagersByWarehouse = {};

  let activeTier = '';
  let activeRelay = '';
  let activeWarehouse = '';
  let draftManagers = [];

  const saveStateToLocalStorage = () => {
    try {
      localStorage.setItem(STOCK_MANAGER_STORAGE_KEY, JSON.stringify({
        hqWarehouses,
        regionalWarehouses,
        areaWarehousesByRelay,
        ldapDirectory,
        managersByWarehouse: savedManagersByWarehouse
      }));
    } catch (err) {
      console.error('儲存倉庫管理者設定失敗：', err);
    }
  };

  const getTierLabel = (tier) => {
    if (tier === 'hq') return '本會倉庫';
    if (tier === 'region') return '中繼倉庫';
    if (tier === 'area') return '作業區倉庫';
    return '';
  };

  const getSelectedTier = () => {
    const checked = document.querySelector('input[name="mgr-wh-tier"]:checked');
    return checked ? checked.value : 'hq';
  };

  const triggerBluePulse = (el) => {
    if (!el || el.disabled || el.classList.contains('hidden')) return;
    el.classList.remove('blue-pulse');
    void el.offsetWidth;
    el.classList.add('blue-pulse');
  };

  const clearWarehouseErrors = () => {
    ['mgr-wh-hq', 'mgr-wh-region', 'mgr-wh-area'].forEach(fid => {
      const el = $(fid);
      if (el) el.classList.remove('highlight-error');
    });
  };

  const syncAreaDropdownOptions = (regionFilter = '', preserveArea = false) => {
    const areaSel = $('mgr-wh-area');
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
    const hqSel = $('mgr-wh-hq');
    const regSel = $('mgr-wh-region');
    const areaSel = $('mgr-wh-area');

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
    const hqSel = $('mgr-wh-hq');
    const regSel = $('mgr-wh-region');

    hqSel.innerHTML = '<option value="" selected disabled>請選擇</option>' +
      hqWarehouses.map(wh => `<option value="${escapeAttr(wh)}">${escapeAttr(wh)}</option>`).join('');

    regSel.innerHTML = '<option value="" selected disabled>請選擇</option>' +
      regionalWarehouses.map(rg => `<option value="${escapeAttr(rg)}">${escapeAttr(rg)}</option>`).join('');

    syncTierUI(false);
  };

  const getSavedManagersForWarehouse = (whName) => {
    const list = savedManagersByWarehouse[whName];
    return Array.isArray(list) ? list.map(m => ({ ...m })) : [];
  };

  const isDirty = () => {
    if (!activeWarehouse) return false;
    const saved = getSavedManagersForWarehouse(activeWarehouse);
    if (saved.length !== draftManagers.length) return true;
    return saved.some((item, idx) => item.ldap !== draftManagers[idx].ldap || item.name !== draftManagers[idx].name);
  };

  const syncFooterAndEditorState = () => {
    const hasActive = Boolean(activeWarehouse);
    const dirty = isDirty();

    $('mgr-ldap-input').disabled = !hasActive;
    $('btn-mgr-add-ldap').disabled = !hasActive;
    $('btn-mgr-save').disabled = !hasActive;
    $('btn-mgr-revert').disabled = !dirty;

    const hintEl = $('dirty-status-hint');
    if (!hasActive) {
      hintEl.textContent = '請先於右側選擇倉庫並點擊「查詢」';
      hintEl.style.color = '#64748b';
      hintEl.style.fontWeight = '400';
    } else if (dirty) {
      hintEl.textContent = '您已調整倉庫管理者名單，請點擊「儲存」生效。';
      hintEl.style.color = '#0869ed';
      hintEl.style.fontWeight = '600';
    } else {
      hintEl.textContent = '目前尚未有未儲存的變更';
      hintEl.style.color = '#64748b';
      hintEl.style.fontWeight = '400';
    }
  };

  const renderManagersTable = () => {
    const tbody = $('stockmgr-tbody');
    const badgeEl = $('active-warehouse-badge');
    const countEl = $('manager-count-display');

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
    countEl.textContent = String(draftManagers.length);

    if (draftManagers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">此倉庫尚未設定管理者（可於右側「請填LDAP」新增）</td></tr>';
      syncFooterAndEditorState();
      return;
    }

    tbody.innerHTML = draftManagers.map((person, idx) => `
      <tr>
        <td class="center">${idx + 1}</td>
        <td style="font-weight: 600; color: #14264b;">${escapeAttr(person.name)}</td>
        <td class="center">
          <button type="button" class="btn btn-danger-solid small btn-del-mgr" data-idx="${idx}">刪除</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-del-mgr').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const target = draftManagers[idx];
        if (!target) return;
        openConfirmModal(
          `確定要移除管理者「<strong>${escapeAttr(target.name)}</strong>」嗎？`,
          { title: '刪除確認', okClass: 'btn btn-danger-solid', okText: '刪除' },
          () => {
            draftManagers.splice(idx, 1);
            renderManagersTable();
            toast(`已移除管理者「${target.name}」`);
          }
        );
      });
    });

    syncFooterAndEditorState();
  };

  const loadWarehouseManagers = (tier, relay, whName) => {
    activeTier = tier;
    activeRelay = relay;
    activeWarehouse = whName;
    draftManagers = getSavedManagersForWarehouse(whName);
    $('mgr-ldap-input').value = '';
    $('mgr-ldap-input').classList.remove('highlight-error');
    renderManagersTable();
  };

  const loadInitialData = async () => {
    let loaded = null;
    try {
      const raw = localStorage.getItem(STOCK_MANAGER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.hqWarehouses) && parsed.managersByWarehouse) {
          loaded = parsed;
        }
      }
    } catch (_) {}

    if (!loaded) {
      try {
        const res = await fetch('json/stock_manager_data.json?v=408', { cache: 'no-store' });
        if (res && res.ok) {
          loaded = await res.json();
        }
      } catch (err) {
        console.error('讀取 stock_manager_data.json 失敗：', err);
      }
    }

    if (loaded && typeof loaded === 'object') {
      hqWarehouses = Array.isArray(loaded.hqWarehouses) ? loaded.hqWarehouses : [];
      regionalWarehouses = Array.isArray(loaded.regionalWarehouses) ? loaded.regionalWarehouses : [];
      areaWarehousesByRelay = (loaded.areaWarehousesByRelay && typeof loaded.areaWarehousesByRelay === 'object')
        ? loaded.areaWarehousesByRelay
        : {};
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
      const rawMgrs = (loaded.managersByWarehouse && typeof loaded.managersByWarehouse === 'object')
        ? loaded.managersByWarehouse
        : {};
      savedManagersByWarehouse = {};
      Object.entries(rawMgrs).forEach(([wh, list]) => {
        savedManagersByWarehouse[wh] = Array.isArray(list)
          ? list.filter(m => m && m.ldap !== 'shih01' && m.ldap !== 'wang02' && m.name !== '釋德1法師' && m.name !== '王凱2')
          : [];
      });
    }

    populateDropdowns();
    renderManagersTable();
  };

  // 倉庫層級單選切換（本會倉庫 / 中繼倉庫 / 作業區倉庫）
  document.querySelectorAll('input[name="mgr-wh-tier"]').forEach(radio => {
    radio.addEventListener('change', () => {
      syncTierUI(false);
    });
  });

  ['mgr-wh-hq', 'mgr-wh-region', 'mgr-wh-area'].forEach(fid => {
    const el = $(fid);
    if (el) {
      el.addEventListener('animationend', () => el.classList.remove('blue-pulse'));
    }
  });

  $('mgr-wh-hq').addEventListener('change', () => {
    clearWarehouseErrors();
  });

  $('mgr-wh-region').addEventListener('change', (e) => {
    clearWarehouseErrors();
    if (getSelectedTier() === 'area') {
      syncAreaDropdownOptions(e.currentTarget.value, false);
      triggerBluePulse($('mgr-wh-area'));
    }
  });

  $('mgr-wh-area').addEventListener('change', () => {
    clearWarehouseErrors();
  });

  // 查詢
  const executeSearch = async () => {
    await dataReady;
    const tier = getSelectedTier();
    const hqSel = $('mgr-wh-hq');
    const regSel = $('mgr-wh-region');
    const areaSel = $('mgr-wh-area');

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
        loadWarehouseManagers(tier, targetRelay, targetWh);
        $('table-loading').classList.add('hidden');
      }, 150);
    };

    if (isDirty() && activeWarehouse && activeWarehouse !== targetWh) {
      openConfirmModal(
        `「${escapeAttr(activeWarehouse)}」的管理者名單尚未儲存，確定要切換查詢「${escapeAttr(targetWh)}」嗎？`,
        { title: '切換倉庫確認', okClass: 'btn primary', okText: '確定' },
        runQuery
      );
    } else {
      runQuery();
    }
  };

  $('btn-mgr-search').addEventListener('click', executeSearch);

  // 清除
  $('btn-mgr-reset').addEventListener('click', () => {
    const runReset = () => {
      const defaultRadio = document.querySelector('input[name="mgr-wh-tier"][value="hq"]');
      if (defaultRadio) defaultRadio.checked = true;
      syncTierUI(false);
      activeTier = '';
      activeRelay = '';
      activeWarehouse = '';
      draftManagers = [];
      $('mgr-ldap-input').value = '';
      $('mgr-ldap-input').classList.remove('highlight-error');
      renderManagersTable();
    };

    if (isDirty()) {
      openConfirmModal(
        `「${escapeAttr(activeWarehouse)}」的管理者名單尚未儲存，確定要清除嗎？`,
        { title: '清除確認', okClass: 'btn primary', okText: '確定' },
        runReset
      );
    } else {
      runReset();
    }
  });

  // 新增倉庫管理者（請填LDAP + 號按鈕）
  const addLdapManager = () => {
    if (!activeWarehouse) {
      openAlertModal('請先選擇倉庫並點擊「查詢」！');
      return;
    }
    const input = $('mgr-ldap-input');
    const raw = cleanTrim(input.value);
    if (!raw) {
      input.classList.add('highlight-error');
      openAlertModal('請先填寫 LDAP 帳號！', () => input.focus());
      return;
    }
    input.classList.remove('highlight-error');

    const lower = raw.toLowerCase();
    const matchedEntry = Object.entries(ldapDirectory).find(([k]) => k.toLowerCase() === lower);
    if (!matchedEntry) {
      input.classList.add('highlight-error');
      openAlertModal('此 LDAP 帳號無效！', () => input.focus());
      return;
    }
    const matchedLdap = matchedEntry[0];
    const matchedName = matchedEntry[1];

    const exists = draftManagers.some(m => m.ldap.toLowerCase() === matchedLdap.toLowerCase() || m.name === matchedName);
    if (exists) {
      openAlertModal(`管理者「${matchedName}」已在名單中，請勿重複新增！`, () => input.focus());
      return;
    }

    draftManagers.push({ ldap: matchedLdap, name: matchedName });
    input.value = '';
    renderManagersTable();
    toast(`已加入管理者「${matchedName}」`);
  };

  $('btn-mgr-add-ldap').addEventListener('click', addLdapManager);
  $('mgr-ldap-input').addEventListener('input', (e) => e.target.classList.remove('highlight-error'));
  $('mgr-ldap-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLdapManager();
    }
  });

  // 還原變更
  $('btn-mgr-revert').addEventListener('click', () => {
    if (!isDirty()) return;
    openConfirmModal(
      `確定要還原「<strong>${escapeAttr(activeWarehouse)}</strong>」尚未儲存的管理者變更嗎？`,
      { title: '還原確認', okClass: 'btn primary', okText: '確定' },
      () => {
        loadWarehouseManagers(activeTier, activeRelay, activeWarehouse);
        toast(`已還原「${activeWarehouse}」的管理者名單`);
      }
    );
  });

  // 儲存
  $('btn-mgr-save').addEventListener('click', () => {
    if (!activeWarehouse) return;
    openConfirmModal(
      `確定要儲存「<strong>${escapeAttr(activeWarehouse)}</strong>」的倉庫管理者設定（共 ${draftManagers.length} 人）嗎？`,
      { title: '儲存確認', okClass: 'btn primary', okText: '確定' },
      () => {
        savedManagersByWarehouse[activeWarehouse] = draftManagers.map(m => ({ ...m }));
        saveStateToLocalStorage();
        syncFooterAndEditorState();
        toast(`已成功儲存「${activeWarehouse}」的倉庫管理者設定（共 ${draftManagers.length} 人）。`);
      }
    );
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => isDirty()
  });


  // ==================== 清空名單 & 觀看範例 / 套用範例 ====================
  const fetchFreshStockManagerJson = async () => {
    const res = await fetch('json/stock_manager_data.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res || !res.ok) throw new Error('無法讀取 stock_manager_data.json');
    return await res.json();
  };

  $('btn-clear-all-sample').addEventListener('click', () => {
    openConfirmModal(
      '確定要清空所有倉庫的管理者名單與瀏覽器快取嗎？<br>清空後所有倉庫管理者名單將歸零（可隨時點擊「觀看範例」重新套用）。',
      { title: '清空名單確認', okClass: 'btn btn-danger-solid', okText: '確定清空' },
      () => {
        try { localStorage.removeItem(STOCK_MANAGER_STORAGE_KEY); } catch (_) {}
        savedManagersByWarehouse = {};
        draftManagers = [];
        saveStateToLocalStorage();
        renderManagersTable();
        toast('已清空所有倉庫管理者名單與快取。');
      }
    );
  });

  const closeSampleModal = () => $('sample-data-modal').classList.add('hidden');
  $('close-sample-modal').addEventListener('click', closeSampleModal);
  $('btn-sample-modal-close').addEventListener('click', closeSampleModal);
  window.CTA.registerModalEsc('sample-data-modal', closeSampleModal);

  let cachedFreshSample = null;

  $('btn-view-sample').addEventListener('click', async () => {
    await dataReady;
    try {
      cachedFreshSample = await fetchFreshStockManagerJson();
    } catch (_) {
      cachedFreshSample = { ldapDirectory, managersByWarehouse: savedManagersByWarehouse };
    }
    const sampleLdap = cachedFreshSample.ldapDirectory || ldapDirectory;
    const sampleMgrs = cachedFreshSample.managersByWarehouse || {};

    const getWhTierName = (wh) => {
      if (hqWarehouses.includes(wh)) return '本會倉庫';
      if (regionalWarehouses.includes(wh)) return '中繼倉庫';
      for (const [rg, list] of Object.entries(areaWarehousesByRelay)) {
        if (Array.isArray(list) && list.includes(wh)) return `作業區倉庫（${rg}）`;
      }
      return '倉庫';
    };

    const ldapEntries = Object.entries(sampleLdap).sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base', numeric: true }));
    const whEntries = Object.entries(sampleMgrs);

    $('sample-modal-title').textContent = '倉庫管理者設定｜預設人員與倉庫範例總表';
    $('sample-data-modal-body').innerHTML = `
      <div style="background: #eef5ff; border: 1px solid #c9ddf8; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; color: #14264b; font-size: 14px; line-height: 1.65;">
        <strong>操作說明：</strong><br>
        • 下表為系統預設可用之 <strong>LDAP 人員帳號對照表</strong> 與 <strong>各層級倉庫管理者範例名單</strong>。<br>
        • 點擊下方「<strong>套用此範例資料至系統</strong>」，會自動清除瀏覽器舊快取並載入此份最新名單。
      </div>

      <h3 style="margin: 0 0 10px; font-size: 16px; color: #14264b;">一、可用 LDAP 人員名單（共 ${ldapEntries.length} 筆）</h3>
      <div class="table-scroll" style="margin-bottom: 20px; background: #fff;">
        <table class="detail-table" style="min-width: 520px;">
          <thead>
            <tr>
              <th class="center" style="width: 68px;">序號</th>
              <th style="width: 180px;">LDAP 帳號</th>
              <th>姓名</th>
            </tr>
          </thead>
          <tbody>
            ${ldapEntries.map(([code, name], idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td style="font-weight: 600; color: #0869ed;">${escapeAttr(code)}</td>
                <td>${escapeAttr(name)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h3 style="margin: 0 0 10px; font-size: 16px; color: #14264b;">二、各倉庫預設管理者範例</h3>
      <div class="table-scroll" style="background: #fff;">
        <table class="detail-table" style="min-width: 640px;">
          <thead>
            <tr>
              <th class="center" style="width: 68px;">序號</th>
              <th style="width: 170px;">倉庫層級</th>
              <th style="width: 160px;">倉庫名稱</th>
              <th>預設管理者（姓名 / LDAP）</th>
            </tr>
          </thead>
          <tbody>
            ${whEntries.map(([wh, list], idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td>${escapeAttr(getWhTierName(wh))}</td>
                <td style="font-weight: 600; color: #14264b;">${escapeAttr(wh)}</td>
                <td>${Array.isArray(list) && list.length > 0
                  ? list.map(m => `${escapeAttr(m.name)} (${escapeAttr(m.ldap)})`).join('、')
                  : '<span class="blank">無</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    $('sample-data-modal').classList.remove('hidden');
  });

  $('btn-load-sample-data').addEventListener('click', async () => {
    try { localStorage.removeItem(STOCK_MANAGER_STORAGE_KEY); } catch (_) {}
    const fresh = cachedFreshSample || await fetchFreshStockManagerJson();
    if (fresh && typeof fresh === 'object') {
      if (Array.isArray(fresh.hqWarehouses)) hqWarehouses = fresh.hqWarehouses;
      if (Array.isArray(fresh.regionalWarehouses)) regionalWarehouses = fresh.regionalWarehouses;
      if (fresh.areaWarehousesByRelay && typeof fresh.areaWarehousesByRelay === 'object') {
        areaWarehousesByRelay = fresh.areaWarehousesByRelay;
      }
      if (fresh.ldapDirectory && typeof fresh.ldapDirectory === 'object') {
        ldapDirectory = { ...fresh.ldapDirectory };
      }
      savedManagersByWarehouse = (fresh.managersByWarehouse && typeof fresh.managersByWarehouse === 'object')
        ? JSON.parse(JSON.stringify(fresh.managersByWarehouse))
        : {};
    }
    saveStateToLocalStorage();
    closeSampleModal();
    if (activeWarehouse) {
      draftManagers = getSavedManagersForWarehouse(activeWarehouse);
    }
    renderManagersTable();
    toast('已清除舊快取並套用最新範例資料至系統。');
  });

  const dataReady = loadInitialData();
});
