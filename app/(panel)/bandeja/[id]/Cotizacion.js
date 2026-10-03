'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CAMPANIAS, DESCRIPCION_PLAN, ZONAS, ZONA_ROTULO, cotizar, miembrosDesdeRelevamiento, pesos } from '@/lib/cotizador';
import { enviarDesdeBandeja } from './acciones';

const grupoTexto = (miembros) => {
  const adultos = miembros.filter((m) => !m.esHijo).map((m) => m.edad);
  const hijos = miembros.filter((m) => m.esHijo).map((m) => m.edad);
  return [adultos.length ? `${adultos.length === 1 ? 'adulto' : 'adultos'} de ${adultos.join(' y ')}` : '', hijos.length ? `${hijos.length === 1 ? 'hijo' : 'hijos'} de ${hijos.join(', ')}` : '']
    .filter(Boolean).join(' + ');
};

export default function Cotizacion({ conversacionId, contacto, onContacto, lista }) {
  const supabase = createClient();
  const guardada = contacto.cotizacion ?? {};
  const [miembros, setMiembros] = useState(() => {
    const desde = miembrosDesdeRelevamiento(contacto.relevamiento?.integrantes);
    return desde.length ? desde : [{ edad: '', esHijo: false }];
  });
  const [zona, setZona] = useState(contacto.zona ?? 'AMBA');
  const [modalidad, setModalidad] = useState(guardada.modalidad ?? 'directo');
  const [campania, setCampania] = useState(guardada.campania ?? 'individual50');
  const [sueldos, setSueldos] = useState(guardada.sueldos ?? ['', '']);
  const [elegidos, setElegidos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [enviando, iniciar] = useTransition();
  const temporizador = useRef();

  const validos = miembros.filter((m) => m.edad !== '' && Number(m.edad) >= 0 && Number(m.edad) < 100).map((m) => ({ edad: Number(m.edad), esHijo: m.esHijo }));
  const resultados = useMemo(
    () => cotizar(lista, { miembros: validos, zona, modalidad, campania, sueldos: sueldos.map(Number) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, JSON.stringify(validos), zona, modalidad, campania, JSON.stringify(sueldos)]
  );

  // Guarda grupo, zona y parámetros en la ficha (agrupado para no escribir en cada tecla)
  function persistir(cambios) {
    const sig = { miembros, zona, modalidad, campania, sueldos, ...cambios };
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      const integrantes = sig.miembros.filter((m) => m.edad !== '').map((m, i) => ({
        parentesco: m.esHijo ? 'Hijo/a' : (i === 0 ? 'Titular' : 'Adulto'), edad: Number(m.edad)
      }));
      const campos = {
        zona: sig.zona,
        relevamiento: { ...(contacto.relevamiento ?? {}), integrantes },
        cotizacion: { modalidad: sig.modalidad, campania: sig.campania, sueldos: sig.sueldos }
      };
      const { error } = await supabase.from('contactos').update(campos).eq('id', contacto.id);
      if (!error) onContacto(campos);
    }, 700);
  }

  const cambiar = (setter, clave) => (valor) => { setter(valor); persistir({ [clave]: valor }); };
  const setMiembro = (i, campos) => {
    const nuevos = miembros.map((m, j) => (j === i ? { ...m, ...campos } : m));
    setMiembros(nuevos); persistir({ miembros: nuevos });
  };

  function enviar() {
    const planes = resultados.filter((r) => elegidos.includes(r.plan));
    if (!planes.length) return;
    const nombre = contacto.nombre?.trim().split(/\s+/)[0];
    const camp = CAMPANIAS.find((c) => c.id === campania);
    const texto = [
      `${nombre ? `${nombre}, te` : 'Te'} paso la cotización de Swiss Medical (${lista.vigencia}) para ${grupoTexto(validos)} en ${ZONA_ROTULO[zona]}:`,
      '',
      ...planes.map((r) => `• Plan ${r.plan}: ${pesos(r.final)} por mes`),
      '',
      modalidad === 'derivacion'
        ? 'Valores con derivación de aportes (ya descontado el aporte según el sueldo).'
        : `Valores mensuales${campania !== 'individual50' ? ` con la promoción ${camp.rotulo}` : ''}.`,
      '¿Querés que te cuente las diferencias entre los planes?'
    ].join('\n');
    setAviso('');
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conversacionId, { tipo: 'texto', texto });
      setAviso(r.error ?? 'Cotización enviada');
      if (!r.error) setElegidos([]);
    });
  }

  if (!lista) {
    return (
      <div className="bloque proximamente">
        <span className="bloque-titulo">Cotización automática</span>
        <p>No hay una lista de precios activa. Cargala desde la sección Precios.</p>
      </div>
    );
  }

  return (
    <div className="bloque cotizacion">
      <div className="cot-cabecera">
        <span className="bloque-titulo">Cotización automática</span>
        <span className="cot-vigencia">Precios {lista.vigencia}</span>
      </div>

      <div className="cot-miembros">
        {miembros.map((m, i) => (
          <div key={i} className="cot-miembro">
            <input type="number" inputMode="numeric" min="0" max="99" value={m.edad} placeholder="Edad"
              aria-label={`Edad del integrante ${i + 1}`} onChange={(e) => setMiembro(i, { edad: e.target.value })} />
            <label className="check"><input type="checkbox" checked={m.esHijo} onChange={(e) => setMiembro(i, { esHijo: e.target.checked })} /> Hijo/a</label>
            {miembros.length > 1 && (
              <button type="button" className="boton-icono" aria-label="Quitar integrante"
                onClick={() => { const n = miembros.filter((_, j) => j !== i); setMiembros(n); persistir({ miembros: n }); }}>×</button>
            )}
          </div>
        ))}
        <button type="button" className="boton-secundario" onClick={() => setMiembros([...miembros, { edad: '', esHijo: miembros.length > 1 }])}>+ Integrante</button>
      </div>

      <div className="campos-dobles">
        <label className="campo"><span>Zona</span>
          <select value={zona} onChange={(e) => cambiar(setZona, 'zona')(e.target.value)}>
            {ZONAS.map((z) => <option key={z} value={z}>{ZONA_ROTULO[z]}</option>)}
          </select>
        </label>
        <label className="campo"><span>Modalidad</span>
          <select value={modalidad} onChange={(e) => cambiar(setModalidad, 'modalidad')(e.target.value)}>
            <option value="directo">Directo</option>
            <option value="derivacion">Derivación de aportes</option>
          </select>
        </label>
      </div>
      {modalidad === 'derivacion' && (
        <div className="campos-dobles">
          {[0, 1].map((i) => (
            <label key={i} className="campo"><span>Sueldo bruto {i + 1}</span>
              <input type="number" inputMode="numeric" min="0" value={sueldos[i] ?? ''} placeholder="$"
                onChange={(e) => { const s = [...sueldos]; s[i] = e.target.value; setSueldos(s); persistir({ sueldos: s }); }} />
            </label>
          ))}
        </div>
      )}

      <div className="cot-campanias" role="group" aria-label="Campaña">
        {CAMPANIAS.map((c) => (
          <button key={c.id} type="button" title={c.detalle} aria-pressed={campania === c.id}
            className={`chip-filtro${campania === c.id ? ' activo' : ''}`} onClick={() => cambiar(setCampania, 'campania')(c.id)}>
            {c.rotulo}
          </button>
        ))}
      </div>

      {resultados.length === 0 ? (
        <p className="selector-detalle">Cargá al menos una edad para cotizar.</p>
      ) : (
        <div className="carrusel" aria-label="Planes cotizados">
          {resultados.map((r) => {
            const elegido = elegidos.includes(r.plan);
            return (
              <article key={r.plan} className={`plan${elegido ? ' elegido' : ''}`}>
                <span className="plan-nombre">{r.plan}</span>
                <span className="plan-desc">{DESCRIPCION_PLAN[r.plan]}</span>
                {r.lista !== r.conDescuento && <span className="plan-lista">{pesos(r.lista)}</span>}
                {r.aporte > 0 && <span className="plan-desc">Aporte −{pesos(r.aporte)}</span>}
                <span className="plan-final">{pesos(r.final)}<small> /mes</small></span>
                <label className="check">
                  <input type="checkbox" checked={elegido}
                    onChange={(e) => setElegidos(e.target.checked ? [...elegidos, r.plan] : elegidos.filter((p) => p !== r.plan))} />
                  Incluir
                </label>
              </article>
            );
          })}
        </div>
      )}

      {aviso && <p className="selector-detalle" role="status">{aviso}</p>}
      <button type="button" className="boton-primario" disabled={!elegidos.length || enviando} onClick={enviar}>
        {enviando ? 'Enviando…' : elegidos.length ? `Enviar ${elegidos.length} plan${elegidos.length > 1 ? 'es' : ''} al lead` : 'Elegí planes para enviar'}
      </button>
    </div>
  );
}
