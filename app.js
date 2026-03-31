// ================================================================
//  CONFIG
// ================================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyd8KSFSiCAom2P-evr7BvWRZ-VlnQcLO_RMUKZM-3Z9Fy7nHAlTcUR5nInjPpLDWg/exec';

// ================================================================
//  STATE
// ================================================================
let masterData = [];
let employeeData = [];
let similarDrugCount = 0;
const CACHE_KEY = 'diffChecklist_initData';
const CACHE_TTL = 60 * 60 * 1000;
const FORM_STATE_KEY = 'diffChecklist_formState';
const FONT_KEY = 'diffChecklist_fontSize';
const MAIN_CHECKS = ['check_recount','check_pending_prep','check_change_counter','check_expire','check_damaged','check_pending_req','check_qi','check_mrp'];

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  restoreFontSize();
  setDefaultDate();
  await loadSheetData();
  restoreFormState();
  initProgressBar();
  initAutoSave();
});

function setDefaultDate() {
  const el = document.getElementById('q1-date');
  if (!el.value) {
    const t = new Date();
    el.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  }
}

// ================================================================
//  DATA LOADING (with cache)
// ================================================================
async function loadSheetData() {
  showLoading(['load-pharmacist','load-assistant']);
  try {
    const cached = loadFromCache();
    if (cached) {
      masterData = cached.master || [];
      employeeData = cached.employees || [];
      initUI();
      hideLoading(['load-pharmacist','load-assistant']);
      refreshCacheInBackground();
      return;
    }
    const data = await fetchFromGAS();
    masterData = data.master || [];
    employeeData = data.employees || [];
    saveToCache(data);
    initUI();
  } catch(e) {
    showToast('❌ โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรช', 'error');
    console.error('GAS Error:', e);
  } finally {
    hideLoading(['load-pharmacist','load-assistant']);
  }
}
function loadFromCache() {
  try { const r = localStorage.getItem(CACHE_KEY); if(!r) return null; const {ts,data}=JSON.parse(r); return Date.now()-ts>CACHE_TTL?null:data; } catch{return null;}
}
function saveToCache(data) { try{localStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),data}));}catch{} }
async function fetchFromGAS() {
  const res = await fetch(`${GAS_URL}?action=getInitData`,{method:'GET',credentials:'omit',cache:'no-cache',redirect:'follow'});
  return res.json();
}
async function refreshCacheInBackground() {
  try { const data = await fetchFromGAS(); saveToCache(data); masterData=data.master||[]; employeeData=data.employees||[]; } catch{}
}
function showLoading(ids){ids.forEach(id=>document.getElementById(id)?.classList.add('visible'));}
function hideLoading(ids){ids.forEach(id=>document.getElementById(id)?.classList.remove('visible'));}

// ================================================================
//  UI INIT
// ================================================================
function initUI() {
  initEmployeeSearch('q3','เภสัชกร',document.getElementById('q3-pharmacist-search'),document.getElementById('q3-pharmacist'));
  initEmployeeSearch('q4','ผู้ช่วยเภสัชกร',document.getElementById('q4-assistant-search'),document.getElementById('q4-assistant'));
  initEmployeeSearch('q9',null,document.getElementById('q9-3-counter-search'),document.getElementById('q9-3-counter'));
  document.getElementById('q3-pharmacist-search').placeholder='พิมพ์ชื่อเภสัชกร...';
  document.getElementById('q4-assistant-search').placeholder='พิมพ์ชื่อผู้ช่วยเภสัชกร...';
  initDrugSearchable();
  // Q6 material reverse lookup
  document.getElementById('q6-material').addEventListener('change',function(){
    const mat=this.value.trim(); if(!mat)return;
    const found=masterData.find(d=>d.material===mat); if(found) selectDrug(found);
  });
}

// ================================================================
//  SEARCHABLE EMPLOYEE DROPDOWN
// ================================================================
function initEmployeeSearch(prefix, roleFilter, inputEl, hiddenEl) {
  const dropdown = document.getElementById(`${prefix}-dropdown`);
  const getList = () => roleFilter ? employeeData.filter(e=>e.role===roleFilter) : employeeData;

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim().toLowerCase();
    const list = getList();
    const matches = q ? list.filter(e=>e.name.toLowerCase().includes(q)).slice(0,30) : list.slice(0,30);
    if (!q && !dropdown.classList.contains('open')) { dropdown.classList.remove('open'); return; }
    renderDropdown(dropdown, matches.map(e=>e.name), name=>{
      inputEl.value=name; hiddenEl.value=name; dropdown.classList.remove('open');
      setToggleBtnState(prefix, false);
      saveFormState();
    });
    dropdown.classList.add('open');
  });

  inputEl.addEventListener('blur',()=>setTimeout(()=>{dropdown.classList.remove('open');setToggleBtnState(prefix,false);},180));
  inputEl.addEventListener('focus',()=>{if(inputEl.value)inputEl.dispatchEvent(new Event('input'));});
}

function toggleDropdownAll(prefix) {
  const dropdown = document.getElementById(`${prefix}-dropdown`);
  const isOpen = dropdown.classList.contains('open');
  if (isOpen) { dropdown.classList.remove('open'); setToggleBtnState(prefix,false); return; }

  let list = [];
  const map = {q3:'เภสัชกร',q4:'ผู้ช่วยเภสัชกร',q9:null,q5:null};
  const inputMap = {q3:'q3-pharmacist-search',q4:'q4-assistant-search',q9:'q9-3-counter-search',q5:'q5-drug-search'};
  const hiddenMap = {q3:'q3-pharmacist',q4:'q4-assistant',q9:'q9-3-counter',q5:'q5-drug-val'};

  if (prefix === 'q5') {
    list = masterData.slice(0,60).map(d=>d.drug);
  } else {
    const role = map[prefix];
    list = (role ? employeeData.filter(e=>e.role===role) : employeeData).map(e=>e.name);
  }

  const inputEl = document.getElementById(inputMap[prefix]);
  const hiddenEl = document.getElementById(hiddenMap[prefix]);

  renderDropdown(dropdown, list, val=>{
    inputEl.value=val; hiddenEl.value=val; dropdown.classList.remove('open');
    setToggleBtnState(prefix,false);
    if(prefix==='q5'){const d=masterData.find(x=>x.drug===val);if(d)selectDrug(d);}
    saveFormState();
  });
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

function renderDropdown(dropdown, items, onSelect) {
  dropdown.innerHTML = '';
  if (!items.length) { dropdown.innerHTML='<div class="dropdown-item no-result">ไม่พบรายการ</div>'; return; }
  items.forEach(label=>{
    const item=document.createElement('div'); item.className='dropdown-item'; item.textContent=label;
    item.addEventListener('mousedown',e=>{e.preventDefault();onSelect(label);});
    dropdown.appendChild(item);
  });
}

function clearEmpSearch(prefix) {
  const map={q3:['q3-pharmacist-search','q3-pharmacist'],q4:['q4-assistant-search','q4-assistant'],q9:['q9-3-counter-search','q9-3-counter']};
  const [sId,hId]=map[prefix]||[];
  if(sId)document.getElementById(sId).value='';
  if(hId)document.getElementById(hId).value='';
  saveFormState();
}

// ================================================================
//  DRUG SEARCH (Q5)
// ================================================================
function initDrugSearchable() {
  const input=document.getElementById('q5-drug-search');
  const dropdown=document.getElementById('q5-dropdown');
  input.addEventListener('input',()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){dropdown.classList.remove('open');return;}
    const matches=masterData.filter(d=>d.drug.toLowerCase().includes(q)).slice(0,50);
    dropdown.innerHTML='';
    if(!matches.length){dropdown.innerHTML='<div class="dropdown-item no-result">ไม่พบรายการ</div>';}
    else{matches.forEach(d=>{
      const item=document.createElement('div');item.className='dropdown-item';item.textContent=d.drug;
      item.addEventListener('mousedown',e=>{e.preventDefault();selectDrug(d);});
      dropdown.appendChild(item);
    });}
    dropdown.classList.add('open');
  });
  input.addEventListener('blur',()=>setTimeout(()=>{dropdown.classList.remove('open');setToggleBtnState('q5',false);},180));
  input.addEventListener('focus',()=>{if(input.value)input.dispatchEvent(new Event('input'));});
}

function selectDrug(d) {
  document.getElementById('q5-drug-search').value=d.drug;
  document.getElementById('q5-drug-val').value=d.drug;
  document.getElementById('q6-material').value=d.material||'';
  document.getElementById('q7-diff-old').value=(d.diffOld!==undefined&&d.diffOld!=='')?d.diffOld:'';
  const label=document.getElementById('drug-name-label');
  if(label)label.textContent=d.drug;
  const info=document.getElementById('selected-drug-info');
  if(info)info.style.display='block';
  document.getElementById('q5-dropdown').classList.remove('open');
  saveFormState();
}

function clearDrugSearch() {
  document.getElementById('q5-drug-search').value='';
  document.getElementById('q5-drug-val').value='';
  document.getElementById('q6-material').value='';
  document.getElementById('q7-diff-old').value='';
  const label=document.getElementById('drug-name-label');
  if(label)label.textContent='___';
  const info=document.getElementById('selected-drug-info');
  if(info)info.style.display='none';
  saveFormState();
}

// ================================================================
//  CHECKLIST
// ================================================================
function toggleCheck(chk){
  const item=chk.closest('.check-item');
  item.classList.toggle('checked',chk.checked);
  updateSelectAllBtn();
  saveFormState();
}

function toggleSelectAll(){
  const allChecked=MAIN_CHECKS.every(n=>document.querySelector(`[name="${n}"]`).checked);
  MAIN_CHECKS.forEach(n=>{const c=document.querySelector(`[name="${n}"]`);c.checked=!allChecked;toggleCheck(c);if(n==='check_change_counter')toggleChangeCounter();});
  updateSelectAllBtn(); saveFormState();
}

function updateSelectAllBtn(){
  const all=MAIN_CHECKS.every(n=>document.querySelector(`[name="${n}"]`).checked);
  document.getElementById('btn-select-all').textContent=all?'☐ ยกเลิกทั้งหมด':'☑ เลือกทั้งหมด';
}

function toggleChangeCounter(){
  document.getElementById('sub-change-counter').classList.toggle('visible',document.getElementById('chk-9-3').checked);
}
function toggleOtherNote(){
  document.getElementById('sub-other-note').classList.toggle('visible',document.getElementById('chk-9-9').checked);
}

// ================================================================
//  Q10 LOGIC
// ================================================================
function handleQ10Change(){
  const ms=document.getElementById('opt-multi-strength');
  const sl=document.getElementById('opt-similar-look');
  const no=document.getElementById('opt-none');
  ['ri-multi-strength','ri-similar-look','ri-none'].forEach(id=>{
    const ri=document.getElementById(id);ri.classList.toggle('selected',ri.querySelector('input').checked);
  });
  if(no.checked){ms.checked=false;sl.checked=false;document.getElementById('ri-multi-strength').classList.remove('selected');document.getElementById('ri-similar-look').classList.remove('selected');}
  if(ms.checked||sl.checked){no.checked=false;document.getElementById('ri-none').classList.remove('selected');}
  const showSim=ms.checked||sl.checked;
  document.getElementById('similar-drugs-area').classList.toggle('visible',showSim);
  if(!showSim){document.getElementById('similar-drug-list').innerHTML='';similarDrugCount=0;}
  else if(!document.getElementById('similar-drug-list').children.length)addSimilarDrug();
  // Clear error
  const err=document.getElementById('q10-error-msg');if(err)err.style.display='none';
  saveFormState();
}

// ================================================================
//  SIMILAR DRUGS
// ================================================================
function addSimilarDrug(){
  similarDrugCount++;
  const id=similarDrugCount;
  const entry=document.createElement('div');
  entry.className='similar-drug-entry';entry.id=`similar-entry-${id}`;
  entry.innerHTML=`
    <div class="search-select-wrap" style="position:relative;">
      <input type="text" id="sim-drug-search-${id}" class="search-input" placeholder="ค้นหาชื่อยา..." autocomplete="off" data-entry="${id}" />
      <div class="input-actions">
        <button type="button" class="toggle-btn" onclick="toggleSimDropdown(${id})" title="แสดงรายการ"><svg width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 5 5-5" fill="currentColor"/></svg></button>
      </div>
      <div class="dropdown-list" id="sim-dropdown-${id}"></div>
    </div>
    <input type="hidden" id="sim-drug-val-${id}" name="similar_drug_${id}" />
    <div class="diff-group"><span>Diff:</span><input type="number" id="sim-diff-${id}" name="similar_diff_${id}" placeholder="±0" step="any"/></div>
    <button type="button" class="remove-btn" onclick="removeSimilarDrug(${id})">✕</button>`;
  document.getElementById('similar-drug-list').appendChild(entry);
  initSimilarDrugSearch(id);
}

function removeSimilarDrug(id){document.getElementById(`similar-entry-${id}`)?.remove();saveFormState();}

function initSimilarDrugSearch(id){
  const input=document.getElementById(`sim-drug-search-${id}`);
  const dropdown=document.getElementById(`sim-dropdown-${id}`);
  input.addEventListener('input',()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){dropdown.classList.remove('open');return;}
    const matches=masterData.filter(d=>d.drug.toLowerCase().includes(q)).slice(0,40);
    dropdown.innerHTML='';
    if(!matches.length){dropdown.innerHTML='<div class="dropdown-item no-result">ไม่พบรายการ</div>';}
    else{matches.forEach(d=>{
      const item=document.createElement('div');item.className='dropdown-item';item.textContent=d.drug;
      item.addEventListener('mousedown',e=>{e.preventDefault();input.value=d.drug;document.getElementById(`sim-drug-val-${id}`).value=d.drug;dropdown.classList.remove('open');saveFormState();});
      dropdown.appendChild(item);
    });}
    dropdown.classList.add('open');
  });
  input.addEventListener('blur',()=>setTimeout(()=>dropdown.classList.remove('open'),180));
}

function toggleSimDropdown(id){
  const dropdown=document.getElementById(`sim-dropdown-${id}`);
  const input=document.getElementById(`sim-drug-search-${id}`);
  if(dropdown.classList.contains('open')){dropdown.classList.remove('open');return;}
  const list=masterData.slice(0,60);
  dropdown.innerHTML='';
  list.forEach(d=>{
    const item=document.createElement('div');item.className='dropdown-item';item.textContent=d.drug;
    item.addEventListener('mousedown',e=>{e.preventDefault();input.value=d.drug;document.getElementById(`sim-drug-val-${id}`).value=d.drug;dropdown.classList.remove('open');saveFormState();});
    dropdown.appendChild(item);
  });
  dropdown.classList.add('open');
  input.focus();
}

// ================================================================
//  PROGRESS BAR
// ================================================================
function initProgressBar(){
  const form=document.getElementById('main-form');
  form.addEventListener('change',updateProgress);
  form.addEventListener('input',updateProgress);
  updateProgress();
}
function updateProgress(){
  const req=['q1-date','q2-room','q3-pharmacist','q4-assistant','q5-drug-val','q8-diff-new'];
  const filled=req.filter(id=>{const el=document.getElementById(id);return el&&el.value&&el.value.trim()!=='';}).length;
  const pct=Math.round((filled/req.length)*100);
  document.getElementById('progress-bar').style.width=pct+'%';
  document.getElementById('progress-text').textContent=`${filled} / ${req.length} รายการ`;
}

// ================================================================
//  VALIDATION
// ================================================================
function validate(){
  let ok=true; let firstError=null;
  const fields=[
    {id:'q1-date',wrap:'fg-q1'},
    {id:'q2-room',wrap:'fg-q2'},
    {id:'q3-pharmacist',wrap:'fg-q3'},
    {id:'q4-assistant',wrap:'fg-q4'},
    {id:'q5-drug-val',wrap:'fg-q5'},
    {id:'q8-diff-new',wrap:'fg-q8'},
  ];
  fields.forEach(({id,wrap})=>{
    const el=document.getElementById(id);
    const w=document.getElementById(wrap);
    if(!el||!el.value||el.value.trim()===''){
      w?.classList.add('field-error');ok=false;
      if(!firstError)firstError=w;
    }else{w?.classList.remove('field-error');}
  });
  // Checklist 9.1-9.8
  const allCh=MAIN_CHECKS.every(n=>document.querySelector(`[name="${n}"]`).checked);
  const clErr=document.getElementById('checklist-error-msg');
  if(!allCh){clErr.style.display='block';ok=false;if(!firstError)firstError=document.getElementById('checklist-wrap');}
  else{clErr.style.display='none';}
  // Q10
  const q10Chk=document.querySelectorAll('[name="q10"]:checked').length>0;
  const q10Err=document.getElementById('q10-error-msg');
  if(!q10Chk){if(q10Err)q10Err.style.display='block';ok=false;if(!firstError)firstError=document.getElementById('fg-q10');}
  else{if(q10Err)q10Err.style.display='none';}
  // Similar drugs validation
  const needsSim=document.getElementById('opt-multi-strength').checked||document.getElementById('opt-similar-look').checked;
  const simErr=document.getElementById('similar-error-msg');
  if(needsSim){
    const entries=document.querySelectorAll('#similar-drug-list .similar-drug-entry');
    const hasEntry=Array.from(entries).some(entry=>{const m=entry.id.match(/\d+/);return m&&(document.getElementById(`sim-drug-val-${m[0]}`)?.value||'').trim()!=='';});
    if(!hasEntry){if(simErr)simErr.style.display='block';ok=false;if(!firstError)firstError=document.getElementById('similar-drugs-area');}
    else{if(simErr)simErr.style.display='none';}
  }else{if(simErr)simErr.style.display='none';}
  // Scroll to first error
  if(firstError)firstError.scrollIntoView({behavior:'smooth',block:'center'});
  return ok;
}

// ================================================================
//  SUBMIT
// ================================================================
async function submitForm(){
  if(!validate()){showToast('⚠️ กรุณากรอกข้อมูลที่จำเป็นให้ครบ','error');return;}
  const btn=document.getElementById('btn-submit');
  btn.disabled=true;
  btn.innerHTML='<div class="spinner" style="width:20px;height:20px;border-width:2.5px;"></div> กำลังบันทึก...';
  const checks={
    recount:document.querySelector('[name="check_recount"]').checked,
    pending_prep:document.querySelector('[name="check_pending_prep"]').checked,
    change_counter:document.querySelector('[name="check_change_counter"]').checked,
    counter_name:document.getElementById('q9-3-counter').value,
    expire:document.querySelector('[name="check_expire"]').checked,
    damaged:document.querySelector('[name="check_damaged"]').checked,
    pending_req:document.querySelector('[name="check_pending_req"]').checked,
    qi:document.querySelector('[name="check_qi"]').checked,
    mrp:document.querySelector('[name="check_mrp"]').checked,
    other:document.querySelector('[name="check_other"]').checked,
    other_note:document.getElementById('q9-9-note').value,
  };
  const similarDrugs=[];
  document.querySelectorAll('#similar-drug-list .similar-drug-entry').forEach(entry=>{
    const m=entry.id.match(/\d+/);if(!m)return;
    const drug=document.getElementById(`sim-drug-val-${m[0]}`)?.value||'';
    const diff=document.getElementById(`sim-diff-${m[0]}`)?.value||'';
    if(drug)similarDrugs.push({drug,diff});
  });
  const q10Sel=[];document.querySelectorAll('[name="q10"]:checked').forEach(cb=>q10Sel.push(cb.value));
  const payload={
    date:document.getElementById('q1-date').value,
    room:document.getElementById('q2-room').value,
    pharmacist:document.getElementById('q3-pharmacist').value,
    assistant:document.getElementById('q4-assistant').value,
    drug:document.getElementById('q5-drug-val').value,
    material:document.getElementById('q6-material').value,
    diff_old:document.getElementById('q7-diff-old').value,
    diff_new:document.getElementById('q8-diff-new').value,
    checks,q10:q10Sel,similar_drugs:similarDrugs,
  };
  try{
    await fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'saveRecord',data:payload})});
    localStorage.removeItem(FORM_STATE_KEY);
    showSuccess();
  }catch(e){
    console.error(e);
    showToast('❌ บันทึกไม่สำเร็จ: '+e.message,'error');
    btn.disabled=false;btn.innerHTML='<span>💾</span> บันทึกข้อมูล';
  }
}

function showSuccess(){
  document.getElementById('main-form').style.display='none';
  document.querySelector('.progress-bar-wrap').style.display='none';
  document.querySelector('.progress-text').style.display='none';
  document.getElementById('success-screen').style.display='block';
  window.scrollTo({top:0,behavior:'smooth'});
}

function resetForm(){
  document.getElementById('main-form').reset();
  clearDrugSearch();clearEmpSearch('q3');clearEmpSearch('q4');clearEmpSearch('q9');
  document.getElementById('similar-drug-list').innerHTML='';similarDrugCount=0;
  document.getElementById('similar-drugs-area').classList.remove('visible');
  document.querySelectorAll('.check-item').forEach(el=>el.classList.remove('checked'));
  document.querySelectorAll('.sub-field').forEach(el=>el.classList.remove('visible'));
  document.querySelectorAll('.radio-item').forEach(el=>el.classList.remove('selected'));
  document.querySelectorAll('.field-error').forEach(el=>el.classList.remove('field-error'));
  document.querySelectorAll('.field-error-msg').forEach(el=>el.style.display='none');
  document.getElementById('checklist-error-msg').style.display='none';
  const btn=document.getElementById('btn-submit');btn.disabled=false;btn.innerHTML='<span>💾</span> บันทึกข้อมูล';
  document.getElementById('main-form').style.display='block';
  document.querySelector('.progress-bar-wrap').style.display='';
  document.querySelector('.progress-text').style.display='';
  document.getElementById('success-screen').style.display='none';
  setDefaultDate();
  document.getElementById('progress-bar').style.width='0%';
  localStorage.removeItem(FORM_STATE_KEY);
  updateSelectAllBtn();
}

// ================================================================
//  CLEAR ALL
// ================================================================
function clearAll(){
  if(!confirm('ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?'))return;
  resetForm();
  showToast('🗑 ล้างข้อมูลทั้งหมดแล้ว','');
}

// ================================================================
//  FONT SIZE
// ================================================================
function setFontSize(size){
  document.body.classList.remove('font-small','font-medium','font-large');
  if(size!=='medium')document.body.classList.add('font-'+size);
  document.querySelectorAll('.font-btn').forEach(b=>b.classList.toggle('active',b.dataset.size===size));
  localStorage.setItem(FONT_KEY,size);
}
function restoreFontSize(){
  const s=localStorage.getItem(FONT_KEY)||'medium';
  setFontSize(s);
}

// ================================================================
//  FORM STATE PERSISTENCE (localStorage)
// ================================================================
let saveTimer;
function saveFormState(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    try{
      const state={
        q1:document.getElementById('q1-date').value,
        q2:document.getElementById('q2-room').value,
        q3h:document.getElementById('q3-pharmacist').value,
        q3s:document.getElementById('q3-pharmacist-search').value,
        q4h:document.getElementById('q4-assistant').value,
        q4s:document.getElementById('q4-assistant-search').value,
        q5h:document.getElementById('q5-drug-val').value,
        q5s:document.getElementById('q5-drug-search').value,
        q6:document.getElementById('q6-material').value,
        q7:document.getElementById('q7-diff-old').value,
        q8:document.getElementById('q8-diff-new').value,
        checks:{},
        q93h:document.getElementById('q9-3-counter').value,
        q93s:document.getElementById('q9-3-counter-search').value,
        q99:document.getElementById('q9-9-note').value,
        q10:[],
        simDrugs:[],
      };
      // Save checks
      [...MAIN_CHECKS,'check_other'].forEach(n=>{state.checks[n]=document.querySelector(`[name="${n}"]`).checked;});
      // Save Q10
      document.querySelectorAll('[name="q10"]:checked').forEach(c=>state.q10.push(c.value));
      // Save similar drugs
      document.querySelectorAll('#similar-drug-list .similar-drug-entry').forEach(entry=>{
        const m=entry.id.match(/\d+/);if(!m)return;
        state.simDrugs.push({
          drug:document.getElementById(`sim-drug-val-${m[0]}`)?.value||'',
          drugS:document.getElementById(`sim-drug-search-${m[0]}`)?.value||'',
          diff:document.getElementById(`sim-diff-${m[0]}`)?.value||'',
        });
      });
      localStorage.setItem(FORM_STATE_KEY,JSON.stringify(state));
    }catch{}
  },300);
}

function restoreFormState(){
  try{
    const raw=localStorage.getItem(FORM_STATE_KEY);if(!raw)return;
    const s=JSON.parse(raw);
    if(s.q1)document.getElementById('q1-date').value=s.q1;
    if(s.q2)document.getElementById('q2-room').value=s.q2;
    if(s.q3h){document.getElementById('q3-pharmacist').value=s.q3h;document.getElementById('q3-pharmacist-search').value=s.q3s||s.q3h;}
    if(s.q4h){document.getElementById('q4-assistant').value=s.q4h;document.getElementById('q4-assistant-search').value=s.q4s||s.q4h;}
    if(s.q5h){
      document.getElementById('q5-drug-val').value=s.q5h;document.getElementById('q5-drug-search').value=s.q5s||s.q5h;
      const label=document.getElementById('drug-name-label');if(label)label.textContent=s.q5h;
      const info=document.getElementById('selected-drug-info');if(info)info.style.display='block';
    }
    if(s.q6)document.getElementById('q6-material').value=s.q6;
    if(s.q7)document.getElementById('q7-diff-old').value=s.q7;
    if(s.q8)document.getElementById('q8-diff-new').value=s.q8;
    // Restore checks
    if(s.checks){Object.keys(s.checks).forEach(n=>{
      const c=document.querySelector(`[name="${n}"]`);if(c){c.checked=s.checks[n];toggleCheck(c);}
    });}
    if(s.checks?.check_change_counter)toggleChangeCounter();
    if(s.checks?.check_other)toggleOtherNote();
    if(s.q93h){document.getElementById('q9-3-counter').value=s.q93h;document.getElementById('q9-3-counter-search').value=s.q93s||s.q93h;}
    if(s.q99)document.getElementById('q9-9-note').value=s.q99;
    // Restore Q10
    if(s.q10?.length){
      s.q10.forEach(v=>{const cb=document.querySelector(`[name="q10"][value="${v}"]`);if(cb)cb.checked=true;});
      handleQ10Change();
    }
    // Restore similar drugs
    if(s.simDrugs?.length){
      s.simDrugs.forEach(sd=>{
        addSimilarDrug();
        const id=similarDrugCount;
        if(sd.drug)document.getElementById(`sim-drug-val-${id}`).value=sd.drug;
        if(sd.drugS)document.getElementById(`sim-drug-search-${id}`).value=sd.drugS;
        if(sd.diff)document.getElementById(`sim-diff-${id}`).value=sd.diff;
      });
    }
    updateSelectAllBtn();
    updateProgress();
  }catch(e){console.warn('Restore failed:',e);}
}

function initAutoSave(){
  const form=document.getElementById('main-form');
  form.addEventListener('change',saveFormState);
  form.addEventListener('input',saveFormState);
}

// ================================================================
//  TOAST
// ================================================================
let toastTimer;
function showToast(msg,type=''){
  const el=document.getElementById('toast');el.textContent=msg;el.className='show '+type;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',3500);
}
