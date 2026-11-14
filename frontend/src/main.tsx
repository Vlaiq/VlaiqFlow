import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/fonts.css';
import './styles/index.css';
import { App } from './app/App';
import { AppBoundary } from './components/AppBoundary';
import { ThemeProvider } from './app/theme';
import { AppRouter } from './app/router';
import { registerPwa } from './app/pwa';

registerPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppBoundary>
        <AppRouter>
          <App />
        </AppRouter>
      </AppBoundary>
    </ThemeProvider>
  </StrictMode>,
);
