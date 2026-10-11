const DB_NAME = 'warungAzdifaDB';
let db, cart = {}, activeCategory = '', payMethod = 'tunai', currentPhoto = null, currentDebtCustomerId = null;

function idr(n){ return 'Rp ' + Math.round(n).toLocaleString('id-ID'); }
let confirmResolve = null;
function customConfirm(msg, title='Konfirmasi'){
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmModalBg').classList.add('show');
  return new Promise(res=>{ confirmResolve = res; });
}
document.getElementById('confirmYesBtn').addEventListener('click', ()=>{
  document.getElementById('confirmModalBg').classList.remove('show');
  if(confirmResolve){ confirmResolve(true); confirmResolve = null; }
});
document.getElementById('confirmNoBtn').addEventListener('click', ()=>{
  document.getElementById('confirmModalBg').classList.remove('show');
  if(confirmResolve){ confirmResolve(false); confirmResolve = null; }
});

function logActivity(action, name, details){
  put('activityLog', { date: new Date().toISOString(), action, name, details: details||'' });
}
const ACTIVITY_LABELS = {
  add_product: { label:'Produk Ditambahkan', color:'var(--green)' },
  edit_product: { label:'Produk Diubah', color:'var(--orange-dark)' },
  delete_product: { label:'Produk Dihapus', color:'var(--red)' },
  add_stock: { label:'Stok Ditambahkan', color:'var(--green)' },
  add_category: { label:'Kategori Ditambahkan', color:'var(--green)' },
  rename_category: { label:'Kategori Diubah', color:'var(--orange-dark)' },
  delete_category: { label:'Kategori Dihapus', color:'var(--red)' }
};
async function renderActivityLog(){
  const logs = (await getAll('activityLog')).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const box = document.getElementById('activityLogList');
  box.innerHTML = logs.length===0 ? '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Belum ada aktivitas tercatat</div>' :
    logs.map(l=>{
      const meta = ACTIVITY_LABELS[l.action] || { label:l.action, color:'var(--ink-soft)' };
      const d = new Date(l.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div class="history-item">
        <div class="history-top"><span>${l.name}</span><span class="tag" style="background:none;color:${meta.color};font-weight:700;">${meta.label}</span></div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${d}</div>
        ${l.details?`<div style="font-size:12px;color:var(--ink);margin-top:3px;">${l.details}</div>`:''}
      </div>`;
    }).join('');
}
document.getElementById('rowActivityLog').addEventListener('click', ()=>{
  renderActivityLog();
  document.getElementById('activityLogModalBg').classList.add('show');
});
document.getElementById('btnCloseActivityLog').addEventListener('click', ()=>{
  document.getElementById('activityLogModalBg').classList.remove('show');
});
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}
function compressImage(file, maxSize=300, quality=0.7){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxSize){ h = h*(maxSize/w); w = maxSize; } }
        else { if(h>maxSize){ w = w*(maxSize/h); h = maxSize; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, 8);
    req.onupgradeneeded = e=>{
      const d = e.target.result;
      if(!d.objectStoreNames.contains('products')) d.createObjectStore('products',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('transactions')) d.createObjectStore('transactions',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('customers')) d.createObjectStore('customers',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('payments')) d.createObjectStore('payments',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('categories')) d.createObjectStore('categories',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('opnames')) d.createObjectStore('opnames',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('settings')) d.createObjectStore('settings',{keyPath:'key'});
      if(!d.objectStoreNames.contains('partners')) d.createObjectStore('partners',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('consignments')) d.createObjectStore('consignments',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('activityLog')) d.createObjectStore('activityLog',{keyPath:'id',autoIncrement:true});
    };
    req.onsuccess = e=>resolve(e.target.result);
    req.onerror = e=>reject(e);
  });
}
function tx(store, mode){ return db.transaction(store, mode).objectStore(store); }
function getAll(store){ return new Promise((res,rej)=>{ const r = tx(store,'readonly').getAll(); r.onsuccess=()=>res(r.result); r.onerror=rej; }); }
function put(store, obj){ return new Promise((res,rej)=>{ const r = tx(store,'readwrite').put(obj); r.onsuccess=()=>res(r.result); r.onerror=rej; }); }
function del(store, id){ return new Promise((res,rej)=>{ const r = tx(store,'readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=rej; }); }
function clearStore(store){ return new Promise((res,rej)=>{ const r = tx(store,'readwrite').clear(); r.onsuccess=()=>res(); r.onerror=rej; }); }

let currentTabView = 'kasir';
let preSettingsView = 'kasir';
function switchView(view, pushHistory){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.id==='view-'+view));
  if(view==='stok') renderStok(document.getElementById('searchStok').value);
  if(view==='laporan') renderLaporan();
  if(view==='hutang') renderHutang(document.getElementById('searchHutang').value);
  if(view==='titipjual') renderTitipJual(document.getElementById('searchPartner').value);
  if(view==='pengaturan'){ loadProfileForm(); loadFeatureSettings(); }
  document.getElementById('fabStokWrap').classList.toggle('show', view==='stok');
  document.getElementById('fabHutang').style.display = view==='hutang' ? 'flex' : 'none';
  document.getElementById('fabTitip').style.display = view==='titipjual' ? 'flex' : 'none';
  document.getElementById('fabStokWrap').classList.remove('expanded');
  if(pushHistory && view!==currentTabView) history.pushState({view}, '');
  if(view!=='pengaturan') preSettingsView = view;
  currentTabView = view;
}
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> switchView(btn.dataset.view, true));
});
document.getElementById('btnOpenSettings').addEventListener('click', ()=> switchView('pengaturan', true));
document.getElementById('fabTitip').addEventListener('click', ()=> openConsignCreate());

// ---------- TOMBOL BACK HP (biar gak langsung keluar app) ----------
let isPopStateClose = false;
let suppressPopstateCount = 0;
history.replaceState({view:'kasir'}, '');
window.addEventListener('popstate', e=>{
  if(suppressPopstateCount>0){ suppressPopstateCount--; return; }
  const openModal = document.querySelector('.modal-bg.show');
  if(openModal){
    isPopStateClose = true;
    openModal.classList.remove('show');
    isPopStateClose = false;
    return;
  }
  const view = (e.state && e.state.view) ? e.state.view : 'kasir';
  switchView(view, false);
});
const modalBackObserver = new MutationObserver(mutations=>{
  mutations.forEach(m=>{
    const el = m.target;
    const isShown = el.classList.contains('show');
    const wasShown = el.dataset.wasShown === '1';
    if(isShown && !wasShown){
      el.dataset.wasShown = '1';
      if(!isPopStateClose) history.pushState({modal:el.id}, '');
    } else if(!isShown && wasShown){
      el.dataset.wasShown = '0';
      if(!isPopStateClose){ suppressPopstateCount++; history.back(); }
    }
  });
});
document.querySelectorAll('.modal-bg').forEach(el=>{
  modalBackObserver.observe(el, { attributes:true, attributeFilter:['class'] });
});

async function renderCatChips(){
  const products = await getAll('products');
  const cats = [...new Set(products.map(p=>p.category).filter(Boolean))];
  const box = document.getElementById('catChips');
  box.innerHTML = ['<div class="chip '+(activeCategory===''?'active':'')+'" data-cat="">Semua</div>']
    .concat(cats.map(c=>`<div class="chip ${activeCategory===c?'active':''}" data-cat="${c}">${c}</div>`)).join('');
  box.querySelectorAll('.chip').forEach(c=>{
    c.addEventListener('click', ()=>{ activeCategory = c.dataset.cat; renderCatChips(); renderProdGrid(document.getElementById('searchProd').value); });
  });
}

async function renderProdGrid(filter=''){
  const products = await getAll('products');
  const grid = document.getElementById('prodGrid');
  let list = products.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase()));
  if(activeCategory) list = list.filter(p=>p.category===activeCategory);
  list.sort((a,b)=>a.name.localeCompare(b.name,'id'));
  if(products.length===0){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>Belum ada produk.<br>Tambahkan dulu di tab Stok.</div>';
    return;
  }
  if(list.length===0){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Tidak ditemukan</div>';
    return;
  }
  grid.innerHTML = list.map(p=>`
    <button class="prod-btn ${p.stock<=0?'out':''}" data-id="${p.id}">
      ${(p.isConsignable && consignFeatureEnabled) ? `<span class="consign-badge" title="Bisa dititip jual"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/></svg>Titip</span>` : ''}
      ${p.photo ? `<img class="prod-img" src="${p.photo}">` : `<div class="prod-ph"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--orange-dark)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div>`}
      <div class="prod-body">
        <div class="nm">${p.name}</div>
        <div class="pr">${idr(p.price)}</div>
        <div class="st">${p.stock<=0?'Stok habis':'Stok: '+p.stock}</div>
      </div>
    </button>
  `).join('');
  grid.querySelectorAll('.prod-btn').forEach(b=>{
    b.addEventListener('click', ()=>addToCart(parseInt(b.dataset.id)));
  });
}

async function addToCart(id){
  const products = await getAll('products');
  const p = products.find(x=>x.id===id);
  if(!p || p.stock<=0) return;
  const inCart = cart[id]?.qty || 0;
  if(inCart >= p.stock){ showToast('Stok tidak cukup'); return; }
  cart[id] = { ...p, qty: inCart+1 };
  showToast(p.name+' ditambahkan');
  updateFab();
}

function openCart(){ renderCart(); refreshDebtCustomerSelect(); document.getElementById('cartModalBg').classList.add('show'); }
function closeCart(){ document.getElementById('cartModalBg').classList.remove('show'); updateFab(); }

document.getElementById('btnCancelCart').addEventListener('click', async ()=>{
  if(Object.keys(cart).length===0){ closeCart(); return; }
  if(!(await customConfirm('Semua produk di keranjang akan dihapus.', 'Batalkan keranjang ini?'))) return;
  cart = {};
  document.getElementById('cashGiven').value = '';
  refreshDebtCustomerSelect();
  closeCart();
});

function cartTotalVal(){ return Object.values(cart).reduce((s,i)=>s+i.price*i.qty,0); }

function updateFab(){
  const items = Object.values(cart);
  const count = items.reduce((s,i)=>s+i.qty,0);
  const fab = document.getElementById('fabCart');
  if(count>0){
    fab.classList.add('show');
    document.getElementById('fabBadge').textContent = count;
    document.getElementById('fabTotal').textContent = idr(cartTotalVal());
  } else {
    fab.classList.remove('show');
  }
}
document.getElementById('fabCart').addEventListener('click', openCart);

function renderCart(){
  const items = Object.values(cart);
  const box = document.getElementById('cartItems');
  box.innerHTML = items.length===0 ? '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>Keranjang kosong</div>' : items.map(i=>`
      <div class="cart-item">
        <div class="nm">${i.name}<br><span style="color:var(--ink-soft);font-weight:400;">${idr(i.price)}</span></div>
        <div class="qty">
          <button data-act="dec" data-id="${i.id}">−</button>
          <span>${i.qty}</span>
          <button data-act="inc" data-id="${i.id}">+</button>
        </div>
      </div>
    `).join('');
  const total = cartTotalVal();
  document.getElementById('cartTotal').textContent = idr(total);
  document.getElementById('btnCheckout').disabled = items.length===0;
  box.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = parseInt(b.dataset.id);
      if(b.dataset.act==='inc'){
        if(cart[id].qty < cart[id].stock) cart[id].qty++; else showToast('Stok tidak cukup');
      } else {
        cart[id].qty--;
        if(cart[id].qty<=0) delete cart[id];
      }
      renderCart(); updateChange(); updateFab();
    });
  });
  updateChange();
}

function updateChange(){
  const total = cartTotalVal();
  const given = parseFloat(document.getElementById('cashGiven').value) || 0;
  document.getElementById('changeAmt').textContent = idr(Math.max(0, given-total));
}
document.getElementById('cashGiven').addEventListener('input', updateChange);

document.querySelectorAll('.pay-opt').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('.pay-opt').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
    payMethod = el.dataset.pay;
    document.getElementById('cashBox').classList.toggle('hidden', payMethod!=='tunai');
    document.getElementById('debtBox').classList.toggle('hidden', payMethod!=='hutang');
  });
});

async function refreshDebtCustomerSelect(){
  document.getElementById('debtCustomerValue').value = '';
  document.getElementById('debtCustomerLabel').textContent = '— Pilih pelanggan —';
  document.getElementById('debtCustomerBtn').classList.add('placeholder');
  document.getElementById('debtNewName').classList.add('hidden');
  document.getElementById('debtNewName').value = '';
}
document.getElementById('debtCustomerBtn').addEventListener('click', async ()=>{
  const customers = await getAll('customers');
  const list = document.getElementById('customerPickerList');
  const rows = customers.map(c=>`<div class="picker-row" data-id="${c.id}" data-name="${c.name}">${c.name}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
    </div>`).join('');
  list.innerHTML = rows + `<div class="picker-row add" data-id="__new__">+ Tambah pelanggan baru
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>`;
  list.querySelectorAll('.picker-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const val = row.dataset.id;
      document.getElementById('debtCustomerValue').value = val;
      document.getElementById('debtCustomerLabel').textContent = val==='__new__' ? '+ Tambah pelanggan baru' : row.dataset.name;
      document.getElementById('debtCustomerBtn').classList.remove('placeholder');
      document.getElementById('debtNewName').classList.toggle('hidden', val!=='__new__');
      document.getElementById('customerPickerModalBg').classList.remove('show');
    });
  });
  document.getElementById('customerPickerModalBg').classList.add('show');
});
document.getElementById('btnCloseCustomerPicker').addEventListener('click', ()=>{
  document.getElementById('customerPickerModalBg').classList.remove('show');
});

document.getElementById('searchProd').addEventListener('input', e=>renderProdGrid(e.target.value));
document.getElementById('btnCloseCart').addEventListener('click', closeCart);

document.getElementById('btnCheckout').addEventListener('click', async ()=>{
  const items = Object.values(cart);
  if(items.length===0) return;
  const total = cartTotalVal();
  const given = parseFloat(document.getElementById('cashGiven').value) || 0;
  let customerId = null, customerName = null;

  if(payMethod==='tunai' && given < total){ showToast('Uang diterima kurang'); return; }

  if(payMethod==='hutang'){
    const selVal = document.getElementById('debtCustomerValue').value;
    if(selVal==='__new__'){
      const name = document.getElementById('debtNewName').value.trim();
      if(!name){ showToast('Isi nama pelanggan baru'); return; }
      customerId = await put('customers', { name });
      customerName = name;
    } else if(selVal){
      const c = (await getAll('customers')).find(x=>x.id===parseInt(selVal));
      if(!c){ showToast('Pelanggan tidak ditemukan'); return; }
      customerId = c.id; customerName = c.name;
    } else {
      showToast('Pilih atau tambah nama pelanggan'); return;
    }
  }

  for(const i of items){
    const p = (await getAll('products')).find(x=>x.id===i.id);
    if(p){ p.stock = Math.max(0, p.stock - i.qty); await put('products', p); }
  }
  await put('transactions', {
    date: new Date().toISOString(),
    items: items.map(i=>({name:i.name, price:i.price, qty:i.qty, costPrice:i.costPrice||0})),
    total, payMethod, cashGiven: payMethod==='tunai'?given:total, voided:false,
    customerId, customerName
  });
  cart = {}; document.getElementById('cashGiven').value = '';
  refreshDebtCustomerSelect();
  closeCart(); updateFab();
  renderCatChips(); renderProdGrid(document.getElementById('searchProd').value);
  showToast('Transaksi berhasil: '+idr(total));
});

async function renderStok(filter=''){
  const allProducts = await getAll('products');
  const products = filter ? allProducts.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())) : allProducts;
  const box = document.getElementById('stokList');
  const emptyMsg = allProducts.length===0 ? 'Belum ada produk' : 'Produk tidak ditemukan';
  box.innerHTML = products.length===0 ? `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>${emptyMsg}</div>` : products.map(p=>`
    <div class="stock-row">
      ${p.photo?`<img class="stock-thumb" src="${p.photo}">`:`<div class="stock-ph"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--orange-dark)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div>`}
      <div class="info">
        <div class="nm">${p.name}${(p.isConsignable&&consignFeatureEnabled)?'<span class="consign-badge-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/></svg>Titip</span>':''}</div>
        <div class="meta">${p.category?p.category+' · ':''}${idr(p.price)} · <span class="${p.stock<=3?'low':''}">Stok: ${p.stock}</span></div>
      </div>
      <div class="acts"><button data-id="${p.id}">Edit</button></div>
    </div>
  `).join('');
  box.querySelectorAll('.acts button').forEach(b=>{
    b.addEventListener('click', ()=>openProductModal(parseInt(b.dataset.id)));
  });
}
document.getElementById('searchStok').addEventListener('input', e=> renderStok(e.target.value));

function setCategoryField(value){
  document.getElementById('prodCategoryValue').value = value;
  document.getElementById('prodCategoryLabel').textContent = value ? value : '— Pilih kategori —';
  document.getElementById('prodCategoryBtn').classList.toggle('placeholder', !value);
}
document.getElementById('prodCategoryBtn').addEventListener('click', async ()=>{
  const cats = await getAll('categories');
  const list = document.getElementById('categoryPickerList');
  list.innerHTML =
    `<div class="picker-row" data-val="">Tanpa kategori</div>` +
    (cats.length===0 ? '<div class="empty" style="padding:16px 0;">Belum ada kategori.<br>Tambah dulu di tab Stok.</div>' :
      cats.map(c=>`<div class="picker-row" data-val="${c.name}">${c.name}</div>`).join(''));
  list.querySelectorAll('.picker-row[data-val]').forEach(row=>{
    row.addEventListener('click', ()=>{
      setCategoryField(row.dataset.val);
      document.getElementById('categoryPickerModalBg').classList.remove('show');
    });
  });
  document.getElementById('categoryPickerModalBg').classList.add('show');
});
document.getElementById('btnCloseCategoryPicker').addEventListener('click', ()=>{
  document.getElementById('categoryPickerModalBg').classList.remove('show');
});

async function openProductModal(id=null){
  document.getElementById('prodId').value = '';
  document.getElementById('prodName').value = '';
  setCategoryField('');
  document.getElementById('prodCostPrice').value = '';
  document.getElementById('prodPrice').value = '';
  document.getElementById('prodStock').value = '';
  document.getElementById('prodConsignPrice').value = '';
  document.getElementById('prodIsConsign').checked = false;
  document.getElementById('prodConsignPriceBox').classList.add('hidden');
  document.getElementById('prodPhoto').value = '';
  currentPhoto = null;
  document.getElementById('photoPreview').classList.remove('show');
  document.getElementById('btnRemovePhoto').style.display = 'none';
  document.getElementById('btnDeleteProduct').style.display = 'none';
  document.getElementById('productModalTitle').textContent = 'Tambah Produk';
  if(id){
    const p = (await getAll('products')).find(x=>x.id===id);
    if(p){
      document.getElementById('prodId').value = p.id;
      document.getElementById('prodName').value = p.name;
      setCategoryField(p.category || '');
      document.getElementById('prodCostPrice').value = (p.costPrice !== undefined && p.costPrice !== null) ? p.costPrice : '';
      document.getElementById('prodPrice').value = p.price;
      document.getElementById('prodStock').value = p.stock;
      document.getElementById('prodConsignPrice').value = (p.consignPrice!==undefined && p.consignPrice!==null) ? p.consignPrice : '';
      document.getElementById('prodIsConsign').checked = !!p.isConsignable;
      document.getElementById('prodConsignPriceBox').classList.toggle('hidden', !p.isConsignable);
      document.getElementById('productModalTitle').textContent = 'Edit Produk';
      document.getElementById('btnDeleteProduct').style.display = 'block';
      if(p.photo){
        currentPhoto = p.photo;
        const pv = document.getElementById('photoPreview');
        pv.src = p.photo; pv.classList.add('show');
        document.getElementById('btnRemovePhoto').style.display = 'block';
      }
    }
  }
  document.getElementById('productModalBg').classList.add('show');
}
function closeProductModal(){ document.getElementById('productModalBg').classList.remove('show'); }

document.getElementById('btnCloseProduct').addEventListener('click', closeProductModal);
document.getElementById('prodIsConsign').addEventListener('change', e=>{
  document.getElementById('prodConsignPriceBox').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('prodPhoto').addEventListener('change', async e=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const dataUrl = await compressImage(file);
    currentPhoto = dataUrl;
    const pv = document.getElementById('photoPreview');
    pv.src = dataUrl; pv.classList.add('show');
    document.getElementById('btnRemovePhoto').style.display = 'block';
  }catch(err){ showToast('Gagal memuat foto'); }
});
document.getElementById('btnRemovePhoto').addEventListener('click', ()=>{
  currentPhoto = null;
  document.getElementById('prodPhoto').value = '';
  document.getElementById('photoPreview').classList.remove('show');
  document.getElementById('btnRemovePhoto').style.display = 'none';
});

document.getElementById('btnSaveProduct').addEventListener('click', async ()=>{
  const name = document.getElementById('prodName').value.trim();
  const category = document.getElementById('prodCategoryValue').value;
  const costPrice = parseFloat(document.getElementById('prodCostPrice').value);
  const price = parseFloat(document.getElementById('prodPrice').value);
  const stock = parseInt(document.getElementById('prodStock').value);
  const isConsignable = document.getElementById('prodIsConsign').checked;
  const consignPriceRaw = document.getElementById('prodConsignPrice').value;
  const consignPrice = (!isConsignable || consignPriceRaw==='') ? null : parseFloat(consignPriceRaw);
  if(!name || isNaN(costPrice) || isNaN(price) || isNaN(stock)){ showToast('Lengkapi semua data termasuk Harga Modal'); return; }
  const idVal = document.getElementById('prodId').value;
  const obj = { name, category, costPrice, price, stock, photo: currentPhoto, consignPrice, isConsignable };

  if(idVal){
    obj.id = parseInt(idVal);
    const oldP = (await getAll('products')).find(x=>x.id===obj.id);
    await put('products', obj);
    if(oldP){
      const changes = [];
      if(oldP.name!==name) changes.push('Nama: "'+oldP.name+'" → "'+name+'"');
      if((oldP.category||'')!==category) changes.push('Kategori: '+(oldP.category||'-')+' → '+(category||'-'));
      if(oldP.costPrice!==costPrice) changes.push('Harga modal: '+idr(oldP.costPrice||0)+' → '+idr(costPrice));
      if(oldP.price!==price) changes.push('Harga jual: '+idr(oldP.price)+' → '+idr(price));
      if(oldP.stock!==stock) changes.push('Stok: '+oldP.stock+' → '+stock);
      if(changes.length>0) logActivity('edit_product', name, changes.join(' · '));
    }
  } else {
    await put('products', obj);
    logActivity('add_product', name, 'Modal '+idr(costPrice)+' · Jual '+idr(price)+' · Stok awal '+stock);
  }

  closeProductModal();
  renderStok(); renderCatChips(); renderProdGrid();
  showToast('Produk disimpan');
});

document.getElementById('btnDeleteProduct').addEventListener('click', async ()=>{
  const idVal = document.getElementById('prodId').value;
  if(!idVal) return;
  if(!(await customConfirm('Produk yang dihapus tidak bisa dikembalikan.', 'Hapus produk ini?'))) return;
  const delP = (await getAll('products')).find(x=>x.id===parseInt(idVal));
  await del('products', parseInt(idVal));
  if(delP) logActivity('delete_product', delP.name, 'Produk dihapus permanen');
  closeProductModal();
  renderStok(); renderCatChips(); renderProdGrid();
  showToast('Produk dihapus');
});

// ---------- FAB STOK (speed-dial) ----------
document.getElementById('fabStok').addEventListener('click', ()=>{
  document.getElementById('fabStokWrap').classList.toggle('expanded');
});
document.getElementById('actAddProduct').addEventListener('click', ()=>{
  document.getElementById('fabStokWrap').classList.remove('expanded');
  openProductModal();
});
document.getElementById('actOpname').addEventListener('click', ()=>{
  document.getElementById('fabStokWrap').classList.remove('expanded');
  startOpnameFlow();
});
document.getElementById('actAddStock').addEventListener('click', ()=>{
  document.getElementById('fabStokWrap').classList.remove('expanded');
  openStockAddPicker();
});

// ---------- TAMBAH STOK (restock produk yang sudah ada) ----------
let stockAddSelectedId = null;

async function openStockAddPicker(){
  document.getElementById('stockAddSearch').value = '';
  await renderStockAddPickerList('');
  document.getElementById('stockAddPickerModalBg').classList.add('show');
}
async function renderStockAddPickerList(filter){
  const products = await getAll('products');
  const list = products.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase()));
  const box = document.getElementById('stockAddPickerList');
  box.innerHTML = list.length===0 ? '<div class="empty">Produk tidak ditemukan</div>' : list.map(p=>`
    <div class="picker-row" data-id="${p.id}">${p.name}<span style="color:var(--ink-soft);font-weight:400;font-size:12px;">Stok: ${p.stock}</span></div>
  `).join('');
  box.querySelectorAll('.picker-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      document.getElementById('stockAddPickerModalBg').classList.remove('show');
      openStockAddModal(parseInt(row.dataset.id));
    });
  });
}
document.getElementById('stockAddSearch').addEventListener('input', e=> renderStockAddPickerList(e.target.value));
document.getElementById('btnCloseStockAddPicker').addEventListener('click', ()=>{
  document.getElementById('stockAddPickerModalBg').classList.remove('show');
});

async function openStockAddModal(productId){
  const p = (await getAll('products')).find(x=>x.id===productId);
  if(!p) return;
  stockAddSelectedId = productId;
  document.getElementById('stockAddName').textContent = p.name;
  document.getElementById('stockAddCurrent').textContent = 'Stok saat ini: '+p.stock+' · Modal saat ini: '+idr(p.costPrice||0);
  document.getElementById('stockAddThumb').innerHTML = p.photo
    ? `<img class="opname-thumb" src="${p.photo}">`
    : `<div class="opname-thumb-ph"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--orange-dark)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div>`;
  document.getElementById('stockAddQty').value = '';
  document.getElementById('stockAddCost').value = '';
  document.getElementById('stockAddPreview').textContent = '';
  document.getElementById('stockAddModalBg').classList.add('show');
}
function updateStockAddPreview(){
  getAll('products').then(products=>{
    const p = products.find(x=>x.id===stockAddSelectedId);
    const box = document.getElementById('stockAddPreview');
    const qty = parseFloat(document.getElementById('stockAddQty').value);
    const batchCost = parseFloat(document.getElementById('stockAddCost').value);
    if(!p || isNaN(qty)){ box.textContent=''; return; }
    let lines = 'Stok jadi: '+(p.stock+qty);
    if(!isNaN(batchCost)){
      const oldCost = p.costPrice || 0;
      const newAvgCost = ((p.stock*oldCost) + (qty*batchCost)) / (p.stock+qty);
      lines += ' · Modal baru: '+idr(newAvgCost);
    }
    box.style.color = 'var(--green)';
    box.textContent = lines;
  });
}
document.getElementById('stockAddQty').addEventListener('input', updateStockAddPreview);
document.getElementById('stockAddCost').addEventListener('input', updateStockAddPreview);
document.getElementById('btnCancelAddStock').addEventListener('click', ()=>{
  document.getElementById('stockAddModalBg').classList.remove('show');
  openStockAddPicker();
});
document.getElementById('btnConfirmAddStock').addEventListener('click', async ()=>{
  const qty = parseInt(document.getElementById('stockAddQty').value);
  const batchCost = parseFloat(document.getElementById('stockAddCost').value);
  if(isNaN(qty) || qty<=0){ showToast('Isi jumlah yang valid'); return; }
  if(isNaN(batchCost) || batchCost<0){ showToast('Isi harga modal batch ini'); return; }
  const products = await getAll('products');
  const p = products.find(x=>x.id===stockAddSelectedId);
  if(!p) return;
  const oldCost = p.costPrice || 0;
  const newAvgCost = Math.round(((p.stock*oldCost) + (qty*batchCost)) / (p.stock+qty));
  const stockBefore = p.stock;
  p.stock += qty;
  p.costPrice = newAvgCost;
  await put('products', p);
  logActivity('add_stock', p.name, 'Stok: '+stockBefore+' → '+p.stock+' (+'+qty+') · Modal batch: '+idr(batchCost)+' · Modal rata-rata jadi: '+idr(newAvgCost));
  document.getElementById('stockAddModalBg').classList.remove('show');
  renderStok(document.getElementById('searchStok').value); renderProdGrid();
  showToast('Stok '+p.name+' bertambah '+qty+' (modal rata-rata jadi '+idr(newAvgCost)+')');
});

// ---------- JAM REAL-TIME ----------
function updateHeaderClock(){
  const now = new Date();
  document.getElementById('headerDayDate').textContent = now.toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}
updateHeaderClock();
setInterval(updateHeaderClock, 1000);

// ---------- PROFIL TOKO ----------
let currentLogo = null;
const DEFAULT_STORE_ICON = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAABBmlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGCSYAACFgMGhty8kqIgdyeFiMgoBQYkkJhcXMCAGzAyMHy7BiIZGC7r4lGHC3CmpBYnA+kPQFxSBLQcaGQKkC2SDmFXgNhJEHYPiF0UEuQMZC8AsjXSkdhJSOzykoISIPsESH1yQRGIfQfItsnNKU1GuJuBJzUvNBhIRwCxDEMxQxCDO4MTGX7ACxDhmb+IgcHiKwMD8wSEWNJMBobtrQwMErcQYipAP/C3MDBsO1+QWJQIFmIBYqa0NAaGT8sZGHgjGRiELzAwcEVj2oGICxx+VQD71Z0hHwjTGXIYUoEingx5DMkMekCWEYMBgyGDGQCSpUCz8yM2qAAAKHNJREFUeNrtfXmYVMd17zlVt/fpnoUZGEAIkDSswiDEIsDIIFkLL46x5bw4jmNnceLPVpwokqzYsR3bkhwnsS3ZyYv1bAUldhwrz3GkJJ8Uy7JAMgIhrAWxbzMwwMAszN7bvX1vVZ33R3U3PTPdzSAxPQPU+eaD7tv3Vt2q+tXZqwpPfGExGDL0domZLjBkAGTIAMiQAZAhAyBDhgyADBkAGTIAMmQAZMiQAZAhAyBDBkCGDIAMGTIAMmQAZMgAyJABkCFDBkCGDIAMGQAZMgAyZABkyJABkCEDIEMGQIYMgAwZMgAyZABkyADIkAGQIUMGQIYMgAwZABkyADJkyADIkAGQoQlA1sR5FSpxHS/8kcue0ACoEARExBAYIAARIBb8hAAERISII6BDhMMvX86U643sNyKACdB8a9w7hSFYnDlCKUU5CA2fbX6ucVbw3gwVgSuvUB7EEAKcKSJJ48yNrPFFj4WY9OSLzfHX25KJjBo6ybLoQYAbZ0Q+cH1t2GKKAIAsxrqS3r/v7m3pdRCQcncSEAJCBT/QOdZwMT/kqii4VtAzCBD2sxumR25ritWELKEIr0AAEQBHSLjyka0d//pmT0aWu/nnRwaqQ/wDi+synkJEYPijN7v/btvZ4XC7kujJXb2/8a7az98yfVKYjyMfssaR/yCD/zk08C9v9HgKGIIqDYWkS96MaMO7p2fSLiKiz0q/3gNw5eIHERTAT/b0X1cf+uRNDUNVxysDQIiQEfDLlrhGT8DPZjSGfByH6IoIWlFcubDurjtnWtV+HvEREPPzP/rwdZ2D7rEzSYaMRqJopFgo8xOVtmpoFAbPxaorL6lIgfCAStyKIBW09QjbVQTw8vHBjy6dVOVn48WErHHiPsAQhKIBRwCAIljcVP2dLy6bVMVVQU9olZoxnFoXjPhAOkIrB1J4y+fV/OBrK3oH3ZJDckFjfyFPFLGihz2ZnwNY7n0IcjqUVqYQiAAYoudSVwcIMZKpEBHjmBTwuSfaX9ibBIBBR7qScJRvf1laYZoiIWvO9HBtFQdBw72bBCSUFOeMVgSUnqwN8bqq8OVlqRMwDi4H8IGAIQDKg5KBLTEWYrknkMbVLzRRHIlSUcaVKgNSELKRbHu4xwMRlSAS6nJz9TACT4FHShSRSUTAGWUkk2qi6H4TBUAIwBAZQ2I0SvcYIiBcXn5EzLbq3N9IUYnIcAK5oidUKIOIcrpjoa5R4OcBHCH8znsFR/w6TEcZ+XWUg32hD+L5tOmhRVGx32mCGZ4TCEAMERkwhjhshuGID0WlfvkrIz9j2a+jxNCFPlj+ZswxIQZKFTHMtfHB0MTCRsxYAvAkCQlKArKLzYHofJxj1Izk3CsMK4dGzbTK+68YkgSQSBKLWWHACDw51GdGVySACqU8Auw/Fv/EV14LWFgQ8BofN2GpWiv1NgikwLGRqDgyESTBrmPOOUUQr1QO5EnKCNImVc+A+/MdZ8HQBUh8UASOUJlxjSiPT0IZEVgMd55KHu1xtPp8fiUCgTFkDDkb1YxjDBkDVlJfKNBfsODm0ZaMjJXXv4a886hLzt4/GqaiABCgbcDddjzOEOnK4UA6jNrvyKf29sYdhQgW4ILqQIQzRVR0qBVAc9Lt8yQAcM4XLVoQjUallCV6GtvaTp05cwYAOdCCWKDW4pKolObelRGtKVcBMIZNTdc1NExWSpYYYNbX19/S0iyEAICrw76rgj5VuuSkkIcSGY8AAKZMmTJ79uxSPcI4s217//79nucBQMzH5lQFfAhFy0aEjKID8YwLYHv01N6+9dfFGsKWVOMgzqzxYT8W7mhObmtNMERFtGpS6LFlM2IWSqKR0SSLYYcjf/dXJ/uEAqL58+dv2rTpqquu8jyPseIc9IEHHvjJT34CiNMC/BtLpi2tDjpCjeQCiiDo40+09j10oIsUhMPhBx544Nd//f2ZjDOyZKVUIBB4+eWX77777t7eXgb4GzNq7pvb4HmyqLnkY6wl7X7ytbajKQGklixZ8t3vfjcQCCilhuGeiDjn/f39n/zkJ1999VVArLH4NxdPa6rye0phMUPMJbx315lnOxOM4Zun0y82x3/7hknjktdhjQv7GXDkT/f0pFxiiAGEP5hdtzDmV0LiCONIKeA+vrMnfTLtabTdfvvty5cvL8Pl4/F4W1ubHpmZYf+N1cFGH1MW4oj4lFLE/dwiEooIIBgIzJo1s7FxSpn3nzlzZjgc7u3tVUBM0fQAl5xYUXMJocoKzqkKHE16ANDW1haJRBobG0uVPH369F/7tV979dVXGWKH4zXHnXUNYSkkG5FeJwm4xf/omrqt3cmkAlfRU3v7bm2qrh+PvA5Wefbj47i9NfHKiaQGxLvrIxumRqWQUoGUkP1XglQgJBCRK9Sz7YNpSUQUi8XWr1+PiEIIGkFSSiJqbm7OAgjo2oiv3uKepOGF6z8CkjSYy2v0+/3hcCRfTtHCQ6FQMBjUbRlwBUmlhpWZe3lPQpRBU5VfG1KdnZ2HDh0qVbhuzs033zx58mRS5BE80z6YdCUoEENL9iQoBdKT6xoit0+pIiKGuOtManPzIMcSMu+yAZBmP32OfGpvb8olAAgy/J2ZNZMDXClimDVK838AwDlrTrm/6rMBGREtWrRo5cqVWhPCEtTc3Nzb28sQOeKC6pDFAaBI4YjAEJFgwMtqPIFAIBaLYVmKRqOhUEjzgkEhlQKuQyrDSwYAYgwXxIIBhgwxkUgcOnSoVLGccwBYsmTJihUrCAiRvTXg7I9nOEcAGlYyQ1BEMR/72MzamMUAwJXw1N7ezqTHWaW16coCiMjiuP144pUTKc1+VteF3jc1pqQqaSwx3N6Takm5DAER169f39DQMFKNyJcPAIcOHUqn04Qsytn86mAp942WZhJowMtGZP2BQDQahRK56vpiVVVVjgPRoKcy53E70pxYoM7HFTLP8w4ePFjSxEQkomg0esstt1iWhQjtjnipO1lKK0ZEJdStk6PvnRxRRBzxrTP2luY4Z1hhHsQqyn4YDtia/SgACCL+3uy6+gCXikq57ROe2nI2KQhIqdra2g0bNpRBJ2PMtu3Dhw/rr7U+NjfiB1XOQeBISOZC+oFAIMddSlIwGMxzoJQgW5YM/SIgKLou7J8csEApADh6tHlgYIAxRqUH+bbbbps6dapSSgG+dDbZ7cqiTAUBJFGVD39vVl2MIwG5kp7a29uR8CxWUTnGKsp+GG5rTew4kdRMeG19eENjVJUYAyLgnB1NuK90p4AxAlixYsWiRYtKcQi99qezs7O5uVl/v7bK3xi0iKiUwo0INpEttUsFotFoOBwu34RQKFRdXa2/2kqlJAFSKde1IqgP8LlRv75w8kTr6dOn85yyKIebM2fOmjVrNOt9vc/eN+gwxkoY8yiFWtcQuWNKVBEwxF1n0lua4wwvRw5EAByx35Y/3dOb8ggRQww/Nqu23s/lCEv13EMIL3YnOzOSASDinXfeGY1GS8kvTR0dHcePH0cAALq+OhSyUJYybgkQwJYqnfOfFOg3pa1Wy4rFYnoAM5LSSuWXhRRlEj6GC6tD2i10qq3t1KlTZQAkpfT7/Rs2bOCcI9GAUC90JSQAQgn3GFHUYh+fVVttMQDwFDy1p7czKTirXAyoUgAi8HF8+Xh856kUQ5SK3j0p/L8aS6JBy7tBV73QmVAApNTVV1+9du3a81Z06NChwcFB7VReGPP7SrtodW6NLVU6J8JisZhlWWXUlPxtegBtSSmhzuM/R1gYC/iRANFxHK0GYWnNBgBWrVo1b948HQrb3Jk864hSqjEiSqnWTY7cntOE9nTYm48OVlITYpVhPxaDXls+va8/q/0w+Pis2kl+Xoo9aIXmjQF796CDOfm1cOHCImtUC/VKpfbt26e/1lpsblXgvBGSlFCpHAfSsqlMFZpzZAFEYCuVyoKv9LJsRU0Rf0PA0vft378/k8lolbmop5uIZs+evXbtWgJgjB1Juq/2pZGXkGIAiqiKs9+dVVdtoQLKSHp6X1973PNVShOqCAci4Ay2H0+8knM9r5kUvn1KVEhJBKrEnwR6qSvZ7Uok8vl8t956q9/vF0IopWQxIiIdDdAMb2bE3xj2S6UUkSKQRaogpQEksklasVisVOF5UkpFo1EdrbIlJT2lAHXhw6qQBEQglJoUsq7L6vJw4MCBeDyuvUFFSQjBOV+/fn0kEgFSCak2dyVcRQpoZBMkAQF4Qq6tj7x3cpS0JnQ6vbk5jpVShawKsB/GoM9W/76nxxaEiDGL3X1dw+QqP3gSrJFpNQhAgHjWkS91JwGZIrVg7tyNGzcios/nK1NXT09Pa2srAACpBbHgtVV+BsR5froOTSwiAosrQFsqrWRMmTKFMVYqPKKdT/o2bllCiIwkQcR8PAhFs4SyX6f72eLa8NbeNACcPHmys7OzoaGhVC26ig0bNixevHjHjh2AbHt3qs0R11YFQKlSWUg+zj7T1PByT6rHU4Lgqb29t82JTY5YFXBMjz2ACPwWe/n44GttKUQgojq/73ja++fm3mzka0QCqwIIMDyUyOwedPTVUCj0zDPPWJZVSr4QkWVZ+/btO9vVlQWTK350YsArqaGDAghy9mZ/Oq2U3qZh9+7dP/zhD0vHaEEp5fP5du7cSUQA5BI80xGPe8qWipWePwHG2m1Pfx0cHHz88ceXL18uhCgjKBHR7/frLjmcdP/uaM/ymlCmlLjXgVtF9QGr280wxL0d9i+ODv7+sgbpqbFGEJ74wuKxjZsyHMjIP36q9eXWpHa1X8HLkcd4LLOWARDB8qvC//Tha2tCXEga0xD92HIgArA49KTk3g678OLou6NQwRyNq4negeqoowoTsJZRTjkq+O9wt9OTkvUR7smx5UGViMYT5HJ4CUa/IoVGePpH0+kXah0MW+RwocgYfXPU263iQpuTrY4qxOYrms5BALdbVR/x15RyjmUlOoBN8HeZnqPkAtGiRYvuvffeUChUSjvRSoPP5/v+97+/ZcsWYNhA/N5g/XS0XCBWLH1efw4i+4WX/JHbDwCcsfvuv3/lypW2bZfidkqpYDB44MCBv/nrv3YyGQD4oC/2QV+1Q0ov5yq6Ot4C1kfy25nuNhJAtHLlynvuuac8knS6wWOPPbZz505AvAqs+4INNcgkUBmVzg/43178aS8OFVw3VjkA6f6dwwP/21/tlU59IgSLIA70Y7f/KAAQNDY23nXXXdXV1WXUW52TtXnz5i1btgBgGPEOKzqfBRySrERnSoAosh4pfpRdS4M333zz+973Ps/zeM5yGwkgy7IaGxu/9a1vQSYDAAt58Dd91SkqqUQrAD/iGRL/lOltQwSiGTNm/NZv/VYZ9GgfmOu6zz77rAZQNbD3WdFpaLnlAEQh5C3SfRrilWQKlU4oc4kSSglSuZXfw1faEQEHSILOKkUAEkKk02nGWHnLJRAI6HxQXVaaZJKkQ6o0gAgAnALNwbZtz/Pi8XgZAFVVVdm2nR9+lyhBKp2F6chlR6iA/MRSOpoKAACe5yUSCaVUeQAppfLNUQApUAmSXm7vqaIAEgCZIYrQ5QggBOBZXQiGuonxXBAjK/Ipz8+1e0bnAJXhQIW/MkAEYICltQfkQ3ULXYWmMq6gQgGH2bfVtRRfDcmG1qKbo7W6UhJZV1H4a74tOLrmVEyEjdOqjNFB7R0iFSvXFjp/S/AdtWXCEqtMHTynM8uSGycNGxWUuYFRSpVh+HltVMcHdH8TgBgFSgmgcPmFjoec19DL1gIA52rB8sOvCqyw0dQyrNVydHGtwlazbFbkpQ8gIrA4RAJZ7ttP0jsfE0IAG1SclL4pkUhoHai82eJ53sDAgP7mkIqTYudWnJXUcOMk826C/v7+8w4tIg4MDAgh9OgkSMrzzQcGkCBpUxYN8XjccZzybi1EdBxncHBQd1WCVIoUw/KdRhKgn7LgDvtYZTLLxhZACKAIIj7WGPVpzeeQzPSQ4KUBpIA4Yqtyu0noK62trSdPniyTaKHjGJ2dncePHwcATtRP8pB0yuxBoJ0FaVAHZQYAGDKl1J7du8sYevm69u7d67ouZwwADsvMAEhWujkExACbpXtWCd3Xp06dOn36tM/nKwVWIvL5fO3t7UePHtVF9JM6plwOqEr7PjjgIKkDMqMbXR+xwn6mxj4WNsYAQhCK6sLW4mlhAEDAFuW+LFIB5EX7grIMH5/zEn0kGem1fH3PPPOMUqpUjyul/H7/iy++ePjwYUQkRQLgeZHsB2UBqhImWAjZXuW8KlOQY1Sbt2w5evRoMBjU6waHPyJlIBBoa2t77rnn8k7iXdJ5XaaDyGSJ5nDAFNDPRcIGAkUM8cTJk88//7y2s0o1hzH2s5/97MyZM4iogf4/XtxBKjXxFFAQ+a9ker+09bSZNyVUF7bE2CNozEWYIvBzXDs7GgswBHCBNmX6jqhMFLkEUgV73igABRRlfItIPu0NQs7QR8Qf//jHL7zwQiwWE0IULotRSgkhYrHYwYMHv/vd72aXGjJEwG0i9f/c/iBjCCALaqEcevpAPub0dpNERJ1809zc/Pd///dCiEAgMGzZkJTSsizO+WOPPbZ7927GmA5hJkB9z+ltBxFBpjWVwuYAUITx//YGn/Pi2bAxIin1+OOPv/baazU1NTo7ZWRzduzYsWnTJigI4PxMJJ5x41XMIiA5tBYJFEF2irz/m+lNAiFQ0MK1s6MBjhXgQPzP1jaOteGuFE2J+Q+fTR/tyVgMO5Q4JjPvskLTuY9R3kaFAKAP2RaZ/LLTeYqEzhzS9nkymdy1a1dTU9P8+fPzMXkdsg6Hw/v377/vvvt27typp7VeKiWAdkunGvm7eCiEDIB0LRZgCFkXyK/bZ58ScUDMR50Qcd++fa7rrly5Mp/4rNfchEKhTCbzne9859FHH9XuGf0MQzyhvE7p3WCFp+C53BQOEESGyP5LxB9yunpB5ZvDGOvv7z9w4MD1118/e/Zs7TLQtr3f7w+FQjt27Lj33nsPHz6cbQ4AImaI9kqnkVnzrFCAzs1+H2AQWSuJL9udW2SKIyqClVdH/nhNo59jBTbeHHMA6Z1WQz6cGgtsOx4fdBRneFy5O0RKAESZ5WdIiGmkI5R5wu3/W6f7JHmcMUW0fPny+ob6zo5Oy7K6u7s3b948ODhYU1OjF9a4rnvq1Kknn3zyL/7iL15//XXLsqSUM2fOXLRo0clTpxhjaaCXveRp5VUxHkLGED2ELhAviOTDztlnRQIZ04tp1q5d29bWpsG3Y8eOPXv2hMPhqqoqzrmUcmBgYMeOHQ899NDjjz/uuq5WktavX6+1e87YQem8JtKAGGXcD0whJID2qcxjbu+jTnc3St2clStXRCKRnp4ey7La2tq2bNli23ZNTU0gENDZcMePH//BD37wxS9+8fDhw9nmzJo1a9bszs4Ozlg/yJe91FkSUW6FkCGiC9QO3rMi8bDdtVWmOUNJVBdiX7rtqoVTQqIiS+XHNp1jiDbA4Kl9/Q8+f3rAURZDoYgBzEDfbOYPMzagZIvKnCUJDDmgVGre/HmbNj2Rybif+MTvn2g94fP59NSfPHnynDlzamtrU6lUS0uLTlO3LEsIUVtb+8gjj9y0atWnP/WprVu3csZ0PnU1sCYWaGBcAJxSXqtyXSTOuBZMn33ggU996tMPPfTgPz3xBABYnAspA4FAU1PTjBkzEFHrs+l0mnOuBc2HPvQb3/jmN376058++NWv2LZjcS6U5ASzmH8W8wUAe0k2y0wfKGCMA0illi5d+o+bNrW2tv7JZ/64o6NTvzAATJ8+vampKRqNxuPx5ubm9vb2fHPq6iZ98UtfmTp12sMPf/XQwf2cMUkERHXAm7h/EloOqJPSPUGeBOAMpaKwDz9/y7SPL6uvmCt67EVYAR+aPzk0rTpw5Kzdm84azwMgTyivWblt5KUYcGSkiIhWr1nzyCPfXrRo8bRp05bcsOTwoUN6QYwWZ6dOnTp69Ghra+vg4GB+UGfOnPlXf/31D3zgg7FY9U2rVrefOX3kyBEi4ozZCO0gW5R7HLxeUISIBIpULBZ74M8/95nP/ElVVdVNN61yPW/P3t2eJzTj6erqamlpaW5u7uzs1JmmUkrG2Mc+9vGHHv5afX3D4sVL6uomvbVrVzKVQgDgvA9UK3nNyjsD0kbgiKQUEa1ff8sjj357zpy5s2dfM3fu3L379naf7dbNGRwcPHHixNGjR0+ePJlIJPLNmX3Ntff82WeXL1teVRW9/vpFnZ0der02R5ZGOqO8ZuW2Kq8fs3yGCKbHrM+un/aRG+or6R2uEIDyjGh+Y/DGq6o8obpTQifYs5zXmAiI6Nprr/nDP/yjv/zLr86dO9dxHCHE7NnXrF+33rJ4R2dnztMzxOitr6/fuHHj1/7q67esv9V1Xc/z6uvrb731vQ2TGzo7Orq7uyG7eWfubCmicCSybv26Bx98+CMf+W0AdN1MMBRe9573XHfdtT29PRoxI4IY7IYbln7u85+/5557otGY4ziIuGz5iqU33phMJDq7OhzbAco5nnRjiJqamj59991f+vKXZ86cadu2lGre/Hlr165VUnV2dsbj8ZHNaWiYfNvtd3z67j9duHCh67pSivr6hhuXrYhGq/v6evsH+vNaYz6zoDbE39sU+8J7p2+YW42VPfegQiKs0K/otzDtqbfa02+2pX5xZPCt9rTWiG+//fY77rzzppWr5i9YIKXMZDJawdT2MyIeOHBg69aX9u7Zc/r06XQ6HQgEGhsbFy68fu3NNy9demMgEMhnYuiwecAfaD1x7Jdbt775xhsnTpyIx+OcsYbJDXPnzF21es3qVaura2ps2845EhUiC4VCZ892bd+2befOnS3Hmvt6+wiopqb22muvXbFixdq1N0+fPt1xHCmVdmwSUTgcTiaTv/rVq69s337o8OHus12eJ6qisauvnrF06dJ171nX1DTXE15+MxqdEyKl3LNn99atW/fv29ve3m7bdigUmjZt2uIlSxYuXFRTM4lx7mYyuUfIsizLZ506eXL/vr2vvb5z+7aXpRAEsGBK6M651ctmRJZOj0QDzBVU4S2CKg0gyJ0p5+OIiI/tOPv1LWcIIBgMPfnkv71/48aBgUHXdWFoCqJePhYMBjnntm0nk0nXdX0+KxKJhMMRInAcW7tPCqeyDtH7/D7XySRTKdu2GWeRcDgSqeKcO44jhMcYL3wxIuXz+bQZn0wmbTtNAKFgqKqqyufzua6rlehCZ6NSknMrFAwpUqlUKp1KCqmCwWAkEgmGgsITmlcNfUQhYigUQkTbTqdSKdd1fX5/JBKpqqrq6jzb3HwMERDZsHAN5zwaje3e89YD9/9ZPD4IAJ9ZM+Vzt0zlAK6kMguSxo7GYYMp3UbHU5whFoTcpRSJRNK27ZFLLzQyNLdgjEWjUc0AlJSpVCpvBg+LBiBiJpPJZBxkLBwOV0WqCEgp5TiO7utC9EB2w0omhHBdlzGWXyqvlHJdV+NgZAiCMa6USqaSWvmtqa3TK9SUkslEAqDoI4yI0um0/hyLxRCZUqSUTCVT+jri8OYAgOd56XRKegILjhPxhHJJb488DlHXcdtks2i0j/Nyq2r0T/lFVYUXz/cISCllLnJaPis5v9lKYTgzf7HUI7rAYXHfYQAt+ggRCSHzUV3OOWO8zOJJxtjwA2IQxnHr+gm00fioGRi+LZ6HFamoEo8UtuVKPzO1TMyy/CYKoy+nqNy5WOUX5YLvsHDNxhhDHaIbxSqO8VwoZU1M9DDG9E4r9M4yEhhjUirHsYfpsH6f3x/wK1LvsOd1HojjZArzRhjj4XBY5yi9jRcOh0PBYEjvDKzTVMrk8oLhQCPRwzl3PW/zs8+88cZrdtoGxCLHGEDZc910ugZBTW3te25et2z5MilkvvxAINDR2fGLnz/XcuxYVmWhYlO66BkJQ4UHAi5fseLOO++0GNe+Jo4s42We/s//2LN79/C3Ot87EwBjmE7biXgSEZGxadOmr169pqGhwfO80hgiA6BzhjRjzPO8b37jb77/ve9ps+sd0qZ/fPwrX3nwox/9qJPJAEEgEGhpab7/vntfeeWV8omOo6TYj//1//zDP7z/Ax9MpVIEEImE/us//v2zn73fTqUvisK3ZcsL99//5zNnzszn2E8oYhMMQCoYDP3yly9977HHbNvmnDMEnZRe/A+H/sHwfzm3us92f/vRR1paWgL+gF7TvumJf9y2bVs2Vx/gnfxxxuKDgw/v3vPRjs4/aO/4g/b232nv+Nvde+xUmp+38MJ3HtaK/AFqiPv37Xn6qZ9eFKxfCSIMAdTu3budTIZzLoFgUj34fEUTqZGoeLZY9qhVJMemeJwxdvr06YMHD86bN18I0dffv2/PXq27KL8famrKCsKCo9yh6Ek/CpvmtKxa1dLXC5pDuB7cfDPufkuePJkTvsXPBkMFWHpfIQRS8UGWySDikSOHBuPx6lisBBMySvRQHch19RZMCqIxdu99dF0TuJmR63OCSeHLSEAcomDonVuUwmBQ7NiafvIJUFII4bqO7mXhCddziQiJ4PpF7E/+lCyr+Olcw/WXEu6syVNYLIpCELcACJSEpiZ6+K9Qx+BKEJcqFBeozi30OodM7apX0v6X74tdrxGA53lqourRE9eMR0SwLJg9GxYsAMcGZMNmGg4KbgvSWzIPHQiSkoUj8lgzFJzTW6D85j5HozhvnrIsJJXXikf9irn/hUeeB1jwcp4HsRjW1Q1hWkMBSYJYn4uKYOju/ASIRICAUkFVbJgvywDowimTITsNjgMjPc6OUBmR92cP2SNBKeKchFviSOPcvVKSbYPPIvUOkq9GHtmFCFKQ8MoJakGU8UAVPVmXADG7q/4FYdkAqKhjBBjXByENHwSmgLGiy59QP1gUE0N3/QDOsyVf3Cle/iA4nY3B5JA1uoW2qFaeECcISi4ZK+xtqNyl3AGje4bIbHZ1JQOozPwfpT6DlwN+0ABoTEQ7TfTOv2RQcokCCMfkeZog+ieN7ewxAHong0BlfsXhuu7EnB5Ytq00YcB2eSrReAEIpEuxrRNHnl3OOhBWoI5x6g0yAKqADlSBbazGa3qgscIqMDh4WbXJWGFjMEeH35FbQIg0yjmORJcKIIwnegy6eLhXmfHsKSqjHR0avxglTciirlwzHtHygWMjAHIru13LaDgQGHpHZF0a8CjNgXTuOiJztzznvvAsu/qa0Ic/jjV1QIpGU8UlgyCTzjFGXUYElk91nLGf/Gfqaof9e/i0qwJ3fQRGKcfwUlG16bzzyIiwt9exhIxTKgnplE7hUL09BZr0KPA3cacHGSvsHSHjAkYBERgCKb2wY/SicPzyRC8T7WsCi7BRHaqV+6Qovy0OKoVUODWw9MDhpaMEkbHCxkYMIAIpDAbB8mVhVBUFHGWQiy4vZ6MB0NvQThBJeKxxWmDjb+LVs32rb/aveY/ePx5HoXsYM/6KFmHncMBZ8AO/6X/3LSwSgaqocjPoD4yK318OZrxZF3YR2JUiQpzSSEqB8M6T0H7hvgJDlyCA6IJiYQgIIFwAzJ5bfGnrxZeM1XZpi7DhvDu3enW0wVR9HLBSoFRFPYoIoIgUZc8iGL53B+kTEUaNGbMu7GJPYRrlrm+cYzhElh9IDcVk4cmVI4/RxRLbtBS9Z2Q5BIgoFMu4TBLhCAQRASIqCdYlMDqXtggrpT1iGXgVhll7uuHFl5BzJKqkMkQAIEmkBCoaiqwc8pChVNTTZQBUISusKAcYWSKRCgT8oWBQb98EBw6oL31hyMgNgeXYfQABIM47QfTGxUTBYMjn8xNRac+EscLG3uRFBE+Imtq6VavXbN++PbuNoRTj/aZD9kIbggXK7qy/9MZlsezeLmg40MUUYRcII0RAKcQnPvGJ021t//mfTzuOMzG0OCql1fn9/vesu2Xjxg8SGStsDEQYXZgIA0QUQjQ0TP7GN79114c+1HbqVE4JoQJnQH7yl7xCRbZQvFiNxkQi2d8/gMgQccqUKYsWvUsfoqg3xTJW2MUXAKMUYfkR8jwvEAjcccedE3DLJsZYV1d3W9vp/LtlMhmzS+v4iLAyGFJKpVKp8+w+VunmZk/DSKWS6XQ6j5hR7BNtAHSxrbDzcvYJOyqMMcY4Y+xCXs9kJI4N87piwlxXng5ExValZ49oGya59EnI+RPjRsKkmKRDXdhQAZGniQ39ci858tdCKw4vewCRjvOUWI2FOFSwEIFeuIUIjA3ZZBOz7B6geAyLgIbJAF2yNm0mtFmA+h0RkRUTcIDIkA0/bAV1BIR0lKSiSLIqOLeAMfBbTChyhJIKrKFbBCIwhugpmdugOXtYRLZ/MG9TZwNGSHSur4Zqw3gumkGY+y2HIRxhrr0NnlSodhRxNF9IIUN8icg0AJg+zX4EA9JbL2LhnPQUEikEDFro58yVSlYwNFypU5sJfBwHHPnKicRbp1PdKSEJGEJLj7Ov0yYCy+Kr17x72tSpSql9+/cdOngIEcgfwGXLqLoGlBwOEALLIyZVyfosn2pvE4cPACgEXHnTTbNmzRaei8iG7xVeMmJa9EO+/tFacKMGafbsesfJpFM2Dp0a+Tg9t/jgwMCut97wXA8A5k0OLpgSUgQcoTbEF0+LrL0mWh+xvEqdfVkJABGBxfFoj/Po1o5ftiRSnhrGtAvt2CEX6Tw9T+cduWKFXx6UP6+u8GLQwtUzq+5bN3XJ1LAnK4EhqzLoOT3ofvX5tm2tKS3iVaEaWGxoL8p4v70Dly4dS3N40xhCRsKLxxL9tnjk/TPn1AcrgCFr7CcKKIB/e6t3W2uKMVSKuGXVxKot7jNb7F4oKSlVcasTpZKpVEIIwRm+1W7/8I3uB++YcclzIH3I9+m49/yRAQAgRVVVVRvu3Dhv7vXnJNfwg0xKSaohMSksoslCsa9vuwsvopOaRqjMw1VpKjyMYcRr6IMcCGBgYNB2HIas4GiHc60+ffrktu2bk4lBBNh6LNGV8K6q9o31QeBjDCAAjpBw6GS/B4hEtOj6JWtWr1NKEdFQLWUU/T/MSTgSPwAlj6Yrf894XyGA4l2RtThJR1KlBMvyM8aKbo20aNGNPT1dr72+HQA74iKRIY5jHqypgAhDSeQIpe3S2tp6IPA8t6ifw1B5klJKqZQqqjUqxngsVqO/ZSRIgstBiS6i+uWcZQYQb8fNWDKKh4jjsOHaeABowscTJrLlVT7KUfm4WKUBxBhnnDPGGTMc6IKJc845L8qBiJBzXnnFoNIAct1MKpXMZBzUB6OX1vDIrBodwWPS6ZRtOyOVaO3xEkJ4XubyBBAD0A6MN9589dixI0qRQcfbsGmFEErJnG48zDsAiCyVSuQsvFzkeoyF2pgDSCoKWVgXtnrSgiMMDPQPDPQbMIyVlg3AESRBdZCHLFRjr2uOrchEBE/StJjvw0vqEEAa1XnMmVS2kzcurJkW81UgpGqN9YRQAAELP7V6ypSo7422VNqT2qmKeQ90zs868qu5p8g9heufc1tiFzi5KWixxdMid72rLmChUGO+g1ZFovEAHAERU6461ySjA130XsZsV0d8DAAlVWL/tUoo0VnhpVTIQuM/HHtjDaQCwArt3lchK0wbCQrMnnIV6e0KTtKK+oEM87n8yEQ0DRkAGTIAMmQAZMgAyJAhAyBDBkCGDIAMGQAZMmQAZMgAyJABkCEDIEOGDIAMGQAZMgAyZABkyJABkCEDIEMGQIYMgAwZABkyZABkyADIkAGQIQMgQ4YMgAwZABkyADJkAGTIkAGQIQMgQwZAhgyADBkyADJkAGRoItD/B/V+EYHO7IQQAAAAAElFTkSuQmCC">`;

async function getProfile(){
  try{ return await new Promise((res,rej)=>{ const r=tx('settings','readonly').get('profile'); r.onsuccess=()=>res(r.result); r.onerror=rej; }); }
  catch(e){ return null; }
}

let consignFeatureEnabled = true;
async function getFeatureSettings(){
  try{ return await new Promise((res,rej)=>{ const r=tx('settings','readonly').get('features'); r.onsuccess=()=>res(r.result); r.onerror=rej; }); }
  catch(e){ return null; }
}
function applyConsignVisibility(){
  document.getElementById('navTitipJual').classList.toggle('hidden', !consignFeatureEnabled);
  document.getElementById('prodConsignSection').classList.toggle('hidden', !consignFeatureEnabled);
  document.getElementById('chipFilterTitipan').classList.toggle('hidden', !consignFeatureEnabled);
  if(!consignFeatureEnabled && currentTabView==='titipjual'){
    switchView('kasir', true);
  }
}
async function loadFeatureSettings(){
  const f = await getFeatureSettings();
  consignFeatureEnabled = f ? !!f.consignEnabled : true;
  document.getElementById('toggleConsignFeature').checked = consignFeatureEnabled;
  applyConsignVisibility();
}
document.getElementById('toggleConsignFeature').addEventListener('change', async e=>{
  consignFeatureEnabled = e.target.checked;
  await put('settings', { key:'features', consignEnabled: consignFeatureEnabled });
  applyConsignVisibility();
  showToast(consignFeatureEnabled ? 'Titip Jual diaktifkan' : 'Titip Jual dinonaktifkan');
});
async function renderHeader(){
  const profile = await getProfile();
  document.getElementById('headerStoreName').textContent = (profile && profile.storeName) ? profile.storeName : 'Warung Azdifa';
  document.getElementById('headerLogoBox').innerHTML = (profile && profile.logo) ? `<img src="${profile.logo}">` : DEFAULT_STORE_ICON;
}
function setLogoPreviewUI(logo){
  const preview = document.getElementById('settingLogoPreview');
  const placeholder = document.getElementById('settingLogoPlaceholder');
  const removeBtn = document.getElementById('btnRemoveLogo');
  if(logo){
    preview.src = logo; preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    removeBtn.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    removeBtn.classList.add('hidden');
  }
}
async function loadProfileForm(){
  const profile = await getProfile();
  document.getElementById('settingStoreName').value = (profile && profile.storeName) ? profile.storeName : 'Warung Azdifa';
  currentLogo = (profile && profile.logo) ? profile.logo : null;
  setLogoPreviewUI(currentLogo);
  document.getElementById('settingLogoInput').value = '';
}
async function saveProfile(){
  const storeName = document.getElementById('settingStoreName').value.trim() || 'Warung Azdifa';
  await put('settings', { key:'profile', storeName, logo: currentLogo });
  renderHeader();
}
document.getElementById('settingLogoInput').addEventListener('change', async e=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const dataUrl = await compressImage(file, 200, 0.8);
    currentLogo = dataUrl;
    setLogoPreviewUI(currentLogo);
    await saveProfile();
    showToast('Logo diperbarui');
  }catch(err){ showToast('Gagal memuat logo'); }
});
document.getElementById('btnRemoveLogo').addEventListener('click', async ()=>{
  currentLogo = null;
  document.getElementById('settingLogoInput').value = '';
  setLogoPreviewUI(null);
  await saveProfile();
  showToast('Logo dihapus');
});
document.getElementById('settingStoreName').addEventListener('blur', saveProfile);

// ---------- KELOLA KATEGORI ----------
let renamingCategoryId = null;

async function renderCategoryManage(){
  const cats = await getAll('categories');
  const products = await getAll('products');
  const box = document.getElementById('categoryManageList');
  box.innerHTML = cats.length===0 ? '<div class="empty">Belum ada kategori</div>' : cats.map(c=>{
    const count = products.filter(p=>p.category===c.name).length;
    return `<div class="cat-manage-row">
      <div class="nm">${c.name}${count>0?`<span class="meta">Dipakai ${count} produk</span>`:''}</div>
      <button data-act="rename" data-id="${c.id}">Ubah</button>
      <button class="del" data-act="delete" data-id="${c.id}">Hapus</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-act="rename"]').forEach(b=>{
    b.addEventListener('click', ()=>openRenameCategory(parseInt(b.dataset.id)));
  });
  box.querySelectorAll('button[data-act="delete"]').forEach(b=>{
    b.addEventListener('click', ()=>deleteCategory(parseInt(b.dataset.id)));
  });
}

document.getElementById('rowManageCategory').addEventListener('click', ()=>{
  document.getElementById('categoryManageModalBg').classList.add('show');
  renderCategoryManage();
});
document.getElementById('btnCloseCategoryManage').addEventListener('click', ()=>{
  document.getElementById('categoryManageModalBg').classList.remove('show');
});

document.getElementById('btnAddCategory').addEventListener('click', async ()=>{
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if(!name){ showToast('Isi nama kategori'); return; }
  const cats = await getAll('categories');
  if(cats.some(c=>c.name.toLowerCase()===name.toLowerCase())){ showToast('Kategori sudah ada'); return; }
  await put('categories', { name });
  logActivity('add_category', name, 'Kategori baru ditambahkan');
  input.value = '';
  renderCategoryManage(); renderCatChips();
  showToast('Kategori ditambahkan');
});

async function openRenameCategory(id){
  const cats = await getAll('categories');
  const c = cats.find(x=>x.id===id);
  if(!c) return;
  renamingCategoryId = id;
  document.getElementById('renameCategoryInput').value = c.name;
  document.getElementById('renameCategoryModalBg').classList.add('show');
}
document.getElementById('btnCancelRenameCategory').addEventListener('click', ()=>{
  document.getElementById('renameCategoryModalBg').classList.remove('show');
});
document.getElementById('btnSaveRenameCategory').addEventListener('click', async ()=>{
  const newName = document.getElementById('renameCategoryInput').value.trim();
  if(!newName){ showToast('Nama tidak boleh kosong'); return; }
  const cats = await getAll('categories');
  if(cats.some(c=>c.id!==renamingCategoryId && c.name.toLowerCase()===newName.toLowerCase())){ showToast('Nama kategori sudah dipakai'); return; }
  const c = cats.find(x=>x.id===renamingCategoryId);
  if(!c) return;
  const oldName = c.name;
  c.name = newName;
  await put('categories', c);
  logActivity('rename_category', newName, 'Nama diubah: "'+oldName+'" → "'+newName+'"');
  const products = await getAll('products');
  for(const p of products){
    if(p.category===oldName){ p.category = newName; await put('products', p); }
  }
  document.getElementById('renameCategoryModalBg').classList.remove('show');
  renderCategoryManage(); renderCatChips(); renderProdGrid(); renderStok();
  showToast('Kategori diperbarui');
});

async function deleteCategory(id){
  const cats = await getAll('categories');
  const c = cats.find(x=>x.id===id);
  if(!c) return;
  const products = await getAll('products');
  const inUse = products.some(p=>p.category===c.name);
  if(inUse){ showToast('Masih dipakai produk, pindahkan dulu kategorinya'); return; }
  if(!(await customConfirm('Kategori "'+c.name+'" akan dihapus.', 'Hapus kategori ini?'))) return;
  await del('categories', id);
  logActivity('delete_category', c.name, 'Kategori dihapus permanen');
  renderCategoryManage(); renderCatChips();
  showToast('Kategori dihapus');
}

// ---------- STOCK OPNAME (wizard per produk) ----------
let opnameQueue = [], opnameIndex = 0, opnameAnswers = {}, opnameStaffName = '';

async function buildOpnameQueue(){
  const products = await getAll('products');
  const categories = await getAll('categories');
  const queue = [];
  for(const cat of categories){
    const items = products.filter(p=>p.category===cat.name).sort((a,b)=>a.name.localeCompare(b.name,'id'));
    items.forEach(p=> queue.push({ ...p, categoryLabel: cat.name }));
  }
  const noCat = products.filter(p=>!p.category).sort((a,b)=>a.name.localeCompare(b.name,'id'));
  noCat.forEach(p=> queue.push({ ...p, categoryLabel: 'Tanpa Kategori' }));
  return queue;
}

async function startOpnameFlow(){
  const queue = await buildOpnameQueue();
  if(queue.length===0){ showToast('Belum ada produk untuk di-opname'); return; }
  document.getElementById('opnameStaffInput').value = '';
  document.getElementById('opnameStartModalBg').classList.add('show');
}
document.getElementById('btnOpnameStartCancel').addEventListener('click', ()=>{
  document.getElementById('opnameStartModalBg').classList.remove('show');
});
document.getElementById('btnOpnameStart').addEventListener('click', async ()=>{
  const name = document.getElementById('opnameStaffInput').value.trim();
  if(!name){ showToast('Isi nama dulu ya'); return; }
  opnameStaffName = name;
  opnameQueue = await buildOpnameQueue();
  opnameAnswers = {}; opnameIndex = 0;
  document.getElementById('opnameStartModalBg').classList.remove('show');
  document.getElementById('opnamePreviewView').classList.add('hidden');
  document.getElementById('opnameStepView').classList.remove('hidden');
  renderOpnameStep();
  document.getElementById('opnameModalBg').classList.add('show');
});
document.getElementById('btnCloseOpname').addEventListener('click', async ()=>{
  if(!(await customConfirm('Hasil yang sudah diisi akan hilang kalau belum diterapkan.', 'Batalkan stock opname ini?'))) return;
  document.getElementById('opnameModalBg').classList.remove('show');
});

function renderOpnameStep(){
  const p = opnameQueue[opnameIndex];
  document.getElementById('opnameProgress').textContent = (opnameIndex+1)+' dari '+opnameQueue.length;
  document.getElementById('opnameStepCategory').textContent = p.categoryLabel;
  document.getElementById('opnameStepName').textContent = p.name;
  document.getElementById('opnameStepSystem').textContent = 'Stok sistem: '+p.stock;
  document.getElementById('opnameStepThumb').innerHTML = p.photo
    ? `<img class="opname-thumb" src="${p.photo}">`
    : `<div class="opname-thumb-ph"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--orange-dark)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div>`;
  const input = document.getElementById('opnameStepInput');
  input.value = opnameAnswers[p.id] !== undefined ? opnameAnswers[p.id] : '';
  updateOpnameDiffDisplay();
  document.getElementById('btnOpnameBack').disabled = opnameIndex===0;
  document.getElementById('btnOpnameNext').textContent = opnameIndex===opnameQueue.length-1 ? 'Lihat Ringkasan' : 'Lanjut';
}

function updateOpnameDiffDisplay(){
  const p = opnameQueue[opnameIndex];
  const input = document.getElementById('opnameStepInput');
  const diffBox = document.getElementById('opnameStepDiff');
  const val = parseFloat(input.value);
  if(input.value==='' || isNaN(val)){ diffBox.textContent=''; return; }
  const diff = val - p.stock;
  diffBox.textContent = 'Selisih: '+(diff>0?'+':'')+diff;
  diffBox.style.color = diff>0?'var(--green)':(diff<0?'var(--red)':'var(--ink-soft)');
}
document.getElementById('opnameStepInput').addEventListener('input', updateOpnameDiffDisplay);

function saveCurrentOpnameInput(){
  const p = opnameQueue[opnameIndex];
  const val = document.getElementById('opnameStepInput').value;
  if(val==='') delete opnameAnswers[p.id];
  else opnameAnswers[p.id] = val;
}

document.getElementById('btnOpnameBack').addEventListener('click', ()=>{
  saveCurrentOpnameInput();
  if(opnameIndex>0){ opnameIndex--; renderOpnameStep(); }
});
document.getElementById('btnOpnameNext').addEventListener('click', ()=>{
  saveCurrentOpnameInput();
  if(opnameIndex < opnameQueue.length-1){ opnameIndex++; renderOpnameStep(); }
  else showOpnamePreview();
});

function showOpnamePreview(){
  document.getElementById('opnameStepView').classList.add('hidden');
  document.getElementById('opnamePreviewView').classList.remove('hidden');

  const missing = opnameQueue.filter(p=> opnameAnswers[p.id]===undefined);
  const warnBox = document.getElementById('opnameMissingWarning');
  const applyBtn = document.getElementById('btnApplyOpname');
  if(missing.length>0){
    warnBox.classList.remove('hidden');
    warnBox.textContent = missing.length+' produk belum diisi. Isi dulu semua sebelum bisa diterapkan.';
    applyBtn.disabled = true;
  } else {
    warnBox.classList.add('hidden');
    applyBtn.disabled = false;
  }

  const box = document.getElementById('opnamePreviewList');
  box.innerHTML = opnameQueue.map(p=>{
    const val = opnameAnswers[p.id];
    const idx = opnameQueue.findIndex(x=>x.id===p.id);
    if(val===undefined){
      return `<div class="history-item" data-idx="${idx}" style="cursor:pointer;">
        <div class="history-top"><span>${p.name}</span><span style="font-weight:700;color:var(--red);">Belum diisi</span></div>
      </div>`;
    }
    const physical = parseFloat(val);
    const diff = physical - p.stock;
    const color = diff<0?'var(--red)':(diff>0?'var(--green)':'var(--ink-soft)');
    return `<div class="history-item" data-idx="${idx}" style="cursor:pointer;">
      <div class="history-top"><span>${p.name}</span><span style="font-weight:700;color:${color}">${diff>0?'+':''}${diff}</span></div>
      <div style="font-size:11px;color:var(--ink-soft);">Sistem: ${p.stock} → Fisik: ${physical}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-idx]').forEach(row=>{
    row.addEventListener('click', ()=>{
      opnameIndex = parseInt(row.dataset.idx);
      document.getElementById('opnamePreviewView').classList.add('hidden');
      document.getElementById('opnameStepView').classList.remove('hidden');
      renderOpnameStep();
    });
  });
}

document.getElementById('btnOpnameBackToEdit').addEventListener('click', ()=>{
  document.getElementById('opnamePreviewView').classList.add('hidden');
  document.getElementById('opnameStepView').classList.remove('hidden');
  opnameIndex = opnameQueue.length-1;
  renderOpnameStep();
});

document.getElementById('btnApplyOpname').addEventListener('click', async ()=>{
  const missing = opnameQueue.filter(p=> opnameAnswers[p.id]===undefined);
  if(missing.length>0){ showToast(missing.length+' produk masih belum diisi'); return; }

  const entries = opnameQueue.map(p=>{
    const physical = parseInt(opnameAnswers[p.id]);
    return { productId: p.id, productName: p.name, system: p.stock, physical, diff: physical - p.stock };
  });
  if(!(await customConfirm(entries.length+' produk akan diperbarui stoknya sesuai hasil hitung fisik.', 'Terapkan hasil opname?'))) return;

  const products = await getAll('products');
  for(const e of entries){
    const p = products.find(x=>x.id===e.productId);
    if(p){ p.stock = e.physical; await put('products', p); }
  }
  await put('opnames', { date: new Date().toISOString(), staffName: opnameStaffName, entries });

  document.getElementById('opnameModalBg').classList.remove('show');
  renderStok(); renderProdGrid();
  showToast('Stock opname diterapkan: '+entries.length+' produk diperbarui');
});

document.getElementById('btnOpnameHistory').addEventListener('click', async ()=>{
  const sessions = (await getAll('opnames')).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const box = document.getElementById('opnameHistoryList');
  box.innerHTML = sessions.length===0 ? '<div class="empty">Belum ada riwayat opname</div>' : sessions.map(s=>{
    const d = new Date(s.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
    const totalDiff = s.entries.reduce((sum,e)=>sum+e.diff,0);
    const color = totalDiff<0?'var(--red)':(totalDiff>0?'var(--green)':'var(--ink-soft)');
    return `<div class="debt-row" data-id="${s.id}">
      <div><div class="nm">${d}</div><div class="sub">${s.entries.length} produk · ${s.staffName||'Tanpa nama'}</div></div>
      <div class="amt" style="color:${color}">${totalDiff>0?'+':''}${totalDiff}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('.debt-row').forEach(row=>{
    row.addEventListener('click', ()=>openOpnameDetail(parseInt(row.dataset.id)));
  });
  document.getElementById('opnameHistoryModalBg').classList.add('show');
});
document.getElementById('btnCloseOpnameHistory').addEventListener('click', ()=>{
  document.getElementById('opnameHistoryModalBg').classList.remove('show');
});

async function openOpnameDetail(id){
  const sessions = await getAll('opnames');
  const s = sessions.find(x=>x.id===id);
  if(!s) return;
  const d = new Date(s.date).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('opnameDetailTitle').textContent = 'Opname '+d+(s.staffName?' · '+s.staffName:'');
  document.getElementById('opnameDetailList').innerHTML = s.entries.map(e=>{
    const color = e.diff<0?'var(--red)':(e.diff>0?'var(--green)':'var(--ink-soft)');
    return `<div class="history-item">
      <div class="history-top"><span>${e.productName||'(produk sudah dihapus)'}</span><span style="font-weight:700;color:${color}">${e.diff>0?'+':''}${e.diff}</span></div>
      <div style="font-size:11px;color:var(--ink-soft);">Sistem: ${e.system} → Fisik: ${e.physical}</div>
    </div>`;
  }).join('');
  document.getElementById('opnameDetailModalBg').classList.add('show');
}
document.getElementById('btnCloseOpnameDetail').addEventListener('click', ()=>{
  document.getElementById('opnameDetailModalBg').classList.remove('show');
});

// ---------- TAMBAH HUTANG MANUAL ----------
document.getElementById('fabHutang').addEventListener('click', ()=>{
  document.getElementById('addDebtCustomerValue').value = '';
  document.getElementById('addDebtCustomerLabel').textContent = '— Pilih pelanggan —';
  document.getElementById('addDebtCustomerBtn').classList.add('placeholder');
  document.getElementById('addDebtNewName').classList.add('hidden');
  document.getElementById('addDebtNewName').value = '';
  document.getElementById('addDebtAmount').value = '';
  document.getElementById('addDebtNote').value = '';
  document.getElementById('addDebtModalBg').classList.add('show');
});
document.getElementById('btnCloseAddDebt').addEventListener('click', ()=>{
  document.getElementById('addDebtModalBg').classList.remove('show');
});
document.getElementById('addDebtCustomerBtn').addEventListener('click', async ()=>{
  const customers = await getAll('customers');
  const list = document.getElementById('customerPickerList');
  const rows = customers.map(c=>`<div class="picker-row" data-id="${c.id}" data-name="${c.name}">${c.name}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
    </div>`).join('');
  list.innerHTML = rows + `<div class="picker-row add" data-id="__new__">+ Tambah pelanggan baru
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>`;
  list.querySelectorAll('.picker-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const val = row.dataset.id;
      document.getElementById('addDebtCustomerValue').value = val;
      document.getElementById('addDebtCustomerLabel').textContent = val==='__new__' ? '+ Tambah pelanggan baru' : row.dataset.name;
      document.getElementById('addDebtCustomerBtn').classList.remove('placeholder');
      document.getElementById('addDebtNewName').classList.toggle('hidden', val!=='__new__');
      document.getElementById('customerPickerModalBg').classList.remove('show');
    });
  });
  document.getElementById('customerPickerModalBg').classList.add('show');
});
document.getElementById('btnSaveAddDebt').addEventListener('click', async ()=>{
  const selVal = document.getElementById('addDebtCustomerValue').value;
  const amount = parseFloat(document.getElementById('addDebtAmount').value);
  const note = document.getElementById('addDebtNote').value.trim();
  if(isNaN(amount) || amount<=0){ showToast('Isi jumlah hutang yang valid'); return; }
  let customerId;
  if(selVal==='__new__'){
    const name = document.getElementById('addDebtNewName').value.trim();
    if(!name){ showToast('Isi nama pelanggan baru'); return; }
    customerId = await put('customers', { name });
  } else if(selVal){
    customerId = parseInt(selVal);
  } else {
    showToast('Pilih atau tambah nama pelanggan'); return;
  }
  await put('payments', { customerId, amount, date: new Date().toISOString(), type:'debt', note });
  document.getElementById('addDebtModalBg').classList.remove('show');
  renderHutang(document.getElementById('searchHutang').value);
  showToast('Hutang manual ditambahkan');
});

// ---------- HUTANG ----------
async function getCustomerBalance(customerId, transactions, payments){
  const owedTx = transactions.filter(t=>t.payMethod==='hutang' && t.customerId===customerId && !t.voided).reduce((s,t)=>s+t.total,0);
  const owedManual = payments.filter(p=>p.customerId===customerId && p.type==='debt').reduce((s,p)=>s+p.amount,0);
  const paid = payments.filter(p=>p.customerId===customerId && p.type!=='debt').reduce((s,p)=>s+p.amount,0);
  return owedTx + owedManual - paid;
}

async function renderHutang(filter=''){
  const customers = await getAll('customers');
  const transactions = await getAll('transactions');
  const payments = await getAll('payments');
  const rows = [];
  for(const c of customers){
    const balance = await getCustomerBalance(c.id, transactions, payments);
    if(balance > 0) rows.push({ customer:c, balance });
  }
  rows.sort((a,b)=>b.balance-a.balance);
  document.getElementById('totalHutang').textContent = idr(rows.reduce((s,r)=>s+r.balance,0));
  const filteredRows = filter ? rows.filter(r=>r.customer.name.toLowerCase().includes(filter.toLowerCase())) : rows;
  const box = document.getElementById('debtList');
  const emptyMsg = rows.length===0
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Semua pelanggan sudah lunas'
    : 'Tidak ditemukan';
  box.innerHTML = filteredRows.length===0 ? `<div class="empty">${emptyMsg}</div>` : filteredRows.map(r=>`
    <div class="debt-row" data-id="${r.customer.id}">
      <div><div class="nm">${r.customer.name}</div><div class="sub">Tap untuk detail</div></div>
      <div class="amt">${idr(r.balance)}</div>
    </div>
  `).join('');
  box.querySelectorAll('.debt-row').forEach(row=>{
    row.addEventListener('click', ()=>openDebtModal(parseInt(row.dataset.id)));
  });
}
document.getElementById('searchHutang').addEventListener('input', e=> renderHutang(e.target.value));

async function openDebtModal(customerId){
  currentDebtCustomerId = customerId;
  const customers = await getAll('customers');
  const c = customers.find(x=>x.id===customerId);
  if(!c) return;
  const transactions = (await getAll('transactions')).filter(t=>t.payMethod==='hutang' && t.customerId===customerId && !t.voided).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const allPayments = (await getAll('payments')).filter(p=>p.customerId===customerId).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const manualDebts = allPayments.filter(p=>p.type==='debt');
  const payments = allPayments.filter(p=>p.type!=='debt');
  const balance = await getCustomerBalance(customerId, await getAll('transactions'), await getAll('payments'));

  document.getElementById('debtModalName').textContent = c.name;
  document.getElementById('debtModalBalance').textContent = idr(balance);
  document.getElementById('debtPayAmount').value = '';

  const entries = [
    ...transactions.map(t=>({date:t.date, label:'Belanja ('+t.items.length+' item)', amount:t.total, type:'owe'})),
    ...manualDebts.map(p=>({date:p.date, label:'Hutang manual'+(p.note?' · '+p.note:''), amount:p.amount, type:'owe'})),
    ...payments.map(p=>({date:p.date, label:'Pembayaran cicilan', amount:p.amount, type:'pay'}))
  ].sort((a,b)=>new Date(a.date)-new Date(b.date));
  document.getElementById('debtHistoryBox').innerHTML = entries.length===0 ? '<div class="empty">Belum ada riwayat</div>' : entries.map(e=>{
    const d = new Date(e.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
    return `<div class="history-item"><div class="history-top"><span>${d} · ${e.label}</span><span style="font-weight:700;color:${e.type==='owe'?'var(--red)':'var(--green)'}">${e.type==='owe'?'+':'-'}${idr(e.amount)}</span></div></div>`;
  }).join('');

  document.getElementById('debtModalBg').classList.add('show');
}
document.getElementById('btnCloseDebt').addEventListener('click', ()=>document.getElementById('debtModalBg').classList.remove('show'));

document.getElementById('btnAddPayment').addEventListener('click', async ()=>{
  const amount = parseFloat(document.getElementById('debtPayAmount').value);
  if(!amount || amount<=0){ showToast('Isi jumlah pembayaran'); return; }
  await put('payments', { customerId: currentDebtCustomerId, amount, date: new Date().toISOString() });
  showToast('Pembayaran dicatat');
  openDebtModal(currentDebtCustomerId);
  renderHutang();
});

// ---------- TITIP JUAL ----------
document.querySelectorAll('#titipSubTabs .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#titipSubTabs .chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    const sub = c.dataset.sub;
    document.getElementById('titip-sub-aktif').classList.toggle('hidden', sub!=='aktif');
    document.getElementById('titip-sub-piutang').classList.toggle('hidden', sub!=='piutang');
  });
});

let consignCart = [];

function openPartnerPicker(onPick){
  getAll('partners').then(partners=>{
    const list = document.getElementById('partnerPickerList');
    list.innerHTML = partners.map(p=>`<div class="picker-row" data-id="${p.id}" data-name="${p.name}">${p.name}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v9a1 1 0 001 1h14a1 1 0 001-1V9"/></svg>
      </div>`).join('') + `<div class="picker-row add" data-id="__new__">+ Tambah mitra baru
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>`;
    list.querySelectorAll('.picker-row').forEach(row=>{
      row.addEventListener('click', ()=>{
        document.getElementById('partnerPickerModalBg').classList.remove('show');
        onPick(row.dataset.id, row.dataset.name);
      });
    });
    document.getElementById('partnerPickerModalBg').classList.add('show');
  });
}
document.getElementById('btnClosePartnerPicker').addEventListener('click', ()=>{
  document.getElementById('partnerPickerModalBg').classList.remove('show');
});

let consignEditId = null;
let consignEditOriginalItems = [];

function openConsignCreate(){
  consignEditId = null;
  consignEditOriginalItems = [];
  consignCart = [];
  document.getElementById('consignCreateTitle').textContent = 'Catat Titipan';
  document.getElementById('btnSaveConsign').textContent = 'Simpan Titipan';
  document.getElementById('consignEditLockNote').classList.add('hidden');
  document.getElementById('consignPartnerValue').value = '';
  document.getElementById('consignPartnerLabel').textContent = '— Pilih mitra —';
  document.getElementById('consignPartnerBtn').classList.add('placeholder');
  document.getElementById('consignPartnerBtn').style.pointerEvents = 'auto';
  document.getElementById('consignPartnerBtn').style.opacity = '1';
  document.getElementById('consignNewPartnerName').classList.add('hidden');
  document.getElementById('consignNewPartnerName').value = '';
  renderConsignCart();
  document.getElementById('consignCreateModalBg').classList.add('show');
}

async function openConsignEdit(id){
  const consignments = await getAll('consignments');
  const c = consignments.find(x=>x.id===id);
  if(!c) return;
  const products = await getAll('products');

  consignEditId = id;
  consignEditOriginalItems = c.items.map(i=>({...i}));
  consignCart = c.items.map(i=>{
    const p = products.find(x=>x.id===i.productId);
    const availableNow = p ? p.stock : 0;
    return { productId:i.productId, name:i.name, qty:i.qtySent, price:i.price, costPrice:i.costPrice||0, maxStock: availableNow + i.qtySent };
  });

  document.getElementById('consignCreateTitle').textContent = 'Edit Titipan';
  document.getElementById('btnSaveConsign').textContent = 'Simpan Perubahan';
  document.getElementById('consignEditLockNote').classList.remove('hidden');
  document.getElementById('consignPartnerValue').value = String(c.partnerId);
  document.getElementById('consignPartnerLabel').textContent = c.partnerName;
  document.getElementById('consignPartnerBtn').classList.remove('placeholder');
  document.getElementById('consignPartnerBtn').style.pointerEvents = 'none';
  document.getElementById('consignPartnerBtn').style.opacity = '.6';
  document.getElementById('consignNewPartnerName').classList.add('hidden');
  renderConsignCart();
  document.getElementById('consignCreateModalBg').classList.add('show');
}

document.getElementById('btnCloseConsignCreate').addEventListener('click', ()=>{
  document.getElementById('consignCreateModalBg').classList.remove('show');
});
document.getElementById('consignPartnerBtn').addEventListener('click', ()=>{
  if(consignEditId!==null) return;
  openPartnerPicker((id,name)=>{
    document.getElementById('consignPartnerValue').value = id;
    document.getElementById('consignPartnerLabel').textContent = id==='__new__' ? '+ Tambah mitra baru' : name;
    document.getElementById('consignPartnerBtn').classList.remove('placeholder');
    document.getElementById('consignNewPartnerName').classList.toggle('hidden', id!=='__new__');
  });
});

document.getElementById('btnConsignAddProduct').addEventListener('click', async ()=>{
  document.getElementById('consignProductSearch').value = '';
  await renderConsignProductPicker('');
  document.getElementById('consignProductPickerModalBg').classList.add('show');
});
document.getElementById('consignProductSearch').addEventListener('input', e=> renderConsignProductPicker(e.target.value));
document.getElementById('btnCloseConsignProductPicker').addEventListener('click', ()=>{
  document.getElementById('consignProductPickerModalBg').classList.remove('show');
});
async function renderConsignProductPicker(filter){
  const products = await getAll('products');
  const list = products.filter(p=>p.isConsignable && p.name.toLowerCase().includes(filter.toLowerCase()));
  const box = document.getElementById('consignProductPickerList');
  const emptyMsg = products.some(p=>p.isConsignable) ? 'Produk tidak ditemukan' : 'Belum ada produk yang diaktifkan buat Titip Jual.<br>Centang "Bisa Dititip Jual ke Mitra" di halaman edit produk.';
  box.innerHTML = list.length===0 ? `<div class="empty">${emptyMsg}</div>` : list.map(p=>`
    <div class="picker-row" data-id="${p.id}">${p.name}<span style="color:var(--ink-soft);font-weight:400;font-size:12px;">Stok: ${p.stock}</span></div>
  `).join('');
  box.querySelectorAll('.picker-row').forEach(row=>{
    row.addEventListener('click', async ()=>{
      const id = parseInt(row.dataset.id);
      if(consignCart.some(i=>i.productId===id)){ showToast('Produk sudah ada di daftar, ubah jumlahnya di bawah'); return; }
      const p = (await getAll('products')).find(x=>x.id===id);
      consignCart.push({
        productId: p.id, name: p.name,
        qty: 1,
        price: (p.consignPrice!==undefined && p.consignPrice!==null) ? p.consignPrice : p.price,
        costPrice: p.costPrice||0,
        maxStock: p.stock
      });
      document.getElementById('consignProductPickerModalBg').classList.remove('show');
      renderConsignCart();
    });
  });
}

function renderConsignCart(){
  const box = document.getElementById('consignCartList');
  box.innerHTML = consignCart.length===0 ? '<div class="empty">Belum ada produk dipilih</div>' : consignCart.map((item,idx)=>`
    <div class="consign-item" data-idx="${idx}">
      <div class="nm">${item.name} <button data-act="remove" data-idx="${idx}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>
      <div class="fields">
        <div><label>Jumlah (stok: ${item.maxStock})</label><input type="number" inputmode="numeric" class="cc-qty" data-idx="${idx}" value="${item.qty}"></div>
        <div><label>Harga Titip (Rp)</label><input type="number" inputmode="numeric" class="cc-price" data-idx="${idx}" value="${item.price}"></div>
      </div>
      <div class="subtotal">Subtotal: ${idr(item.qty*item.price)}</div>
    </div>
  `).join('');
  box.querySelectorAll('button[data-act="remove"]').forEach(b=>{
    b.addEventListener('click', ()=>{ consignCart.splice(parseInt(b.dataset.idx),1); renderConsignCart(); });
  });
  box.querySelectorAll('.cc-qty').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const idx = parseInt(inp.dataset.idx);
      consignCart[idx].qty = parseInt(inp.value)||0;
      updateConsignCartTotal();
      box.querySelectorAll('.consign-item')[idx].querySelector('.subtotal').textContent = 'Subtotal: '+idr(consignCart[idx].qty*consignCart[idx].price);
    });
  });
  box.querySelectorAll('.cc-price').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const idx = parseInt(inp.dataset.idx);
      consignCart[idx].price = parseFloat(inp.value)||0;
      updateConsignCartTotal();
      box.querySelectorAll('.consign-item')[idx].querySelector('.subtotal').textContent = 'Subtotal: '+idr(consignCart[idx].qty*consignCart[idx].price);
    });
  });
  updateConsignCartTotal();
}
function updateConsignCartTotal(){
  const total = consignCart.reduce((s,i)=>s+(i.qty*i.price),0);
  document.getElementById('consignCartTotal').textContent = idr(total);
}

document.getElementById('btnSaveConsign').addEventListener('click', async ()=>{
  if(consignCart.length===0){ showToast('Tambah produk dulu'); return; }
  for(const item of consignCart){
    if(!item.qty || item.qty<=0){ showToast('Jumlah produk harus lebih dari 0'); return; }
    if(item.qty > item.maxStock){ showToast('Stok '+item.name+' gak cukup (sisa '+item.maxStock+')'); return; }
  }
  const selVal = document.getElementById('consignPartnerValue').value;
  let partnerId, partnerName;
  if(selVal==='__new__'){
    const name = document.getElementById('consignNewPartnerName').value.trim();
    if(!name){ showToast('Isi nama mitra baru'); return; }
    partnerId = await put('partners', { name });
    partnerName = name;
  } else if(selVal){
    const partners = await getAll('partners');
    const pt = partners.find(x=>x.id===parseInt(selVal));
    if(!pt){ showToast('Mitra tidak ditemukan'); return; }
    partnerId = pt.id; partnerName = pt.name;
  } else {
    showToast('Pilih atau tambah nama mitra'); return;
  }

  const products = await getAll('products');

  if(consignEditId!==null){
    for(const item of consignCart){
      const original = consignEditOriginalItems.find(o=>o.productId===item.productId);
      const delta = item.qty - (original ? original.qtySent : 0);
      const p = products.find(x=>x.id===item.productId);
      if(p && delta!==0){ p.stock = Math.max(0, p.stock - delta); await put('products', p); }
    }
    for(const original of consignEditOriginalItems){
      if(!consignCart.some(i=>i.productId===original.productId)){
        const p = products.find(x=>x.id===original.productId);
        if(p){ p.stock += original.qtySent; await put('products', p); }
      }
    }
    await put('consignments', {
      id: consignEditId,
      partnerId, partnerName,
      date: new Date().toISOString(),
      items: consignCart.map(i=>({ productId:i.productId, name:i.name, qtySent:i.qty, price:i.price, costPrice:i.costPrice })),
      status: 'ongoing'
    });
    showToast('Titipan diperbarui');
  } else {
    for(const item of consignCart){
      const p = products.find(x=>x.id===item.productId);
      if(p){ p.stock = Math.max(0, p.stock - item.qty); await put('products', p); }
    }
    await put('consignments', {
      partnerId, partnerName,
      date: new Date().toISOString(),
      items: consignCart.map(i=>({ productId:i.productId, name:i.name, qtySent:i.qty, price:i.price, costPrice:i.costPrice })),
      status: 'ongoing'
    });
    showToast('Titipan dicatat, stok otomatis berkurang');
  }

  document.getElementById('consignCreateModalBg').classList.remove('show');
  renderProdGrid(); renderStok(document.getElementById('searchStok').value);
  renderTitipJual(document.getElementById('searchPartner').value);
});

async function renderTitipJual(filter=''){
  const consignments = await getAll('consignments');
  const transactions = await getAll('transactions');
  const payments = await getAll('payments');
  const partners = await getAll('partners');

  const ongoing = consignments.filter(c=>c.status==='ongoing').sort((a,b)=>new Date(b.date)-new Date(a.date));
  const activeBox = document.getElementById('consignActiveList');
  activeBox.innerHTML = ongoing.length===0 ? '<div class="empty">Tidak ada titipan aktif</div>' : ongoing.map(c=>{
    const d = new Date(c.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
    return `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--line);">
      <div style="flex:1;min-width:0;"><div class="nm">${c.partnerName}</div><div class="sub">${d} · ${c.items.length} jenis produk</div></div>
      <button class="consign-act-btn ghost" data-act="edit" data-id="${c.id}" aria-label="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
      <button class="consign-act-btn primary" data-act="settle" data-id="${c.id}">Settle</button>
    </div>`;
  }).join('');
  activeBox.querySelectorAll('button[data-act="settle"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openConsignSettle(parseInt(btn.dataset.id)));
  });
  activeBox.querySelectorAll('button[data-act="edit"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openConsignEdit(parseInt(btn.dataset.id)));
  });

  const rows = [];
  for(const p of partners){
    const owed = transactions.filter(t=>t.payMethod==='titipan' && t.partnerId===p.id && !t.voided).reduce((s,t)=>s+t.total,0);
    const paid = payments.filter(pm=>pm.partnerId===p.id).reduce((s,pm)=>s+pm.amount,0);
    const balance = owed - paid;
    if(balance > 0) rows.push({ partner:p, balance });
  }
  rows.sort((a,b)=>b.balance-a.balance);
  document.getElementById('totalPiutangTitip').textContent = idr(rows.reduce((s,r)=>s+r.balance,0));
  const filteredRows = filter ? rows.filter(r=>r.partner.name.toLowerCase().includes(filter.toLowerCase())) : rows;
  const box = document.getElementById('partnerList');
  const emptyMsg = rows.length===0 ? 'Belum ada piutang titipan' : 'Tidak ditemukan';
  box.innerHTML = filteredRows.length===0 ? `<div class="empty">${emptyMsg}</div>` : filteredRows.map(r=>`
    <div class="debt-row" data-id="${r.partner.id}">
      <div><div class="nm">${r.partner.name}</div><div class="sub">Tap untuk detail</div></div>
      <div class="amt">${idr(r.balance)}</div>
    </div>
  `).join('');
  box.querySelectorAll('.debt-row').forEach(row=>{
    row.addEventListener('click', ()=>openPartnerModal(parseInt(row.dataset.id)));
  });
}
document.getElementById('searchPartner').addEventListener('input', e=> renderTitipJual(e.target.value));

let currentConsignId = null;
async function openConsignSettle(id){
  const consignments = await getAll('consignments');
  const c = consignments.find(x=>x.id===id);
  if(!c) return;
  currentConsignId = id;
  document.getElementById('consignSettlePaidNow').checked = false;
  document.getElementById('consignSettleTitle').textContent = 'Settle — '+c.partnerName;
  const box = document.getElementById('consignSettleList');
  box.innerHTML = c.items.map((item,idx)=>`
    <div class="consign-item" data-idx="${idx}">
      <div class="nm">${item.name}</div>
      <div class="fields">
        <div><label>Dititip</label><input value="${item.qtySent}" disabled></div>
        <div><label>Retur/Sisa</label><input type="number" inputmode="numeric" class="cs-retur" data-idx="${idx}" value="0" max="${item.qtySent}"></div>
      </div>
      <div class="subtotal" data-sub="${idx}">Terjual: ${item.qtySent} · Subtotal: ${idr(item.qtySent*item.price)}</div>
    </div>
  `).join('');
  function recalcSettle(){
    let total = 0;
    box.querySelectorAll('.consign-item').forEach((row,idx)=>{
      const item = c.items[idx];
      const returInput = row.querySelector('.cs-retur');
      let retur = parseInt(returInput.value)||0;
      if(retur<0) retur=0;
      if(retur>item.qtySent) retur=item.qtySent;
      const terjual = item.qtySent - retur;
      const subtotal = terjual*item.price;
      total += subtotal;
      row.querySelector('[data-sub]').textContent = 'Terjual: '+terjual+' · Subtotal: '+idr(subtotal);
    });
    document.getElementById('consignSettleTotal').textContent = idr(total);
  }
  box.querySelectorAll('.cs-retur').forEach(inp=> inp.addEventListener('input', recalcSettle));
  recalcSettle();
  document.getElementById('consignSettleModalBg').classList.add('show');
}
document.getElementById('btnCloseConsignSettle').addEventListener('click', ()=>{
  document.getElementById('consignSettleModalBg').classList.remove('show');
});
document.getElementById('btnConfirmConsignSettle').addEventListener('click', async ()=>{
  const consignments = await getAll('consignments');
  const c = consignments.find(x=>x.id===currentConsignId);
  if(!c) return;
  const box = document.getElementById('consignSettleList');
  const settleItems = [];
  box.querySelectorAll('.consign-item').forEach((row,idx)=>{
    const item = c.items[idx];
    const returInput = row.querySelector('.cs-retur');
    let retur = parseInt(returInput.value)||0;
    if(retur<0) retur=0;
    if(retur>item.qtySent) retur=item.qtySent;
    const qtySold = item.qtySent - retur;
    settleItems.push({ productId:item.productId, name:item.name, qtySent:item.qtySent, qtyReturn:retur, qtySold, price:item.price, costPrice:item.costPrice, subtotal: qtySold*item.price });
  });
  const totalBilled = settleItems.reduce((s,e)=>s+e.subtotal,0);
  const paidNow = document.getElementById('consignSettlePaidNow').checked;
  const confirmMsg = paidNow
    ? 'Titipan akan ditutup, tagihan Rp'+totalBilled.toLocaleString('id-ID')+' langsung dicatat lunas.'
    : 'Titipan akan ditutup dan tagihan Rp'+totalBilled.toLocaleString('id-ID')+' masuk ke piutang mitra.';
  if(!(await customConfirm(confirmMsg, 'Selesaikan titipan ini?'))) return;

  c.status = 'settled';
  c.settledDate = new Date().toISOString();
  c.settleItems = settleItems;
  c.totalBilled = totalBilled;
  await put('consignments', c);

  const soldItems = settleItems.filter(e=>e.qtySold>0).map(e=>({name:e.name, price:e.price, qty:e.qtySold, costPrice:e.costPrice||0}));
  await put('transactions', {
    date: new Date().toISOString(),
    items: soldItems,
    total: totalBilled,
    payMethod: 'titipan',
    customerId: null, customerName: null,
    partnerId: c.partnerId, partnerName: c.partnerName,
    cashGiven: totalBilled,
    voided: false
  });

  if(paidNow && totalBilled>0){
    await put('payments', { partnerId: c.partnerId, amount: totalBilled, date: new Date().toISOString(), note:'Lunas langsung saat settle' });
  }

  document.getElementById('consignSettleModalBg').classList.remove('show');
  renderTitipJual(document.getElementById('searchPartner').value);
  showToast(paidNow ? 'Titipan di-settle & lunas, Rp'+totalBilled.toLocaleString('id-ID') : 'Titipan di-settle, tagihan Rp'+totalBilled.toLocaleString('id-ID')+' masuk piutang');
});

async function openPartnerModal(partnerId){
  const partners = await getAll('partners');
  const p = partners.find(x=>x.id===partnerId);
  if(!p) return;
  const transactions = (await getAll('transactions')).filter(t=>t.payMethod==='titipan' && t.partnerId===partnerId && !t.voided).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const payments = (await getAll('payments')).filter(pm=>pm.partnerId===partnerId).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const owed = transactions.reduce((s,t)=>s+t.total,0);
  const paid = payments.reduce((s,pm)=>s+pm.amount,0);
  const balance = owed - paid;

  currentPartnerId = partnerId;
  document.getElementById('partnerModalName').textContent = p.name;
  document.getElementById('partnerModalBalance').textContent = idr(balance);
  document.getElementById('partnerPayAmount').value = '';

  const entries = [
    ...transactions.map(t=>({date:t.date, label:'Settle titipan ('+t.items.length+' produk terjual)', amount:t.total, type:'owe'})),
    ...payments.map(pm=>({date:pm.date, label:'Pembayaran mitra', amount:pm.amount, type:'pay'}))
  ].sort((a,b)=>new Date(a.date)-new Date(b.date));
  document.getElementById('partnerHistoryBox').innerHTML = entries.length===0 ? '<div class="empty">Belum ada riwayat</div>' : entries.map(e=>{
    const d = new Date(e.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
    return `<div class="history-item"><div class="history-top"><span>${d} · ${e.label}</span><span style="font-weight:700;color:${e.type==='owe'?'var(--red)':'var(--green)'}">${e.type==='owe'?'+':'-'}${idr(e.amount)}</span></div></div>`;
  }).join('');

  document.getElementById('partnerModalBg').classList.add('show');
}
document.getElementById('btnClosePartner').addEventListener('click', ()=>{
  document.getElementById('partnerModalBg').classList.remove('show');
});
let currentPartnerId = null;
document.getElementById('btnAddPartnerPayment').addEventListener('click', async ()=>{
  const amount = parseFloat(document.getElementById('partnerPayAmount').value);
  if(!amount || amount<=0){ showToast('Isi jumlah pembayaran'); return; }
  await put('payments', { partnerId: currentPartnerId, amount, date: new Date().toISOString() });
  showToast('Pembayaran mitra dicatat');
  openPartnerModal(currentPartnerId);
  renderTitipJual(document.getElementById('searchPartner').value);
});

// ---------- LAPORAN ----------
let laporanFilter = { period: 'today', payMethod: '', search: '' };

function getLaporanDateRange(){
  const now = new Date();
  let start, end;
  if(laporanFilter.period==='today'){
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
  } else if(laporanFilter.period==='7d'){
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-6);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
  } else if(laporanFilter.period==='30d'){
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-29);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
  } else if(laporanFilter.period==='custom'){
    const s = document.getElementById('laporanCustomStart').value;
    const e = document.getElementById('laporanCustomEnd').value;
    start = s ? new Date(s+'T00:00:00') : null;
    end = e ? new Date(e+'T23:59:59') : null;
  } else {
    start = null; end = null;
  }
  return { start, end };
}
function laporanPeriodLabel(){
  return { today:'Hari Ini', '7d':'7 Hari Terakhir', '30d':'30 Hari Terakhir', all:'Semua', custom:'Custom' }[laporanFilter.period];
}

async function renderLaporanInfo(){
  const { start, end } = getLaporanDateRange();
  const inRange = (d)=>{ if(start && d<start) return false; if(end && d>end) return false; return true; };

  const allTrans = (await getAll('transactions')).filter(t=>!t.voided && inRange(new Date(t.date)));
  const allPayments = (await getAll('payments')).filter(p=> inRange(new Date(p.date)));

  const kasirLangsung = allTrans.filter(t=>t.payMethod==='tunai'||t.payMethod==='qris');
  const kasirTotal = kasirLangsung.reduce((s,t)=>s+t.total,0);

  const hutangTx = allTrans.filter(t=>t.payMethod==='hutang');
  const hutangTotal = hutangTx.reduce((s,t)=>s+t.total,0);
  const hutangDiterima = allPayments.filter(p=>p.customerId!==undefined && p.customerId!==null).reduce((s,p)=>s+p.amount,0);
  const hutangBelum = Math.max(0, hutangTotal - hutangDiterima);

  const titipTx = allTrans.filter(t=>t.payMethod==='titipan');
  const titipTotal = titipTx.reduce((s,t)=>s+t.total,0);
  const titipDiterima = allPayments.filter(p=>p.partnerId!==undefined && p.partnerId!==null).reduce((s,p)=>s+p.amount,0);
  const titipBelum = Math.max(0, titipTotal - titipDiterima);

  const omzetTotal = kasirTotal + hutangTotal + titipTotal;
  const totalDiterima = kasirTotal + hutangDiterima + titipDiterima;
  const totalBelum = hutangBelum + titipBelum;
  const totalProfit = allTrans.reduce((s,t)=> s + t.items.reduce((s2,i)=> s2 + (i.qty*(i.price-(i.costPrice||0))), 0), 0);

  let extraRows = '';
  if(hutangBelum>0) extraRows += `<div class="info-row"><span class="lbl" style="color:var(--red);">Hutang pelanggan belum dibayar</span><span class="val" style="color:var(--red);">${idr(hutangBelum)}</span></div>`;
  if(titipBelum>0) extraRows += `<div class="info-row"><span class="lbl" style="color:var(--red);">Titip jual belum dibayar mitra</span><span class="val" style="color:var(--red);">${idr(titipBelum)}</span></div>`;

  document.getElementById('laporanInfoTitle').textContent = 'Rincian Uang ('+laporanPeriodLabel()+')';
  document.getElementById('laporanInfoContent').innerHTML = `
    <div class="info-row total"><span class="lbl">Omzet (total yang laku)</span><span class="val">${idr(omzetTotal)}</span></div>
    <div class="info-row"><span class="lbl" style="color:var(--green);">Sudah diterima (uangnya ada)</span><span class="val" style="color:var(--green);">${idr(totalDiterima)}</span></div>
    <div class="info-row"><span class="lbl" style="color:var(--red);">Belum diterima (masih piutang)</span><span class="val" style="color:var(--red);">${idr(totalBelum)}</span></div>
    <div class="info-row"><span class="lbl">Untung kotor</span><span class="val">${idr(totalProfit)}</span></div>
    ${extraRows}
  `;
  document.getElementById('laporanInfoModalBg').classList.add('show');
}
document.getElementById('btnLaporanInfo').addEventListener('click', renderLaporanInfo);
document.getElementById('btnCloseLaporanInfo').addEventListener('click', ()=>{
  document.getElementById('laporanInfoModalBg').classList.remove('show');
});

let laporanFilterTemp = { period:'today', payMethod:'' };

function applyTempChipUI(){
  document.querySelectorAll('#filterDateChips .chip').forEach(c=>{
    c.classList.toggle('active', c.dataset.period===laporanFilterTemp.period);
  });
  document.querySelectorAll('#filterPayChips .chip').forEach(c=>{
    c.classList.toggle('active', c.dataset.pay===laporanFilterTemp.payMethod);
  });
  document.getElementById('filterCustomDates').classList.toggle('hidden', laporanFilterTemp.period!=='custom');
}
function updateFilterDot(){
  const active = laporanFilter.period!=='today' || laporanFilter.payMethod!=='';
  document.getElementById('laporanFilterDot').classList.toggle('hidden', !active);
  document.getElementById('btnOpenLaporanFilter').classList.toggle('active', active);
}

document.getElementById('btnOpenLaporanFilter').addEventListener('click', ()=>{
  laporanFilterTemp = { period: laporanFilter.period, payMethod: laporanFilter.payMethod };
  applyTempChipUI();
  document.getElementById('laporanFilterModalBg').classList.add('show');
});
document.getElementById('btnCloseLaporanFilter').addEventListener('click', ()=>{
  document.getElementById('laporanFilterModalBg').classList.remove('show');
});
document.querySelectorAll('#filterDateChips .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    laporanFilterTemp.period = c.dataset.period;
    applyTempChipUI();
  });
});
document.querySelectorAll('#filterPayChips .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    laporanFilterTemp.payMethod = c.dataset.pay;
    applyTempChipUI();
  });
});
document.getElementById('btnResetLaporanFilter').addEventListener('click', ()=>{
  laporanFilterTemp = { period:'today', payMethod:'' };
  document.getElementById('laporanCustomStart').value = '';
  document.getElementById('laporanCustomEnd').value = '';
  applyTempChipUI();
});
document.getElementById('btnApplyLaporanFilter').addEventListener('click', ()=>{
  laporanFilter.period = laporanFilterTemp.period;
  laporanFilter.payMethod = laporanFilterTemp.payMethod;
  document.getElementById('laporanFilterModalBg').classList.remove('show');
  updateFilterDot();
  renderLaporan();
});
document.getElementById('laporanSearchProduct').addEventListener('input', e=>{
  laporanFilter.search = e.target.value;
  renderLaporan();
});

async function renderLaporan(){
  updateFilterDot();
  const allTrans = (await getAll('transactions')).sort((a,b)=> new Date(b.date)-new Date(a.date));
  const allPayments = await getAll('payments');
  const custBalanceMap = new Map();
  (await getAll('customers')).forEach(c=> custBalanceMap.set(c.id, null));
  const partnerBalanceMap = new Map();
  (await getAll('partners')).forEach(p=> partnerBalanceMap.set(p.id, null));
  for(const id of custBalanceMap.keys()) custBalanceMap.set(id, await getCustomerBalance(id, allTrans, allPayments));
  for(const id of partnerBalanceMap.keys()){
    const owed = allTrans.filter(t=>t.payMethod==='titipan' && t.partnerId===id && !t.voided).reduce((s,t)=>s+t.total,0);
    const paid = allPayments.filter(p=>p.partnerId===id).reduce((s,p)=>s+p.amount,0);
    partnerBalanceMap.set(id, owed - paid);
  }
  const { start, end } = getLaporanDateRange();
  const search = laporanFilter.search.trim().toLowerCase();

  const filtered = allTrans.filter(t=>{
    const d = new Date(t.date);
    if(start && d < start) return false;
    if(end && d > end) return false;
    if(laporanFilter.payMethod && t.payMethod !== laporanFilter.payMethod) return false;
    if(search && !t.items.some(i=>i.name.toLowerCase().includes(search))) return false;
    return true;
  });
  const validFiltered = filtered.filter(t=>!t.voided);

  document.getElementById('laporanOmzetLabel').textContent = 'Omzet ('+laporanPeriodLabel()+')';
  document.getElementById('todayTotal').textContent = idr(validFiltered.reduce((s,t)=>s+t.total,0));
  const totalProfit = validFiltered.reduce((s,t)=> s + t.items.reduce((s2,i)=> s2 + (i.qty*(i.price-(i.costPrice||0))), 0), 0);
  document.getElementById('todayProfit').textContent = idr(totalProfit);
  document.getElementById('todayCount').textContent = validFiltered.length+' transaksi';

  const validAll = allTrans.filter(t=>!t.voided);
  const days = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const dayTotal = validAll.filter(t=> new Date(t.date).toDateString()===d.toDateString()).reduce((s,t)=>s+t.total,0);
    days.push({ label: d.toLocaleDateString('id-ID',{weekday:'short'}), total: dayTotal });
  }
  const maxTotal = Math.max(1, ...days.map(d=>d.total));
  document.getElementById('weekChart').innerHTML = days.map(d=>`
    <div class="bar-col"><div class="bar" style="height:${Math.max(3,(d.total/maxTotal)*100)}%;"></div><div class="bar-lbl">${d.label}</div></div>
  `).join('');

  const prodCount = {};
  validFiltered.forEach(t=> t.items.forEach(i=> prodCount[i.name] = (prodCount[i.name]||0) + i.qty ));
  const top = Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  document.getElementById('topProdList').innerHTML = top.length===0 ? '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Belum ada data</div>' :
    top.map(([name,qty])=>`<div class="top-prod"><span>${name}</span><span style="font-weight:700;">${qty} terjual</span></div>`).join('');

  const box = document.getElementById('historyList');
  box.innerHTML = filtered.length===0 ? '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>Tidak ada transaksi yang cocok</div>' : filtered.map(t=>{
    const d = new Date(t.date);
    const time = d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const payLabel = t.payMethod==='qris'?'QRIS':(t.payMethod==='hutang'?'Hutang · '+(t.customerName||'-'):(t.payMethod==='titipan'?'Titipan · '+(t.partnerName||'-'):'Tunai'));
    let lunasBadge = '';
    if(!t.voided && t.payMethod==='hutang'){
      const bal = custBalanceMap.get(t.customerId);
      lunasBadge = bal>0 ? '<span class="tag" style="color:var(--red);">Belum Lunas</span>' : '<span class="tag" style="color:var(--green);">Lunas</span>';
    } else if(!t.voided && t.payMethod==='titipan'){
      const bal = partnerBalanceMap.get(t.partnerId);
      lunasBadge = bal>0 ? '<span class="tag" style="color:var(--red);">Belum Lunas</span>' : '<span class="tag" style="color:var(--green);">Lunas</span>';
    }
    return `<div class="history-item ${t.voided?'voided':''}">
      <div class="history-top">
        <span>${time} · ${t.items.length} item <span class="tag">${payLabel}</span>${lunasBadge}${t.voided?'<span class="tag">Dibatalkan</span>':''}</span>
        <span class="amt" style="font-weight:700;">${idr(t.total)}</span>
      </div>
      ${!t.voided?`<button data-id="${t.id}">Batalkan transaksi</button>`:''}
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-id]').forEach(b=>{
    b.addEventListener('click', ()=>voidTransaction(parseInt(b.dataset.id)));
  });
}

async function voidTransaction(id){
  if(!(await customConfirm('Stok produk pada transaksi ini akan dikembalikan.', 'Batalkan transaksi ini?'))) return;
  const t = (await getAll('transactions')).find(x=>x.id===id);
  if(!t || t.voided) return;
  const products = await getAll('products');
  for(const i of t.items){
    const p = products.find(x=>x.name===i.name);
    if(p){ p.stock += i.qty; await put('products', p); }
  }
  t.voided = true;
  await put('transactions', t);
  renderLaporan(); renderProdGrid(); renderHutang();
  showToast('Transaksi dibatalkan');
}

document.getElementById('rowBackupRestore').addEventListener('click', ()=>{
  document.getElementById('backupRestoreModalBg').classList.add('show');
});
document.getElementById('btnCloseBackupRestore').addEventListener('click', ()=>{
  document.getElementById('backupRestoreModalBg').classList.remove('show');
});
document.getElementById('rowDeleteData').addEventListener('click', ()=>{
  document.getElementById('deleteDataModalBg').classList.add('show');
});
document.getElementById('btnCloseDeleteData').addEventListener('click', ()=>{
  document.getElementById('deleteDataModalBg').classList.remove('show');
});

document.getElementById('btnExport').addEventListener('click', async ()=>{
  const products = await getAll('products');
  const transactions = await getAll('transactions');
  const customers = await getAll('customers');
  const payments = await getAll('payments');
  const categories = await getAll('categories');
  const opnames = await getAll('opnames');
  const settings = await getAll('settings');
  const partners = await getAll('partners');
  const consignments = await getAll('consignments');
  const activityLog = await getAll('activityLog');
  const data = { exportedAt: new Date().toISOString(), products, transactions, customers, payments, categories, opnames, settings, partners, consignments, activityLog };
  const jsonStr = JSON.stringify(data,null,2);
  const fileName = 'backup-warung-azdifa-'+new Date().toISOString().slice(0,10)+'.json';
  const blob = new Blob([jsonStr], {type:'application/json'});

  if(window.showSaveFilePicker){
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description:'Backup JSON', accept:{'application/json':['.json']} }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast('Backup disimpan');
      return;
    }catch(err){
      if(err && err.name==='AbortError') return;
    }
  }

  const file = new File([blob], fileName, {type:'application/json'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], title:fileName});
      showToast('Backup dibagikan');
      return;
    }catch(err){
      if(err && err.name==='AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  a.click(); URL.revokeObjectURL(url);
  showToast('Backup diunduh ke folder Download');
});

document.getElementById('fileImport').addEventListener('change', async e=>{
  const file = e.target.files[0];
  if(!file) return;
  if(!(await customConfirm('Data produk, stok, transaksi, dan hutang saat ini akan ditimpa.', 'Pulihkan dari "'+file.name+'"?'))){
    document.getElementById('fileImport').value = '';
    return;
  }
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    await clearStore('products'); await clearStore('transactions');
    await clearStore('customers'); await clearStore('payments');
    await clearStore('categories'); await clearStore('opnames'); await clearStore('settings');
    await clearStore('partners'); await clearStore('consignments'); await clearStore('activityLog');
    for(const p of (data.products||[])) await put('products', p);
    for(const t of (data.transactions||[])) await put('transactions', t);
    for(const c of (data.customers||[])) await put('customers', c);
    for(const p of (data.payments||[])) await put('payments', p);
    for(const c of (data.categories||[])) await put('categories', c);
    for(const o of (data.opnames||[])) await put('opnames', o);
    for(const s of (data.settings||[])) await put('settings', s);
    for(const pt of (data.partners||[])) await put('partners', pt);
    for(const cs of (data.consignments||[])) await put('consignments', cs);
    for(const al of (data.activityLog||[])) await put('activityLog', al);
    renderCatChips(); renderProdGrid(); renderStok(); renderLaporan(); renderHutang(); renderHeader();
    document.getElementById('backupRestoreModalBg').classList.remove('show');
    showToast('Data berhasil dipulihkan');
  }catch(err){ showToast('File tidak valid'); }
  document.getElementById('fileImport').value = '';
});

async function clearPaymentsByField(field){
  const all = await getAll('payments');
  for(const p of all){
    if(p[field]!==undefined && p[field]!==null) await del('payments', p.id);
  }
}

document.getElementById('btnDeleteData').addEventListener('click', async ()=>{
  const delTransaksi = document.getElementById('delTransaksi').checked;
  const delProduk = document.getElementById('delProduk').checked;
  const delHutang = document.getElementById('delHutang').checked;
  const delOpname = document.getElementById('delOpname').checked;
  const delTitip = document.getElementById('delTitip').checked;
  const delLog = document.getElementById('delLog').checked;
  if(!delTransaksi && !delProduk && !delHutang && !delOpname && !delTitip && !delLog){ showToast('Pilih dulu bagian yang mau dihapus'); return; }
  const parts = [];
  if(delTransaksi) parts.push('Transaksi & Riwayat Penjualan');
  if(delProduk) parts.push('Produk & Stok');
  if(delHutang) parts.push('Pelanggan & Hutang');
  if(delOpname) parts.push('Riwayat Stock Opname');
  if(delTitip) parts.push('Mitra & Titip Jual');
  if(delLog) parts.push('Log Aktivitas');
  if(!(await customConfirm('Data berikut akan dihapus permanen dan tidak bisa dikembalikan: '+parts.join(', ')+'.', 'Hapus data terpilih?'))) return;

  if(delTransaksi) await clearStore('transactions');
  if(delProduk) await clearStore('products');
  if(delHutang){ await clearStore('customers'); await clearPaymentsByField('customerId'); }
  if(delOpname) await clearStore('opnames');
  if(delTitip){ await clearStore('partners'); await clearStore('consignments'); await clearPaymentsByField('partnerId'); }
  if(delLog) await clearStore('activityLog');

  document.getElementById('delTransaksi').checked = false;
  document.getElementById('delProduk').checked = false;
  document.getElementById('delHutang').checked = false;
  document.getElementById('delOpname').checked = false;
  document.getElementById('delTitip').checked = false;
  document.getElementById('delLog').checked = false;

  renderCatChips(); renderProdGrid(); renderStok(); renderLaporan(); renderHutang(); renderTitipJual();
  document.getElementById('deleteDataModalBg').classList.remove('show');
  showToast('Data terpilih sudah dihapus');
});

const DEFAULT_CATEGORIES = ['Makanan','Minuman','Snack & Camilan','Minuman Sachet','Kebutuhan Rumah Tangga','Lainnya'];
async function seedCategories(){
  const existing = await getAll('categories');
  if(existing.length > 0) return;
  const products = await getAll('products');
  const usedCats = [...new Set(products.map(p=>p.category).filter(Boolean))];
  const names = [...new Set([...DEFAULT_CATEGORIES, ...usedCats])];
  for(const name of names) await put('categories', { name });
}

(async function init(){
  db = await openDB();
  await seedCategories();
  renderHeader();
  await loadFeatureSettingsOnInit();
  renderCatChips();
  renderProdGrid();
})();
async function loadFeatureSettingsOnInit(){
  const f = await getFeatureSettings();
  consignFeatureEnabled = f ? !!f.consignEnabled : true;
  applyConsignVisibility();
}
