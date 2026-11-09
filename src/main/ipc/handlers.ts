import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron';
import type { ApiArg, ApiMethod, ApiMethods, ApiResponse } from '@shared/api';
import { examCsv } from '@shared/csv';
import { clean, exportBaseName } from '@shared/labels';
import { overviewCsv } from '@shared/overview';
import type { ExamData } from '@shared/types';
import { BackupError } from '../backup/crypto';
import { DbManager } from '../db/manager';
import { UserError } from '../db/repo';
import { markPrintReady, printToPdf, printWithDialog, type PrintDeps } from '../print/print';
import { log } from '../log';
import { CATEGORY_TEMPLATE, SCHEMAS } from './schemas';

export interface HandlerContext {
  mgr: DbManager;
  mainWindow: () => BrowserWindow | null;
  print: PrintDeps;
  partition: string;
}

type Impl = { [K in ApiMethod]: (arg: ApiArg<K>, e: IpcMainInvokeEvent) => ReturnType<ApiMethods[K]> | Promise<ReturnType<ApiMethods[K]>> };

const PRINT_SUFFIX: Record<string, string> = { exam: '', spiegel: '_Notenspiegel', key: '_Notenschluessel' };

/** Best effort: clear the clipboard if it contains any of the given strings. */
async function scrubClipboard(needles: string[]): Promise<void> {
  try {
    const t = await clipboard.readText();
    if (t && needles.some((n) => n.length > 0 && t.includes(n))) await clipboard.clear();
  } catch {
    // ignore
  }
}

export function createImpl(ctx: HandlerContext): Impl {
  const repo = (): ReturnType<DbManager['open']> => ctx.mgr.repo;
  const examData = (id: number): ExamData => repo().getExamData(id);
  let backupPath: string | null = null;
  let backupPayload: Buffer | null = null;

  const saveDialog = async (defaultName: string, filters: Electron.FileFilter[]): Promise<string | null> => {
    const win = ctx.mainWindow();
    const opts: Electron.SaveDialogOptions = { defaultPath: path.join(app.getPath('documents'), defaultName), filters };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    return r.canceled || !r.filePath ? null : r.filePath;
  };

  const clearBackupState = (): void => {
    backupPayload?.fill(0);
    backupPayload = null;
    backupPath = null;
  };

  return {
    'app.startupInfo': () => ({
      corrupt: ctx.mgr.corrupt,
      dataDir: ctx.mgr.dir,
      isEmpty: ctx.mgr.ready ? repo().isEmpty() : true,
      storage: ctx.mgr.status,
      info: ctx.mgr.info(),
    }),
    'app.openDataFolder': () => {
      void shell.openPath(ctx.mgr.dir);
    },
    'app.wipeAll': async () => {
      ctx.mgr.wipe();
      clearBackupState();
      for (const s of [session.defaultSession, session.fromPartition(ctx.partition)]) {
        await s.clearStorageData();
        await s.clearCache();
      }
      try {
        await clipboard.clear();
      } catch {
        // ignore
      }
    },
    'settings.get': () => repo().getSettings(),
    'settings.set': ({ key, value }) => {
      if (key === 'categoryTemplate') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(value ?? '');
        } catch {
          throw new UserError('Ungültige Vorlage.');
        }
        const r = CATEGORY_TEMPLATE.safeParse(parsed);
        if (!r.success) throw new UserError('Die Vorlage braucht mindestens eine Kategorie mit Namen und einer Gewichtung von 0,01 bis 100.');
        value = JSON.stringify(r.data);
      }
      if (key === 'defaultGradingSystem' && value !== 'NP15' && value !== 'LIN6') throw new UserError('Ungültiges Notensystem.');
      if (key === 'defaultRounding' && !['none', 'half_up', 'half_favor'].includes(value ?? '')) throw new UserError('Ungültige Rundung.');
      if (key === 'defaultRoundingDigits' && value !== '0' && value !== '1') throw new UserError('Ungültige Genauigkeit.');
      repo().setSetting(key, value);
      return repo().getSettings();
    },
    'classes.tree': () => repo().classTree(),
    'classes.create': ({ name, schoolYear }) => repo().createClass(name, schoolYear),
    'classes.update': ({ id, name, schoolYear }) => repo().updateClass(id, name, schoolYear),
    'classes.copy': ({ id, name, schoolYear }) => repo().copyClass(id, name, schoolYear),
    'classes.deletionInfo': ({ id }) => repo().classDeletionInfo(id),
    'classes.delete': async ({ id }) => {
      const names = repo().listStudents(id).map((s) => s.lastName);
      repo().deleteClass(id);
      repo().secureCleanup();
      await scrubClipboard(names);
      log('info', 'CLASS_DELETED', { id });
    },
    'courses.create': ({ classId, subject }) => repo().createCourse(classId, subject),
    'courses.rename': ({ id, subject }) => repo().renameCourse(id, subject),
    'courses.deletionInfo': ({ id }) => repo().courseDeletionInfo(id),
    'courses.delete': ({ id }) => {
      repo().deleteCourse(id);
      repo().secureCleanup();
      log('info', 'COURSE_DELETED', { id });
    },
    'courses.setMember': ({ id, studentId, member }) => {
      repo().setCourseMember(id, studentId, member);
      if (!member) repo().secureCleanup(false);
    },
    'courses.subjects': () => repo().subjects(),
    'courses.overview': ({ id }) => repo().overview(id),
    'courses.updateGrading': ({ id, gradingSystem, finalRounding, finalDigits }) => repo().updateCourseGrading(id, { gradingSystem, finalRounding, finalDigits }),
    'categories.add': ({ courseId, name, weightC, defaultMode }) => repo().addCategory(courseId, { name, weightC, defaultMode }),
    'categories.update': ({ id, name, weightC, defaultMode }) => repo().updateCategory(id, { name, weightC, defaultMode }),
    'categories.move': ({ id, position }) => repo().moveCategory(id, position),
    'categories.delete': ({ id }) => repo().deleteCategory(id),
    'marks.set': ({ examId, changes }) => {
      repo().setMarks(examId, changes);
      return examData(examId);
    },
    'totals.set': ({ examId, changes }) => {
      repo().setTotals(examId, changes);
      return examData(examId);
    },
    'output.overviewCsv': async ({ courseId }) => {
      const d = repo().overview(courseId);
      const safe = [clean(d.schoolClass.name), clean(d.course.subject)].filter((x) => x !== '').join('_');
      const file = await saveDialog(`Notenuebersicht_${safe}_${d.schoolClass.schoolYear.replace('/', '-')}.csv`, [{ name: 'CSV (Excel)', extensions: ['csv'] }]);
      if (!file) return null;
      fs.writeFileSync(file, overviewCsv(d), 'utf8');
      return file;
    },
    'storage.info': () => ctx.mgr.info(),
    'storage.chooseDir': async () => {
      const win = ctx.mainWindow();
      const opts: Electron.OpenDialogOptions = { title: 'Speicherort für die Datenbank wählen', properties: ['openDirectory', 'createDirectory'] };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      const d = r.canceled ? undefined : r.filePaths[0];
      if (!d) return null;
      return { dir: d, ...ctx.mgr.inspectDir(d) };
    },
    'storage.relocate': ({ dir, overwrite }) => ctx.mgr.relocate(dir, overwrite),
    'storage.openOther': ({ dir }) => ctx.mgr.openOther(dir),
    'storage.enableEncryption': ({ password }) => ctx.mgr.enableEncryption(password),
    'storage.changePassword': ({ oldPassword, newPassword }) => ctx.mgr.changePassword(oldPassword, newPassword),
    'storage.disableEncryption': ({ password }) => ctx.mgr.disableEncryption(password),
    'storage.unlock': ({ password }) => ctx.mgr.unlock(password),
    'storage.retry': () => ctx.mgr.start(),
    'storage.forceOpen': () => ctx.mgr.forceOpen(),
    'storage.useDefault': () => ctx.mgr.useDefault(),
    'storage.createHere': () => ctx.mgr.createHere(),
    'students.list': ({ classId }) => repo().listStudents(classId),
    'students.add': ({ classId, names }) => repo().addStudents(classId, names),
    'students.update': ({ id, lastName, firstName }) => repo().updateStudent(id, lastName, firstName),
    'students.deletionInfo': ({ ids }) => repo().studentDeletionInfo(ids),
    'students.delete': async ({ ids }) => {
      const names = repo().studentDeletionInfo(ids).students.map((s) => s.lastName);
      repo().deleteStudents(ids);
      repo().secureCleanup();
      await scrubClipboard(names);
      log('info', 'STUDENTS_DELETED', { count: ids.length });
    },
    'exams.get': ({ id }) => (repo().examExists(id) ? examData(id) : null),
    'exams.create': (input) => repo().createExam(input),
    'exams.update': ({ id, patch }) => {
      repo().updateExam(id, patch);
      return examData(id);
    },
    'exams.duplicate': ({ id }) => repo().duplicateExam(id),
    'exams.delete': ({ id }) => {
      repo().deleteExam(id);
      repo().secureCleanup();
      log('info', 'EXAM_DELETED', { id });
    },
    'exams.all': () => repo().allExams(),
    'tasks.add': ({ examId, position }) => {
      const taskId = repo().addTask(examId, position);
      return { data: examData(examId), taskId };
    },
    'tasks.update': ({ id, label, maxQp }) => examData(repo().updateTask(id, { label, maxQp })),
    'tasks.move': ({ id, position }) => examData(repo().moveTask(id, position)),
    'tasks.delete': ({ id }) => {
      const examId = repo().deleteTask(id);
      repo().secureCleanup(false);
      return examData(examId);
    },
    'tasks.snapshot': ({ id }) => repo().taskSnapshot(id),
    'tasks.restore': (snap) => {
      const taskId = repo().restoreTask(snap);
      return { data: examData(snap.examId), taskId };
    },
    'scores.set': ({ examId, changes }) => {
      repo().setScores(examId, changes);
      return examData(examId);
    },
    'participation.set': ({ examId, studentId, status }) => {
      repo().setParticipation(examId, studentId, status);
      return examData(examId);
    },
    'output.print': async ({ examId, mode }) => {
      examData(examId);
      await printWithDialog(ctx.print, examId, mode);
    },
    'output.pdf': async ({ examId, mode }) => {
      const d = examData(examId);
      const file = await saveDialog(`${exportBaseName(d.exam, d.schoolClass.name, PRINT_SUFFIX[mode])}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }]);
      if (!file) return null;
      const pdf = await printToPdf(ctx.print, examId, mode);
      fs.writeFileSync(file, pdf);
      return file;
    },
    'output.csv': async ({ examId }) => {
      const d = examData(examId);
      const file = await saveDialog(`${exportBaseName(d.exam, d.schoolClass.name)}.csv`, [{ name: 'CSV (Excel)', extensions: ['csv'] }]);
      if (!file) return null;
      fs.writeFileSync(file, examCsv(d), 'utf8');
      return file;
    },
    'print.ready': (_a, e) => markPrintReady(e.sender),
    'backup.export': async ({ password }) => {
      const stamp = new Date().toISOString().slice(0, 10);
      const file = await saveDialog(`Notenblatt-Datensicherung_${stamp}.notenblatt`, [{ name: 'Notenblatt-Datensicherung', extensions: ['notenblatt'] }]);
      if (!file) return null;
      fs.writeFileSync(file, await ctx.mgr.exportEncrypted(password));
      log('info', 'BACKUP_EXPORTED', {});
      return file;
    },
    'backup.pick': async () => {
      clearBackupState();
      const win = ctx.mainWindow();
      const opts: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'Notenblatt-Datensicherung', extensions: ['notenblatt'] }],
      };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      const f = r.canceled ? undefined : r.filePaths[0];
      if (!f) return null;
      backupPath = f;
      return path.basename(f);
    },
    'backup.inspect': async ({ password }) => {
      if (!backupPath) throw new UserError('Bitte zuerst eine Datei auswählen.');
      let buf: Buffer;
      try {
        buf = fs.readFileSync(backupPath);
      } catch {
        throw new UserError('Die Datei konnte nicht gelesen werden.');
      }
      try {
        const r = await DbManager.inspect(buf, password);
        backupPayload = r.payload;
        return r.counts;
      } catch (e) {
        if (e instanceof BackupError) throw new UserError(e.message);
        throw e;
      }
    },
    'backup.import': () => {
      if (!backupPayload) throw new UserError('Keine geprüfte Datensicherung vorhanden.');
      ctx.mgr.replaceWith(backupPayload);
      clearBackupState();
      log('info', 'BACKUP_IMPORTED', {});
    },
    'backup.cancel': () => clearBackupState(),
    'clipboard.read': async () => clipboard.readText(),
    'clipboard.write': async ({ text }) => clipboard.writeText(text),
  };
}

/** Methods that do not change the database (or save it themselves); all others are followed by mgr.persist(). */
const NO_PERSIST = new Set<string>([
  'app.startupInfo',
  'app.openDataFolder',
  'app.wipeAll',
  'settings.get',
  'classes.tree',
  'classes.deletionInfo',
  'courses.deletionInfo',
  'courses.subjects',
  'courses.overview',
  'students.list',
  'students.deletionInfo',
  'exams.get',
  'exams.all',
  'tasks.snapshot',
  'output.print',
  'output.pdf',
  'output.csv',
  'output.overviewCsv',
  'print.ready',
  'backup.export',
  'backup.pick',
  'backup.inspect',
  'backup.import',
  'backup.cancel',
  'clipboard.read',
  'clipboard.write',
]);

export function registerIpc(ctx: HandlerContext): void {
  const impl = createImpl(ctx) as unknown as Record<string, (arg: unknown, e: IpcMainInvokeEvent) => unknown>;
  ipcMain.handle('api', async (e, method: unknown, arg: unknown): Promise<ApiResponse<unknown>> => {
    if (typeof method !== 'string' || !(method in SCHEMAS)) {
      return { ok: false, error: 'Unbekannte Anfrage.', user: false };
    }
    const schema = SCHEMAS[method as ApiMethod];
    const parsed = schema.safeParse(arg);
    if (!parsed.success) {
      log('warn', 'IPC_INVALID_PAYLOAD', { method });
      return { ok: false, error: 'Ungültige Eingabe.', user: false };
    }
    try {
      const fn = impl[method] as (arg: unknown, e: IpcMainInvokeEvent) => unknown;
      const value = await fn(parsed.data, e);
      if (!NO_PERSIST.has(method) && !method.startsWith('storage.')) {
        try {
          ctx.mgr.persist();
        } catch (err) {
          // The change is kept in memory and retried; show it as a save error (not a short flash).
          return { ok: false, error: (err as Error).message, user: false };
        }
      }
      return { ok: true, value };
    } catch (err) {
      if (err instanceof UserError) return { ok: false, error: err.message, user: true };
      const code = (err as { code?: string }).code ?? (err as Error).name ?? 'ERROR';
      log('error', 'IPC_HANDLER_FAILED', { method, code });
      return { ok: false, error: `Interner Fehler (${code}).`, user: false };
    }
  });
}
