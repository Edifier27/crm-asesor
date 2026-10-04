'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { pesos } from '@/lib/cotizador';
import { MOTIVOS_PERDIDA, TEMPERATURAS, fechaCorta, nombreMes } from '@/lib/formato';
import { crearDifusion } from './acciones';

const SEGMENTOS = [
  ['todos', 'Todos'],
  ['contestaron', 'Contestaron'],
  ['nunca', 'Nunca contestaron']
];
const DIAS_SIN_REPETIR = 30;
const recibioHacePoco = (f) => f.ultima_difusion_at && Date.now() - new Date(f.ultima_difusion_at).getTime() < DIAS_SIN_REPETIR * 86_400_000;
const primerNombre = (n) => (n ?? '').trim().split(/\s+/)[0] || 'Hola';

/**
 * Bases por mes de entrada: lo que no cerró en 30 días (para campañas) y los clientes ganados.
 * Dentro de cada mes se separa a los que contestaron alguna vez de los que nunca contestaron,
 * porque necesitan plantillas distintas.
 */
export default function Bases({ filas, plantillas, difusionesIniciales }) {
  const [vista, setVista] = useState('sin_cerrar');
  const [difusiones, setDifusiones] = useState(difusionesIniciales);
  const sinCerrar = useMemo(() => filas.filter((f) => f.etapa !== 'Ganado'), [filas]);
  const clientes = useMemo(() => filas.filter((f) => f.etapa === 'Ganado'), [filas]);
  const grupo = vista === 'clientes' ? clientes : sinCerrar;

  const meses = useMemo(() => {
    const m = new Map();
    for (const f of grupo) {
      const k = f.mes;
      const r = m.get(k) ?? { mes: k, total: 0, contestaron: 0, nunca: 0 };
      r.total++; f.contesto ? r.contestaron++ : r.nunca++;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.mes.localeCompare(a.mes));
  }, [grupo]);
  const [mesElegido, setMesElegido] = useState(null);
  const mes = meses.find((m) => m.mes === mesElegido)?.mes ?? meses[0]?.mes ?? null;

  return (
    <div className="pagina pagina-ancha">
      <header className="pagina-cabecera">
        <h1>Bases</h1>
        <p>A los 30 días de entrado, cada lead sale del embudo y queda en la base de su mes. Los que no cerraron sirven para campañas; si alguien responde, vuelve solo al embudo.</p>
      </header>

      <div className="pp-atajos" role="tablist">
        <button type="button" role="tab" aria-selected={vista === 'sin_cerrar'} className={`chip-filtro${vista === 'sin_cerrar' ? ' activo' : ''}`} onClick={() => setVista('sin_cerrar')}>
          No cerraron · {sinCerrar.length}
        </button>
        <button type="button" role="tab" aria-selected={vista === 'clientes'} className={`chip-filtro${vista === 'clientes' ? ' activo' : ''}`} onClick={() => setVista('clientes')}>
          Clientes · {clientes.length}
        </button>
      </div>

      {!meses.length ? (
        <div className="tarjeta vacia">
          {vista === 'clientes' ? 'Todavía no hay clientes con más de 30 días.' : 'Todavía no hay leads con más de 30 días sin cerrar.'}
        </div>
      ) : (
        <>
          <div className="bases-meses">
            {meses.map((m) => (
              <button key={m.mes} type="button" className={`base-mes${m.mes === mes ? ' activo' : ''}`} onClick={() => setMesElegido(m.mes)}>
                <strong>{nombreMes(m.mes)}</strong>
                <span className="base-mes-total">{m.total}</span>
                {vista === 'sin_cerrar' && <span className="selector-detalle">{m.contestaron} contestaron · {m.nunca} nunca</span>}
              </button>
            ))}
          </div>
          {vista === 'clientes'
            ? <ListaClientes filas={clientes.filter((f) => f.mes === mes)} />
            : <BaseDelMes key={mes} mes={mes} filas={sinCerrar.filter((f) => f.mes === mes)} plantillas={plantillas}
                difusiones={difusiones.filter((d) => d.mes === mes)} onDifusion={(d) => setDifusiones((l) => [d, ...l])} />}
        </>
      )}
    </div>
  );
}

function BaseDelMes({ mes, filas, plantillas, difusiones, onDifusion }) {
  const [segmento, setSegmento] = useState('todos');
  const [provincia, setProvincia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [sinRepetir, setSinRepetir] = useState(true);
  const [armando, setArmando] = useState(false);
  const [plantillaId, setPlantillaId] = useState(() => (plantillas.find((p) => p.nombre === 'promo_reactivacion') ?? plantillas[0])?.id ?? '');
  const [aviso, setAviso] = useState('');
  const [ocupado, iniciar] = useTransition();

  const provincias = [...new Set(filas.map((f) => f.provincia).filter(Boolean))].sort();
  const motivos = [...new Set(filas.map((f) => f.motivo_perdida).filter(Boolean))];
  const visibles = filas.filter((f) =>
    (segmento === 'todos' || (segmento === 'contestaron' ? f.contesto : !f.contesto))
    && (!provincia || f.provincia === provincia)
    && (!motivo || f.motivo_perdida === motivo));
  const destinatarios = visibles.filter((f) => !f.no_campanas && !(sinRepetir && recibioHacePoco(f)));
  const plantilla = plantillas.find((p) => p.id === Number(plantillaId));
  const ejemplo = plantilla?.cuerpo.replace('{{1}}', primerNombre(destinatarios[0]?.nombre)).replace(/\{\{\d+\}\}/g, '…');
  const segRotulo = SEGMENTOS.find(([v]) => v === segmento)[1].toLowerCase();

  function enviar() {
    if (!confirm(`¿Mandar "${plantilla.nombre}" a ${destinatarios.length} contacto${destinatarios.length === 1 ? '' : 's'}? Salen en tandas en horario hábil.`)) return;
    setAviso('');
    iniciar(async () => {
      const r = await crearDifusion({
        nombre: `${nombreMes(mes)} · ${segRotulo}`, mes, segmento, plantillaId: plantilla.id,
        contactoIds: destinatarios.map((f) => f.contacto_id)
      });
      if (r.error) return setAviso(r.error);
      onDifusion(r.difusion);
      setArmando(false);
      setAviso(`Difusión creada: ${r.difusion.envios.length} envíos en cola.`);
    });
  }

  return (
    <section className="tarjeta base-detalle">
      <div className="base-barra">
        <div className="pp-atajos" role="radiogroup" aria-label="Segmento">
          {SEGMENTOS.map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={segmento === v} className={`chip-filtro${segmento === v ? ' activo' : ''}`} onClick={() => setSegmento(v)}>
              {r} · {v === 'todos' ? filas.length : filas.filter((f) => (v === 'contestaron' ? f.contesto : !f.contesto)).length}
            </button>
          ))}
        </div>
        <div className="base-filtros">
          {provincias.length > 1 && (
            <select value={provincia} onChange={(e) => setProvincia(e.target.value)} aria-label="Provincia">
              <option value="">Todas las provincias</option>
              {provincias.map((p) => <option key={p}>{p}</option>)}
            </select>
          )}
          {motivos.length > 0 && (
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo de pérdida">
              <option value="">Cualquier motivo</option>
              {motivos.map((m) => <option key={m} value={m}>{MOTIVOS_PERDIDA[m] ?? m}</option>)}
            </select>
          )}
        </div>
      </div>

      <p className="pp-explicacion">
        {segmento === 'nunca' && 'Nunca contestaron: no saben quién sos. Plantilla corta, que se presente y ofrezca algo concreto.'}
        {segmento === 'contestaron' && 'Ya charlaron con vos: retomá desde ahí (valores actualizados, una opción más económica, una promo).'}
        {segmento === 'todos' && 'Tip: separá "contestaron" de "nunca contestaron" y mandale a cada grupo una plantilla distinta.'}
      </p>

      {!armando ? (
        <div className="acciones">
          <button type="button" className="boton-primario" disabled={!destinatarios.length || !plantillas.length} onClick={() => setArmando(true)}>
            Enviar campaña a {destinatarios.length}
          </button>
          {visibles.length !== destinatarios.length && (
            <span className="selector-detalle">{visibles.length - destinatarios.length} quedan afuera (pidieron no recibir o ya recibieron hace menos de {DIAS_SIN_REPETIR} días)</span>
          )}
        </div>
      ) : (
        <div className="difusion-form">
          <label className="campo"><span>Plantilla aprobada</span>
            <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.uso ? ` · ${p.uso}` : ''}</option>)}
            </select>
          </label>
          {ejemplo && <div className="difusion-vista"><span className="selector-detalle">Así le llega a {primerNombre(destinatarios[0]?.nombre)}:</span><p>{ejemplo}</p></div>}
          <label className="pp-check">
            <input type="checkbox" checked={sinRepetir} onChange={(e) => setSinRepetir(e.target.checked)} />
            No mandar a quien recibió una campaña en los últimos {DIAS_SIN_REPETIR} días
          </label>
          <p className="pp-explicacion">
            Salen de a 40 cada 10 minutos, de lunes a viernes de 8 a 20. Cada envío lo cobra Meta (categoría marketing).
            Si alguien responde, vuelve al embudo con la etiqueta de la campaña; si pone &quot;no me interesa&quot;, no le llegan más.
          </p>
          <div className="acciones">
            <button type="button" className="boton-primario" disabled={ocupado || !destinatarios.length || !plantilla} onClick={enviar}>
              {ocupado ? 'Creando…' : `Confirmar envío a ${destinatarios.length}`}
            </button>
            <button type="button" className="boton-secundario" onClick={() => setArmando(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso && <span className="pp-aviso">{aviso}</span>}

      {difusiones.length > 0 && (
        <div className="difusiones">
          <span className="bloque-titulo">Campañas de este mes</span>
          {difusiones.map((d) => {
            const enviados = d.envios.filter((e) => e.estado === 'enviado').length;
            const respondieron = d.envios.filter((e) => e.respondio_at).length;
            const pendientes = d.envios.filter((e) => e.estado === 'pendiente').length;
            return (
              <div key={d.id} className="difusion-fila">
                <strong>{d.nombre}</strong>
                <span className="selector-detalle">
                  {d.plantilla?.nombre} · {fechaCorta(d.creado_at)} · {enviados}/{d.envios.length} enviados{pendientes ? ` (${pendientes} en cola)` : ''} · <b>{respondieron} respondieron</b>
                  {enviados ? ` (${Math.round((respondieron / enviados) * 100)}%)` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ListaContactos filas={visibles} />
    </section>
  );
}

function ListaContactos({ filas }) {
  if (!filas.length) return <div className="tarjeta vacia">Nadie con estos filtros.</div>;
  return (
    <ul className="base-lista">
      {filas.map((f) => (
        <li key={f.contacto_id}>
          <Link href={`/bandeja/${f.conversacion_id}`} className="base-fila">
            <span className="base-nombre">
              {f.nombre || f.telefono}
              {f.no_campanas && <span className="base-marca">no quiere campañas</span>}
            </span>
            <span className="selector-detalle">
              {[f.provincia, f.etapa === 'Perdido' ? `Perdido${f.motivo_perdida ? ` · ${MOTIVOS_PERDIDA[f.motivo_perdida] ?? f.motivo_perdida}` : ''}` : `Quedó en ${f.etapa ?? 'sin etapa'}`,
                f.plan_cotizado && `cotizado ${f.plan_cotizado}`].filter(Boolean).join(' · ')}
            </span>
            <span className="base-estado">
              {f.temperatura && <span className="punto-temp" style={{ background: TEMPERATURAS[f.temperatura]?.color }} title={TEMPERATURAS[f.temperatura]?.rotulo} />}
              {f.contesto ? 'Contestó' : 'Nunca contestó'}
              {f.ultima_difusion_at && <span className="selector-detalle"> · campaña {fechaCorta(f.ultima_difusion_at)}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListaClientes({ filas }) {
  if (!filas.length) return <div className="tarjeta vacia">Sin clientes este mes.</div>;
  return (
    <section className="tarjeta base-detalle">
      <p className="pp-explicacion">Clientes ganados que entraron este mes. Sirven para pedir referidos o mejorarles el plan más adelante.</p>
      <ul className="base-lista">
        {filas.map((f) => (
          <li key={f.contacto_id}>
            <Link href={`/bandeja/${f.conversacion_id}`} className="base-fila">
              <span className="base-nombre">{f.nombre || f.telefono}</span>
              <span className="selector-detalle">{[f.provincia, f.plan_cotizado, f.valor && pesos(f.valor)].filter(Boolean).join(' · ')}</span>
              <span className="base-estado">Cliente</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
