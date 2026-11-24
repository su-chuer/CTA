// 自動載入頂部導覽列與圖示 SVG
document.addEventListener("DOMContentLoaded", function() {
  const headerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="svg-sprite" aria-hidden="true"><symbol id="ico-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></symbol><symbol id="ico-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></symbol>
<symbol id="ico-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/></symbol><symbol id="ico-file-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></symbol><symbol id="ico-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 5 5"/></symbol><symbol id="ico-refresh-cw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.4-4.8L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.4 4.8L21 15"/><path d="M16 15h5v5"/></symbol><symbol id="ico-calculator" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><rect x="8" y="5" width="8" height="4"/><path d="M8 12h1m3 0h1m3 0h.01M8 16h1m3 0h1m3 0h.01M8 19h1m3 0h1m3 0h.01"/></symbol><symbol id="ico-chevron-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></symbol>
<symbol id="ico-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></symbol>
<symbol id="ico-clipboard-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></symbol>
<symbol id="ico-book-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></symbol>
<symbol id="ico-file-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="m13.3 16.3 1.7 1.7"/></symbol>
<symbol id="ico-file-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></symbol>
<symbol id="ico-banknote" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></symbol>
<symbol id="ico-package-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></symbol>
<symbol id="ico-package-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></symbol>
<symbol id="ico-package-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27 22 19"/></symbol><symbol id="ico-warehouse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect x="6" y="10" width="12" height="12"/></symbol></svg>
<!-- 頂部上方選單 (Top Navbar) -->
<header class="top-navbar">
  <div class="top-navbar-container">
    <div class="nav-left">
      <button type="button" class="mobile-menu-toggle" id="mobileMenuBtn" aria-label="選單">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
      <div class="brand-logo" title="慈濟基金會">
        <img src="http://tcap1.qa.tzuchi.org:9080/CTA/login-logo-black.6822e580b96ade84e176.png" alt="慈濟 Logo">
      </div>
      <ul class="main-menu">
        <li class="menu-node">
          <a class="menu-link has-dropdown" href="#"><span>收入管理</span><span class="mobile-arrow">▾</span></a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="searchincome.html">編輯收入明細</a></li>
            <li><a class="dropdown-item" href="reviewincome.html">審核收入明細</a></li>
            <li><a class="dropdown-item" href="incomelistpage.html">收入列帳</a></li>
            <li><a class="dropdown-item" href="inquireincome.html">查詢收入明細</a></li>
            <li class="has-submenu">
              <a class="dropdown-item" href="#">報表 <span class="sub-arrow">▶</span></a>
              <ul class="submenu">
                <li><a class="dropdown-item" href="#">A01 委員聯誼金協力組收款表</a></li>
                <li><a class="dropdown-item" href="#">A02 慈誠聯誼金協力隊收款表</a></li>
                <li><a class="dropdown-item" href="#">A03 和氣收入總表</a></li>
                <li><a class="dropdown-item" href="#">D01 和氣收入統計總表</a></li>
                <li><a class="dropdown-item" href="#">A04 合心收入彙總表</a></li>
                <li><a class="dropdown-item" href="#">D04 合心收入統計總表</a></li>
              </ul>
            </li>
            <li class="has-submenu">
              <a class="dropdown-item" href="#">收入檔案下載 <span class="sub-arrow">▶</span></a>
              <ul class="submenu">
                <li><a class="dropdown-item" href="#">聯誼金收入收據</a></li>
              </ul>
            </li>
          </ul>
        </li>
        <li class="menu-node">
          <a class="menu-link has-dropdown" href="#"><span>支出管理</span><span class="mobile-arrow">▾</span></a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="applicationexpenses.html">申請 / 編輯活動、聯誼金</a></li>
            <li><a class="dropdown-item" href="reviewexpenses.html">活動、聯誼金審核作業</a></li>
            <li><a class="dropdown-item" href="remitexpenses.html">活動、聯誼金匯款作業</a></li>
            <li><a class="dropdown-item" href="inquireexpenses.html">活動、聯誼金支出查詢</a></li>
            <li class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="applicationgoods.html">申請 / 編輯聯誼物資</a></li>
            <li><a class="dropdown-item" href="goodsreceive.html">聯誼物資領取作業</a></li>
            <li><a class="dropdown-item" href="inquiregoods.html">聯誼物資支出查詢</a></li>
            <li class="dropdown-divider"></li>
            <li class="has-submenu">
              <a class="dropdown-item" href="#">報表 <span class="sub-arrow">▶</span></a>
              <ul class="submenu">
                <li><a class="dropdown-item" href="#">B01 和氣活動金支出報表</a></li>
                <li><a class="dropdown-item" href="#">B02 和氣聯誼金支出報表</a></li>
                <li><a class="dropdown-item" href="#">D02 和氣活動、聯誼金支出統計報表</a></li>
                <li><a class="dropdown-item" href="#">B03 合心活動支出報表</a></li>
                <li><a class="dropdown-item" href="#">B04 合心聯誼金支出報表</a></li>
                <li><a class="dropdown-item" href="#">D05 合心活動、聯誼金支出統計報表</a></li>
                <li class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#">C01 和氣賀區請領報表</a></li>
                <li><a class="dropdown-item" href="#">D03 和氣聯誼物資支出統計報表</a></li>
                <li><a class="dropdown-item" href="#">C02 合心賀區請領報表</a></li>
                <li><a class="dropdown-item" href="#">D06 合心聯誼物資支出統計報表</a></li>
              </ul>
            </li>
            <li class="has-submenu">
              <a class="dropdown-item" href="#">支出檔案下載 <span class="sub-arrow">▶</span></a>
              <ul class="submenu">
                <li><a class="dropdown-item" href="#">活動金請領單</a></li>
                <li><a class="dropdown-item" href="#">聯誼金請領單</a></li>
                <li><a class="dropdown-item" href="#">聯誼物品請領單</a></li>
              </ul>
            </li>
          </ul>
        </li>
        <li class="menu-node">
          <a class="menu-link has-dropdown" href="#"><span>庫存管理</span><span class="mobile-arrow">▾</span></a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="goodsmanage.html">物資庫存管理</a></li>
            <li><a class="dropdown-item" href="#">物資檔案下載</a></li>
          </ul>
        </li>
        <li class="menu-node">
          <a class="menu-link has-dropdown" href="#"><span>系統設定</span><span class="mobile-arrow">▾</span></a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="#">維護匯款銀行</a></li>
            <li><a class="dropdown-item" href="#">維護作業區</a></li>
            <li><a class="dropdown-item" href="#">維護人員</a></li>
            <li><a class="dropdown-item" href="#">維護作業區倉庫</a></li>
            <li><a class="dropdown-item" href="#">維護倉庫管理者</a></li>
            <li><a class="dropdown-item" href="#">維護物資安全庫存量</a></li>
          </ul>
        </li>
        <li class="menu-node">
          <a class="menu-link" href="#" onclick="alert('已執行登出')">登出</a>
        </li>
      </ul>
    </div>
    <div class="nav-right">
      版本號：1.0.4
    </div>
  </div>
</header>`;
  document.body.insertAdjacentHTML('afterbegin', headerHTML);

  // 漢堡選單切換
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const mainMenu = document.querySelector('.main-menu');
  if (mobileBtn && mainMenu) {
    mobileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      mainMenu.classList.toggle('active');
    });
  }

  // 主選單點擊：手機版手風琴模式（展開當前選單時，自動收合其他主選單）
  document.querySelectorAll('.menu-link').forEach(link => {
    link.addEventListener('click', (e) => {
      if (link.getAttribute('href') === '#') {
        e.preventDefault();
      }
      const parentNode = link.closest('.menu-node');
      const hasDropdown = parentNode && parentNode.querySelector('.dropdown-menu');
      if (hasDropdown && window.innerWidth <= 850) {
        e.stopPropagation();
        const willOpen = !parentNode.classList.contains('open');

        // 收合其他所有主選單及其內部已展開的次選單
        document.querySelectorAll('.main-menu > .menu-node').forEach(node => {
          if (node !== parentNode) {
            node.classList.remove('open');
            node.querySelectorAll('.has-submenu.open').forEach(sub => sub.classList.remove('open'));
          }
        });

        parentNode.classList.toggle('open', willOpen);

        // 若上方選單收合導致捲動位置偏移，確保目前展開的選單維持在可視範圍頂部
        if (willOpen && mainMenu && parentNode.offsetTop < mainMenu.scrollTop) {
          mainMenu.scrollTop = parentNode.offsetTop;
        }
      }
    });
  });

  // 次選單點擊：手機版支援點擊展開/收合第三層選單（同層級互斥自動收合）
  document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (item.getAttribute('href') === '#') {
        e.preventDefault();
      }
      const parentSub = item.closest('.has-submenu');
      if (parentSub && parentSub.querySelector('.submenu') && window.innerWidth <= 850) {
        e.stopPropagation();
        const willOpen = !parentSub.classList.contains('open');
        const siblingDropdown = parentSub.closest('.dropdown-menu');
        if (siblingDropdown) {
          siblingDropdown.querySelectorAll('.has-submenu').forEach(sub => {
            if (sub !== parentSub) {
              sub.classList.remove('open');
            }
          });
        }
        parentSub.classList.toggle('open', willOpen);
      }
    });
  });

  // 點擊選單外部時關閉手機版漢堡選單
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 850 && mainMenu && mainMenu.classList.contains('active')) {
      if (!e.target.closest('.top-navbar')) {
        mainMenu.classList.remove('active');
      }
    }
  });

  // 全站通用：所有可編輯文字／搜尋輸入框自動清除前後空白（含半形、全形空格與零寬字元）
  const isTrimmableTextField = (el) => {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      return t === 'text' || t === 'search';
    }
    return false;
  };
  const cleanTrimGlobal = (str) => String(str || '').replace(/^[\s\u3000\u00A0\u200B-\u200D\uFEFF]+|[\s\u3000\u00A0\u200B-\u200D\uFEFF]+$/g, '');
  const stripLeadingGlobal = (str) => String(str || '').replace(/^[\s\u3000\u00A0\u200B-\u200D\uFEFF]+/, '');
  window.CTA = Object.assign(window.CTA || {}, {
    cleanTrim: cleanTrimGlobal,
    money: (n) => Number(n || 0).toLocaleString('zh-TW')
  });

  document.addEventListener('paste', (e) => {
    const el = e.target;
    if (!isTrimmableTextField(el)) return;
    setTimeout(() => {
      const trimmed = cleanTrimGlobal(el.value);
      if (el.value !== trimmed) {
        el.value = trimmed;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 0);
  }, true);

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!isTrimmableTextField(el)) return;
    const stripped = stripLeadingGlobal(el.value);
    if (el.value !== stripped) {
      el.value = stripped;
    }
  }, true);

  ['focusout', 'change'].forEach((evtName) => {
    document.addEventListener(evtName, (e) => {
      const el = e.target;
      if (!isTrimmableTextField(el)) return;
      const trimmed = cleanTrimGlobal(el.value);
      if (el.value !== trimmed) {
        el.value = trimmed;
      }
    }, true);
  });
});
