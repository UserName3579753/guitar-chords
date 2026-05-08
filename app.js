import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBU2IUXo1n2wq-pAjvGJew-MA1FnrzuK6Y",
  authDomain: "guitar-chords-2f853.firebaseapp.com",
  projectId: "guitar-chords-2f853",
  storageBucket: "guitar-chords-2f853.firebasestorage.app",
  messagingSenderId: "10711028080",
  appId: "1:10711028080:web:d28e8483cf9919af8affb5"
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// =====================
// Constants
// =====================
const NOTE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const FINGER_COLORS = {
  '1': '#e53935', '2': '#43a047', '3': '#1e88e5', '4': '#f9a825', 'T': '#555555'
};

// View diagram — tall cells, no action buttons
const V = { STRINGS:6, FRETS:5, CW:44, CH:72, PL:28, PT:36, PR:14, PB:10 };
V.W = V.PL + V.CW*(V.STRINGS-1) + V.PR;
V.H = V.PT + V.CH*V.FRETS + V.PB;

// Edit diagram — slightly smaller to fit screen
const E = { STRINGS:6, FRETS:5, CW:44, CH:48, PL:28, PT:14, PR:14, PB:10 };
E.W = E.PL + E.CW*(E.STRINGS-1) + E.PR;
E.H = E.PT + E.CH*E.FRETS + E.PB;

// =====================
// State
// =====================
let currentUser   = null;
let currentNote   = null;
let allChords     = [];      // cached — only reloaded when needed
let chordsLoaded  = false;
let appMode       = 'view';  // 'view' or 'edit'
let editingChord  = null;

// Editor state
let editorStrings = ['x','o','o','o','o','o'];
let editorDots    = [];
let editorBarres  = [];
let selectedFinger = null;
let touchStartPos  = null;
let touchMoved     = false;

// =====================
// Screen navigation
// =====================
window.showScreen = function(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
};

// =====================
// Auth
// =====================
document.getElementById('btn-google-login').addEventListener('click', async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { alert('Login failed: ' + e.message); }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (confirm('Sign out?')) {
    chordsLoaded = false;
    allChords = [];
    await signOut(auth);
  }
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) showScreen('home');
  else showScreen('login');
});

// =====================
// Home: mode toggle
// =====================
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    appMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mode-hint').textContent =
      appMode === 'view' ? 'Select a note to view chords' : 'Select a note to manage chords';
  });
});

// =====================
// Home: note buttons
// =====================
document.querySelectorAll('.note-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    currentNote = btn.dataset.note;
    await ensureChordsLoaded();
    if (appMode === 'view') {
      showViewScreen(currentNote);
    } else {
      showManageScreen(currentNote);
    }
  });
});

// =====================
// Load chords (with cache)
// =====================
async function ensureChordsLoaded(forceReload = false) {
  if (chordsLoaded && !forceReload) return;
  const q = query(collection(db, 'chords'), where('uid', '==', currentUser.uid));
  const snap = await getDocs(q);
  allChords = [];
  snap.forEach(d => allChords.push({ id: d.id, ...d.data() }));
  allChords.sort((a, b) => {
    const ni = NOTE_ORDER.indexOf(a.note) - NOTE_ORDER.indexOf(b.note);
    if (ni !== 0) return ni;
    return a.name.localeCompare(b.name);
  });
  chordsLoaded = true;
}

// =====================
// View screen
// =====================
function showViewScreen(scrollToNote) {
  const noteChords = allChords.filter(c => c.note === scrollToNote);
  document.getElementById('chord-list-title').textContent = scrollToNote;

  const carousel = document.getElementById('chord-carousel');
  const dotsEl   = document.getElementById('scroll-dots');
  carousel.innerHTML = '';
  dotsEl.innerHTML   = '';

  if (allChords.length === 0) {
    carousel.innerHTML = `<div class="chord-card"><div class="empty-state">
      <p>No chords yet.<br/>Switch to Edit mode to add some!</p>
    </div></div>`;
    showScreen('chords');
    return;
  }

  // Show ALL chords sorted, but scroll to the first of the selected note
  allChords.forEach((chord, i) => {
    const card = document.createElement('div');
    card.className = 'chord-card';
    card.dataset.note = chord.note;
    card.innerHTML = `
      <div class="chord-card-name">${escapeHtml(chord.name)}</div>
      ${buildDiagramSVG(chord, V)}`;
    carousel.appendChild(card);
  });

  // Dots
  allChords.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'scroll-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(d);
  });

  // Update title on scroll
  carousel.addEventListener('scroll', () => {
    const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
    document.querySelectorAll('.scroll-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    if (allChords[idx]) {
      document.getElementById('chord-list-title').textContent = allChords[idx].note;
    }
  });

  showScreen('chords');

  // Scroll to first chord of selected note
  const targetIdx = allChords.findIndex(c => c.note === scrollToNote);
  if (targetIdx > 0) {
    requestAnimationFrame(() => {
      carousel.scrollLeft = targetIdx * carousel.clientWidth;
      document.querySelectorAll('.scroll-dot').forEach((d, i) => d.classList.toggle('active', i === targetIdx));
    });
  }
}

// =====================
// Manage screen
// =====================
function showManageScreen(note) {
  document.getElementById('manage-title').textContent = note;
  const list = document.getElementById('manage-list');
  list.innerHTML = '';

  const noteChords = allChords.filter(c => c.note === note);

  if (noteChords.length === 0) {
    list.innerHTML = `<div class="manage-empty">No chords for ${note} yet.<br/>Tap "+ New" to add one.</div>`;
  } else {
    noteChords.forEach(chord => {
      const item = document.createElement('div');
      item.className = 'manage-item';
      item.innerHTML = `
        <div>
          <div class="manage-item-name">${escapeHtml(chord.name)}</div>
          <div class="manage-item-note">${chord.note}</div>
        </div>
        <div class="manage-item-actions">
          <button class="btn-edit-chord">✏️ Edit</button>
          <button class="btn-delete-chord">🗑 Delete</button>
        </div>`;
      item.querySelector('.btn-edit-chord').addEventListener('click', () => openEditor(chord));
      item.querySelector('.btn-delete-chord').addEventListener('click', () => deleteChord(chord));
      list.appendChild(item);
    });
  }

  showScreen('manage');
}

// + New button on manage screen
document.getElementById('btn-add-new').addEventListener('click', () => openEditor(null));

// =====================
// Delete chord
// =====================
async function deleteChord(chord) {
  if (!confirm(`Delete "${chord.name}"?`)) return;
  await deleteDoc(doc(db, 'chords', chord.id));
  await ensureChordsLoaded(true); // force reload
  showManageScreen(currentNote);
}

// =====================
// Editor
// =====================
window.openEditor = function(chord) {
  editingChord   = chord;
  selectedFinger = null;

  if (chord) {
    document.getElementById('edit-title').textContent = 'Edit Chord';
    document.getElementById('edit-note').value = chord.note;
    document.getElementById('edit-name').value = chord.name;
    editorStrings = chord.strings ? [...chord.strings] : ['o','o','o','o','o','o'];
    editorDots    = chord.dots    ? chord.dots.map(d => ({...d}))   : [];
    editorBarres  = chord.barres  ? chord.barres.map(b => ({...b})) : [];
  } else {
    document.getElementById('edit-title').textContent = 'New Chord';
    document.getElementById('edit-note').value = currentNote || 'A';
    document.getElementById('edit-name').value = '';
    editorStrings = ['x','o','o','o','o','o'];
    editorDots    = [];
    editorBarres  = [];
  }

  document.getElementById('btn-edit-back').onclick = () => showManageScreen(currentNote);

  renderEditor();
  showScreen('edit');
};

function renderEditor() {
  renderStringLabels();
  renderEditorDiagram();
  renderPalette();
}

function renderPalette() {
  document.querySelectorAll('.palette-dot').forEach(d => {
    d.classList.toggle('selected', d.dataset.finger === selectedFinger);
    d.onclick = () => {
      selectedFinger = (selectedFinger === d.dataset.finger) ? null : d.dataset.finger;
      renderPalette();
    };
  });
}

function renderStringLabels() {
  const container = document.getElementById('editor-string-labels');
  container.innerHTML = '';
  const spacer = document.createElement('div');
  spacer.style.width = E.PL + 'px';
  container.appendChild(spacer);
  editorStrings.forEach((val, s) => {
    const btn = document.createElement('button');
    btn.className = 'string-label-btn ' + (val === 'o' ? 'open' : 'muted');
    btn.textContent = val.toUpperCase();
    btn.style.width  = E.CW + 'px';
    btn.style.height = '28px';
    btn.addEventListener('click', () => {
      editorStrings[s] = editorStrings[s] === 'o' ? 'x' : 'o';
      renderEditor();
    });
    container.appendChild(btn);
  });
}

// =====================
// Editor diagram
// =====================
function renderEditorDiagram() {
  const container = document.getElementById('editor-diagram');
  container.innerHTML = '';

  const { STRINGS, FRETS, CW, CH, PL, PT, W, H } = E;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" id="editor-svg" style="touch-action:none;">`;

  // Nut
  svg += `<rect x="${PL}" y="${PT}" width="${CW*(STRINGS-1)}" height="5" fill="#c8a96e" rx="2"/>`;
  svg += `<rect x="${PL}" y="${PT+7}" width="${CW*(STRINGS-1)}" height="2" fill="#c8a96e" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= FRETS; f++) {
    const y = PT + f * CH;
    svg += `<line x1="${PL}" y1="${y}" x2="${PL+CW*(STRINGS-1)}" y2="${y}" stroke="#3a4a6a" stroke-width="1.5"/>`;
  }

  // String lines
  for (let s = 0; s < STRINGS; s++) {
    const x = PL + s * CW;
    svg += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${PT+CH*FRETS}" stroke="#d4af6a" stroke-width="1.5"/>`;
  }

  // Invisible tap zones
  for (let s = 0; s < STRINGS; s++) {
    for (let f = 1; f <= FRETS; f++) {
      const cx = PL + s * CW;
      const cy = PT + (f-0.5) * CH;
      svg += `<rect x="${cx-CW/2}" y="${cy-CH/2}" width="${CW}" height="${CH}" fill="transparent" class="tap-cell" data-s="${s}" data-f="${f}"/>`;
    }
  }

  // Barres
  editorBarres.forEach((barre, idx) => {
    const r  = CH * 0.38;
    const x1 = PL + barre.fromString * CW;
    const x2 = PL + barre.toString   * CW;
    const cy = PT + (barre.fret-0.5) * CH;
    const color = FINGER_COLORS[barre.finger] || '#888';
    svg += `<rect x="${x1-r}" y="${cy-r}" width="${(x2-x1)+r*2}" height="${r*2}" rx="${r}" fill="${color}" class="placed-barre" data-idx="${idx}" style="cursor:pointer"/>`;
    svg += `<text x="${(x1+x2)/2}" y="${cy+5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald" pointer-events="none">${barre.finger}</text>`;
  });

  // Dots
  editorDots.forEach((dot, idx) => {
    const cx = PL + dot.string * CW;
    const cy = PT + (dot.fret-0.5) * CH;
    const r  = CH * 0.38;
    const color = FINGER_COLORS[dot.finger] || '#888';
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" class="placed-dot" data-idx="${idx}" style="cursor:pointer"/>`;
    svg += `<text x="${cx}" y="${cy+5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald" pointer-events="none">${dot.finger}</text>`;
  });

  svg += '</svg>';
  container.innerHTML = svg;

  const svgEl = container.querySelector('svg');

  // Remove placed dot
  container.querySelectorAll('.placed-dot').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      editorDots.splice(+el.dataset.idx, 1);
      renderEditor();
    });
  });

  // Remove placed barre
  container.querySelectorAll('.placed-barre').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      editorBarres.splice(+el.dataset.idx, 1);
      renderEditor();
    });
  });

  // ---- Touch ----
  svgEl.addEventListener('touchstart', e => {
    if (!selectedFinger) return;
    e.preventDefault();
    const t = e.touches[0];
    touchStartPos = svgPoint(svgEl, t.clientX, t.clientY);
    touchMoved = false;
  }, { passive: false });

  svgEl.addEventListener('touchmove', e => {
    e.preventDefault();
    touchMoved = true;
  }, { passive: false });

  svgEl.addEventListener('touchend', e => {
    if (!selectedFinger || !touchStartPos) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const endPos = svgPoint(svgEl, t.clientX, t.clientY);

    if (!touchMoved) {
      placeDot(touchStartPos.string, touchStartPos.fret, selectedFinger);
    } else if (touchStartPos.fret === endPos.fret && touchStartPos.string !== endPos.string) {
      placeBarre(touchStartPos.fret, touchStartPos.string, endPos.string, selectedFinger);
    } else {
      placeDot(endPos.string, endPos.fret, selectedFinger);
    }
    touchStartPos = null;
  }, { passive: false });

  // ---- Mouse (PC) ----
  let mouseStart = null;
  let mouseMoved = false;
  svgEl.addEventListener('mousedown', e => {
    if (!selectedFinger) return;
    mouseStart = svgPoint(svgEl, e.clientX, e.clientY);
    mouseMoved = false;
  });
  svgEl.addEventListener('mousemove', () => { mouseMoved = true; });
  svgEl.addEventListener('mouseup', e => {
    if (!selectedFinger || !mouseStart) return;
    const endPos = svgPoint(svgEl, e.clientX, e.clientY);
    if (!mouseMoved) {
      placeDot(mouseStart.string, mouseStart.fret, selectedFinger);
    } else if (mouseStart.fret === endPos.fret && mouseStart.string !== endPos.string) {
      placeBarre(mouseStart.fret, mouseStart.string, endPos.string, selectedFinger);
    } else {
      placeDot(endPos.string, endPos.fret, selectedFinger);
    }
    mouseStart = null;
  });
}

function svgPoint(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let bestS = 0, bestSD = Infinity;
  for (let s = 0; s < E.STRINGS; s++) {
    const d = Math.abs(x - (E.PL + s * E.CW));
    if (d < bestSD) { bestSD = d; bestS = s; }
  }
  let bestF = 1, bestFD = Infinity;
  for (let f = 1; f <= E.FRETS; f++) {
    const d = Math.abs(y - (E.PT + (f-0.5) * E.CH));
    if (d < bestFD) { bestFD = d; bestF = f; }
  }
  return { string: bestS, fret: bestF };
}

function placeDot(string, fret, finger) {
  // Toggle: if dot already exists at same position with same finger, remove it
  const existing = editorDots.findIndex(d => d.string === string && d.fret === fret && d.finger === finger);
  if (existing >= 0) {
    editorDots.splice(existing, 1);
  } else {
    // Remove any dot at same position (different finger)
    editorDots = editorDots.filter(d => !(d.string === string && d.fret === fret));
    editorDots.push({ string, fret, finger });
  }
  renderEditor();
}

function placeBarre(fret, s1, s2, finger) {
  const fromString = Math.min(s1, s2);
  const toString   = Math.max(s1, s2);
  // Toggle: if same barre exists, remove it
  const existing = editorBarres.findIndex(b => b.fret === fret && b.finger === finger && b.fromString === fromString && b.toString === toString);
  if (existing >= 0) {
    editorBarres.splice(existing, 1);
  } else {
    editorBarres = editorBarres.filter(b => !(b.fret === fret && b.finger === finger));
    editorBarres.push({ fret, fromString, toString, finger });
  }
  renderEditor();
}

// =====================
// Build diagram SVG
// =====================
function buildDiagramSVG(chord, dim) {
  const strings = chord.strings || ['o','o','o','o','o','o'];
  const dots    = chord.dots    || [];
  const barres  = chord.barres  || [];
  const { STRINGS, FRETS, CW, CH, PL, PT, W, H } = dim;

  let svg = `<svg class="diagram-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Nut
  svg += `<rect x="${PL}" y="${PT}" width="${CW*(STRINGS-1)}" height="5" fill="#c8a96e" rx="2"/>`;
  svg += `<rect x="${PL}" y="${PT+7}" width="${CW*(STRINGS-1)}" height="2" fill="#c8a96e" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= FRETS; f++) {
    const y = PT + f * CH;
    svg += `<line x1="${PL}" y1="${y}" x2="${PL+CW*(STRINGS-1)}" y2="${y}" stroke="#3a4a6a" stroke-width="1.5"/>`;
  }

  // String lines
  for (let s = 0; s < STRINGS; s++) {
    const x = PL + s * CW;
    svg += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${PT+CH*FRETS}" stroke="#d4af6a" stroke-width="1.5"/>`;
  }

  // String labels O/X
  strings.forEach((label, s) => {
    const x = PL + s * CW;
    const color = label === 'o' ? '#aed6f1' : '#e53935';
    svg += `<text x="${x}" y="${PT-10}" text-anchor="middle" fill="${color}" font-size="14" font-weight="700" font-family="Oswald">${label.toUpperCase()}</text>`;
  });

  // Barres
  barres.forEach(barre => {
    const r  = CH * 0.38;
    const x1 = PL + barre.fromString * CW;
    const x2 = PL + barre.toString   * CW;
    const cy = PT + (barre.fret-0.5) * CH;
    const color = FINGER_COLORS[barre.finger] || '#888';
    svg += `<rect x="${x1-r}" y="${cy-r}" width="${(x2-x1)+r*2}" height="${r*2}" rx="${r}" fill="${color}"/>`;
    svg += `<text x="${(x1+x2)/2}" y="${cy+5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald">${barre.finger}</text>`;
  });

  // Dots
  dots.forEach(dot => {
    const cx = PL + dot.string * CW;
    const cy = PT + (dot.fret-0.5) * CH;
    const r  = CH * 0.38;
    const color = FINGER_COLORS[dot.finger] || '#888';
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    svg += `<text x="${cx}" y="${cy+5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald">${dot.finger}</text>`;
  });

  svg += '</svg>';
  return svg;
}

// =====================
// Save chord
// =====================
document.getElementById('btn-save-chord').addEventListener('click', async () => {
  const note = document.getElementById('edit-note').value;
  const name = document.getElementById('edit-name').value.trim();
  if (!name) { alert('Please enter a chord name.'); return; }

  const data = {
    uid: currentUser.uid, note, name,
    strings: editorStrings,
    dots:    editorDots,
    barres:  editorBarres
  };

  if (editingChord) {
    await updateDoc(doc(db, 'chords', editingChord.id), data);
  } else {
    await addDoc(collection(db, 'chords'), data);
  }

  currentNote = note;
  await ensureChordsLoaded(true);
  showManageScreen(note);
});

// =====================
// Helpers
// =====================
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
