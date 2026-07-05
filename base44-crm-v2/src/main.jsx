/**
 * main — the React entry point. Mounts <App/> into #root and pulls in the global
 * stylesheet (Tailwind + theme tokens). index.css is provided by the shared sync;
 * this file only imports it.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import App from '@/App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
