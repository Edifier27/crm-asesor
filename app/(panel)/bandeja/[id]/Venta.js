'use client';

import { useState, useTransition } from 'react';
import { pesos } from '@/lib/cotizador';
import { fechaCorta } from '@/lib/formato';
import { diasDesde, linkBienvenida, tipoDeModalidad } from '@/lib/venta';
import { cerrarCobro, enviarLinkPago, registrarVenta } from './acciones';

/**
 * Venta y cobro del lead.
 * · "Venta hecha": desregulado → Ganado; directo → Falta de cobro (pide DNI y N° de precarga para el link de pago).
 * · En Falta de cobro: Enviar link ahora, Pagó ✓ o No pagó.
 */
export default function Venta({ conversacionId, contacto, etapas, onCambio }) {
  const etapa = etapas.find((e) => e.id === contacto.etapa_id)?.nombre;
  const venta = contacto.venta;
  const [abierto, setAbierto] = useState(false);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [aviso, setAviso] = useState('');
  const [ocupado, iniciar] = useTransition();

  // Tipo propuesto por la última cotización (derivación de aportes = desregulado)
  const ultima = contacto.cotizacion?.enviadas?.find((e) => e.tipo === 'cotizacion');
  const [borrador, setBorrador] = useState({
    tipo: tipoDeModalidad(ultima?.modalidad ?? contacto.cotizacion?.modalidad),
    plan: contacto.plan_cotizado ?? ultima?.planes?.[0]?.plan ?? '',
    monto: contacto.valor ?? ultima?.planes?.[0]?.final ?? '',
    dni: venta?.dni ?? '', precarga: venta?.precarga ?? ''
  });
  const link = linkBienvenida(borrador.dni, borrador.precarga);

  const correr = (fn, ok) => iniciar(async () => {
    setAviso('');
    const r = await fn();
    if (r.error) return setAviso(r.error);
    if (r.etapaId || r.venta) onCambio({ ...(r.etapaId ? { etapa_id: r.etapaId } : {}), ...(r.venta ? { venta: r.venta } : {}) });
    setAviso(ok); setAbierto(false); setEditandoDatos(false);
  });

  if (etapa === 'Perdido') return null;

  const camposCobro = (
    <div className="campos-dobles">
      <label className="campo"><span>DNI</span>
        <input inputMode="numeric" value={borrador.dni} maxLength={10} placeholder="Sin puntos"
          onChange={(e) => setBorrador({ ...borrador, dni: e.target.value.replace(/\D/g, '') })} /></label>
      <label className="campo"><span>N° de precarga</span>
        <input inputMode="numeric" value={borrador.precarga} maxLength={12}
          onChange={(e) => setBorrador({ ...borrador, precarga: e.target.value.replace(/\D/g, '') })} /></label>
    </div>
  );

  // ── Falta de cobro ──
  if (etapa === 'Falta de cobro' && venta) {
    const dias = diasDesde(venta.fecha);
    return (
      <div className="bloque venta cobro">
        <span className="bloque-titulo">💳 Falta de cobro · {dias === 0 ? 'vendido hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}</span>
        <span className="selector-detalle">
          {venta.plan ?? 'Plan'}{venta.monto ? ` · ${pesos(venta.monto)}` : ''} · {venta.link_enviado_at ? `link enviado ${fechaCorta(venta.link_enviado_at)}; si no paga, en 48 h vuelve a tu bandeja` : 'falta mandarle el link de pago'}
        </span>
        {venta.link_enviado_at && !editandoDatos ? (
          <span className="link-pago">
            <a href={venta.link_pago} target="_blank" rel="noreferrer">Link de pago</a> · DNI {venta.dni} · precarga {venta.precarga}
            <button type="button" className="boton-link-texto" onClick={() => setEditandoDatos(true)}>Reenviar / corregir</button>
          </span>
        ) : (
          <>
            {camposCobro}
            {link && <a className="link-pago" href={link} target="_blank" rel="noreferrer">Ver link armado</a>}
          </>
        )}
        <div className="acciones">
          {(!venta.link_enviado_at || editandoDatos) && (
            <button type="button" className="boton-primario" disabled={!link || ocupado}
              onClick={() => correr(() => enviarLinkPago(conversacionId, { dni: borrador.dni, precarga: borrador.precarga }), 'Link enviado. Si en 48 h hábiles no marcás Pagó, vuelve a tu bandeja.')}>
              Enviar link
            </button>
          )}
          <button type="button" className="boton-secundario exito" disabled={ocupado}
            onClick={() => correr(() => cerrarCobro(conversacionId, true), '¡Venta ganada!')}>Pagó ✓</button>
          <button type="button" className="boton-secundario peligro" disabled={ocupado}
            onClick={() => confirm('¿Marcar que no pagó? Pasa a Perdido.') && correr(() => cerrarCobro(conversacionId, false), 'Marcado como no abonó')}>No pagó / baja</button>
        </div>
        {aviso && <span className="pp-aviso">{aviso}</span>}
      </div>
    );
  }

  // ── Ganado ──
  if (etapa === 'Ganado') {
    return venta ? (
      <div className="bloque venta ganada">
        <span className="bloque-titulo">✅ Venta {venta.tipo === 'desregulado' ? 'desregulada' : 'directa'}</span>
        <span className="selector-detalle">{venta.plan ?? ''}{venta.monto ? ` · ${pesos(venta.monto)}` : ''} · {fechaCorta(venta.fecha)}{venta.pagado_at ? ` · pagó ${fechaCorta(venta.pagado_at)}` : ''}</span>
      </div>
    ) : null;
  }

  // ── Antes de vender ──
  return (
    <div className="bloque venta">
      {!abierto ? (
        <button type="button" className="boton-primario boton-venta" onClick={() => setAbierto(true)}>Venta hecha</button>
      ) : (
        <div className="venta-form">
          <span className="bloque-titulo">Registrar venta</span>
          <div className="pp-atajos" role="radiogroup" aria-label="Tipo de venta">
            {[['directo', 'Directo', 'Particular, monotributo, Nordelta: falta que pague'], ['desregulado', 'Desregulado', 'Deriva aportes: ya queda impactado']].map(([v, r, t]) => (
              <button key={v} type="button" role="radio" aria-checked={borrador.tipo === v} title={t}
                className={`chip-filtro${borrador.tipo === v ? ' activo' : ''}`} onClick={() => setBorrador({ ...borrador, tipo: v })}>{r}</button>
            ))}
          </div>
          <div className="campos-dobles">
            <label className="campo"><span>Plan</span><input value={borrador.plan} onChange={(e) => setBorrador({ ...borrador, plan: e.target.value })} /></label>
            <label className="campo"><span>Cuota</span>
              <span className="campo-pesos"><span>$</span>
                <input inputMode="numeric" value={borrador.monto ? Number(borrador.monto).toLocaleString('es-AR') : ''}
                  onChange={(e) => setBorrador({ ...borrador, monto: e.target.value.replace(/\D/g, '') })} /></span>
            </label>
          </div>
          <p className="pp-explicacion">
            {borrador.tipo === 'directo'
              ? 'Pasa a "Falta de cobro". A las 48 h hábiles te aparece en Mis chats para mandarle el link de pago (cargás DNI y N° de precarga). Después, cada 48 h hábiles sin pago te vuelve a aparecer para recordárselo. No sale nada automático.'
              : 'Pasa directo a "Ganado": al derivar aportes ya queda impactado.'}
          </p>
          <div className="acciones">
            <button type="button" className="boton-primario" disabled={ocupado}
              onClick={() => correr(() => registrarVenta(conversacionId, borrador), borrador.tipo === 'directo' ? 'Venta registrada: pasa a Falta de cobro' : '¡Venta ganada!')}>
              Confirmar venta
            </button>
            <button type="button" className="boton-secundario" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso && <span className="pp-aviso">{aviso}</span>}
    </div>
  );
}
