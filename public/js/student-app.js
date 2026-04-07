const socket = io();
let studentName = '';
let studentPhone = '';
let affirmations = [];
let answers = {}; // { questionIndex: score }
let submitted = false;
const TOTAL_Q = 21;

const SCORE_LABELS = ['', 'Pas du tout', 'Plutôt non', 'Plutôt oui', 'Tout à fait'];

const COLORS = {
  micro: '#C0392B', eviteur: '#E67E22', fantome: '#8E44AD', patate: '#E74C3C',
  corvees: '#95A5A6', uniforme: '#3498DB', faux: '#1ABC9C',
};
const NAMES = {
  micro: 'Micro-Manager', eviteur: 'Éviteur / Sauveur', fantome: 'Fantôme',
  patate: 'Lanceur de Patate', corvees: 'Délégateur de Corvées',
  uniforme: 'One-Size-Fits-All', faux: 'Faux Délégateur',
};

// ── Screens ──
function showScreen(id) {
  document.querySelectorAll('[id^="screen-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ── Login ──
document.getElementById('btn-login').addEventListener('click', async () => {
  const name = document.getElementById('input-name').value.trim();
  const phone = document.getElementById('input-phone').value.trim();
  if (!name || !phone) return alert('Veuillez remplir tous les champs.');

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone }),
  });
  if (!res.ok) return alert('Erreur d\'inscription.');

  const data = await res.json();
  studentName = data.name;
  studentPhone = data.phone;
  localStorage.setItem('delegation_phone', studentPhone);
  localStorage.setItem('delegation_name', studentName);

  socket.emit('student:join', { phone: studentPhone });
});

// Auto-reconnect
(function autoReconnect() {
  const phone = localStorage.getItem('delegation_phone');
  if (phone) {
    studentPhone = phone;
    studentName = localStorage.getItem('delegation_name') || '';
    socket.emit('student:join', { phone });
  }
})();

// ── Load affirmations ──
async function loadAffirmations() {
  const res = await fetch('/api/affirmations');
  affirmations = await res.json();
}
loadAffirmations();

// ── Render questions ──
function renderQuestions() {
  const list = document.getElementById('questions-list');
  list.innerHTML = '';

  affirmations.forEach((aff, i) => {
    const card = document.createElement('div');
    card.className = 'question-card' + (answers[i] ? ' answered' : '');
    card.id = `q-${i}`;
    card.innerHTML = `
      <div class="question-text">
        <span class="question-number">${i + 1}</span>
        ${aff.text}
      </div>
      <div class="likert">
        ${[1, 2, 3, 4].map(s => `
          <div class="likert-option">
            <input type="radio" name="q${i}" id="q${i}_${s}" value="${s}" ${answers[i] === s ? 'checked' : ''}>
            <label for="q${i}_${s}">
              <span class="score-num">${s}</span>
              <span class="score-label">${SCORE_LABELS[s]}</span>
            </label>
          </div>
        `).join('')}
      </div>
    `;
    list.appendChild(card);

    card.querySelectorAll('input[type=radio]').forEach(input => {
      input.addEventListener('change', () => {
        const score = parseInt(input.value);
        answers[i] = score;
        card.classList.add('answered');
        socket.emit('student:answer', { questionIndex: i, score });
        updateProgress();
      });
    });
  });

  updateProgress();
}

function updateProgress() {
  const count = Object.keys(answers).length;
  document.getElementById('progress-count').textContent = count;
  document.getElementById('progress-fill').style.width = `${(count / TOTAL_Q) * 100}%`;
  document.getElementById('progress-total').textContent = TOTAL_Q;

  const submitArea = document.getElementById('submit-area');
  const submitBtn = document.getElementById('btn-submit');
  if (count === TOTAL_Q) {
    submitArea.classList.remove('hidden');
    submitBtn.disabled = false;
  } else {
    submitBtn.disabled = true;
  }
}

document.getElementById('btn-submit').addEventListener('click', () => {
  if (Object.keys(answers).length < TOTAL_Q) return;
  submitted = true;
  showScreen('screen-submitted');
});

// ── Render results ──
function renderResults(data) {
  const el = document.getElementById('result-content');
  if (data.incomplete) {
    el.innerHTML = `
      <div class="profile-emoji">⚠️</div>
      <h2>Questionnaire incomplet</h2>
      <p>Vous n'avez pas répondu à toutes les questions.</p>
    `;
    showScreen('screen-results');
    return;
  }

  const p = data.profile;

  let barsHtml = '';
  for (const [key, score] of Object.entries(p.scores)) {
    const pct = (score / 12) * 100;
    const isDominant = key === p.dominant;
    barsHtml += `
      <div class="score-bar-item">
        <div class="score-bar-label">
          <span style="${isDominant ? 'font-weight:700' : ''}">${NAMES[key] || key}</span>
          <span>${score}/12</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width: ${pct}%; background: ${COLORS[key] || '#999'};"></div>
        </div>
      </div>
    `;
  }

  const piegeHtml = p.profil.piege
    ? `<div style="background:#fff3cd;border-left:4px solid #E67E22;padding:10px 14px;border-radius:0 10px 10px 0;margin-bottom:14px;text-align:left;font-size:0.85em;color:#856404;"><strong>${p.profil.piege}</strong></div>`
    : '';

  el.innerHTML = `
    <div class="profile-emoji">${p.profil.emoji}</div>
    <div class="profile-badge" style="background: ${p.profil.couleur}">${p.profil.nom}</div>
    ${piegeHtml}
    <div class="score-bars">${barsHtml}</div>
    <div class="profile-description">${p.profil.description}</div>
    <div class="profile-conseil"><strong>Conseil :</strong> ${p.profil.conseil}</div>
  `;
  showScreen('screen-results');
}

// ── Socket events ──
socket.on('session:state', (data) => {
  if (data.studentName) studentName = data.studentName;

  if (data.answers && data.answers.length > 0) {
    for (const a of data.answers) {
      answers[a.questionIndex] = a.score;
    }
  }

  if (data.status === 'results' && data.profile) {
    renderResults({ profile: data.profile, incomplete: false });
    return;
  }

  if (data.status === 'active') {
    renderQuestions();
    if (Object.keys(answers).length === TOTAL_Q && submitted) {
      showScreen('screen-submitted');
    } else {
      showScreen('screen-questions');
    }
    return;
  }

  if (data.status === 'closed') {
    if (Object.keys(answers).length === TOTAL_Q) {
      showScreen('screen-submitted');
    } else {
      showScreen('screen-waiting');
      document.getElementById('waiting-name').textContent = studentName;
    }
    return;
  }

  showScreen('screen-waiting');
  document.getElementById('waiting-name').textContent = studentName;
});

socket.on('session:opened', () => {
  renderQuestions();
  showScreen('screen-questions');
});

socket.on('session:closed', () => {
  if (Object.keys(answers).length === TOTAL_Q) {
    showScreen('screen-submitted');
  }
});

socket.on('session:results', (data) => {
  renderResults(data);
});

socket.on('session:reset', () => {
  answers = {};
  submitted = false;
  localStorage.removeItem('delegation_phone');
  localStorage.removeItem('delegation_name');
  showScreen('screen-login');
});

socket.on('session:reset-answers', () => {
  answers = {};
  submitted = false;
  showScreen('screen-waiting');
  document.getElementById('waiting-name').textContent = studentName;
});

socket.on('student:answer-confirmed', ({ questionIndex, score }) => {
  answers[questionIndex] = score;
  updateProgress();
});

socket.on('error', (data) => {
  alert(data.message);
});
