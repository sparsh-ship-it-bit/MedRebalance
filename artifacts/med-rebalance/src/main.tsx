import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('MedRebalance: root element was not found.');
}

const root = createRoot(rootElement);

function showStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  root.render(
    <div style={{ minHeight: '100vh', padding: '32px', display: 'grid', placeItems: 'center', background: '#f7fafc', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: 'min(680px, 100%)', padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 8px 30px rgba(31,56,74,.08)' }}>
        <h1 style={{ margin: '0 0 10px', color: '#1e3142', fontSize: '24px' }}>MedRebalance could not start</h1>
        <p style={{ margin: '0 0 14px', color: '#52687a' }}>The server is running, but the browser could not load the application.</p>
        <pre style={{ margin: 0, padding: '14px', overflowX: 'auto', whiteSpace: 'pre-wrap', background: '#f7fafc', borderRadius: '10px', color: '#7f1d1d' }}>{message}</pre>
      </div>
    </div>,
  );
}

// Import App after the root is mounted so module/startup failures become a
// visible diagnostic instead of an unexplained white screen.
void import('./App.tsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  })
  .catch(showStartupError);
