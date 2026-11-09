import { useStore } from '../store';
import { ClassDialog } from './ClassDialog';
import { BackupExportDialog, BackupImportDialog, CorruptDialog, WipeDialog } from './DataDialogs';
import { DeleteClassDialog, DeleteExamDialog, DeleteStudentsDialog } from './DeleteDialogs';
import { FullKeyDialog } from './FullKeyDialog';
import { NewExamDialog } from './NewExamDialog';
import { ChangePasswordDialog, DecryptDialog, EncryptDialog, LocationDialog } from './StorageDialogs';

export function DialogHost(): React.JSX.Element | null {
  const d = useStore((s) => s.dialog);
  const close = (): void => useStore.setState({ dialog: null });
  if (!d) return null;
  switch (d.kind) {
    case 'newClass':
      return <ClassDialog mode="create" onClose={close} />;
    case 'newExam':
      return <NewExamDialog classId={d.classId} categoryId={d.categoryId ?? null} onClose={close} />;
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
  }
}
