/* ============================================================
   DASHBOARD — loader.js
   Memuat semua komponen HTML ke slot masing-masing.
   Setelah selesai, memanggil appInit() di app.js.
   ============================================================ */
import { appInit } from './app.js';

const COMPONENTS = [
  { slot: 'slot-sidebar',   file: 'components/sidebar.html'            },
  { slot: 'page-overview',  file: 'components/pages/overview.html'     },
  { slot: 'page-tamu',      file: 'components/pages/tamu.html'         },
  { slot: 'page-rsvp',      file: 'components/pages/rsvp.html'         },
  { slot: 'page-wishes',    file: 'components/pages/wishes.html'       },
  { slot: 'page-foto',      file: 'components/pages/foto.html'         },
  { slot: 'page-undangan',  file: 'components/pages/undangan.html'     },
  { slot: 'page-settings',  file: 'components/pages/settings.html'     },
  { slot: 'page-akun',       file: 'components/pages/akun.html'        },
  { slot: 'slot-modal-tamu',     file: 'components/modals/tambah-tamu.html' },
  { slot: 'slot-modal-edit-tamu',file: 'components/modals/edit-tamu.html'   },
];

async function loadComponent(slotId, filePath) {
  const slot = document.getElementById(slotId);
  if (!slot) { console.warn(`[loader] slot tidak ditemukan: #${slotId}`); return; }
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    slot.innerHTML = await res.text();
  } catch (err) {
    console.error(`[loader] Gagal load ${filePath}:`, err.message);
    slot.innerHTML = `<p style="color:red;padding:20px">Gagal memuat: ${filePath}</p>`;
  }
}

async function init() {
  await Promise.all(COMPONENTS.map(c => loadComponent(c.slot, c.file)));
  appInit();
}

document.addEventListener('DOMContentLoaded', init);
