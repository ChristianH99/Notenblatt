import { useEffect } from 'react';
import { useStore } from '../store';
import { ClassDialog } from './ClassDialog';
import { CourseDialog } from './CourseDialog';
import { BackupExportDialog, BackupImportDialog, CorruptDialog, WipeDialog } from './DataDialogs';
import { DeleteClassDialog, DeleteCourseDialog, DeleteExamDialog, DeleteStudentsDialog } from './DeleteDialogs';
import { FullKeyDialog } from './FullKeyDialog';
import { NewExamDialog } from './NewExamDialog';
import { OnboardingDialog } from './OnboardingDialog';
import { ChangePasswordDialog, DecryptDialog, EncryptDialog, LocationDialog } from './StorageDialogs';
import { UpdateDialog } from './UpdateDialog';

export function DialogHost(): React.JSX.Element | null {
  const d = useStore((s) => s.dialog);
  const pendingUpdate = useStore((s) => s.pendingUpdate);
  const close = (): void => useStore.setState({ dialog: null });
  // An update found on start waits until the dialog in front of it (e.g. the tour) is closed.
  useEffect(() => {
    if (!d && pendingUpdate) useStore.setState({ dialog: { kind: 'update', offer: pendingUpdate }, pendingUpdate: null });
  }, [d, pendingUpdate]);
  if (!d) return null;
  switch (d.kind) {
    case 'newClass':
      return <ClassDialog mode="create" onClose={close} />;
    case 'newCourse':
      return <CourseDialog mode="create" classId={d.classId} onClose={close} />;
    case 'newExam':
      return <NewExamDialog courseId={d.courseId} categoryId={d.categoryId ?? null} onClose={close} />;
    case 'corrupt':
      return <CorruptDialog renamedTo={d.renamedTo} onClose={close} />;
    case 'backupExport':
      return <BackupExportDialog onClose={close} />;
    case 'backupImport':
      return <BackupImportDialog onClose={close} />;
    case 'wipe':
      return <WipeDialog onClose={close} />;
    case 'deleteClass':
      return <DeleteClassDialog classId={d.classId} onClose={close} />;
    case 'deleteCourse':
      return <DeleteCourseDialog courseId={d.courseId} onClose={close} />;
    case 'deleteExam':
      return <DeleteExamDialog examId={d.examId} onClose={close} />;
    case 'deleteStudents':
      return <DeleteStudentsDialog ids={d.ids} onClose={close} />;
    case 'fullKey':
      return <FullKeyDialog onClose={close} />;
    case 'storageLocation':
      return <LocationDialog onClose={close} />;
    case 'encrypt':
      return <EncryptDialog onClose={close} />;
    case 'changePassword':
      return <ChangePasswordDialog onClose={close} />;
    case 'decrypt':
      return <DecryptDialog onClose={close} />;
    case 'onboarding':
      return <OnboardingDialog onClose={close} />;
    case 'update':
      return <UpdateDialog offer={d.offer} onClose={close} />;
  }
}
