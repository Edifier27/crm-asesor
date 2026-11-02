'use client';

import { useState } from 'react';

// CUIL a partir del DNI y el sexo, igual que en cotizadorsmg.com.ar (Darío, 2-nov-2026). Se muestra con
// guiones y "Copiar" lo copia sin guiones (así se pega en los formularios de alta).
/** "20-12345678-6" o null si el DNI no da (menos de 6 dígitos). */
export function calcularCuil(dni, sexo) {
  const num = parseInt(String(dni).replace(/\D/g, ''), 10);
  if (!num || String(num).length < 6 || String(num).length > 8) return null;
  const dniStr = String(num).padStart(8, '0');
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const verificador = (prefijo) => {
    const suma = `${prefijo}${dniStr}`.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const v = 11 - (suma % 11);
    return v === 11 ? 0 : v;
  };
  let prefijo = sexo === 'F' ? 27 : 20;
  let v = verificador(prefijo);
  if (v === 10) { prefijo = 23; v = verificador(23); }
  return `${prefijo}-${dniStr}-${v}`;
}

export default function CalculadoraCuil() {
  const [dni, setDni] = useState('');
  const [sexo, setSexo] = useState('M');
  const [copiado, setCopiado] = useState(false);
  const cuil = calcularCuil(dni, sexo);
  const digitos = dni.replace(/\D/g, '');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cuil.replace(/-/g, ''));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles: queda a la vista para copiar a mano */ }
  }

  return (
    <section className="tarjeta cuil">
      <h2>Consultar CUIL</h2>
      <div className="cuil-fila">
        <label className="campo"><span>DNI</span>
          <input inputMode="numeric" value={dni} onChange={(e) => { setDni(e.target.value); setCopiado(false); }} placeholder="12345678" aria-label="DNI" /></label>
        <div className="campo"><span>Sexo</span>
          <div className="cuil-sexo" role="group" aria-label="Sexo">
            {[['M', 'Masculino'], ['F', 'Femenino']].map(([v, t]) => (
              <button key={v} type="button" className={sexo === v ? 'boton-primario' : 'boton-secundario'} aria-pressed={sexo === v} onClick={() => { setSexo(v); setCopiado(false); }}>{t}</button>
            ))}
          </div>
        </div>
        <div className="imc-resultado cuil-resultado" aria-live="polite">
          <span>CUIL</span>
          <strong>{cuil ?? (digitos.length >= 1 ? 'DNI inválido' : '—')}</strong>
          {cuil && <button type="button" className="boton-secundario" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>}
        </div>
      </div>
    </section>
  );
}
