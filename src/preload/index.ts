/**
 * Sandboxed preload: exposes a minimal, typed bridge. The renderer never sees
 * ipcRenderer itself; every payload is validated again in main.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Bridge } from '../shared/api';

const bridge: Bridge = {
  invoke: (method, arg) => ipcRenderer.invoke('api', method, arg),
  on: (event, fn) => {
    const listener = (_e: IpcRendererEvent): void => fn();
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
};

contextBridge.exposeInMainWorld('notenblatt', bridge);
