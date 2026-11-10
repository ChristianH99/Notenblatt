/**
 * Sandboxed preload: exposes a minimal, typed bridge. The renderer never sees
 * ipcRenderer itself; every payload is validated again in main.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { BRIDGE_EVENTS, type Bridge, type BridgeEvents } from '../shared/api';

const bridge: Bridge = {
  invoke: (method, arg) => ipcRenderer.invoke('api', method, arg),
  on: (event, fn) => {
    if (!BRIDGE_EVENTS.includes(event)) throw new Error('unknown event');
    const listener = (_e: IpcRendererEvent, payload: BridgeEvents[typeof event]): void => fn(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
};

contextBridge.exposeInMainWorld('notenblatt', bridge);
