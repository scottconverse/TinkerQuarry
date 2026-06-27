import ReactDOM from 'react-dom/client';
import App from '@ui/App';
import { ErrorBoundary } from '@ui/components/ErrorBoundary';
import { ThemeProvider } from '@ui/contexts/ThemeContext';
import { parseShareContext } from '@ui/services/shareRouting';
import { initFormatter } from '@ui/utils/formatter';
import { initializePlatform } from '@ui/platform';
import '@ui/index.css';

const initialShareContext = parseShareContext(window.location.pathname, window.location.search);
if (initialShareContext) {
  window.__SHARE_CONTEXT = initialShareContext;
}
window.__SHARE_API_BASE = import.meta.env.VITE_SHARE_API_URL || '';
window.__SHARE_ENABLED =
  Boolean(window.__SHARE_API_BASE) &&
  (import.meta.env.PROD || import.meta.env.VITE_ENABLE_PROD_SHARE_DEV === 'true');

// Prevent accidental tab close when there are unsaved changes.
// We import the store module at the top level (it's a singleton) and read
// state in the beforeunload handler. Registered here rather than in a React
// effect to guarantee it's never missed due to platform bridge timing.
import { getProjectState } from '@ui/stores/projectStore';

window.addEventListener('beforeunload', (e) => {
  try {
    const files = getProjectState().files;
    const anyDirty = Object.values(files).some((f) => f.content !== f.savedContent);
    if (anyDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  } catch {
    // Store not initialized yet — nothing to protect
  }
});

if (window.__UNSUPPORTED_BROWSER) {
  // eslint-disable-next-line no-console
  console.warn('[main] Browser unsupported — skipping app render');
} else {
  initFormatter().catch((error) => {
    console.error('[main] Failed to initialize formatter:', error);
  });

  const root = ReactDOM.createRoot(document.getElementById('root')!);

  const renderApp = () =>
    root.render(
      <ThemeProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    );

  renderApp();

  initializePlatform().catch((error) => {
    console.error('[main] Failed to initialize platform:', error);
  });
}
