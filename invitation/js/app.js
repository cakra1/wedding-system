/* ============================================================
   INVITATION — app.js
   Sections:
     1. appInit()        - Entry point
     2. openInvitation() - Buka undangan dari cover
     3. startCountdown() - Hitung mundur ke hari H
     4. initReveal()     - Scroll reveal animation
     5. submitRsvp()     - Kirim RSVP → simpan ke Supabase
     6. loadWishes()     - Ambil wishes dari Supabase
     7. submitWish()     - Kirim wishes → simpan ke Supabase
     8. copyText()       - Salin nomor rekening
     9. Lightbox         - Galeri foto
    10. setGuestName()   - Set nama tamu dari URL ?name=
   ============================================================ */

import { supabase } from './supabase.js';

// Nama tamu yang sudah submit RSVP (digunakan untuk Wishes)
let rsvpSubmittedName = null;

/* ----- 1. ENTRY POINT ----- */
export function appInit() {
  setGuestName();
  trackBuka();

  // Load settings SEKARANG juga — supaya cover sudah terisi sebelum diklik
  loadSettings();

  // Auto-skip cover kalau tamu sudah pernah buka undangan ini
  const params = new URLSearchParams(window.location.search);
  const name   = params.get('name');
  if (name && localStorage.getItem('inv_opened_' + name)) {
    openInvitation();
  }
}

/* ----- 2. BUKA UNDANGAN ----- */
function openInvitation() {
  document.getElementById('cover').style.display = 'none';
  document.getElementById('main').classList.add('visible');
  // loadSettings sudah jalan di appInit, panggil lagi untuk pastikan countdown update
  loadSettings().then(() => { startCountdown(); });
  initReveal();
  loadWishes();
  loadFoto();

  // Simpan ke localStorage agar next visit auto-skip cover
  const params = new URLSearchParams(window.location.search);
  const name   = params.get('name');
  if (name) localStorage.setItem('inv_opened_' + name, '1');

  // Pre-fill RSVP form dari URL + data tamu
  setTimeout(prefillRsvpForm, 600);

  // Setup video player setelah komponen di-load
  setTimeout(initVideo, 300);

  // Nyalakan musik latar belakang
  setTimeout(initMusic, 500);

  // Jika sudah pernah RSVP di sesi ini, langsung unlock wishes
  const savedName = sessionStorage.getItem('rsvpName');
  const savedHp   = sessionStorage.getItem('rsvpHp');
  if (savedName) {
    rsvpSubmittedName = savedName;
    unlockWishes(savedName, savedHp);
  }
}

/* ----- 3. COUNTDOWN ----- */
// tanggalAkad & jamAkad bisa diisi dari loadSettings sebelum fungsi ini dipanggil
let _countdownAkad    = new Date(Date.now() + 90*24*3600*1000); // fallback: 90 hari ke depan
let _countdownResepsi = null;

function startCountdown() {
  // Countdown Akad
  runCountdown(_countdownAkad, 'cDays', 'cHours', 'cMinutes', 'cSeconds');

  // Countdown Resepsi — hanya kalau tanggalnya beda
  const resepsiWrap = document.getElementById('countdown-resepsi-wrap');
  const akadWrap    = document.getElementById('countdown-akad-wrap');

  if (_countdownResepsi && _countdownResepsi.getTime() !== _countdownAkad.getTime()) {
    if (resepsiWrap) resepsiWrap.style.display = 'block';
    // Label
    const akadLabel    = document.getElementById('countdown-akad-label');
    const resepsiLabel = document.getElementById('countdown-resepsi-label');
    if (akadLabel)    akadLabel.textContent    = 'Akad Nikah';
    if (resepsiLabel) resepsiLabel.textContent = 'Resepsi';
    runCountdown(_countdownResepsi, 'cDays2', 'cHours2', 'cMinutes2', 'cSeconds2');
  } else {
    if (resepsiWrap) resepsiWrap.style.display = 'none';
    const akadLabel = document.getElementById('countdown-akad-label');
    if (akadLabel) akadLabel.textContent = '';
  }
}

function runCountdown(target, idD, idH, idM, idS) {
  function update() {
    const diff = target - new Date();
    if (diff <= 0) return;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const set = (id, val, pad = true) => {
      const el = document.getElementById(id);
      if (el) el.textContent = pad ? String(val).padStart(2, '0') : val;
    };
    set(idD, d, false);
    set(idH, h);
    set(idM, m);
    set(idS, s);
  }
  update();
  setInterval(update, 1000);
}

/* ----- 4. SCROLL REVEAL ----- */
function initReveal() {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ----- 5. RSVP → SUPABASE ----- */
async function submitRsvp(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Mengirim...';
  btn.disabled = true;

  const data = {
    nama:        document.getElementById('rsvpName')?.value.trim(),
    nomor_hp:    document.getElementById('rsvpPhone')?.value.trim(),
    jumlah_tamu: parseInt(document.getElementById('rsvpGuests')?.value) || 1,
    kehadiran:   document.querySelector('input[name="attendance"]:checked')?.value,
  };

  // Validasi nomor HP tidak kosong
  if (!data.nomor_hp) {
    btn.textContent = 'Kirim Konfirmasi';
    btn.disabled = false;
    alert('Nomor HP wajib diisi untuk konfirmasi kehadiran.');
    return;
  }

  // Cek apakah nomor HP sudah pernah submit RSVP (primary key dedup)
  const { data: existing } = await supabase
    .from('rsvp').select('id, nama').eq('nomor_hp', data.nomor_hp).maybeSingle();

  let error;
  let isUpdate = false;

  if (existing) {
    // Update data lama berdasarkan nomor HP
    const { error: updateErr } = await supabase
      .from('rsvp').update(data).eq('id', existing.id);
    error = updateErr;
    isUpdate = true;
  } else {
    // Insert baru
    const { error: insertErr } = await supabase.from('rsvp').insert([data]);
    error = insertErr;
  }

  if (error) {
    // Tangani juga kalau unique constraint di DB menolak
    if (error.code === '23505') {
      btn.textContent = 'Kirim Konfirmasi';
      btn.disabled = false;
      alert('Nomor HP ini sudah terdaftar. Refresh halaman untuk memperbarui konfirmasi.');
      return;
    }
    console.error('RSVP error:', error.message);
    btn.textContent = 'Gagal, coba lagi';
    btn.disabled = false;
    return;
  }

  // Tampilkan pesan sukses (beda teks kalau update)
  const successEl = document.getElementById('rsvpSuccess');
  if (isUpdate && successEl) {
    const msg = successEl.querySelector('p');
    if (msg) msg.textContent = 'Konfirmasi kehadiran Anda berhasil diperbarui. Sampai jumpa! 💛';
  }

  document.getElementById('rsvpForm').style.display = 'none';
  document.getElementById('rsvpSuccess').classList.add('show');

  // Simpan nama + nomor HP ke session storage & unlock Wishes section
  const submittedName = data.nama;
  const submittedHp   = data.nomor_hp;
  rsvpSubmittedName = submittedName;
  sessionStorage.setItem('rsvpName', submittedName);
  sessionStorage.setItem('rsvpHp',   submittedHp);
  unlockWishes(submittedName, submittedHp);
}

/* ----- UNLOCK WISHES SECTION ----- */
function unlockWishes(nama, hp) {
  const locked      = document.getElementById('wishLocked');
  const wishForm    = document.getElementById('wishForm');
  const nameInput   = document.getElementById('wishName');
  const hpInput     = document.getElementById('wishHp');
  const nameDisplay = document.getElementById('wishNameDisplay');

  if (!wishForm) return;

  if (locked) locked.style.display = 'none';
  wishForm.style.display = 'block';

  if (nameInput)   nameInput.value         = nama || '';
  if (hpInput)     hpInput.value           = hp   || '';
  if (nameDisplay) nameDisplay.textContent  = nama || '';

  // Set avatar initials
  const avatarEl = document.getElementById('wishSenderAvatar');
  if (avatarEl && nama) {
    avatarEl.textContent = nama.trim().split(' ')
      .slice(0,2).map(n => n[0]).join('').toUpperCase();
  }
}

/* ----- 6. LOAD WISHES DARI SUPABASE ----- */
async function loadWishes() {
  const list = document.getElementById('wishesList');
  if (!list) return;

  const { data, error } = await supabase
    .from('wishes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error('Load wishes error:', error.message); return; }

  list.innerHTML = '';
  if (!data.length) {
    list.innerHTML = '<div class="wish-card"><div class="wish-msg">Belum ada ucapan. Jadilah yang pertama! 🌿</div></div>';
    return;
  }

  data.forEach(w => {
    const initials = (w.nama || '?').trim().split(' ')
      .slice(0, 2).map(n => n[0]).join('').toUpperCase();

    const timeStr = (() => {
      const d = new Date(w.created_at.endsWith('Z') || w.created_at.includes('+') ? w.created_at : w.created_at + 'Z');
      const diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 60)        return 'Baru saja';
      if (diff < 3600)      return Math.floor(diff/60) + ' menit lalu';
      if (diff < 86400)     return Math.floor(diff/3600) + ' jam lalu at ' + d.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
      return d.toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'}) + ' at ' + d.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
    })();

    const card = document.createElement('div');
    card.className = 'wish-card';
    card.innerHTML = `
      <div class="wish-avatar">${initials}</div>
      <div class="wish-body">
        <div class="wish-name">${escHtml(w.nama)}</div>
        <div class="wish-msg">${escHtml(w.pesan)}</div>
        <div class="wish-time">${timeStr}</div>
      </div>
    `;
    list.appendChild(card);
  });
}

/* ----- 7. SUBMIT WISH → SUPABASE ----- */
async function submitWish(e) {
  e.preventDefault();
  const btn   = e.target.querySelector('button[type="submit"]');
  const nama  = document.getElementById('wishName')?.value.trim() || rsvpSubmittedName || sessionStorage.getItem('rsvpName') || '';
  const hp    = document.getElementById('wishHp')?.value.trim()   || sessionStorage.getItem('rsvpHp') || '';
  const pesan = document.getElementById('wishMsg')?.value.trim();
  if (!nama || !pesan) return;

  btn.textContent = 'Mengirim...';
  btn.disabled = true;

  // Cek apakah nomor HP sudah pernah kirim wishes
  let error;
  if (hp) {
    const { data: existing } = await supabase
      .from('wishes').select('id').eq('nomor_hp', hp).maybeSingle();

    if (existing) {
      // Update ucapan lama
      const { error: updateErr } = await supabase
        .from('wishes').update({ nama, pesan }).eq('id', existing.id);
      error = updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('wishes').insert([{ nama, pesan, nomor_hp: hp }]);
      error = insertErr;
    }
  } else {
    // Fallback kalau tidak ada HP (tidak seharusnya terjadi)
    const { error: insertErr } = await supabase
      .from('wishes').insert([{ nama, pesan }]);
    error = insertErr;
  }

  if (error) {
    console.error('Wish error:', error.message);
    btn.textContent = 'Gagal, coba lagi';
    btn.disabled = false;
    return;
  }

  // Reset textarea saja (nama & HP tetap)
  document.getElementById('wishMsg').value = '';
  btn.textContent = 'Kirim Ucapan';
  btn.disabled = false;
  loadWishes();
}

/* ----- 8. LOAD FOTO DARI SUPABASE ----- */
async function loadFoto() {
  const { data, error } = await supabase
    .from('foto')
    .select('*')
    .order('urutan', { ascending: true });

  if (error || !data.length) return;

  data.forEach((foto, i) => {
    const el = document.getElementById('gImg' + i);
    if (el) el.src = foto.url;
  });
}

/* ----- 9. COPY TEXT ----- */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Tersalin!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  });
}

/* ----- 10. LIGHTBOX ----- */
let lbIndex = 0;

function openLightbox(i) {
  lbIndex = i;
  const img = document.getElementById('gImg' + i);
  const lb  = document.getElementById('lightbox');
  const lbi = document.getElementById('lightboxImg');
  if (!img || !lb || !lbi) return;
  lbi.src = img.src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('open');
  document.body.style.overflow = '';
}

function closeLightboxOutside(e) {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}

function navLightbox(dir) {
  const imgs = Array.from({ length: 7 }, (_, i) => document.getElementById('gImg' + i)).filter(Boolean);
  lbIndex = (lbIndex + dir + imgs.length) % imgs.length;
  const lbi = document.getElementById('lightboxImg');
  if (lbi) lbi.src = imgs[lbIndex].src;
}

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb?.classList.contains('open')) return;
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowLeft')  navLightbox(-1);
  if (e.key === 'ArrowRight') navLightbox(1);
});

/* ----- 11. GUEST NAME ----- */
function setGuestName() {
  const params = new URLSearchParams(window.location.search);
  const name   = params.get('name');
  const el     = document.getElementById('coverGuest');
  if (name && el) el.textContent = decodeURIComponent(name);
}

/* ----- PRE-FILL RSVP FORM dari URL + data tamu ----- */
async function prefillRsvpForm() {
  const params = new URLSearchParams(window.location.search);
  const nama   = params.get('name');
  if (!nama) return;

  const namaDecoded = decodeURIComponent(nama);

  const autoStyle = (el) => {
    el.style.background = 'rgba(90,115,80,0.08)';
    el.style.color      = 'var(--dark)';
    el.readOnly         = true;
    // Tambah badge AUTO hanya sekali
    const label = el.previousElementSibling;
    if (label && !label.querySelector('.badge-auto')) {
      const badge = document.createElement('span');
      badge.className = 'badge-auto';
      badge.style.cssText = 'font-size:9px;background:var(--sage);color:#fff;padding:1px 6px;border-radius:99px;letter-spacing:0.05em;vertical-align:middle;margin-left:4px';
      badge.textContent = 'AUTO';
      label.appendChild(badge);
    }
  };

  // Isi nama
  const nameInput = document.getElementById('rsvpName');
  if (nameInput && !nameInput.readOnly) {
    nameInput.value = namaDecoded;
    autoStyle(nameInput);
  }

  // Cari nomor HP dari tabel tamu
  try {
    const { data: tamuRows } = await supabase
      .from('tamu')
      .select('nomor_wa')
      .eq('nama', namaDecoded);

    const phoneInput = document.getElementById('rsvpPhone');
    if (phoneInput && !phoneInput.readOnly) {
      if (tamuRows && tamuRows.length === 1 && tamuRows[0].nomor_wa) {
        // Hanya 1 orang dengan nama ini → auto-fill
        phoneInput.value = tamuRows[0].nomor_wa;
        autoStyle(phoneInput);
      } else if (tamuRows && tamuRows.length > 1) {
        // Ada lebih dari 1 orang dengan nama sama → beri hint
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:#c0a060;margin-top:6px;padding:6px 10px;background:rgba(180,150,60,0.1);border-radius:6px;border:1px solid rgba(180,150,60,0.2)';
        hint.textContent = '⚠️ Ada beberapa tamu dengan nama ini — mohon isi nomor HP Anda';
        phoneInput.parentElement?.appendChild(hint);
      }
    }
  } catch(e) {}
}

/* ----- TRACKING — catat undangan dibuka ----- */
async function trackBuka() {
  try {
    const params = new URLSearchParams(window.location.search);
    const nama   = params.get('name');
    if (!nama) return;
    const namaDecoded = decodeURIComponent(nama);

    // Pakai maybeSingle() agar tidak throw 406 kalau tidak ketemu
    const { data, error } = await supabase
      .from('tamu')
      .select('id, link_dibuka')
      .eq('nama', namaDecoded)
      .maybeSingle();

    if (error || !data) return;

    await supabase
      .from('tamu')
      .update({ link_dibuka: (data.link_dibuka || 0) + 1 })
      .eq('id', data.id);
  } catch(e) {
    // Silent fail — tracking tidak penting untuk pengalaman tamu
  }
}

/* ----- UTILS ----- */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ----- EXPOSE ke HTML (onclick) ----- */
/* ----- VIDEO PLAYER ----- */
function initVideo() {
  const video = document.getElementById('weddingVideo');
  if (!video) return;

  // Saat video selesai → tampilkan tombol replay
  video.addEventListener('ended', () => {
    const overlay = document.getElementById('videoOverlay');
    const label   = document.getElementById('videoLabel');
    const icon    = document.getElementById('videoIcon');
    if (overlay) { overlay.style.opacity = '1'; overlay.style.pointerEvents = 'auto'; overlay.style.display = 'flex'; }
    if (label)   label.textContent = '↺ Putar Ulang';
    if (icon)    icon.innerHTML = '<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="#3a5a40"/>';
  });

  // Klik langsung pada video juga toggle
  video.addEventListener('click', toggleVideo);
}

function toggleVideo() {
  const video   = document.getElementById('weddingVideo');
  const overlay = document.getElementById('videoOverlay');
  const label   = document.getElementById('videoLabel');
  const icon    = document.getElementById('videoIcon');
  if (!video) return;

  if (video.ended || (video.paused && video.currentTime === 0)) {
    // Play dari awal (fresh start atau replay)
    video.currentTime = 0;
    video.play();
    if (overlay) overlay.style.display = 'none';
    return;
  }

  if (video.paused) {
    video.play();
    if (overlay) overlay.style.display = 'none';
  } else {
    video.pause();
    if (overlay) overlay.style.display = 'flex';
    if (label)   label.textContent = 'Lanjutkan';
  }
}

function updateWishCounter(el) {
  const remaining = (el.maxLength || 300) - el.value.length;
  const counter = document.getElementById('wishCounter');
  if (counter) {
    counter.textContent = remaining;
    counter.style.color = remaining < 50 ? '#e07a5f' : '#bbb';
  }
}

window.openInvitation   = openInvitation;
window.submitRsvp       = submitRsvp;
window.submitWish       = submitWish;
window.copyText         = copyText;
window.openLightbox     = openLightbox;
window.closeLightbox    = closeLightbox;
window.closeLightboxOutside = closeLightboxOutside;
window.navLightbox      = navLightbox;
window.appInit          = appInit;
window.unlockWishes     = unlockWishes;
window.toggleMusic      = toggleMusic;

/* ============================================================
   MUSIK LATAR BELAKANG
   - initMusic()   : panggil setelah user klik "Buka Undangan"
   - toggleMusic() : toggle play / pause dari floating button
   ============================================================ */

let _musicReady = false;

function initMusic() {
  const audio = document.getElementById('bgMusic');
  const btn   = document.getElementById('musicBtn');
  if (!audio || !btn) return;

  // Tampilkan tombol musik dengan animasi
  btn.style.display = 'flex';
  btn.classList.add('show');

  // Kalau URL belum tersedia, tunggu sampai loadSettings selesai mengisinya
  if (!audio.src || audio.src === window.location.href) return;

  _startPlay(audio, btn);
}

function _startPlay(audio, btn) {
  audio.volume = 0.55;
  const promise = audio.play();
  if (promise !== undefined) {
    promise
      .then(() => {
        btn.classList.add('playing');
        btn.classList.remove('paused');
      })
      .catch(() => {
        // Browser blokir autoplay — tampilkan tombol saja, user bisa klik manual
        btn.classList.add('paused');
      });
  }
}

function toggleMusic() {
  const audio = document.getElementById('bgMusic');
  const btn   = document.getElementById('musicBtn');
  if (!audio || !btn) return;

  if (audio.paused) {
    audio.play().then(() => {
      btn.classList.add('playing');
      btn.classList.remove('paused');
    }).catch(() => {});
  } else {
    audio.pause();
    btn.classList.remove('playing');
    btn.classList.add('paused');
  }
}

/* ============================================================
   LOAD SETTINGS — baca dari tabel `settings` Supabase
   dan terapkan ke semua elemen di undangan
   ============================================================ */
async function loadSettings() {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) { console.error('Load settings error:', error.message); return; }

  // Ubah array rows jadi object { key: value } agar gampang diakses
  const s = {};
  data.forEach(row => s[row.key] = row.value);

  // Helper: set textContent elemen berdasarkan ID
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  };
  // Helper: set href link
  const setHref = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.href = val;
  };

  // ── COVER PAGE ──
  // Nama panggilan (kata pertama dari nama lengkap)
  set('coverNamaPria',   s.nama_pria?.split(' ')[0]);
  set('coverNamaWanita', s.nama_wanita?.split(' ')[0]);

  // ── HERO SECTION ──
  set('heroNamaPriaHero',   s.nama_pria?.split(' ')[0]);
  set('heroNamaWanitaHero', s.nama_wanita?.split(' ')[0]);

  // ── COUPLE SECTION ──
  set('heroNamaPria',   s.nama_pria?.split(' ')[0]);
  set('heroNamaWanita', s.nama_wanita?.split(' ')[0]);
  set('fullNamaPria',   s.nama_pria);
  set('fullNamaWanita', s.nama_wanita);
  set('ortuPria',       s.ortu_pria);
  set('ortuWanita',     s.ortu_wanita);

  // ── TANGGAL AKAD ──
  if (s.tanggal_akad) {
    const d = new Date(s.tanggal_akad);
    // Format tanggal untuk berbagai tempat
    set('tanggalAkad', d.getDate());
    set('bulanAkad',   d.toLocaleDateString('id-ID', { month:'long', year:'numeric' }));
    set('jamAkad',     (s.jam_akad || '08.00') + ' WIB – ' + (s.selesai_akad || 'Selesai'));
    const heroTglStr = d.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    set('heroTanggal',     heroTglStr);
    set('heroTanggalAkad', heroTglStr);
    // Format cover: 09 · 08 · 2026
    const coverTglStr = [
      String(d.getDate()).padStart(2,'0'),
      String(d.getMonth()+1).padStart(2,'0'),
      d.getFullYear()
    ].join(' · ');
    set('coverTanggal',     coverTglStr);
    set('coverTanggalAkad', coverTglStr);
    // Simpan ke variabel global agar startCountdown bisa pakai
    _countdownAkad = new Date(`${s.tanggal_akad}T${(s.jam_akad||'08.00').replace('.', ':')}:00`);
  }

  // ── TANGGAL RESEPSI ──
  if (s.tanggal_resepsi) {
    const d = new Date(s.tanggal_resepsi);
    set('tanggalResepsi', d.getDate());
    set('bulanResepsi',   d.toLocaleDateString('id-ID', { month:'long', year:'numeric' }));
    set('jamResepsi',     (s.jam_resepsi || '11.00') + ' WIB – ' + (s.selesai_resepsi || '14.00'));
    _countdownResepsi = new Date(`${s.tanggal_resepsi}T${(s.jam_resepsi||'11.00').replace('.', ':')}:00`);

    // Hero & Cover: tampilkan 2 tanggal kalau beda
    const resepsiStr = new Date(s.tanggal_resepsi).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    set('heroTanggalResepsi2', resepsiStr);

    const coverResepsiStr = [
      String(new Date(s.tanggal_resepsi).getDate()).padStart(2,'0'),
      String(new Date(s.tanggal_resepsi).getMonth()+1).padStart(2,'0'),
      new Date(s.tanggal_resepsi).getFullYear()
    ].join(' · ');
    set('coverTanggalResepsi', coverResepsiStr);

    if (s.tanggal_akad !== s.tanggal_resepsi) {
      // Hero
      const heroSingle = document.getElementById('heroTanggal');
      const heroGanda  = document.getElementById('heroTanggalGanda');
      if (heroSingle) heroSingle.style.display = 'none';
      if (heroGanda)  heroGanda.style.display  = 'flex';

      // Cover
      const coverSingle = document.getElementById('coverTanggal');
      const coverGanda  = document.getElementById('coverTanggalGanda');
      if (coverSingle) coverSingle.style.display = 'none';
      if (coverGanda)  coverGanda.style.display  = 'block';
    }
  }

  // ── LOKASI AKAD ──
  set('lokasiNama',   s.lokasi_nama);
  set('lokasiAlamat', s.lokasi_alamat);
  setHref('lokasiMapsAkad', s.lokasi_maps);

  // ── LOKASI RESEPSI ──
  set('lokasiResepsiNama',   s.lokasi_resepsi_nama);
  set('lokasiResepsiAlamat', s.lokasi_resepsi_alamat);
  setHref('lokasiMapsResepsi', s.lokasi_resepsi_maps);

  // ── SINGLE vs DUAL EVENT CARD ──
  {
    const sameTanggal = s.tanggal_akad && s.tanggal_resepsi && s.tanggal_akad === s.tanggal_resepsi;
    const sameJam     = (s.jam_akad || '') === (s.jam_resepsi || '') &&
                        (s.selesai_akad || '') === (s.selesai_resepsi || '');
    const sameMaps    = (s.lokasi_maps || '') !== '' &&
                        (s.lokasi_maps || '') === (s.lokasi_resepsi_maps || '');
    const single = document.getElementById('eventsSingle');
    const dual   = document.getElementById('eventsDual');
    if (sameTanggal && sameJam && sameMaps) {
      const d = new Date(s.tanggal_akad);
      set('tanggalSingle', d.getDate());
      set('bulanSingle',   d.toLocaleDateString('id-ID', { month:'long', year:'numeric' }));
      set('jamSingle',     (s.jam_akad || '08.00') + ' WIB \u2013 ' + (s.selesai_akad || 'Selesai'));
      set('lokasiNamaSingle',   s.lokasi_nama);
      set('lokasiAlamatSingle', s.lokasi_alamat);
      setHref('lokasiMapsSingle', s.lokasi_maps);
      if (single) single.style.display = 'flex';
      if (dual)   dual.style.display   = 'none';
    } else {
      if (single) single.style.display = 'none';
      if (dual)   dual.style.display   = 'flex';
    }
  }

  // ── E-GIFT ──
  set('rek1Bank',     s.rekening_1_bank);
  set('rek1Nama',     s.rekening_1_nama);
  set('rek1Nomor',    s.rekening_1_nomor);
  set('rek2Bank',     s.rekening_2_bank);
  set('rek2Nama',     s.rekening_2_nama);
  set('rek2Nomor',    s.rekening_2_nomor);
  set('alamatHadiah', s.alamat_hadiah);

  // ── VIDEO UNDANGAN ──
  const videoWrap = document.getElementById('videoWrap');
  if (s.video_url) {
    const src = document.getElementById('videoUndanganSource');
    const vid = document.getElementById('weddingVideo');
    if (src) { src.src = s.video_url; if (vid) vid.load(); }
    if (videoWrap) videoWrap.style.display = 'block';
  } else {
    if (videoWrap) videoWrap.style.display = 'none';
  }

  // ── MUSIK LATAR ──
  if (s.music_url) {
    const audio = document.getElementById('bgMusic');
    const btn   = document.getElementById('musicBtn');
    if (audio && audio.src !== s.music_url) {
      audio.src = s.music_url;
      audio.load();
      // Kalau initMusic sudah berjalan (undangan sudah dibuka), langsung play
      if (btn && btn.style.display !== 'none') {
        _startPlay(audio, btn);
      }
    }
  }

  // ── FOTO MEMPELAI ──
  const setFoto = (imgId, emojiId, url) => {
    const img   = document.getElementById(imgId);
    const emoji = document.getElementById(emojiId);
    if (img && url) {
      img.src = url;
      img.style.display = 'block';
      img.onload = () => { if (emoji) emoji.style.display = 'none'; };
    }
  };
  setFoto('fotoMempelaiPria',   'fotoMempelaiPriaEmoji',   s.foto_pria);
  setFoto('fotoMempelaiWanita', 'fotoMempelaiWanitaEmoji', s.foto_wanita);

  // ── CLOSING ──
  set('closingNamaPria',   s.nama_pria?.split(' ')[0]);
  set('closingNamaWanita', s.nama_wanita?.split(' ')[0]);
  if (s.tanggal_akad && s.lokasi_nama) {
    const d = new Date(s.tanggal_akad);
    const tgl = [
      String(d.getDate()).padStart(2,'0'),
      String(d.getMonth()+1).padStart(2,'0'),
      d.getFullYear()
    ].join(' · ');
    set('closingFooter', `${tgl} · ${s.lokasi_nama}, ${s.lokasi_alamat || ''}`);
  }
}

// Helper copy rekening dari element ID
function copyRek(elId, btn) {
  const el = document.getElementById(elId);
  if (!el) return;
  copyText(el.textContent.trim(), btn);
}
window.copyRek = copyRek;
window.loadSettings = loadSettings;
window.toggleVideo = toggleVideo;
window.updateWishCounter = updateWishCounter;