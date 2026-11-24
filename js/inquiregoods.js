document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, escapeAttr, alert: openAlertModal } = window.CTA;

  let inquireDatasets = {};
  let goodsItemOptions = ['生育禮盒', '飛天', '賀匾', '法船'];
  let heqiOptions = [];
  let activeHeqiKey = '';
  let currentRenderedRecords = [];

  const populateItemOptions = () => {
    const itemSelect = $('filter-item');
    itemSelect.innerHTML = `<option value="全部" selected>全部</option>` +
      goodsItemOptions.map(name => `<option value="${name}">${name}</option>`).join('');
  };

  const dataReady = fetch('json/inquire_goods_data.json?v=347', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : null)
    .then(json => {
      if (json && typeof json === 'object') {
        if (json.inquireDatasets && typeof json.inquireDatasets === 'object') {
          inquireDatasets = json.inquireDatasets;
          heqiOptions = Object.keys(inquireDatasets);
        }
        if (Array.isArray(json.goodsItemOptions) && json.goodsItemOptions.length > 0) {
          goodsItemOptions = json.goodsItemOptions;
        }
      }
      populateItemOptions();
    })
    .catch(err => {
      console.error('讀取 json/inquire_goods_data.json 失敗：', err);
      inquireDatasets = {};
      heqiOptions = [];
    });

  // ==================== 詳細資料彈窗 ====================
  const closeDetailModal = () => $('detail-modal').classList.add('hidden');
  $('close-detail').addEventListener('click', closeDetailModal);
  $('btn-detail-close').addEventListener('click', closeDetailModal);
  window.CTA.registerModalEsc('detail-modal', closeDetailModal);

  const eitherOrFieldIds = ['filter-heqi', 'filter-keyword'];
  const clearEitherOrErrors = () => eitherOrFieldIds.forEach(fid => $(fid).classList.remove('highlight-error'));
  const markEitherOrErrors = () => eitherOrFieldIds.forEach(fid => $(fid).classList.add('highlight-error'));

  const openDetailModal = (record) => {
    if (!record) return;
    const heqiKeyForRec = record._heqiKey || activeHeqiKey || '';
    const parts = heqiKeyForRec.split(' ').filter(Boolean);
    const groupName = record.groupName || parts[0] || '';
    const groupCode = parts[1] || '';

    $('detail-modal-title').textContent = `支出管理 / 聯誼物資支出查詢 / ${record.goodsItem}明細（${record.name}）`;

    let itemSpecificHtml = '';
    if (record.goodsItem === '生育禮盒') {
      itemSpecificHtml = `
        <div class="claim-grid-4" style="margin-bottom: 0;">
          <div class="claim-field">
            <label>與申請人關係</label>
            <input type="text" class="claim-control" value="${record.relation || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>子女排行</label>
            <input type="text" class="claim-control" value="${record.childRank || '—'}" readonly>
          </div>
        </div>
      `;
    } else if (record.goodsItem === '飛天') {
      itemSpecificHtml = `
        <div class="claim-grid-4" style="margin-bottom: 0;">
          <div class="claim-field">
            <label>與申請人關係</label>
            <input type="text" class="claim-control" value="${record.relation || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>結婚日期</label>
            <input type="text" class="claim-control" value="${record.marriageDate || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>新郎姓名</label>
            <input type="text" class="claim-control" value="${record.groomName || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>新娘姓名</label>
            <input type="text" class="claim-control" value="${record.brideName || '—'}" readonly>
          </div>
        </div>
      `;
    } else if (record.goodsItem === '賀匾') {
      const plaque = record.plaqueType || '懿德';
      itemSpecificHtml = `
        <div class="claim-grid-4">
          <div class="claim-field">
            <label>新居落成日</label>
            <input type="text" class="claim-control" value="${record.moveDate || '—'}" readonly>
          </div>
          <div class="claim-field" style="grid-column: span 3;">
            <label>布幔 / 賀詞</label>
            <div class="choice" style="margin: 0; height: 40px;">
              <label><input type="radio" disabled ${plaque === '懿德' ? 'checked' : ''}>懿德</label>
              <label><input type="radio" disabled ${plaque === '慈誠' ? 'checked' : ''}>慈誠</label>
              <label><input type="radio" disabled ${plaque === '慈誠懿德' ? 'checked' : ''}>慈誠懿德</label>
            </div>
          </div>
        </div>
        <div class="claim-grid-4" style="margin-bottom: 0;">
          <div class="claim-field">
            <label>繡字日</label>
            <input type="text" class="claim-control" value="${record.embedDate || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>裱框日</label>
            <input type="text" class="claim-control" value="${record.frameDate || '—'}" readonly>
          </div>
          <div class="claim-field">
            <label>完成日</label>
            <input type="text" class="claim-control" value="${record.finishDate || '—'}" readonly>
          </div>
        </div>
      `;
    }

    const safeRemark = escapeAttr(record.remark || '');
    $('detail-modal-body').innerHTML = `
      <div class="claim-grid-5">
        <div class="claim-field">
          <label>組別名稱</label>
          <input type="text" class="claim-control" value="${groupName}" readonly>
        </div>
        <div class="claim-field">
          <label>組別代碼</label>
          <input type="text" class="claim-control" value="${groupCode}" readonly>
        </div>
        <div class="claim-field">
          <label>填表人</label>
          <input type="text" class="claim-control" value="${record.creator || '蘇2'}" readonly>
        </div>
        <div class="claim-field">
          <label>目前狀態</label>
          <input type="text" class="claim-control" value="${record.status || '待領取'}" readonly>
        </div>
        <div class="claim-field">
          <label>作業日期</label>
          <input type="text" class="claim-control" value="${record.processDate || '—'}" readonly>
        </div>
      </div>
      <div class="claim-grid-4">
        <div class="claim-field">
          <label>申請日</label>
          <input type="text" class="claim-control" value="${record.applyDate || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>單據 / 張</label>
          <input type="text" class="claim-control" value="${record.receiptCount != null ? record.receiptCount : 0}" readonly>
        </div>
        <div class="claim-field" style="grid-column: span 2;">
          <label>類別</label>
          <div class="choice" style="margin: 0; height: 40px;">
            <label><input type="radio" checked disabled>聯誼金物資</label>
          </div>
        </div>
      </div>
      <div class="claim-field" style="margin-bottom: 18px;">
        <label>備註</label>
        <input type="text" class="claim-control" value="${safeRemark || '無備註內容'}" readonly>
      </div>
      <div class="claim-grid-5" style="${itemSpecificHtml ? '' : 'margin-bottom: 0;'}">
        <div class="claim-field">
          <label>委員號</label>
          <input type="text" class="claim-control" value="${record.member || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>慈誠號</label>
          <input type="text" class="claim-control" value="${record.charity || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>姓名</label>
          <input type="text" class="claim-control" value="${record.name || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>法號</label>
          <input type="text" class="claim-control" value="${record.dharmaName || '—'}" readonly>
        </div>
        <div class="claim-field">
          <label>項目</label>
          <input type="text" class="claim-control" value="${record.goodsItem || '—'}" readonly>
        </div>
      </div>
      ${itemSpecificHtml}
    `;

    $('detail-modal').classList.remove('hidden');
  };

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
    emptyText: '無相符和氣組別',
    onSelect: clearEitherOrErrors,
    onInput: clearEitherOrErrors,
    onEnter: () => executeSearch()
  });

  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentRenderedRecords)
  });

  $('filter-keyword').addEventListener('input', clearEitherOrErrors);
  $('filter-keyword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  const renderTable = (data) => {
    const tbody = $('inquire-goods-tbody');
    currentRenderedRecords = window.CTA.sortByApplyDateDesc(data);
    if (currentRenderedRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty">查無符合條件的資料</td></tr>`;
      $('result-count-display').textContent = '0';
      pager.render(0, 1, 1);
      return;
    }

    $('result-count-display').textContent = String(currentRenderedRecords.length);

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentRenderedRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentRenderedRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentRenderedRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((item, idx) => {
      const badgeClass = item.status === '已領取' ? 'approved' : 'pending';
      return `
        <tr>
          <td class="center">${startIndex + idx + 1}</td>
          <td>${item.groupName || '<span class="blank">—</span>'}</td>
          <td>${item.name || '<span class="blank">—</span>'}</td>
          <td>${item.goodsItem || '<span class="blank">—</span>'}</td>
          <td>${item.applyDate || '<span class="blank">—</span>'}</td>
          <td>${item.processDate || '<span class="blank">—</span>'}</td>
          <td>${item.member || '<span class="blank">—</span>'}</td>
          <td>${item.charity || '<span class="blank">—</span>'}</td>
          <td class="center"><span class="status-badge ${badgeClass}">${item.status || '待領取'}</span></td>
          <td class="center"><button type="button" class="btn primary small btn-detail" data-id="${item.id}">詳細</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const record = currentRenderedRecords.find(r => r.id === id);
        if (record) openDetailModal(record);
      });
    });
  };

  const executeSearch = async () => {
    const rawHeqi = cleanTrim(heqiInput.value);
    const rawKeyword = cleanTrim($('filter-keyword').value);

    heqiInput.value = rawHeqi;
    $('filter-keyword').value = rawKeyword;
    clearEitherOrErrors();

    if (!rawHeqi && !rawKeyword) {
      markEitherOrErrors();
      openAlertModal('請選擇「和氣組別」或輸入「快速搜尋」再按搜尋！');
      return;
    }

    const yearVal = $('filter-year').value;
    const itemVal = $('filter-item').value || '全部';
    const kwLower = rawKeyword.toLowerCase();

    heqiCombo.close();
    $('table-loading').classList.remove('hidden');
    await dataReady;

    setTimeout(() => {
      let candidateList = [];
      if (rawHeqi) {
        const matchedKey = window.CTA.resolveOptionKey(rawHeqi, heqiOptions);
        if (!matchedKey) {
          activeHeqiKey = '';
          renderTable([]);
          $('table-loading').classList.add('hidden');
          return;
        }
        activeHeqiKey = matchedKey;
        heqiCombo.setValue(matchedKey);
        candidateList = (inquireDatasets[matchedKey] || []).map(r => ({ ...r, _heqiKey: matchedKey }));
      } else {
        activeHeqiKey = '';
        Object.keys(inquireDatasets).forEach(k => {
          (inquireDatasets[k] || []).forEach(r => candidateList.push({ ...r, _heqiKey: k }));
        });
      }

      const filtered = candidateList.filter(record => {
        if (yearVal && String(record.year || '2026') !== yearVal) return false;
        if (itemVal && itemVal !== '全部' && record.goodsItem !== itemVal) return false;
        if (kwLower) {
          const hayAll = [record.name || '', record.member || '', record.charity || ''].join(' ').toLowerCase();
          if (!hayAll.includes(kwLower)) return false;
        }
        return true;
      });

      pager.setPage(1);
      renderTable(filtered);
      $('table-loading').classList.add('hidden');
    }, 220);
  };

  $('btn-search').addEventListener('click', executeSearch);

  $('btn-reset').addEventListener('click', () => {
    $('filter-year').value = '2026';
    heqiCombo.setValue('');
    clearEitherOrErrors();
    heqiCombo.close();
    populateItemOptions();
    $('filter-keyword').value = '';
    activeHeqiKey = '';
    currentRenderedRecords = [];
    pager.setPage(1);
    $('result-count-display').textContent = '0';
    pager.render(0, 1, 1);
    $('inquire-goods-tbody').innerHTML = `<tr><td colspan="10" class="empty">請選擇條件搜尋</td></tr>`;
  });
});
