'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cancelarPedidoSalesforce, enviarLinkPago, guardarResultadoClaude, ordenParaClaude } from './acciones';

// Link de alta desde Salesforce (Darío, 9-nov-2026; lib/salesforce.js). Se pide desde acá y lo resuelve el script de
// Salesforce del asesor (Tampermonkey, en su compu, con Salesforce abierto). El estado se ve en vivo; cuando vuelve con el
// Link de autogestión de la Oportunidad, queda listo para "Enviar al cliente" (con o sin ventana de 24 h).
// Sin la migración 0074 no se muestra.
const ESTADOS = {
  pendiente: 'Esperando al script de Salesforce (tiene que estar abierto en tu compu)…',
  en_curso: 'Salesforce lo está haciendo…',
  error: 'El script no pudo'
};

export default function PedidoSalesforce({ conversacionId, contacto, etapa, dniLeido, onContacto }) {
  const supabase = useMemo(() => createClient(), []);
  const [pedido, setPedido] = useState(undefined); // undefined = cargando; null = ninguno; false = sin la migración
  const [aviso, setAviso] = useState('');
  // Alta con Claude in Chrome: el botón elegido, la orden armada y lo que Claude devolvió
  const [modo, setModo] = useState(null);
  const [orden, setOrden] = useState('');
  const [faltan, setFaltan] = useState([]);
  const [resultado, setResultado] = useState('');
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    supabase.from('acciones_salesforce').select('*').eq('contacto_id', contacto.id).order('creado_at', { ascending: false }).limit(1)
      .then(({ data, error }) => { if (vivo) setPedido(error ? false : data?.[0] ?? null); });
    // En vivo: el script toma el pedido y lo termina
    const canal = supabase.channel(`sf-${contacto.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acciones_salesforce', filter: `contacto_id=eq.${contacto.id}` },
        ({ new: fila }) => { if (fila?.id) setPedido(fila); })
      .subscribe();
    return () => { vivo = false; supabase.removeChannel(canal); };
  }, [contacto.id, supabase]);

  // Cuando vuelve el link, la venta de la ficha queda con el DNI y el link de alta (igual que en la base: lib/salesforce.js)
  const listoId = pedido?.estado === 'listo' ? pedido.id : null;
  useEffect(() => {
    if (!listoId || !pedido?.link) return;
    onContacto?.({ venta: { ...(contacto.venta ?? {}), dni: pedido.datos?.dni ?? contacto.venta?.dni, link_alta: pedido.link } });
  }, [listoId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pedido === undefined || pedido === false || ['Perdido', 'Auditoría médica'].includes(etapa)) return null;
  // Ya mandado: no hace falta mostrar nada más
  if (contacto.venta?.link_enviado_at && pedido?.estado === 'listo') return null;

  const correr = (fn, ok) => iniciar(async () => {
    setAviso('');
    const r = await fn().catch((e) => ({ error: e.message }));
    if (r?.error) return setAviso(r.error);
    if (r?.accion) setPedido(r.accion);
    if (r?.venta) onContacto?.({ venta: r.venta });
    if (ok) setAviso(ok);
  });
  const abierto = pedido && ['pendiente', 'en_curso'].includes(pedido.estado);
  const sugerido = contacto.salesforce_id || /^salesforce/i.test(contacto.origen_detalle ?? '') ? 'salesforce' : 'nuevo';
  const abrirOrden = (m) => iniciar(async () => {
    setAviso(''); setModo(m); setOrden('');
    const r = await ordenParaClaude(conversacionId, m).catch((e) => ({ error: e.message }));
    if (r?.error) return setAviso(r.error);
    setOrden(r.texto); setFaltan(r.faltan ?? []);
  });
  const copiarOrden = () => navigator.clipboard?.writeText(orden).then(
    () => setAviso('Orden copiada: pegala en el panel de Claude in Chrome'), () => setAviso('No se pudo copiar solo: seleccioná el texto y copialo a mano'));
  const guardarResultado = () => iniciar(async () => {
    setAviso('');
    const r = await guardarResultadoClaude(conversacionId, modo, resultado).catch((e) => ({ error: e.message }));
    if (r?.error) return setAviso(r.error);
    if (r?.accion) setPedido(r.accion);
    if (r?.venta) onContacto?.({ venta: r.venta });
    setResultado('');
    setAviso(r?.diferencias && !/^ninguna/i.test(r.diferencias) ? `Link guardado. Claude encontró diferencias con Salesforce: ${r.diferencias}` : 'Listo: el link quedó en la ficha');
  });

  return (
    <div className="bloque venta pedido-sf">
      <span className="bloque-titulo">Link de alta desde Salesforce</span>
      {pedido?.estado === 'listo' ? (
        <>
          <span className="link-pago">
            <a href={pedido.link} target="_blank" rel="noreferrer">Link de alta</a>
            {pedido.precarga ? ` · trámite ${pedido.precarga}` : ''}{pedido.datos?.dni ? ` · DNI ${pedido.datos.dni}` : ''}
          </span>
          <div className="acciones">
            <button type="button" className="boton-primario" disabled={ocupado}
              onClick={() => correr(() => enviarLinkPago(conversacionId, { dni: pedido.datos?.dni, precarga: pedido.precarga, linkAlta: pedido.link }), 'Link enviado al cliente.')}>
              Enviar al cliente
            </button>
            <button type="button" className="boton-secundario" onClick={() => {
              navigator.clipboard?.writeText(pedido.link).then(() => setAviso('Link copiado'), () => setAviso(pedido.link));
            }}>Copiar link</button>
          </div>
        </>
      ) : abierto ? (
        <>
          <span className="selector-detalle">{ESTADOS[pedido.estado]}{pedido.tipo === 'cargar_nuevo' ? ' Como no vino de Salesforce, primero lo carga como lead nuevo.' : ''}</span>
          <div className="acciones">
            <button type="button" className="boton-secundario" disabled={ocupado}
              onClick={() => correr(() => cancelarPedidoSalesforce(pedido.id), 'Pedido cancelado')}>Cancelar pedido</button>
          </div>
        </>
      ) : (
        <>
          {pedido?.estado === 'error' && <span className="selector-detalle aviso-error">{ESTADOS.error}: {pedido.error}</span>}
          <p className="pp-explicacion">Elegí cómo está este cliente. Se arma la orden con los datos de la ficha para pegarla en Claude in Chrome (con Salesforce abierto en otra pestaña).</p>
          <div className="alta-claude-botones">
            <button type="button" className={`alta-claude-boton${modo === 'nuevo' ? ' activo' : ''}`} disabled={ocupado} onClick={() => abrirOrden('nuevo')}>
              <strong>Cliente nuevo</strong><span>No está en Salesforce: crearlo y generar el link</span>{sugerido === 'nuevo' && <em>Sugerido</em>}
            </button>
            <button type="button" className={`alta-claude-boton${modo === 'salesforce' ? ' activo' : ''}`} disabled={ocupado} onClick={() => abrirOrden('salesforce')}>
              <strong>Ya está en Salesforce</strong><span>Buscarlo, chequear los datos y generar el link</span>{sugerido === 'salesforce' && <em>Sugerido</em>}
            </button>
          </div>
          {modo && orden && (
            <div className="alta-claude-orden">
              {faltan.length > 0 && <span className="selector-detalle aviso-error">Todavía falta: {faltan.join('; ')}. Podés seguir: Claude te lo va a preguntar.</span>}
              <label className="campo"><span>1. Copiá la orden y pegala en Claude in Chrome</span>
                <textarea readOnly rows={7} value={orden} onFocus={(e) => e.target.select()} /></label>
              <div className="acciones"><button type="button" className="boton-primario" onClick={copiarOrden}>Copiar orden</button></div>
              <label className="campo"><span>2. Cuando termine, pegá lo que te devolvió</span>
                <textarea rows={4} value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="RESULTADO PARA EL CRM&#10;Link: …&#10;Candidato: …&#10;Oportunidad: …" /></label>
              <div className="acciones"><button type="button" className="boton-secundario" disabled={ocupado || !resultado.trim()} onClick={guardarResultado}>Guardar resultado</button></div>
            </div>
          )}
        </>
      )}
      {aviso && <span className="pp-aviso">{aviso}</span>}
    </div>
  );
}
