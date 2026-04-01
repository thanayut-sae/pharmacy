// ================================================================
//  CONFIG
// ================================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMOHEKSdL47F-b_fy514eWwgisCFLDQs9Gss2_inZE6-MKjg0PsOdBKZtjUGrulqM2/exec';

// ================================================================
//  STATE
// ================================================================
let masterData = [];
let employeeData = [];
let similarDrugCount = 0;
let isSubmitVisible = false;
let isSubmitting = false;
const CACHE_KEY = 'diffChecklist_initData';
const CACHE_TTL = 60 * 60 * 1000;
const FORM_STATE_KEY = 'diffChecklist_formState';
const FONT_KEY = 'diffChecklist_fontSize';
const MAIN_CHECKS = ['check_recount', 'check_pending_prep', 'check_change_counter', 'check_expire', 'check_damaged', 'check_pending_req', 'check_qi', 'check_mrp'];

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  restoreFontSize();
  setDefaultDate();

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  await loadSheetData();
  restoreFormState();
  initProgressBar();
  initAutoSave();
  // Q2 change → update Q11 visibility
  document.getElementById('q2-room').addEventListener('change', updateQ11Visibility);
  updateQ11Visibility();
  updateSubmitState();
  initImageUploader();

  // Floating Go-To-Top Button Logic
  const fab = document.getElementById('btn-go-top');
  if (fab) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) fab.classList.add('visible');
      else fab.classList.remove('visible');
    });
    fab.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Observe main submit button to toggle floating button
  const submitWrap = document.querySelector('.submit-wrap');
  if (submitWrap) {
    const observer = new IntersectionObserver((entries) => {
      isSubmitVisible = entries[0].isIntersecting;
      updateSubmitState();
    }, { root: null, rootMargin: '0px', threshold: 0.1 });
    observer.observe(submitWrap);
  }
});

function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (navigator.onLine) {
    if (banner) banner.classList.remove('visible');
  } else {
    if (banner) banner.classList.add('visible');
  }
  updateSubmitState();
}

function setDefaultDate() {
  const el = document.getElementById('q1-date');
  if (!el.value) {
    const t = new Date();
    el.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
}

// ================================================================
//  DATA LOADING (with cache)
// ================================================================
async function loadSheetData() {
  showLoading(['load-pharmacist', 'load-assistant']);
  try {
    const cached = loadFromCache();
    if (cached) {
      masterData = cached.master || [];
      employeeData = cached.employees || [];
      initUI();
      hideLoading(['load-pharmacist', 'load-assistant']);
      refreshCacheInBackground();
      return;
    }
    const data = await fetchFromGAS();
    masterData = data.master || [];
    employeeData = data.employees || [];
    saveToCache(data);
    initUI();
  } catch (e) {
    showToast('❌ โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรช', 'error');
    console.error('GAS Error:', e);
  } finally {
    hideLoading(['load-pharmacist', 'load-assistant']);
  }
}
function loadFromCache() {
  try { const r = localStorage.getItem(CACHE_KEY); if (!r) return null; const { ts, data } = JSON.parse(r); return Date.now() - ts > CACHE_TTL ? null : data; } catch { return null; }
}
function saveToCache(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { } }
async function fetchFromGAS() {
  const res = await fetch(`${GAS_URL}?action=getInitData`, { method: 'GET', credentials: 'omit', cache: 'no-cache', redirect: 'follow' });
  return res.json();
}
async function refreshCacheInBackground() {
  try { const data = await fetchFromGAS(); saveToCache(data); masterData = data.master || []; employeeData = data.employees || []; } catch { }
}
function showLoading(ids) { ids.forEach(id => document.getElementById(id)?.classList.add('visible')); }
function hideLoading(ids) { ids.forEach(id => document.getElementById(id)?.classList.remove('visible')); }

// ================================================================
//  UI INIT
// ================================================================
function initUI() {
  initEmployeeSearch('q3', 'เภสัชกร', document.getElementById('q3-pharmacist-search'), document.getElementById('q3-pharmacist'));
  initEmployeeSearch('q4', 'ผู้ช่วยเภสัชกร', document.getElementById('q4-assistant-search'), document.getElementById('q4-assistant'));
  initEmployeeSearch('q9', null, document.getElementById('q9-3-counter-search'), document.getElementById('q9-3-counter'));
  document.getElementById('q3-pharmacist-search').placeholder = 'พิมพ์ชื่อเภสัชกร...';
  document.getElementById('q4-assistant-search').placeholder = 'พิมพ์ชื่อผู้ช่วยเภสัชกร...';
  initDrugSearchable();
  // Q6 material reverse lookup
  document.getElementById('q6-material').addEventListener('change', function () {
    const mat = this.value.trim(); if (!mat) return;
    const found = masterData.find(d => d.material === mat); if (found) selectDrug(found);
  });
  
  initDiffSteppers();
}

// ================================================================
//  DIFF STEPPER BUTTONS (+/-)
// ================================================================
function initDiffSteppers() {
  const diffInputs = document.querySelectorAll('input[type="number"][name*="diff"], input[type="number"][id*="diff"]');
  diffInputs.forEach(input => {
    if(input.parentElement.classList.contains('diff-stepper-wrap')) {
      updateDiffButtons(input);
      return;
    }

    input.type = "text";
    input.inputMode = "numeric";
    
    const wrap = document.createElement('div');
    wrap.className = 'diff-stepper-wrap';
    input.parentNode.insertBefore(wrap, input);
    
    const btnMinus = document.createElement('button');
    btnMinus.type = 'button';
    btnMinus.className = 'btn-step btn-step-minus';
    btnMinus.textContent = '−';
    btnMinus.tabIndex = -1;
    btnMinus.onclick = () => toggleDiffSign(input, -1);
    
    const btnPlus = document.createElement('button');
    btnPlus.type = 'button';
    btnPlus.className = 'btn-step btn-step-plus';
    btnPlus.textContent = '+';
    btnPlus.tabIndex = -1;
    btnPlus.onclick = () => toggleDiffSign(input, 1);
    
    wrap.appendChild(btnPlus);
    wrap.appendChild(btnMinus);
    wrap.appendChild(input);
    
    input.addEventListener('input', function() {
       this.value = this.value.replace(/[^-\d]/g, '');
       styleDiffInput(this);
       saveFormState();
       updateDiffButtons(this);
    });
    
    updateDiffButtons(input);
  });
}

function toggleDiffSign(input, sign) {
  let val = parseInt(input.value.replace(/[^\d-]/g, ''), 10);
  if (isNaN(val) || val === 0) return;
  
  if (sign === 1 && val < 0) {
    val = Math.abs(val);
  } else if (sign === -1 && val > 0) {
    val = -Math.abs(val);
  }
  
  input.value = val > 0 ? `+${val}` : val;
  styleDiffInput(input);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  updateDiffButtons(input);
}

function updateDiffButtons(input) {
  const wrap = input.parentElement;
  if (!wrap || !wrap.classList.contains('diff-stepper-wrap')) return;
  const btnMinus = wrap.querySelector('.btn-step-minus');
  const btnPlus = wrap.querySelector('.btn-step-plus');
  
  let val = parseInt(input.value.replace(/[^\d-]/g, ''), 10);
  if (isNaN(val) || val === 0) {
    btnMinus.disabled = true;
    btnPlus.disabled = true;
  } else {
    btnMinus.disabled = false;
    btnPlus.disabled = false;
  }
}

// ================================================================
//  SEARCHABLE EMPLOYEE DROPDOWN
// ================================================================
let empSearchTimeout = {};
function initEmployeeSearch(prefix, roleFilter, inputEl, hiddenEl) {
  const dropdown = document.getElementById(`${prefix}-dropdown`);
  const getList = () => roleFilter ? employeeData.filter(e => e.role === roleFilter) : employeeData;
  const isEmpDropdown = prefix !== 'q5';

  inputEl.addEventListener('input', () => {
    clearTimeout(empSearchTimeout[prefix]);
    empSearchTimeout[prefix] = setTimeout(() => {
      const q = inputEl.value.trim().toLowerCase();
      const list = getList();
      const matches = q ? list.filter(e => e.name.toLowerCase().includes(q)).slice(0, 40) : list.slice(0, 40);
      renderDropdown(dropdown, matches.map(e => e.name), name => {
        if (name === '__other__') {
          inputEl.value = ''; hiddenEl.value = '__other__';
          inputEl.placeholder = 'ระบุชื่อพนักงานด้วยตนเอง...';
          inputEl.dataset.otherMode = '1';
        } else {
          inputEl.value = name; hiddenEl.value = name;
          inputEl.dataset.otherMode = '';
        }
        dropdown.classList.remove('open');
        setToggleBtnState(prefix, false);
        saveFormState();
      }, isEmpDropdown ? { addOther: true } : undefined);
      dropdown.classList.add('open');
      setToggleBtnState(prefix, true);
    }, 150);
  });

  // When in other mode, sync typed text to hidden value
  inputEl.addEventListener('change', () => {
    if (inputEl.dataset.otherMode === '1') {
      hiddenEl.value = inputEl.value.trim() || '__other__';
    }
  });

  inputEl.addEventListener('blur', () => setTimeout(() => {
    dropdown.classList.remove('open'); setToggleBtnState(prefix, false);
    // Sync other mode value on blur
    if (inputEl.dataset.otherMode === '1' && inputEl.value.trim()) {
      hiddenEl.value = inputEl.value.trim();
    }
  }, 200));
  inputEl.addEventListener('focus', () => { inputEl.dispatchEvent(new Event('input')); });
}

function toggleDropdownAll(prefix) {
  const dropdown = document.getElementById(`${prefix}-dropdown`);
  const isOpen = dropdown.classList.contains('open');
  if (isOpen) { dropdown.classList.remove('open'); setToggleBtnState(prefix, false); return; }

  let list = [];
  const map = { q3: 'เภสัชกร', q4: 'ผู้ช่วยเภสัชกร', q9: null, q5: null };
  const inputMap = { q3: 'q3-pharmacist-search', q4: 'q4-assistant-search', q9: 'q9-3-counter-search', q5: 'q5-drug-search' };
  const hiddenMap = { q3: 'q3-pharmacist', q4: 'q4-assistant', q9: 'q9-3-counter', q5: 'q5-drug-val' };

  if (prefix === 'q5') {
    list = masterData.slice(0, 60).map(d => d.drug);
  } else {
    const role = map[prefix];
    list = (role ? employeeData.filter(e => e.role === role) : employeeData).map(e => e.name);
  }

  const inputEl = document.getElementById(inputMap[prefix]);
  const hiddenEl = document.getElementById(hiddenMap[prefix]);
  const isEmpDropdown = prefix !== 'q5';

  renderDropdown(dropdown, list, val => {
    if (val === '__other__') {
      inputEl.value = ''; hiddenEl.value = '__other__';
      inputEl.placeholder = 'ระบุชื่อด้วยตนเอง...';
      inputEl.dataset.otherMode = '1';
    } else {
      inputEl.value = val; hiddenEl.value = val;
      inputEl.dataset.otherMode = '';
      if (prefix === 'q5') { const d = masterData.find(x => x.drug === val); if (d) selectDrug(d); }
    }
    dropdown.classList.remove('open');
    setToggleBtnState(prefix, false);
    saveFormState();
  }, isEmpDropdown ? { addOther: true } : undefined);
  dropdown.classList.add('open');
  setToggleBtnState(prefix, true);
  inputEl.focus();
}

function setToggleBtnState(prefix, open) {
  const wrap = document.getElementById(`${prefix}-dropdown`)?.closest('.search-select-wrap');
  if (!wrap) return;
  const btn = wrap.querySelector('.toggle-btn');
  if (btn) btn.classList.toggle('open', open);
}

function renderDropdown(dropdown, items, onSelect, opts) {
  dropdown.innerHTML = '';
  if (!items.length) { dropdown.innerHTML = '<div class="dropdown-item no-result">ไม่พบรายการ</div>'; return; }
  const frag = document.createDocumentFragment();
  items.forEach(label => {
    const item = document.createElement('div'); item.className = 'dropdown-item'; item.textContent = label;
    item.addEventListener('mousedown', e => { e.preventDefault(); onSelect(label); });
    frag.appendChild(item);
  });
  // Add "อื่นๆ" for employee dropdowns
  if (opts && opts.addOther) {
    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px dashed var(--border); margin:4px 0;';
    frag.appendChild(sep);
    const otherItem = document.createElement('div');
    otherItem.className = 'dropdown-item other-option';
    otherItem.textContent = '✏️ ไม่พบในระบบ (ระบุชื่อเอง)';
    otherItem.style.color = 'var(--text3)';
    otherItem.addEventListener('mousedown', e => { e.preventDefault(); onSelect('__other__'); });
    frag.appendChild(otherItem);
  }
  dropdown.appendChild(frag);
}

function clearEmpSearch(prefix) {
  const map = { q3: ['q3-pharmacist-search', 'q3-pharmacist', 'พิมพ์ชื่อเภสัชกร...'], q4: ['q4-assistant-search', 'q4-assistant', 'พิมพ์ชื่อผู้ช่วยเภสัชกร...'], q9: ['q9-3-counter-search', 'q9-3-counter', 'พิมพ์ชื่อ...'] };
  const [sId, hId, ph] = map[prefix] || [];
  if (sId) { const el = document.getElementById(sId); el.value = ''; el.dataset.otherMode = ''; el.placeholder = ph || 'พิมพ์ชื่อ...'; }
  if (hId) document.getElementById(hId).value = '';
  saveFormState();
}

// ================================================================
//  DRUG SEARCH (Q5)
// ================================================================
let drugSearchTimeout;
function initDrugSearchable() {
  const input = document.getElementById('q5-drug-search');
  const dropdown = document.getElementById('q5-dropdown');
  input.addEventListener('input', () => {
    clearTimeout(drugSearchTimeout);
    drugSearchTimeout = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      const matches = q ? masterData.filter(d => d.drug.toLowerCase().includes(q)).slice(0, 50) : masterData.slice(0, 50);
      dropdown.innerHTML = '';
      if (!matches.length) { dropdown.innerHTML = '<div class="dropdown-item no-result">ไม่พบรายการ</div>'; }
      else {
        const frag = document.createDocumentFragment();
        matches.forEach(d => {
          const item = document.createElement('div'); item.className = 'dropdown-item'; item.textContent = d.drug;
          item.addEventListener('mousedown', e => { e.preventDefault(); selectDrug(d); });
          frag.appendChild(item);
        });
        dropdown.appendChild(frag);
      }
      dropdown.classList.add('open');
    }, 150); // Debounce
  });
  input.addEventListener('blur', () => setTimeout(() => { dropdown.classList.remove('open'); setToggleBtnState('q5', false); }, 200));
  input.addEventListener('focus', () => { input.dispatchEvent(new Event('input')); });
}

function selectDrug(d) {
  document.getElementById('q5-drug-search').value = d.drug;
  document.getElementById('q5-drug-val').value = d.drug;
  document.getElementById('q6-material').value = d.material || '';
  const q7el = document.getElementById('q7-diff-old');
  q7el.value = (d.diffOld !== undefined && d.diffOld !== '') ? d.diffOld : '';
  styleDiffInput(q7el);
  // Clear Q8 (Diff ใหม่) — เปลี่ยนตัวยาแล้วค่าเดิมไม่เกี่ยว
  const q8el = document.getElementById('q8-diff-new');
  q8el.value = ''; styleDiffInput(q8el);
  const label = document.getElementById('drug-name-label');
  if (label) label.textContent = d.drug;
  const info = document.getElementById('selected-drug-info');
  if (info) info.style.display = 'block';
  document.getElementById('q5-dropdown').classList.remove('open');
  saveFormState();

  // Feature: Smart Auto-Scroll to Q8 (Diff ใหม่)
  setTimeout(() => {
    const nextSection = document.getElementById('fg-q8');
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('q8-diff-new')?.focus();
    }
  }, 250);
}

function clearDrugSearch() {
  document.getElementById('q5-drug-search').value = '';
  document.getElementById('q5-drug-val').value = '';
  document.getElementById('q6-material').value = '';
  const q7 = document.getElementById('q7-diff-old');
  q7.value = ''; styleDiffInput(q7);
  const q8 = document.getElementById('q8-diff-new');
  q8.value = ''; styleDiffInput(q8);
  const label = document.getElementById('drug-name-label');
  if (label) label.textContent = '___';
  const info = document.getElementById('selected-drug-info');
  if (info) info.style.display = 'none';
  saveFormState();
}

// ================================================================
//  DIFF COLOR CODING
// ================================================================
function styleDiffInput(input) {
  const val = parseFloat(input.value);
  input.classList.remove('diff-negative', 'diff-positive', 'diff-zero');
  // Find hint span
  let hint = input.nextElementSibling;
  if (!hint || !hint.classList.contains('diff-hint')) hint = null;

  if (isNaN(val) || input.value.trim() === '') {
    if (hint) { hint.textContent = ''; hint.className = 'diff-hint'; }
    return;
  }
  // Apply color only (no text)
  if (val < 0) input.classList.add('diff-negative');
  else if (val > 0) input.classList.add('diff-positive');
  else input.classList.add('diff-zero');
  // Clear hint text for non-comparison fields
  if (hint) { hint.textContent = ''; hint.className = 'diff-hint'; }

  // If this is Q7 or Q8, trigger comparison
  if (input.id === 'q7-diff-old' || input.id === 'q8-diff-new') {
    styleDiffComparison();
  }
}

function styleDiffComparison() {
  const q7 = parseFloat(document.getElementById('q7-diff-old').value);
  const q8 = parseFloat(document.getElementById('q8-diff-new').value);
  const hint = document.getElementById('hint-q8');
  if (!hint) return;

  if (isNaN(q7) || isNaN(q8)) {
    hint.textContent = ''; hint.className = 'diff-hint';
    return;
  }
  const delta = q8 - q7; // positive = เกินขึ้น, negative = ขาดลง
  if (delta > 0) {
    hint.textContent = '▲ ของเกินขึ้นจากเดิม';
    hint.className = 'diff-hint positive';
  } else if (delta < 0) {
    hint.textContent = '▼ ของขาดลงจากเดิม';
    hint.className = 'diff-hint negative';
  } else {
    hint.textContent = '● ยอดตรงกับเดิม';
    hint.className = 'diff-hint zero';
  }
}

// ================================================================
//  CHECKLIST
// ================================================================
function toggleCheck(chk) {
  const item = chk.closest('.check-item');
  item.classList.toggle('checked', chk.checked);
  updateSelectAllBtn();
  updateChecklistProgress();
  saveFormState();
}

function toggleSelectAll() {
  const allChecked = MAIN_CHECKS.every(n => document.querySelector(`[name="${n}"]`).checked);
  MAIN_CHECKS.forEach(n => { const c = document.querySelector(`[name="${n}"]`); c.checked = !allChecked; toggleCheck(c); if (n === 'check_change_counter') toggleChangeCounter(); });
  updateSelectAllBtn(); updateChecklistProgress(); saveFormState();
}

function updateSelectAllBtn() {
  const all = MAIN_CHECKS.every(n => document.querySelector(`[name="${n}"]`).checked);
  const btn = document.getElementById('btn-select-all');
  const boxSvg = '<svg class="sa-icon" viewBox="0 0 16 16" width="14" height="14"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  const checkPath = '<path class="sa-check" d="M4 8l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  btn.innerHTML = all
    ? `${boxSvg}</svg> ยกเลิกทั้งหมด`
    : `${boxSvg}${checkPath}</svg> เลือกทั้งหมด`;
}

function updateChecklistProgress() {
  const done = MAIN_CHECKS.filter(n => document.querySelector(`[name="${n}"]`).checked).length;
  const total = MAIN_CHECKS.length;
  const pct = Math.round((done / total) * 100);
  const fill = document.getElementById('checklist-progress-fill');
  const text = document.getElementById('checklist-progress-text');
  if (fill) fill.style.transform = `scaleX(${pct / 100})`;
  if (text) {
    text.textContent = `${done} / ${total} รายการ`;
    text.style.color = done === total ? 'var(--success)' : 'var(--accent-dark)';
  }
}

function toggleChangeCounter() {
  document.getElementById('sub-change-counter').classList.toggle('visible', document.getElementById('chk-9-3').checked);
}
function toggleOtherNote() {
  document.getElementById('sub-other-note').classList.toggle('visible', document.getElementById('chk-9-9').checked);
}

// ================================================================
//  Q10 LOGIC
// ================================================================
function handleQ10Change(clickedEl) {
  const ms = document.getElementById('opt-multi-strength');
  const sl = document.getElementById('opt-similar-look');
  const no = document.getElementById('opt-none');
  
  if (clickedEl && (clickedEl.id === 'opt-multi-strength' || clickedEl.id === 'opt-similar-look') && clickedEl.checked) {
    no.checked = false;
  }
  if (clickedEl && clickedEl.id === 'opt-none' && clickedEl.checked) {
    ms.checked = false;
    sl.checked = false;
  }

  ['ri-multi-strength', 'ri-similar-look', 'ri-none'].forEach(id => {
    const ri = document.getElementById(id); ri.classList.toggle('selected', ri.querySelector('input').checked);
  });
  
  const showSim = ms.checked || sl.checked;
  document.getElementById('similar-drugs-area').classList.toggle('visible', showSim);
  if (!showSim) { document.getElementById('similar-drug-list').innerHTML = ''; similarDrugCount = 0; }
  else if (!document.getElementById('similar-drug-list').children.length) addSimilarDrug();
  // Clear error
  const err = document.getElementById('q10-error-msg'); if (err) err.style.display = 'none';
  saveFormState();
}

// ================================================================
//  Q11: CROSS-ROOM VERIFICATION
// ================================================================
const Q11_ROOMS = [
  { key: 'er', room: 'ER', subId: 'sub-q11-er', diffId: 'q11-diff-er', ciId: 'ci-q11-er', chkName: 'q11_er' },
  { key: 'f2', room: 'ชั้น 2', subId: 'sub-q11-f2', diffId: 'q11-diff-f2', ciId: 'ci-q11-f2', chkName: 'q11_f2' },
  { key: 'f3', room: 'ชั้น 3', subId: 'sub-q11-f3', diffId: 'q11-diff-f3', ciId: 'ci-q11-f3', chkName: 'q11_f3' },
  { key: 'f4', room: 'ชั้น 4', subId: 'sub-q11-f4', diffId: 'q11-diff-f4', ciId: 'ci-q11-f4', chkName: 'q11_f4' },
  { key: 'stock', room: 'คลังยา', subId: 'sub-q11-stock', diffId: 'q11-diff-stock', ciId: 'ci-q11-stock', chkName: 'q11_stock' },
];

function updateQ11Visibility() {
  const selectedRoom = document.getElementById('q2-room').value;
  Q11_ROOMS.forEach(r => {
    const el = document.getElementById(r.ciId);
    if (r.room === selectedRoom) {
      el.style.display = 'none';
      // Uncheck & hide sub-field if hidden
      const chk = document.querySelector(`[name="${r.chkName}"]`);
      if (chk) { chk.checked = false; el.classList.remove('checked'); }
      const sub = document.getElementById(r.subId);
      if (sub) sub.classList.remove('visible');
    } else {
      el.style.display = '';
    }
  });
}

function toggleQ11Room(chk, room) {
  const item = chk.closest('.check-item');
  item.classList.toggle('checked', chk.checked);
  const cfg = Q11_ROOMS.find(r => r.room === room);
  if (cfg) {
    document.getElementById(cfg.subId).classList.toggle('visible', chk.checked);
  }
  // If checking a non-stock room, uncheck "none"
  if (chk.checked && room !== 'คลังยา') {
    const noneChk = document.getElementById('chk-q11-none');
    if (noneChk) { noneChk.checked = false; noneChk.closest('.check-item').classList.remove('checked'); }
  }
  saveFormState();
}

function toggleQ11None(chk) {
  chk.closest('.check-item').classList.toggle('checked', chk.checked);
  if (chk.checked) {
    // Uncheck all rooms EXCEPT คลังยา
    Q11_ROOMS.forEach(r => {
      if (r.key === 'stock') return; // skip คลังยา
      const c = document.querySelector(`[name="${r.chkName}"]`);
      if (c) { c.checked = false; c.closest('.check-item').classList.remove('checked'); }
      const sub = document.getElementById(r.subId);
      if (sub) sub.classList.remove('visible');
    });
  }
  saveFormState();
}

function toggleF4Help(chk) {
  const diffWrap = document.getElementById('f4-diff-wrap');
  if (diffWrap) {
    diffWrap.style.display = chk.checked ? 'none' : '';
    if (chk.checked) {
      const diffInput = document.getElementById('q11-diff-f4');
      if (diffInput) { diffInput.value = ''; styleDiffInput(diffInput); }
    }
  }
  saveFormState();
}
// ================================================================
//  Q12: SUSPECT CASES
// ================================================================
let suspectCaseCount = 0;

function handleQ12Change() {
  const hasCase = document.getElementById('chk-has-case').checked;
  const noCase = document.getElementById('chk-no-case').checked;
  document.getElementById('ri-has-case').classList.toggle('selected', hasCase);
  document.getElementById('ri-no-case').classList.toggle('selected', noCase);
  document.getElementById('suspect-cases-area').classList.toggle('visible', hasCase);
  if (hasCase && !document.getElementById('suspect-case-list').children.length) {
    addSuspectCase();
  }
  if (noCase) {
    document.getElementById('suspect-case-list').innerHTML = '';
    suspectCaseCount = 0;
  }
  saveFormState();
}

function addSuspectCase() {
  suspectCaseCount++;
  const id = suspectCaseCount;
  const entry = document.createElement('div');
  entry.className = 'similar-drug-entry suspect-case-entry';
  entry.id = `suspect-entry-${id}`;

  // Build name option lists
  const assistants = employeeData.filter(e => e.role === 'ผู้ช่วยเภสัชกร').map(e => e.name);
  const pharmacists = employeeData.filter(e => e.role === 'เภสัชกร').map(e => e.name);
  const makeOptions = (list) => `<option value="">-- เลือก --</option>` + list.map(n => `<option value="${n}">${n}</option>`).join('') + `<option value="__other__">ระบุชื่อด้วยตนเอง (Manual)</option>`;

  entry.innerHTML = `
    <div class="suspect-case-header">เคสที่ ${id}
      ${id > 1 ? `<button type="button" class="remove-btn" onclick="removeSuspectCase(${id})">\u2715</button>` : ''}
    </div>
    <div class="suspect-case-fields">
      <div class="field-row">
        <div class="field-group"><label>วันที่ <span class="req">*</span></label><input type="date" id="sc-date-${id}" /></div>
        <div class="field-group"><label>HN <span style="color:var(--text3);font-weight:400;">(7 หลัก)</span> <span class="req">*</span></label><input type="text" id="sc-hn-${id}" maxlength="7" pattern="[0-9]{7}" inputmode="numeric" placeholder="เช่น 2412405" oninput="this.value=this.value.replace(/[^0-9]/g,'')" /></div>
      </div>
      <div class="field-row">
        <div class="field-group"><label>จำนวน <span class="req">*</span></label><input type="number" id="sc-qty-${id}" placeholder="เช่น 20" step="any" min="0" onchange="if(this.value && Number(this.value) <= 0) { this.value = ''; }" autocomplete="off" /></div>
        <div class="field-group"><label>ผู้จัดยา</label>
          <select id="sc-prep-${id}" onchange="handleScOther(this,'sc-prep-other-${id}')">${makeOptions(assistants)}</select>
          <input type="text" id="sc-prep-other-${id}" class="sc-other-input" style="display:none;margin-top:6px;" placeholder="ระบุชื่อพนักงานด้วยตนเอง..." />
        </div>
      </div>
      <div class="field-row">
        <div class="field-group"><label>ผู้เช็ค</label>
          <select id="sc-chk-${id}" onchange="handleScOther(this,'sc-chk-other-${id}')">${makeOptions(pharmacists)}</select>
          <input type="text" id="sc-chk-other-${id}" class="sc-other-input" style="display:none;margin-top:6px;" placeholder="ระบุชื่อพนักงานด้วยตนเอง..." />
        </div>
        <div class="field-group"><label>ผู้จ่าย</label>
          <select id="sc-disp-${id}" onchange="handleScOther(this,'sc-disp-other-${id}')">${makeOptions(pharmacists)}</select>
          <input type="text" id="sc-disp-other-${id}" class="sc-other-input" style="display:none;margin-top:6px;" placeholder="ระบุชื่อพนักงานด้วยตนเอง..." />
        </div>
      </div>
      <div class="field-group" style="margin-top:12px;">
        <label>หมายเหตุเคสที่ ${id} <span style="font-weight:400; color:var(--text3);">(ถ้ามี)</span></label>
        <textarea id="sc-remark-${id}" placeholder="ระบุข้อมูลเพิ่มเติมเกี่ยวกับเคสนี้..." rows="2" style="min-height:50px;"></textarea>
      </div>
    </div>
  `;
  document.getElementById('suspect-case-list').appendChild(entry);
  saveFormState();
}

function handleScOther(sel, otherId) {
  const otherInput = document.getElementById(otherId);
  if (sel.value === '__other__') {
    otherInput.style.display = 'block';
    otherInput.focus();
  } else {
    otherInput.style.display = 'none';
    otherInput.value = '';
  }
  saveFormState();
}

function getScValue(selectId, otherId) {
  const sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === '__other__') return document.getElementById(otherId)?.value || '';
  return sel.value;
}

function removeSuspectCase(id) {
  document.getElementById(`suspect-entry-${id}`)?.remove();
  saveFormState();
}

// ================================================================
//  SIMILAR DRUGS
// ================================================================
function addSimilarDrug() {
  similarDrugCount++;
  const id = similarDrugCount;
  const entry = document.createElement('div');
  entry.className = 'similar-drug-entry'; entry.id = `similar-entry-${id}`;
  entry.innerHTML = `
    <div class="search-select-wrap" style="position:relative;">
      <input type="text" id="sim-drug-search-${id}" class="search-input" placeholder="ค้นหาชื่อยา..." autocomplete="off" data-entry="${id}" />
      <div class="input-actions">
        <button type="button" class="toggle-btn" onmousedown="event.preventDefault(); toggleSimDropdown(${id})" title="แสดงรายการ"><svg width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 5 5-5" fill="currentColor"/></svg></button>
      </div>
      <div class="dropdown-list" id="sim-dropdown-${id}"></div>
    </div>
    <input type="hidden" id="sim-drug-val-${id}" name="similar_drug_${id}" />
    <div class="diff-group"><span>Diff:</span><input type="number" id="sim-diff-${id}" name="similar_diff_${id}" placeholder="±0" step="any"/></div>
    <button type="button" class="remove-btn" onclick="removeSimilarDrug(${id})">✕</button>`;
  document.getElementById('similar-drug-list').appendChild(entry);
  initSimilarDrugSearch(id);
  initDiffSteppers();
}

function removeSimilarDrug(id) { document.getElementById(`similar-entry-${id}`)?.remove(); saveFormState(); }

function getSelectedSimilarDrugs(excludeId) {
  const selected = new Set();
  // Include main drug from Q5
  const mainDrug = document.getElementById('q5-drug-val')?.value;
  if (mainDrug) selected.add(mainDrug);
  // Include all other similar drug entries
  document.querySelectorAll('#similar-drug-list .similar-drug-entry').forEach(entry => {
    const m = entry.id.match(/\d+/); if (!m) return;
    if (String(m[0]) === String(excludeId)) return; // skip self
    const val = document.getElementById(`sim-drug-val-${m[0]}`)?.value;
    if (val) selected.add(val);
  });
  return selected;
}

let simDrugSearchTimeout = {};
function initSimilarDrugSearch(id) {
  const input = document.getElementById(`sim-drug-search-${id}`);
  const dropdown = document.getElementById(`sim-dropdown-${id}`);
  input.addEventListener('input', () => {
    clearTimeout(simDrugSearchTimeout[id]);
    simDrugSearchTimeout[id] = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      const used = getSelectedSimilarDrugs(id);
      const filtered = masterData.filter(d => !used.has(d.drug));
      const matches = q ? filtered.filter(d => d.drug.toLowerCase().includes(q)).slice(0, 40) : filtered.slice(0, 40);
      dropdown.innerHTML = '';
      if (!matches.length) { dropdown.innerHTML = '<div class="dropdown-item no-result">ไม่พบรายการ</div>'; }
      else {
        const frag = document.createDocumentFragment();
        matches.forEach(d => {
          const item = document.createElement('div'); item.className = 'dropdown-item'; item.textContent = d.drug;
          item.addEventListener('mousedown', e => { e.preventDefault(); input.value = d.drug; document.getElementById(`sim-drug-val-${id}`).value = d.drug; dropdown.classList.remove('open'); saveFormState(); });
          frag.appendChild(item);
        });
        dropdown.appendChild(frag);
      }
      dropdown.classList.add('open');
    }, 150); // Debounce
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 200));
  input.addEventListener('focus', () => { input.dispatchEvent(new Event('input')); });
}

function toggleSimDropdown(id) {
  const dropdown = document.getElementById(`sim-dropdown-${id}`);
  const input = document.getElementById(`sim-drug-search-${id}`);
  if (dropdown.classList.contains('open')) { dropdown.classList.remove('open'); return; }
  const used = getSelectedSimilarDrugs(id);
  const list = masterData.filter(d => !used.has(d.drug)).slice(0, 60);
  dropdown.innerHTML = '';
  list.forEach(d => {
    const item = document.createElement('div'); item.className = 'dropdown-item'; item.textContent = d.drug;
    item.addEventListener('mousedown', e => { e.preventDefault(); input.value = d.drug; document.getElementById(`sim-drug-val-${id}`).value = d.drug; dropdown.classList.remove('open'); saveFormState(); });
    dropdown.appendChild(item);
  });
  dropdown.classList.add('open');
  input.focus();
}

// ================================================================
//  PROGRESS BAR
// ================================================================
function initProgressBar() {
  const form = document.getElementById('main-form');
  form.addEventListener('change', updateProgress);
  form.addEventListener('input', updateProgress);
  updateProgress();
}
function getProgressStats() {
  const req = ['q1-date', 'q2-room', 'q3-pharmacist', 'q4-assistant', 'q5-drug-val', 'q8-diff-new'];
  let filled = req.filter(id => { const el = document.getElementById(id); return el && el.value && el.value.trim() !== ''; }).length;
  let total = req.length + 3; // +3 for Checklist, Q10, Q11

  const allChecked = MAIN_CHECKS.every(n => document.querySelector(`[name="${n}"]`).checked);
  if (allChecked) filled++;

  const selectedQ10 = Array.from(document.querySelectorAll('[name="q10"]:checked')).map(c => c.value);
  let q10Filled = selectedQ10.length > 0;
  if (q10Filled && (selectedQ10.includes('multi_strength') || selectedQ10.includes('similar_look'))) {
    // Require at least one valid similar drug entry
    const entries = document.querySelectorAll('#similar-drug-list .similar-drug-entry');
    const hasValid = Array.from(entries).some(e => {
      const m = e.id.match(/\d+/); if (!m) return false;
      const drug = document.getElementById(`sim-drug-val-${m[0]}`)?.value;
      const diff = document.getElementById(`sim-diff-${m[0]}`)?.value;
      return drug && diff !== '';
    });
    if (!hasValid) q10Filled = false;
  }
  if (q10Filled) filled++;

  let q11Filled = false;
  const noneChk = document.getElementById('chk-q11-none');
  if (noneChk && noneChk.checked) {
    q11Filled = true;
  } else {
    const checkedRooms = Q11_ROOMS.filter(r => document.querySelector(`[name="${r.chkName}"]`)?.checked);
    if (checkedRooms.length > 0) {
      const allAnswered = checkedRooms.every(r => document.getElementById(r.diffId)?.value !== '');
      if (allAnswered) q11Filled = true;
    }
  }
  if (q11Filled) filled++;

  let q12Filled = true;
  const q12Radio = document.querySelector('[name="q12_case"]:checked');
  if (q12Radio && q12Radio.value === 'has_case') {
    const entries = document.querySelectorAll('#suspect-case-list .suspect-case-entry');
    if (entries.length === 0) {
      q12Filled = false;
    } else {
      q12Filled = Array.from(entries).every(e => {
        const m = e.id.match(/\d+/); if (!m) return false;
        const id = m[0];
        const date = document.getElementById(`sc-date-${id}`)?.value;
        const hn = document.getElementById(`sc-hn-${id}`)?.value;
        const qty = document.getElementById(`sc-qty-${id}`)?.value;
        return !!(date && hn && hn.length === 7 && qty !== '' && Number(qty) > 0);
      });
    }
  }

  const allTextFilled = req.length === (filled - (allChecked ? 1 : 0) - (q10Filled ? 1 : 0) - (q11Filled ? 1 : 0));

  return { filled, total, allTextFilled, allChecked, q10Filled, q11Filled, q12Filled };
}

function updateProgress() {
  const stats = getProgressStats();
  const pct = Math.round((stats.filled / stats.total) * 100);
  
  document.querySelectorAll('.progress-bar-fill').forEach(bar => {
    bar.style.transform = `scaleX(${pct / 100})`;
  });
  
  document.getElementById('progress-text').textContent = `${stats.filled} / ${stats.total} รายการ`;
  
  updateSubmitState();
}

function updateSubmitState() {
  if (isSubmitting) return; // Lock state while submitting

  const stats = getProgressStats();
  const btn = document.getElementById('btn-submit');
  const floatBtn = document.getElementById('btn-floating-submit');

  const isReady = (stats.allTextFilled && stats.allChecked && stats.q10Filled && stats.q11Filled && stats.q12Filled) && navigator.onLine;

  // if (btn) btn.disabled = !isReady;
  
  if (floatBtn) {
    if (!isSubmitVisible) { floatBtn.classList.add('show'); }
    else { floatBtn.classList.remove('show'); }
  }
}

// ================================================================
//  VALIDATION
// ================================================================
function validate() {
  if (isSubmitting) return false;
  let ok = true; let firstError = null;
  const fields = [
    { id: 'q1-date', wrap: 'fg-q1' },
    { id: 'q2-room', wrap: 'fg-q2' },
    { id: 'q3-pharmacist', wrap: 'fg-q3' },
    { id: 'q4-assistant', wrap: 'fg-q4' },
    { id: 'q5-drug-val', wrap: 'fg-q5' },
    { id: 'q8-diff-new', wrap: 'fg-q8' },
  ];
  fields.forEach(({ id, wrap }) => {
    const el = document.getElementById(id);
    const w = document.getElementById(wrap);
    if (!el || !el.value || el.value.trim() === '') {
      w?.classList.add('field-error'); ok = false;
      if (!firstError) firstError = w;
    } else { w?.classList.remove('field-error'); }
  });
  // Checklist 9.1-9.8
  const allCh = MAIN_CHECKS.every(n => document.querySelector(`[name="${n}"]`).checked);
  const clErr = document.getElementById('checklist-error-msg');
  if (!allCh) { clErr.style.display = 'block'; ok = false; if (!firstError) firstError = document.getElementById('checklist-wrap'); }
  else { clErr.style.display = 'none'; }
  // 9.9 Other note validation
  const checkOther = document.querySelector('[name="check_other"]');
  const otherNote = document.getElementById('q9-9-note');
  const otherWrap = document.getElementById('sub-other-note');
  if (checkOther && checkOther.checked) {
    if (!otherNote.value || otherNote.value.trim() === '') {
      if (otherWrap) otherWrap.classList.add('field-error');
      ok = false;
      if (!firstError) firstError = otherWrap;
    } else {
      if (otherWrap) otherWrap.classList.remove('field-error');
    }
  }
  // Q10
  const q10Chk = document.querySelectorAll('[name="q10"]:checked').length > 0;
  const q10Err = document.getElementById('q10-error-msg');
  if (!q10Chk) { if (q10Err) q10Err.style.display = 'block'; ok = false; if (!firstError) firstError = document.getElementById('fg-q10'); }
  else { if (q10Err) q10Err.style.display = 'none'; }
  // Similar drugs validation
  const needsSim = document.getElementById('opt-multi-strength').checked || document.getElementById('opt-similar-look').checked;
  const simErr = document.getElementById('similar-error-msg');
  if (needsSim) {
    const entries = document.querySelectorAll('#similar-drug-list .similar-drug-entry');
    const hasEntry = Array.from(entries).some(entry => { const m = entry.id.match(/\d+/); return m && (document.getElementById(`sim-drug-val-${m[0]}`)?.value || '').trim() !== ''; });
    if (!hasEntry) { if (simErr) simErr.style.display = 'block'; ok = false; if (!firstError) firstError = document.getElementById('similar-drugs-area'); }
    else { if (simErr) simErr.style.display = 'none'; }
  } else { if (simErr) simErr.style.display = 'none'; }
  
  // Q12 Suspect Cases Validation
  const q12Err = document.getElementById('q12-case-error');
  const q12Radio = document.querySelector('[name="q12_case"]:checked');
  if (q12Radio && q12Radio.value === 'has_case') {
    const entries = document.querySelectorAll('#suspect-case-list .suspect-case-entry');
    if (entries.length === 0) {
      if (q12Err) { q12Err.textContent = 'กรุณาระบุข้อมูลเคสอย่างน้อย 1 รายการ'; q12Err.style.display = 'block'; }
      ok = false;
      if (!firstError) firstError = document.getElementById('fg-q13');
    } else {
      let casesValid = true;
      entries.forEach(e => {
        const m = e.id.match(/\d+/); if (!m) return;
        const id = m[0];
        const dateInput = document.getElementById(`sc-date-${id}`);
        const hnInput = document.getElementById(`sc-hn-${id}`);
        const qtyInput = document.getElementById(`sc-qty-${id}`);
        let cv = true;
        
        if (!dateInput.value) { dateInput.parentElement.classList.add('field-error'); cv = false; } else { dateInput.parentElement.classList.remove('field-error'); }
        if (!hnInput.value || hnInput.value.length < 7) { hnInput.parentElement.classList.add('field-error'); cv = false; } else { hnInput.parentElement.classList.remove('field-error'); }
        if (!qtyInput.value || Number(qtyInput.value) <= 0) { qtyInput.parentElement.classList.add('field-error'); cv = false; } else { qtyInput.parentElement.classList.remove('field-error'); }
        
        if (!cv) casesValid = false;
      });
      if (!casesValid) {
        if (q12Err) { q12Err.textContent = 'กรุณากรอกวันที่, HN (7 หลัก) และจำนวน (ค่าบวกเท่านั้น) ให้ครบถ้วน'; q12Err.style.display = 'block'; }
        ok = false;
        if (!firstError) firstError = document.getElementById('fg-q13');
      } else {
        if (q12Err) q12Err.style.display = 'none';
      }
    }
  } else {
    if (q12Err) q12Err.style.display = 'none';
  }

  // Scroll to first error
  if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return ok;
}

function validateQ11() {
  let ok = false;
  const noneChk = document.getElementById('chk-q11-none');
  let firstErrorField = null;

  if (noneChk && noneChk.checked) {
    ok = true;
  } else {
    const checkedRooms = Q11_ROOMS.filter(r => document.querySelector(`[name="${r.chkName}"]`)?.checked);
    if (checkedRooms.length > 0) {
      ok = true;
      checkedRooms.forEach(r => {
        const input = document.getElementById(r.diffId);
        if (input.value === '') {
          ok = false;
          input.parentElement.classList.add('field-error');
          if (!firstErrorField) firstErrorField = input.parentElement;
        } else {
          input.parentElement.classList.remove('field-error');
        }
      });
    }
  }
  const err = document.getElementById('q11-error-msg');
  if (err) {
    err.textContent = 'กรุณากรอก Diff ของห้องยาที่ทำเครื่องหมายเลือกให้ครบถ้วน';
    err.style.display = ok ? 'none' : 'block';
  }
  if (firstErrorField) firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return ok;
}

// ================================================================
//  IMAGE UPLOAD LOGIC
// ================================================================
let currentImageBase64 = null;

function initImageUploader() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('q12-file');
  if (!uploadArea || !fileInput) return;

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--accent)'; });
  uploadArea.addEventListener('dragleave', () => uploadArea.style.borderColor = '');
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault(); uploadArea.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processImageFile(e.dataTransfer.files[0]);
  });

  // Local paste listener for area
  uploadArea.addEventListener('paste', handleImagePaste);
  // Global paste listener
  window.addEventListener('paste', handleImagePaste);
}

function handleImagePaste(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let index in items) {
    const item = items[index];
    if (item.kind === 'file' && item.type.includes('image/')) {
      e.preventDefault();
      processImageFile(item.getAsFile());
      document.getElementById('section-suspect').scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
  }
}

function handleImageFileSelect(e) {
  if (e.target.files && e.target.files.length > 0) processImageFile(e.target.files[0]);
}

function processImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > 1200) { h = Math.round((h * 1200) / w); w = 1200; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Draw white background in case of transparent png
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      currentImageBase64 = canvas.toDataURL('image/jpeg', 0.85); // Compress to limit payload size

      const preview = document.getElementById('upload-preview');
      preview.src = currentImageBase64;
      preview.style.display = 'block';
      document.getElementById('remove-img-btn').style.display = 'inline-block';
      document.querySelector('.upload-icon').style.display = 'none';
      document.querySelector('.upload-text').style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearImageUpload(e) {
  if (e) e.stopPropagation();
  currentImageBase64 = null;
  document.getElementById('q12-file').value = '';
  const preview = document.getElementById('upload-preview');
  preview.src = ''; preview.style.display = 'none';
  document.getElementById('remove-img-btn').style.display = 'none';
  document.querySelector('.upload-icon').style.display = 'block';
  document.querySelector('.upload-text').style.display = 'block';
}

// ================================================================
//  MODAL / LIGHTBOX / RIPPLE
// ================================================================

function confirmSubmit() {
  if (isSubmitting) return;
  if (!validate()) { showToast('⚠️ กรุณากรอกข้อมูลที่จำเป็นให้ครบ', 'error'); return; }
  if (!validateQ11()) {
    showToast('⚠️ กรุณากรอก Diff ของห้องยาที่เลือกให้ครบ (ข้อ 11)', 'error');
    document.getElementById('fg-q11')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Populate Confirm Modal
  const drug = document.getElementById('q5-drug-val').value || '-';
  const room = document.getElementById('q2-room').value || '-';
  const q12Radio = document.querySelector('[name="q12_case"]:checked');
  let caseCountText = 'ไม่มีเคส';
  if (q12Radio && q12Radio.value === 'has_case') {
    const cases = document.querySelectorAll('#suspect-case-list .suspect-case-entry').length;
    caseCountText = `${cases} เคส`;
  }

  const list = document.getElementById('confirm-list');
  list.innerHTML = `
    <li><span>ห้องยา:</span> <strong>${room}</strong></li>
    <li><span>รายการยา Diff:</span> <strong>${drug}</strong></li>
    <li><span>จำนวนเคสที่บันทึก:</span> <strong>${caseCountText}</strong></li>
  `;
  document.getElementById('confirm-modal-overlay').classList.add('visible');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal-overlay').classList.remove('visible');
}

function proceedSubmit() {
  closeConfirmModal();
  submitForm();
}

function openLightbox(src) {
  const overlay = document.getElementById('lightbox-overlay');
  const img = document.getElementById('lightbox-img');
  if (overlay && img && src) {
    img.src = src;
    overlay.classList.add('visible');
  }
}

function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.remove('visible');
}

window.addEventListener('beforeunload', function (e) {
  if (isSubmitting) return undefined;
  const stats = getProgressStats();
  if (stats.filled > 0 && stats.filled < stats.total && !document.getElementById('success-screen').style.display.includes('block')) {
    const msg = 'คุณยังกรอกข้อมูลไม่เสร็จ แน่ใจหรือไม่ที่จะปิดหน้านี้?';
    (e || window.event).returnValue = msg;
    return msg;
  }
});

document.addEventListener('mousedown', function(e) {
  const target = e.target.closest('.check-item, .radio-item, .btn-submit, .btn-reset, .btn-primary, .btn-secondary, .fab-go-top');
  if (!target || target.disabled) return;
  const rect = target.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = e.clientX - rect.left - size/2 + 'px';
  ripple.style.top = e.clientY - rect.top - size/2 + 'px';
  target.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// ================================================================
//  SUBMIT
// ================================================================
async function submitForm() {
  
  isSubmitting = true;
  
  const btn = document.getElementById('btn-submit');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2.5px;"></div> กำลังบันทึก...';
  }
  
  const floatBtn = document.getElementById('btn-floating-submit');
  if (floatBtn) {
    floatBtn.disabled = true;
    floatBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2.5px;margin-right:8px;"></div> กำลังบันทึก...';
    // Optionally keep it visible to show loading, but user requested it to disappear/lock. 
    // We already disabled it, which is the most critical part for stopping double-submits.
  }
  
  const checks = {
    recount: document.querySelector('[name="check_recount"]').checked,
    pending_prep: document.querySelector('[name="check_pending_prep"]').checked,
    change_counter: document.querySelector('[name="check_change_counter"]').checked,
    counter_name: document.getElementById('q9-3-counter').value,
    expire: document.querySelector('[name="check_expire"]').checked,
    damaged: document.querySelector('[name="check_damaged"]').checked,
    pending_req: document.querySelector('[name="check_pending_req"]').checked,
    qi: document.querySelector('[name="check_qi"]').checked,
    mrp: document.querySelector('[name="check_mrp"]').checked,
    other: document.querySelector('[name="check_other"]').checked,
    other_note: document.getElementById('q9-9-note').value,
  };
  const similarDrugs = [];
  document.querySelectorAll('#similar-drug-list .similar-drug-entry').forEach(entry => {
    const m = entry.id.match(/\d+/); if (!m) return;
    const drug = document.getElementById(`sim-drug-val-${m[0]}`)?.value || '';
    const diff = document.getElementById(`sim-diff-${m[0]}`)?.value || '';
    if (drug) similarDrugs.push({ drug, diff });
  });
  const q10Sel = []; document.querySelectorAll('[name="q10"]:checked').forEach(cb => q10Sel.push(cb.value));

  // Q11 data
  const q11 = {};
  Q11_ROOMS.forEach(r => {
    const chk = document.querySelector(`[name="${r.chkName}"]`);
    if (chk && chk.checked) {
      q11[r.key] = { checked: true, diff: document.getElementById(r.diffId)?.value || '' };
    }
  });
  q11.none = document.getElementById('chk-q11-none')?.checked || false;
  q11.f4_help = document.getElementById('chk-q11-f4-help')?.checked || false;
  q11.remark = document.getElementById('q11-remark')?.value || '';

  // Q13 data (radio-based)
  const q12radio = document.querySelector('[name="q12_case"]:checked');
  const q12 = { selection: q12radio ? q12radio.value : '', cases: [] };
  document.querySelectorAll('#suspect-case-list .suspect-case-entry').forEach(entry => {
    const m = entry.id.match(/\d+/); if (!m) return;
    const id = m[0];
    q12.cases.push({
      date: document.getElementById(`sc-date-${id}`)?.value || '',
      hn: document.getElementById(`sc-hn-${id}`)?.value || '',
      qty: document.getElementById(`sc-qty-${id}`)?.value || '',
      prep: getScValue(`sc-prep-${id}`, `sc-prep-other-${id}`),
      checker: getScValue(`sc-chk-${id}`, `sc-chk-other-${id}`),
      dispenser: getScValue(`sc-disp-${id}`, `sc-disp-other-${id}`),
      remark: document.getElementById(`sc-remark-${id}`)?.value || ''
    });
  });

  // Q14
  const q13_remark = document.getElementById('q13-remark')?.value || '';

  const payload = {
    date: document.getElementById('q1-date').value,
    room: document.getElementById('q2-room').value,
    pharmacist: document.getElementById('q3-pharmacist').value,
    assistant: document.getElementById('q4-assistant').value,
    drug: document.getElementById('q5-drug-val').value,
    material: document.getElementById('q6-material').value,
    diff_old: document.getElementById('q7-diff-old').value,
    diff_new: document.getElementById('q8-diff-new').value,
    checks, q10: q10Sel, similar_drugs: similarDrugs,
    q11, q12, q13_remark,
    // Add image payload
    image_upload: currentImageBase64
  };
  try {
    await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'saveRecord', data: payload }) });
    localStorage.removeItem(FORM_STATE_KEY);
    showSuccess();
  } catch (e) {
    console.error(e);
    showToast('❌ บันทึกไม่สำเร็จ: ' + e.message, 'error');
    isSubmitting = false;
    const btn = document.getElementById('btn-submit');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>💾</span> บันทึกข้อมูล';
    }
    const floatBtn = document.getElementById('btn-floating-submit');
    if (floatBtn) {
      floatBtn.disabled = false;
      floatBtn.innerHTML = '<span>🚀</span> บันทึกข้อมูล';
    }
    updateSubmitState();
  }
}

function showSuccess() {
  document.getElementById('main-form').style.display = 'none';
  document.querySelector('.progress-bar-wrap').style.display = 'none';
  document.querySelector('.progress-text').style.display = 'none';
  const floatBtn = document.getElementById('btn-floating-submit');
  if (floatBtn) floatBtn.classList.remove('show');
  document.getElementById('success-screen').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  document.getElementById('main-form').reset();
  clearDrugSearch(); clearEmpSearch('q3'); clearEmpSearch('q4'); clearEmpSearch('q9');
  document.getElementById('similar-drug-list').innerHTML = ''; similarDrugCount = 0;
  document.getElementById('similar-drugs-area').classList.remove('visible');
  document.querySelectorAll('.check-item').forEach(el => el.classList.remove('checked'));
  document.querySelectorAll('.sub-field').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.radio-item').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  document.querySelectorAll('.field-error-msg, .checklist-error-msg').forEach(el => el.style.display = 'none');
  document.getElementById('checklist-error-msg').style.display = 'none';
  // Q11 reset
  Q11_ROOMS.forEach(r => {
    const sub = document.getElementById(r.subId); if (sub) sub.classList.remove('visible');
    const diffEl = document.getElementById(r.diffId); if (diffEl) diffEl.value = '';
  });
  document.getElementById('q11-remark').value = '';
  // Q12 reset
  document.getElementById('suspect-case-list').innerHTML = '';
  suspectCaseCount = 0;
  document.getElementById('suspect-cases-area').classList.remove('visible');
  document.querySelectorAll('[name="q12_case"]').forEach(r => r.checked = false);
  document.getElementById('ri-has-case')?.classList.remove('selected');
  document.getElementById('ri-no-case')?.classList.remove('selected');
  // Q13 reset
  document.getElementById('q13-remark').value = '';
  
  isSubmitting = false;
  const btn = document.getElementById('btn-submit');
  if (btn) {
    btn.innerHTML = '<span>💾</span> บันทึกข้อมูล';
  }
  const floatBtn = document.getElementById('btn-floating-submit');
  if (floatBtn) {
    floatBtn.innerHTML = '<span>🚀</span> บันทึกข้อมูล';
  }
  updateSubmitState();

  document.getElementById('main-form').style.display = 'block';
  document.querySelector('.progress-bar-wrap').style.display = '';
  document.querySelector('.progress-text').style.display = '';
  document.getElementById('success-screen').style.display = 'none';
  setDefaultDate();
  document.querySelectorAll('.progress-bar-fill').forEach(bar => bar.style.transform = 'scaleX(0)');
  localStorage.removeItem(FORM_STATE_KEY);
  updateSelectAllBtn();
  updateChecklistProgress();
  updateQ11Visibility();
}

// ================================================================
//  CLEAR ALL
// ================================================================
function clearAll() {
  if (!confirm('ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) return;
  resetForm();
  showToast('🗑 ล้างข้อมูลทั้งหมดแล้ว', '');
}

// ================================================================
//  FONT SIZE
// ================================================================
function setFontSize(size) {
  document.body.classList.remove('font-small', 'font-medium', 'font-large');
  if (size !== 'medium') document.body.classList.add('font-' + size);
  document.querySelectorAll('.font-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
  localStorage.setItem(FONT_KEY, size);
}
function restoreFontSize() {
  const s = localStorage.getItem(FONT_KEY) || 'medium';
  setFontSize(s);
}

// ================================================================
//  FORM STATE PERSISTENCE (localStorage)
// ================================================================
let saveTimer;
function saveFormState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const state = {
        q1: document.getElementById('q1-date').value,
        q2: document.getElementById('q2-room').value,
        q3h: document.getElementById('q3-pharmacist').value,
        q3s: document.getElementById('q3-pharmacist-search').value,
        q4h: document.getElementById('q4-assistant').value,
        q4s: document.getElementById('q4-assistant-search').value,
        q5h: document.getElementById('q5-drug-val').value,
        q5s: document.getElementById('q5-drug-search').value,
        q6: document.getElementById('q6-material').value,
        q7: document.getElementById('q7-diff-old').value,
        q8: document.getElementById('q8-diff-new').value,
        checks: {},
        q93h: document.getElementById('q9-3-counter').value,
        q93s: document.getElementById('q9-3-counter-search').value,
        q99: document.getElementById('q9-9-note').value,
        q10: [],
        simDrugs: [],
      };
      // Save checks
      [...MAIN_CHECKS, 'check_other'].forEach(n => { state.checks[n] = document.querySelector(`[name="${n}"]`).checked; });
      // Save Q10
      document.querySelectorAll('[name="q10"]:checked').forEach(c => state.q10.push(c.value));
      // Save similar drugs
      document.querySelectorAll('#similar-drug-list .similar-drug-entry').forEach(entry => {
        const m = entry.id.match(/\d+/); if (!m) return;
        state.simDrugs.push({
          drug: document.getElementById(`sim-drug-val-${m[0]}`)?.value || '',
          drugS: document.getElementById(`sim-drug-search-${m[0]}`)?.value || '',
          diff: document.getElementById(`sim-diff-${m[0]}`)?.value || '',
        });
      });
      // Save Q11, Q12, Q13
      collectQ11Q12Q13State(state);
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify(state));

      // Show auto-save badge
      const badge = document.getElementById('autosave-badge');
      if (badge) {
        const d = new Date();
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        badge.textContent = `✅ บันทึกแล้ว ${timeStr}`;
        badge.classList.add('visible');
        clearTimeout(window.autosaveBadgeTimer);
        window.autosaveBadgeTimer = setTimeout(() => badge.classList.remove('visible'), 4000);
      }
    } catch { }
    updateProgress();
  }, 300);
}

function collectQ11Q12Q13State(state) {
  // Q11
  state.q11 = {};
  Q11_ROOMS.forEach(r => {
    const chk = document.querySelector(`[name="${r.chkName}"]`);
    state.q11[r.key] = {
      checked: chk ? chk.checked : false,
      diff: document.getElementById(r.diffId)?.value || '',
    };
  });
  state.q11.none = document.getElementById('chk-q11-none')?.checked || false;
  state.q11.f4_help = document.getElementById('chk-q11-f4-help')?.checked || false;
  state.q11.remark = document.getElementById('q11-remark')?.value || '';
  // Q12 (radio-based)
  const q12radio = document.querySelector('[name="q12_case"]:checked');
  state.q12 = { selection: q12radio ? q12radio.value : '', cases: [] };
  document.querySelectorAll('#suspect-case-list .suspect-case-entry').forEach(entry => {
    const m = entry.id.match(/\d+/); if (!m) return;
    const id = m[0];
    state.q12.cases.push({
      date: document.getElementById(`sc-date-${id}`)?.value || '',
      hn: document.getElementById(`sc-hn-${id}`)?.value || '',
      qty: document.getElementById(`sc-qty-${id}`)?.value || '',
      prep: getScValue(`sc-prep-${id}`, `sc-prep-other-${id}`),
      checker: getScValue(`sc-chk-${id}`, `sc-chk-other-${id}`),
      dispenser: getScValue(`sc-disp-${id}`, `sc-disp-other-${id}`),
    });
  });
  // Q13
  state.q13 = document.getElementById('q13-remark')?.value || '';
}

function restoreFormState() {
  try {
    const raw = localStorage.getItem(FORM_STATE_KEY); if (!raw) return;
    const s = JSON.parse(raw);
    if (s.q1) document.getElementById('q1-date').value = s.q1;
    if (s.q2) document.getElementById('q2-room').value = s.q2;
    if (s.q3h) { document.getElementById('q3-pharmacist').value = s.q3h; document.getElementById('q3-pharmacist-search').value = s.q3s || s.q3h; }
    if (s.q4h) { document.getElementById('q4-assistant').value = s.q4h; document.getElementById('q4-assistant-search').value = s.q4s || s.q4h; }
    if (s.q5h) {
      document.getElementById('q5-drug-val').value = s.q5h; document.getElementById('q5-drug-search').value = s.q5s || s.q5h;
      const label = document.getElementById('drug-name-label'); if (label) label.textContent = s.q5h;
      const info = document.getElementById('selected-drug-info'); if (info) info.style.display = 'block';
    }
    if (s.q6) document.getElementById('q6-material').value = s.q6;
    if (s.q7) { const e = document.getElementById('q7-diff-old'); e.value = s.q7; styleDiffInput(e); }
    if (s.q8) { const e = document.getElementById('q8-diff-new'); e.value = s.q8; styleDiffInput(e); }
    // Restore checks
    if (s.checks) {
      Object.keys(s.checks).forEach(n => {
        const c = document.querySelector(`[name="${n}"]`); if (c) { c.checked = s.checks[n]; toggleCheck(c); }
      });
    }
    if (s.checks?.check_change_counter) toggleChangeCounter();
    if (s.checks?.check_other) toggleOtherNote();
    if (s.q93h) { document.getElementById('q9-3-counter').value = s.q93h; document.getElementById('q9-3-counter-search').value = s.q93s || s.q93h; }
    if (s.q99) document.getElementById('q9-9-note').value = s.q99;
    // Restore Q10
    if (s.q10?.length) {
      s.q10.forEach(v => { const cb = document.querySelector(`[name="q10"][value="${v}"]`); if (cb) cb.checked = true; });
      handleQ10Change();
    }
    // Restore similar drugs
    if (s.simDrugs?.length) {
      s.simDrugs.forEach(sd => {
        addSimilarDrug();
        const id = similarDrugCount;
        if (sd.drug) document.getElementById(`sim-drug-val-${id}`).value = sd.drug;
        if (sd.drugS) document.getElementById(`sim-drug-search-${id}`).value = sd.drugS;
        if (sd.diff) document.getElementById(`sim-diff-${id}`).value = sd.diff;
      });
    }
    updateSelectAllBtn();
    updateChecklistProgress();
    updateProgress();
    // Q11
    if (s.q11) {
      Q11_ROOMS.forEach(r => {
        if (s.q11[r.key]?.checked) {
          const chk = document.querySelector(`[name="${r.chkName}"]`);
          if (chk) { chk.checked = true; chk.closest('.check-item').classList.add('checked'); }
          const sub = document.getElementById(r.subId); if (sub) sub.classList.add('visible');
          const diff = document.getElementById(r.diffId); if (diff && s.q11[r.key].diff) { diff.value = s.q11[r.key].diff; styleDiffInput(diff); }
        }
      });
      if (s.q11.none) {
        const nc = document.getElementById('chk-q11-none');
        if (nc) { nc.checked = true; nc.closest('.check-item').classList.add('checked'); }
      }
      if (s.q11.f4_help) {
        const fh = document.getElementById('chk-q11-f4-help');
        if (fh) fh.checked = true;
        const dw = document.getElementById('f4-diff-wrap');
        if (dw) dw.style.display = 'none';
      }
      if (s.q11.remark) document.getElementById('q11-remark').value = s.q11.remark;
    }
    updateQ11Visibility();
    // Q12 (radio-based)
    if (s.q12?.selection) {
      const radio = document.querySelector(`[name="q12_case"][value="${s.q12.selection}"]`);
      if (radio) { radio.checked = true; handleQ12Change(); }
      if (s.q12.selection === 'has_case' && s.q12.cases?.length) {
        document.getElementById('suspect-case-list').innerHTML = ''; suspectCaseCount = 0;
        s.q12.cases.forEach(sc => {
          addSuspectCase();
          const id = suspectCaseCount;
          if (sc.date) document.getElementById(`sc-date-${id}`).value = sc.date;
          if (sc.hn) document.getElementById(`sc-hn-${id}`).value = sc.hn;
          if (sc.qty) document.getElementById(`sc-qty-${id}`).value = sc.qty;
          // Restore name fields (select + other)
          ['prep', 'chk', 'disp'].forEach(field => {
            const key = { prep: 'prep', chk: 'checker', disp: 'dispenser' }[field];
            const val = sc[key] || '';
            const sel = document.getElementById(`sc-${field}-${id}`);
            const otherInput = document.getElementById(`sc-${field}-other-${id}`);
            if (!sel) return;
            // Check if value exists in select options
            const optExists = [...sel.options].some(o => o.value === val);
            if (optExists) {
              sel.value = val;
            } else if (val) {
              sel.value = '__other__';
              if (otherInput) { otherInput.style.display = 'block'; otherInput.value = val; }
            }
          });
        });
      }
    }
    // Q13
    if (s.q13) document.getElementById('q13-remark').value = s.q13;
  } catch (e) { console.warn('Restore failed:', e); }
}

function initAutoSave() {
  const form = document.getElementById('main-form');
  form.addEventListener('change', saveFormState);
  form.addEventListener('input', saveFormState);
}

// ================================================================
//  TOAST
// ================================================================
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast'); el.textContent = msg; el.className = 'show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 3500);
}
