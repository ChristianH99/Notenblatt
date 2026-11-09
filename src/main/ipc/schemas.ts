/** zod schemas for every IPC payload. Main never trusts the renderer. */
import { z } from 'zod';
import type { ApiMethod } from '@shared/api';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = (max = 200): z.ZodString => z.string().max(max);
const qp = z.number().int().min(0).max(4_000_000);
const step = z.union([z.literal(1), z.literal(2), z.literal(4)]);
const scheme = z.enum(['NP15', 'LIN6']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const none = z.undefined().or(z.null()).optional();
const mode = z.enum(['exam', 'spiegel', 'key']);
const name = z.object({ lastName: text(), firstName: text() }).strict();
const password = z.string().min(8).max(1024);
const anyPassword = z.string().min(1).max(1024);
const entryMode = z.enum(['points', 'grade']);
const weightC = z.number().int().min(1).max(10000);
const dir = z.string().min(1).max(1000);

/** Settings value for 'categoryTemplate' (JSON string). */
export const CATEGORY_TEMPLATE = z
  .array(z.object({ name: z.string().trim().min(1).max(40), weightC, defaultMode: entryMode }).strict())
  .min(1)
  .max(20);

export const SCHEMAS: Record<ApiMethod, z.ZodType> = {
  'app.startupInfo': none,
  'app.openDataFolder': none,
  'app.wipeAll': none,
  'settings.get': none,
  'settings.set': z
    .object({
      key: z.enum([
        'teacher',
        'school',
        'enterDirection',
        'touchMode',
        'retentionMonths',
        'showGradeEquivalent',
        'lastExamId',
        'defaultGradingSystem',
        'categoryTemplate',
        'defaultRounding',
        'defaultRoundingDigits',
      ]),
      value: z.string().max(5000).nullable(),
    })
    .strict(),
  'classes.tree': none,
  'classes.create': z.object({ name: text(100), schoolYear: text(20) }).strict(),
  'classes.update': z.object({ id, name: text(100), schoolYear: text(20) }).strict(),
  'classes.copy': z.object({ id, name: text(100), schoolYear: text(20) }).strict(),
  'classes.deletionInfo': z.object({ id }).strict(),
  'classes.delete': z.object({ id }).strict(),
  'courses.create': z.object({ classId: id, subject: text(80) }).strict(),
  'courses.rename': z.object({ id, subject: text(80) }).strict(),
  'courses.deletionInfo': z.object({ id }).strict(),
  'courses.delete': z.object({ id }).strict(),
  'courses.setMember': z.object({ id, studentId: id, member: z.boolean() }).strict(),
  'courses.subjects': none,
  'courses.overview': z.object({ id }).strict(),
  'courses.updateGrading': z
    .object({
      id,
      gradingSystem: scheme.optional(),
      finalRounding: z.enum(['none', 'half_up', 'half_favor']).optional(),
      finalDigits: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .strict(),
  'categories.add': z.object({ courseId: id, name: text(40), weightC, defaultMode: entryMode }).strict(),
  'categories.update': z.object({ id, name: text(40).optional(), weightC: weightC.optional(), defaultMode: entryMode.optional() }).strict(),
  'categories.move': z.object({ id, position: z.number().int().min(0).max(100) }).strict(),
  'categories.delete': z.object({ id }).strict(),
  'marks.set': z
    .object({
      examId: id,
      changes: z.array(z.object({ studentId: id, value: z.number().int().min(0).max(60).nullable() }).strict()).min(1).max(5000),
    })
    .strict(),
  'totals.set': z
    .object({
      examId: id,
      changes: z.array(z.object({ studentId: id, qp: qp.nullable() }).strict()).min(1).max(5000),
    })
    .strict(),
  'output.overviewCsv': z.object({ courseId: id }).strict(),
  'storage.info': none,
  'storage.chooseDir': none,
  'storage.relocate': z.object({ dir: dir.nullable(), overwrite: z.boolean() }).strict(),
  'storage.openOther': z.object({ dir: dir.nullable() }).strict(),
  'storage.enableEncryption': z.object({ password }).strict(),
  'storage.changePassword': z.object({ oldPassword: anyPassword, newPassword: password }).strict(),
  'storage.disableEncryption': z.object({ password: anyPassword }).strict(),
  'storage.unlock': z.object({ password: anyPassword }).strict(),
  'storage.retry': none,
  'storage.forceOpen': none,
  'storage.useDefault': none,
  'storage.createHere': none,
  'students.list': z.object({ classId: id }).strict(),
  'students.add': z.object({ classId: id, names: z.array(name).min(1).max(1000) }).strict(),
  'students.update': z.object({ id, lastName: text(), firstName: text() }).strict(),
  'students.deletionInfo': z.object({ ids: z.array(id).min(1).max(1000) }).strict(),
  'students.delete': z.object({ ids: z.array(id).min(1).max(1000) }).strict(),
  'exams.get': z.object({ id }).strict(),
  'exams.create': z
    .object({
      courseId: id,
      kind: text(60),
      number: text(20),
      examDate: isoDate,
      teacher: text(100),
      stepQp: step,
      taskCount: z.number().int().min(0).max(200),
      copyFromExamId: id.nullable(),
      categoryId: id.nullable(),
      entryMode,
    })
    .strict(),
  'exams.update': z
    .object({
      id,
      patch: z
        .object({
          kind: text(60).optional(),
          number: text(20).optional(),
          examDate: isoDate.optional(),
          teacher: text(100).optional(),
          stepQp: step.optional(),
          notes: text(4000).optional(),
          categoryId: id.nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  'exams.duplicate': z.object({ id }).strict(),
  'exams.delete': z.object({ id }).strict(),
  'exams.all': none,
  'tasks.add': z.object({ examId: id, position: z.number().int().min(0).max(1000) }).strict(),
  'tasks.update': z.object({ id, label: text(20).optional(), maxQp: qp.optional() }).strict(),
  'tasks.move': z.object({ id, position: z.number().int().min(0).max(1000) }).strict(),
  'tasks.delete': z.object({ id }).strict(),
  'tasks.snapshot': z.object({ id }).strict(),
  'tasks.restore': z
    .object({
      examId: id,
      position: z.number().int().min(0).max(1000),
      label: text(20),
      maxQp: qp,
      scores: z.array(z.object({ studentId: id, qp }).strict()).max(5000),
    })
    .strict(),
  'scores.set': z
    .object({
      examId: id,
      changes: z.array(z.object({ taskId: id, studentId: id, qp: qp.nullable() }).strict()).min(1).max(20000),
    })
    .strict(),
  'participation.set': z.object({ examId: id, studentId: id, status: z.enum(['present', 'absent']) }).strict(),
  'output.print': z.object({ examId: id, mode }).strict(),
  'output.pdf': z.object({ examId: id, mode }).strict(),
  'output.csv': z.object({ examId: id }).strict(),
  'print.ready': none,
  'backup.export': z.object({ password }).strict(),
  'backup.pick': none,
  'backup.inspect': z.object({ password: z.string().min(1).max(1024) }).strict(),
  'backup.import': none,
  'backup.cancel': none,
  'clipboard.read': none,
  'clipboard.write': z.object({ text: z.string().max(5_000_000) }).strict(),
};
