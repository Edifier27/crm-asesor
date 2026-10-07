'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COLORES_ETIQUETA, MOTIVOS_PERDIDA, colorEtiqueta, cuitLindo, nombreVisible } from '@/lib/formato';
import Cotizacion from './Cotizacion';
import ProximoPaso from './ProximoPaso';
import Venta from './Venta';
import Documentacion from './Documentacion';

const ORIGENES = { swiss_medical: 'Swiss Medical', web: 'Web', whatsapp: 'WhatsApp', manual: 'Manual' };

export default function Ficha({ conversacion, etapas, todasEtiquetas, lista, audios = [], abierta, onCerrar }) {
  const supabase = createClient();
  const [contacto, setContacto] = useState(conversacion.contacto);
  const [etiquetas, setEtiquetas] = useState(conversacion.contacto.etiquetas.map((e) => e.etiqueta).filter(Boolean));
  const [catalogo, setCatalogo] = useState(todasEtiquetas);
  const [aviso, setAviso] = useState('');
  const [creando, setCreando] = useState(false);
  const [colorNueva, setColorNueva] = useState(COLORES_ETIQUETA[0]);
  const [perdiendo, setPerdiendo] = useState(null); // etapa Perdido pendiente de motivo

  const avisar = (texto) => { setAviso(texto); setTimeout(() => setAviso(''), 2000); };
  // DNI leído por la IA en la documentación: precarga el link de pago
  const dniLeido = (conversacion.contacto.documentos ?? []).find((d) => d.tipo?.startsWith('dni') && d.datos?.dni)?.datos.dni ?? null;

  async function guardar(campos) {
    const previo = contacto;
    setContacto({ ...contacto, ...campos });
    const { error } = await supabase.from('contactos').update(campos).eq('id', contacto.id);
    if (error) { setContacto(previo); avisar('No se pudo guardar'); } else avisar('Guardado');
  }

  async function agregarEtiqueta(valor) {
    // valor: id de una etiqueta existente, o el nombre de una nueva (si ya existe con ese nombre, se reutiliza)
    let etiqueta = catalogo.find((e) => String(e.id) === valor || e.nombre.toLowerCase() === valor.toLowerCase());
    if (!etiqueta) {
      const { data, error } = await supabase.from('etiquetas').insert({ nombre: valor.trim(), color: colorNueva }).select().single();
      if (error) return avisar('No se pudo crear la etiqueta');
      etiqueta = data;
      setCatalogo((c) => [...c, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }
    if (etiquetas.some((e) => e.id === etiqueta.id)) return;
    setEtiquetas((l) => [...l, etiqueta]);
    const { error } = await supabase.from('contacto_etiquetas').insert({ contacto_id: contacto.id, etiqueta_id: etiqueta.id });
    if (error) { setEtiquetas((l) => l.filter((e) => e.id !== etiqueta.id)); avisar('No se pudo agregar'); }
  }

  async function quitarEtiqueta(etiqueta) {
    setEtiquetas((l) => l.filter((e) => e.id !== etiqueta.id));
    const { error } = await supabase.from('contacto_etiquetas').delete().match({ contacto_id: contacto.id, etiqueta_id: etiqueta.id });
    if (error) { setEtiquetas((l) => [...l, etiqueta]); avisar('No se pudo quitar'); }
  }

  const etapaActual = etapas.find((e) => e.id === contacto.etapa_id);
  const embudo = etapas.filter((e) => e.nombre !== 'Perdido');
  const disponibles = catalogo.filter((e) => !etiquetas.some((x) => x.id === e.id));

  return (
    <aside className={`ficha${abierta ? ' abierta' : ''}`} aria-label="Ficha del lead">
      <div className="ficha-cabecera">
        {/* Flechita para volver al chat (a la izquierda), título al medio */}
        <button type="button" className="boton-icono boton-cerrar-ficha" aria-label="Volver al chat" onClick={onCerrar}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="ficha-rotulo">Ficha del lead</span>
        <span className="ficha-aviso" role="status">{aviso}</span>
      </div>

      <ProximoPaso conversacionId={conversacion.id} contactoId={contacto.id} temperaturaInicial={contacto.temperatura}
        inicial={{
          seguimiento_at: conversacion.seguimiento_at, seguimiento_motivo: conversacion.seguimiento_motivo, seguimiento_responsable: conversacion.seguimiento_responsable,
          seguimiento_cadencia: conversacion.seguimiento_cadencia, seguimientos_sin_respuesta: conversacion.seguimientos_sin_respuesta,
          seguimiento_plantillas: conversacion.seguimiento_plantillas, consejo_ia: conversacion.consejo_ia
        }} />

      <Venta key={dniLeido ?? 'sin-dni'} conversacionId={conversacion.id} contacto={contacto} etapas={etapas} dniLeido={dniLeido}
        onCambio={(campos) => setContacto((c) => ({ ...c, ...campos }))} />

      <Documentacion contacto={contacto} etapa={etapas.find((e) => e.id === contacto.etapa_id)?.nombre}
        inicial={(conversacion.contacto.documentos ?? []).sort((a, b) => a.creado_at.localeCompare(b.creado_at))}
        onContacto={(campos) => setContacto((c) => ({ ...c, ...campos }))} />

      <label className="campo">
        <span>Nombre</span>
        <input defaultValue={contacto.nombre ?? ''} placeholder={nombreVisible(contacto)}
          onBlur={(e) => e.target.value.trim() !== (contacto.nombre ?? '') && guardar({ nombre: e.target.value.trim() || null })} />
      </label>

      <div className="bloque">
        <span className="bloque-titulo">Etapa</span>
        <div className="embudo" aria-hidden="true">
          {embudo.map((e) => (
            <span key={e.id} className="embudo-paso"
              style={{ background: etapaActual && etapaActual.nombre !== 'Perdido' && e.orden <= etapaActual.orden ? etapaActual.color : '#DDE2E0' }} />
          ))}
        </div>
        <select value={perdiendo ?? contacto.etapa_id ?? ''} aria-label="Etapa del embudo"
          onChange={(e) => {
            const id = Number(e.target.value);
            // Pasar a Perdido pide el motivo (sirve para el reporte de pérdidas)
            if (etapas.find((x) => x.id === id)?.nombre === 'Perdido') setPerdiendo(id);
            else { setPerdiendo(null); guardar({ etapa_id: id }); }
          }}>
          {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        {perdiendo && (
          <div className="motivo-perdida">
            <span className="bloque-titulo">¿Por qué se perdió?</span>
            <div className="pp-atajos">
              {Object.entries(MOTIVOS_PERDIDA).map(([k, r]) => (
                <button key={k} type="button" className="chip-filtro" onClick={async () => {
                  await guardar({ etapa_id: perdiendo, motivo_perdida: k });
                  await supabase.from('conversaciones').update({ seguimiento_at: null, seguimiento_motivo: null }).eq('id', conversacion.id);
                  setPerdiendo(null);
                }}>{r}</button>
              ))}
              <button type="button" className="chip-filtro" onClick={() => setPerdiendo(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {!perdiendo && etapaActual?.nombre === 'Perdido' && contacto.motivo_perdida && (
          <span className="selector-detalle">Motivo: {MOTIVOS_PERDIDA[contacto.motivo_perdida] ?? contacto.motivo_perdida}</span>
        )}
      </div>

      {conversacion.resumen_ia && (
        <div className="bloque resumen">
          <span className="bloque-titulo">Resumen de la IA</span>
          <p>{conversacion.resumen_ia}</p>
        </div>
      )}

      <div className="bloque">
        <span className="bloque-titulo">Etiquetas</span>
        <div className="ficha-etiquetas">
          {etiquetas.map((e) => (
            <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>
              {e.nombre}
              <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => quitarEtiqueta(e)}>×</button>
            </span>
          ))}
        </div>
        {creando ? (
          <form className="agregar-etiqueta" onSubmit={(ev) => {
            ev.preventDefault();
            const nombre = ev.currentTarget.elements.etiqueta.value.trim();
            if (nombre) agregarEtiqueta(nombre);
            setCreando(false);
          }}>
            <span className="etq-colores" role="radiogroup" aria-label="Color de la etiqueta">
              {COLORES_ETIQUETA.slice(0, 8).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={colorNueva === c} aria-label={`Color ${c}`}
                  className={`etq-color${colorNueva === c ? ' activo' : ''}`} style={{ background: c }} onClick={() => setColorNueva(c)} />
              ))}
            </span>
            <input name="etiqueta" autoFocus placeholder="Nombre de la etiqueta" aria-label="Nombre de la etiqueta nueva"
              onKeyDown={(ev) => ev.key === 'Escape' && setCreando(false)} />
            <button type="submit" className="boton-secundario">Crear</button>
          </form>
        ) : (
          <select value="" aria-label="Agregar etiqueta" onChange={(ev) => {
            if (ev.target.value === 'nueva') setCreando(true);
            else if (ev.target.value) agregarEtiqueta(ev.target.value);
          }}>
            <option value="">+ Agregar etiqueta</option>
            {disponibles.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            <option value="nueva">+ Nueva etiqueta…</option>
          </select>
        )}
      </div>

      <dl className="datos">
        <div><dt>Origen</dt><dd>{ORIGENES[contacto.origen]}{contacto.origen_detalle ? ` · ${contacto.origen_detalle}` : ''}</dd></div>
        {contacto.relevamiento?.situacion && <div><dt>Situación</dt><dd>{contacto.relevamiento.situacion}</dd></div>}
        {[['empleador', 'Empleador'], ['empleador_conyuge', 'Empleador cónyuge']].map(([clave, rotulo]) => {
          const e = contacto.relevamiento?.[clave];
          if (!e?.razon_social && !e?.cuit) return null;
          return <div key={clave}><dt>{rotulo}</dt><dd>{e.razon_social ?? 'Sin razón social'}{e.cuit ? ` · CUIT ${cuitLindo(e.cuit)}` : ''}</dd></div>;
        })}
      </dl>

      <label className="campo">
        <span>Email</span>
        <input type="email" defaultValue={contacto.email ?? ''} placeholder="Sin email"
          onBlur={(e) => e.target.value.trim() !== (contacto.email ?? '') && guardar({ email: e.target.value.trim() || null })} />
      </label>

      <label className="campo">
        <span>Notas</span>
        <textarea rows={4} defaultValue={contacto.notas ?? ''} placeholder="Notas internas (el lead no las ve)"
          onBlur={(e) => e.target.value !== (contacto.notas ?? '') && guardar({ notas: e.target.value || null })} />
      </label>

      <Cotizacion key={JSON.stringify(contacto.cotizacion?.sueldos ?? [])} conversacionId={conversacion.id} contacto={contacto} lista={lista} audios={audios}
        onContacto={(campos) => setContacto((c) => ({ ...c, ...campos }))} />
    </aside>
  );
}
