'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cancelarPedidoSalesforce, enviarLinkPago, pedirLinkSalesforce } from './acciones';

// Link de alta desde Salesforce (Darío, 9-nov-2026; lib/salesforce.js). Se pide desde acá y lo resuelve el script de
// Salesforce del asesor (Tampermonkey, en su compu, con Salesforce abierto). El estado se ve en vivo; cuando vuelve con el
// N° de precarga, el link queda listo para "Enviar al cliente" (el mismo envío del link de pago, con o sin ventana de 24 h).
// Sin la migración 0074 no se muestra.
const ESTADOS = {
  pendiente: 'Esperando al script de Salesforce (tiene que estar abierto en tu compu)…',
  en_curso: 'Salesforce lo está haciendo…',
  error: 'El script no pudo'
};

export default function PedidoSalesforce({ conversacionId, contacto, etapa, dniLeido, onContacto }) {
  const supabase = useMemo(() => createClient(), []);
  const [pedido, setPedido] = useState(undefined); // undefined = cargando; null = ninguno; false = sin la migración
  const [dni, setDni] = useState(contacto.venta?.dni ?? dniLeido ?? '');
  const [aviso, setAviso] = useState('');
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

  // Cuando vuelve el link, la venta de la ficha queda con el DNI y el N° de precarga (para "Falta de cobro")
  const listoId = pedido?.estado === 'listo' ? pedido.id : null;
  useEffect(() => {
    if (!listoId || !pedido?.precarga) return;
    onContacto?.({ venta: { ...(contacto.venta ?? {}), dni: pedido.datos?.dni ?? contacto.venta?.dni, precarga: pedido.precarga } });
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

  return (
    <div className="bloque venta pedido-sf">
      <span className="bloque-titulo">Link de alta desde Salesforce</span>
      {pedido?.estado === 'listo' ? (
        <>
          <span className="link-pago">
            <a href={pedido.link} target="_blank" rel="noreferrer">Link de alta</a>
            {pedido.precarga ? ` · precarga ${pedido.precarga}` : ''}{pedido.datos?.dni ? ` · DNI ${pedido.datos.dni}` : ''}
          </span>
          <div className="acciones">
            <button type="button" className="boton-primario" disabled={ocupado}
              onClick={() => correr(() => enviarLinkPago(conversacionId, { dni: pedido.datos?.dni, precarga: pedido.precarga }), 'Link enviado al cliente.')}>
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
          <label className="campo"><span>DNI del titular</span>
            <input inputMode="numeric" value={dni} maxLength={10} placeholder="Sin puntos"
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))} /></label>
          <p className="pp-explicacion">
            El script de Salesforce {contacto.salesforce_id || /^salesforce/i.test(contacto.origen_detalle ?? '') ? 'busca este lead' : 'lo carga como lead nuevo'}, lo cotiza con el plan de la ficha y te devuelve el link. Tiene que estar Salesforce abierto en tu compu.
          </p>
          <div className="acciones">
            <button type="button" className="boton-primario" disabled={ocupado || dni.length < 7}
              onClick={() => correr(() => pedirLinkSalesforce(conversacionId, { dni }), 'Pedido enviado a Salesforce')}>
              {pedido?.estado === 'error' ? 'Pedir de nuevo' : 'Pedir link a Salesforce'}
            </button>
          </div>
        </>
      )}
      {aviso && <span className="pp-aviso">{aviso}</span>}
    </div>
  );
}
