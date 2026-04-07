require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { db, stmts } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3302;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'sikatech';

// ── Affirmations ──
const TOTAL_QUESTIONS = 21;

const AFFIRMATIONS = [
  // 1. Le Micro-Manager — déguisé en "rigueur / qualité"
  { text: "Je préfère que les devs me montrent leur approche technique avant de commencer à coder — ça évite de perdre du temps.", category: "micro" },
  { text: "Quand un dev choisit une approche différente de la mienne, je prends le temps de lui expliquer pourquoi la mienne est meilleure.", category: "micro" },
  { text: "Je relis toujours les PR en détail, même quand un autre dev a déjà approuvé.", category: "micro" },

  // 2. L'Éviteur / Le Sauveur — déguisé en "pragmatisme / efficacité"
  { text: "Sur un sujet urgent, le plus efficace c'est que la personne la plus compétente s'en charge — et souvent c'est moi.", category: "eviteur" },
  { text: "Former quelqu'un sur une tâche prend plus de temps que la faire soi-même, donc ce n'est pas toujours rentable.", category: "eviteur" },
  { text: "Certaines parties du code sont trop critiques pour être confiées à quelqu'un qui ne les connaît pas aussi bien que moi.", category: "eviteur" },

  // 3. Le Fantôme — déguisé en "confiance / autonomie"
  { text: "Faire confiance, c'est laisser les gens travailler sans leur mettre la pression avec des points intermédiaires.", category: "fantome" },
  { text: "Un bon dev n'a pas besoin qu'on lui explique le contexte business — un ticket bien rédigé suffit.", category: "fantome" },
  { text: "Je ne veux pas infantiliser mon équipe en leur demandant où ils en sont tous les jours.", category: "fantome" },

  // 4. Le Lanceur de Patate — déguisé en "rapidité / efficacité opérationnelle"
  { text: "L'important c'est que la tâche soit assignée rapidement — les détails se clarifient en cours de route.", category: "patate" },
  { text: "Je n'ai pas besoin de rédiger un brief détaillé pour chaque tâche — un message Slack avec le ticket suffit.", category: "patate" },
  { text: "Si le dev a des questions, il peut toujours venir me voir — pas besoin de tout anticiper.", category: "patate" },

  // 5. Le Délégateur de Corvées — déguisé en "protéger l'équipe / être stratégique"
  { text: "Je garde les features visibles pour moi parce que le client attend un niveau de qualité que je suis le seul à garantir.", category: "corvees" },
  { text: "Les tâches répétitives ou de maintenance, c'est un bon moyen pour les juniors d'apprendre le projet.", category: "corvees" },
  { text: "Je préfère assigner les sujets techniques intéressants aux devs qui les méritent — ceux qui ont fait leurs preuves.", category: "corvees" },

  // 6. Le One-Size-Fits-All — déguisé en "équité / cohérence"
  { text: "Pour être juste, je délègue de la même façon à tout le monde — pas de traitement de faveur.", category: "uniforme" },
  { text: "Tout le monde dans l'équipe devrait être capable de travailler en autonomie — c'est la base.", category: "uniforme" },
  { text: "Je donne les mêmes consignes à un junior et à un senior — l'objectif est le même pour tous.", category: "uniforme" },

  // 7. Le Faux Délégateur — déguisé en "garder la cohérence / éviter les erreurs"
  { text: "Je délègue la réalisation mais je préfère valider chaque décision technique pour garder la cohérence du projet.", category: "faux" },
  { text: "Quand je confie une tâche, je demande au dev de me soumettre ses choix avant d'avancer — c'est plus sûr.", category: "faux" },
  { text: "Le dev peut implémenter, mais les décisions d'architecture restent les miennes, même sur des sujets mineurs.", category: "faux" },
];

const PROFILS = {
  micro: {
    nom: "Le Micro-Manager",
    emoji: "🔍",
    couleur: "#C0392B",
    piege: "Piège 1 — Le micro-management",
    description: "Tu as du mal à lâcher le contrôle. Tu veux que tout soit fait comme tu l'aurais fait, et tu vérifies souvent l'avancement. Résultat : ton équipe attend tes instructions et perd en autonomie.",
    conseil: "Challenge-toi : pour ta prochaine délégation, fixe UN seul point de contrôle intermédiaire (pas plus). Laisse le dev choisir son approche, et juge le résultat — pas la méthode.",
  },
  eviteur: {
    nom: "L'Éviteur / Le Sauveur",
    emoji: "🏃",
    couleur: "#E67E22",
    piege: "Piège 2 — Reprendre la tâche au premier obstacle",
    description: "Tu préfères faire toi-même plutôt que d'investir du temps à expliquer. Au premier blocage, tu reprends la tâche. Tu penses gagner du temps, mais tu deviens le goulot d'étranglement. L'équipe ne progresse pas.",
    conseil: "Accepte que déléguer prend du temps MAINTENANT pour en gagner PLUS TARD. Quand un dev bloque, guide-le avec des questions plutôt que de reprendre la tâche.",
  },
  fantome: {
    nom: "Le Fantôme",
    emoji: "👻",
    couleur: "#8E44AD",
    piege: "Piège 3 — Ne pas suivre du tout",
    description: "Tu délègues et tu disparais. Pas de suivi, pas de feedback, pas de point intermédiaire. Le dev part dans le brouillard et n'ose pas te déranger. Résultat : mauvaises surprises à la deadline.",
    conseil: "Mets en place des checkpoints légers (pas du micro-management). Un point de 5 min à mi-parcours peut sauver une semaine de travail mal orienté.",
  },
  patate: {
    nom: "Le Lanceur de Patate",
    emoji: "🥔",
    couleur: "#E74C3C",
    piege: "Piège 4 — Déléguer sans contexte",
    description: "Tu assignes les tâches vite fait : « Tiens, fais ça. » Pas de contexte, pas d'objectif clair, pas de critère de succès. Le dev part dans la mauvaise direction et perd du temps.",
    conseil: "Pour chaque délégation, prends 5 minutes pour expliquer : le POURQUOI (contexte business), le QUOI (résultat attendu), le QUAND (deadline) et les CONTRAINTES.",
  },
  corvees: {
    nom: "Le Délégateur de Corvées",
    emoji: "🗑️",
    couleur: "#95A5A6",
    piege: "Piège 5 — Déléguer uniquement les tâches ingrates",
    description: "Tu gardes les features intéressantes et visibles pour toi, et tu ne délègues que la maintenance, les bugs et la doc. L'équipe se démotive, personne ne progresse, le turnover augmente.",
    conseil: "Délègue aussi des tâches gratifiantes : une feature visible, une présentation en démo, un choix d'architecture. La motivation vient de la responsabilité, pas juste de l'exécution.",
  },
  uniforme: {
    nom: "Le One-Size-Fits-All",
    emoji: "📏",
    couleur: "#3498DB",
    piege: "Piège 6 — Ne pas adapter à la personne",
    description: "Tu délègues de la même façon à tout le monde, junior comme senior. Résultat : le junior est perdu car il a besoin de plus de cadrage, et le senior se sent infantilisé par trop de consignes.",
    conseil: "Adapte ton niveau de délégation : plus de cadrage pour les juniors (niveau 2-3), plus d'autonomie pour les seniors (niveau 4-5). L'équité ce n'est pas l'uniformité.",
  },
  faux: {
    nom: "Le Faux Délégateur",
    emoji: "🎭",
    couleur: "#1ABC9C",
    piege: "Piège 7 — Responsabilité sans autorité",
    description: "Tu confies la tâche mais pas la décision. Le dev doit te demander la permission pour chaque choix. Résultat : il ne peut pas avancer, frustration des deux côtés, et tu n'as rien gagné.",
    conseil: "Quand tu délègues, définis un cadre clair (budget, deadline, contraintes) puis laisse la personne décider à l'intérieur de ce cadre. Déléguer = donner l'autorité aussi.",
  },
  efficace: {
    nom: "Le Délégateur Efficace",
    emoji: "🎯",
    couleur: "#27AE60",
    piege: null,
    description: "Aucun piège ne domine chez toi ! Tu adaptes ta délégation à la personne, tu donnes du contexte, tu fais confiance tout en restant disponible. Ton équipe est autonome et progresse.",
    conseil: "Continue comme ça. Ton prochain défi : coache un autre Tech Lead sur la délégation. Partager tes bonnes pratiques te permettra de les ancrer encore plus.",
  },
};

const PIEGE_CATEGORIES = ['micro', 'eviteur', 'fantome', 'patate', 'corvees', 'uniforme', 'faux'];

function computeProfile(answers) {
  const scores = {};
  for (const cat of PIEGE_CATEGORIES) scores[cat] = 0;
  for (const a of answers) {
    const cat = AFFIRMATIONS[a.question_index].category;
    scores[cat] += a.score;
  }
  // Le profil dominant est le piège avec le score le plus élevé
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const maxScore = sorted[0][1];
  // Si le score max est <= 7 (moyenne ~2.3/4), on considère "efficace"
  const dominant = maxScore <= 7 ? 'efficace' : sorted[0][0];
  return { scores, dominant, profil: PROFILS[dominant] };
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.post('/api/register', (req, res) => {
  const { phone, name } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'phone and name required' });
  const cleaned = phone.replace(/\s/g, '');
  stmts.registerStudent.run(cleaned, name.trim(), null);
  const student = stmts.getStudentByPhone.get(cleaned);
  res.json({ id: student.id, phone: student.phone, name: student.name });
});

app.get('/api/session', (req, res) => {
  res.json(stmts.getSession.get());
});

app.get('/api/affirmations', (req, res) => {
  res.json(AFFIRMATIONS.map((a, i) => ({ index: i, text: a.text })));
});

app.get('/api/profils', (req, res) => {
  res.json(PROFILS);
});

// Admin endpoints
app.get('/api/admin/:secret/students', (req, res) => {
  if (req.params.secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  res.json(stmts.getStudentResults.all());
});

app.get('/api/admin/:secret/results', (req, res) => {
  if (req.params.secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const students = stmts.getAllStudents.all();
  const results = [];
  for (const s of students) {
    const answers = stmts.getAnswersForStudent.all(s.id);
    if (answers.length === 0) {
      results.push({ id: s.id, name: s.name, phone: s.phone, answered: 0, profile: null });
      continue;
    }
    const { scores, dominant, profil } = computeProfile(answers);
    results.push({ id: s.id, name: s.name, phone: s.phone, answered: answers.length, scores, dominant, profil });
  }
  // Distribution des profils
  const distribution = { micro: 0, eviteur: 0, fantome: 0, patate: 0, corvees: 0, uniforme: 0, faux: 0, efficace: 0 };
  for (const r of results) {
    if (r.dominant) distribution[r.dominant]++;
  }
  res.json({ results, distribution, profils: PROFILS, totalStudents: students.length });
});

app.get('/api/admin/:secret/export/csv', (req, res) => {
  if (req.params.secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const students = stmts.getAllStudents.all();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=delegation-results.csv');
  let csv = '\uFEFFNom,Telephone,Micro-Manager,Eviteur-Sauveur,Fantome,Lanceur-Patate,Corvees,One-Size,Faux-Delegateur,Profil Dominant\n';
  for (const s of students) {
    const answers = stmts.getAnswersForStudent.all(s.id);
    if (answers.length === 0) {
      csv += `"${s.name}","${s.phone}",,,,,,,"Non répondu"\n`;
      continue;
    }
    const { scores, dominant } = computeProfile(answers);
    csv += `"${s.name}","${s.phone}",${scores.micro},${scores.eviteur},${scores.fantome},${scores.patate},${scores.corvees},${scores.uniforme},${scores.faux},"${PROFILS[dominant].nom}"\n`;
  }
  res.send(csv);
});

// ── WebSocket ──
io.on('connection', (socket) => {

  socket.on('student:join', ({ phone }) => {
    if (!phone) return;
    const cleaned = phone.replace(/\s/g, '');
    const student = stmts.getStudentByPhone.get(cleaned);
    if (!student) {
      socket.emit('error', { message: 'Non inscrit.' });
      return;
    }
    stmts.updateSocketId.run(socket.id, cleaned);
    socket.join('students');
    socket.studentPhone = cleaned;
    socket.studentId = student.id;

    const session = stmts.getSession.get();
    const answers = stmts.getAnswersForStudent.all(student.id);
    let profile = null;
    if (session.status === 'results' && answers.length === TOTAL_QUESTIONS) {
      profile = computeProfile(answers);
    }

    socket.emit('session:state', {
      status: session.status,
      studentName: student.name,
      answers: answers.map(a => ({ questionIndex: a.question_index, score: a.score })),
      profile,
    });

    const connCount = stmts.getConnectedCount.get().count;
    io.to('admins').emit('admin:student-connected', { name: student.name, connectedCount: connCount });
  });

  socket.on('student:answer', ({ questionIndex, score }) => {
    if (!socket.studentId) return;
    const session = stmts.getSession.get();
    if (session.status !== 'active') {
      socket.emit('error', { message: 'La session n\'est pas active.' });
      return;
    }
    if (questionIndex < 0 || questionIndex >= TOTAL_QUESTIONS || score < 1 || score > 4) {
      socket.emit('error', { message: 'Réponse invalide.' });
      return;
    }
    stmts.submitAnswer.run(socket.studentId, questionIndex, score);
    socket.emit('student:answer-confirmed', { questionIndex, score });

    // Notify admin of progress
    const count = stmts.getAnswerCount.get(socket.studentId).count;
    const total = stmts.getAllStudents.all().length;
    const allDone = stmts.getAllStudents.all().every(s => {
      return stmts.getAnswerCount.get(s.id).count >= TOTAL_QUESTIONS;
    });
    io.to('admins').emit('admin:progress', {
      studentId: socket.studentId,
      answeredCount: count,
      totalQuestions: TOTAL_QUESTIONS,
      allStudentsDone: allDone,
    });
  });

  // Admin
  socket.on('admin:join', ({ secret }) => {
    if (secret !== ADMIN_SECRET) {
      socket.emit('error', { message: 'Secret invalide.' });
      return;
    }
    socket.join('admins');
    socket.isAdmin = true;

    const session = stmts.getSession.get();
    const connCount = stmts.getConnectedCount.get().count;
    const totalStudents = stmts.getAllStudents.all().length;

    socket.emit('session:state', {
      status: session.status,
      connectedCount: connCount,
      totalStudents,
    });
  });

  socket.on('admin:open-session', () => {
    if (!socket.isAdmin) return;
    stmts.updateSession.run('active');
    io.to('students').emit('session:opened');
    io.to('admins').emit('session:status', { status: 'active' });
  });

  socket.on('admin:close-session', () => {
    if (!socket.isAdmin) return;
    stmts.updateSession.run('closed');
    io.to('students').emit('session:closed');
    io.to('admins').emit('session:status', { status: 'closed' });
  });

  socket.on('admin:show-results', () => {
    if (!socket.isAdmin) return;
    stmts.updateSession.run('results');

    // Send each student their personal result
    const students = stmts.getAllStudents.all();
    for (const s of students) {
      if (!s.socket_id) continue;
      const answers = stmts.getAnswersForStudent.all(s.id);
      if (answers.length < TOTAL_QUESTIONS) {
        io.to(s.socket_id).emit('session:results', { profile: null, incomplete: true });
        continue;
      }
      const profile = computeProfile(answers);
      io.to(s.socket_id).emit('session:results', { profile, incomplete: false });
    }

    io.to('admins').emit('session:status', { status: 'results' });
  });

  socket.on('admin:reset-all', () => {
    if (!socket.isAdmin) return;
    stmts.deleteAllAnswers.run();
    stmts.deleteAllStudents.run();
    stmts.updateSession.run('waiting');

    io.to('students').emit('session:reset');
    io.to('admins').emit('session:status', { status: 'waiting' });
    io.to('admins').emit('session:state', {
      status: 'waiting',
      connectedCount: 0,
      totalStudents: 0,
    });
  });

  socket.on('admin:reset-answers', () => {
    if (!socket.isAdmin) return;
    stmts.deleteAllAnswers.run();
    stmts.updateSession.run('waiting');

    io.to('students').emit('session:reset-answers');
    io.to('admins').emit('session:status', { status: 'waiting' });
  });

  socket.on('disconnect', () => {
    if (socket.studentPhone) {
      stmts.disconnectBySocket.run(socket.id);
      const connCount = stmts.getConnectedCount.get().count;
      io.to('admins').emit('admin:student-disconnected', { connectedCount: connCount });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Délégation app running on http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html?secret=${ADMIN_SECRET}`);
});
