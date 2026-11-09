import add from '../icons/add.svg?raw';
import arrowDown from '../icons/arrow_down.svg?raw';
import arrowDownload from '../icons/arrow_download.svg?raw';
import arrowRedo from '../icons/arrow_redo.svg?raw';
import arrowRight from '../icons/arrow_right.svg?raw';
import arrowUndo from '../icons/arrow_undo.svg?raw';
import arrowUpload from '../icons/arrow_upload.svg?raw';
import chevronDown from '../icons/chevron_down.svg?raw';
import chevronRight from '../icons/chevron_right.svg?raw';
import clipboardPaste from '../icons/clipboard_paste.svg?raw';
import copy from '../icons/copy.svg?raw';
import del from '../icons/delete.svg?raw';
import dismiss from '../icons/dismiss.svg?raw';
import documentPdf from '../icons/document_pdf.svg?raw';
import documentText from '../icons/document_text.svg?raw';
import edit from '../icons/edit.svg?raw';
import more from '../icons/more_horizontal.svg?raw';
import navigation from '../icons/navigation.svg?raw';
import panelRight from '../icons/panel_right.svg?raw';
import people from '../icons/people.svg?raw';
import personAdd from '../icons/person_add.svg?raw';
import personDelete from '../icons/person_delete.svg?raw';
import print from '../icons/print.svg?raw';
import question from '../icons/question_circle.svg?raw';
import settings from '../icons/settings.svg?raw';
import table from '../icons/table.svg?raw';
import warning from '../icons/warning.svg?raw';

const ICONS = {
  add,
  arrowDown,
  arrowDownload,
  arrowRedo,
  arrowRight,
  arrowUndo,
  arrowUpload,
  chevronDown,
  chevronRight,
  clipboardPaste,
  copy,
  delete: del,
  dismiss,
  documentPdf,
  documentText,
  edit,
  more,
  navigation,
  panelRight,
  people,
  personAdd,
  personDelete,
  print,
  question,
  settings,
  table,
  warning,
} as const;

export type IconName = keyof typeof ICONS;

const prepared = Object.fromEntries(
  Object.entries(ICONS).map(([k, svg]) => [k, svg.replace('<svg ', '<svg fill="currentColor" aria-hidden="true" focusable="false" ')]),
) as Record<IconName, string>;

export function Icon({ name, className }: { name: IconName; className?: string }): React.JSX.Element {
  return <span className={className} style={{ display: 'inline-flex', width: 20, height: 20, flex: 'none' }} dangerouslySetInnerHTML={{ __html: prepared[name] }} />;
}
