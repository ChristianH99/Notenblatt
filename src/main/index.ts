/**
 * Notenblatt main process: lifecycle, hardening, window management.
 */
import path from 'node:path';
import { app, BrowserWindow, dialog, Menu, screen, session, type Rectangle } from 'electron';
import { DbManager } from './db/manager';
import { readConfig, writeConfig } from './storage/config';
import { registerIpc } from './ipc/handlers';
import { log } from './log';

const PARTITION = 'notenblatt'; // no "persist:" prefix → in-memory session, nothing cached on disk
const MIN_W = 1024;
const MIN_H = 680;
const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;

// ───── data location (must be set before anything touches userData) ─────
app.setName('Notenblatt');
const userData = process.env.NOTENBLATT_USER_DATA || path.join(app.getPath('appData'), 'Notenblatt');
app.setPath('userData', userData);
app.setPath('sessionData', path.join(userData, 'session'));

// No crash reporter upload, no telemetry, no auto-updater: none are started.
app.commandLine.appendSwitch('disable-features', 'Translate,MediaRouter,OptimizationHints,AutofillServerCommunication');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('no-pings');

/** URLs requested by any renderer that are not local (for the E2E network guard). */
const netLog: string[] = [];
(globalThis as unknown as { __nbNetLog: string[] }).__nbNetLog = netLog;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  const mgr = new DbManager(userData);

  const isLocal = (url: string): boolean => {
    if (/^(file|devtools|data|blob|chrome-extension):/i.test(url)) return true;
    if (isDev && /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) return true;
    return false;
  };

  const hardenSession = (s: Electron.Session): void => {
    s.webRequest.onBeforeRequest((details, cb) => {
      if (isLocal(details.url)) return cb({});
      netLog.push(details.url);
      log('warn', 'NET_BLOCKED', {});
      cb({ cancel: true });
    });
    s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    s.setPermissionCheckHandler(() => false);
    s.setSpellCheckerEnabled(false);
  };

  const loadRenderer = (win: BrowserWindow, hash: string): void => {
    if (isDev && process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`);
    } else {
      void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash });
    }
  };

  const createWindow = (hash: string, show: boolean, bounds?: Partial<Rectangle>): BrowserWindow => {
    const win = new BrowserWindow({
      ...bounds,
      width: bounds?.width ?? 1280,
      height: bounds?.height ?? 800,
      minWidth: MIN_W,
      minHeight: MIN_H,
      show,
      title: 'Notenblatt',
      backgroundColor: '#F3F4F6',
      autoHideMenuBar: true,
      // The packaged exe carries the icon; in development use the PNG from build/.
      ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../../build/icon.png') }),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        partition: PARTITION,
        devTools: isDev || !!process.env.NOTENBLATT_E2E,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('will-redirect', (e) => e.preventDefault());
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    loadRenderer(win, hash);
    return win;
  };

  const restoreBounds = (): { bounds: Partial<Rectangle>; maximized: boolean } => {
    try {
      // Window state lives in config.json: it is needed before an encrypted or remote DB is open.
      const s = readConfig(userData).window;
      if (!s) return { bounds: {}, maximized: false };
      const b = { x: s.x, y: s.y, width: Math.max(MIN_W, s.width), height: Math.max(MIN_H, s.height) };
      const area = screen.getDisplayMatching(b).workArea;
      const visible = b.x < area.x + area.width - 50 && b.y < area.y + area.height - 50 && b.x + b.width > area.x + 50 && b.y >= area.y - 10;
      return { bounds: visible ? b : { width: b.width, height: b.height }, maximized: !!s.maximized };
    } catch {
      return { bounds: {}, maximized: false };
    }
  };

  const saveBounds = (win: BrowserWindow): void => {
    try {
      const b = win.getNormalBounds();
      writeConfig(userData, { ...readConfig(userData), window: { ...b, maximized: win.isMaximized() } });
    } catch {
      // ignore
    }
  };

  const openMain = (): void => {
    const { bounds, maximized } = restoreBounds();
    mainWindow = createWindow('', false, bounds);
    mainWindow.once('ready-to-show', () => {
      if (!mainWindow) return;
      if (maximized) mainWindow.maximize();
      if (!process.env.NOTENBLATT_E2E_HIDDEN) mainWindow.show();
    });
    mainWindow.on('close', (e) => {
      if (!mainWindow) return;
      saveBounds(mainWindow);
      // Snapshot mode: make sure nothing is lost when the shared folder was unreachable.
      while (mgr.hasUnsavedChanges) {
        try {
          mgr.persist();
        } catch {
          const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            title: 'Notenblatt',
            message: 'Einige Änderungen konnten nicht gespeichert werden.',
            detail: `Der Speicherort ist nicht erreichbar:\n${mgr.dir}\n\nStellen Sie die Verbindung her und versuchen Sie es erneut. Beim Beenden gehen die ungespeicherten Änderungen verloren.`,
            buttons: ['Erneut versuchen', 'Ohne Speichern beenden', 'Abbrechen'],
            defaultId: 0,
            cancelId: 2,
            noLink: true,
          });
          if (choice === 1) break;
          if (choice === 2) {
            e.preventDefault();
            return;
          }
        }
      }
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (ev) => ev.preventDefault());
  });

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    hardenSession(session.defaultSession);
    hardenSession(session.fromPartition(PARTITION));
    const st = mgr.start();
    if (mgr.corrupt) log('warn', 'DB_CORRUPT_RENAMED', {});
    if (st.state !== 'ready') log('info', 'DB_NOT_READY', { state: st.state });
    registerIpc({
      mgr,
      mainWindow: () => mainWindow,
      print: { createWindow: (hash, show) => createWindow(hash, show, { width: 1123, height: 794 }) },
      partition: PARTITION,
    });
    openMain();
  });

  app.on('window-all-closed', () => {
    mgr.shutdown(true);
    app.quit();
  });

  // app.quit() (e.g. Windows logoff) skips "window-all-closed": still save and release the lock.
  app.on('will-quit', () => {
    mgr.shutdown(true);
  });
}
