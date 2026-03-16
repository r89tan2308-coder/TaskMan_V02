import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initPwa } from './pwa';
import './index.css';

initPwa();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
