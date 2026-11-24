// 全站共用工具與元件庫 (CTA Common Library)
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  // ==================== 一、字串、金額與日期格式化工具 ====================
  const cleanTrim = str => String(str || '').replace(/^[\s\u3000\u00A0\u200B-\u200D\uFEFF]+|[\s\u3000\u00A0\u200B-\u200D\uFEFF]+$/g, '');
  const stripLeadingSpace = str => String(str || '').replace(/^[\s\u3000\u00A0\u200B-\u200D\uFEFF]+/, '');
  const money = n => Number(n || 0).toLocaleString('zh-TW');
  const escapeAttr = str => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/\x22/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const toHyphenDate = d => String(d || '').trim().split('/').join('-');
  const toSlashDate = d => String(d || '').trim().split('-').join('/');

  let lastRecordedEpochMs = 0;
  const syncRecordedFloorMs = (records) => {
    if (!Array.isArray(records)) return;
    const now = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const todayHyphen = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    records.forEach(rec => {
      if (!rec || typeof rec !== 'object') return;
      const d = String(rec.date || rec.applyDate || '').trim().split('/').join('-');
      if (d === todayHyphen) {
        const ms = getRecordTimeMs(rec);
        if (ms > lastRecordedEpochMs) {
          lastRecordedEpochMs = ms;
        }
      }
    });
  };

  const getNowMsRecord = () => {
    const rawMs = Date.now();
    const ms = rawMs <= lastRecordedEpochMs ? lastRecordedEpochMs + 1 : rawMs;
    lastRecordedEpochMs = ms;
    const d = new Date(ms);
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    const sss = pad(d.getMilliseconds(), 3);
    const slash = `${y}/${m}/${day}`;
    const hyphen = `${y}-${m}-${day}`;
    const display = `${slash} ${hh}:${mm}`;
    const fullMs = `${slash} ${hh}:${mm}:${ss}.${sss}`;
    const isoMs = `${hyphen} ${hh}:${mm}:${ss}.${sss}`;
    return { slash, hyphen, display, fullMs, isoMs, ms };
  };

  const getTodayDates = () => {
    const now = getNowMsRecord();
    return {
      slash: now.slash,
      hyphen: now.hyphen,
      display: now.display,
      fullMs: now.fullMs,
      isoMs: now.isoMs,
      ms: now.ms
    };
  };

  const parseTimestampMs = (val) => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const s = String(val || '').trim();
    if (!s) return 0;
    const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/);
    if (!m) {
      const parsed = Date.parse(s);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);
    const ms = Number(String(m[7] || '0').padEnd(3, '0'));
    return new Date(year, month, day, hour, minute, second, ms).getTime();
  };

  const getRecordTimeMs = (rec) => {
    if (!rec || typeof rec !== 'object') return 0;
    if (typeof rec.updatedAtMs === 'number' && Number.isFinite(rec.updatedAtMs) && rec.updatedAtMs > 0) return rec.updatedAtMs;
    if (typeof rec.updatedAt === 'number' && Number.isFinite(rec.updatedAt) && rec.updatedAt > 0) return rec.updatedAt;
    if (rec.updatedAtStr) {
      const p = parseTimestampMs(rec.updatedAtStr);
      if (p > 0) return p;
    }
    if (typeof rec.createdAtMs === 'number' && Number.isFinite(rec.createdAtMs) && rec.createdAtMs > 0) return rec.createdAtMs;
    if (rec.createdAtStr) {
      const p = parseTimestampMs(rec.createdAtStr);
      if (p > 0) return p;
    }
    return parseTimestampMs(rec.applyDate || rec.date || rec.processDate || '');
  };

  // ==================== 二、右下角 Toast 提示 ====================
  let toastTimer = null;
  const toast = (msg, duration = 2600) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
  };

  // ==================== 三、全站統一 Alert / Confirm / Esc 彈窗管理 ====================
  let pendingConfirmCallback = null;
  let pendingAlertCloseCallback = null;
  const customModalEscRegistry = [];

  const registerModalEsc = (modalId, closeFn) => {
    if (!modalId || typeof closeFn !== 'function') return;
    const idx = customModalEscRegistry.findIndex(item => item.modalId === modalId);
    if (idx !== -1) customModalEscRegistry[idx].closeFn = closeFn;
    else customModalEscRegistry.push({ modalId, closeFn });
  };

  const closeAlert = () => {
    const modal = $('alert-modal');
    if (modal) modal.classList.add('hidden');
    const cb = pendingAlertCloseCallback;
    pendingAlertCloseCallback = null;
    if (typeof cb === 'function') cb();
  };

  const closeConfirm = () => {
    const modal = $('confirm-modal');
    if (modal) modal.classList.add('hidden');
    pendingConfirmCallback = null;
  };

  const closePersonSelectModal = () => {
    const modal = $('person-select-modal');
    if (modal) modal.classList.add('hidden');
  };

  const bindOnce = (id, eventName, handler) => {
    const el = $(id);
    if (!el || el.dataset[`ctaBound_${eventName}`] === '1') return;
    el.dataset[`ctaBound_${eventName}`] = '1';
    el.addEventListener(eventName, handler);
  };

  const ensureDialogBindings = () => {
    bindOnce('close-alert', 'click', closeAlert);
    bindOnce('btn-alert-ok', 'click', closeAlert);
    bindOnce('close-confirm', 'click', closeConfirm);
    bindOnce('btn-confirm-cancel', 'click', closeConfirm);
    bindOnce('btn-confirm-ok', 'click', () => {
      const cb = pendingConfirmCallback;
      closeConfirm();
      if (typeof cb === 'function') cb();
    });
    bindOnce('close-person-select', 'click', closePersonSelectModal);
    bindOnce('btn-person-select-leave', 'click', closePersonSelectModal);
  };

  const alertModal = (message, onClose = null) => {
    ensureDialogBindings();
    const modal = $('alert-modal');
    const body = $('alert-modal-body');
    if (!modal || !body) return;
    body.innerHTML = message;
    pendingAlertCloseCallback = typeof onClose === 'function' ? onClose : null;
    modal.classList.remove('hidden');
    const okBtn = $('btn-alert-ok');
    if (okBtn) setTimeout(() => okBtn.focus(), 0);
  };

  const confirmModal = (message, optionsOrOkText = '確定', onOk = null, title = '操作確認') => {
    ensureDialogBindings();
    const modal = $('confirm-modal');
    const body = $('confirm-modal-body');
    const btnOk = $('btn-confirm-ok');
    if (!modal || !body || !btnOk) return;

    let okText = '確定';
    let okClass = 'btn primary';
    let modalTitle = title || '操作確認';

    if (optionsOrOkText && typeof optionsOrOkText === 'object') {
      okText = optionsOrOkText.okText || '確定';
      okClass = optionsOrOkText.okClass || 'btn primary';
      modalTitle = optionsOrOkText.title || modalTitle;
    } else if (typeof optionsOrOkText === 'string' && optionsOrOkText) {
      okText = optionsOrOkText;
    }

    const titleEl = $('confirm-modal-title');
    if (titleEl) titleEl.textContent = modalTitle;

    body.innerHTML = message;
    btnOk.className = okClass;
    btnOk.textContent = okText;
    pendingConfirmCallback = typeof onOk === 'function' ? onOk : null;
    modal.classList.remove('hidden');
    setTimeout(() => btnOk.focus(), 0);
  };

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const alertEl = $('alert-modal');
    if (alertEl && !alertEl.classList.contains('hidden')) { closeAlert(); return; }
    const confirmEl = $('confirm-modal');
    if (confirmEl && !confirmEl.classList.contains('hidden')) { closeConfirm(); return; }
    const personEl = $('person-select-modal');
    if (personEl && !personEl.classList.contains('hidden')) { closePersonSelectModal(); return; }
    for (let i = customModalEscRegistry.length - 1; i >= 0; i--) {
      const entry = customModalEscRegistry[i];
      const el = $(entry.modalId);
      if (el && !el.classList.contains('hidden')) { entry.closeFn(); return; }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureDialogBindings);
  } else {
    ensureDialogBindings();
  }

  // ==================== 四、全站統一分頁元件 ====================
  const getPageList = (totalPages, cur) => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    if (cur > 3) pages.push('...');
    for (let p = Math.max(2, cur - 1); p <= Math.min(totalPages - 1, cur + 1); p++) {
      pages.push(p);
    }
    if (cur < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const createPagination = ({
    onChange,
    containerId = 'pagination',
    perPageId = 'per-page-select',
    prevId = 'page-prev',
    nextId = 'page-next',
    numbersId = 'page-numbers',
    totalPagesId = 'total-pages',
    totalItemsId = 'total-items'
  } = {}) => {
    let currentPage = 1;
    let currentTotalPages = 1;

    const getPerPage = () => {
      const sel = $(perPageId);
      return sel ? (parseInt(sel.value, 10) || 10) : 10;
    };

    const prevBtn = $(prevId);
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          if (typeof onChange === 'function') onChange(currentPage, 'page');
        }
      });
    }

    const nextBtn = $(nextId);
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < currentTotalPages) {
          currentPage++;
          if (typeof onChange === 'function') onChange(currentPage, 'page');
        }
      });
    }

    const perPageSel = $(perPageId);
    if (perPageSel) {
      perPageSel.addEventListener('change', () => {
        currentPage = 1;
        if (typeof onChange === 'function') onChange(currentPage, 'perPage');
      });
    }

    const render = (totalCount, totalPages, page = currentPage) => {
      const pagEl = $(containerId);
      currentTotalPages = Math.max(1, Number(totalPages) || 1);
      currentPage = Math.min(Math.max(1, Number(page) || 1), currentTotalPages);

      if (!pagEl) return;
      if (totalCount === 0) {
        pagEl.classList.add('hidden');
        return;
      }

      pagEl.classList.remove('hidden');
      const itemsEl = $(totalItemsId);
      const pagesEl = $(totalPagesId);
      if (itemsEl) itemsEl.textContent = String(totalCount);
      if (pagesEl) pagesEl.textContent = String(currentTotalPages);

      const numBox = $(numbersId);
      if (numBox) {
        numBox.innerHTML = getPageList(currentTotalPages, currentPage).map(p => {
          if (p === '...') return `<span class="page-info" style="margin:0 2px;">…</span>`;
          return `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }).join('');

        numBox.querySelectorAll('.page-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page, 10);
            if (typeof onChange === 'function') onChange(currentPage, 'page');
          });
        });
      }

      if (prevBtn) prevBtn.classList.toggle('disabled', currentPage === 1);
      if (nextBtn) nextBtn.classList.toggle('disabled', currentPage === currentTotalPages);
    };

    return {
      render,
      getPage: () => currentPage,
      setPage: (p) => { currentPage = Math.max(1, Number(p) || 1); },
      getPerPage
    };
  };

  // ==================== 五、可搜尋下拉選單元件 (Combo-box) ====================
  const resolveOptionKey = (rawVal, optionsList = []) => {
    if (!rawVal) return '';
    if (optionsList.includes(rawVal)) return rawVal;
    const kw = rawVal.toLowerCase();
    return optionsList.find(k => k.toLowerCase().includes(kw)) || '';
  };

  const createComboSelect = ({
    inputId, wrapId, menuId, clearBtnId, toggleBtnId,
    getOptions = () => [], beforeOpen = null,
    onSelect = null, onInput = null, onClear = null, onEnter = null,
    emptyText = '無相符資料', filterOptions = null, renderOption = null,
    getOptionValue = (opt) => (typeof opt === 'string' ? opt : opt.value)
  }) => {
    const input = $(inputId);
    const wrap = $(wrapId);
    const menu = $(menuId);
    const clearBtn = $(clearBtnId);
    const toggleBtn = $(toggleBtnId);
    let highlightedIndex = -1;

    const syncClearBtn = () => {
      if (clearBtn && input) clearBtn.classList.toggle('hidden', input.value.trim().length === 0);
    };

    const close = () => {
      if (!menu || !wrap || !input) return;
      menu.classList.add('hidden');
      wrap.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
    };

    const render = (filterText = '') => {
      if (!menu || !input) return;
      const kw = filterText.trim().toLowerCase();
      const currentVal = input.value.trim();
      const allOptions = getOptions() || [];

      if (allOptions.length === 0) {
        menu.innerHTML = `<div class="combo-empty-hint">${emptyText}</div>`;
        highlightedIndex = -1;
        return;
      }

      const candidates = typeof filterOptions === 'function'
        ? filterOptions(allOptions, kw)
        : (kw ? allOptions.filter(opt => String(getOptionValue(opt) || '').toLowerCase().includes(kw)) : allOptions);

      if (!candidates || candidates.length === 0) {
        menu.innerHTML = `<div class="combo-empty-hint">${emptyText}</div>`;
        highlightedIndex = -1;
        return;
      }

      menu.innerHTML = candidates.map((opt, idx) => {
        const val = String(getOptionValue(opt) || '');
        const isSelected = val === currentVal;
        const isHighlighted = idx === highlightedIndex;
        if (typeof renderOption === 'function') {
          return renderOption(opt, { kw, currentVal, isSelected, isHighlighted, idx, val });
        }
        return `<div class="combo-option-item ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}" role="option" data-idx="${idx}" data-val="${escapeAttr(val)}"><span>${val}</span></div>`;
      }).join('');

      menu.querySelectorAll('.combo-option-item').forEach(el => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = el.dataset.val;
          input.classList.remove('highlight-error');
          syncClearBtn();
          close();
          if (typeof onSelect === 'function') onSelect(input.value);
        });
      });
    };

    const open = async (useFilter = false) => {
      if (typeof beforeOpen === 'function') await beforeOpen();
      highlightedIndex = -1;
      render(useFilter && input ? input.value : '');
      if (menu) menu.classList.remove('hidden');
      if (wrap) wrap.classList.add('open');
      if (input) input.setAttribute('aria-expanded', 'true');
    };

    if (input) {
      input.addEventListener('focus', () => open(false));
      input.addEventListener('click', () => open(false));
      input.addEventListener('input', () => {
        input.classList.remove('highlight-error');
        syncClearBtn();
        if (typeof onInput === 'function') onInput(input.value);
        open(true);
      });
      input.addEventListener('keydown', (e) => {
        const items = menu ? menu.querySelectorAll('.combo-option-item') : [];
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (menu && menu.classList.contains('hidden')) { open(true); return; }
          if (items.length > 0) {
            highlightedIndex = (highlightedIndex + 1) % items.length;
            items.forEach((el, i) => el.classList.toggle('highlighted', i === highlightedIndex));
            items[highlightedIndex].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (menu && !menu.classList.contains('hidden') && items.length > 0) {
            highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
            items.forEach((el, i) => el.classList.toggle('highlighted', i === highlightedIndex));
            items[highlightedIndex].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'Enter') {
          if (menu && !menu.classList.contains('hidden') && highlightedIndex >= 0 && items[highlightedIndex]) {
            e.preventDefault();
            input.value = items[highlightedIndex].dataset.val;
            input.classList.remove('highlight-error');
            syncClearBtn();
            close();
            if (typeof onSelect === 'function') onSelect(input.value);
          } else {
            e.preventDefault();
            close();
            if (typeof onEnter === 'function') onEnter();
          }
        } else if (e.key === 'Escape' && menu && !menu.classList.contains('hidden')) {
          e.stopPropagation();
          close();
        }
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (menu && menu.classList.contains('hidden')) { if (input) input.focus(); open(false); }
        else close();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (input) input.value = '';
        syncClearBtn();
        if (typeof onClear === 'function') onClear();
        if (input) input.focus();
        open(false);
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest(`#${wrapId}`)) close();
    });

    return {
      open,
      close,
      syncClearBtn,
      setValue: (val) => { if (input) input.value = val || ''; syncClearBtn(); },
      getValue: () => (input ? input.value : '')
    };
  };

  // ==================== 六、表單未儲存離開／重整防護 ====================
  const bindFormLeaveGuard = ({ isActive, message = '你的資料尚未儲存，確定要離開嗎？', onClearState = null }) => {
    let isBypassingUnload = false;
    const active = () => (typeof isActive === 'function' ? Boolean(isActive()) : false);

    // 攔截上方導覽列跳頁連結（若頁面有確認彈窗則顯示站內彈窗，否則交由瀏覽器原生離開警示）
    document.addEventListener('click', (e) => {
      if (!active() || isBypassingUnload) return;
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = (link.getAttribute('href') || '').trim();
      if (!href || href === '#' || href.startsWith('javascript:')) return;
      const cm = $('confirm-modal');
      if (cm) {
        e.preventDefault();
        e.stopPropagation();
        confirmModal(message, '確定', () => {
          if (typeof onClearState === 'function') onClearState();
          isBypassingUnload = true;
          window.location.href = href;
        });
      } else if (typeof onClearState === 'function') {
        onClearState();
      }
    }, true);

    // 網頁重整（按瀏覽器重新載入鈕 ↻、F5、Ctrl+R / Cmd+R）或關閉分頁時，統一觸發瀏覽器原生重新載入警示
    window.addEventListener('beforeunload', (e) => {
      if (isBypassingUnload || !active()) return;
      e.preventDefault();
      e.returnValue = message;
      return message;
    });
  };

  // ==================== 七、法親編號查詢與「請選擇人員」彈窗 ====================
  const openPersonSelectModal = (candidates, searchedVal = '', onPick = null) => {
    ensureDialogBindings();
    const tbody = $('person-select-tbody');
    const modal = $('person-select-modal');
    if (!tbody || !modal) return;

    tbody.innerHTML = candidates.map((p, idx) => {
      const displayCharity = p.unitType === '組' ? '—' : (p.charity || '—');
      return `
        <tr>
          <td>${p.name || '—'}</td>
          <td>${p.dharmaName || '—'}</td>
          <td>${p.member || '—'}</td>
          <td>${displayCharity}</td>
          <td>${p.teamName || '—'}</td>
          <td class="center"><button type="button" class="btn primary small btn-pick-person" data-idx="${idx}">選用</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-pick-person').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const picked = candidates[idx];
        closePersonSelectModal();
        if (picked && typeof onPick === 'function') onPick(picked, searchedVal);
      });
    });

    modal.classList.remove('hidden');
    const firstPick = tbody.querySelector('.btn-pick-person');
    if (firstPick) setTimeout(() => firstPick.focus(), 0);
  };

  const lookupMemberByCode = ({ inputEl, directory = [], onMatched, onClear }) => {
    if (!inputEl) return;
    const kw = cleanTrim(inputEl.value);
    inputEl.value = kw;
    inputEl.classList.remove('highlight-error');

    if (!kw) {
      inputEl.classList.add('highlight-error');
      inputEl.focus();
      alertModal('請輸入「委員號」或「慈誠號」再按查詢！');
      return;
    }

    const matches = directory.filter(d => d.member === kw || d.charity === kw);
    if (matches.length === 0) {
      if (typeof onClear === 'function') onClear();
      inputEl.classList.add('highlight-error');
      alertModal('查無此委員號 / 慈誠號資料，請確認編號是否正確！');
      return;
    }

    if (matches.length > 1) {
      const sorted = [...matches].sort((a, b) => (a.unitType === '組' ? 0 : 1) - (b.unitType === '組' ? 0 : 1));
      openPersonSelectModal(sorted, kw, onMatched);
      return;
    }

    if (typeof onMatched === 'function') onMatched(matches[0], kw);
  };

  // ==================== 八、依申請日與毫秒時間戳排序（最新在最上方） ====================
  const sortByApplyDateDesc = (list) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
      const da = String((a && a.applyDate) || '').trim().replace(/-/g, '/');
      const db = String((b && b.applyDate) || '').trim().replace(/-/g, '/');
      if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      }
      const ta = getRecordTimeMs(a);
      const tb = getRecordTimeMs(b);
      if (ta !== tb) {
        return tb - ta;
      }
      const pa = String((a && a.processDate) || '').trim().replace(/-/g, '/');
      const pb = String((b && b.processDate) || '').trim().replace(/-/g, '/');
      if (pa !== pb) {
        if (!pa) return 1;
        if (!pb) return -1;
        return pb.localeCompare(pa);
      }
      return Number((b && b.id) || 0) - Number((a && a.id) || 0);
    });
  };

  window.CTA = Object.assign(window.CTA || {}, {
    $, cleanTrim, stripLeadingSpace, money, escapeAttr,
    toHyphenDate, toSlashDate, getTodayDates, getNowMsRecord, syncRecordedFloorMs, parseTimestampMs, getRecordTimeMs,
    toast, alert: alertModal, closeAlert, confirm: confirmModal, closeConfirm, registerModalEsc,
    getPageList, createPagination,
    resolveOptionKey, createComboSelect,
    bindFormLeaveGuard,
    openPersonSelectModal, closePersonSelectModal, lookupMemberByCode,
    sortByApplyDateDesc
  });
})();
