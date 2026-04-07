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
const AFFIRMATIONS = [
  { text: "Je préfère que les devs me montrent leur approche technique avant de commencer à coder — ça évite de perdre du temps.", category: "micro" },
  { text: "Quand un dev choisit une approche différente de la mienne, je prends le temps de lui expliquer pourquoi la mienne est meilleure.", category: "micro" },
  { text: "Je relis toujours les PR en détail, même quand un autre dev a déjà approuvé.", category: "micro" },
  { text: "Sur un sujet urgent, le plus efficace c'est que la personne la plus compétente s'en charge — et souvent c'est moi.", category: "eviteur" },
  { text: "Former quelqu'un sur une tâche prend plus de temps que la faire soi-même, donc ce n'est pas toujours rentable.", category: "eviteur" },
  { text: "Certaines parties du code sont trop critiques pour être confiées à quelqu'un qui ne les connaît pas aussi bien que moi.", category: "eviteur" },
  { text: "Faire confiance, c'est laisser les gens travailler sans leur mettre la pression avec des points intermédiaires.", category: "lacheur" },
  { text: "Un bon dev n'a pas besoin qu'on lui explique le contexte business — un ticket bien rédigé suffit.", category: "lacheur" },
  { text: "Je ne veux pas infantiliser mon équipe en leur demandant où ils en sont tous les jours.", category: "lacheur" },
  { text: "Avant de déléguer, je me demande si la personne a les moyens de réussir — sinon je l'accompagne plutôt que de la laisser galérer.", category: "efficace" },
  { text: "Je n'hésite pas à confier une tâche importante à un junior si je pense que c'est une bonne opportunité d'apprentissage pour lui.", category: "efficace" },
  { text: "Quand je délègue, je précise le résultat attendu mais je laisse la personne choisir comment y arriver.", category: "efficace" },
];

const PROFILS = {
  micro: {
    nom: "Le Micro-Manager",
    emoji: "🔍",
    couleur: "#C0392B",
    description: "Tu as du mal à lâcher le contrôle. Tu veux que tout soit fait comme tu l'aurais fait, et tu vérifies souvent l'avancement. Résultat : ton équipe attend tes instructions et perd en autonomie.",
    conseil: "Challenge-toi : pour ta prochaine délégation, fixe UN seul point de contrôle intermédiaire (pas plus). Laisse le dev choisir son approche, et juge le résultat — pas la méthode.",
  },
  eviteur: {
    nom: "L'Éviteur",
    emoji: "🏃",
    couleur: "#E67E22",
    description: "Tu préfères faire toi-même plutôt que d'investir du temps à expliquer. Tu penses gagner du temps, mais tu deviens le goulot d'étranglement de l'équipe. Tu fais tout, l'équipe ne progresse pas.",
    conseil: "Accepte que déléguer prend du temps MAINTENANT pour en gagner PLUS TARD. Commence par déléguer une tâche simple cette semaine, avec un brief de 10 minutes.",
  },
  lacheur: {
    nom: "Le Lâcheur",
    emoji: "👻",
    couleur: "#8E44AD",
    description: "Tu délègues facilement, mais sans cadre : pas de contexte, pas de suivi, pas de feedback. Le dev part dans le brouillard et n'ose pas te déranger. Résultat : mauvaises surprises à la deadline.",
    conseil: "Pour chaque délégation, donne 3 choses : le POURQUOI (contexte), le QUOI (résultat attendu), et le QUAND (deadline + checkpoints).",
  },
  efficace: {
    nom: "Le Délégateur Efficace",
    emoji: "🎯",
    couleur: "#27AE60",
    description: "Tu adaptes ta délégation à la personne, tu donnes du contexte, tu fais confiance tout en restant disponible. Ton équipe est autonome et progresse. Continue comme ça !",
    conseil: "Ton prochain défi : coache un autre Tech Lead sur la délégation. Partager tes bonnes pratiques te permettra de les ancrer encore plus.",
  },
};

function computeProfile(answers) {
  const scores = { micro: 0, eviteur: 0, lacheur: 0, efficace: 0 };
  for (const a of answers) {
    const cat = AFFIRMATIONS[a.question_index].category;
    scores[cat] += a.score;
  }
  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
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
  const distribution = { micro: 0, eviteur: 0, lacheur: 0, efficace: 0 };
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
  let csv = '\uFEFFNom,Telephone,Micro-Manager,Eviteur,Lacheur,Efficace,Profil Dominant\n';
  for (const s of students) {
    const answers = stmts.getAnswersForStudent.all(s.id);
    if (answers.length === 0) {
      csv += `"${s.name}","${s.phone}",,,,"Non répondu"\n`;
      continue;
    }
    const { scores, dominant } = computeProfile(answers);
    csv += `"${s.name}","${s.phone}",${scores.micro},${scores.eviteur},${scores.lacheur},${scores.efficace},"${PROFILS[dominant].nom}"\n`;
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
    if (session.status === 'results' && answers.length === 12) {
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
    if (questionIndex < 0 || questionIndex >= 12 || score < 1 || score > 5) {
      socket.emit('error', { message: 'Réponse invalide.' });
      return;
    }
    stmts.submitAnswer.run(socket.studentId, questionIndex, score);
    socket.emit('student:answer-confirmed', { questionIndex, score });

    // Notify admin of progress
    const count = stmts.getAnswerCount.get(socket.studentId).count;
    const total = stmts.getAllStudents.all().length;
    const allDone = stmts.getAllStudents.all().every(s => {
      return stmts.getAnswerCount.get(s.id).count >= 12;
    });
    io.to('admins').emit('admin:progress', {
      studentId: socket.studentId,
      answeredCount: count,
      totalQuestions: 12,
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
      if (answers.length < 12) {
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
