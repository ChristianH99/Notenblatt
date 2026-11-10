/**
 * PDF output of an exam with error grading: exam sheet, Notenspiegel and key. The files are kept
 * in test-results/pdf for review (design, borders, export date).
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { invoke, launch, mockSaveDialog, netLog, ROOT, tempDir } from './helpers';

interface Lite {
  tasks: { id: number }[];
  students: { id: number }[];
}

test('PDF output with error grading', async () => {
  const { app, page } = await launch(tempDir(), { width: 1440, height: 900 });
  await invoke(page, 'settings.set', { key: 'school', value: 'Gymnasium Musterstadt' });
  const classId = await invoke<number>(page, 'classes.create', { name: '9b', schoolYear: '2025/26' });
  const names = ['Albers', 'Brandt', 'Conrad', 'Dorn', 'Engel', 'Fischer', 'Graf', 'Hahn'].map((l, i) => ({ lastName: l, firstName: `Vorname ${i + 1}` }));
  await invoke(page, 'students.add', { classId, names });
  const courseId = await invoke<number>(page, 'courses.create', { classId, subject: 'Englisch' });
  const examId = await invoke<number>(page, 'exams.create', {
    courseId, kind: 'Klassenarbeit', number: '1', examDate: '2025-11-20', teacher: 'Frau Huber',
    stepQp: 2, taskCount: 4, copyFromExamId: null, categoryId: null, entryMode: 'points', errorGrading: true, perTask: true,
  });
  let data = await invoke<Lite>(page, 'exams.get', { id: examId });
  for (const [i, t] of data.tasks.entries()) await invoke(page, 'tasks.update', { id: t.id, maxQp: [40, 24, 32, 24][i] });
  data = await invoke<Lite>(page, 'exams.get', { id: examId });
  const pts = [[10, 6, 8, 5], [7, 4, 6.5, 3], [9.5, 6, 7, 6], [4, 2, 3, 1.5], [8, 5, 5.5, 4], [10, 5.5, 8, 6], [6, 3, 4, 2], [3, 1, 2, 0]];
  const changes = data.students.flatMap((s, r) => data.tasks.map((t, c) => ({ taskId: t.id, studentId: s.id, qp: (pts[r] as number[])[c]! * 4 })));
  await invoke(page, 'scores.set', { examId, changes });
  await invoke(page, 'errors.set', { examId, changes: data.students.map((s, r) => ({ studentId: s.id, halfErrors: [1, 7, 4, 15, 9, 0, 22, 30][r] })) });

  const outDir = path.join(ROOT, 'test-results', 'pdf');
  fs.mkdirSync(outDir, { recursive: true });
  for (const mode of ['exam', 'spiegel', 'key'] as const) {
    const file = path.join(outDir, `error-grading-${mode}.pdf`);
    await mockSaveDialog(app, file);
    expect(await invoke<string | null>(page, 'output.pdf', { examId, mode })).toBe(file);
    const pdf = fs.readFileSync(file);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }

  // total only: no task columns, the points are entered as one number per student
  const totalId = await invoke<number>(page, 'exams.create', {
    courseId, kind: 'Test', number: '', examDate: '2025-12-01', teacher: '',
    stepQp: 2, taskCount: 0, copyFromExamId: null, categoryId: null, entryMode: 'points', errorGrading: true, perTask: false, totalMaxQp: 120,
  });
  const total = await invoke<Lite>(page, 'exams.get', { id: totalId });
  expect(total.tasks).toHaveLength(1);
  const t0 = total.tasks[0]!.id;
  await invoke(page, 'scores.set', { examId: totalId, changes: total.students.map((s, r) => ({ taskId: t0, studentId: s.id, qp: [112, 90, 100, 30, 76, 120, 50, 18][r]! })) });
  await invoke(page, 'errors.set', { examId: totalId, changes: total.students.map((s, r) => ({ studentId: s.id, halfErrors: [0, 3, 5, 20, 8, 1, 12, 28][r] })) });
  const file = path.join(outDir, 'total-only-exam.pdf');
  await mockSaveDialog(app, file);
  expect(await invoke<string | null>(page, 'output.pdf', { examId: totalId, mode: 'exam' })).toBe(file);
  expect(await netLog(app)).toEqual([]);
  await app.close();
});
