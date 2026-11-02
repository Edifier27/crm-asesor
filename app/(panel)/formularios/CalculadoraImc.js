'use client';

import { useState } from 'react';

// Calculadora de IMC para la declaración jurada (Darío, 2-nov-2026): peso y altura de cada integrante,
// el IMC al lado y una alerta si pasa de 34,5 o si es menor a 18,1. Solo calcula en pantalla: no guarda nada.
const TOPE_IMC = 34.5;
const PISO_IMC = 18.1; // Darío, 2-nov-2026: también alerta si es menor a 18,1
const coma = (n) => String(n).replace('.', ',');
const numero = (v) => Number(String(v).replace(',', '.'));

/** IMC con peso en kg y altura en cm o en metros (1,70 o 170). null si falta algo o no da. */
export function calcularImc(peso, altura) {
  const kg = numero(peso);
  let m = numero(altura);
  if (!(kg > 0) || !(m > 0)) return null;
  if (m > 3) m /= 100; // vino en centímetros
  const imc = kg / (m * m);
  return imc >= 8 && imc <= 120 ? imc : null;
}

const vacio = () => ({ id: crypto.randomUUID(), peso: '', altura: '' });

export default function CalculadoraImc() {
  const [filas, setFilas] = useState(() => [vacio()]);
  const cambiar = (id, campo, valor) => setFilas((l) => l.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));

  return (
    <section className="tarjeta imc">
      <h2>Calculadora de IMC</h2>
      <p className="selector-detalle">Peso en kilos y altura en centímetros (170) o metros (1,70). Con IMC mayor a {coma(TOPE_IMC)} o menor a {coma(PISO_IMC)} aparece una alerta.</p>
      <ul className="imc-filas">
        {filas.map((f, i) => {
          const imc = calcularImc(f.peso, f.altura);
          // Se compara el valor que se ve (un decimal): 34,45 se muestra 34,5 y no alerta; 34,55 → 34,6 sí
          const redondeado = imc === null ? null : Math.round(imc * 10) / 10;
          const alto = redondeado !== null && redondeado > TOPE_IMC;
          const bajo = redondeado !== null && redondeado < PISO_IMC;
          return (
            <li key={f.id} className="imc-fila">
              <span className="imc-quien">Integrante {i + 1}</span>
              <label className="campo"><span>Peso (kg)</span>
                <input inputMode="decimal" value={f.peso} onChange={(e) => cambiar(f.id, 'peso', e.target.value)} placeholder="80" aria-label={`Peso del integrante ${i + 1}`} /></label>
              <label className="campo"><span>Altura</span>
                <input inputMode="decimal" value={f.altura} onChange={(e) => cambiar(f.id, 'altura', e.target.value)} placeholder="170" aria-label={`Altura del integrante ${i + 1}`} /></label>
              <div className={`imc-resultado${alto || bajo ? ' imc-alto' : ''}`} aria-live="polite">
                <span>IMC</span>
                <strong>{redondeado === null ? '—' : redondeado.toFixed(1).replace('.', ',')}</strong>
                {alto && <em role="alert">⚠️ Supera {coma(TOPE_IMC)}</em>}
                {bajo && <em role="alert">⚠️ Menor a {coma(PISO_IMC)}</em>}
              </div>
              {filas.length > 1 && (
                <button type="button" className="boton-secundario imc-quitar" onClick={() => setFilas((l) => l.filter((x) => x.id !== f.id))} aria-label={`Quitar integrante ${i + 1}`}>✕</button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="boton-secundario imc-agregar" onClick={() => setFilas((l) => [...l, vacio()])}>+ Agregar integrante</button>
    </section>
  );
}
