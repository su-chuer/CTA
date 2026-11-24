document.addEventListener("DOMContentLoaded", () => {
  const {
    $, cleanTrim, toHyphenDate, toSlashDate, getTodayDates,
    toast, alert: openAlertModal, confirm: openConfirmModal
  } = window.CTA;

  const { slash: todaySlash, hyphen: todayHyphen } = getTodayDates();

  const RELATION_OPTIONS = [
    '配偶', '祖父母', '父母親', '子女', '孫子女', '公婆 / 岳父母', '媳婦 / 女婿', '本人'
  ];

  const buildRelationOptionsHtml = (selectedVal = '') => {
    const placeholderSelected = selectedVal ? '' : 'selected';
    const opts = RELATION_OPTIONS.map(opt =>
      `<option value="${opt}" ${opt === selectedVal ? 'selected' : ''}>${opt}</option>`
    ).join('');
    return `<option value="" ${placeholderSelected} disabled>請選擇</option>${opts}`;
  };

  let goodsDatasets = {};
  let memberDirectory = [];
  let heqiOptions = [];

  const dataReady = Promise.all([
    fetch('json/goods_data.json?v=346', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).catch(() => null),
    fetch('json/member_master.json?v=346', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).catch(() => null)
  ]).then(([gData, masterData]) => {
    if (gData && typeof gData === 'object') {
      goodsDatasets = gData.goodsDatasets && typeof gData.goodsDatasets === 'object' ? gData.goodsDatasets : {};
      heqiOptions = Object.keys(goodsDatasets);
      if (typeof window.CTA.syncRecordedFloorMs === 'function') {
        window.CTA.syncRecordedFloorMs(Object.values(goodsDatasets).flat());
      }
    }
    if (masterData && Array.isArray(masterData.members)) {
      memberDirectory = masterData.members.map(m => ({
        memberId: m.memberId || '',
        name: String(m.name || '慈濟人').trim(),
        member: String(m.member || '').trim(),
        charity: String(m.charity || '').trim(),
        dharmaName: String(m.dharmaName || '—').trim() || '—',
        heqi: String(m.heqi || '').trim(),
        teamName: String(m.teamName || '仁中協力').trim(),
        unitType: String(m.unitType || '').trim(),
        spouseName: String(m.spouseName || '').trim()
      }));
    }
  });

  let activeHeqiKey = '';
  let activeItemFilter = '全部';
  let currentEditingId = null;
  let nextClaimId = 400;
  let currentGoodsRecords = [];

  // ==================== 和氣組別 Combo-box 與分頁 ====================
  const heqiInput = $('filter-heqi');
  const heqiCombo = window.CTA.createComboSelect({
    inputId: 'filter-heqi',
    wrapId: 'heqi-combo-wrap',
    menuId: 'heqi-combo-menu',
    clearBtnId: 'btn-clear-heqi',
    toggleBtnId: 'btn-toggle-heqi',
    getOptions: () => heqiOptions,
    beforeOpen: () => dataReady,
    emptyText: '無相符組別，可直接按「搜尋」比對關鍵字',
    onEnter: () => executeSearch()
  });

  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentGoodsRecords)
  });

  const renderTable = (data) => {
    const tbody = $('goods-tbody');
    const listFooter = $('list-footer');
    currentGoodsRecords = window.CTA.sortByApplyDateDesc(data);

    if (currentGoodsRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">查無符合條件的資料</td></tr>`;
      listFooter.classList.toggle('hidden', !activeHeqiKey);
      pager.render(0, 1, 1);
      return;
    }

    listFooter.classList.remove('hidden');

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentGoodsRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentGoodsRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentGoodsRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((item, idx) => `
      <tr>
        <td class="center">${startIndex + idx + 1}</td>
        <td>${item.name}</td>
        <td>${item.goodsItem}</td>
        <td>${item.applyDate}</td>
        <td>${item.processDate}</td>
        <td>${item.member || '<span class="blank">—</span>'}</td>
        <td>${item.charity || '<span class="blank">—</span>'}</td>
        <td class="center"><span class="status-badge pending">待領取</span></td>
        <td class="center"><button type="button" class="btn primary small btn-detail" data-id="${item.id}">詳細</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const list = goodsDatasets[activeHeqiKey] || [];
        const record = list.find(r => r.id === id);
        if (record) openClaimFormView('edit', record);
      });
    });
  };

  const getFilteredGoodsList = (heqiKey, itemFilter = activeItemFilter) => {
    if (!heqiKey) return [];
    const rawList = goodsDatasets[heqiKey] || [];
    if (!itemFilter || itemFilter === '全部') return rawList;
    return rawList.filter(item => item.goodsItem === itemFilter);
  };

  const executeSearch = async () => {
    const rawVal = cleanTrim(heqiInput.value);
    heqiInput.value = rawVal;
    if (!rawVal) {
      heqiInput.classList.add('highlight-error');
      heqiInput.focus();
      return;
    }

    const selectedItem = $('filter-item').value || '全部';
    heqiCombo.close();
    $('table-loading').classList.remove('hidden');
    await dataReady;
    setTimeout(() => {
      pager.setPage(1);
      const matchedKey = window.CTA.resolveOptionKey(rawVal, heqiOptions);
      if (matchedKey) {
        activeHeqiKey = matchedKey;
        activeItemFilter = selectedItem;
        heqiCombo.setValue(matchedKey);
        renderTable(getFilteredGoodsList(matchedKey, activeItemFilter));
      } else {
        activeHeqiKey = '';
        activeItemFilter = selectedItem;
        renderTable([]);
      }
      $('table-loading').classList.add('hidden');
    }, 220);
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    heqiCombo.setValue('');
    heqiInput.classList.remove('highlight-error');
    heqiCombo.close();
    $('filter-item').value = '全部';
    activeHeqiKey = '';
    activeItemFilter = '全部';
    currentGoodsRecords = [];
    pager.setPage(1);
    pager.render(0, 1, 1);
    $('list-footer').classList.add('hidden');
    $('goods-tbody').innerHTML = `<tr><td colspan="9" class="empty">請選擇條件搜尋</td></tr>`;
  });

  // ==================== 新增 / 編輯請領單視圖（聯誼金物資） ====================
  let selectedGoodsMember = '';
  let selectedGoodsCharity = '';

  const applySelectedGoodsMember = (person, searchedVal = '') => {
    if (!person) return;
    const lookupInput = $('goods-lookup-id');
    lookupInput.classList.remove('highlight-error');

    $('goods-name').value = person.name || '';
    $('goods-dharma').value = person.dharmaName || '—';
    if (person.unitType === '組') {
      selectedGoodsMember = person.member || '';
      selectedGoodsCharity = '';
    } else {
      selectedGoodsMember = person.member || '';
      selectedGoodsCharity = person.charity || '';
    }

    const displayId = (searchedVal && (searchedVal === selectedGoodsMember || searchedVal === selectedGoodsCharity))
      ? searchedVal
      : (selectedGoodsMember || selectedGoodsCharity);
    lookupInput.value = displayId;
    toast(`已查詢帶入：${person.name}`);
  };

  const lookupGoodsMember = async () => {
    await dataReady;
    window.CTA.lookupMemberByCode({
      inputEl: $('goods-lookup-id'),
      directory: memberDirectory,
      onMatched: applySelectedGoodsMember,
      onClear: () => {
        $('goods-name').value = '';
        $('goods-dharma').value = '';
        selectedGoodsMember = '';
        selectedGoodsCharity = '';
      }
    });
  };

  $('btn-lookup-member').addEventListener('click', lookupGoodsMember);
  $('goods-lookup-id').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupGoodsMember();
    }
  });
  $('goods-lookup-id').addEventListener('input', () => {
    const lookupInput = $('goods-lookup-id');
    lookupInput.classList.remove('highlight-error');
    const cur = cleanTrim(lookupInput.value);
    if (cur !== selectedGoodsMember && cur !== selectedGoodsCharity) {
      $('goods-name').value = '';
      $('goods-dharma').value = '';
      selectedGoodsMember = '';
      selectedGoodsCharity = '';
    }
  });

  // 依「項目*」渲染專屬欄位
  const renderDynamicItemFields = (goodsItem, record = null) => {
    const container = $('dynamic-item-fields');
    if (!goodsItem || goodsItem === '法船') {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    if (goodsItem === '飛天') {
      const relVal = record ? (record.relation || '') : '';
      const mDate = record ? toHyphenDate(record.marriageDate || '') : '';
      const groom = record ? window.CTA.escapeAttr(record.groomName || '') : '';
      const bride = record ? window.CTA.escapeAttr(record.brideName || '') : '';
      container.innerHTML = `
        <div class="claim-grid-4">
          <div class="claim-field">
            <label for="goods-relation">與申請人關係 <b>*</b></label>
            <select id="goods-relation" class="claim-control">${buildRelationOptionsHtml(relVal)}</select>
          </div>
          <div class="claim-field">
            <label for="goods-marriage-date">結婚日期 <b>*</b></label>
            <input type="date" id="goods-marriage-date" class="claim-control" value="${mDate}">
          </div>
          <div class="claim-field">
            <label for="goods-groom-name">新郎姓名 <b>*</b></label>
            <input type="text" id="goods-groom-name" class="claim-control" placeholder="請輸入新郎姓名" value="${groom}">
          </div>
          <div class="claim-field">
            <label for="goods-bride-name">新娘姓名 <b>*</b></label>
            <input type="text" id="goods-bride-name" class="claim-control" placeholder="請輸入新娘姓名" value="${bride}">
          </div>
        </div>
      `;
    } else if (goodsItem === '生育禮盒') {
      const relVal = record ? (record.relation || '') : '';
      const rankVal = record && record.childRank != null ? record.childRank : '';
      container.innerHTML = `
        <div class="claim-grid-4">
          <div class="claim-field">
            <label for="goods-relation">與申請人關係 <b>*</b></label>
            <select id="goods-relation" class="claim-control">${buildRelationOptionsHtml(relVal)}</select>
          </div>
          <div class="claim-field">
            <label for="goods-child-rank">子女排行 <b>*</b></label>
            <input type="number" id="goods-child-rank" class="claim-control" min="1" step="1" placeholder="請輸入排行" value="${rankVal}">
          </div>
        </div>
      `;
    } else if (goodsItem === '賀匾') {
      const moveDate = record ? toHyphenDate(record.moveDate || '') : '';
      const plaque = (record && record.plaqueType) ? record.plaqueType : '懿德';
      const embedDate = record ? toHyphenDate(record.embedDate || '') : '';
      const frameDate = record ? toHyphenDate(record.frameDate || '') : '';
      const finishDate = record ? toHyphenDate(record.finishDate || '') : '';
      container.innerHTML = `
        <div class="claim-grid-4" style="margin-bottom: 16px;">
          <div class="claim-field">
            <label for="goods-move-date">新居落成日 <b>*</b></label>
            <input type="date" id="goods-move-date" class="claim-control" value="${moveDate}">
          </div>
          <div class="claim-field" style="grid-column: span 3;">
            <label>布幔 / 賀詞 <b>*</b></label>
            <div class="choice" style="margin: 0; height: 40px;">
              <label><input type="radio" name="goods-plaque-type" value="懿德" ${plaque === '懿德' ? 'checked' : ''}>懿德</label>
              <label><input type="radio" name="goods-plaque-type" value="慈誠" ${plaque === '慈誠' ? 'checked' : ''}>慈誠</label>
              <label><input type="radio" name="goods-plaque-type" value="慈誠懿德" ${plaque === '慈誠懿德' ? 'checked' : ''}>慈誠懿德</label>
            </div>
          </div>
        </div>
        <div class="claim-grid-4">
          <div class="claim-field">
            <label for="goods-embed-date">繡字日</label>
            <input type="date" id="goods-embed-date" class="claim-control" value="${embedDate}">
          </div>
          <div class="claim-field">
            <label for="goods-frame-date">裱框日</label>
            <input type="date" id="goods-frame-date" class="claim-control" value="${frameDate}">
          </div>
          <div class="claim-field">
            <label for="goods-finish-date">完成日</label>
            <input type="date" id="goods-finish-date" class="claim-control" value="${finishDate}">
          </div>
        </div>
      `;
    }

    container.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', () => el.classList.remove('highlight-error'));
      el.addEventListener('change', () => el.classList.remove('highlight-error'));
    });
  };

  $('goods-item').addEventListener('change', (e) => {
    e.target.classList.remove('highlight-error');
    renderDynamicItemFields(e.target.value, null);
  });

  $('form-apply-date').addEventListener('change', (e) => {
    e.target.classList.remove('highlight-error');
  });

  const GOODS_FORM_STATE_KEY = 'cta_goods_form_state';
  const saveGoodsFormState = (mode, recordId = null) => {
    try {
      sessionStorage.setItem(GOODS_FORM_STATE_KEY, JSON.stringify({ activeHeqiKey, mode, recordId }));
    } catch (_) {}
  };
  const clearGoodsFormState = () => {
    try { sessionStorage.removeItem(GOODS_FORM_STATE_KEY); } catch (_) {}
  };

  const openClaimFormView = (mode, record = null) => {
    const targetHeqiKey = activeHeqiKey || window.CTA.resolveOptionKey(heqiInput.value.trim(), heqiOptions) || '仁德和氣 ETE05';
    activeHeqiKey = targetHeqiKey;
    heqiCombo.setValue(targetHeqiKey);

    const parts = targetHeqiKey.split(' ').filter(Boolean);
    $('goods-group-name').value = parts[0] || '仁德和氣';
    $('goods-group-code').value = parts[1] || 'ETE05';

    ['form-apply-date', 'goods-lookup-id', 'goods-item'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });

    if (mode === 'add') {
      currentEditingId = null;
      $('crumb-current').textContent = '申請 / 編輯聯誼物資 / 新增請領單';

      $('form-process-date').value = todayHyphen;
      $('form-creator').value = '蘇2';
      $('form-status').value = '待領取';
      $('form-apply-date').value = '';
      $('form-receipt-count').value = '';
      $('form-remark').value = '';

      $('goods-lookup-id').value = '';
      selectedGoodsMember = '';
      selectedGoodsCharity = '';
      $('goods-name').value = '';
      $('goods-dharma').value = '';
      $('goods-item').value = '';
      renderDynamicItemFields('', null);

      $('btn-form-delete').classList.add('hidden');
      $('claim-form-footer').appendChild($('btn-form-leave'));
      $('claim-form-footer').appendChild($('btn-form-save'));
    } else if (record) {
      currentEditingId = record.id;
      $('crumb-current').textContent = '申請 / 編輯聯誼物資 / 編輯請領單';

      $('form-process-date').value = toHyphenDate(record.processDate || todaySlash);
      $('form-creator').value = '蘇2';
      $('form-status').value = '待領取';
      $('form-apply-date').value = toHyphenDate(record.applyDate || '');
      $('form-receipt-count').value = record.receiptCount != null ? record.receiptCount : 1;
      $('form-remark').value = record.remark || '';

      selectedGoodsMember = record.member || '';
      selectedGoodsCharity = record.charity || '';
      $('goods-lookup-id').value = selectedGoodsMember || selectedGoodsCharity || '';
      $('goods-name').value = record.name || '';
      $('goods-dharma').value = record.dharmaName || '—';
      $('goods-item').value = record.goodsItem || '';
      renderDynamicItemFields(record.goodsItem || '', record);

      $('btn-form-delete').classList.remove('hidden');
      $('claim-form-footer').appendChild($('btn-form-save'));
      $('claim-form-footer').appendChild($('btn-form-leave'));
      $('claim-form-footer').appendChild($('btn-form-delete'));
    }

    saveGoodsFormState(mode, record ? record.id : null);

    $('list-view').classList.add('hidden');
    $('form-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const returnToListView = () => {
    clearGoodsFormState();
    $('form-view').classList.add('hidden');
    $('list-view').classList.remove('hidden');
    $('crumb-current').textContent = '申請 / 編輯聯誼物資';
    if (activeHeqiKey) {
      renderTable(getFilteredGoodsList(activeHeqiKey));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  $('btn-add-form').addEventListener('click', () => openClaimFormView('add'));

  window.CTA.bindFormLeaveGuard({
    isActive: () => {
      const fv = $('form-view');
      return Boolean(fv && !fv.classList.contains('hidden'));
    },
    onClearState: clearGoodsFormState
  });

  $('btn-form-leave').addEventListener('click', () => {
    openConfirmModal('你的資料尚未儲存，確定要離開嗎？', '確定', () => {
      returnToListView();
    });
  });

  $('btn-form-delete').addEventListener('click', () => {
    if (currentEditingId == null) return;
    openConfirmModal('確定刪除請領單嗎？', '確認', () => {
      const list = goodsDatasets[activeHeqiKey] || [];
      const idx = list.findIndex(r => r.id === currentEditingId);
      if (idx !== -1) list.splice(idx, 1);
      toast('已成功刪除請領單。');
      returnToListView();
    });
  });

  $('btn-form-save').addEventListener('click', () => {
    const applyDateVal = $('form-apply-date').value.trim();
    const lookupVal = cleanTrim($('goods-lookup-id').value);
    const gName = $('goods-name').value.trim();
    const gDharma = $('goods-dharma').value.trim();
    const gItem = $('goods-item').value.trim();

    ['form-apply-date', 'goods-lookup-id', 'goods-item'].forEach(fid => {
      $(fid).classList.remove('highlight-error');
    });
    document.querySelectorAll('#dynamic-item-fields .highlight-error').forEach(el => {
      el.classList.remove('highlight-error');
    });

    let invalid = false;
    if (!applyDateVal) { $('form-apply-date').classList.add('highlight-error'); invalid = true; }
    if (!lookupVal || !gName || (!selectedGoodsMember && !selectedGoodsCharity)) {
      $('goods-lookup-id').classList.add('highlight-error');
      invalid = true;
    }
    if (!gItem) { $('goods-item').classList.add('highlight-error'); invalid = true; }

    const extraFields = {};
    if (gItem === '飛天') {
      const relEl = $('goods-relation');
      const mDateEl = $('goods-marriage-date');
      const groomEl = $('goods-groom-name');
      const brideEl = $('goods-bride-name');
      if (!relEl || !relEl.value.trim()) { if (relEl) relEl.classList.add('highlight-error'); invalid = true; }
      if (!mDateEl || !mDateEl.value.trim()) { if (mDateEl) mDateEl.classList.add('highlight-error'); invalid = true; }
      if (!groomEl || !groomEl.value.trim()) { if (groomEl) groomEl.classList.add('highlight-error'); invalid = true; }
      if (!brideEl || !brideEl.value.trim()) { if (brideEl) brideEl.classList.add('highlight-error'); invalid = true; }
      if (!invalid) {
        extraFields.relation = relEl.value.trim();
        extraFields.marriageDate = toSlashDate(mDateEl.value.trim());
        extraFields.groomName = groomEl.value.trim();
        extraFields.brideName = brideEl.value.trim();
      }
    } else if (gItem === '生育禮盒') {
      const relEl = $('goods-relation');
      const rankEl = $('goods-child-rank');
      const rankNum = Number(rankEl ? rankEl.value : 0);
      if (!relEl || !relEl.value.trim()) { if (relEl) relEl.classList.add('highlight-error'); invalid = true; }
      if (!rankEl || !Number.isFinite(rankNum) || rankNum < 1) { if (rankEl) rankEl.classList.add('highlight-error'); invalid = true; }
      if (!invalid) {
        extraFields.relation = relEl.value.trim();
        extraFields.childRank = String(Math.floor(rankNum));
      }
    } else if (gItem === '賀匾') {
      const moveEl = $('goods-move-date');
      if (!moveEl || !moveEl.value.trim()) {
        if (moveEl) moveEl.classList.add('highlight-error');
        invalid = true;
      } else {
        const plaqueRadio = document.querySelector('input[name="goods-plaque-type"]:checked');
        extraFields.moveDate = toSlashDate(moveEl.value.trim());
        extraFields.plaqueType = plaqueRadio ? plaqueRadio.value : '懿德';
        extraFields.embedDate = $('goods-embed-date') && $('goods-embed-date').value ? toSlashDate($('goods-embed-date').value) : '';
        extraFields.frameDate = $('goods-frame-date') && $('goods-frame-date').value ? toSlashDate($('goods-frame-date').value) : '';
        extraFields.finishDate = $('goods-finish-date') && $('goods-finish-date').value ? toSlashDate($('goods-finish-date').value) : '';
      }
    }

    if (invalid) {
      openAlertModal('欄位填寫不完整！');
      return;
    }

    const list = goodsDatasets[activeHeqiKey] || (goodsDatasets[activeHeqiKey] = []);
    const existingIdx = currentEditingId == null ? -1 : list.findIndex(r => r.id === currentEditingId);

    const payload = {
      name: gName,
      type: '聯誼金物資',
      applyDate: toSlashDate(applyDateVal),
      processDate: toSlashDate($('form-process-date').value),
      receiptCount: Number($('form-receipt-count').value || 0),
      remark: $('form-remark').value.trim(),
      member: selectedGoodsMember,
      charity: selectedGoodsCharity,
      dharmaName: gDharma || '—',
      goodsItem: gItem,
      status: '待領取',
      ...extraFields
    };

    const nowRec = window.CTA.getNowMsRecord();
    if (existingIdx === -1) {
      list.push({
        id: nextClaimId++,
        ...payload,
        createdAtStr: nowRec.fullMs,
        createdAtMs: nowRec.ms,
        updatedAtStr: nowRec.fullMs,
        updatedAtMs: nowRec.ms
      });
    } else {
      const prevRec = list[existingIdx];
      list[existingIdx] = {
        ...prevRec,
        ...payload,
        createdAtStr: prevRec.createdAtStr || nowRec.fullMs,
        createdAtMs: prevRec.createdAtMs || nowRec.ms,
        updatedAtStr: nowRec.fullMs,
        updatedAtMs: nowRec.ms
      };
    }

    toast('已成功儲存請領單。');
    returnToListView();
  });

  dataReady.then(() => {
    try {
      const savedStateRaw = sessionStorage.getItem(GOODS_FORM_STATE_KEY);
      if (savedStateRaw) {
        clearGoodsFormState();
        const savedState = JSON.parse(savedStateRaw);
        if (savedState && savedState.activeHeqiKey) {
          activeHeqiKey = savedState.activeHeqiKey;
        }
        if (savedState && savedState.mode === 'edit' && savedState.recordId != null) {
          const list = goodsDatasets[activeHeqiKey] || [];
          const targetRec = list.find(r => r.id === savedState.recordId);
          if (targetRec) {
            openClaimFormView('edit', targetRec);
            return;
          }
        }
        openClaimFormView('add');
      }
    } catch (_) {}
  });
});
