/* ============================================================
   INVITATION — loader.js
   ============================================================ */
import { appInit } from './app.js';

const COMPONENTS = [
  { slot: 'slot-cover',     file: 'components/cover.html'     },
  { slot: 'slot-hero',      file: 'components/hero.html'      },
  { slot: 'slot-countdown', file: 'components/countdown.html' },
  { slot: 'slot-couple',    file: 'components/couple.html'    },
  { slot: 'slot-quran',     file: 'components/quran.html'     },
  { slot: 'slot-events',    file: 'components/events.html'    },
  { slot: 'slot-rsvp',      file: 'components/rsvp.html'      },
  { slot: 'slot-wishes',    file: 'components/wishes.html'    },
  { slot: 'slot-egift',     file: 'components/egift.html'     },
  { slot: 'slot-gallery',   file: 'components/gallery.html'   },
  { slot: 'slot-lightbox',  file: 'components/lightbox.html'  },
  { slot: 'slot-closing',   file: 'components/closing.html'   },
];

async function loadComponent(slotId, filePath) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    slot.innerHTML = await res.text();
  } catch (err) {
    console.error(`[loader] Gagal load ${filePath}:`, err.message);
    slot.innerHTML = `<div style="color:red;padding:20px">Gagal memuat: ${filePath}</div>`;
  }
}

async function init() {
  await Promise.all(COMPONENTS.map(c => loadComponent(c.slot, c.file)));
  appInit();
}

document.addEventListener('DOMContentLoaded', init);
