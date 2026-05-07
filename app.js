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
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// =====================
// Constants
// =====================
const NOTE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const FINGER_COLORS = {
  '1': '#e53935',
  '2': '#43a047',
  '3': '#1e88e5',
  '4': '#f9a825',
  'T': '#555555'
};

// Diagram dimensions (view mode — taller cells)
const V = {
  STRINGS: 6, FRETS: 5,
  CELL_W: 44, CELL_H: 56,
  PAD_L: 28, PAD_T: 36, PAD_R: 14, PAD_B: 14
};
V.W = V.PAD_L + V.CELL_W * (V.STRINGS - 1) + V.PAD_R;
V.H = V.PAD_T + V.CELL_H * V.FRETS + V.PAD_B;

// Diagram dimensions (edit mode — slightly smaller to fit screen)
const E = {
  STRINGS: 6, FRETS: 5,
  CELL_W: 44, CELL_H: 48,
  PAD_L: 28, PAD_T: 14, PAD_R: 14, PAD_B: 10
};
E.W = E.PAD_L + E.CELL_W * (E.STRINGS - 1) + E.PAD_R;
E.H = E.PAD_T + E.CELL_H * E.FRETS + E.PAD_B;

// =====================
// State
// =====================
let currentUser = null;
let currentNote = null;       // which note was tapped on home screen
let allChords = [];           // all chords for this user, sorted
let editingChord = null;

// Editor state
let editorStrings = ['x','o','o','o','o','o'];
let editorDots = [];    // {string, fret, finger}  — single dot
let editorBarres = [];  // {fret, fromString, toString, finger}
let selectedFinger = null;

// Barre drag tracking
let barreDragStart = null; // {string, fret} when touch/mousedown starts

// =====================
// Screen nav
// =====================
window.showScreen = function(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
};

// =====================
// Auth
// =====================
document.getElementById('btn-google-login').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) { alert('Login failed: ' + e.message); }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (confirm('Sign out?')) await signOut(auth);
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) showScreen('home');
  else showScreen('login');
});

// =====================
// Home: note buttons
// =====================
document.querySelectorAll('.note-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentNote = btn.dataset.note;
    loadAndShowChords(currentNote);
  });
});

document.getElementById('btn-add-chord').addEventListener('click', () => openEditor(null));
document.getElementById('btn-add-from-view').addEventListener('click', () => openEditor(null));

// =====================
// Load all chords & show carousel
// =====================
async function loadAndShowChords(scrollToNote) {
  const carousel = document.getElementById('chord-carousel');
  carousel.innerHTML = '<div class="chord-card"><div class="empty-state"><p>Loading…</p></div></div>';
  showScreen('chords');

  const q = query(collection(db, 'chords'), where('uid', '==', currentUser.uid));
  const snap = await getDocs(q);
  allChords = [];
  snap.forEach(d => allChords.push({ id: d.id, ...d.data() }));

  // Sort alphabetically by chord name, then by note order
  allChords.sort((a, b) => {
    const ni = NOTE_ORDER.indexOf(a.note) - NOTE_ORDER.indexOf(b.note);
    if (ni !== 0) return ni;
    return a.name.localeCompare(b.name);
  });

  renderCarousel(scrollToNote);
}

function renderCarousel(scrollToNote) {
  const carousel = document.getElementById('chord-carousel');
  const dotsEl = document.getElementById('scroll-dots');
  carousel.innerHTML = '';
  dotsEl.innerHTML = '';

  // Update title
  document.getElementById('chord-list-title').textContent = currentNote || 'All Chords';

  if (allChords.length === 0) {
    carousel.innerHTML = `<div class="chord-card"><div class="empty-state">
      <p>No chords yet.<br/>Add your first one!</p>
      <button class="btn-add-first" onclick="openEditor(null)">+ Add Chord</button>
    </div></div>`;
    return;
  }

  allChords.forEach((chord, i) => {
    const card = document.createElement('div');
    card.className = 'chord-card';
    card.innerHTML = `
      <div class="chord-card-name">${escapeHtml(chord.name)}</div>
      ${buildDiagramSVG(chord, V)}
      <div class="chord-card-actions">
        <button class="btn-edit-chord" data-i="${i}">✏️ Edit</button>
        <button class="btn-delete-chord" data-i="${i}">🗑 Delete</button>
      </div>`;
    carousel.appendChild(card);
  });

  // Scroll dots
  allChords.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'scroll-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(d);
  });

  carousel.addEventListener('scroll', () => {
    const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
    document.querySelectorAll('.scroll-dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  });

  carousel.querySelectorAll('.btn-edit-chord').forEach(btn => {
    btn.addEventListener('click', () => openEditor(allChords[+btn.dataset.i]));
  });
  carousel.querySelectorAll('.btn-delete-chord').forEach(btn => {
    btn.addEventListener('click', () => deleteChord(allChords[+btn.dataset.i]));
  });

  // Scroll to the first chord matching scrollToNote
  if (scrollToNote) {
    const idx = allChords.findIndex(c => c.note === scrollToNote);
    if (idx > 0) {
      requestAnimationFrame(() => {
        carousel.scrollLeft = idx * carousel.clientWidth;
        document.querySelectorAll('.scroll-dot').forEach((d, i) => {
          d.classList.toggle('active', i === idx);
        });
      });
    }
  }
}

// =====================
// Build diagram SVG (view & edit)
// =====================
function buildDiagramSVG(chord, dim) {
  const strings = chord.strings || ['o','o','o','o','o','o'];
  const dots    = chord.dots    || [];
  const barres  = chord.barres  || [];

  const { STRINGS, FRETS, CELL_W, CELL_H, PAD_L, PAD_T, W, H } = dim;

  let svg = `<svg class="diagram-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Nut (double line)
  svg += `<rect x="${PAD_L}" y="${PAD_T}" width="${CELL_W*(STRINGS-1)}" height="5" fill="#c8a96e" rx="2"/>`;
  svg += `<rect x="${PAD_L}" y="${PAD_T+7}" width="${CELL_W*(STRINGS-1)}" height="2" fill="#c8a96e" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= FRETS; f++) {
    const y = PAD_T + f * CELL_H;
    svg += `<line x1="${PAD_L}" y1="${y}" x2="${PAD_L+CELL_W*(STRINGS-1)}" y2="${y}" stroke="#3a4a6a" stroke-width="1.5"/>`;
  }

  // String lines
  for (let s = 0; s < STRINGS; s++) {
    const x = PAD_L + s * CELL_W;
    svg += `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${PAD_T+CELL_H*FRETS}" stroke="#d4af6a" stroke-width="1.5"/>`;
  }

  // String labels (O/X)
  strings.forEach((label, s) => {
    const x = PAD_L + s * CELL_W;
    const color = label === 'o' ? '#aed6f1' : '#e53935';
    svg += `<text x="${x}" y="${PAD_T - 10}" text-anchor="middle" fill="${color}" font-size="14" font-weight="700" font-family="Oswald">${label.toUpperCase()}</text>`;
  });

  // Barres — drawn as rounded rectangles
  barres.forEach(barre => {
    const r = CELL_H * 0.38; // same radius as dots
    const x1 = PAD_L + barre.fromString * CELL_W;
    const x2 = PAD_L + barre.toString  * CELL_W;
    const cy = PAD_T + (barre.fret - 0.5) * CELL_H;
    const color = FINGER_COLORS[barre.finger] || '#888';
    svg += `<rect x="${x1 - r}" y="${cy - r}" width="${(x2 - x1) + r*2}" height="${r*2}" rx="${r}" fill="${color}"/>`;
    // Finger label in center
    const mx = (x1 + x2) / 2;
    svg += `<text x="${mx}" y="${cy + 5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald">${barre.finger}</text>`;
  });

  // Single dots
  dots.forEach(dot => {
    const cx = PAD_L + dot.string * CELL_W;
    const cy = PAD_T + (dot.fret - 0.5) * CELL_H;
    const r  = CELL_H * 0.38;
    const color = FINGER_COLORS[dot.finger] || '#888';
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald">${dot.finger}</text>`;
  });

  svg += '</svg>';
  return svg;
}

// =====================
// Delete chord
// =====================
async function deleteChord(chord) {
  if (!confirm(`Delete "${chord.name}"?`)) return;
  await deleteDoc(doc(db, 'chords', chord.id));
  await loadAndShowChords(currentNote);
}

// =====================
// Editor
// =====================
window.openEditor = function(chord) {
  editingChord = chord;
  selectedFinger = null;

  if (chord) {
    document.getElementById('edit-title').textContent = 'Edit Chord';
    document.getElementById('edit-note').value = chord.note;
    document.getElementById('edit-name').value  = chord.name;
    editorStrings = chord.strings ? [...chord.strings] : ['o','o','o','o','o','o'];
    editorDots    = chord.dots    ? chord.dots.map(d => ({...d}))   : [];
    editorBarres  = chord.barres  ? chord.barres.map(b => ({...b})) : [];
  } else {
    document.getElementById('edit-title').textContent = 'New Chord';
    document.getElementById('edit-note').value = currentNote || 'A';
    document.getElementById('edit-name').value  = '';
    editorStrings = ['x','o','o','o','o','o'];
    editorDots    = [];
    editorBarres  = [];
  }

  document.getElementById('btn-edit-back').onclick = () => {
    if (allChords.length > 0) showScreen('chords');
    else showScreen('home');
  };

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

// String O/X toggle buttons
function renderStringLabels() {
  const container = document.getElementById('editor-string-labels');
  container.innerHTML = '';

  const spacer = document.createElement('div');
  spacer.style.width = E.PAD_L + 'px';
  container.appendChild(spacer);

  editorStrings.forEach((val, s) => {
    const btn = document.createElement('button');
    btn.className = 'string-label-btn ' + (val === 'o' ? 'open' : 'muted');
    btn.textContent = val.toUpperCase();
    btn.style.width  = E.CELL_W + 'px';
    btn.style.height = '28px';
    btn.addEventListener('click', () => {
      editorStrings[s] = editorStrings[s] === 'o' ? 'x' : 'o';
      renderEditor();
    });
    container.appendChild(btn);
  });
}

// =====================
// Editor diagram with tap + barre drag
// =====================
function renderEditorDiagram() {
  const container = document.getElementById('editor-diagram');
  container.innerHTML = '';

  const { STRINGS, FRETS, CELL_W, CELL_H, PAD_L, PAD_T, W, H } = E;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" id="editor-svg" style="touch-action:none;">`;

  // Nut
  svg += `<rect x="${PAD_L}" y="${PAD_T}" width="${CELL_W*(STRINGS-1)}" height="5" fill="#c8a96e" rx="2"/>`;
  svg += `<rect x="${PAD_L}" y="${PAD_T+7}" width="${CELL_W*(STRINGS-1)}" height="2" fill="#c8a96e" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= FRETS; f++) {
    const y = PAD_T + f * CELL_H;
    svg += `<line x1="${PAD_L}" y1="${y}" x2="${PAD_L+CELL_W*(STRINGS-1)}" y2="${y}" stroke="#3a4a6a" stroke-width="1.5"/>`;
  }

  // String lines
  for (let s = 0; s < STRINGS; s++) {
    const x = PAD_L + s * CELL_W;
    svg += `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${PAD_T+CELL_H*FRETS}" stroke="#d4af6a" stroke-width="1.5"/>`;
  }

  // Invisible tap zones
  for (let s = 0; s < STRINGS; s++) {
    for (let f = 1; f <= FRETS; f++) {
      const cx = PAD_L + s * CELL_W;
      const cy = PAD_T + (f - 0.5) * CELL_H;
      svg += `<rect x="${cx - CELL_W/2}" y="${cy - CELL_H/2}" width="${CELL_W}" height="${CELL_H}" fill="transparent" class="tap-cell" data-s="${s}" data-f="${f}"/>`;
    }
  }

  // Drawn barres
  editorBarres.forEach((barre, idx) => {
    const r  = CELL_H * 0.38;
    const x1 = PAD_L + barre.fromString * CELL_W;
    const x2 = PAD_L + barre.toString   * CELL_W;
    const cy = PAD_T + (barre.fret - 0.5) * CELL_H;
    const color = FINGER_COLORS[barre.finger] || '#888';
    svg += `<rect x="${x1-r}" y="${cy-r}" width="${(x2-x1)+r*2}" height="${r*2}" rx="${r}" fill="${color}" class="placed-barre" data-idx="${idx}" style="cursor:pointer"/>`;
    svg += `<text x="${(x1+x2)/2}" y="${cy+5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald" pointer-events="none">${barre.finger}</text>`;
  });

  // Drawn dots
  editorDots.forEach((dot, idx) => {
    const cx = PAD_L + dot.string * CELL_W;
    const cy = PAD_T + (dot.fret - 0.5) * CELL_H;
    const r  = CELL_H * 0.38;
    const color = FINGER_COLORS[dot.finger] || '#888';
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" class="placed-dot" data-idx="${idx}" style="cursor:pointer"/>`;
    svg += `<text x="${cx}" y="${cy+5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald" pointer-events="none">${dot.finger}</text>`;
  });

  svg += '</svg>';
  container.innerHTML = svg;

  const svgEl = container.querySelector('svg');

  // Remove placed dot on tap
  container.querySelectorAll('.placed-dot').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      editorDots.splice(+el.dataset.idx, 1);
      renderEditor();
    });
  });

  // Remove placed barre on tap
  container.querySelectorAll('.placed-barre').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      editorBarres.splice(+el.dataset.idx, 1);
      renderEditor();
    });
  });

  // ---- Touch / mouse interaction ----
  // We track touchstart/touchend to detect tap vs drag

  let touchStartString = null;
  let touchStartFret   = null;
  let touchMoved       = false;

  function svgPoint(clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // Find nearest string
    let bestS = 0, bestSD = Infinity;
    for (let s = 0; s < STRINGS; s++) {
      const d = Math.abs(x - (PAD_L + s * CELL_W));
      if (d < bestSD) { bestSD = d; bestS = s; }
    }
    // Find nearest fret row
    let bestF = 1, bestFD = Infinity;
    for (let f = 1; f <= FRETS; f++) {
      const d = Math.abs(y - (PAD_T + (f - 0.5) * CELL_H));
      if (d < bestFD) { bestFD = d; bestF = f; }
    }
    return { string: bestS, fret: bestF };
  }

  // TOUCH
  svgEl.addEventListener('touchstart', e => {
    if (!selectedFinger) return;
    e.preventDefault();
    const t = e.touches[0];
    const p = svgPoint(t.clientX, t.clientY);
    touchStartString = p.string;
    touchStartFret   = p.fret;
    touchMoved = false;
  }, { passive: false });

  svgEl.addEventListener('touchmove', e => {
    e.preventDefault();
    touchMoved = true;
  }, { passive: false });

  svgEl.addEventListener('touchend', e => {
    if (!selectedFinger) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const p = svgPoint(t.clientX, t.clientY);

    if (!touchMoved) {
      // Tap = single dot
      placeDot(touchStartString, touchStartFret, selectedFinger);
    } else {
      // Drag = barre (same fret, different strings)
      if (touchStartFret === p.fret && touchStartString !== p.string) {
        placeBarre(touchStartFret, touchStartString, p.string, selectedFinger);
      } else {
        placeDot(p.string, p.fret, selectedFinger);
      }
    }
  }, { passive: false });

  // MOUSE (for PC testing)
  svgEl.addEventListener('mousedown', e => {
    if (!selectedFinger) return;
    const p = svgPoint(e.clientX, e.clientY);
    barreDragStart = p;
    touchMoved = false;
  });
  svgEl.addEventListener('mousemove', () => { touchMoved = true; });
  svgEl.addEventListener('mouseup', e => {
    if (!selectedFinger || !barreDragStart) return;
    const p = svgPoint(e.clientX, e.clientY);
    if (!touchMoved) {
      placeDot(barreDragStart.string, barreDragStart.fret, selectedFinger);
    } else if (barreDragStart.fret === p.fret && barreDragStart.string !== p.string) {
      placeBarre(barreDragStart.fret, barreDragStart.string, p.string, selectedFinger);
    } else {
      placeDot(p.string, p.fret, selectedFinger);
    }
    barreDragStart = null;
  });
}

function placeDot(string, fret, finger) {
  // Remove any existing dot at same position
  editorDots = editorDots.filter(d => !(d.string === string && d.fret === fret));
  editorDots.push({ string, fret, finger });
  renderEditor();
}

function placeBarre(fret, s1, s2, finger) {
  const fromString = Math.min(s1, s2);
  const toString   = Math.max(s1, s2);
  // Remove existing barre at same fret with same finger
  editorBarres = editorBarres.filter(b => !(b.fret === fret && b.finger === finger));
  editorBarres.push({ fret, fromString, toString, finger });
  renderEditor();
}

// =====================
// Save
// =====================
document.getElementById('btn-save-chord').addEventListener('click', async () => {
  const note = document.getElementById('edit-note').value;
  const name = document.getElementById('edit-name').value.trim();
  if (!name) { alert('Please enter a chord name.'); return; }

  const data = {
    uid: currentUser.uid,
    note, name,
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
  await loadAndShowChords(note);
});

// =====================
// Helpers
// =====================
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
