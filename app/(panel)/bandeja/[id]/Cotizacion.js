'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CAMPANIAS, ZONAS, ZONA_ROTULO, cotizar, detalleCotizacion, miembrosDesdeRelevamiento, pesos } from '@/lib/cotizador';
import { REGIONES, TIERS, cartillaDe, planPdf, regionSugerida, tierDePlan } from '@/lib/documentos';
import { fechaCorta, hora } from '@/lib/formato';
import { enviarDesdeBandeja, verDocumento } from './acciones';

const grupoTexto = (miembros) => {
  const adultos = miembros.filter((m) => !m.esHijo).map((m) => m.edad);
  const hijos = miembros.filter((m) => m.esHijo).map((m) => m.edad);
  return [adultos.length ? `${adultos.length === 1 ? 'adulto' : 'adultos'} de ${adultos.join(' y ')}` : '', hijos.length ? `${hijos.length === 1 ? 'hijo' : 'hijos'} de ${hijos.join(', ')}` : '']
    .filter(Boolean).join(' + ');
};

const cuando = (iso) => `${fechaCorta(iso) === hora(iso) ? 'Hoy' : fechaCorta(iso)} ${hora(iso)}`;
const rotuloCampania = (id) => CAMPANIAS.find((c) => c.id === id)?.rotulo ?? id;

function describirEnvio(e) {
  if (e.tipo === 'cotizacion') {
    return `Cotización: ${e.planes.map((p) => `${p.plan} ${pesos(p.final)}`).join(' · ')} (${e.modalidad === 'derivacion' ? 'derivación de aportes' : rotuloCampania(e.campania)})`;
  }
  if (e.tipo === 'plan') return `Folleto del plan ${e.plan} (PDF)`;
  return `Cartilla ${TIERS[e.tier]} · ${REGIONES[e.region]} (plan ${e.plan})`;
}

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
  const [enviadas, setEnviadas] = useState(guardada.enviadas ?? []);   // historial de lo enviado al lead
  const [elegidos, setElegidos] = useState([]);
  const [detalle, setDetalle] = useState(null);                         // plan desplegado abajo del carrusel
  const [vista, setVista] = useState('cotizacion');                     // 'cotizacion' (discriminado) | 'docs' (plan y cartilla)
  const [region, setRegion] = useState(() => regionSugerida(contacto.zona, contacto.relevamiento?.localidad));
  const [aviso, setAviso] = useState('');
  const [enviando, iniciar] = useTransition();
  const temporizador = useRef();

  const validos = miembros.filter((m) => m.edad !== '' && Number(m.edad) >= 0 && Number(m.edad) < 100).map((m) => ({ edad: Number(m.edad), esHijo: m.esHijo }));
  const resultados = useMemo(
    () => cotizar(lista, { miembros: validos, zona, modalidad, campania, sueldos: sueldos.map(Number) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, JSON.stringify(validos), zona, modalidad, campania, JSON.stringify(sueldos)]
  );

  // Última vez que se envió cada plan (cotización o folleto)
  const ultimoEnvio = useMemo(() => {
    const m = {};
    for (const e of [...enviadas].reverse()) {
      for (const p of e.tipo === 'cotizacion' ? e.planes.map((x) => x.plan) : e.tipo === 'plan' ? [e.plan] : []) m[p] = e.fecha;
    }
    return m;
  }, [enviadas]);

  const cotizacionGuardada = (sig) => ({ modalidad: sig.modalidad, campania: sig.campania, sueldos: sig.sueldos, enviadas: sig.enviadas });

  // Guarda grupo, zona y parámetros en la ficha (agrupado para no escribir en cada tecla)
  function persistir(cambios) {
    const sig = { miembros, zona, modalidad, campania, sueldos, enviadas, ...cambios };
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      const integrantes = sig.miembros.filter((m) => m.edad !== '').map((m, i) => ({
        parentesco: m.esHijo ? 'Hijo/a' : (i === 0 ? 'Titular' : 'Adulto'), edad: Number(m.edad)
      }));
      const campos = {
        zona: sig.zona,
        relevamiento: { ...(contacto.relevamiento ?? {}), integrantes, ...(cambios.zona ? { zona_confirmada: true } : {}) },
        cotizacion: cotizacionGuardada(sig)
      };
      const { error } = await supabase.from('contactos').update(campos).eq('id', contacto.id);
      if (!error) onContacto(campos);
    }, 700);
  }

  // Deja asentado en la ficha qué se le mandó al lead
  async function registrar(entrada, extra = {}) {
    const nuevas = [{ fecha: new Date().toISOString(), ...entrada }, ...enviadas].slice(0, 50);
    setEnviadas(nuevas);
    const campos = { cotizacion: cotizacionGuardada({ modalidad, campania, sueldos, enviadas: nuevas }), ...extra };
    const { error } = await supabase.from('contactos').update(campos).eq('id', contacto.id);
    if (!error) onContacto(campos);
  }

  const cambiar = (setter, clave) => (valor) => {
    setter(valor);
    persistir({ [clave]: valor });
    if (clave === 'zona') setRegion(regionSugerida(valor, null));
  };
  const setMiembro = (i, campos) => {
    const nuevos = miembros.map((m, j) => (j === i ? { ...m, ...campos } : m));
    setMiembros(nuevos); persistir({ miembros: nuevos });
  };

  function enviarCotizacion() {
    const planes = resultados.filter((r) => elegidos.includes(r.plan));
    if (!planes.length) return;
    const nombre = contacto.nombre?.trim().split(/\s+/)[0];
    const texto = [
      `${nombre ? `${nombre}, te` : 'Te'} paso la cotización de Swiss Medical (${lista.vigencia}) para ${grupoTexto(validos)} en ${ZONA_ROTULO[zona]}:`,
      '',
      ...planes.map((r) => `• Plan ${r.plan}: ${pesos(r.final)} por mes`),
      '',
      modalidad === 'derivacion'
        ? 'Valores con derivación de aportes (ya descontado el aporte según el sueldo).'
        : `Valores mensuales${campania !== 'individual50' ? ` con la promoción ${rotuloCampania(campania)}` : ''}.`,
      '¿Querés que te cuente las diferencias entre los planes?'
    ].join('\n');
    setAviso('');
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conversacionId, { tipo: 'texto', texto });
      setAviso(r.error ?? 'Cotización enviada');
      if (r.error) return;
      setElegidos([]);
      // El plan más económico enviado queda como valor del lead y el lead avanza a "Cotizado" (nunca retrocede)
      const { data: etapas } = await supabase.from('etapas').select('id, nombre, orden');
      const cotizado = etapas?.find((e) => e.nombre === 'Cotizado');
      const actual = etapas?.find((e) => e.id === contacto.etapa_id);
      const extra = { valor: planes[0].final, plan_cotizado: planes[0].plan };
      if (cotizado && (!actual || (actual.orden < cotizado.orden && actual.nombre !== 'Perdido'))) extra.etapa_id = cotizado.id;
      await registrar({ tipo: 'cotizacion', planes: planes.map((p) => ({ plan: p.plan, final: p.final })), campania, modalidad, zona }, extra);
    });
  }

  async function ver(path) {
    const ventana = window.open('', '_blank'); // se abre ya para que el navegador no la bloquee
    const r = await verDocumento(path);
    if (r.url && ventana) ventana.location.href = r.url;
    else { ventana?.close(); setAviso(r.error ?? 'No se pudo abrir el documento'); }
  }

  function enviarDocumento(doc, caption, entrada) {
    setAviso('');
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conversacionId, { tipo: 'documento', documento: { path: doc.path, nombre: doc.nombre, caption } });
      setAviso(r.error ?? `${entrada.tipo === 'plan' ? 'Plan' : 'Cartilla'} enviado`);
      if (!r.error) await registrar(entrada);
    });
  }

  async function copiarDesglose(plan, d) {
    const lineas = [
      `Plan ${plan} · ${ZONA_ROTULO[zona]} · ${lista.vigencia}`,
      ...d.filas.map((f) => `${f.rotulo}: ${pesos(f.cuota)}${f.pct ? ` −${Math.round(f.pct * 100)}% = ${pesos(f.neto)}` : ''}`),
      `Cuota: ${pesos(d.conDescuento)}`,
      ...d.aportes.map((a) => `Aporte (sueldo ${pesos(a.sueldo)}): −${pesos(a.aporte)}`),
      `Total: ${pesos(d.final)} por mes`
    ];
    try { await navigator.clipboard.writeText(lineas.join('\n')); setAviso('Detalle copiado'); } catch { setAviso('No se pudo copiar'); }
  }

  if (!lista) {
    return (
      <div className="bloque proximamente">
        <span className="bloque-titulo">Cotización automática</span>
        <p>No hay una lista de precios activa. Cargala desde la sección Precios.</p>
      </div>
    );
  }

  const desglose = detalle ? detalleCotizacion(lista, { miembros: validos, zona, modalidad, campania, sueldos: sueldos.map(Number) }, detalle) : null;
  const pdf = detalle ? planPdf(detalle) : null;
  const cartilla = detalle ? cartillaDe(detalle, region) : null;

  return (
    <div className="bloque cotizacion">
      <div className="cot-cabecera">
        <span className="bloque-titulo">Cotización automática</span>
        <span className="cot-vigencia">Precios {lista.vigencia}</span>
      </div>

      {contacto.relevamiento?.zona_confirmada === false && (
        <p className="aviso-zona">
          Zona aproximada por la web{contacto.relevamiento.localidad ? ` (${contacto.relevamiento.localidad})` : ''}. Confirmala antes de enviar: si la cambiás acá, queda confirmada.
        </p>
      )}

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
              <article key={r.plan} className={`plan${elegido ? ' elegido' : ''}${detalle === r.plan ? ' con-detalle' : ''}`}>
                <span className="plan-nombre">{r.plan}</span>
                {ultimoEnvio[r.plan] && <span className="plan-enviado">Enviado {cuando(ultimoEnvio[r.plan])}</span>}
                {r.lista !== r.conDescuento && <span className="plan-lista">{pesos(r.lista)}</span>}
                {r.aporte > 0 && <span className="plan-desc">Aporte −{pesos(r.aporte)}</span>}
                <span className="plan-final">{pesos(r.final)}<small> /mes</small></span>
                <label className="check">
                  <input type="checkbox" checked={elegido}
                    onChange={(e) => setElegidos(e.target.checked ? [...elegidos, r.plan] : elegidos.filter((p) => p !== r.plan))} />
                  Incluir
                </label>
                <span className="plan-botones">
                  {[['cotizacion', 'Ver cotización'], ['docs', 'Plan y cartilla']].map(([v, rotulo]) => (
                    <button key={v} type="button" className={`plan-docs${detalle === r.plan && vista === v ? ' activo' : ''}`}
                      aria-expanded={detalle === r.plan && vista === v}
                      onClick={() => { const cerrar = detalle === r.plan && vista === v; setDetalle(cerrar ? null : r.plan); setVista(v); }}>
                      {rotulo}
                    </button>
                  ))}
                </span>
              </article>
            );
          })}
        </div>
      )}

      {detalle && (
        <div className="docs-plan" aria-label={`Documentos del plan ${detalle}`}>
          <div className="docs-cabecera">
            <strong>Plan {detalle}</strong>
            <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => setDetalle(null)}>×</button>
          </div>
          <div className="docs-pestanias" role="tablist">
            {[['cotizacion', 'Cotización'], ['docs', 'Plan y cartilla']].map(([v, r]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} className={`chip-filtro${vista === v ? ' activo' : ''}`} onClick={() => setVista(v)}>{r}</button>
            ))}
          </div>

          {vista === 'cotizacion' && desglose && (
            <div className="desglose">
              <table>
                <tbody>
                  {desglose.filas.map((fila, i) => (
                    <tr key={i}>
                      <td>{fila.rotulo}</td>
                      <td className="num">{pesos(fila.cuota)}</td>
                      <td className="num desc">{fila.pct ? `−${Math.round(fila.pct * 100)}%` : ''}</td>
                      <td className="num">{pesos(fila.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl>
                <div><dt>Cuota sin descuento</dt><dd>{pesos(desglose.lista)}</dd></div>
                {desglose.descuentos > 0 && <div><dt>{campania === 'individual50' ? 'Descuento menores de 26' : `Descuentos (${rotuloCampania(campania)})`}</dt><dd>−{pesos(desglose.descuentos)}</dd></div>}
                <div><dt>Cuota con descuento</dt><dd>{pesos(desglose.conDescuento)}</dd></div>
                {desglose.aportes.map((a, i) => (
                  <div key={i}><dt>Aporte sueldo {pesos(a.sueldo)}</dt><dd>−{pesos(a.aporte)}</dd></div>
                ))}
                <div className="total"><dt>{desglose.totalAportes > 0 ? 'A pagar (cuota − aportes)' : 'Total por mes'}</dt><dd>{pesos(desglose.final)}</dd></div>
              </dl>
              {desglose.aumento ? <span className="selector-detalle">Incluye aumento de {desglose.aumento}% sobre la lista.</span> : null}
              <button type="button" className="boton-secundario" onClick={() => copiarDesglose(detalle, desglose)}>Copiar detalle</button>
            </div>
          )}

          {vista === 'docs' && pdf && (
            <div className="doc-fila">
              <span className="doc-nombre">Folleto del plan (PDF)</span>
              <button type="button" className="boton-secundario" onClick={() => ver(pdf.path)}>Ver</button>
              <button type="button" className="boton-primario" disabled={enviando}
                onClick={() => enviarDocumento(pdf, `Te paso el detalle del plan ${detalle} de Swiss Medical.`, { tipo: 'plan', plan: detalle })}>
                Enviar plan
              </button>
            </div>
          )}
          {vista === 'docs' && (
          <div className="doc-fila">
            <span className="doc-nombre">
              Cartilla {TIERS[tierDePlan(detalle)]}
              <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Región de la cartilla">
                {Object.entries(REGIONES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
              </select>
            </span>
            {cartilla ? (
              <>
                <button type="button" className="boton-secundario" onClick={() => ver(cartilla.path)}>Ver</button>
                <button type="button" className="boton-primario" disabled={enviando}
                  onClick={() => enviarDocumento(cartilla, `Cartilla de la zona ${REGIONES[region]} para el plan ${detalle}.`, { tipo: 'cartilla', plan: detalle, region, tier: cartilla.tier })}>
                  Enviar cartilla
                </button>
              </>
            ) : (
              <span className="selector-detalle">Esta región no tiene cartilla {TIERS[tierDePlan(detalle)]} (S1 y SMG02 son solo AMBA).</span>
            )}
          </div>
          )}
        </div>
      )}

      {aviso && <p className="selector-detalle" role="status">{aviso}</p>}
      <button type="button" className="boton-primario" disabled={!elegidos.length || enviando} onClick={enviarCotizacion}>
        {enviando ? 'Enviando…' : elegidos.length ? `Enviar ${elegidos.length} plan${elegidos.length > 1 ? 'es' : ''} al lead` : 'Elegí planes para enviar'}
      </button>

      {enviadas.length > 0 && (
        <div className="historial-envios">
          <span className="bloque-titulo">Enviado al lead</span>
          <ul>
            {enviadas.map((e, i) => (
              <li key={`${e.fecha}-${i}`}>
                <span className="historial-cuando">{cuando(e.fecha)}</span>
                <span>{describirEnvio(e)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
