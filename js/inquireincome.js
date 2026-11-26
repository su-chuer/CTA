document.addEventListener("DOMContentLoaded", () => {
  const { $, cleanTrim, money, escapeAttr } = window.CTA;
  const formatXieliLabel = (u) => {
    if (!u) return '';
    const unitType = u.unitType || '隊';
    const heqi = String(u.heqi || '').trim();
    let raw = String(u.xieli || u.unitLabel || '').trim();
    if (heqi && raw.startsWith(heqi)) {
      raw = raw.slice(heqi.length).trim();
    }
    if (raw.endsWith(` (${unitType})`)) return raw;
    if (raw.endsWith(`(${unitType})`)) return `${raw.slice(0, -(`(${unitType})`.length)).trim()} (${unitType})`;
    if (raw.endsWith(unitType)) return `${raw.slice(0, -unitType.length).trim()} (${unitType})`;
    return raw ? `${raw} (${unitType})` : '';
  };
  const formatFullUnitTitle = (u) => {
    if (!u) return '';
    const heqi = String(u.heqi || '').trim();
    const xieli = formatXieliLabel(u);
    return [heqi, xieli].filter(Boolean).join(' - ');
  };
  const strokeCollator = new Intl.Collator('zh-Hant-u-co-stroke', { sensitivity: 'variant', numeric: true });
  let inquireData = [];
  let filteredUnits = [];
  let currentUnitObj = null;

  // 和氣組別：可下拉選擇亦可輸入文字篩選的 Combo-box
  const heqiInput = $('filter-heqi');
  let comboOptions = [];

  const closeUnitDetailModal = () => $('unit-detail-modal').classList.add('hidden');
  $('close-unit-detail').addEventListener('click', closeUnitDetailModal);
  $('btn-unit-detail-ok').addEventListener('click', closeUnitDetailModal);
  window.CTA.registerModalEsc('unit-detail-modal', closeUnitDetailModal);

  const openUnitDetailModal = (unitObj) => {
    currentUnitObj = unitObj;
    renderMemberTable();
    $('unit-detail-modal').classList.remove('hidden');
  };

  const getUnitTotalAmount = (u) => {
    const members = Array.isArray(u && u.members) ? u.members : [];
    return members.reduce((sum, m) => {
      const payments = Array.isArray(m.payments) ? m.payments : [];
      return sum + payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    }, 0);
  };

  const buildComboOptions = () => {
    const yearVal = $('filter-year').value;
    const unitVal = getUnit();
    const heqiSet = new Set();
    const xieliSet = new Set();

    inquireData.forEach(item => {
      if (String(item.year) !== yearVal) return;
      if (unitVal !== '全部' && item.unitType !== unitVal) return;
      if (getUnitTotalAmount(item) <= 0) return;

      if (item.heqi) heqiSet.add(item.heqi);
      const xLbl = formatXieliLabel(item);
      if (xLbl) xieliSet.add(xLbl);
    });

    const list = [];
    heqiSet.forEach(h => list.push({ value: h, tag: '組別' }));
    xieliSet.forEach(x => list.push({ value: x, tag: '互愛協力' }));
    comboOptions = list;
  };

  const heqiCombo = window.CTA.createComboSelect({
    inputId: 'filter-heqi',
    autoWidth: true,
    wrapId: 'heqi-combo-wrap',
    menuId: 'heqi-combo-menu',
    clearBtnId: 'btn-clear-heqi',
    toggleBtnId: 'btn-toggle-heqi',
    getOptions: () => comboOptions,
    beforeOpen: async () => { await dataReady; buildComboOptions(); },
    emptyText: '無相符組別，可直接按「搜尋」比對關鍵字',
    filterOptions: (all, kw) => kw
      ? all.filter(opt => opt.value.toLowerCase().includes(kw))
      : all.filter(opt => opt.tag === '組別'),
    renderOption: (opt, { kw, isSelected, isHighlighted, idx, val }) => {
      const tagHtml = kw ? `<span class="combo-option-tag">${opt.tag}</span>` : '';
      return `<div class="combo-option-item ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}" role="option" data-idx="${idx}" data-val="${escapeAttr(val)}"><span>${val}</span>${tagHtml}</div>`;
    },
    onEnter: () => executeSearch()
  });

  // 從外部資料表 json/inquire_data.json 載入資料（不寫死於前端程式）
  const dataReady = fetch('json/inquire_data.json?v=346', { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(list => {
      inquireData = Array.isArray(list) ? list : [];
      const teamByYearHeqi = {};
      inquireData.forEach(u => {
        if (u.unitType === '隊') {
          const yh = `${String(u.year || '2026')}|${u.heqi || ''}`;
          if (!teamByYearHeqi[yh]) teamByYearHeqi[yh] = [];
          teamByYearHeqi[yh].push(...(Array.isArray(u.members) ? u.members : []));
        }
      });
      inquireData.forEach(u => {
        if (u.unitType === '組' && Array.isArray(u.members)) {
          const teamMembers = teamByYearHeqi[`${String(u.year || '2026')}|${u.heqi || ''}`] || [];
          u.members.forEach(m => {
            if (!m.charity) {
              const sp = String(m.spouseId || '').trim();
              if (sp && sp.includes('/')) {
                const charityPart = sp.split('/')[1].trim();
                if (charityPart && charityPart !== '—') {
                  m.charity = charityPart;
                }
              }
              if (!m.charity && m.member) {
                const matched = teamMembers.find(t => t.member === m.member && t.charity);
                if (matched) m.charity = matched.charity;
              }
            }
            // 確保 1夫1妻 雙向編號一致（若隊的先生慈誠號對應到本位太太，則先生的委員號亦對齊太太委員號）
            if (m.member && m.charity) {
              const husband = teamMembers.find(t => t.charity === m.charity);
              if (husband && husband.member !== m.member) {
                husband.member = m.member;
              }
            }
          });
        }
      });
      buildComboOptions();
    })
    .catch(err => {
      console.error('讀取 json/inquire_data.json 失敗：', err);
      inquireData = [];
      buildComboOptions();
    });



  const openAlertModal = (msg) => window.CTA.alert(msg, () => heqiInput.focus());

  // 關閉會員詳細彈窗（僅透過 ✕ / 關閉按鈕 或 Esc）
  const closeMemberDetail = () => $('member-detail-modal').classList.add('hidden');
  $('close-member-detail').addEventListener('click', closeMemberDetail);
  $('btn-member-detail-ok').addEventListener('click', closeMemberDetail);
  window.CTA.registerModalEsc('member-detail-modal', closeMemberDetail);

  const compareIdAsc = (aVal, bVal) => {
    const sa = String(aVal || '').trim();
    const sb = String(bVal || '').trim();
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb, 'en', { numeric: true });
  };

  const sortMembersByUnit = (members, unitType) => {
    const field = unitType === '隊' ? 'charity' : 'member';
    return [...members].sort((a, b) => compareIdAsc(a[field], b[field]));
  };

  const calcMemberStats = (m) => {
    const payments = Array.isArray(m.payments) ? m.payments : [];
    const times = payments.length;
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return { times, totalAmount };
  };

  const openMemberDetailModal = (member, unitObj) => {
    const stats = calcMemberStats(member);
    $('member-detail-title').textContent = `${unitObj.year} 年度｜${formatFullUnitTitle(unitObj)}（${member.name}）`;

    const payments = Array.isArray(member.payments) ? member.payments : [];
    const sortedPaymentsHtml = [...payments]
      .sort((a, b) => Number(a.month) - Number(b.month))
      .map(p => `<tr style="border-bottom: 1px solid #ecf0f6;">
        <td style="padding:12px 16px;">${p.month} 月</td>
        <td style="padding:12px 16px; color:#3d5176;">${p.date || ''}</td>
        <td style="padding:12px 16px; color:#3d5176;">${p.settleDate || ''}</td>
        <td style="padding:12px 16px; color:#3d5176;">${p.ledgerDate || ''}</td>
        <td class="num-col" style="padding:12px 16px;">${money(p.amount)}</td>
      </tr>`)
      .join('') || '<tr><td colspan="5" class="empty" style="padding:30px; text-align:center; color:#5c6b7d;">目前尚無繳款紀錄</td></tr>';

    const safeRemark = (member.remark || '').split('"').join('&quot;');
    $('member-detail-body').innerHTML = `
      <div style="font-size: 15px; color: #122a55; font-weight: 700; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #c9d8eb; display: flex; align-items: center; gap: 6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a6b9c" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        基本資料
      </div>
      <div class="detail-grid" style="gap: 6px 8px; margin-bottom: 16px;">
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">年度</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${unitObj.year}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">受證年度</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.certYear || '2010'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">組別名稱</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${unitObj.heqi || ''}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">互愛協力</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${formatXieliLabel(unitObj)}</div></div>

        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">委員 (委員號)</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.member || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">姓名</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.name}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">法號</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.dharmaName || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">存歿</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.alive || '存'}</div></div>

        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶委員 (慈誠號)</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.charity || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶姓名</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.spouseName || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶法號</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.spouseDharma || '—'}</div></div>
        <div style="background:#eaf1fa; border:1px solid #c9d8eb; padding:5px 8px; border-radius:4px;"><small style="color:#122a55; font-size:14px; font-weight:700; display:block; margin-bottom:2px;">配偶存歿</small><div style="background:#ffffff; border: 1px solid #d9e3f1; padding:3px 6px; border-radius:3px; font-size:15px;">${member.spouseAlive || '—'}</div></div>
      </div>

      <div style="margin-bottom: 18px;">
        <label style="display:block; color:#3d5176; margin-bottom:4px; font-size:14px; font-weight:700;">備註：</label>
        <input type="text" class="remark-input" disabled placeholder="無備註內容" value="${safeRemark}">
      </div>

      <div>
        <div style="font-size: 15px; color: #122a55; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #c9d8eb; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4291" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            繳款明細
          </div>
          <span style="font-size: 14px; color: #556477; font-weight: 500;">繳交 ${stats.times} 次 ／ 合計 NT$ ${money(stats.totalAmount)}</span>
        </div>
        <div class="table-scroll" style="margin:0; border-radius:6px; overflow-x:auto;">
          <table class="detail-table">
            <thead style="background: #eaf1fa;">
              <tr>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">繳款月份</th>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">作業日</th>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">結帳日</th>
                <th style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:left; border-bottom:1px solid #d9e3f1;">列帳日</th>
                <th class="num-col" style="padding:12px 16px; font-size:14px; color:#122a55; font-weight:700; text-align:right; border-bottom:1px solid #d9e3f1;">金額</th>
              </tr>
            </thead>
            <tbody>${sortedPaymentsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
    $('member-detail-modal').classList.remove('hidden');
  };

  const renderMemberTable = () => {
    const tbody = $('member-list-tbody');
    const unitObj = currentUnitObj;
    if (!unitObj) return;

    const qKeyword = cleanTrim($('filter-member-keyword').value).toLowerCase();
    const hasMemberFilter = Boolean(qKeyword);

    const allMembers = sortMembersByUnit(Array.isArray(unitObj.members) ? unitObj.members : [], unitObj.unitType);
    const totalUnitPeople = allMembers.length;
    const totalUnitAmount = allMembers.reduce((sum, m) => sum + calcMemberStats(m).totalAmount, 0);

    $('selected-unit-title').textContent = `${unitObj.year} 年度｜${formatFullUnitTitle(unitObj)}`;

    let displayMembers = allMembers;
    if (hasMemberFilter) {
      displayMembers = allMembers.filter(m => 
        (m.name || '').toLowerCase().includes(qKeyword) ||
        (m.member || '').toLowerCase().includes(qKeyword) ||
        (m.charity || '').toLowerCase().includes(qKeyword)
      );
    }
    
    // Update KPI inside modal to reflect ONLY the displayed (filtered) members
    const filteredPeople = displayMembers.length;
    const filteredAmount = displayMembers.reduce((sum, m) => sum + calcMemberStats(m).totalAmount, 0);
    $('kpi-people').textContent = filteredPeople;
    $('kpi-amount').textContent = money(filteredAmount);

    if (displayMembers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">查無符合條件的資料</td></tr>';
      return;
    }

    tbody.innerHTML = displayMembers.map((m, idx) => {
      const stats = calcMemberStats(m);
      const isMatched = hasMemberFilter && (
        (m.name || '').toLowerCase().includes(qKeyword) ||
        (m.member || '').toLowerCase().includes(qKeyword) ||
        (m.charity || '').toLowerCase().includes(qKeyword)
      );
      const origIdx = allMembers.indexOf(m);
      return `
        <tr class="${isMatched ? 'matched-member' : ''}">
          <td class="center">${idx + 1}</td>
          <td>${m.name}</td>
          <td>${m.member || ''}</td>
          <td>${m.charity || ''}</td>
          <td class="center">${stats.times}</td>
          <td class="num-col">${stats.totalAmount > 0 ? money(stats.totalAmount) : '<span class="blank">0</span>'}</td>
          <td class="center"><button type="button" class="btn primary small btn-detail" data-m-idx="${origIdx}">詳細</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mIdx = parseInt(e.currentTarget.dataset.mIdx, 10);
        const member = allMembers[mIdx];
        if (member) openMemberDetailModal(member, unitObj);
      });
    });
  };

  const pager = window.CTA.createPagination({
    onChange: () => renderUnitSummaryTable()
  });

  const renderUnitSummaryTable = () => {
    const tbody = $('unit-summary-tbody');
    const unitVal = getUnit();
    $('unit-count-pill').textContent = `查詢結果，${filteredUnits.length} 筆`;

    const totalSum = filteredUnits.reduce((acc, u) => acc + getUnitTotalAmount(u), 0);
    const totalPill = $('unit-total-pill');
    if (filteredUnits.length > 0) {
      totalPill.textContent = `總金額 NT$ ${money(totalSum)}`;
      totalPill.style.display = 'inline-block';
    } else {
      totalPill.style.display = 'none';
    }

    if (filteredUnits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">查無符合條件的資料</td></tr>`;
      pager.render(0, 1, 1);
      return;
    }

    const itemsPerPage = pager.getPerPage();
    const totalPages = Math.max(1, Math.ceil(filteredUnits.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, pager.getPage()), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageUnits = filteredUnits.slice(startIndex, startIndex + itemsPerPage);
    pager.render(filteredUnits.length, totalPages, currentPage);

    tbody.innerHTML = pageUnits.map((u, idx) => {
      const members = Array.isArray(u.members) ? u.members : [];
      const totalPeople = members.length;
      const totalAmt = members.reduce((sum, m) => sum + calcMemberStats(m).totalAmount, 0);

      return `
        <tr>
          <td>${u.heqi || ''}</td>
          <td>${formatXieliLabel(u)}</td>
          <td class="center">${totalPeople}</td>
          <td class="num-col">${money(totalAmt)}</td>
          <td class="center"><button type="button" class="btn primary small btn-unit-detail" data-unit-idx="${startIndex + idx}">詳細</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-unit-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uIdx = parseInt(e.currentTarget.dataset.unitIdx, 10);
        const unitObj = filteredUnits[uIdx];
        if (unitObj) openUnitDetailModal(unitObj);
      });
    });
  };

  const getUnit = () => {
    const checked = document.querySelector('input[name="unit"]:checked');
    return checked ? checked.value : '全部';
  };

  const executeSearch = async () => {
    const qHeqiRaw = cleanTrim($('filter-heqi').value);
    const qKeywordRaw = cleanTrim($('filter-member-keyword').value);
    $('filter-heqi').value = qHeqiRaw;
    $('filter-member-keyword').value = qKeywordRaw;
    if (!qHeqiRaw && !qKeywordRaw) {
      openAlertModal('請選擇「和氣組別」或輸入「快速搜尋」再按搜尋！');
      return;
    }

    await dataReady;

    $('left-loading').classList.remove('hidden');

    setTimeout(() => {
      const yearVal = $('filter-year').value;
      const unitVal = getUnit();
      const qHeqi = qHeqiRaw.toLowerCase();
      const qKeyword = qKeywordRaw.toLowerCase();
      const hasMemberFilter = Boolean(qKeyword);

      filteredUnits = inquireData.filter(u => {
        if (String(u.year) !== yearVal) return false;
        if (unitVal !== '全部' && u.unitType !== unitVal) return false;
        if (getUnitTotalAmount(u) <= 0) return false;
        if (qHeqi) {
          const hay = `${u.heqi || ''} ${formatXieliLabel(u)}`.toLowerCase();
          if (!hay.includes(qHeqi)) return false;
        }
        if (hasMemberFilter) {
          const members = Array.isArray(u.members) ? u.members : [];
          const anyMatch = members.some(m =>
            (m.name || '').toLowerCase().includes(qKeyword) ||
            (m.member || '').toLowerCase().includes(qKeyword) ||
            (m.charity || '').toLowerCase().includes(qKeyword)
          );
          if (!anyMatch) return false;
        }
        return true;
      });

      sortFilteredUnits();
      pager.setPage(1);
      renderUnitSummaryTable();
      $('left-loading').classList.add('hidden');
    }, 250);
  };

  const getXieliBaseText = (u) => {
    return formatXieliLabel(u).replace(/\s*\((?:隊|組)\)\s*$/, '').trim();
  };

  const sortFilteredUnits = () => {
    filteredUnits.sort((a, b) => {
      const rankA = a.unitType === '隊' ? 0 : 1;
      const rankB = b.unitType === '隊' ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;

      const heqiCmp = strokeCollator.compare(String(a.heqi || ''), String(b.heqi || ''));
      if (heqiCmp !== 0) return heqiCmp;

      return strokeCollator.compare(getXieliBaseText(a), getXieliBaseText(b));
    });
  };

  $('btn-search').addEventListener('click', executeSearch);

  // 所有篩選條件（年份、和氣組別、隊/組、快速搜尋）皆於點擊「搜尋」按鈕後才更新畫面內容

  // 支援在文字欄位按 Enter 直接搜尋
  ['filter-member-keyword'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          executeSearch();
        }
      });
    }
  });

  // 清除功能
  $('btn-reset').addEventListener('click', () => {
    $('filter-year').value = '2026';
    heqiCombo.setValue('');
    document.querySelector('input[name="unit"][value="全部"]').checked = true;
    $('filter-member-keyword').value = '';

    filteredUnits = [];
    currentUnitObj = null;
    pager.setPage(1);
    pager.render(0, 1, 1);
    buildComboOptions();
    $('unit-count-pill').textContent = '查詢結果，0 筆';
    $('unit-total-pill').style.display = 'none';
    $('unit-summary-tbody').innerHTML = '<tr><td colspan="5" class="empty">請選擇條件搜尋</td></tr>';
  });
});
