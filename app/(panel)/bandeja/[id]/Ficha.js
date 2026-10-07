'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAT_CERRADO } from '@/lib/consultas';
import { corregirTelefono } from './acciones';
import { COLORES_ETIQUETA, MOTIVOS_PERDIDA, colorEtiqueta, cuitLindo, nombreVisible } from '@/lib/formato';
import Cotizacion from './Cotizacion';
import ProximoPaso from './ProximoPaso';
import Venta from './Venta';
import Documentacion from './Documentacion';
import AuditoriaMedica from './AuditoriaMedica';

const ORIGENES = { swiss_medical: 'Swiss Medical', web: 'Web', whatsapp: 'WhatsApp', manual: 'Manual' };

export default function Ficha({ conversacion, etapas, todasEtiquetas, lista, audios = [], formularios = [], abierta, onCerrar }) {
  const supabase = createClient();
  const router = useRouter();
  const [contacto, setContacto] = useState(conversacion.contacto);
  const [etiquetas, setEtiquetas] = useState(conversacion.contacto.etiquetas.map((e) => e.etiqueta).filter(Boolean));
  const [catalogo, setCatalogo] = useState(todasEtiquetas);
  const [aviso, setAviso] = useState('');
  const [creando, setCreando] = useState(false);
  const [colorNueva, setColorNueva] = useState(COLORES_ETIQUETA[0]);
  const [perdiendo, setPerdiendo] = useState(null); // etapa Perdido pendiente de motivo

  // Ancho de la ficha a gusto (pantalla grande): se arrastra su borde izquierdo y se recuerda en este navegador.
  // Va en la raíz de la página y no en este componente, así no pega un salto cada vez que se cambia de chat.
  const ajuste = useRef(null);
  const ponerAncho = (px) => (px ? document.documentElement.style.setProperty('--ancho-ficha', `${px}px`) : document.documentElement.style.removeProperty('--ancho-ficha'));
  useEffect(() => {
    try { const guardado = Number(localStorage.getItem('ficha-ancho')); if (guardado) ponerAncho(guardado); } catch {}
  }, []);
  function empezarAjuste(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    ajuste.current = { x: e.clientX, ancho: e.currentTarget.nextElementSibling.getBoundingClientRect().width };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function moverAjuste(e) {
    const a = ajuste.current;
    if (!a) return;
    a.ultimo = Math.round(Math.min(620, Math.max(280, a.ancho + a.x - e.clientX))); // hacia la izquierda se agranda
    ponerAncho(a.ultimo);
  }
  function terminarAjuste(e) {
    const a = ajuste.current;
    if (!a) return;
    ajuste.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    try { if (a.ultimo) localStorage.setItem('ficha-ancho', String(a.ultimo)); } catch {}
  }
  function anchoNormal() {
    ponerAncho(null);
    try { localStorage.removeItem('ficha-ancho'); } catch {}
  }

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
    <>
    {/* Borde izquierdo de la ficha: arrastrarlo cambia el ancho; doble clic vuelve al ancho de siempre */}
    <div className="ficha-borde" role="separator" aria-orientation="vertical" title="Arrastrá para cambiar el ancho (doble clic: ancho normal)"
      onPointerDown={empezarAjuste} onPointerMove={moverAjuste} onPointerUp={terminarAjuste} onPointerCancel={terminarAjuste} onDoubleClick={anchoNormal} />
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

      {/* El mail va pegado a la documentación (los DNI), arriba del nombre: es lo que se copia para dar el alta */}
      <label className="campo">
        <span>Email</span>
        <input type="email" defaultValue={contacto.email ?? ''} placeholder="Sin email"
          onBlur={(e) => e.target.value.trim() !== (contacto.email ?? '') && guardar({ email: e.target.value.trim() || null })} />
      </label>

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
            else {
              setPerdiendo(null); guardar({ etapa_id: id });
              // Sale de Perdido (se marcó por error o se recuperó): el chat vuelve a Mis chats
              if (etapaActual?.nombre === 'Perdido') supabase.from('conversaciones').update({ modo: 'humano' }).eq('id', conversacion.id).eq('modo', 'pausada').then(() => {});
            }
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
                  // Perdido: el chat se cierra y sale de Mis chats, aunque haya quedado sin contestar
                  await supabase.from('conversaciones').update(CHAT_CERRADO).eq('id', conversacion.id);
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

      {!contacto.telefono && (
        <form className="campo telefono-a-revisar" onSubmit={async (ev) => {
          ev.preventDefault();
          const r = await corregirTelefono(contacto.id, ev.currentTarget.elements.telefono.value);
          if (r.error) return avisar(r.error);
          setContacto((c) => ({ ...c, telefono: r.telefono }));
          if (r.etiquetaQuitada) setEtiquetas((l) => l.filter((e) => e.id !== r.etiquetaQuitada));
          avisar('Teléfono corregido');
          router.refresh();
        }}>
          <span>Teléfono a revisar</span>
          <small>Llegó así: “{contacto.telefono_original || 'sin dato'}”. Corregilo para poder escribirle.</small>
          <div className="telefono-corregir">
            <input name="telefono" inputMode="tel" defaultValue={contacto.telefono_original ?? ''} placeholder="Ej. 11 2233-4455" aria-label="Teléfono corregido" />
            <button type="submit" className="boton-secundario">Corregir</button>
          </div>
        </form>
      )}

      <label className="campo">
        <span>Notas</span>
        <textarea rows={4} defaultValue={contacto.notas ?? ''} placeholder="Notas internas (el lead no las ve)"
          onBlur={(e) => e.target.value !== (contacto.notas ?? '') && guardar({ notas: e.target.value || null })} />
      </label>

      <AuditoriaMedica conversacion={conversacion} formularios={formularios} />

      <Cotizacion key={JSON.stringify(contacto.cotizacion?.sueldos ?? [])} conversacionId={conversacion.id} contacto={contacto} lista={lista} audios={audios}
        onContacto={(campos) => setContacto((c) => ({ ...c, ...campos }))} />
    </aside>
    </>
  );
}
