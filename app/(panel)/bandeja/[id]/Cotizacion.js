'use client';

import VisorArchivo from '../../componentes/VisorArchivo';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { zonaPorCaracteristica } from '@/lib/caracteristicas';
import { createClient } from '@/lib/supabase/client';
import { CAMPANIAS, ZONA_ROTULO, campaniaSugerida, cotizar, ordenarPlanes, detalleCotizacion, miembrosDesdeRelevamiento, pesos } from '@/lib/cotizador';
import { PROVINCIAS, datosProvincia, provinciaDesdeTexto } from '@/lib/provincias';
import { REGIONES, TIERS, cartillaDe, planPdf, regionSugerida, tierDePlan } from '@/lib/documentos';
import { fechaCorta, hora } from '@/lib/formato';
import { enviarDesdeBandeja, verDocumento } from './acciones';

// Carrusel de planes: agarrarlo con el mouse ("manito") y arrastrar para moverse, como en el celular
function useArrastre() {
  const estado = useRef(null);
  return {
    onPointerDown: (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('input, label, button, select')) return;
      estado.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft, movio: false, id: e.pointerId };
    },
    onPointerMove: (e) => {
      const s = estado.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (!s.movio && Math.abs(dx) > 5) {
        s.movio = true;
        e.currentTarget.setPointerCapture(s.id);
        e.currentTarget.classList.add('arrastrando');
      }
      if (s.movio) e.currentTarget.scrollLeft = s.scroll - dx;
    },
    onPointerUp: (e) => {
      const s = estado.current;
      estado.current = null;
      e.currentTarget.classList.remove('arrastrando');
      // Si arrastró, el soltar no cuenta como clic sobre un plan
      if (s?.movio) {
        const el = e.currentTarget;
        const frenar = (c) => { c.stopPropagation(); c.preventDefault(); };
        el.addEventListener('click', frenar, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', frenar, { capture: true }), 0);
      }
    },
    onPointerCancel: (e) => { estado.current = null; e.currentTarget.classList.remove('arrastrando'); }
  };
}

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
  // La provincia manda: de ella salen la zona de precios y la región de la cartilla.
  // Si todavía no se sabe, se estima por la característica del teléfono (0299 → Neuquén, 11 → AMBA).
  const caracteristica = useMemo(() => zonaPorCaracteristica(contacto.telefono), [contacto.telefono]);
  const [provincia, setProvincia] = useState(() =>
    contacto.relevamiento?.provincia ?? provinciaDesdeTexto(contacto.relevamiento?.localidad) ?? caracteristica?.provincia ?? null);
  const elegidaAMano = useRef(false);
  const arrastre = useArrastre();
  const miembrosAMano = useRef(false);
  // Ficha en vivo: lo que la IA va guardando (situación laboral, localidad, grupo) actualiza el cotizador
  const [relVivo, setRelVivo] = useState(contacto.relevamiento ?? {});
  const modalidadAMano = useRef(false);
  const sueldosAMano = useRef(false);
  // Cuando el cliente dice su zona ("CABA", "GBA Sur", "Neuquén") la IA la guarda en la ficha: el precio se actualiza solo
  useEffect(() => {
    const canal = supabase.channel(`cotizador-${contacto.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contactos', filter: `id=eq.${contacto.id}` }, ({ new: c }) => {
        const p = c.relevamiento?.provincia;
        if (p && !elegidaAMano.current) setProvincia(p);
        if (c.relevamiento) setRelVivo(c.relevamiento);
        const grupo = miembrosDesdeRelevamiento(c.relevamiento?.integrantes);
        if (grupo.length && !miembrosAMano.current) setMiembros(grupo);
        // El cliente dijo su sueldo bruto (la IA lo guardó): pasa a derivación con ese sueldo
        const cot = c.cotizacion ?? {};
        if (cot.modalidad && !modalidadAMano.current) setModalidad(cot.modalidad);
        if (Array.isArray(cot.sueldos) && cot.sueldos.length && !sueldosAMano.current) setSueldos(cot.sueldos);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [contacto.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const datosProv = datosProvincia(provincia);
  const zona = datosProv?.zona ?? contacto.zona ?? caracteristica?.zona ?? 'AMBA';
  const porCaracteristica = !contacto.relevamiento?.provincia && !contacto.relevamiento?.localidad && caracteristica
    && (!provincia || provincia === caracteristica.provincia);
  const [modalidad, setModalidad] = useState(guardada.modalidad ?? 'directo');
  // La promoción la elige el CRM según el perfil (Nordelta, monotributo, familia/derivación), salvo que la cambies a mano
  const [campaniaElegida, setCampaniaElegida] = useState(guardada.campania_manual ? guardada.campania : null);
  const campaniaAMano = useRef(Boolean(guardada.campania_manual));
  const textoZona = [relVivo?.localidad, relVivo?.intereses, contacto.origen_detalle].filter(Boolean).join(' ');
  const campania = campaniaElegida ?? campaniaSugerida({
    textoZona, situacion: relVivo?.situacion ?? '', modalidad, miembros: miembros.filter((m) => m.edad !== '')
  });
  const [sueldos, setSueldos] = useState(guardada.sueldos ?? ['', '']);
  const [enviadas, setEnviadas] = useState(guardada.enviadas ?? []);   // historial de lo enviado al lead
  const [elegidos, setElegidos] = useState([]);
  const [desplegado, setDesplegado] = useState(null);                   // plan con el desglose abierto
  const [planDocs, setPlanDocs] = useState(null);                       // plan elegido para enviar folleto y cartilla
  const [aviso, setAviso] = useState('');
  const [enviando, iniciar] = useTransition();
  const temporizador = useRef();

  const validos = miembros.filter((m) => m.edad !== '' && Number(m.edad) >= 0 && Number(m.edad) < 100).map((m) => ({ edad: Number(m.edad), esHijo: m.esHijo }));
  const resultados = useMemo(
    () => ordenarPlanes(cotizar(lista, { miembros: validos, zona, modalidad, campania, sueldos: sueldos.map(Number) }), zona),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, JSON.stringify(validos), zona, modalidad, campania, JSON.stringify(sueldos)]
  );
  const region = regionSugerida(zona, contacto.relevamiento?.localidad, provincia);
  const planDocsActivo = planDocs ?? resultados[0]?.plan ?? null;

  // Última vez que se envió cada plan (cotización o folleto)
  const ultimoEnvio = useMemo(() => {
    const m = {};
    for (const e of [...enviadas].reverse()) {
      for (const p of e.tipo === 'cotizacion' ? e.planes.map((x) => x.plan) : e.tipo === 'plan' ? [e.plan] : []) m[p] = e.fecha;
    }
    return m;
  }, [enviadas]);

  const cotizacionGuardada = (sig) => ({ modalidad: sig.modalidad, campania: sig.campania, campania_manual: campaniaAMano.current, sueldos: sig.sueldos, enviadas: sig.enviadas });

  // Guarda grupo, zona y parámetros en la ficha (agrupado para no escribir en cada tecla)
  function persistir(cambios) {
    const sig = { miembros, provincia, modalidad, campania, sueldos, enviadas, ...cambios };
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      const integrantes = sig.miembros.filter((m) => m.edad !== '').map((m, i) => ({
        parentesco: m.esHijo ? 'Hijo/a' : (i === 0 ? 'Titular' : 'Adulto'), edad: Number(m.edad)
      }));
      const campos = {
        zona: datosProvincia(sig.provincia)?.zona ?? contacto.zona,
        relevamiento: { ...(contacto.relevamiento ?? {}), integrantes, provincia: sig.provincia, ...(cambios.provincia ? { zona_confirmada: true } : {}) },
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

  const cambiar = (setter, clave) => (valor) => { setter(valor); persistir({ [clave]: valor }); };
  const setMiembro = (i, campos) => {
    const nuevos = miembros.map((m, j) => (j === i ? { ...m, ...campos } : m));
    miembrosAMano.current = true; setMiembros(nuevos); persistir({ miembros: nuevos });
  };

  function enviarCotizacion() {
    const planes = resultados.filter((r) => elegidos.includes(r.plan));
    if (!planes.length) return;
    // Formato pedido por Darío: solo los precios. Derivando aportes, también el sueldo bruto usado. Sin saludo ni cierre.
    const conSueldo = modalidad === 'derivacion' ? sueldos.map(Number).map((v, i) => [i, v]).filter(([, v]) => v > 0) : [];
    const texto = [
      ...conSueldo.map(([i, v]) => `Sueldo bruto${conSueldo.length > 1 ? (i ? ' pareja' : ' titular') : ''}: ${pesos(v)}`),
      ...(conSueldo.length ? [''] : []),
      ...planes.map((r) => `• Plan ${r.plan}: ${pesos(r.final)}`)
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

  // Plan o cartilla en ventana emergente dentro del CRM
  const [visor, setVisor] = useState(null);
  async function ver(path) {
    const nombre = path.split('/').pop().replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    setVisor({ url: null, nombre, tipo: 'pdf' });
    const r = await verDocumento(path);
    if (r.url) setVisor({ url: r.url, nombre, tipo: 'pdf' });
    else { setVisor(null); setAviso(r.error ?? 'No se pudo abrir el documento'); }
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

  const desglose = desplegado ? detalleCotizacion(lista, { miembros: validos, zona, modalidad, campania, sueldos: sueldos.map(Number) }, desplegado) : null;
  const pdf = planDocsActivo ? planPdf(planDocsActivo) : null;
  const cartilla = planDocsActivo ? cartillaDe(planDocsActivo, region) : null;

  return (
    <div className="bloque cotizacion">
      <div className="cot-cabecera">
        <span className="bloque-titulo">Cotización automática</span>
        <span className="cot-vigencia">Precios {lista.vigencia}</span>
      </div>

      {porCaracteristica && !elegidaAMano.current && (
        <p className="aviso-zona">
          Zona estimada por la característica {caracteristica.codigo === '11' ? '11' : `0${caracteristica.codigo}`} ({caracteristica.rotulo}). Confirmala con el cliente: si la elegís acá, queda confirmada.
        </p>
      )}
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
                onClick={() => { const n = miembros.filter((_, j) => j !== i); miembrosAMano.current = true; setMiembros(n); persistir({ miembros: n }); }}>×</button>
            )}
          </div>
        ))}
        <button type="button" className="boton-secundario" onClick={() => { miembrosAMano.current = true; setMiembros([...miembros, { edad: '', esHijo: miembros.length > 1 }]); }}>+ Integrante</button>
      </div>

      <div className="campos-dobles">
        <label className="campo"><span>Provincia</span>
          <select value={provincia ?? ''} onChange={(e) => { elegidaAMano.current = true; cambiar(setProvincia, 'provincia')(e.target.value || null); }}>
            {!provincia && <option value="">Elegí la provincia</option>}
            {PROVINCIAS.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="campo"><span>Modalidad</span>
          <select value={modalidad} onChange={(e) => { modalidadAMano.current = true; cambiar(setModalidad, 'modalidad')(e.target.value); }}>
            <option value="directo">Directo</option>
            <option value="derivacion">Derivación de aportes</option>
          </select>
        </label>
      </div>
      <p className="cot-derivado">
        Precios <strong>{ZONA_ROTULO[zona]}</strong> · Cartilla <strong>{REGIONES[region]}</strong>
        {!provincia && ' (elegí la provincia para confirmar)'}
      </p>
      {modalidad === 'derivacion' && (
        <div className="campos-dobles">
          {[0, 1].map((i) => (
            <label key={i} className="campo"><span>Sueldo bruto {i + 1}</span>
              {/* Con separador de miles mientras se escribe ($ 1.000.000) para no confundir un millón con cien mil */}
              <span className="campo-pesos">
                <span aria-hidden="true">$</span>
                <input type="text" inputMode="numeric" placeholder="0"
                  value={sueldos[i] ? Number(sueldos[i]).toLocaleString('es-AR') : ''}
                  onChange={(e) => {
                    const s = [...sueldos];
                    s[i] = e.target.value.replace(/\D/g, '').slice(0, 10);
                    sueldosAMano.current = true; setSueldos(s); persistir({ sueldos: s });
                  }} />
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="cot-campanias" role="group" aria-label="Campaña">
        {CAMPANIAS.map((c) => (
          <button key={c.id} type="button" title={c.detalle} aria-pressed={campania === c.id}
            className={`chip-filtro${campania === c.id ? ' activo' : ''}`} onClick={() => { campaniaAMano.current = true; cambiar(setCampaniaElegida, 'campania')(c.id); }}>
            {c.rotulo}
          </button>
        ))}
      </div>

      {resultados.length === 0 ? (
        <p className="selector-detalle">Cargá al menos una edad para cotizar.</p>
      ) : (
        <div className="carrusel" aria-label="Planes cotizados" {...arrastre}>
          {resultados.map((r) => {
            const elegido = elegidos.includes(r.plan);
            return (
              <article key={r.plan} className={`plan${elegido ? ' elegido' : ''}${planDocsActivo === r.plan ? ' con-detalle' : ''}`}
                onClick={(e) => { if (!e.target.closest('button, label, input')) setPlanDocs(r.plan); }}>
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
                <button type="button" className={`plan-docs${desplegado === r.plan ? ' activo' : ''}`} aria-expanded={desplegado === r.plan}
                  onClick={() => { setDesplegado(desplegado === r.plan ? null : r.plan); setPlanDocs(r.plan); }}>
                  {desplegado === r.plan ? 'Ocultar cotización' : 'Ver cotización'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {desplegado && desglose && (
        <div className="docs-plan desglose" aria-label={`Cotización del plan ${desplegado}`}>
          <div className="docs-cabecera">
            <strong>Cotización plan {desplegado}</strong>
            <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => setDesplegado(null)}>×</button>
          </div>
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
          <button type="button" className="boton-secundario" onClick={() => copiarDesglose(desplegado, desglose)}>Copiar detalle</button>
        </div>
      )}

      {aviso && <p className="selector-detalle" role="status">{aviso}</p>}
      <button type="button" className="boton-primario" disabled={!elegidos.length || enviando} onClick={enviarCotizacion}>
        {enviando ? 'Enviando…' : elegidos.length ? `Enviar ${elegidos.length} plan${elegidos.length > 1 ? 'es' : ''} al lead` : 'Elegí planes para enviar'}
      </button>

      {planDocsActivo && (
        <div className="plan-cartilla" aria-label="Plan y cartilla">
          <span className="bloque-titulo">Plan y cartilla · <strong>{planDocsActivo}</strong> <span className="pc-ayuda">(tocá otro plan para cambiar)</span></span>
          {pdf && (
            <div className="doc-fila">
              <span className="doc-nombre">Folleto del plan {planDocsActivo}</span>
              <button type="button" className="boton-secundario" onClick={() => ver(pdf.path)}>Ver</button>
              {visor && <VisorArchivo {...visor} onCerrar={() => setVisor(null)} />}
              <button type="button" className="boton-primario" disabled={enviando}
                onClick={() => enviarDocumento(pdf, null, { tipo: 'plan', plan: planDocsActivo })}>
                Enviar plan
              </button>
            </div>
          )}
          <div className="doc-fila">
            <span className="doc-nombre">Cartilla {TIERS[tierDePlan(planDocsActivo)]} · {REGIONES[region]}</span>
            {cartilla ? (
              <>
                <button type="button" className="boton-secundario" onClick={() => ver(cartilla.path)}>Ver</button>
                <button type="button" className="boton-primario" disabled={enviando}
                  onClick={() => enviarDocumento(cartilla, null, { tipo: 'cartilla', plan: planDocsActivo, region, tier: cartilla.tier })}>
                  Enviar cartilla
                </button>
              </>
            ) : (
              <span className="selector-detalle">El {planDocsActivo} no se comercializa en esta provincia (S1 y SMG02 son solo AMBA).</span>
            )}
          </div>
        </div>
      )}

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
