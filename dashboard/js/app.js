/* ============================================================
   DASHBOARD — app.js
   Sections:
     1.  appInit()         - Entry point
     2.  showPage()        - Navigasi halaman
     3.  toast()           - Notifikasi snackbar
     4.  Modal             - Buka/tutup popup
     5.  loadOverview()    - Load statistik & aktivitas
     6.  loadTamu()        - Load & tampilkan daftar tamu
     7.  tambahTamu()      - Tambah tamu baru ke Supabase
     8.  hapusTamu()       - Hapus tamu dari Supabase
     9.  loadRsvp()        - Load data RSVP dari Supabase
    10.  loadWishes()      - Load wishes dari Supabase
    11.  loadFoto()        - Load foto dari Supabase
    12.  uploadFoto()      - Upload foto ke Supabase Storage
    13.  hapusFoto()       - Hapus foto dari Supabase
    14.  previewLink()     - Preview link undangan per tamu
    15.  openWa()          - Kirim via WhatsApp
    16.  genLinkTamu()     - Generate & salin link per tamu
    17.  filterTamu()      - Filter/cari tamu
   ============================================================ */

import { supabase } from '../../shared/js/supabase.js';

const BASE_URL = window.location.origin + '/invitation';

/* ----- 1. ENTRY POINT ----- */
export function appInit() {
  if (!localStorage.getItem('dashboard_auth')) {
    initLoginGate();
    return;
  }
  bootDashboard();
}

function bootDashboard() {
  applyRoleUI();
  showPageById('overview');
  bindNavItems();
  loadOverview();
  loadSettings();
  initRealtime();
  initStickyHeaders();
  initAutoLogout();
}

function applyRoleUI() {
  const role     = localStorage.getItem('dashboard_role') || 'admin';
  const username = localStorage.getItem('dashboard_username') || '';

  // Update sidebar role info
  const roleEl = document.getElementById('sidebar-role-info');
  if (roleEl) {
    roleEl.innerHTML = `<span style="color:${role==='admin'?'#4caf50':'#888'}">${role === 'admin' ? '👑 Admin' : '👤 User'}</span> · ${username}`;
  }

  // Hide admin-only menu items for non-admin
  if (role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    // User hanya bisa akses overview, rsvp, wishes
    const allowedPages = ['overview','rsvp','wishes','foto','undangan','settings','tamu'];
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      const page = el.getAttribute('data-page');
      if (!allowedPages.includes(page)) el.style.display = 'none';
    });
  }
}

function userCanAccess(page) {
  const role = localStorage.getItem('dashboard_role') || 'admin';
  if (role === 'admin') return true;
  const userPages = ['overview','rsvp','wishes','foto','undangan','settings','tamu'];
  return userPages.includes(page);
}

/* ----- LOGIN ----- */
async function initLoginGate() {
  try {
    const [{ data: dp }, { data: dw }] = await Promise.all([
      supabase.from('settings').select('value').eq('key','nama_pria').maybeSingle(),
      supabase.from('settings').select('value').eq('key','nama_wanita').maybeSingle(),
    ]);
    const title = document.getElementById('login-title');
    if (title && dp?.value) title.textContent = dp.value.split(' ')[0] + ' & ' + (dw?.value?.split(' ')[0] || '');
  } catch(e) {}
  setTimeout(() => document.getElementById('login-user')?.focus(), 100);
}

async function doLogin() {
  const passEl  = document.getElementById('login-pass');
  const userEl  = document.getElementById('login-user');
  const errEl   = document.getElementById('login-error');
  const btn     = document.getElementById('login-btn');
  const input   = passEl?.value?.trim();
  const loginId = userEl?.value?.trim() || '';
  if (!input || !loginId) { if (errEl) errEl.style.display = 'block'; return; }

  if (btn) { btn.textContent = 'Memeriksa...'; btn.style.opacity = '0.7'; }

  try {
    const { data: accs } = await supabase
      .from('accounts').select('id,username,nomor_hp,role').eq('password', input);

    const acc = (accs || []).find(a =>
      a.username?.toLowerCase() === loginId.toLowerCase() ||
      (a.nomor_hp || '').replace(/\D/g,'') === loginId.replace(/\D/g,'')
    ) || null;

    if (acc) {
      localStorage.setItem('dashboard_auth', '1');
      localStorage.setItem('dashboard_username', acc.username);
      localStorage.setItem('dashboard_role', acc.role || 'admin');
      const gate = document.getElementById('login-gate');
      if (gate) { gate.style.opacity='0'; gate.style.transition='opacity 0.3s'; setTimeout(()=>gate.remove(),300); }
      bootDashboard();
    } else {
      if (errEl) errEl.style.display = 'block';
      if (passEl) { passEl.value = ''; passEl.focus(); }
    }
  } catch(e) { if (errEl) errEl.style.display = 'block'; }

  if (btn) { btn.textContent = 'Masuk'; btn.style.opacity = '1'; }
}

function toggleLoginPass() {
  const el = document.getElementById('login-pass');
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function logout() {
  localStorage.removeItem('dashboard_auth');
  localStorage.removeItem('dashboard_username');
  localStorage.removeItem('dashboard_role');
  location.reload();
}

/* ----- AUTO LOGOUT ----- */
const AUTO_LOGOUT_MS = 10 * 60 * 1000;
let _autoLogoutTimer, _autoLogoutWarnTimer;
function initAutoLogout() {
  resetAutoLogout();
  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
    document.addEventListener(ev, resetAutoLogout, { passive: true })
  );
}
function resetAutoLogout() {
  clearTimeout(_autoLogoutTimer);
  clearTimeout(_autoLogoutWarnTimer);
  _autoLogoutWarnTimer = setTimeout(() => toast('⚠️ Sesi berakhir dalam 1 menit'), AUTO_LOGOUT_MS - 60000);
  _autoLogoutTimer     = setTimeout(() => { toast('Sesi berakhir'); setTimeout(logout, 1500); }, AUTO_LOGOUT_MS);
}

window.doLogin         = doLogin;
window.toggleLoginPass = toggleLoginPass;
window.logout          = logout;

/* ----- REALTIME NOTIFIKASI ----- */
function initRealtime() {
  try {
    supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rsvp' }, payload => {
        const r = payload.new;
        const status = r.kehadiran === 'hadir' ? 'konfirmasi hadir ✅' : 'tidak bisa hadir ❌';
        toast(`🔔 ${r.nama} ${status}`);
        loadOverview();
        // Refresh halaman RSVP kalau sedang aktif
        if (document.getElementById('page-rsvp')?.classList.contains('active')) loadRsvp();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rsvp' }, payload => {
        const r = payload.new;
        const status = r.kehadiran === 'hadir' ? 'update → hadir ✅' : 'update → tidak hadir ❌';
        toast(`🔄 ${r.nama} ${status}`);
        loadOverview();
        if (document.getElementById('page-rsvp')?.classList.contains('active')) loadRsvp();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wishes' }, payload => {
        const w = payload.new;
        toast(`💌 ${w.nama} mengirim ucapan`);
        loadOverview();
        if (document.getElementById('page-wishes')?.classList.contains('active')) loadWishes();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime aktif — dashboard akan update otomatis');
        }
      });
  } catch(e) {
    console.warn('Realtime tidak tersedia:', e.message);
  }
}

/* ----- STICKY HEADER BORDER ----- */
function initStickyHeaders() {
  const main = document.querySelector('.main');
  if (!main) return;
  main.addEventListener('scroll', () => {
    document.querySelectorAll('.page-header--sticky').forEach(el => {
      // el.offsetTop adalah jarak dari top main content, -28 karena margin-top negatif
      el.classList.toggle('is-stuck', main.scrollTop > 0);
    });
  }, { passive: true });
}

/* ----- 2. NAVIGASI ----- */
function bindNavItems() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      showPage(el);
      const page = el.getAttribute('data-page');
      if (page === 'overview')  loadOverview();
      if (page === 'tamu')      loadTamu();
      if (page === 'rsvp')      loadRsvp();
      if (page === 'wishes')    loadWishes();
      if (page === 'foto')      loadFoto();
      if (page === 'settings')   loadSettings();
      if (page === 'undangan')   loadUndangan();
      if (page === 'akun')       loadAkun();
    });
  });
}

function showPage(el) {
  showPageById(el.getAttribute('data-page'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

function showPageById(pageId) {
  if (!userCanAccess(pageId)) { toast('Akses ditolak — hanya untuk Admin'); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId)?.classList.add('active');
}

/* ----- 3. TOAST ----- */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ----- 4. MODAL ----- */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function closeModalOutside(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

/* ----- 5. OVERVIEW ----- */
async function loadOverview() {

  // =========================
  // TOTAL TAMU
  // =========================
  const { data: tamuData, count: totalTamu } = await supabase
    .from('tamu')
    .select('*', { count: 'exact' });

  // =========================
  // SUDAH BUKA
  // =========================
  const sudahBuka = tamuData.filter(
    t => t.link_dibuka > 0
  ).length;

    // =========================
  // RSVP
  // =========================
  const { data: rsvpData, count: totalRSVP } = await supabase
    .from('rsvp')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  const hadir = rsvpData.filter(
    r => r.kehadiran === 'hadir'
  ).length;

  const tidakHadir = rsvpData.filter(
    r => r.kehadiran === 'tidak'
  ).length;

  // =========================
  // WISHES
  // =========================
  const { data: wishesData, count: totalWishes } = await supabase
    .from('wishes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10);

  // =========================
  // PERSEN
  // =========================
  // SUDAH BUKA
  const bukaPercent =
    totalTamu > 0
      ? Math.round((sudahBuka / totalTamu) * 100)
      : 0;

  // RSVP CARD ATAS
  const rsvpPercent =
    totalTamu > 0
      ? Math.min(
          Math.round((totalRSVP / totalTamu) * 100),
          100
        )
      : 0;

  // STATUS RSVP KANAN
  const hadirPercent =
    totalRSVP > 0
      ? Math.round((hadir / totalRSVP) * 100)
      : 0;

  const tidakPercent =
    totalRSVP > 0
      ? Math.round((tidakHadir / totalRSVP) * 100)
      : 0;

  // =========================
  // RENDER METRIC
  // =========================
  document.getElementById('totalTamu').innerText = totalTamu;
  document.getElementById('sudahBuka').innerText = sudahBuka;
  document.getElementById('totalRSVP').innerText = totalRSVP;
  document.getElementById('totalWishes').innerText = totalWishes;

  document.getElementById('hadirCount').innerText = hadir;
  document.getElementById('tidakHadirCount').innerText = tidakHadir;

  // =========================
  // TEXT INFO
  // =========================
  document.getElementById('kelompokInfo').innerText =
    `${totalTamu} keluarga / kelompok`;

  document.getElementById('sudahBukaText').innerText =
    `${bukaPercent}% dari total tamu`;

  document.getElementById('rsvpInfo').innerText =
    `${hadir} hadir · ${tidakHadir} tidak hadir`;

  // =========================
  // PROGRESS BAR
  // =========================
  document.getElementById('sudahBukaBar').style.width =
  `${bukaPercent}%`;

  document.getElementById('rsvpBar').style.width =
    `${rsvpPercent}%`;

  document.getElementById('hadirBar').style.width =
    `${hadirPercent}%`;

  document.getElementById('tidakHadirBar').style.width =
    `${tidakPercent}%`;

  // =========================
  // HITUNG MUNDUR
  // =========================
  const { data: settingsData } = await supabase
    .from('settings').select('key, value');
  const cfg = {};
  (settingsData || []).forEach(r => cfg[r.key] = r.value);
  renderCountdown(cfg);

  // =========================
  // AKTIVITAS TERBARU
  // =========================
  // Merge RSVP + Wishes by name → 1 baris per orang
  // Parse UTC dengan benar (tambah Z jika belum ada timezone info)
  const parseUTC = (str) => {
    if (!str) return new Date(0);
    return new Date(str.endsWith('Z') || str.includes('+') ? str : str + 'Z');
  };

  const byName = {};
  (rsvpData || []).forEach(r => {
    const t = parseUTC(r.created_at);
    if (!byName[r.nama]) byName[r.nama] = { nama: r.nama, time: t };
    byName[r.nama].kehadiran = r.kehadiran;
    byName[r.nama].rsvpTime  = t;
    if (t > byName[r.nama].time) byName[r.nama].time = t;
  });
  (wishesData || []).forEach(w => {
    const t = parseUTC(w.created_at);
    if (!byName[w.nama]) byName[w.nama] = { nama: w.nama, time: t };
    byName[w.nama].pesan    = w.pesan;
    byName[w.nama].wishTime = t;
    if (t > byName[w.nama].time) byName[w.nama].time = t;
  });

  const allActivities = Object.values(byName)
    .sort((a, b) => b.time - a.time);

  pagState.activity.data     = allActivities;
  pagState.activity.filtered = allActivities;
  pagState.activity.page     = 1;
  renderPage('activity');
}

/* ----- HITUNG MUNDUR ----- */
let _cdInterval = null;

function renderCountdown(cfg) {
  const container = document.getElementById('countdown-container');
  if (!container) return;

  function parseTarget(tgl, jam) {
    if (!tgl) return null;
    const jamStr = (jam || '00.00').replace('.', ':');
    return new Date(`${tgl}T${jamStr}:00`);
  }

  const tAkad    = parseTarget(cfg.tanggal_akad,    cfg.jam_akad);
  const tResepsi = parseTarget(cfg.tanggal_resepsi, cfg.jam_resepsi);

  if (!tAkad && !tResepsi) {
    container.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:13px;padding:12px 0">Tanggal belum diisi di Pengaturan.</div>';
    return;
  }

  const samaTanggal = cfg.tanggal_akad && cfg.tanggal_resepsi &&
    cfg.tanggal_akad === cfg.tanggal_resepsi;

  const events = samaTanggal
    ? [{ label: 'Hari H', target: tAkad }]
    : [
        cfg.tanggal_akad    ? { label: 'Akad',    target: tAkad    } : null,
        cfg.tanggal_resepsi ? { label: 'Resepsi', target: tResepsi } : null,
      ].filter(Boolean);

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const now = Date.now();
    container.innerHTML = events.map((ev, i) => {
      const diff = ev.target.getTime() - now;
      const done = diff <= 0;
      const d = done ? 0 : Math.floor(diff / 86400000);
      const h = done ? 0 : Math.floor((diff % 86400000) / 3600000);
      const m = done ? 0 : Math.floor((diff % 3600000)  / 60000);
      const s = done ? 0 : Math.floor((diff % 60000)    / 1000);
      const dateStr = ev.target.toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      const sep = (i > 0) ? '<hr style="border:none;border-top:1px solid var(--border);margin:0 0 14px">' : '';
      return `${sep}
        <div style="margin-bottom:14px">
          <div style="margin-bottom:6px">
            <span style="font-size:11px;font-weight:600;color:var(--sage);text-transform:uppercase;letter-spacing:.5px">${ev.label}</span>
          </div>
          <div style="font-size:25px;color:var(--text2);margin-bottom:10px;font-weight:500">${dateStr}</div>
          ${done
            ? `<div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px;color:var(--sage);font-size:13px;font-weight:600">🎉 Harinya sudah tiba!</div>`
            : `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center">
                ${[['Hari',d],['Jam',h],['Menit',m],['Detik',s]].map(([lbl,val]) => `
                  <div style="background:var(--surface2);border-radius:8px;padding:8px 4px">
                    <div style="font-size:22px;font-weight:700;font-family:var(--font-mono);line-height:1">${pad(val)}</div>
                    <div style="font-size:10px;color:var(--text3);margin-top:3px">${lbl}</div>
                  </div>`).join('')}
              </div>`
          }
        </div>`;
    }).join('');
  }

  if (_cdInterval) clearInterval(_cdInterval);
  tick();
  _cdInterval = setInterval(tick, 1000);
}

window.renderCountdown = renderCountdown;

/* ----- 6. LOAD TAMU ----- */
async function loadTamu() {
  const tbody = document.getElementById('tamu-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:20px">Memuat...</td></tr>';

  const [{ data, error }, { data: rsvpData }] = await Promise.all([
    supabase.from('tamu').select('*').order('created_at', { ascending: false }),
    supabase.from('rsvp').select('nama, kehadiran, nomor_hp'),
  ]);
  if (error) { toast('Gagal load tamu'); return; }

  // Buat map untuk lookup RSVP by nama dan by nomor_hp
  const rsvpByNama = {};
  const rsvpByHp   = {};
  (rsvpData || []).forEach(r => {
    if (r.nama)     rsvpByNama[r.nama.toLowerCase()]    = r.kehadiran;
    if (r.nomor_hp) rsvpByHp[r.nomor_hp.replace(/\D/g,'')] = r.kehadiran;
  });

  // Inject _rsvpStatus ke tiap tamu
  data.forEach(t => {
    const byNama = rsvpByNama[t.nama?.toLowerCase()];
    const byHp   = t.nomor_wa ? rsvpByHp[t.nomor_wa.replace(/\D/g,'')] : null;
    t._rsvpStatus = byNama || byHp || null;
  });

  // Simpan ke state pagination
  pagState.tamu.data     = data;
  pagState.tamu.filtered = data;
  pagState.tamu.page     = 1;
  renderPage('tamu');

  // Update badge
  const badgeEl = document.getElementById('badgeTamu');
  if (badgeEl) badgeEl.textContent = data.length;
}

/* ----- 7. TAMBAH TAMU ----- */
async function tambahTamu() {
  const nama      = document.getElementById('inputNamaTamu')?.value.trim();
  const hubungan  = document.getElementById('inputHubungan')?.value.trim();
  const nomor_wa  = document.getElementById('inputNomorWa')?.value.trim();

  if (!nama) { toast('Nama tamu wajib diisi!'); return; }

  // Cek duplikat nomor HP jika diisi
  if (nomor_wa) {
    const { data: existing } = await supabase
      .from('tamu')
      .select('id')
      .eq('nomor_wa', nomor_wa)
      .limit(1);
    if (existing && existing.length > 0) {
      toast('❌ Nomor HP sudah terdaftar untuk tamu lain!');
      return;
    }
  }

  const { error } = await supabase.from('tamu').insert([{ nama, hubungan, nomor_wa }]);
  if (error) { toast('Gagal tambah tamu: ' + error.message); return; }

  closeModal('modal-tambah-tamu');
  toast('Tamu berhasil ditambahkan!');
  loadTamu();
  loadOverview();

  // Reset form
  document.getElementById('inputNamaTamu').value  = '';
  document.getElementById('inputHubungan').value  = '';
  document.getElementById('inputNomorWa').value   = '';
}

/* ----- 8. HAPUS TAMU ----- */
async function hapusTamu(id, btn) {
  if (!confirm('Hapus tamu ini?')) return;
  btn.disabled = true;
  const { error } = await supabase.from('tamu').delete().eq('id', id);
  if (error) { toast('Gagal hapus tamu'); btn.disabled = false; return; }
  toast('Tamu dihapus');
  loadTamu();
  loadOverview();
}

/* ----- 9. EDIT TAMU ----- */
function editTamu(id, nama, hubungan, nomor_wa) {
  document.getElementById('editTamuId').value       = id;
  document.getElementById('editNamaTamu').value     = nama;
  document.getElementById('editHubungan').value     = hubungan;
  document.getElementById('editNomorWa').value      = nomor_wa;
  openModal('modal-edit-tamu');
}

async function simpanEditTamu() {
  const id        = document.getElementById('editTamuId').value;
  const nama      = document.getElementById('editNamaTamu').value.trim();
  const hubungan  = document.getElementById('editHubungan').value.trim();
  const nomor_wa  = document.getElementById('editNomorWa').value.trim();

  if (!nama) { toast('Nama tamu wajib diisi!'); return; }

  const { error } = await supabase.from('tamu').update({ nama, hubungan, nomor_wa }).eq('id', id);
  if (error) { toast('Gagal update tamu: ' + error.message); return; }

  closeModal('modal-edit-tamu');
  toast('Data tamu berhasil diperbarui!');
  loadTamu();
}

/* ----- BULK HAPUS TAMU ----- */
function toggleSelectAllTamu(checked) {
  document.querySelectorAll('#tamu-tbody .tamu-check').forEach(cb => cb.checked = checked);
  _updateBulkHapusTamuBtn();
}

function _updateBulkHapusTamuBtn() {
  const n   = document.querySelectorAll('#tamu-tbody .tamu-check:checked').length;
  const btn = document.getElementById('btn-bulk-hapus');
  const cnt = document.getElementById('bulk-hapus-count');
  const all = document.getElementById('tamu-check-all');
  const tot = document.querySelectorAll('#tamu-tbody .tamu-check').length;
  if (btn) btn.style.display = n > 0 ? 'inline-flex' : 'none';
  if (cnt) cnt.textContent   = n;
  if (all) { all.indeterminate = n > 0 && n < tot; all.checked = n > 0 && n === tot; }
}

async function bulkHapusTamu() {
  const checked = Array.from(document.querySelectorAll('#tamu-tbody .tamu-check:checked'));
  if (!checked.length) return;
  if (!confirm(`Hapus ${checked.length} tamu yang dipilih?`)) return;
  const ids = checked.map(cb => cb.dataset.id);
  const { error } = await supabase.from('tamu').delete().in('id', ids);
  if (error) { toast('Gagal hapus: ' + error.message); return; }
  toast(`✅ ${ids.length} tamu berhasil dihapus`);
  loadTamu();
  loadOverview();
}

/* ----- DOWNLOAD TEMPLATE EXCEL TAMU ----- */
function downloadTemplateTamu() {
  if (typeof XLSX === 'undefined') { toast('Library Excel belum siap'); return; }
  const rows = [
    ['nama', 'hubungan', 'nomor_wa'],
    ['Budi Santoso', 'Keluarga', '08123456789'],
    ['Siti Rahayu', 'Teman Kantor', '08987654321'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Tamu');
  XLSX.writeFile(wb, 'template-tamu.xlsx');
  toast('Template berhasil didownload!');
}

/* ----- BULK IMPORT TAMU DARI EXCEL ----- */
async function bulkImportTamu(input) {
  const file = input.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { toast('Library Excel belum siap'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { toast('File kosong atau format tidak sesuai'); return; }

      // Validasi header minimal ada kolom "nama"
      // Normalisasi semua key ke lowercase supaya case-insensitive
      const normalizedRows = rows.map(r => {
        const obj = {};
        Object.keys(r).forEach(k => { obj[k.toLowerCase().trim()] = r[k]; });
        return obj;
      });

      if (!('nama' in normalizedRows[0])) {
        toast('Kolom "nama" tidak ditemukan. Gunakan template yang tersedia.');
        return;
      }

      toast(`Memproses ${normalizedRows.length} data...`);

      const payload = normalizedRows
        .filter(r => r.nama?.toString().trim())
        .map(r => ({
          nama:      r.nama?.toString().trim()      || '',
          hubungan:  (r.hubungan || r.relasi || '')?.toString().trim()  || '',
          nomor_wa:  (r.nomor_wa || r.nomor || r.hp || r.wa || '')?.toString().trim() || '',
        }));

      // Ambil semua nomor_wa yang sudah ada di DB
      const { data: existingTamu } = await supabase
        .from('tamu')
        .select('nomor_wa')
        .not('nomor_wa', 'is', null)
        .neq('nomor_wa', '');
      const existingHp = new Set((existingTamu || []).map(t => t.nomor_wa.trim()));

      // Filter: tolak duplikat dari DB dan dari sesama baris di file
      const hpSeenInFile = new Set();
      const unique   = [];
      const rejected = [];
      for (const row of payload) {
        const hp = row.nomor_wa;
        if (hp && (existingHp.has(hp) || hpSeenInFile.has(hp))) {
          rejected.push(row.nama);
        } else {
          unique.push(row);
          if (hp) hpSeenInFile.add(hp);
        }
      }

      if (!unique.length) {
        toast(`❌ Semua ${rejected.length} tamu ditolak (nomor HP sudah terdaftar)`);
        return;
      }

      const { error } = await supabase.from('tamu').insert(unique);
      if (error) { toast('Gagal import: ' + error.message); return; }

      const rejMsg = rejected.length
        ? ` | ❌ ${rejected.length} ditolak (HP duplikat)`
        : '';
      toast(`✅ ${unique.length} tamu berhasil diimport!${rejMsg}`);
      loadTamu();
      loadOverview();
    } catch (err) {
      toast('Gagal baca file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  // Reset input supaya file yang sama bisa di-upload lagi
  input.value = '';
}

window.toggleSelectAllTamu    = toggleSelectAllTamu;
window._updateBulkHapusTamuBtn = _updateBulkHapusTamuBtn;
window.bulkHapusTamu          = bulkHapusTamu;
window.downloadTemplateTamu   = downloadTemplateTamu;
window.bulkImportTamu         = bulkImportTamu;

/* ----- 10. LOAD RSVP ----- */
async function loadRsvp() {
  const tbody = document.getElementById('rsvp-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text2)">Memuat...</td></tr>';

  const { data, error } = await supabase.from('rsvp').select('*').order('created_at', { ascending: false });
  if (error) { toast('Gagal load RSVP'); return; }

  const hadir      = data.filter(r => r.kehadiran === 'hadir').length;
  const tidakHadir = data.filter(r => r.kehadiran === 'tidak').length;
  const total      = data.length;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('rsvpHadir',      hadir);
  setEl('rsvpTidakHadir', tidakHadir);
  setEl('rsvpEstimasi',   data.reduce((sum, r) => sum + (r.jumlah_tamu || 1), 0));

  const setBar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; };
  setBar('progressRsvpHadir', total ? Math.round(hadir/total*100) : 0);
  setBar('progressRsvpTidak', total ? Math.round(tidakHadir/total*100) : 0);

  // Simpan ke state pagination
  pagState.rsvp.data     = data;
  pagState.rsvp.filtered = data;
  pagState.rsvp.page     = 1;
  renderPage('rsvp');

  const badgeEl = document.getElementById('badgeRsvp');
  if (badgeEl) badgeEl.textContent = total;
}

/* ----- 10. LOAD WISHES ----- */
async function loadWishes() {
  const container = document.getElementById('wishes-container');
  if (container) container.innerHTML = '<p style="color:var(--text2);padding:20px;text-align:center">Memuat...</p>';

  const [{ data, error }, { data: rsvpMap }] = await Promise.all([
    supabase.from('wishes').select('*').order('created_at', { ascending: false }),
    supabase.from('rsvp').select('nama, nomor_hp'),
  ]);
  if (error) { toast('Gagal load wishes'); return; }

  // Buat map nama → nomor_hp dari RSVP untuk lookup wishes yang kosong
  const hpByNama = {};
  (rsvpMap || []).forEach(r => { if (r.nama && r.nomor_hp) hpByNama[r.nama] = r.nomor_hp; });

  // Isi nomor_hp dari RSVP kalau wishes belum punya
  (data || []).forEach(w => {
    if (!w.nomor_hp && hpByNama[w.nama]) w.nomor_hp = hpByNama[w.nama];
  });

  const total = document.getElementById('wishesTotal');
  if (total) total.textContent = data.length + ' ucapan masuk';

  // Simpan ke state pagination
  pagState.wishes.data     = data;
  pagState.wishes.filtered = data;
  pagState.wishes.page     = 1;
  renderPage('wishes');

  const badgeEl = document.getElementById('badgeWishes');
  if (badgeEl) badgeEl.textContent = data.length;
}

/* ----- 11. LOAD FOTO ----- */
async function loadFoto() {
  const grid = document.getElementById('foto-grid');
  if (!grid) return;

  const { data, error } = await supabase.from('foto').select('*').order('urutan');
  if (error) { toast('Gagal load foto'); return; }

  const slots = grid.querySelectorAll('.photo-slot');
  const filled = grid.querySelectorAll('.photo-filled');
  filled.forEach(el => el.remove());

  // Hapus semua foto yg sudah di-render (bukan slot upload)
  grid.querySelectorAll('.photo-filled').forEach(el => el.remove());

  // Render tiap foto sebelum slot upload
  const uploadSlot = document.getElementById('foto-upload-slot');
  data.forEach(foto => {
    const div = document.createElement('div');
    div.className = 'photo-filled';
    div.innerHTML = `
      <img src="${foto.url}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius)" loading="lazy">
      <div class="photo-overlay">
        <button class="btn btn-icon btn-sm" onclick="hapusFoto('${foto.id}','${foto.storage_path||''}')" title="Hapus">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    `;
    if (uploadSlot) grid.insertBefore(div, uploadSlot);
    else grid.appendChild(div);
  });

  // Update subtitle
  const sub = document.getElementById('fotoSubtitle');
  if (sub) sub.textContent = data.length
    ? data.length + ' foto · Hover foto untuk hapus'
    : 'Belum ada foto. Upload sekarang!';

  // Sembunyikan slot upload kalau sudah 8 foto
  const MAX_FOTO = 8;
  const uploadSlotEl = document.getElementById('foto-upload-slot');
  const uploadBtnEl  = document.querySelector('.btn-primary[onclick*="upload"], label.btn-primary');
  if (uploadSlotEl) uploadSlotEl.style.display = data.length >= MAX_FOTO ? 'none' : '';
  if (uploadBtnEl)  uploadBtnEl.style.display  = data.length >= MAX_FOTO ? 'none' : '';

}

/* ----- 12. UPLOAD FOTO (support multiple) ----- */
async function uploadFoto(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  toast(`Mengupload ${files.length} foto...`);

  // Get current max urutan
  const { data: existing } = await supabase
    .from('foto').select('urutan').order('urutan', { ascending: false }).limit(1);
  let urutan = (existing?.[0]?.urutan ?? -1) + 1;

  let sukses = 0;
  for (const file of files) {
    const fileName = `prewed-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from('foto-prewed')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadErr) {
      console.error('Upload error:', uploadErr.message);
      continue;
    }

    const { data: urlData } = supabase.storage.from('foto-prewed').getPublicUrl(fileName);
    const url = urlData.publicUrl;

    await supabase.from('foto').insert([{ url, urutan, storage_path: fileName }]);
    urutan++;
    sukses++;
  }

  if (sukses === files.length) toast(`${sukses} foto berhasil diupload! 🎉`);
  else toast(`${sukses} dari ${files.length} foto berhasil diupload`);

  // Reset input biar bisa upload file yang sama lagi
  input.value = '';
  loadFoto();
}

/* ----- 13. HAPUS FOTO ----- */
async function hapusFoto(id, storagePath) {
  if (!confirm('Hapus foto ini?')) return;

  // Hapus dari tabel foto
  const { error } = await supabase.from('foto').delete().eq('id', id);
  if (error) { toast('Gagal hapus foto: ' + error.message); return; }

  // Hapus dari storage juga kalau ada path-nya
  if (storagePath) {
    await supabase.storage.from('foto-prewed').remove([storagePath]);
  }

  toast('Foto dihapus!');
  loadFoto();
}

/* ----- 14. PREVIEW LINK ----- */
function previewLink(val) {
  const preview = document.getElementById('linkPreview');
  const urlEl   = document.getElementById('linkPreviewUrl');
  if (!preview || !urlEl) return;
  if (!val.trim()) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  urlEl.textContent = BASE_URL + '/?name=' + encodeURIComponent(val.trim());
}

function copyPreviewLink() {
  const urlEl = document.getElementById('linkPreviewUrl');
  if (!urlEl) return;
  navigator.clipboard?.writeText(urlEl.textContent);
  toast('Link berhasil disalin!');
}

/* ----- 15. WHATSAPP ----- */
function openWa() {
  const nameEl     = document.getElementById('linkInput');
  const templateEl = document.getElementById('templateWa');
  const name = nameEl?.value.trim();
  if (!name) { toast('Masukkan nama tamu dulu'); return; }
  const link     = BASE_URL + '/?name=' + encodeURIComponent(name);
  const template = templateEl?.value.replace('[NAMA TAMU]', name).replace('[LINK]', link) || link;
  window.open('https://wa.me/?text=' + encodeURIComponent(template), '_blank');
}

function shareWaTamu(nameEncoded) {
  const name = decodeURIComponent(nameEncoded);
  const link = BASE_URL + '/?name=' + nameEncoded;
  const msg  = `Assalamualaikum *${name}*,\n\nKami mengundang Anda di pernikahan kami.\n\nBuka undangan: ${link}\n\nNormandia & Sella 💚`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

/* ----- 16. GENERATE LINK ----- */
function genLinkTamu(nameEncoded) {
  const link = BASE_URL + '/?name=' + nameEncoded;
  const name = decodeURIComponent(nameEncoded.replace(/\+/g, ' '));
  navigator.clipboard?.writeText(link);
  toast('Link untuk ' + name + ' disalin!');
}

/* ----- 17. FILTER TAMU ----- */
function filterTamu(query) {
  document.querySelectorAll('#tamu-tbody tr').forEach(row => {
    const text = row.cells[0]?.textContent.toLowerCase() || '';
    row.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
}

/* ----- UTILS ----- */
function escHtml(s = '') {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatRelativeTime(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)          return 'Baru saja';
  if (diff < 3600)        return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400)       return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7)   return `${Math.floor(diff / 86400)} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/* ----- EXPOSE ke HTML (onclick) ----- */
window.appInit           = appInit;
window.showPage          = showPage;
window.toast             = toast;
window.openModal         = openModal;
window.closeModal        = closeModal;
window.closeModalOutside = closeModalOutside;
window.tambahTamu        = tambahTamu;
window.hapusTamu         = hapusTamu;
window.editTamu          = editTamu;
window.simpanEditTamu    = simpanEditTamu;
window.uploadFoto        = uploadFoto;
window.hapusFoto         = hapusFoto;
window.previewLink       = previewLink;
window.copyPreviewLink   = copyPreviewLink;
window.openWa            = openWa;
window.shareWaTamu       = shareWaTamu;
window.genLinkTamu       = genLinkTamu;
window.filterTamu        = filterTamu;

/* ----- SIDEBAR TOGGLE ----- */
function toggleSidebar() {
  const isMobile = window.innerWidth <= 768;
  const body     = document.body;
  const btn      = document.getElementById('sidebarToggleBtn');

  if (isMobile) {
    body.classList.toggle('sidebar-open');
    const isOpen = body.classList.contains('sidebar-open');
    if (btn) btn.innerHTML = `<i class="ti ti-${isOpen ? 'x' : 'menu-2'}"></i>`;
  } else {
    body.classList.toggle('sidebar-collapsed');
    const isCollapsed = body.classList.contains('sidebar-collapsed');
    if (btn) btn.innerHTML = `<i class="ti ti-${isCollapsed ? 'layout-sidebar-right' : 'menu-2'}"></i>`;
  }
}

document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && e.target.closest('.nav-item')) {
    document.body.classList.remove('sidebar-open');
    const btn = document.getElementById('sidebarToggleBtn');
    if (btn) btn.innerHTML = '<i class="ti ti-menu-2"></i>';
  }
});

window.addEventListener('resize', () => {
  const body = document.body;
  if (window.innerWidth > 768) {
    body.classList.remove('sidebar-open');
  } else {
    body.classList.remove('sidebar-collapsed');
  }
  const btn = document.getElementById('sidebarToggleBtn');
  if (btn) btn.innerHTML = '<i class="ti ti-menu-2"></i>';
});

window.toggleSidebar = toggleSidebar;

/* ============================================================
   SETTINGS
   ============================================================ */

async function loadSettings() {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) { toast('Gagal load settings: ' + error.message); return; }

  const map = {};
  data.forEach(row => map[row.key] = row.value);

  const keys = [
    'nama_pria', 'nama_wanita', 'ortu_pria', 'ortu_wanita',
    'tanggal_akad', 'jam_akad', 'selesai_akad',
    'tanggal_resepsi', 'jam_resepsi', 'selesai_resepsi',
    'lokasi_nama', 'lokasi_alamat', 'lokasi_maps',
    'rekening_1_bank', 'rekening_1_nama', 'rekening_1_nomor',
    'rekening_2_bank', 'rekening_2_nama', 'rekening_2_nomor',
    'alamat_hadiah','lokasi_resepsi_nama', 'lokasi_resepsi_alamat', 'lokasi_resepsi_maps',
    'music_url'
  ];

  keys.forEach(key => {
    const el = document.getElementById('set_' + key);
    if (el && map[key]) el.value = map[key];
  });

  if (map['foto_pria']) {
    const p = document.getElementById('previewFotoPria');
    const b = document.getElementById('btnHapusFotoPria');
    if (p) p.innerHTML = `<img src="${map['foto_pria']}" style="width:100%;height:100%;object-fit:cover">`;
    if (b) b.style.display = 'block';
  }
  if (map['foto_wanita']) {
    const p = document.getElementById('previewFotoWanita');
    const b = document.getElementById('btnHapusFotoWanita');
    if (p) p.innerHTML = `<img src="${map['foto_wanita']}" style="width:100%;height:100%;object-fit:cover">`;
    if (b) b.style.display = 'block';
  }

  // ── Update sidebar nama & tanggal dari settings ──
  const namaPria   = (map['nama_pria']   || '').split(' ')[0];
  const namaWanita = (map['nama_wanita'] || '').split(' ')[0];
  const sidebarEl  = document.getElementById('sidebarNama');
  if (sidebarEl && namaPria && namaWanita) sidebarEl.textContent = namaPria + ' & ' + namaWanita;

  if (map['tanggal_akad']) {
    const tgl = new Date(map['tanggal_akad']);
    const str = tgl.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
    const tanggalEl = document.getElementById('sidebarTanggal');
    if (tanggalEl) tanggalEl.textContent = str;
  }

  // ── Update video preview di settings jika ada ──
  if (map['video_url']) {
    const vp = document.getElementById('previewVideoUndangan');
    const vn = document.getElementById('videoNamaFile');
    if (vp) { vp.src = map['video_url']; vp.style.display = 'block'; }
    if (vn) vn.textContent = 'Video tersimpan ✅';
    const delBtn = document.getElementById('btnHapusVideo');
    if (delBtn) delBtn.style.display = 'inline-flex';
  }

  // ── Preview musik di dashboard ──
  if (map['music_url']) {
    const musicInp   = document.getElementById('set_music_url');
    const musicAudio = document.getElementById('previewMusicAudio');
    const musicWrap  = document.getElementById('musicPreviewWrap');
    if (musicInp)   musicInp.value = map['music_url'];
    if (musicAudio) { musicAudio.src = map['music_url']; }
    if (musicWrap)  musicWrap.style.display = 'block';
  }
}

async function saveSettings() {
  const keys = [
    'nama_pria', 'nama_wanita', 'ortu_pria', 'ortu_wanita',
    'tanggal_akad', 'jam_akad', 'selesai_akad',
    'tanggal_resepsi', 'jam_resepsi', 'selesai_resepsi',
    'lokasi_nama', 'lokasi_alamat', 'lokasi_maps',
    'rekening_1_bank', 'rekening_1_nama', 'rekening_1_nomor',
    'rekening_2_bank', 'rekening_2_nama', 'rekening_2_nomor',
    'alamat_hadiah','lokasi_resepsi_nama', 'lokasi_resepsi_alamat', 'lokasi_resepsi_maps',
    'music_url'
  ];

  const btn = document.querySelector('[onclick="saveSettings()"]');
  if (btn) { btn.textContent = 'Menyimpan...'; btn.disabled = true; }

  let errors = 0;
  for (const key of keys) {
    const el = document.getElementById('set_' + key);
    if (!el) continue;
    const value = el.value.trim();

    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) { console.error('Save error for', key, error.message); errors++; }
  }

  if (btn) { btn.innerHTML = '<i class="ti ti-device-floppy"></i> Simpan Semua'; btn.disabled = false; }

  if (errors === 0) toast('Pengaturan berhasil disimpan! ✅');
  else toast(`${errors} item gagal disimpan`);
}

window.loadSettings = loadSettings;
window.saveSettings = saveSettings;

/* ============================================================
   MANAJEMEN AKUN
   ============================================================ */

let _akunCache = []; // simpan semua data akun agar dropdown tidak perlu refetch

async function loadAkun() {
  const role        = localStorage.getItem('dashboard_role') || 'admin';
  const currentUser = localStorage.getItem('dashboard_username') || '';

  // Sesi aktif
  const aktifEl = document.getElementById('akun-aktif-username');
  if (aktifEl) aktifEl.textContent = currentUser;

  if (role === 'admin') {
    await _loadAkunAdmin(currentUser);
  } else {
    await _loadAkunUser(currentUser);
  }
}

/* ----- ADMIN: tabel + dropdown + inline panel ----- */
async function _loadAkunAdmin(currentUser) {
  // Tampilkan elemen admin
  const tableCard = document.getElementById('akun-table-card');
  const addBtn    = document.getElementById('btnTambahAkun');
  const dropWrap  = document.getElementById('akun-dropdown-wrap');
  const panelTitle = document.getElementById('akun-panel-title');
  if (tableCard)  tableCard.style.display  = 'block';
  if (addBtn)     addBtn.style.display     = '';
  if (dropWrap)   dropWrap.style.display   = 'block';
  if (panelTitle) panelTitle.textContent   = 'Edit Akun';

  // Sembunyikan role field biar tetap visible untuk admin
  const roleRow = document.getElementById('akun-role-row');
  if (roleRow) roleRow.style.display = '';

  const tbody = document.getElementById('akun-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:20px">Memuat...</td></tr>';

  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, nomor_hp, role, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#e07a5f;padding:20px">Gagal memuat akun</td></tr>';
    return;
  }

  _akunCache = data || [];

  // Render tabel
  if (!data.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:20px">Belum ada akun</td></tr>';
  } else {
    tbody.innerHTML = data.map(a => {
      const tgl = new Date(a.created_at.endsWith('Z') || a.created_at.includes('+') ? a.created_at : a.created_at + 'Z')
        .toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const isSelf    = (a.username || '').toLowerCase() === currentUser.toLowerCase();
      const roleBadge = a.role === 'admin'
        ? '<span style="font-size:10px;background:#3a5a40;color:#c8e6c9;padding:2px 8px;border-radius:99px;font-weight:600">👑 Admin</span>'
        : '<span style="font-size:10px;background:#333;color:#aaa;padding:2px 8px;border-radius:99px;font-weight:600">👤 User</span>';
      return `<tr>
        <td style="font-weight:500">${escHtml(a.username || '')}${isSelf ? ' <span style="font-size:10px;background:var(--sage);color:#fff;padding:1px 7px;border-radius:99px;vertical-align:middle">Anda</span>' : ''}</td>
        <td>${roleBadge}</td>
        <td style="color:var(--text2)">${escHtml(a.nomor_hp || '—')}</td>
        <td style="color:var(--text3);font-size:12px">${tgl}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="editAkun('${a.id}')">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="btn btn-sm" onclick="hapusAkun('${a.id}','${escHtml(a.username||'')}')"
              style="color:#e07a5f;border-color:#e07a5f" ${isSelf ? 'disabled title="Tidak bisa hapus akun sendiri"' : ''}>
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Populate dropdown
  const sel = document.getElementById('akun-select-user');
  if (sel) {
    sel.innerHTML = '<option value="">— Pilih akun —</option>' +
      data.map(a => `<option value="${a.id}">${escHtml(a.username || '')} (${a.role === 'admin' ? '👑 Admin' : '👤 User'})</option>`).join('');
  }
}

/* ----- USER: hanya profil sendiri ----- */
async function _loadAkunUser(currentUser) {
  // Sembunyikan elemen admin
  const tableCard = document.getElementById('akun-table-card');
  const addBtn    = document.getElementById('btnTambahAkun');
  const dropWrap  = document.getElementById('akun-dropdown-wrap');
  const panelTitle = document.getElementById('akun-panel-title');
  if (tableCard)  tableCard.style.display  = 'none';
  if (addBtn)     addBtn.style.display     = 'none';
  if (dropWrap)   dropWrap.style.display   = 'none';
  if (panelTitle) panelTitle.textContent   = 'Profil Saya';

  // Sembunyikan role field — user tidak bisa ubah role sendiri
  const roleRow = document.getElementById('akun-role-row');
  if (roleRow) roleRow.style.display = 'none';

  // Fetch data diri sendiri
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, nomor_hp, role')
    .eq('username', currentUser)
    .maybeSingle();

  if (error || !data) {
    toast('Gagal memuat profil');
    return;
  }

  // Langsung tampilkan form dengan data sendiri (tanpa empty state)
  _populateEditPanel(data, false /* user tidak bisa hapus akun sendiri */);
}

/* ----- Isi form inline dari data akun ----- */
function _populateEditPanel(akun, canDelete) {
  document.getElementById('akun-edit-id').value       = akun.id;
  document.getElementById('akun-username').value      = akun.username || '';
  document.getElementById('akun-nohp').value          = akun.nomor_hp || '';
  document.getElementById('akun-password').value      = '';
  if (document.getElementById('akun-role')) {
    document.getElementById('akun-role').value = akun.role || 'admin';
  }

  document.getElementById('akun-panel-empty').style.display  = 'none';
  document.getElementById('akun-form-wrap').style.display     = 'block';

  const hapusBtn = document.getElementById('akun-hapus-panel-btn');
  if (hapusBtn) hapusBtn.style.display = canDelete ? '' : 'none';
}

/* ----- Dipanggil dari dropdown select ----- */
function onSelectAkunDropdown(id) {
  if (!id) {
    document.getElementById('akun-panel-empty').style.display = 'block';
    document.getElementById('akun-form-wrap').style.display   = 'none';
    return;
  }
  const akun = _akunCache.find(a => a.id === id);
  if (!akun) return;
  const currentUser = localStorage.getItem('dashboard_username') || '';
  const isSelf = (akun.username || '').toLowerCase() === currentUser.toLowerCase();
  _populateEditPanel(akun, !isSelf);
}

/* ----- Dipanggil dari tombol edit di tabel ----- */
function editAkun(id) {
  const akun = _akunCache.find(a => a.id === id);
  if (!akun) return;
  const currentUser = localStorage.getItem('dashboard_username') || '';
  const isSelf = (akun.username || '').toLowerCase() === currentUser.toLowerCase();
  _populateEditPanel(akun, !isSelf);

  // Sync dropdown
  const sel = document.getElementById('akun-select-user');
  if (sel) sel.value = id;

  // Scroll ke panel
  document.getElementById('akun-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ----- Simpan perubahan dari inline panel ----- */
async function simpanAkun() {
  const role     = localStorage.getItem('dashboard_role') || 'admin';
  const id       = document.getElementById('akun-edit-id').value.trim();
  const username = document.getElementById('akun-username').value.trim();
  const nohp     = document.getElementById('akun-nohp').value.trim();
  const password = document.getElementById('akun-password').value.trim();
  const newRole  = role === 'admin' ? (document.getElementById('akun-role')?.value || 'user') : undefined;

  if (!id)       { toast('Pilih akun dulu'); return; }
  if (!username) { toast('Username wajib diisi'); return; }
  if (password && password.length < 6) { toast('Password minimal 6 karakter'); return; }

  const saveBtn = document.querySelector('#akun-form-wrap .btn-primary');
  if (saveBtn) { saveBtn.innerHTML = '<i class="ti ti-loader"></i> Menyimpan...'; saveBtn.disabled = true; }

  const payload = { username, nomor_hp: nohp || null };
  if (newRole !== undefined) payload.role = newRole;
  if (password) payload.password = password;

  const { error } = await supabase.from('accounts').update(payload).eq('id', id);

  if (saveBtn) { saveBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Simpan Perubahan'; saveBtn.disabled = false; }

  if (error) { toast('Gagal simpan: ' + error.message); return; }

  toast('Akun berhasil diperbarui ✅');
  loadAkun();
}

/* ----- Hapus dari inline panel ----- */
async function hapusAkunDariPanel() {
  const id       = document.getElementById('akun-edit-id').value.trim();
  const username = document.getElementById('akun-username').value.trim();
  if (!id) return;
  if (!confirm(`Hapus akun "${username}"? Tindakan ini tidak bisa dibatalkan.`)) return;

  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) { toast('Gagal hapus: ' + error.message); return; }

  toast('Akun dihapus');
  document.getElementById('akun-edit-id').value = '';
  document.getElementById('akun-panel-empty').style.display = 'block';
  document.getElementById('akun-form-wrap').style.display   = 'none';
  const sel = document.getElementById('akun-select-user');
  if (sel) sel.value = '';
  loadAkun();
}

/* ----- Hapus dari tombol di tabel ----- */
async function hapusAkun(id, username) {
  if (!confirm(`Hapus akun "${username}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) { toast('Gagal hapus: ' + error.message); return; }
  toast('Akun dihapus');
  loadAkun();
}

/* ----- Tambah akun baru (modal, admin only) ----- */
function openTambahAkun() {
  document.getElementById('modal-akun-username').value = '';
  document.getElementById('modal-akun-nohp').value     = '';
  document.getElementById('modal-akun-role').value     = 'user';
  document.getElementById('modal-akun-password').value = '';
  const modal = document.getElementById('modal-akun');
  if (modal) modal.style.display = 'flex';
  setTimeout(() => document.getElementById('modal-akun-username')?.focus(), 100);
}

function closeModalAkun() {
  const modal = document.getElementById('modal-akun');
  if (modal) modal.style.display = 'none';
}

async function simpanTambahAkun() {
  const username = document.getElementById('modal-akun-username').value.trim();
  const nohp     = document.getElementById('modal-akun-nohp').value.trim();
  const role     = document.getElementById('modal-akun-role').value;
  const password = document.getElementById('modal-akun-password').value.trim();

  if (!username) { toast('Username wajib diisi'); return; }
  if (!password) { toast('Password wajib diisi'); return; }
  if (password.length < 6) { toast('Password minimal 6 karakter'); return; }

  const btn = document.querySelector('#modal-akun .btn-primary');
  if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Menambahkan...'; btn.disabled = true; }

  const { error } = await supabase.from('accounts')
    .insert([{ username, nomor_hp: nohp || null, password, role }]);

  if (btn) { btn.innerHTML = '<i class="ti ti-plus"></i> Tambah Akun'; btn.disabled = false; }

  if (error) { toast('Gagal tambah akun: ' + error.message); return; }

  toast('Akun berhasil ditambahkan ✅');
  closeModalAkun();
  loadAkun();
}

function togglePassVisibility(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}

window.loadAkun              = loadAkun;
window.openTambahAkun        = openTambahAkun;
window.closeModalAkun        = closeModalAkun;
window.simpanAkun            = simpanAkun;
window.simpanTambahAkun      = simpanTambahAkun;
window.hapusAkun             = hapusAkun;
window.hapusAkunDariPanel    = hapusAkunDariPanel;
window.editAkun              = editAkun;
window.onSelectAkunDropdown  = onSelectAkunDropdown;
window.togglePassVisibility  = togglePassVisibility;

/* ----- VIDEO UNDANGAN ----- */
async function uploadVideoUndangan(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('Video maks 50MB'); return; }

  const namaFile = document.getElementById('videoNamaFile');
  if (namaFile) namaFile.textContent = 'Mengupload...';

  const fileName = 'video-undangan-' + Date.now() + '.' + file.name.split('.').pop();
  const { error: uploadErr } = await supabase.storage
    .from('foto-prewed')
    .upload(fileName, file, { cacheControl: '3600', upsert: true });

  if (uploadErr) { toast('Gagal upload: ' + uploadErr.message); if(namaFile) namaFile.textContent='Gagal upload'; return; }

  const { data: urlData } = supabase.storage.from('foto-prewed').getPublicUrl(fileName);
  const url = urlData.publicUrl;

  const { error } = await supabase.from('settings')
    .upsert({ key: 'video_url', value: url, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) { toast('Gagal simpan URL video'); return; }

  const vp = document.getElementById('previewVideoUndangan');
  if (vp) { vp.src = url; vp.style.display = 'block'; }
  if (namaFile) namaFile.textContent = file.name + ' ✅';
  const delBtn = document.getElementById('btnHapusVideo');
  if (delBtn) delBtn.style.display = 'inline-flex';
  toast('Video berhasil diupload ✅');
  input.value = '';
}

async function hapusVideoUndangan() {
  if (!confirm('Hapus video undangan?')) return;
  const { error } = await supabase.from('settings')
    .upsert({ key: 'video_url', value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { toast('Gagal hapus'); return; }
  const vp = document.getElementById('previewVideoUndangan');
  if (vp) { vp.src = ''; vp.style.display = 'none'; }
  const namaFile = document.getElementById('videoNamaFile');
  if (namaFile) namaFile.textContent = 'Belum ada video. Format: MP4, maks 50MB.';
  const delBtn = document.getElementById('btnHapusVideo');
  if (delBtn) delBtn.style.display = 'none';
  toast('Video dihapus');
}
window.uploadVideoUndangan = uploadVideoUndangan;
window.hapusVideoUndangan  = hapusVideoUndangan;

async function uploadFotoMempelai(gender, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('Ukuran file maks 10MB'); return; }

  toast('Mengupload foto...');

  const fileName = `mempelai-${gender}-${Date.now()}.${file.name.split('.').pop()}`;
  const { error: uploadErr } = await supabase.storage
    .from('foto-prewed')
    .upload(fileName, file, { cacheControl: '3600', upsert: true });

  if (uploadErr) { toast('Gagal upload: ' + uploadErr.message); return; }

  const { data: urlData } = supabase.storage.from('foto-prewed').getPublicUrl(fileName);
  const url = urlData.publicUrl;

  const key = gender === 'pria' ? 'foto_pria' : 'foto_wanita';
  const { error } = await supabase.from('settings')
    .upsert({ key, value: url, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) { toast('Gagal simpan URL foto'); return; }

  const previewId = gender === 'pria' ? 'previewFotoPria' : 'previewFotoWanita';
  const btnId     = gender === 'pria' ? 'btnHapusFotoPria' : 'btnHapusFotoWanita';
  const preview = document.getElementById(previewId);
  const hapusBtn = document.getElementById(btnId);
  if (preview) preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`;
  if (hapusBtn) hapusBtn.style.display = 'block';
  toast(`Foto ${gender} berhasil diupload! ✅`);
  input.value = '';
}
window.uploadFotoMempelai = uploadFotoMempelai;

async function hapusFotoMempelai(gender) {
  if (!confirm(`Hapus foto mempelai ${gender}?`)) return;

  const key = gender === 'pria' ? 'foto_pria' : 'foto_wanita';
  const emoji = gender === 'pria' ? '🤵' : '👰';

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) { toast('Gagal hapus foto'); return; }

  const previewId = gender === 'pria' ? 'previewFotoPria' : 'previewFotoWanita';
  const btnId     = gender === 'pria' ? 'btnHapusFotoPria' : 'btnHapusFotoWanita';
  const preview  = document.getElementById(previewId);
  const hapusBtn = document.getElementById(btnId);
  if (preview)  preview.innerHTML = emoji;
  if (hapusBtn) hapusBtn.style.display = 'none';
  toast(`Foto ${gender} dihapus`);
}
window.hapusFotoMempelai = hapusFotoMempelai;

/* ----- Export RSVP ----- */
function exportRsvp() {
  const data = pagState.rsvp.data;
  if (!data.length) { toast('Tidak ada data untuk diexport'); return; }
  if (typeof XLSX === 'undefined') { toast('Library Excel belum siap'); return; }
  const rows = [['Nama', 'Nomor HP', 'Jumlah Tamu', 'Status', 'Waktu']];
  data.forEach(r => {
    const tgl = new Date(r.created_at.endsWith('Z')||r.created_at.includes('+')?r.created_at:r.created_at+'Z')
      .toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'});
    rows.push([r.nama||'', r.nomor_hp||'', r.jumlah_tamu||1, r.kehadiran==='hadir'?'Hadir':'Tidak Hadir', tgl]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:28},{wch:16},{wch:14},{wch:14},{wch:16}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data RSVP');
  XLSX.writeFile(wb, 'data-rsvp.xlsx');
  toast('Export RSVP berhasil ✅');
}
window.exportRsvp = exportRsvp;

function exportWishes() {
  const data = pagState.wishes.data;
  if (!data || !data.length) { toast('Tidak ada data untuk diexport'); return; }
  if (typeof XLSX === 'undefined') { toast('Library Excel belum siap'); return; }
  const rows = [['Nama', 'Nomor HP', 'Ucapan & Doa', 'Waktu']];
  data.forEach(w => {
    const waktu = new Date(w.created_at.endsWith('Z')||w.created_at.includes('+')?w.created_at:w.created_at+'Z')
      .toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    rows.push([w.nama||'', w.nomor_hp||'', w.pesan||'', waktu]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:24},{wch:16},{wch:50},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Wedding Wishes');
  XLSX.writeFile(wb, 'wedding-wishes.xlsx');
  toast('Export Wishes berhasil ✅');
}

function filterWishes(query) {
  document.querySelectorAll('#wishes-container .wish-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
}

window.exportWishes  = exportWishes;
window.filterWishes  = filterWishes;

/* ============================================================
   PAGINATION ENGINE
   ============================================================ */

const pagState = {
  tamu:     { data: [], filtered: [], page: 1, perPage: 10, query: '', sortCol: null, sortDir: 'asc' },
  rsvp:     { data: [], filtered: [], page: 1, perPage: 10, query: '', sortCol: null, sortDir: 'asc' },
  wishes:   { data: [], filtered: [], page: 1, perPage: 10, query: '', sortCol: null, sortDir: 'asc' },
  undangan: { data: [], filtered: [], page: 1, perPage: 10, query: '', sortCol: null, sortDir: 'asc' },
  activity: { data: [], filtered: [], page: 1, perPage: 10, query: '', sortCol: null, sortDir: 'asc' },
};

function renderPage(key) {
  const st     = pagState[key];
  const total  = st.filtered.length;
  const perPage = parseInt(st.perPage);
  const totalPages = perPage >= 999 ? 1 : Math.ceil(total / perPage);
  const start  = (st.page - 1) * perPage;
  const end    = perPage >= 999 ? total : Math.min(start + perPage, total);
  const items  = st.filtered.slice(start, end);

  if (key === 'tamu')     renderTamuRows(items);
  if (key === 'rsvp')     renderRsvpRows(items);
  if (key === 'wishes')   renderWishesItems(items);
  if (key === 'undangan') renderUndanganRows(items);
  if (key === 'activity') renderActivityItems(items);

  if (key !== 'activity') {
    document.querySelectorAll(`[data-sort-key="${key}"]`).forEach(th => {
      const col = th.getAttribute('data-sort-col');
      const iconEl = th.querySelector('.sort-icon');
      if (iconEl) {
        const st = pagState[key];
        if (!st || st.sortCol !== col) {
          iconEl.innerHTML = '<i class="ti ti-arrows-sort" style="font-size:10px;opacity:0.35;margin-left:4px;vertical-align:middle"></i>';
        } else {
          iconEl.innerHTML = st.sortDir === 'asc'
            ? '<i class="ti ti-sort-ascending" style="font-size:11px;margin-left:4px;color:var(--sage);vertical-align:middle"></i>'
            : '<i class="ti ti-sort-descending" style="font-size:11px;margin-left:4px;color:var(--sage);vertical-align:middle"></i>';
        }
      }
    });
  }

  const infoEl = document.getElementById(`${key}-pag-info`);
  if (infoEl) {
    infoEl.textContent = total === 0
      ? 'Tidak ada data'
      : `Menampilkan ${start + 1}–${end} dari ${total}`;
  }

  const pagEl = document.getElementById(`${key}-pagination`);
  if (pagEl) pagEl.style.display = total > 0 ? 'flex' : 'none';

  const numsEl = document.getElementById(`${key}-page-nums`);
  if (numsEl) {
    numsEl.innerHTML = '';
    let startPage = Math.max(1, st.page - 2);
    let endPage   = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === st.page ? ' active' : '');
      btn.textContent = i;
      btn.onclick = () => { pagState[key].page = i; renderPage(key); };
      numsEl.appendChild(btn);
    }
  }

  const prevBtn = document.getElementById(`${key}-prev`);
  const nextBtn = document.getElementById(`${key}-next`);
  if (prevBtn) prevBtn.disabled = st.page <= 1;
  if (nextBtn) nextBtn.disabled = st.page >= totalPages;
}

function changePage(key, dir) {
  const st = pagState[key];
  const perPage = parseInt(st.perPage);
  const totalPages = perPage >= 999 ? 1 : Math.ceil(st.filtered.length / perPage);
  st.page = Math.max(1, Math.min(st.page + dir, totalPages));
  renderPage(key);
}

function setPerPage(key, val) {
  pagState[key].perPage = parseInt(val);
  pagState[key].page = 1;
  renderPage(key);
}

function applyFilter(key, query) {
  pagState[key].query = query.toLowerCase();
  pagState[key].filtered = pagState[key].data.filter(item => {
    const text = JSON.stringify(item).toLowerCase();
    return text.includes(pagState[key].query);
  });
  pagState[key].page = 1;
  sortData(key);
  renderPage(key);
}

function onSearchTamu(q)     { applyFilter('tamu', q); }
function onSearchRsvp(q)     { applyFilter('rsvp', q); }
function onSearchWishes(q)   { applyFilter('wishes', q); }
function onSearchActivity(q) { applyFilter('activity', q); }

function sortData(key) {
  const st = pagState[key];
  if (!st.sortCol) return;
  const col = st.sortCol;
  const dir = st.sortDir === 'asc' ? 1 : -1;
  st.filtered.sort((a, b) => {
    let av = a[col] ?? '';
    let bv = b[col] ?? '';
    if (col === 'time') { av = a.time ? a.time.getTime() : 0; bv = b.time ? b.time.getTime() : 0; }
    else if (col === 'created_at') { av = new Date(a.created_at||0).getTime(); bv = new Date(b.created_at||0).getTime(); }
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  });
}

function applySort(key, col) {
  const st = pagState[key];
  if (st.sortCol === col) {
    st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    st.sortCol = col;
    st.sortDir = 'asc';
  }
  sortData(key);
  updateSortHeaders(key);
  renderPage(key);
}

function sortIcon(key, col) {
  const st = pagState[key];
  if (!st || st.sortCol !== col) return '<i class="ti ti-arrows-sort" style="font-size:10px;opacity:0.35;margin-left:4px;vertical-align:middle"></i>';
  return st.sortDir === 'asc'
    ? '<i class="ti ti-sort-ascending" style="font-size:11px;margin-left:4px;color:var(--sage);vertical-align:middle"></i>'
    : '<i class="ti ti-sort-descending" style="font-size:11px;margin-left:4px;color:var(--sage);vertical-align:middle"></i>';
}

function updateSortHeaders(key) {
  document.querySelectorAll(`[data-sort-key="${key}"]`).forEach(th => {
    const col = th.getAttribute('data-sort-col');
    const iconEl = th.querySelector('.sort-icon');
    if (iconEl) iconEl.outerHTML = sortIcon(key, col);
    else th.innerHTML = th.innerHTML;
  });
}

/* ----- Render: AKTIVITAS ----- */
function renderActivityItems(items) {
  const container = document.getElementById('activityContainer');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <i class="ti ti-activity"></i>
        <div class="empty-title">Tidak ada aktivitas</div>
        <div class="empty-sub">Coba ubah kata kunci pencarian</div>
      </div>`;
    return;
  }

  const rows = items.map(a => {
    const timeStr = formatRelativeTime(a.time);
    let statusBadge;
    if (a.kehadiran === 'hadir') {
      statusBadge = `<span class="badge badge-green"><i class="ti ti-check" style="font-size:10px"></i> Hadir</span>`;
    } else if (a.kehadiran === 'tidak') {
      statusBadge = `<span class="badge badge-red"><i class="ti ti-x" style="font-size:10px"></i> Tidak Hadir</span>`;
    } else {
      statusBadge = `<span class="badge badge-gray">—</span>`;
    }
    const wishCell = a.pesan
      ? `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(a.pesan)}</div>`
      : `<span style="color:var(--text3)">—</span>`;

    return `
      <tr>
        <td style="width:120px">${statusBadge}</td>
        <td style="font-weight:500">${escHtml(a.nama)}</td>
        <td style="color:var(--text2);font-size:12px">${wishCell}</td>
        <td style="color:var(--text3);font-size:12px;white-space:nowrap;text-align:right">${timeStr}</td>
      </tr>`;
  }).join('');

  const si = (col) => sortIcon('activity', col);
  container.innerHTML = `
    <table style="margin-top:4px">
      <thead>
        <tr>
          <th data-sort-key="activity" data-sort-col="type" onclick="applySort('activity','type')" style="cursor:pointer;user-select:none">STATUS<span class="sort-icon">${si('type')}</span></th>
          <th data-sort-key="activity" data-sort-col="nama" onclick="applySort('activity','nama')" style="cursor:pointer;user-select:none">NAMA<span class="sort-icon">${si('nama')}</span></th>
          <th data-sort-key="activity" data-sort-col="pesan" onclick="applySort('activity','pesan')" style="cursor:pointer;user-select:none">WISHES<span class="sort-icon">${si('pesan')}</span></th>
          <th data-sort-key="activity" data-sort-col="time" onclick="applySort('activity','time')" style="cursor:pointer;user-select:none;text-align:right">WAKTU<span class="sort-icon">${si('time')}</span></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ----- Render: TAMU ----- */
function renderTamuRows(items) {
  const tbody = document.getElementById('tamu-tbody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px">Tidak ada data</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(t => {
    const slug = encodeURIComponent(t.nama);
    let rsvpBadge;
    if (t._rsvpStatus === 'hadir') {
      rsvpBadge = '<span class="badge badge-green"><i class="ti ti-check" style="font-size:10px"></i> Hadir</span>';
    } else if (t._rsvpStatus === 'tidak') {
      rsvpBadge = '<span class="badge badge-red"><i class="ti ti-x" style="font-size:10px"></i> Tidak Hadir</span>';
    } else {
      rsvpBadge = '<span class="badge badge-gray">Belum RSVP</span>';
    }
    return `
      <tr data-id="${t.id}">
        <td style="width:36px">
          <input type="checkbox" class="tamu-check" data-id="${t.id}" onchange="_updateBulkHapusTamuBtn()" style="cursor:pointer">
        </td>
        <td style="white-space:nowrap">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar">${escHtml((t.nama||'').slice(0,2).toUpperCase())}</div>
            ${escHtml(t.nama||'')}
          </div>
        </td>
        <td style="color:var(--text2)">${escHtml(t.hubungan||'—')}</td>
        <td style="color:var(--text2);font-size:13px">${escHtml(t.nomor_wa||'—')}</td>
        <td>${rsvpBadge}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-icon" onclick="editTamu('${t.id}','${escHtml(t.nama||'')}','${escHtml(t.hubungan||'')}','${escHtml(t.nomor_wa||'')}')" title="Edit"><i class="ti ti-edit"></i></button>
            <button class="btn btn-sm btn-icon" onclick="hapusTamu('${t.id}', this)" title="Hapus"><i class="ti ti-trash"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ----- Render: RSVP ----- */
function renderRsvpRows(items) {
  const tbody = document.getElementById('rsvp-tbody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px">Tidak ada data</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(r => `
    <tr data-id="${r.id}">
      <td style="width:36px">
        <input type="checkbox" class="rsvp-check" data-id="${r.id}" onchange="_updateBulkHapusRsvpBtn()" style="cursor:pointer">
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="avatar">${escHtml((r.nama||'').slice(0,2).toUpperCase())}</div>
          ${escHtml(r.nama||'')}
        </div>
      </td>
      <td style="color:var(--text2);font-size:13px">${escHtml(r.nomor_hp||'—')}</td>
      <td>${r.jumlah_tamu || 1} orang</td>
      <td><span class="badge ${r.kehadiran === 'hadir' ? 'badge-green' : 'badge-red'}">${r.kehadiran === 'hadir' ? 'Hadir' : 'Tidak Hadir'}</span></td>
      <td style="color:var(--text3);font-size:12px">${new Date(r.created_at.endsWith('Z')||r.created_at.includes('+')?r.created_at:r.created_at+'Z').toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'})}</td>
      <td>
        <button class="btn btn-sm btn-icon" onclick="hapusRsvp('${r.id}',this)" title="Hapus"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function toggleSelectAllRsvp(checked) {
  document.querySelectorAll('#rsvp-tbody .rsvp-check').forEach(cb => cb.checked = checked);
  _updateBulkHapusRsvpBtn();
}
function _updateBulkHapusRsvpBtn() {
  const n = document.querySelectorAll('#rsvp-tbody .rsvp-check:checked').length;
  const btn = document.getElementById('btn-bulk-hapus-rsvp');
  const cnt = document.getElementById('bulk-hapus-rsvp-count');
  const all = document.getElementById('rsvp-check-all');
  const tot = document.querySelectorAll('#rsvp-tbody .rsvp-check').length;
  if (btn) btn.style.display = n > 0 ? 'inline-flex' : 'none';
  if (cnt) cnt.textContent = n;
  if (all) { all.indeterminate = n > 0 && n < tot; all.checked = n > 0 && n === tot; }
}
async function hapusRsvp(id, btn) {
  if (!confirm('Hapus data RSVP ini?')) return;
  btn.disabled = true;
  const { error } = await supabase.from('rsvp').delete().eq('id', id);
  if (error) { toast('Gagal hapus'); btn.disabled = false; return; }
  toast('Data RSVP dihapus');
  loadRsvp(); loadOverview();
}
async function bulkHapusRsvp() {
  const checked = Array.from(document.querySelectorAll('#rsvp-tbody .rsvp-check:checked'));
  if (!checked.length) return;
  if (!confirm(`Hapus ${checked.length} data RSVP?`)) return;
  const ids = checked.map(cb => cb.dataset.id);
  const { error } = await supabase.from('rsvp').delete().in('id', ids);
  if (error) { toast('Gagal hapus: ' + error.message); return; }
  toast(`✅ ${ids.length} data RSVP dihapus`);
  loadRsvp(); loadOverview();
}
window.toggleSelectAllRsvp   = toggleSelectAllRsvp;
window._updateBulkHapusRsvpBtn = _updateBulkHapusRsvpBtn;
window.hapusRsvp             = hapusRsvp;
window.bulkHapusRsvp         = bulkHapusRsvp;

/* ----- Render: WISHES ----- */
function renderWishesItems(items) {
  const container = document.getElementById('wishes-container');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px">Tidak ada data</td></tr>';
    return;
  }
  container.innerHTML = items.map(w => {
    const timeStr = new Date(w.created_at.endsWith('Z')||w.created_at.includes('+')?w.created_at:w.created_at+'Z')
      .toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    return `
      <tr data-id="${w.id}">
        <td style="width:36px">
          <input type="checkbox" class="wishes-check" data-id="${w.id}" onchange="_updateBulkHapusWishesBtn()" style="cursor:pointer">
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar">${escHtml((w.nama||'').slice(0,2).toUpperCase())}</div>
            <span style="font-weight:500">${escHtml(w.nama||'')}</span>
          </div>
        </td>
        <td style="color:var(--text2);font-size:13px">${escHtml(w.nomor_hp||'—')}</td>
        <td style="color:var(--text2);font-size:13px;max-width:320px">
          <div id="pesan-${w.id}" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.6">${escHtml(w.pesan||'')}</div>
          ${(w.pesan||'').length > 120 ? `<button onclick="togglePesan('${w.id}',this)" style="background:none;border:none;color:var(--sage);font-size:11px;cursor:pointer;padding:2px 0;margin-top:3px;letter-spacing:0.03em">Selengkapnya ▾</button>` : ''}
        </td>
        <td style="color:var(--text3);font-size:12px;white-space:nowrap;text-align:right">${timeStr}</td>
        <td>
          <button class="btn btn-sm btn-icon" onclick="hapusWish('${w.id}',this)" title="Hapus"><i class="ti ti-trash"></i></button>
        </td>
      </tr>`;
  }).join('');
}

function togglePesan(id, btn) {
  const el = document.getElementById('pesan-' + id);
  if (!el) return;
  const isExpanded = el.style.webkitLineClamp === 'unset';
  if (isExpanded) {
    el.style.overflow        = 'hidden';
    el.style.display         = '-webkit-box';
    el.style.webkitLineClamp = '2';
    el.style.webkitBoxOrient = 'vertical';
    btn.textContent          = 'Selengkapnya ▾';
  } else {
    el.style.overflow        = 'visible';
    el.style.display         = 'block';
    el.style.webkitLineClamp = 'unset';
    btn.textContent          = 'Sembunyikan ▴';
  }
}
window.togglePesan = togglePesan;

function toggleSelectAllWishes(checked) {
  document.querySelectorAll('#wishes-container .wishes-check').forEach(cb => cb.checked = checked);
  _updateBulkHapusWishesBtn();
}
function _updateBulkHapusWishesBtn() {
  const n = document.querySelectorAll('#wishes-container .wishes-check:checked').length;
  const btn = document.getElementById('btn-bulk-hapus-wishes');
  const cnt = document.getElementById('bulk-hapus-wishes-count');
  const all = document.getElementById('wishes-check-all');
  const tot = document.querySelectorAll('#wishes-container .wishes-check').length;
  if (btn) btn.style.display = n > 0 ? 'inline-flex' : 'none';
  if (cnt) cnt.textContent = n;
  if (all) { all.indeterminate = n > 0 && n < tot; all.checked = n > 0 && n === tot; }
}
async function hapusWish(id, btn) {
  if (!confirm('Hapus ucapan ini?')) return;
  btn.disabled = true;
  const { error } = await supabase.from('wishes').delete().eq('id', id);
  if (error) { toast('Gagal hapus'); btn.disabled = false; return; }
  toast('Ucapan dihapus');
  loadWishes(); loadOverview();
}
async function bulkHapusWishes() {
  const checked = Array.from(document.querySelectorAll('#wishes-container .wishes-check:checked'));
  if (!checked.length) return;
  if (!confirm(`Hapus ${checked.length} ucapan?`)) return;
  const ids = checked.map(cb => cb.dataset.id);
  const { error } = await supabase.from('wishes').delete().in('id', ids);
  if (error) { toast('Gagal hapus: ' + error.message); return; }
  toast(`✅ ${ids.length} ucapan dihapus`);
  loadWishes(); loadOverview();
}
window.toggleSelectAllWishes     = toggleSelectAllWishes;
window._updateBulkHapusWishesBtn = _updateBulkHapusWishesBtn;
window.hapusWish                 = hapusWish;
window.bulkHapusWishes           = bulkHapusWishes;

/* ----- Export TAMU ----- */
function exportTamu() {
  const data = pagState.tamu.data;
  if (!data.length) { toast('Tidak ada data untuk diexport'); return; }
  if (typeof XLSX === 'undefined') { toast('Library Excel belum siap'); return; }
  const rows = [['Nama Tamu / Keluarga', 'Hubungan', 'Nomor WA', 'Status RSVP']];
  data.forEach(t => {
    const rsvp = t._rsvpStatus === 'hadir' ? 'Hadir' : t._rsvpStatus === 'tidak' ? 'Tidak Hadir' : 'Belum RSVP';
    rows.push([t.nama||'', t.hubungan||'', t.nomor_wa||'', rsvp]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:32},{wch:26},{wch:18},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Tamu');
  XLSX.writeFile(wb, 'daftar-tamu.xlsx');
  toast('Export Tamu berhasil ✅');
}

window.changePage       = changePage;
window.applySort        = applySort;
window.setPerPage       = setPerPage;
window.onSearchTamu     = onSearchTamu;
window.onSearchRsvp     = onSearchRsvp;
window.onSearchWishes   = onSearchWishes;
window.onSearchActivity = onSearchActivity;
window.exportTamu       = exportTamu;

/* ============================================================
   UNDANGAN
   ============================================================ */

let _undanganFilter = 'semua';

async function loadUndangan() {
  const tbody = document.getElementById('undangan-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px">Memuat...</td></tr>';

  const [{ data, error }, { data: rsvpData }, { data: settingsData }] = await Promise.all([
    supabase.from('tamu').select('*').order('nama', { ascending: true }),
    supabase.from('rsvp').select('nama, kehadiran, nomor_hp'),
    supabase.from('settings').select('key, value').eq('key', 'template_wa'),
  ]);
  if (error) { toast('Gagal load data undangan'); return; }

  const templateEl = document.getElementById('templateWa');
  if (templateEl) {
    const saved = settingsData?.[0]?.value;
    templateEl.value = saved || `Assalamualaikum Wr. Wb.\n\nYth. *[NAMA TAMU]*\n\nDengan memohon rahmat dan ridha Allah SWT, kami bermaksud mengundang Anda hadir di hari bahagia kami.\n\nBuka undangan digital kami:\n✨ [LINK]\n\nKehadiran Anda akan menjadi kebahagiaan tersendiri bagi kami.\n\nHormat kami,\n*Normandia & Sella* 💍\n\nWassalamualaikum Wr. Wb.`;
  }

  const rsvpByNama = {};
  const rsvpByHp   = {};
  (rsvpData || []).forEach(r => {
    if (r.nama)     rsvpByNama[r.nama.toLowerCase()]    = r.kehadiran;
    if (r.nomor_hp) rsvpByHp[r.nomor_hp.replace(/\D/g,'')] = r.kehadiran;
  });
  data.forEach(t => {
    const byNama = rsvpByNama[t.nama?.toLowerCase()];
    const byHp   = t.nomor_wa ? rsvpByHp[t.nomor_wa.replace(/\D/g,'')] : null;
    t._rsvpStatus = byNama || byHp || null;
    t._kirimStatus = _getWaSentAt(t.id) ? 1 : 0;
  });

  const badge = document.getElementById('undangan-total-badge');
  if (badge) badge.textContent = data.length + ' tamu';

  if (!pagState.undangan) {
    pagState.undangan = { data: [], filtered: [], page: 1, perPage: 10, query: '', sortCol: null, sortDir: 'asc' };
  }
  pagState.undangan.data = data;
  _applyUndanganFilter();
}

function _applyUndanganFilter() {
  const all = pagState.undangan.data || [];
  const q   = (pagState.undangan.query || '').toLowerCase();

  let filtered;
  if (_undanganFilter === 'belum')  filtered = all.filter(t => !t._rsvpStatus);
  else if (_undanganFilter === 'hadir')  filtered = all.filter(t => t._rsvpStatus === 'hadir');
  else if (_undanganFilter === 'tidak') filtered = all.filter(t => t._rsvpStatus === 'tidak');
  else filtered = all;

  // apply search query (nama or nomor_wa)
  if (q) {
    filtered = filtered.filter(t =>
      (t.nama    || '').toLowerCase().includes(q) ||
      (t.nomor_wa|| '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
      (t.nomor_wa|| '').toLowerCase().includes(q)
    );
  }

  pagState.undangan.filtered = filtered;
  pagState.undangan.page     = 1;

  const chkAll = document.getElementById('undangan-check-all');
  if (chkAll) chkAll.checked = false;
  _updateBulkBtn();

  sortData('undangan');
  renderPage('undangan');
}

function onSearchUndangan(q) {
  pagState.undangan.query = q;
  _applyUndanganFilter();
}

function filterUndangan(type) {
  _undanganFilter = type;
  document.querySelectorAll('.undangan-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === type);
  });
  _applyUndanganFilter();
}

// ── WA Sent Status helpers (localStorage) ───────────────────────────────────
function _waStorageKey(tamuId) { return 'wa_sent_' + tamuId; }
function _getWaSentAt(tamuId) {
  try { return localStorage.getItem(_waStorageKey(tamuId)) || null; } catch(e) { return null; }
}
function _setWaSent(tamuId) {
  try {
    const now = new Date();
    // Format: "DD/MM HH:MM"
    const label = now.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit'}) + ' ' +
                  now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    localStorage.setItem(_waStorageKey(tamuId), label);
    return label;
  } catch(e) { return null; }
}

function renderUndanganRows(items) {
  const tbody = document.getElementById('undangan-tbody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px">Tidak ada tamu</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(t => {
    let rsvpBadge;
    if (t._rsvpStatus === 'hadir') {
      rsvpBadge = '<span class="badge badge-green"><i class="ti ti-check" style="font-size:10px"></i> Hadir</span>';
    } else if (t._rsvpStatus === 'tidak') {
      rsvpBadge = '<span class="badge badge-red"><i class="ti ti-x" style="font-size:10px"></i> Tidak Hadir</span>';
    } else {
      rsvpBadge = '<span class="badge badge-gray">Belum RSVP</span>';
    }
    const noWa = t.nomor_wa
      ? `<span style="font-size:12px;color:var(--text2)">${escHtml(t.nomor_wa)}</span>`
      : `<span style="color:var(--text3);font-size:12px">—</span>`;

    const sentAt = _getWaSentAt(t.id);
    const kirimBadge = sentAt
      ? `<span class="badge badge-green" style="font-size:10px;gap:3px" id="kirim-badge-${t.id}"><i class="ti ti-check" style="font-size:10px"></i> Terkirim<span style="opacity:.75;font-size:9px;margin-left:2px">${sentAt}</span></span>`
      : `<span class="badge badge-gray" style="font-size:10px" id="kirim-badge-${t.id}"><i class="ti ti-clock" style="font-size:10px"></i> Belum Kirim</span>`;

    return `
      <tr data-id="${t.id}" data-nama="${escHtml(t.nama)}" data-wa="${escHtml(t.nomor_wa||'')}">
        <td><input type="checkbox" class="undangan-check" onchange="_updateBulkBtn()" style="cursor:pointer"></td>
        <td style="white-space:nowrap">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar">${escHtml((t.nama||'').slice(0,2).toUpperCase())}</div>
            ${escHtml(t.nama||'')}
          </div>
        </td>
        <td>${noWa}</td>
        <td>${rsvpBadge}</td>
        <td>${kirimBadge}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-icon" style="color:#25d366;border-color:#25d366"
              onclick="kirimWaSatu('${escHtml(t.nama||'')}','${escHtml(t.nomor_wa||'')}','${t.id}')"
              title="Kirim WA"><i class="ti ti-brand-whatsapp"></i></button>
            <button class="btn btn-sm btn-icon" style="color:var(--text2)"
              onclick="copyLinkTamu('${escHtml(t.nama||'')}')"
              title="Salin Link"><i class="ti ti-copy"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleSelectAll(checked) {
  document.querySelectorAll('#undangan-tbody .undangan-check').forEach(cb => cb.checked = checked);
  _updateBulkBtn();
}

function _updateBulkBtn() {
  const selected = document.querySelectorAll('#undangan-tbody .undangan-check:checked').length;
  const btn  = document.getElementById('btn-bulk-kirim');
  const span = document.getElementById('bulk-count');
  if (btn)  btn.style.display  = selected > 0 ? 'inline-flex' : 'none';
  if (span) span.textContent   = selected;
}

function copyLinkTamu(nama) {
  const link = BASE_URL + '/?name=' + encodeURIComponent(nama);
  navigator.clipboard.writeText(link).then(() => { toast('Link disalin ✅'); }).catch(() => {
    const el = document.createElement('textarea');
    el.value = link; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el); toast('Link disalin ✅');
  });
}
window.copyLinkTamu = copyLinkTamu;

function kirimWaSatu(nama, noWa, tamuId) {
  const link     = BASE_URL + '/?name=' + encodeURIComponent(nama);
  const template = document.getElementById('templateWa')?.value || '[LINK]';
  const msg      = template.replace(/\[NAMA TAMU\]/g, nama).replace(/\[LINK\]/g, link);
  const waNum  = noWa.replace(/\D/g,'').replace(/^0/, '62');
  const target = noWa
    ? 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg)
    : 'https://wa.me/?text=' + encodeURIComponent(msg);
  window.open(target, '_blank');

  // ── Update sent status in real-time ──────────────────────────────────────
  if (tamuId) {
    const sentAt = _setWaSent(tamuId);
    const badge = document.getElementById('kirim-badge-' + tamuId);
    if (badge && sentAt) {
      badge.className = 'badge badge-green';
      badge.style.cssText = 'font-size:10px;gap:3px';
      badge.innerHTML = `<i class="ti ti-check" style="font-size:10px"></i> Terkirim<span style="opacity:.75;font-size:9px;margin-left:2px">${sentAt}</span>`;
    }
    // also inject _kirimStatus so sort works after first click without re-render
    const row = badge?.closest('tr');
    if (row) row.dataset.kirimSort = '1';
  }
}

function bulkKirimWa() {
  const rows = document.querySelectorAll('#undangan-tbody .undangan-check:checked');
  if (!rows.length) return;
  rows.forEach(cb => {
    const row    = cb.closest('tr');
    const nama   = row?.dataset.nama || '';
    const noWa   = row?.dataset.wa   || '';
    const tamuId = row?.dataset.id   || '';
    kirimWaSatu(nama, noWa, tamuId);
  });
}

async function saveTemplateWa() {
  const val = document.getElementById('templateWa')?.value?.trim();
  if (!val) { toast('Template tidak boleh kosong!'); return; }

  const btn = document.getElementById('btn-save-template');
  if (btn) { btn.textContent = 'Menyimpan...'; btn.disabled = true; }

  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'template_wa', value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (btn) { btn.innerHTML = '<i class="ti ti-device-floppy"></i> Simpan'; btn.disabled = false; }

  if (error) { toast('Gagal simpan template: ' + error.message); return; }
  toast('Template berhasil disimpan! ✅');
}

window.onSearchUndangan   = onSearchUndangan;
window.loadUndangan       = loadUndangan;
window.renderUndanganRows = renderUndanganRows;
window.filterUndangan     = filterUndangan;
window.toggleSelectAll    = toggleSelectAll;
window._updateBulkBtn     = _updateBulkBtn;
window.kirimWaSatu        = kirimWaSatu;
window.bulkKirimWa        = bulkKirimWa;
window.saveTemplateWa     = saveTemplateWa;
window._getWaSentAt       = _getWaSentAt;
window._setWaSent         = _setWaSent;