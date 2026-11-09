import type Database from 'better-sqlite3';

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

type Migration = string | ((db: Database.Database) => void);

/** Default categories for new courses (and for classes migrated from schema version 1). */
export const DEFAULT_CATEGORY_TEMPLATE = [
  { name: 'Schriftlich', weightC: 300, defaultMode: 'points' as const },
  { name: 'Mündlich', weightC: 100, defaultMode: 'grade' as const },
];

/** Migrations, applied in order. user_version = number of applied migrations. */
export const MIGRATIONS: Migration[] = [
  `
  CREATE TABLE school_class (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    school_year TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE TABLE student (
    id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
    last_name TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX student_class ON student(class_id);
  CREATE TABLE exam (
    id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    number TEXT,
    subject TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    teacher TEXT,
    scheme TEXT NOT NULL CHECK (scheme IN ('NP15','LIN6')),
    step_qp INTEGER NOT NULL DEFAULT 2 CHECK (step_qp IN (1,2,4)),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX exam_class ON exam(class_id);
  CREATE TABLE task (
    id INTEGER PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    max_qp INTEGER NOT NULL CHECK (max_qp > 0)
  );
  CREATE INDEX task_exam ON task(exam_id);
  CREATE TABLE participation (
    exam_id INTEGER NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent')),
    PRIMARY KEY (exam_id, student_id)
  );
  CREATE INDEX participation_student ON participation(student_id);
  CREATE TABLE score (
    task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    points_qp INTEGER NOT NULL CHECK (points_qp >= 0),
    PRIMARY KEY (task_id, student_id)
  );
  CREATE INDEX score_student ON score(student_id);
  CREATE TABLE setting (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `,
  // 2 — weighting categories, mark-only exams, per-class grading system.
  (db) => {
    db.exec(`
      CREATE TABLE grade_category (
        id INTEGER PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        weight_c INTEGER NOT NULL CHECK (weight_c > 0),
        default_mode TEXT NOT NULL DEFAULT 'points' CHECK (default_mode IN ('points','grade')),
        position INTEGER NOT NULL
      );
      CREATE INDEX grade_category_class ON grade_category(class_id);
      ALTER TABLE school_class ADD COLUMN grading_system TEXT NOT NULL DEFAULT 'NP15' CHECK (grading_system IN ('NP15','LIN6'));
      ALTER TABLE school_class ADD COLUMN avg_method TEXT NOT NULL DEFAULT 'category' CHECK (avg_method IN ('category','exam'));
      ALTER TABLE exam ADD COLUMN category_id INTEGER REFERENCES grade_category(id) ON DELETE SET NULL;
      ALTER TABLE exam ADD COLUMN entry_mode TEXT NOT NULL DEFAULT 'points' CHECK (entry_mode IN ('points','grade'));
      CREATE INDEX exam_category ON exam(category_id);
      CREATE TABLE mark (
        exam_id INTEGER NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
        value INTEGER NOT NULL CHECK (value >= 0 AND value <= 60),
        PRIMARY KEY (exam_id, student_id)
      );
      CREATE INDEX mark_student ON mark(student_id);
    `);
    // Existing classes: default categories; all existing (written) exams go into the first one.
    const classes = db.prepare('SELECT id FROM school_class').all() as { id: number }[];
    const ins = db.prepare('INSERT INTO grade_category(class_id, name, weight_c, default_mode, position) VALUES (?, ?, ?, ?, ?)');
    for (const c of classes) {
      let first = 0;
      DEFAULT_CATEGORY_TEMPLATE.forEach((t, i) => {
        const id = Number(ins.run(c.id, t.name, t.weightC, t.defaultMode, i).lastInsertRowid);
        if (i === 0) first = id;
      });
      db.prepare('UPDATE exam SET category_id = ? WHERE class_id = ?').run(first, c.id);
      const lin = db.prepare("SELECT COUNT(*) n FROM exam WHERE class_id = ? AND scheme = 'LIN6'").get(c.id) as { n: number };
      const np = db.prepare("SELECT COUNT(*) n FROM exam WHERE class_id = ? AND scheme = 'NP15'").get(c.id) as { n: number };
      if (lin.n > np.n) db.prepare("UPDATE school_class SET grading_system = 'LIN6' WHERE id = ?").run(c.id);
    }
  },
  // 3 — grading system per class (exams follow it), final-mark rounding, directly entered sums,
  //     overall average always weighted per exam (averaging-method column removed).
  (db) => {
    db.exec(`
      ALTER TABLE school_class ADD COLUMN final_rounding TEXT NOT NULL DEFAULT 'half_up' CHECK (final_rounding IN ('none','half_up','half_favor'));
      ALTER TABLE school_class ADD COLUMN final_digits INTEGER NOT NULL DEFAULT 0 CHECK (final_digits IN (0,1));
      ALTER TABLE school_class DROP COLUMN avg_method;
      CREATE TABLE score_total (
        exam_id INTEGER NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
        points_qp INTEGER NOT NULL CHECK (points_qp >= 0),
        PRIMARY KEY (exam_id, student_id)
      );
      CREATE INDEX score_total_student ON score_total(student_id);
    `);
    // Mark-only exams with marks cannot change their scheme (the stored numbers would change meaning).
    // If all of a class's marked oral exams use one scheme, the class adopts it; then every other exam follows the class.
    const classes = db.prepare('SELECT id, grading_system FROM school_class').all() as { id: number; grading_system: string }[];
    for (const c of classes) {
      const marked = db
        .prepare("SELECT DISTINCT e.scheme FROM exam e WHERE e.class_id = ? AND e.entry_mode = 'grade' AND EXISTS (SELECT 1 FROM mark m WHERE m.exam_id = e.id)")
        .all(c.id) as { scheme: string }[];
      let system = c.grading_system;
      if (marked.length === 1 && marked[0]!.scheme !== system) {
        system = marked[0]!.scheme;
        db.prepare('UPDATE school_class SET grading_system = ? WHERE id = ?').run(system, c.id);
      }
      db.prepare(
        "UPDATE exam SET scheme = ? WHERE class_id = ? AND NOT (entry_mode = 'grade' AND scheme <> ? AND EXISTS (SELECT 1 FROM mark m WHERE m.exam_id = exam.id))",
      ).run(system, c.id, system);
    }
  },
  // 4 — courses (subjects of a class). The class keeps the students; each course has its own subject,
  //     members, exams, categories, grading system and final-mark rounding, so marks of different
  //     subjects are never averaged together. Exams take their subject from the course.
  //     Every class gets one course per distinct subject of its exams (case-insensitive); classes
  //     without exams get no course. All students of the class become members of each course.
  (db) => {
    db.exec(`
      CREATE TABLE course (
        id INTEGER PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        grading_system TEXT NOT NULL DEFAULT 'NP15' CHECK (grading_system IN ('NP15','LIN6')),
        final_rounding TEXT NOT NULL DEFAULT 'half_up' CHECK (final_rounding IN ('none','half_up','half_favor')),
        final_digits INTEGER NOT NULL DEFAULT 0 CHECK (final_digits IN (0,1)),
        created_at TEXT NOT NULL DEFAULT ${NOW},
        updated_at TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE UNIQUE INDEX course_class_subject ON course(class_id, subject COLLATE NOCASE);
      CREATE TABLE course_student (
        course_id INTEGER NOT NULL REFERENCES course(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
        PRIMARY KEY (course_id, student_id)
      );
      CREATE INDEX course_student_student ON course_student(student_id);
      CREATE TABLE grade_category_new (
        id INTEGER PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES course(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        weight_c INTEGER NOT NULL CHECK (weight_c > 0),
        default_mode TEXT NOT NULL DEFAULT 'points' CHECK (default_mode IN ('points','grade')),
        position INTEGER NOT NULL
      );
      CREATE TABLE exam_new (
        id INTEGER PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES course(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        number TEXT,
        exam_date TEXT NOT NULL,
        teacher TEXT,
        scheme TEXT NOT NULL CHECK (scheme IN ('NP15','LIN6')),
        step_qp INTEGER NOT NULL DEFAULT 2 CHECK (step_qp IN (1,2,4)),
        notes TEXT,
        category_id INTEGER REFERENCES grade_category(id) ON DELETE SET NULL,
        entry_mode TEXT NOT NULL DEFAULT 'points' CHECK (entry_mode IN ('points','grade')),
        created_at TEXT NOT NULL DEFAULT ${NOW},
        updated_at TEXT NOT NULL DEFAULT ${NOW}
      );
    `);
    type OldExam = { id: number; subject: string; category_id: number | null } & Record<string, unknown>;
    const classes = db.prepare('SELECT id, grading_system, final_rounding, final_digits FROM school_class ORDER BY id').all() as {
      id: number;
      grading_system: string;
      final_rounding: string;
      final_digits: number;
    }[];
    const insCourse = db.prepare('INSERT INTO course(class_id, subject, grading_system, final_rounding, final_digits) VALUES (?, ?, ?, ?, ?)');
    const insMembers = db.prepare('INSERT INTO course_student(course_id, student_id) SELECT ?, id FROM student WHERE class_id = ?');
    const insCat = db.prepare('INSERT INTO grade_category_new(course_id, name, weight_c, default_mode, position) VALUES (?, ?, ?, ?, ?)');
    const insExam = db.prepare(
      `INSERT INTO exam_new(id, course_id, kind, number, exam_date, teacher, scheme, step_qp, notes, category_id, entry_mode, created_at, updated_at)
       VALUES (@id, @course_id, @kind, @number, @exam_date, @teacher, @scheme, @step_qp, @notes, @category_id, @entry_mode, @created_at, @updated_at)`,
    );
    for (const c of classes) {
      const exams = db.prepare('SELECT * FROM exam WHERE class_id = ? ORDER BY exam_date, id').all(c.id) as OldExam[];
      const cats = db.prepare('SELECT * FROM grade_category WHERE class_id = ? ORDER BY position, id').all(c.id) as {
        id: number;
        name: string;
        weight_c: number;
        default_mode: string;
        position: number;
      }[];
      const groups = new Map<string, { subject: string; exams: OldExam[] }>();
      for (const e of exams) {
        const subject = e.subject.trim() || 'Ohne Fach';
        const key = subject.toLowerCase();
        const g = groups.get(key) ?? { subject, exams: [] };
        g.exams.push(e);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const courseId = Number(insCourse.run(c.id, g.subject, c.grading_system, c.final_rounding, c.final_digits).lastInsertRowid);
        insMembers.run(courseId, c.id);
        const catMap = new Map<number, number>();
        for (const k of cats) catMap.set(k.id, Number(insCat.run(courseId, k.name, k.weight_c, k.default_mode, k.position).lastInsertRowid));
        for (const e of g.exams) insExam.run({ ...e, course_id: courseId, category_id: e.category_id === null ? null : (catMap.get(e.category_id) ?? null) });
      }
    }
    db.exec(`
      DROP TABLE exam;
      ALTER TABLE exam_new RENAME TO exam;
      CREATE INDEX exam_course ON exam(course_id);
      CREATE INDEX exam_category ON exam(category_id);
      DROP TABLE grade_category;
      ALTER TABLE grade_category_new RENAME TO grade_category;
      CREATE INDEX grade_category_course ON grade_category(course_id);
      ALTER TABLE school_class DROP COLUMN grading_system;
      ALTER TABLE school_class DROP COLUMN final_rounding;
      ALTER TABLE school_class DROP COLUMN final_digits;
    `);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * The database cannot be used by this program version. Never a sign of corruption:
 * the file must be left untouched (it may still be fine for another version).
 */
export class SchemaError extends Error {
  constructor(
    readonly reason: 'tooNew' | 'migrationFailed',
    options?: { cause?: unknown },
  ) {
    super(reason === 'tooNew' ? 'DB_SCHEMA_TOO_NEW' : 'DB_MIGRATION_FAILED', options);
  }
}

/**
 * Brings the DB to SCHEMA_VERSION. Each step is one transaction, so a failing step changes nothing.
 * Foreign keys are off while migrating (rebuilding a table must not cascade into its children);
 * each step checks them before it commits.
 */
export function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > SCHEMA_VERSION) throw new SchemaError('tooNew');
  if (current === SCHEMA_VERSION) return;
  const fk = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  try {
    for (let v = current; v < SCHEMA_VERSION; v++) {
      try {
        db.transaction(() => {
          const m = MIGRATIONS[v] as Migration;
          if (typeof m === 'string') db.exec(m);
          else m(db);
          if ((db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('DB_MIGRATION_FK');
          db.pragma(`user_version = ${v + 1}`);
        })();
      } catch (e) {
        throw new SchemaError('migrationFailed', { cause: e });
      }
    }
  } finally {
    if (fk) db.pragma('foreign_keys = ON');
  }
}
