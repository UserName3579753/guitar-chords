// =====================
// Firebase Setup
// =====================
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
// State
// =====================
let currentUser = null;
let currentNote = null;
let currentChords = [];
let editingChord = null; // null = new, object = existing

// Editor state
let editorStrings = ['x','o','o','o','o','o']; // index 0 = string 6 (low E)
let editorDots = []; // {string: 0-5, fret: 0-4, finger: '1'/'2'/'3'/'4'/'T', color: '#...'}

const FINGER_COLORS = {
  '1': '#e53935',
  '2': '#43a047',
  '3': '#1e88e5',
  '4': '#f9a825',
  'T': '#555555'
};

// =====================
// Screen Navigation
// =====================
window.showScreen = function(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
};

// =====================
// Auth
// =====================
document.getElementById('btn-google-login').addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    alert('Login failed: ' + e.message);
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (confirm('Sign out?')) await signOut(auth);
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    showScreen('home');
  } else {
    showScreen('login');
  }
});

// =====================
// Home: Note buttons
// =====================
document.querySelectorAll('.note-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentNote = btn.dataset.note;
    document.getElementById('chord-list-title').textContent = currentNote;
    loadChords(currentNote);
    showScreen('chords');
  });
});

document.getElementById('btn-add-chord').addEventListener('click', () => {
  openEditor(null);
});

// =====================
// Load Chords from Firestore
// =====================
async function loadChords(note) {
  const carousel = document.getElementById('chord-carousel');
  carousel.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  const q = query(
    collection(db, 'chords'),
    where('uid', '==', currentUser.uid),
    where('note', '==', note)
  );
  const snap = await getDocs(q);
  currentChords = [];
  snap.forEach(d => currentChords.push({ id: d.id, ...d.data() }));

  renderCarousel();
}

function renderCarousel() {
  const carousel = document.getElementById('chord-carousel');
  carousel.innerHTML = '';

  // Remove old dots
  const oldDots = document.querySelector('.scroll-dots');
  if (oldDots) oldDots.remove();

  if (currentChords.length === 0) {
    carousel.innerHTML = `
      <div class="chord-card">
        <div class="empty-state">
          <p>No chords yet for ${currentNote}.<br/>Add your first one!</p>
          <button class="btn-add-first" onclick="openEditor(null)">+ Add Chord</button>
        </div>
      </div>`;
    return;
  }

  currentChords.forEach((chord, i) => {
    const card = document.createElement('div');
    card.className = 'chord-card';
    card.innerHTML = `
      <div class="chord-card-name">${escapeHtml(chord.name)}</div>
      ${buildDiagramSVG(chord, 260, 220)}
      <div class="chord-card-actions">
        <button class="btn-edit-chord" data-i="${i}">✏️ Edit</button>
        <button class="btn-delete-chord" data-i="${i}">🗑 Delete</button>
      </div>`;
    carousel.appendChild(card);
  });

  // Scroll dots
  if (currentChords.length > 1) {
    const dotsEl = document.createElement('div');
    dotsEl.className = 'scroll-dots';
    currentChords.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'scroll-dot' + (i === 0 ? ' active' : '');
      dotsEl.appendChild(d);
    });
    const wrapper = document.querySelector('.chord-scroll-wrapper');
    wrapper.insertAdjacentElement('afterend', dotsEl);

    carousel.addEventListener('scroll', () => {
      const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
      document.querySelectorAll('.scroll-dot').forEach((d, i) => {
        d.classList.toggle('active', i === idx);
      });
    });
  }

  // Edit / Delete buttons
  carousel.querySelectorAll('.btn-edit-chord').forEach(btn => {
    btn.addEventListener('click', () => openEditor(currentChords[+btn.dataset.i]));
  });
  carousel.querySelectorAll('.btn-delete-chord').forEach(btn => {
    btn.addEventListener('click', () => deleteChord(currentChords[+btn.dataset.i]));
  });
}

// =====================
// Build Diagram SVG
// =====================
function buildDiagramSVG(chord, svgW, svgH) {
  const strings = chord.strings || ['o','o','o','o','o','o'];
  const dots = chord.dots || [];

  const padL = 30, padT = 36, padR = 10, padB = 20;
  const w = svgW - padL - padR;
  const h = svgH - padT - padB;
  const strGap = w / 5;
  const fretGap = h / 5;

  let svg = `<svg class="diagram-svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">`;

  // Nut (double line at top)
  svg += `<rect x="${padL}" y="${padT}" width="${w}" height="5" fill="#c8a96e" rx="2"/>`;
  svg += `<rect x="${padL}" y="${padT + 7}" width="${w}" height="2" fill="#c8a96e" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= 5; f++) {
    const y = padT + f * fretGap;
    svg += `<line x1="${padL}" y1="${y}" x2="${padL + w}" y2="${y}" stroke="#3a4a6a" stroke-width="1.5"/>`;
  }

  // String lines
  for (let s = 0; s < 6; s++) {
    const x = padL + s * strGap;
    svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + h}" stroke="#d4af6a" stroke-width="1.5"/>`;
  }

  // String labels (O / X) above nut
  strings.forEach((label, s) => {
    const x = padL + s * strGap;
    const color = label === 'o' ? '#aed6f1' : '#e53935';
    svg += `<text x="${x}" y="${padT - 10}" text-anchor="middle" fill="${color}" font-size="14" font-weight="700" font-family="Oswald">${label.toUpperCase()}</text>`;
  });

  // Finger dots
  dots.forEach(dot => {
    const x = padL + dot.string * strGap;
    const y = padT + (dot.fret - 0.5) * fretGap;
    const color = FINGER_COLORS[dot.finger] || '#888';
    svg += `<circle cx="${x}" cy="${y}" r="${fretGap * 0.38}" fill="${color}"/>`;
    svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="Oswald">${dot.finger}</text>`;
  });

  svg += '</svg>';
  return svg;
}

// =====================
// Delete Chord
// =====================
async function deleteChord(chord) {
  if (!confirm(`Delete "${chord.name}"?`)) return;
  await deleteDoc(doc(db, 'chords', chord.id));
  await loadChords(currentNote);
}

// =====================
// Editor
// =====================
window.openEditor = function(chord) {
  editingChord = chord;

  if (chord) {
    document.getElementById('edit-title').textContent = 'Edit Chord';
    document.getElementById('edit-note').value = chord.note;
    document.getElementById('edit-name').value = chord.name;
    editorStrings = chord.strings ? [...chord.strings] : ['o','o','o','o','o','o'];
    editorDots = chord.dots ? chord.dots.map(d => ({...d})) : [];
  } else {
    document.getElementById('edit-title').textContent = 'New Chord';
    document.getElementById('edit-note').value = currentNote || 'A';
    document.getElementById('edit-name').value = '';
    editorStrings = ['x','o','o','o','o','o'];
    editorDots = [];
  }

  document.getElementById('btn-edit-back').onclick = () => {
    if (currentNote) showScreen('chords');
    else showScreen('home');
  };

  renderEditor();
  showScreen('edit');
};

function renderEditor() {
  renderStringLabels();
  renderEditorDiagram();
}

// String label buttons (O / X / muted)
function renderStringLabels() {
  const container = document.getElementById('editor-string-labels');
  container.innerHTML = '';

  const CELL = 44;
  const padL = 30;

  // Spacer for left padding
  const spacer = document.createElement('div');
  spacer.style.width = padL + 'px';
  container.appendChild(spacer);

  editorStrings.forEach((val, s) => {
    const btn = document.createElement('button');
    btn.className = 'string-label-btn ' + (val === 'o' ? 'open' : 'muted');
    btn.textContent = val.toUpperCase();
    btn.style.width = CELL + 'px';
    btn.style.height = '28px';
    btn.addEventListener('click', () => {
      editorStrings[s] = editorStrings[s] === 'o' ? 'x' : 'o';
      renderEditor();
    });
    container.appendChild(btn);
  });
}

// Editor diagram with drag & drop
function renderEditorDiagram() {
  const container = document.getElementById('editor-diagram');
  container.innerHTML = '';

  const STRINGS = 6;
  const FRETS = 5;
  const CELL = 44;
  const padL = 30;
  const padT = 14;
  const padR = 14;
  const padB = 14;
  const svgW = padL + CELL * (STRINGS - 1) + padR + 14;
  const svgH = padT + CELL * FRETS + padB;
  const strGap = CELL;
  const fretGap = CELL;

  let svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" id="editor-svg">`;

  // Nut
  svg += `<rect x="${padL}" y="${padT}" width="${CELL * (STRINGS-1)}" height="6" fill="#c8a96e" rx="2"/>`;
  svg += `<rect x="${padL}" y="${padT + 8}" width="${CELL * (STRINGS-1)}" height="2.5" fill="#c8a96e" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= FRETS; f++) {
    const y = padT + f * fretGap;
    svg += `<line x1="${padL}" y1="${y}" x2="${padL + CELL*(STRINGS-1)}" y2="${y}" stroke="#3a4a6a" stroke-width="1.5"/>`;
  }

  // String lines
  for (let s = 0; s < STRINGS; s++) {
    const x = padL + s * strGap;
    svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + CELL*FRETS}" stroke="#d4af6a" stroke-width="1.5"/>`;
  }

  // Drop zone cells (invisible, for tap-to-remove)
  for (let s = 0; s < STRINGS; s++) {
    for (let f = 1; f <= FRETS; f++) {
      const cx = padL + s * strGap;
      const cy = padT + (f - 0.5) * fretGap;
      svg += `<circle cx="${cx}" cy="${cy}" r="${fretGap*0.4}" fill="transparent" data-s="${s}" data-f="${f}" class="drop-cell"/>`;
    }
  }

  // Placed finger dots
  editorDots.forEach((dot, idx) => {
    const cx = padL + dot.string * strGap;
    const cy = padT + (dot.fret - 0.5) * fretGap;
    const color = FINGER_COLORS[dot.finger] || '#888';
    svg += `<circle cx="${cx}" cy="${cy}" r="${fretGap*0.38}" fill="${color}" class="placed-dot" data-idx="${idx}"/>`;
    svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="white" font-size="14" font-weight="700" font-family="Oswald" pointer-events="none">${dot.finger}</text>`;
  });

  svg += '</svg>';
  container.innerHTML = svg;

  // Tap placed dot to remove
  container.querySelectorAll('.placed-dot').forEach(el => {
    el.addEventListener('click', () => {
      editorDots.splice(+el.dataset.idx, 1);
      renderEditor();
    });
  });

  // Setup drag & drop from palette
  setupDragDrop(container, padL, padT, strGap, fretGap, STRINGS, FRETS);
}

// =====================
// Drag & Drop (touch + mouse)
// =====================
function setupDragDrop(diagramContainer, padL, padT, strGap, fretGap, STRINGS, FRETS) {
  const palette = document.querySelectorAll('.palette-dot');

  palette.forEach(dot => {
    // Mouse drag
    dot.addEventListener('dragstart', e => {
      e.dataTransfer.setData('finger', dot.dataset.finger);
      e.dataTransfer.setData('color', dot.dataset.color);
    });

    // Touch drag
    dot.addEventListener('touchstart', e => {
      e.preventDefault();
      const finger = dot.dataset.finger;
      const color = dot.dataset.color;
      handleTouchDrag(e, finger, color, diagramContainer, padL, padT, strGap, fretGap, STRINGS, FRETS);
    }, { passive: false });
  });

  const svg = diagramContainer.querySelector('svg');

  // Mouse drop
  svg.addEventListener('dragover', e => e.preventDefault());
  svg.addEventListener('drop', e => {
    e.preventDefault();
    const finger = e.dataTransfer.getData('finger');
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    placeDot(finger, x, y, padL, padT, strGap, fretGap, STRINGS, FRETS);
  });
}

function handleTouchDrag(startEvent, finger, color, diagramContainer, padL, padT, strGap, fretGap, STRINGS, FRETS) {
  // Create a floating ghost dot
  const ghost = document.createElement('div');
  ghost.style.cssText = `
    position:fixed; width:40px; height:40px; border-radius:50%;
    background:${color}; color:white; font-weight:700; font-size:16px;
    display:flex; align-items:center; justify-content:center;
    pointer-events:none; z-index:9999; opacity:0.85;
    font-family:Oswald,sans-serif; transform:translate(-50%,-50%);
  `;
  ghost.textContent = finger;
  document.body.appendChild(ghost);

  const move = (e) => {
    const t = e.touches[0];
    ghost.style.left = t.clientX + 'px';
    ghost.style.top = t.clientY + 'px';
  };

  const end = (e) => {
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);
    ghost.remove();

    const t = e.changedTouches[0];
    const svg = diagramContainer.querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;

    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      placeDot(finger, x, y, padL, padT, strGap, fretGap, STRINGS, FRETS);
    }
  };

  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end);

  // Initial position
  const t = startEvent.touches[0];
  ghost.style.left = t.clientX + 'px';
  ghost.style.top = t.clientY + 'px';
}

function placeDot(finger, x, y, padL, padT, strGap, fretGap, STRINGS, FRETS) {
  // Find nearest string
  let bestString = 0, bestDist = Infinity;
  for (let s = 0; s < STRINGS; s++) {
    const sx = padL + s * strGap;
    const d = Math.abs(x - sx);
    if (d < bestDist) { bestDist = d; bestString = s; }
  }

  // Find nearest fret center
  let bestFret = 1, bestFDist = Infinity;
  for (let f = 1; f <= FRETS; f++) {
    const fy = padT + (f - 0.5) * fretGap;
    const d = Math.abs(y - fy);
    if (d < bestFDist) { bestFDist = d; bestFret = f; }
  }

  // Remove existing dot on same position
  editorDots = editorDots.filter(d => !(d.string === bestString && d.fret === bestFret));
  // Remove existing dot with same finger
  editorDots = editorDots.filter(d => d.finger !== finger);

  editorDots.push({ string: bestString, fret: bestFret, finger });
  renderEditor();
}

// =====================
// Save Chord
// =====================
document.getElementById('btn-save-chord').addEventListener('click', async () => {
  const note = document.getElementById('edit-note').value;
  const name = document.getElementById('edit-name').value.trim();

  if (!name) {
    alert('Please enter a chord name.');
    return;
  }

  const data = {
    uid: currentUser.uid,
    note,
    name,
    strings: editorStrings,
    dots: editorDots
  };

  if (editingChord) {
    await updateDoc(doc(db, 'chords', editingChord.id), data);
  } else {
    await addDoc(collection(db, 'chords'), data);
  }

  currentNote = note;
  document.getElementById('chord-list-title').textContent = note;
  await loadChords(note);
  showScreen('chords');
});

// =====================
// Helpers
// =====================
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
