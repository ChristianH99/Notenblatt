import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { PrintMode } from '@shared/types';
import './styles/global.css';
import { PrintView } from './print/PrintView';
import { init, useStore } from './store';
import { Shell } from './views/Shell';
import { StartupGate } from './views/StartupGate';

function App(): React.JSX.Element | null {
  const ready = useStore((s) => s.ready);
  const gate = useStore((s) => s.startup?.storage.state !== 'ready');
  useEffect(() => {
    void init();
  }, []);
  if (!ready) return null;
  return gate ? <StartupGate /> : <Shell />;
}

const root = createRoot(document.getElementById('root') as HTMLElement);
const m = /^#print\/(exam|spiegel|key)\/(\d+)$/.exec(window.location.hash);
if (m) {
  document.title = 'Notenblatt – Druck';
  // Paper is white: the app's window colour must not reach the printout or PDF.
  document.documentElement.classList.add('print-page');
  root.render(<PrintView mode={m[1] as PrintMode} examId={Number(m[2])} />);
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
