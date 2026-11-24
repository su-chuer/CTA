document.addEventListener("DOMContentLoaded", () => {
  const { $, money, toast } = window.CTA;

  let ledgerData = [];
  let currentLedgerRecords = [];

  const dataReady = fetch('json/ledger_data.json?v=346', { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(list => {
      ledgerData = Array.isArray(list) ? list : [];
      if (typeof window.CTA.syncRecordedFloorMs === 'function') {
        window.CTA.syncRecordedFloorMs(ledgerData);
      }
    })
    .catch(err => {
      console.error('讀取 json/ledger_data.json 失敗：', err);
      ledgerData = [];
    });

  const closeRemarkModal = () => $('remark-modal').classList.add('hidden');
  $('btn-remark-ok').addEventListener('click', closeRemarkModal);
  $('close-remark').addEventListener('click', closeRemarkModal);
  window.CTA.registerModalEsc('remark-modal', closeRemarkModal);

  const pager = window.CTA.createPagination({
    onChange: () => renderTable(currentLedgerRecords)
  });

  const renderTable = (data) => {
    const tbody = $('master-tbody');
    currentLedgerRecords = Array.isArray(data) ? data : [];
    if (currentLedgerRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty">查無符合條件的資料</td></tr>`;
      pager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(currentLedgerRecords.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = currentLedgerRecords.slice(startIndex, startIndex + itemsPerPage);
    pager.render(currentLedgerRecords.length, totalPages, currentPage);

    tbody.innerHTML = pageData.map((r, idx) => {
      const isApproved = r.status === '已列帳';
      const isRejected = r.status === '退回修正';
      const noClass = isApproved ? 'btn-faded' : (isRejected ? 'btn-selected' : '');
      const yesClass = isRejected ? 'btn-faded' : (isApproved ? 'btn-selected' : '');

      return `
        <tr>
          <td class="center">${startIndex + idx + 1}</td>
          <td>${r.area}</td>
          <td>${r.unit}</td>
          <td class="center"><span class="status-badge ${r.statusClass}">${r.status}</span></td>
          <td class="center" style="color: #556477;">${r.date}</td>
          <td>${r.name}</td>
          <td>${r.bank}</td>
          <td>${r.account}</td>
          <td class="center"><button type="button" class="btn small btn-remark" data-id="${r.id}">查看</button></td>
          <td class="num-col">${r.amount > 0 ? money(r.amount) : '<span class="blank">0</span>'}</td>
          <td class="center">
            <div style="display: inline-flex; gap: 6px; justify-content: center; align-items: center;">
              <button type="button" class="btn small btn-no ${noClass}" data-id="${r.id}" ${isApproved ? 'disabled' : ''}>否</button>
              <button type="button" class="btn small btn-yes ${yesClass}" data-id="${r.id}" ${isRejected ? 'disabled' : ''}>是</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-remark').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id, 10);
        const item = ledgerData.find(d => d.id === id);
        $('remark-modal-body').textContent = (item && item.remark) ? item.remark : '無備註內容';
        $('remark-modal').classList.remove('hidden');
      });
    });

    tbody.querySelectorAll('.btn-no').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id, 10);
        const item = ledgerData.find(d => d.id === id);
        if (!item || item.status !== '待列帳') return;

        window.CTA.confirm(
          '請問確定不列帳？<br>表單將退回「待審核」。',
          { title: '確認不列帳', okClass: 'btn btn-no', okText: '確定' },
          () => {
            const nowRec = window.CTA.getNowMsRecord();
            item.status = '待審核';
            item.statusClass = 'pending';
            item.updatedAtStr = nowRec.isoMs;
            item.updatedAtMs = nowRec.ms;
            toast('已不列帳，表單退回「待審核」。');
            executeSearch(false);
          }
        );
      });
    });

    tbody.querySelectorAll('.btn-yes').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id, 10);
        const item = ledgerData.find(d => d.id === id);
        if (!item || item.status !== '待列帳') return;

        window.CTA.confirm(
          '請問確定列帳？',
          { title: '確認列帳', okClass: 'btn btn-yes', okText: '確定' },
          () => {
            const nowRec = window.CTA.getNowMsRecord();
            item.status = '已列帳';
            item.statusClass = 'approved';
            item.updatedAtStr = nowRec.isoMs;
            item.updatedAtMs = nowRec.ms;
            toast('已完成列帳。');
            executeSearch(false);
          }
        );
      });
    });
  };

  const executeSearch = async (showSpinner = true) => {
    const areaSelect = $('filter-area');
    if (!areaSelect.value) {
      areaSelect.classList.add('highlight-error');
      areaSelect.focus();
      return;
    }

    await dataReady;

    const areaOrder = { '北': 1, '中': 2, '南': 3, '東': 4 };
    const getPendingList = () => {
      const yearFilter = $('filter-year').value;
      const areaFilter = areaSelect.value;
      let filtered = ledgerData.filter(d =>
        String(d.year) === yearFilter &&
        d.status === '待列帳' &&
        (areaFilter === '全部' || d.area === areaFilter)
      );
      if (areaFilter === '全部') {
        filtered.sort((a, b) => (areaOrder[a.area] || 99) - (areaOrder[b.area] || 99));
      }
      return filtered;
    };

    if (showSpinner) {
      $('table-loading').classList.remove('hidden');
      setTimeout(() => {
        pager.setPage(1);
        renderTable(getPendingList());
        $('table-loading').classList.add('hidden');
      }, 250);
    } else {
      renderTable(getPendingList());
    }
  };

  $('master-tbody').innerHTML = `<tr><td colspan="11" class="empty">請選擇條件搜尋</td></tr>`;

  $('btn-search').addEventListener('click', () => executeSearch(true));

  $('btn-reset').addEventListener('click', () => {
    $('filter-year').value = '2026';
    $('filter-area').value = '';
    $('filter-area').classList.remove('highlight-error');
    currentLedgerRecords = [];
    pager.setPage(1);
    pager.render(0, 1, 1);
    $('master-tbody').innerHTML = `<tr><td colspan="11" class="empty">請選擇條件搜尋</td></tr>`;
  });

  $('filter-area').addEventListener('change', (e) => e.target.classList.remove('highlight-error'));
});
