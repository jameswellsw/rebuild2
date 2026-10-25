import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ProfileProvider } from './lib/profile';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import './styles.css';

// Vite's BASE_URL is '/<repo>/' for subpath hosting (GitHub Pages) and '/' at the root.
const base = import.meta.env.BASE_URL;

const root = createRoot(document.getElementById('root')!);
root.render(
  <ThemeProvider>
    <ProfileProvider>
      <ToastProvider>
        <BrowserRouter basename={base.replace(/\/$/, '') || undefined}>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ProfileProvider>
  </ThemeProvider>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      // Offline mode is a progressive enhancement; a failed registration does
      // not prevent online play.
    });
  });
}
