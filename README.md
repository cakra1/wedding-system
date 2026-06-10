# Wedding System — Normandia & Sella
> Sistem undangan pernikahan digital

---

## Struktur Project

```
wedding-system/
│
├── invitation/                      # Halaman undangan (untuk tamu)
│   ├── index.html                   # Kerangka — cuma manggil komponen
│   ├── css/
│   │   └── style.css                # Semua styling undangan
│   ├── js/
│   │   ├── loader.js                # Load komponen HTML ke slot
│   │   └── app.js                   # Logic: countdown, RSVP, wishes, lightbox
│   └── components/                  # Potongan HTML per section
│       ├── cover.html               # Halaman cover + nama tamu
│       ├── hero.html                # Nama mempelai & tanggal
│       ├── countdown.html           # Hitung mundur
│       ├── couple.html              # Profil mempelai
│       ├── quran.html               # Ayat Al-Quran
│       ├── events.html              # Jadwal akad & resepsi
│       ├── rsvp.html                # Form konfirmasi hadir
│       ├── wishes.html              # Form ucapan
│       ├── egift.html               # Info rekening & alamat
│       ├── gallery.html             # Galeri foto pre-wed
│       ├── lightbox.html            # Overlay foto fullscreen
│       └── closing.html             # Penutup
│
└── dashboard/                       # Panel admin (untuk pengantin)
    ├── index.html                   # Kerangka — cuma manggil komponen
    ├── css/
    │   └── style.css                # Semua styling dashboard
    ├── js/
    │   ├── loader.js                # Load komponen HTML ke slot
    │   └── app.js                   # Logic: navigasi, modal, link, filter
    └── components/                  # Potongan HTML per bagian
        ├── sidebar.html             # Navigasi sidebar kiri
        ├── pages/
        │   ├── overview.html        # Halaman ringkasan
        │   ├── tamu.html            # Daftar & kelola tamu
        │   ├── rsvp.html            # Rekap RSVP
        │   ├── wishes.html          # Semua ucapan tamu
        │   ├── foto.html            # Upload & kelola foto pre-wed
        │   └── undangan.html        # Generate & kirim link undangan
        └── modals/
            └── tambah-tamu.html     # Popup form tambah tamu
```

---

## Cara Kerja

index.html hanya berisi slot kosong seperti:
```html
<div id="slot-hero"></div>
```

loader.js membaca daftar komponen, lalu fetch() masing-masing file HTML
dan memasukkan isinya ke slot yang sesuai. Setelah semua selesai,
loader memanggil appInit() di app.js untuk menjalankan semua logic.

---

## Cara Kirim Undangan

Tambahkan nama tamu di URL:
```
https://domain.com/invitation/?name=Keluarga+Budiman
```
Nama otomatis muncul di cover undangan.

---

## Checklist Sebelum Deploy

- [ ] Ganti data rekening dummy di components/egift.html
- [ ] Upload foto pre-wed & update URL di components/gallery.html
- [ ] Sesuaikan jam resepsi di components/events.html
- [ ] Sambungkan database (Supabase) untuk RSVP & wishes permanen
- [ ] Tambah proteksi password untuk folder dashboard/
- [ ] Deploy ke Netlify / Vercel / hosting pilihan

---

## Catatan Penting

File komponen harus di-serve via web server (tidak bisa dibuka
langsung sebagai file:// karena fetch() butuh HTTP).

Cara paling gampang untuk development lokal:
- VS Code: install ekstensi "Live Server", klik kanan index.html > Open with Live Server
- Terminal: python3 -m http.server 8000
