import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted: a font CDN would see every visitor, which a no-server tool should not allow.
import '@fontsource-variable/inter';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
