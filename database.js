const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'delegation.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    connected INTEGER DEFAULT 1,
    socket_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    question_index INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, question_index),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  CREATE TABLE IF NOT EXISTS session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT DEFAULT 'waiting'
  );

  INSERT OR IGNORE INTO session (id) VALUES (1);
`);

const stmts = {
  registerStudent: db.prepare(
    `INSERT INTO students (phone, name, socket_id) VALUES (?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET name = excluded.name, socket_id = excluded.socket_id, connected = 1`
  ),
  getStudentByPhone: db.prepare('SELECT * FROM students WHERE phone = ?'),
  updateSocketId: db.prepare('UPDATE students SET socket_id = ?, connected = 1 WHERE phone = ?'),
  disconnectBySocket: db.prepare('UPDATE students SET connected = 0, socket_id = NULL WHERE socket_id = ?'),
  getAllStudents: db.prepare('SELECT * FROM students ORDER BY name'),
  getConnectedCount: db.prepare('SELECT COUNT(*) as count FROM students WHERE connected = 1'),

  submitAnswer: db.prepare(
    `INSERT INTO answers (student_id, question_index, score)
     VALUES (?, ?, ?)
     ON CONFLICT(student_id, question_index) DO UPDATE SET score = excluded.score, answered_at = CURRENT_TIMESTAMP`
  ),
  getAnswersForStudent: db.prepare('SELECT * FROM answers WHERE student_id = ? ORDER BY question_index'),
  getAnswerCount: db.prepare('SELECT COUNT(DISTINCT question_index) as count FROM answers WHERE student_id = ?'),
  deleteAllAnswers: db.prepare('DELETE FROM answers'),
  deleteAllStudents: db.prepare('DELETE FROM students'),
  getAllAnswersGrouped: db.prepare(`
    SELECT s.id, s.name, s.phone, a.question_index, a.score
    FROM students s JOIN answers a ON s.id = a.student_id
    ORDER BY s.name, a.question_index
  `),

  getSession: db.prepare('SELECT * FROM session WHERE id = 1'),
  updateSession: db.prepare('UPDATE session SET status = ? WHERE id = 1'),

  getStudentResults: db.prepare(`
    SELECT s.id, s.name, s.phone,
           COUNT(a.id) as answered
    FROM students s LEFT JOIN answers a ON s.id = a.student_id
    GROUP BY s.id ORDER BY s.name
  `),
};

module.exports = { db, stmts };
