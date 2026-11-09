/** A subject of a class: grade overview, exams and members, weighting. */
import { useCallback, useEffect, useState } from 'react';
import { examShortTitle } from '@shared/labels';
import type { Student } from '@shared/types';
import { call } from '../api';
import { Button, uiStyles as u } from '../components/ui';
import { CourseDialog } from '../dialogs/CourseDialog';
import { CourseGrading } from './CourseGrading';
import { CourseOverview } from './CourseOverview';
import { bumpVersion, navigate, openExam, refreshTree, saveOk, useStore, type CourseTab } from '../store';
import s from './shell.module.css';
import c from './classView.module.css';

export function CourseView({ courseId, initialTab }: { courseId: number; initialTab?: CourseTab }): React.JSX.Element {
  const tree = useStore((st) => st.tree);
  const version = useStore((st) => st.version);
  const cls = tree.find((x) => x.courses.some((k) => k.id === courseId));
  const course = cls?.courses.find((k) => k.id === courseId);
  const classId = cls?.id;
  const [students, setStudents] = useState<Student[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [tab, setTab] = useState<CourseTab>(() => initialTab ?? ((course?.exams.length ?? 0) > 0 ? 'overview' : 'exams'));

  const load = useCallback(async () => {
    if (classId !== undefined) setStudents(await call('students.list', { classId }));
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  if (!cls || !course) return <div className={s.page} />;

  const members = new Set(course.memberIds);
  const setMember = async (st: Student, member: boolean): Promise<void> => {
    if (await saveOk(call('courses.setMember', { id: courseId, studentId: st.id, member }))) {
      await refreshTree();
      bumpVersion();
    }
  };

  return (
    <div className={s.page}>
      <div className={c.wrap}>
        <div className={c.head}>
          <div>
            <h1 className={s.viewTitle}>
              {course.subject} · Klasse {cls.name}
            </h1>
            <div className={s.muted}>
              Schuljahr {cls.schoolYear} · {members.size} von {students.length} Schüler/innen
            </div>
          </div>
          <div className={s.spacer} />
          <Button icon="edit" onClick={() => setRenaming(true)}>
            Umbenennen…
          </Button>
          <Button icon="delete" onClick={() => useStore.setState({ dialog: { kind: 'deleteCourse', courseId } })}>
            Fach löschen…
          </Button>
        </div>

        <div className={c.tabs} role="tablist" aria-label="Ansicht">
          {(
            [
              ['overview', 'Notenübersicht'],
              ['exams', 'Prüfungen und Schüler/innen'],
              ['grading', 'Gewichtung'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${c.tab} ${tab === k ? c.tabActive : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <CourseOverview courseId={courseId} />}
        {tab === 'grading' && <CourseGrading courseId={courseId} />}
        {tab === 'exams' && (
          <div className={c.columns}>
            <section className={`${s.section} ${c.students}`}>
              <div className={s.sectionHead}>
                <h2 className={s.sectionTitle}>Schüler/innen im Fach</h2>
                <Button onClick={() => navigate({ view: 'class', classId: cls.id })}>Namen bearbeiten…</Button>
              </div>
              <div className={c.empty}>
                <span className={s.muted}>
                  {students.length === 0
                    ? 'Die Klasse hat noch keine Schüler/innen. Tragen Sie die Namen in der Klasse ein.'
                    : 'Nur angehakte Schüler/innen stehen in den Prüfungen und in der Notenübersicht dieses Fachs, z. B. bei Wahlfächern oder geteilten Gruppen.'}
                </span>
              </div>
              <div className={c.tableWrap}>
                <table className={u.table} aria-label="Schüler/innen im Fach">
                  <thead>
                    <tr>
                      <th className={c.colCheck}>
                        <span className="sr-only">Nimmt teil</span>
                      </th>
                      <th className={`num ${c.colNr}`}>Nr</th>
                      <th>Name</th>
                      <th>Vorname</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((st, i) => (
                      <tr key={st.id} className={members.has(st.id) ? undefined : c.outRow}>
                        <td className={c.colCheck}>
                          <input
                            type="checkbox"
                            aria-label={`${st.lastName}, ${st.firstName} nimmt am Fach teil`}
                            checked={members.has(st.id)}
                            onChange={(e) => void setMember(st, e.target.checked)}
                          />
                        </td>
                        <td className={`num ${c.colNr}`}>{i + 1}</td>
                        <td>{st.lastName}</td>
                        <td>{st.firstName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${s.section} ${c.exams}`}>
              <div className={s.sectionHead}>
                <h2 className={s.sectionTitle}>Prüfungen</h2>
                <Button icon="add" onClick={() => useStore.setState({ dialog: { kind: 'newExam', courseId } })}>
                  Neue Prüfung
                </Button>
              </div>
              {course.exams.length === 0 ? (
                <div className={c.empty}>
                  <span className={s.muted}>Noch keine Prüfungen.</span>
                </div>
              ) : (
                <ul className={c.examList} aria-label="Prüfungen des Fachs">
                  {course.exams.map((e) => (
                    <li key={e.id}>
                      <button type="button" className={c.examItem} onClick={() => void openExam(e.id)}>
                        {examShortTitle(e)}
                        <span className={c.examCat}>{course.categories.find((k) => k.id === e.categoryId)?.name ?? ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {renaming && <CourseDialog mode="rename" classId={cls.id} source={course} onClose={() => setRenaming(false)} />}
    </div>
  );
}
