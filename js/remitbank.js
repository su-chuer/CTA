document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, escapeAttr, toast, alert: openAlertModal, confirm: openConfirmModal } = window.CTA;

  const REMIT_BANK_STORAGE_KEY = 'cta_remitbank_state_v1';

  let bankCatalog = [];       // [{ code: '008', name: '華南商業銀行' }, ...]
  let heqiTeamCatalog = [];   // [{ code: 'ETE04', name: '永康和氣' }, ...]
  let ldapDirectory = {};     // { 'kuo01': '郭1', ... }
  let bankAccounts = [];      // 全部匯款銀行帳戶
  let filteredAccounts = [];  // 目前查詢結果

  let selectedAccountId = null; // null 代表「新增匯款帳戶資料」模式；number 代表「修改」模式
  let draftStaff = [];          // [{ ldap, name }]
  let draftTeams = [];          // [{ code, name }]
  let activeSubTab = 'staff';   // 'staff' | 'team'
  let nextAccountId = 100;

  const formatBankLabel = (code, name) => {
    const c = String(code || '').trim();
    const n = String(name || '').trim();
    if (!c && !n) return '';
    return n ? `${c} ${n}` : c;
  };

  const getBankOptions = () => bankCatalog.map(b => formatBankLabel(b.code, b.name));

  const parseBankSelection = (rawVal) => {
    const cleaned = cleanTrim(rawVal);
    if (!cleaned) return null;
    const exact = bankCatalog.find(b =>
      formatBankLabel(b.code, b.name) === cleaned ||
      b.code === cleaned ||
      b.name === cleaned
    );
    if (exact) return { code: exact.code, name: exact.name };

    const codePrefixMatch = cleaned.match(/^(\d{3})\s*(.*)$/);
    if (codePrefixMatch) {
      const foundByCode = bankCatalog.find(b => b.code === codePrefixMatch[1]);
      if (foundByCode) return { code: foundByCode.code, name: foundByCode.name };
      if (codePrefixMatch[2]) {
        return { code: codePrefixMatch[1], name: cleanTrim(codePrefixMatch[2]) };
      }
    }
    return null;
  };

  // ==================== 資料載入與 localStorage 持久化 ====================
  const saveStateToLocalStorage = () => {
    try {
      const payload = {
        banks: bankCatalog,
        heqiTeams: heqiTeamCatalog,
        ldapDirectory,
        accounts: bankAccounts
      };
      localStorage.setItem(REMIT_BANK_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('儲存匯款帳戶資料失敗：', err);
    }
  };

  const loadInitialData = async () => {
    let loaded = null;
    try {
      const raw = localStorage.getItem(REMIT_BANK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.accounts)) {
          loaded = parsed;
        }
      }
    } catch (_) {}

    if (!loaded) {
      try {
        const res = await fetch('json/remit_bank_data.json?v=351', { cache: 'no-store' });
        if (res && res.ok) {
          loaded = await res.json();
        }
      } catch (err) {
        console.error('讀取 remit_bank_data.json 失敗：', err);
      }
    }

    if (loaded && typeof loaded === 'object') {
      bankCatalog = Array.isArray(loaded.banks) ? loaded.banks : [];
      heqiTeamCatalog = Array.isArray(loaded.heqiTeams) ? loaded.heqiTeams : [];
      ldapDirectory = (loaded.ldapDirectory && typeof loaded.ldapDirectory === 'object') ? loaded.ldapDirectory : {};
      bankAccounts = Array.isArray(loaded.accounts) ? loaded.accounts.map(acc => ({
        ...acc,
        staff: Array.isArray(acc.staff) ? acc.staff.map(s => ({ ...s })) : [],
        teams: Array.isArray(acc.teams) ? acc.teams.map(t => ({ ...t })) : []
      })) : [];
      nextAccountId = bankAccounts.reduce((m, r) => Math.max(m, Number(r.id || 0)), 0) + 1;
    }

    filteredAccounts = [...bankAccounts];
    hideEditorPanel();
  };


  // ==================== 小放大鏡「請選擇銀行」Popup 彈窗（上方查詢 & 右側表單共用） ====================
  let bankModalTarget = 'filter';

  const measureFilterTextWidth = (text, inputEl) => {
    if (!text) return 185;
    const canvas = measureFilterTextWidth._canvas || (measureFilterTextWidth._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    const style = window.getComputedStyle(inputEl);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    // 左側 padding(14px) + 右側預留清除鈕與放大鏡空間(60px)，基準寬度 185px（約「004 臺灣銀行」寬度）
    return Math.max(185, textWidth + 74);
  };

  const setFilterBankValue = (val) => {
    const cleaned = cleanTrim(val);
    const inputEl = $('filter-bank-code');
    const wrapEl = $('filter-bank-picker-wrap');
    inputEl.value = cleaned;
    inputEl.title = cleaned;
    $('btn-clear-filter-bank').classList.toggle('hidden', !cleaned);
    if (wrapEl) {
      wrapEl.style.width = `${measureFilterTextWidth(cleaned, inputEl)}px`;
    }
  };

  const setFormBankValue = (val) => {
    const cleaned = cleanTrim(val);
    const inputEl = $('form-bank-code');
    inputEl.value = cleaned;
    inputEl.title = cleaned;
    $('btn-clear-form-bank').classList.toggle('hidden', !cleaned);
    inputEl.classList.remove('highlight-error');
  };

  const renderBankModalTable = (filterText = '') => {
    const tbody = $('bank-modal-tbody');
    const kw = cleanTrim(filterText).toLowerCase();
    const list = bankCatalog.filter(b => {
      if (!kw) return true;
      return b.code.toLowerCase().includes(kw) || b.name.toLowerCase().includes(kw);
    });

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">查無相符的銀行代碼或銀行名稱</td></tr>';
      return;
    }

    const currentVal = bankModalTarget === 'form'
      ? cleanTrim($('form-bank-code').value)
      : cleanTrim($('filter-bank-code').value);

    tbody.innerHTML = list.map(bank => {
      const fullLabel = formatBankLabel(bank.code, bank.name);
      const isCurrent = currentVal === fullLabel;
      return `
        <tr class="${isCurrent ? 'is-selected' : ''}">
          <td style="font-weight: 600; color: #14264b;">${escapeAttr(bank.code)}</td>
          <td>${escapeAttr(bank.name)}</td>
          <td class="center">
            <button type="button" class="btn primary small btn-pick-bank" data-code="${escapeAttr(bank.code)}" ${isCurrent ? 'disabled' : ''}>
              ${isCurrent ? '已選擇' : '選擇'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-pick-bank').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const code = e.currentTarget.dataset.code;
        const found = bankCatalog.find(b => b.code === code);
        if (!found) return;
        const label = formatBankLabel(found.code, found.name);
        if (bankModalTarget === 'form') {
          setFormBankValue(label);
        } else {
          setFilterBankValue(label);
        }
        closeBankSelectModal();
      });
    });
  };

  const openBankSelectModal = async (target = 'filter') => {
    await dataReady;
    bankModalTarget = target === 'form' ? 'form' : 'filter';
    $('bank-modal-filter').value = '';
    renderBankModalTable('');
    $('bank-select-modal').classList.remove('hidden');
    setTimeout(() => $('bank-modal-filter').focus(), 30);
  };

  const closeBankSelectModal = () => {
    $('bank-select-modal').classList.add('hidden');
  };

  $('btn-open-filter-bank-modal').addEventListener('click', () => openBankSelectModal('filter'));
  $('filter-bank-code').addEventListener('click', () => openBankSelectModal('filter'));
  $('btn-clear-filter-bank').addEventListener('click', (e) => {
    e.stopPropagation();
    setFilterBankValue('');
  });

  $('btn-open-form-bank-modal').addEventListener('click', () => openBankSelectModal('form'));
  $('form-bank-code').addEventListener('click', () => openBankSelectModal('form'));
  $('btn-clear-form-bank').addEventListener('click', (e) => {
    e.stopPropagation();
    setFormBankValue('');
  });

  $('close-bank-modal').addEventListener('click', closeBankSelectModal);
  $('btn-bank-modal-cancel').addEventListener('click', closeBankSelectModal);
  window.CTA.registerModalEsc('bank-select-modal', closeBankSelectModal);
  $('bank-modal-filter').addEventListener('input', (e) => {
    renderBankModalTable(e.target.value);
  });

  ['form-bank-code', 'form-account-name', 'form-account-number'].forEach(fid => {
    const el = $(fid);
    if (el) {
      el.addEventListener('input', () => el.classList.remove('highlight-error'));
      el.addEventListener('change', () => el.classList.remove('highlight-error'));
    }
  });

  $('form-account-number').addEventListener('input', (e) => {
    const digitsOnly = e.target.value.replace(/[^0-9-]/g, '');
    if (e.target.value !== digitsOnly) {
      e.target.value = digitsOnly;
    }
  });

  // ==================== 左側帳戶列表與分頁 ====================
  const pager = window.CTA.createPagination({
    onChange: () => renderAccountTable()
  });

  const renderAccountTable = () => {
    const tbody = $('bank-account-tbody');
    const list = Array.isArray(filteredAccounts) ? filteredAccounts : [];
    $('account-count-display').textContent = String(list.length);

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">查無符合條件的匯款帳戶資料</td></tr>';
      pager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = list.slice(startIndex, startIndex + itemsPerPage);
    pager.render(list.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((row, idx) => {
      const isSelected = row.id === selectedAccountId;
      const isActive = row.status === '啟用';
      const unlockSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';
      const lockSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
      const statusHtml = isActive
        ? `<span class="bank-status-cell is-active">${unlockSvg}<span>啟用</span></span>`
        : `<span class="bank-status-cell is-inactive">${lockSvg}<span>停用</span></span>`;
      return `
        <tr class="${isSelected ? 'is-selected' : ''}" data-id="${row.id}">
          <td class="center">${startIndex + idx + 1}</td>
          <td>${escapeAttr(row.accountName || '')}</td>
          <td>${escapeAttr(row.bankCode || '')}</td>
          <td style="font-variant-numeric: tabular-nums;">${escapeAttr(row.accountNumber || '')}</td>
          <td class="center">${statusHtml}</td>
          <td class="center"><button type="button" class="btn primary small btn-edit-account" data-id="${row.id}">編輯</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-account').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const target = bankAccounts.find(a => a.id === id);
        if (target) {
          loadAccountIntoEditor(target);
        }
      });
    });
  };

  // ==================== 頂部查詢與清除 ====================
  const executeSearch = async () => {
    await dataReady;
    const rawBank = cleanTrim($('filter-bank-code').value);
    const rawKeyword = cleanTrim($('filter-account-keyword').value);

    $('filter-bank-code').value = rawBank;
    $('filter-account-keyword').value = rawKeyword;

    $('table-loading').classList.remove('hidden');
    setTimeout(() => {
      const parsedBank = parseBankSelection(rawBank);
      const bankKw = rawBank.toLowerCase();
      const kw = rawKeyword.toLowerCase();

      filteredAccounts = bankAccounts.filter(row => {
        if (rawBank) {
          if (parsedBank) {
            if (row.bankCode !== parsedBank.code) return false;
          } else {
            const fullBank = formatBankLabel(row.bankCode, row.bankName).toLowerCase();
            if (!fullBank.includes(bankKw)) return false;
          }
        }
        if (kw) {
          const matchName = String(row.accountName || '').toLowerCase().includes(kw);
          const matchNum = String(row.accountNumber || '').toLowerCase().includes(kw);
          if (!matchName && !matchNum) return false;
        }
        return true;
      });

      pager.setPage(1);
      renderAccountTable();
      $('table-loading').classList.add('hidden');
    }, 150);
  };

  $('btn-search').addEventListener('click', executeSearch);
  $('filter-account-keyword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  $('btn-reset').addEventListener('click', () => {
    setFilterBankValue('');
    $('filter-account-keyword').value = '';
    filteredAccounts = [...bankAccounts];
    pager.setPage(1);
    renderAccountTable();
  });

  // ==================== 右側表單：人員 / 組隊子頁籤切換與列表渲染 ====================
  const switchSubTab = (tabName) => {
    activeSubTab = tabName === 'team' ? 'team' : 'staff';
    $('subtab-staff').classList.toggle('active', activeSubTab === 'staff');
    $('subtab-staff').setAttribute('aria-selected', activeSubTab === 'staff' ? 'true' : 'false');
    $('subtab-team').classList.toggle('active', activeSubTab === 'team');
    $('subtab-team').setAttribute('aria-selected', activeSubTab === 'team' ? 'true' : 'false');

    $('subpanel-staff').classList.toggle('hidden', activeSubTab !== 'staff');
    $('subpanel-team').classList.toggle('hidden', activeSubTab !== 'team');
  };

  $('subtab-staff').addEventListener('click', () => switchSubTab('staff'));
  $('subtab-team').addEventListener('click', () => switchSubTab('team'));

  const renderDraftStaffTable = () => {
    $('staff-tab-count').textContent = String(draftStaff.length);
    const container = $('staff-list-tbody');
    if (draftStaff.length === 0) {
      container.innerHTML = '<span class="bank-chip-empty">尚未新增人員</span>';
      return;
    }
    container.innerHTML = draftStaff.map((person, idx) => {
      const displayLabel = person.ldap && person.ldap !== person.name
        ? `${escapeAttr(person.name)} <small>(${escapeAttr(person.ldap)})</small>`
        : escapeAttr(person.name);
      return `
        <span class="bank-chip">
          <span>${displayLabel}</span>
          <button type="button" class="bank-chip-del btn-del-staff" data-idx="${idx}" title="移除 ${escapeAttr(person.name)}" aria-label="移除 ${escapeAttr(person.name)}">&times;</button>
        </span>
      `;
    }).join('');

    container.querySelectorAll('.btn-del-staff').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const target = draftStaff[idx];
        if (!target) return;
        openConfirmModal(
          `確定要移除人員「<strong>${escapeAttr(target.name)}</strong>」嗎？`,
          { title: '刪除人員確認', okClass: 'btn btn-danger-solid', okText: '刪除' },
          () => {
            draftStaff.splice(idx, 1);
            renderDraftStaffTable();
            toast(`已移除人員「${target.name}」`);
          }
        );
      });
    });
  };

  const renderDraftTeamTable = () => {
    $('team-tab-count').textContent = String(draftTeams.length);
    const container = $('team-list-tbody');
    if (draftTeams.length === 0) {
      container.innerHTML = '<span class="bank-chip-empty">尚未新增和氣組隊</span>';
      return;
    }
    container.innerHTML = draftTeams.map((team, idx) => `
      <span class="bank-chip team-chip">
        <span>${escapeAttr(team.name)} <small>(${escapeAttr(team.code)})</small></span>
        <button type="button" class="bank-chip-del btn-del-team" data-idx="${idx}" title="移除 ${escapeAttr(team.name)}" aria-label="移除 ${escapeAttr(team.name)}">&times;</button>
      </span>
    `).join('');

    container.querySelectorAll('.btn-del-team').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const target = draftTeams[idx];
        if (!target) return;
        openConfirmModal(
          `確定要移除組隊「<strong>${escapeAttr(target.name)}</strong>」嗎？`,
          { title: '刪除組隊確認', okClass: 'btn btn-danger-solid', okText: '刪除' },
          () => {
            draftTeams.splice(idx, 1);
            renderDraftTeamTable();
            toast(`已移除組隊「${target.name}」`);
          }
        );
      });
    });
  };

  // ==================== 新增人員（請填 LDAP + 號按鈕）（圖 2, 5） ====================
  const addLdapStaff = () => {
    const input = $('form-ldap-input');
    const raw = cleanTrim(input.value);
    if (!raw) {
      input.classList.add('highlight-error');
      openAlertModal('請先輸入 LDAP 帳號或人員姓名！', () => input.focus());
      return;
    }
    input.classList.remove('highlight-error');

    const lower = raw.toLowerCase();
    let matchedLdap = '';
    let matchedName = '';

    if (ldapDirectory[lower]) {
      matchedLdap = lower;
      matchedName = ldapDirectory[lower];
    } else {
      const byNameEntry = Object.entries(ldapDirectory).find(([, nm]) => nm === raw);
      if (byNameEntry) {
        matchedLdap = byNameEntry[0];
        matchedName = byNameEntry[1];
      } else {
        matchedLdap = raw;
        matchedName = raw;
      }
    }

    const exists = draftStaff.some(s => s.ldap.toLowerCase() === matchedLdap.toLowerCase() || s.name === matchedName);
    if (exists) {
      openAlertModal(`人員「${matchedName}」已在清單中，請勿重複新增！`, () => input.focus());
      return;
    }

    draftStaff.push({ ldap: matchedLdap, name: matchedName });
    input.value = '';
    renderDraftStaffTable();
    toast(`已新增人員「${matchedName}」`);
  };

  $('btn-add-ldap').addEventListener('click', addLdapStaff);
  $('form-ldap-input').addEventListener('input', (e) => e.target.classList.remove('highlight-error'));
  $('form-ldap-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLdapStaff();
    }
  });

  // ==================== 新增和氣組隊彈窗（圖 3, 4, 6） ====================
  const renderHeqiModalTable = (filterText = '') => {
    const tbody = $('heqi-modal-tbody');
    const kw = cleanTrim(filterText).toLowerCase();
    const list = heqiTeamCatalog.filter(t => {
      if (!kw) return true;
      return t.code.toLowerCase().includes(kw) || t.name.toLowerCase().includes(kw);
    });

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">查無相符的和氣組隊</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(team => {
      const alreadyAdded = draftTeams.some(dt => dt.code === team.code);
      return `
        <tr>
          <td style="font-weight: 600; color: #14264b;">${escapeAttr(team.code)}</td>
          <td>${escapeAttr(team.name)}</td>
          <td class="center">
            <button type="button" class="btn primary small btn-pick-heqi" data-code="${escapeAttr(team.code)}" ${alreadyAdded ? 'disabled' : ''}>
              ${alreadyAdded ? '已選擇' : '選擇'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-pick-heqi:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const code = e.currentTarget.dataset.code;
        const found = heqiTeamCatalog.find(t => t.code === code);
        if (!found) return;
        if (!draftTeams.some(dt => dt.code === found.code)) {
          draftTeams.push({ code: found.code, name: found.name });
          renderDraftTeamTable();
          toast(`已加入「${found.name} (${found.code})」`);
        }
        closeHeqiSelectModal();
      });
    });
  };

  const openHeqiSelectModal = () => {
    $('heqi-modal-filter').value = '';
    renderHeqiModalTable('');
    $('heqi-select-modal').classList.remove('hidden');
    setTimeout(() => $('heqi-modal-filter').focus(), 30);
  };

  const closeHeqiSelectModal = () => {
    $('heqi-select-modal').classList.add('hidden');
  };

  $('btn-open-heqi-modal').addEventListener('click', openHeqiSelectModal);
  $('close-heqi-modal').addEventListener('click', closeHeqiSelectModal);
  $('btn-heqi-modal-cancel').addEventListener('click', closeHeqiSelectModal);
  window.CTA.registerModalEsc('heqi-select-modal', closeHeqiSelectModal);

  $('heqi-modal-filter').addEventListener('input', (e) => {
    renderHeqiModalTable(e.target.value);
  });

  // ==================== 右側表單模式切換：修改模式 vs 新增匯款帳戶資料模式 ====================
  const clearFormValidationErrors = () => {
    ['form-bank-code', 'form-account-name', 'form-account-number', 'form-ldap-input'].forEach(fid => {
      const el = $(fid);
      if (el) el.classList.remove('highlight-error');
    });
  };

  let editorInitialSnapshot = '';

  const getEditorSnapshot = () => {
    const statusChecked = document.querySelector('input[name="form-bank-status"]:checked');
    return JSON.stringify({
      bank: cleanTrim($('form-bank-code').value),
      name: cleanTrim($('form-account-name').value),
      number: cleanTrim($('form-account-number').value),
      status: statusChecked ? statusChecked.value : '啟用',
      staff: draftStaff.map(s => `${s.ldap}|${s.name}`),
      teams: draftTeams.map(t => `${t.code}|${t.name}`)
    });
  };

  const isEditorDirty = () => {
    const box = $('bank-editor-box');
    if (!box || box.classList.contains('hidden')) return false;
    return getEditorSnapshot() !== editorInitialSnapshot;
  };

  const hideEditorPanel = () => {
    selectedAccountId = null;
    clearFormValidationErrors();
    $('bank-editor-box').classList.add('hidden');
    $('bank-editor-box').classList.remove('is-create-mode');
    if ($('bank-split-layout')) $('bank-split-layout').classList.add('is-single-col');
    draftStaff = [];
    draftTeams = [];
    editorInitialSnapshot = '';
    renderAccountTable();
  };

  const requestLeaveEditor = () => {
    if (isEditorDirty()) {
      openConfirmModal(
        '你的資料尚未儲存，確定要離開嗎？',
        { title: '離開確認', okClass: 'btn primary', okText: '確定' },
        () => hideEditorPanel()
      );
    } else {
      hideEditorPanel();
    }
  };

  const loadAccountIntoEditor = (account) => {
    if (!account) return;
    selectedAccountId = account.id;
    clearFormValidationErrors();

    const box = $('bank-editor-box');
    box.classList.remove('hidden');
    box.classList.remove('is-create-mode');
    if ($('bank-split-layout')) $('bank-split-layout').classList.remove('is-single-col');
    $('editor-mode-title').textContent = '匯款帳戶資料';
    const badge = $('editor-mode-badge');
    badge.textContent = `序號 #${filteredAccounts.findIndex(r => r.id === account.id) + 1 || account.id}`;
    badge.className = 'status-badge pending';
    badge.classList.remove('hidden');
    $('btn-save-bank').textContent = '儲存';
    $('btn-delete-bank').classList.remove('hidden');

    setFormBankValue(formatBankLabel(account.bankCode, account.bankName));
    $('form-account-name').value = account.accountName || '';
    $('form-account-number').value = account.accountNumber || '';

    const targetStatus = account.status === '停用' ? '停用' : '啟用';
    const statusRadio = document.querySelector(`input[name="form-bank-status"][value="${targetStatus}"]`);
    if (statusRadio) statusRadio.checked = true;

    $('form-ldap-input').value = '';
    draftStaff = Array.isArray(account.staff) ? account.staff.map(s => ({ ...s })) : [];
    draftTeams = Array.isArray(account.teams) ? account.teams.map(t => ({ ...t })) : [];
    switchSubTab('staff');
    renderDraftStaffTable();
    renderDraftTeamTable();
    renderAccountTable();
    editorInitialSnapshot = getEditorSnapshot();
  };

  const enterCreateMode = (showToastMsg = false) => {
    selectedAccountId = null;
    clearFormValidationErrors();

    const box = $('bank-editor-box');
    box.classList.remove('hidden');
    box.classList.add('is-create-mode');
    if ($('bank-split-layout')) $('bank-split-layout').classList.remove('is-single-col');
    $('editor-mode-title').textContent = '新增匯款帳戶';
    $('editor-mode-badge').classList.add('hidden');
    $('btn-save-bank').textContent = '確認送出';
    $('btn-delete-bank').classList.add('hidden');

    setFormBankValue('');
    $('form-account-name').value = '';
    $('form-account-number').value = '';

    const activeRadio = document.querySelector('input[name="form-bank-status"][value="啟用"]');
    if (activeRadio) activeRadio.checked = true;

    $('form-ldap-input').value = '';
    draftStaff = [];
    draftTeams = [];
    switchSubTab('staff');
    renderDraftStaffTable();
    renderDraftTeamTable();
    renderAccountTable();
    editorInitialSnapshot = getEditorSnapshot();

    if (showToastMsg) {
      toast('已開啟「新增匯款帳戶」表單。');
    }
  };

  $('btn-switch-create-top').addEventListener('click', () => {
    if (isEditorDirty()) {
      openConfirmModal(
        '你的資料尚未儲存，確定要切換至「新增匯款帳戶」嗎？',
        { title: '切換確認', okClass: 'btn primary', okText: '確定' },
        () => enterCreateMode(false)
      );
    } else {
      enterCreateMode(false);
    }
  });

  $('btn-leave-bank').addEventListener('click', requestLeaveEditor);

  $('btn-delete-bank').addEventListener('click', () => {
    if (selectedAccountId == null) return;
    const target = bankAccounts.find(r => r.id === selectedAccountId);
    if (!target) {
      hideEditorPanel();
      return;
    }
    const label = `${formatBankLabel(target.bankCode, target.bankName)} - ${target.accountName}（${target.accountNumber}）`;
    openConfirmModal(
      `確定要刪除匯款帳戶「<strong>${escapeAttr(label)}</strong>」嗎？`,
      { title: '刪除確認', okClass: 'btn btn-danger-solid', okText: '刪除' },
      () => {
        bankAccounts = bankAccounts.filter(r => r.id !== selectedAccountId);
        filteredAccounts = filteredAccounts.filter(r => r.id !== selectedAccountId);
        saveStateToLocalStorage();
        hideEditorPanel();
        toast(`已刪除匯款帳戶「${target.accountName} (${target.accountNumber})」`);
      }
    );
  });

  window.CTA.bindFormLeaveGuard({
    isActive: () => isEditorDirty()
  });

  // ==================== 儲存匯款帳戶資料（新增 / 修改共用驗證與儲存） ====================
  $('btn-save-bank').addEventListener('click', async () => {
    await dataReady;
    const rawBank = cleanTrim($('form-bank-code').value);
    const accName = cleanTrim($('form-account-name').value);
    const accNum = cleanTrim($('form-account-number').value);
    const statusChecked = document.querySelector('input[name="form-bank-status"]:checked');
    const statusVal = statusChecked ? statusChecked.value : '啟用';

    $('form-bank-code').value = rawBank;
    $('form-account-name').value = accName;
    $('form-account-number').value = accNum;
    clearFormValidationErrors();

    const parsedBank = parseBankSelection(rawBank);
    let firstInvalid = null;
    if (!parsedBank) {
      $('form-bank-code').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('form-bank-code');
    }
    if (!accName) {
      $('form-account-name').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('form-account-name');
    }
    if (!accNum) {
      $('form-account-number').classList.add('highlight-error');
      firstInvalid = firstInvalid || $('form-account-number');
    }

    if (firstInvalid) {
      const msg = !parsedBank && rawBank
        ? '請從選單選擇有效的「銀行代碼」（例如：008 華南商業銀行）！'
        : '請完整填寫必填欄位（銀行代碼、戶名、帳號）！';
      openAlertModal(msg, () => firstInvalid.focus());
      return;
    }

    const duplicateAcc = bankAccounts.find(r =>
      r.id !== selectedAccountId &&
      r.bankCode === parsedBank.code &&
      r.accountNumber === accNum
    );
    if (duplicateAcc) {
      $('form-account-number').classList.add('highlight-error');
      openAlertModal(`「${formatBankLabel(parsedBank.code, parsedBank.name)}」已存在相同帳號（${accNum}），請確認後再儲存！`, () => {
        $('form-account-number').focus();
      });
      return;
    }

    const isCreate = selectedAccountId == null;
    const confirmText = isCreate
      ? `確定要新增匯款帳戶「<strong>${escapeAttr(formatBankLabel(parsedBank.code, parsedBank.name))} - ${escapeAttr(accName)}（${escapeAttr(accNum)}）</strong>」嗎？`
      : `確定要儲存「<strong>${escapeAttr(formatBankLabel(parsedBank.code, parsedBank.name))} - ${escapeAttr(accName)}（${escapeAttr(accNum)}）</strong>」的修改嗎？`;

    openConfirmModal(confirmText, { title: '儲存確認', okClass: 'btn primary', okText: '確定' }, () => {
      if (isCreate) {
        const newRecord = {
          id: nextAccountId++,
          bankCode: parsedBank.code,
          bankName: parsedBank.name,
          accountName: accName,
          accountNumber: accNum,
          status: statusVal,
          staff: draftStaff.map(s => ({ ...s })),
          teams: draftTeams.map(t => ({ ...t }))
        };
        bankAccounts.unshift(newRecord);
        filteredAccounts = [...bankAccounts];
        saveStateToLocalStorage();
        pager.setPage(1);
        loadAccountIntoEditor(newRecord);
        toast(`已新增匯款帳戶「${accName} (${accNum})」`);
      } else {
        const target = bankAccounts.find(r => r.id === selectedAccountId);
        if (!target) {
          enterCreateMode(false);
          return;
        }
        target.bankCode = parsedBank.code;
        target.bankName = parsedBank.name;
        target.accountName = accName;
        target.accountNumber = accNum;
        target.status = statusVal;
        target.staff = draftStaff.map(s => ({ ...s }));
        target.teams = draftTeams.map(t => ({ ...t }));

        saveStateToLocalStorage();
        loadAccountIntoEditor(target);
        toast(`已儲存「${accName} (${accNum})」的匯款帳戶資料`);
      }
    });
  });

  const dataReady = loadInitialData();
});
