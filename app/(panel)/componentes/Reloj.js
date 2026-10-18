'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const Contexto = createContext(null);

/**
 * Reloj compartido del panel, para los textos que dependen de la hora: "Espera 5 min", "Vencido hace 2 h",
 * "quedan 3 h", "IA escribiendo…".
 * Arranca con la hora en que el servidor dibujó la página (inicial). Así el navegador, al hidratar, escribe lo mismo
 * que llegó dibujado; si usara su propia hora, un segundo de diferencia cambia "5 min" por "6 min", React descarta lo
 * del servidor y redibuja todo (error #418 en cada carga; 17-oct-2026).
 * Avanza solo una vez por minuto. El primer avance espera un minuto entero a propósito: para entonces ya se hidrató
 * todo lo que llegó por partes (la lista de chats llega después del resto).
 */
export function Reloj({ inicial, children }) {
  const [ahora, setAhora] = useState(inicial);
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(reloj);
  }, []);
  return <Contexto.Provider value={ahora}>{children}</Contexto.Provider>;
}

/** La hora para comparar (milisegundos). Fuera del panel (vista previa) es la de este instante. */
export function useAhora() {
  return useContext(Contexto) ?? Date.now();
}
