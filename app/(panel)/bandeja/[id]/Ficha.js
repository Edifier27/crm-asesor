'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { colorEtiqueta, nombreVisible } from '@/lib/formato';
import Cotizacion from './Cotizacion';

const ORIGENES = { swiss_medical: 'Swiss Medical', web: 'Web', whatsapp: 'WhatsApp', manual: 'Manual' };

export default function Ficha({ conversacion, etapas, todasEtiquetas, lista, abierta, onCerrar }) {
  const supabase = createClient();
  const [contacto, setContacto] = useState(conversacion.contacto);
  const [etiquetas, setEtiquetas] = useState(conversacion.contacto.etiquetas.map((e) => e.etiqueta).filter(Boolean));
  const [catalogo, setCatalogo] = useState(todasEtiquetas);
  const [aviso, setAviso] = useState('');
  const [creando, setCreando] = useState(false);

  const avisar = (texto) => { setAviso(texto); setTimeout(() => setAviso(''), 2000); };

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
      const { data, error } = await supabase.from('etiquetas').insert({ nombre: valor.trim(), color: '#3E4A47' }).select().single();
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
        <span className="ficha-rotulo">Ficha del lead</span>
        <span className="ficha-aviso" role="status">{aviso}</span>
        <button type="button" className="boton-icono boton-cerrar-ficha" aria-label="Cerrar ficha" onClick={onCerrar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

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
        <select value={contacto.etapa_id ?? ''} onChange={(e) => guardar({ etapa_id: Number(e.target.value) })} aria-label="Etapa del embudo">
          {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
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

      <Cotizacion conversacionId={conversacion.id} contacto={contacto} lista={lista}
        onContacto={(campos) => setContacto((c) => ({ ...c, ...campos }))} />
    </aside>
  );
}
