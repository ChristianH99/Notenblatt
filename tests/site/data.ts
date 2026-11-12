/**
 * Demo data for the website screenshots: one teacher (Englisch/Deutsch) over three school
 * years. All names are invented; scores come from a seeded random generator, so every run
 * produces the same database and the same screenshots.
 */
import type { Page } from '@playwright/test';
import { invoke } from '../e2e/helpers';

/** mulberry32: small deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261111);
/** Roughly normal noise (sum of uniforms), mean 0, sd ≈ sd. */
const noise = (sd: number): number => (rand() + rand() + rand() + rand() - 2) * sd * 1.73;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const LAST = [
  'Albrecht', 'Bauer', 'Becker', 'Demir', 'Engel', 'Fischer', 'Friedrich', 'Graf', 'Hartmann', 'Hoffmann',
  'Huber', 'Jung', 'Kaya', 'Keller', 'Krause', 'Lang', 'Lorenz', 'Maier', 'Nowak', 'Öztürk',
  'Pohl', 'Roth', 'Schäfer', 'Schmid', 'Seidel', 'Vogel', 'Weber', 'Winter', 'Wolf', 'Zimmermann',
];
const FIRST = [
  'Lea', 'Jonas', 'Mia', 'Elias', 'Emma', 'Noah', 'Hannah', 'Paul', 'Sophie', 'Leon',
  'Marie', 'Finn', 'Lina', 'Ben', 'Clara', 'Luis', 'Emilia', 'Felix', 'Ida', 'Anton',
  'Greta', 'Jakob', 'Nele', 'Moritz', 'Zoe', 'David', 'Amira', 'Samuel', 'Lotta', 'Yusuf',
];

function names(count: number, offset: number): { lastName: string; firstName: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    lastName: LAST[(i * 7 + offset) % LAST.length] as string,
    firstName: FIRST[(i * 11 + offset * 3) % FIRST.length] as string,
  })).sort((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
}

interface Lite {
  tasks: { id: number }[];
  students: { id: number; lastName: string; firstName: string }[];
}
interface Category {
  id: number;
  name: string;
}

/** Ability per student (0–1), stable across years. */
const ability = new Map<string, number>();
function skill(s: { lastName: string; firstName: string }): number {
  const k = `${s.lastName}|${s.firstName}`;
  if (!ability.has(k)) ability.set(k, clamp(0.62 + noise(0.17), 0.2, 0.98));
  return ability.get(k) as number;
}

interface PointsExam {
  courseId: number;
  categoryId: number | null;
  kind: string;
  number: string;
  date: string;
  /** Task labels and max points; a single entry with label '' means total only. */
  tasks: [string, number][];
  /** Exam difficulty shift (negative = harder). */
  shift?: number;
  errorGrading?: boolean;
  absent?: number;
  /** Leave the last n students without entries (exam still being corrected). */
  open?: number;
}

const TEACHER = 'Frau Lindner';

async function pointsExam(page: Page, e: PointsExam): Promise<number> {
  const totalOnly = e.tasks.length === 1 && e.tasks[0]?.[0] === '';
  const id = await invoke<number>(page, 'exams.create', {
    courseId: e.courseId, kind: e.kind, number: e.number, examDate: e.date, teacher: TEACHER,
    stepQp: 2, taskCount: totalOnly ? 0 : e.tasks.length, copyFromExamId: null, categoryId: e.categoryId,
    entryMode: 'points', errorGrading: !!e.errorGrading, perTask: !totalOnly,
    ...(totalOnly ? { totalMaxQp: (e.tasks[0]?.[1] as number) * 4 } : {}),
  });
  let d = await invoke<Lite>(page, 'exams.get', { id });
  if (!totalOnly) {
    for (let i = 0; i < d.tasks.length; i++) {
      const [label, max] = e.tasks[i] as [string, number];
      await invoke(page, 'tasks.update', { id: d.tasks[i]?.id, label, maxQp: max * 4 });
    }
    d = await invoke<Lite>(page, 'exams.get', { id });
  }
  const graded = d.students.slice(0, d.students.length - (e.open ?? 0));
  const absent = new Set<number>();
  for (let i = 0; i < (e.absent ?? 0); i++) absent.add(graded[Math.floor(rand() * graded.length)]?.id as number);
  const scores: { taskId: number; studentId: number; qp: number }[] = [];
  const totals: { studentId: number; qp: number }[] = [];
  const errors: { studentId: number; halfErrors: number }[] = [];
  for (const s of graded) {
    if (absent.has(s.id)) continue;
    const a = skill(s) + (e.shift ?? 0);
    if (totalOnly) {
      const max = (e.tasks[0]?.[1] as number) * 4;
      totals.push({ studentId: s.id, qp: Math.round((clamp(a + noise(0.08), 0, 1) * max) / 2) * 2 });
    } else {
      d.tasks.forEach((t, i) => {
        const max = (e.tasks[i]?.[1] as number) * 4;
        scores.push({ taskId: t.id, studentId: s.id, qp: Math.round((clamp(a + noise(0.16), 0, 1) * max) / 2) * 2 });
      });
    }
    if (e.errorGrading) errors.push({ studentId: s.id, halfErrors: Math.max(0, Math.round((1 - a) * 22 + noise(3))) });
  }
  if (scores.length) await invoke(page, 'scores.set', { examId: id, changes: scores });
  if (totals.length) await invoke(page, 'totals.set', { examId: id, changes: totals });
  if (errors.length) await invoke(page, 'errors.set', { examId: id, changes: errors });
  for (const sid of absent) await invoke(page, 'participation.set', { examId: id, studentId: sid, status: 'absent' });
  return id;
}

async function markExam(page: Page, courseId: number, categoryId: number, scheme: 'NP15' | 'LIN6', kind: string, number: string, date: string, share = 0.35): Promise<number> {
  const id = await invoke<number>(page, 'exams.create', {
    courseId, kind, number, examDate: date, teacher: TEACHER, stepQp: 4, taskCount: 0, copyFromExamId: null,
    categoryId, entryMode: 'grade', errorGrading: false,
  });
  const d = await invoke<Lite>(page, 'exams.get', { id });
  const changes = d.students
    .filter(() => rand() < share)
    .map((s) => {
      const a = skill(s) + noise(0.1);
      const value = scheme === 'NP15' ? Math.round(clamp(a * 15, 0, 15)) : Math.round(clamp(6 - a * 5.4, 1, 6)) * 10;
      return { studentId: s.id, value };
    });
  await invoke(page, 'marks.set', { examId: id, changes });
  return id;
}

async function categories(page: Page, courseId: number): Promise<Category[]> {
  return (await invoke<{ categories: Category[] }>(page, 'courses.overview', { id: courseId })).categories;
}

/** Englisch, Bavarian style: Schulaufgaben ×2, kleine Leistungsnachweise ×1, mündlich ×1. */
async function setupEnglish(page: Page, courseId: number): Promise<{ sa: number; kl: number; m: number }> {
  let cats = await categories(page, courseId);
  const sa = cats.find((c) => c.name === 'Schriftlich');
  if (sa) {
    await invoke(page, 'categories.update', { id: sa.id, name: 'Schulaufgaben', weightC: 200 });
    await invoke(page, 'categories.add', { courseId, name: 'Kleine Leistungsnachweise', weightC: 100, defaultMode: 'points' });
    const m = cats.find((c) => c.name === 'Mündlich') as Category;
    await invoke(page, 'categories.move', { id: m.id, position: 2 });
  }
  cats = await categories(page, courseId);
  const by = (n: string): number => (cats.find((c) => c.name === n) as Category).id;
  return { sa: by('Schulaufgaben'), kl: by('Kleine Leistungsnachweise'), m: by('Mündlich') };
}

const SA_TASKS: [string, number][] = [
  ['Hören', 10], ['Gramm.', 14], ['Wort', 8], ['Lesen', 12], ['Medi.', 8], ['Text', 18],
];
const EX_TASKS: [string, number][] = [['1', 6], ['2', 8], ['3', 6]];

async function englishYear(page: Page, courseId: number, year: number, current: boolean): Promise<number> {
  const c = await setupEnglish(page, courseId);
  const y = (m: number, d: number): string => `${m >= 9 ? year : year + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const sa1 = await pointsExam(page, { courseId, categoryId: c.sa, kind: 'Schulaufgabe', number: '1', date: y(11, 5), tasks: SA_TASKS, shift: -0.02, absent: 1 });
  await pointsExam(page, { courseId, categoryId: c.kl, kind: 'Stegreifaufgabe', number: '1', date: y(10, 9), tasks: EX_TASKS, shift: 0.03 });
  await markExam(page, courseId, c.m, 'LIN6', 'Abfrage', '1', y(10, 21));
  if (current) return sa1;
  await pointsExam(page, { courseId, categoryId: c.kl, kind: 'Stegreifaufgabe', number: '2', date: y(12, 10), tasks: EX_TASKS });
  await markExam(page, courseId, c.m, 'LIN6', 'Abfrage', '2', y(1, 20));
  await pointsExam(page, { courseId, categoryId: c.sa, kind: 'Schulaufgabe', number: '2', date: y(2, 26), tasks: SA_TASKS, shift: -0.05, absent: 2 });
  await pointsExam(page, { courseId, categoryId: c.kl, kind: 'Kurzarbeit', number: '1', date: y(4, 23), tasks: [['', 30]] });
  await markExam(page, courseId, c.m, 'LIN6', 'Referat', '1', y(5, 14), 0.5);
  await pointsExam(page, { courseId, categoryId: c.sa, kind: 'Schulaufgabe', number: '3', date: y(6, 25), tasks: SA_TASKS, shift: 0.01 });
  await markExam(page, courseId, c.m, 'LIN6', 'Abfrage', '3', y(7, 8), 0.5);
  return sa1;
}

export interface Seeded {
  /** 10b Englisch, Schulaufgabe 1 (current year): the main grid. */
  heroExam: number;
  /** 9b Englisch (last year, complete): the grade overview. */
  overviewCourse: number;
  /** 10b Englisch (current year): the weighting tab. */
  weightingCourse: number;
  /** Q11 Englisch, Notenpunkte. */
  npExam: number;
  /** 5a Deutsch, Diktat with error grading. */
  errorExam: number;
}

export async function seed(page: Page): Promise<Seeded> {
  await invoke(page, 'settings.set', { key: 'teacher', value: TEACHER });
  await invoke(page, 'settings.set', { key: 'school', value: 'Gymnasium (Beispieldaten)' });
  await invoke(page, 'settings.set', { key: 'defaultGradingSystem', value: 'LIN6' });
  await invoke(page, 'settings.set', { key: 'retentionMonths', value: '24' });

  // 8b (2024/25) → 9b (2025/26) → 10b (2026/27): the same class over three years.
  const c8 = await invoke<number>(page, 'classes.create', { name: '8b', schoolYear: '2024/25' });
  await invoke(page, 'students.add', { classId: c8, names: names(27, 0) });
  const e8 = await invoke<number>(page, 'courses.create', { classId: c8, subject: 'Englisch' });
  await englishYear(page, e8, 2024, false);

  const c9 = await invoke<number>(page, 'classes.copy', { id: c8, name: '9b', schoolYear: '2025/26' });
  const tree9 = await invoke<{ id: number; courses: { id: number }[] }[]>(page, 'classes.tree');
  const e9 = (tree9.find((t) => t.id === c9)?.courses[0]?.id) as number;
  await englishYear(page, e9, 2025, false);

  const c10 = await invoke<number>(page, 'classes.copy', { id: c9, name: '10b', schoolYear: '2026/27' });
  const tree10 = await invoke<{ id: number; courses: { id: number }[] }[]>(page, 'classes.tree');
  const e10 = (tree10.find((t) => t.id === c10)?.courses[0]?.id) as number;
  const heroExam = await englishYear(page, e10, 2026, true);

  // Q11 Englisch in Notenpunkte.
  const q11 = await invoke<number>(page, 'classes.create', { name: 'Q11', schoolYear: '2026/27' });
  await invoke(page, 'students.add', { classId: q11, names: names(22, 13) });
  await invoke(page, 'settings.set', { key: 'defaultGradingSystem', value: 'NP15' });
  const eq = await invoke<number>(page, 'courses.create', { classId: q11, subject: 'Englisch' });
  await invoke(page, 'settings.set', { key: 'defaultGradingSystem', value: 'LIN6' });
  const qc = await categories(page, eq);
  const npExam = await pointsExam(page, { courseId: eq, categoryId: qc[0]?.id ?? null, kind: 'Klausur', number: '1', date: '2026-10-28', tasks: SA_TASKS, shift: 0.04, absent: 1 });
  await markExam(page, eq, qc[1]?.id as number, 'NP15', 'Abfrage', '1', '2026-10-14');

  // 5a Deutsch with error grading.
  const c5 = await invoke<number>(page, 'classes.create', { name: '5a', schoolYear: '2026/27' });
  await invoke(page, 'students.add', { classId: c5, names: names(26, 21) });
  const d5 = await invoke<number>(page, 'courses.create', { classId: c5, subject: 'Deutsch' });
  const dc = await categories(page, d5);
  await pointsExam(page, { courseId: d5, categoryId: dc[0]?.id ?? null, kind: 'Schulaufgabe', number: '1', date: '2026-10-20', tasks: [['1', 24], ['2', 16]] });
  const errorExam = await pointsExam(page, {
    courseId: d5, categoryId: dc[0]?.id ?? null, kind: 'Diktat', number: '1', date: '2026-11-06', tasks: [['1', 6], ['2', 8], ['3', 6]], errorGrading: true, shift: 0.05,
  });

  return { heroExam, overviewCourse: e9, weightingCourse: e10, npExam, errorExam };
}
