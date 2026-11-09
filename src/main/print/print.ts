/** Print and PDF output via a hidden window that renders the print route. */
import { BrowserWindow, type WebContents } from 'electron';

export interface PrintDeps {
  createWindow: (hash: string, show: boolean) => BrowserWindow;
}

const pending = new Map<number, () => void>();

/** Called when a print window reports that it finished rendering. */
export function markPrintReady(sender: WebContents): void {
  const fn = pending.get(sender.id);
  if (fn) {
    pending.delete(sender.id);
    fn();
  }
}

async function renderHidden(deps: PrintDeps, examId: number, mode: string): Promise<BrowserWindow> {
  const win = deps.createWindow(`print/${mode}/${examId}`, false);
  const id = win.webContents.id;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('PRINT_TIMEOUT'));
    }, 20000);
    pending.set(id, () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return win;
}

export async function printToPdf(deps: PrintDeps, examId: number, mode: string): Promise<Buffer> {
  const win = await renderHidden(deps, examId, mode);
  try {
    return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, landscape: true, pageSize: 'A4' });
  } finally {
    win.destroy();
  }
}

export async function printWithDialog(deps: PrintDeps, examId: number, mode: string): Promise<void> {
  const win = await renderHidden(deps, examId, mode);
  await new Promise<void>((resolve) => {
    win.webContents.print({ silent: false, printBackground: true, landscape: true }, () => resolve());
  });
  win.destroy();
}
