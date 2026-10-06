'use client';

import { useEffect } from 'react';

// Dentro de la app de Android: el botón "atrás" del celular vuelve a la pantalla anterior del CRM
// (y recién en el inicio cierra la app), como cualquier app. En el navegador no hace nada.
export default function PuenteApp() {
  useEffect(() => {
    const App = window.Capacitor?.Plugins?.App;
    if (!App?.addListener) return;
    let quitar;
    Promise.resolve(App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) window.history.back();
      else App.exitApp();
    })).then((l) => { quitar = l; });
    return () => quitar?.remove?.();
  }, []);
  return null;
}
