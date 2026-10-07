'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { pesos } from '@/lib/cotizador';
import { cuitLindo, DOCUMENTOS_REQUERIDOS, TIPOS_DOCUMENTO } from '@/lib/formato';
import { tipoDeModalidad } from '@/lib/venta';
import { borrarDocumento, clasificarDocumento, registrarDocumento, releerDocumento, renombrarDocumento, verDocumentoCliente } from './acciones';
import VisorArchivo, { muestraPdf, tipoArchivo } from '../../componentes/VisorArchivo';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
const cubre = { dni_frente: ['dni_frente', 'dni_completo'], dni_dorso: ['dni_dorso', 'dni_completo'], recibo: ['recibo'], opcion_cambio: ['opcion_cambio'] };

function resumen(d) {
  const x = d.datos ?? {};
  if (d.tipo?.startsWith('dni')) return [x.nombre_completo, x.dni && `DNI ${Number(x.dni).toLocaleString('es-AR')}`, x.fecha_nacimiento && `nac. ${x.fecha_nacimiento.split('-').reverse().join('/')}`];
  if (d.tipo === 'recibo') return [x.sueldo_bruto && `bruto ${pesos(x.sueldo_bruto)}`, x.empleador && `${x.empleador}${x.cuit_empleador ? ` (CUIT ${cuitLindo(x.cuit_empleador)})` : ''}`, x.periodo, x.obra_social_actual && `OS ${x.obra_social_actual}`];
  if (d.tipo === 'opcion_cambio') return [x.obra_social_actual && x.obra_social_destino ? `${x.obra_social_actual} → ${x.obra_social_destino}` : x.obra_social_destino, x.firmada === false ? 'sin firma' : x.firmada ? 'firmada' : null];
  return [d.nombre_archivo];
}

// Miniatura del documento (foto en chico; PDF con ícono). El link firmado vale 10 min.
const linkDoc = (d) => (d.path ? `/api/archivo?path=${encodeURIComponent(`clientes/${d.path}`)}` : null);
function Miniatura({ doc, onAbrir }) {
  const url = linkDoc(doc);
  const tipo = tipoArchivo(doc.nombre_archivo ?? '', doc.mime ?? '');
  return (
    <button type="button" className="doc-mini" aria-label="Ver documento" onClick={() => onAbrir({ url, tipo, nombre: doc.etiqueta ?? doc.nombre_archivo ?? 'Documento' })}>
      {tipo === 'imagen' && url ? <img src={url} alt="" />
        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>}
      {tipo === 'pdf' && <span className="doc-mini-pdf">PDF</span>}
    </button>
  );
}

/**
 * Documentación del cliente. Para no llenar la ficha, aparece recién cuando llega el primer documento
 * (o en "Por cerrar" / "Falta de cobro", que es cuando se piden).
 */
export default function Documentacion({ contacto, etapa, inicial, onContacto }) {
  const supabase = createClient();
  const [docs, setDocs] = useState(inicial);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [renombrando, setRenombrando] = useState(null);
  const [visor, setVisor] = useState(null);
  const archivoRef = useRef(null);

  async function guardarNombre(d, valor) {
    setRenombrando(null);
    if (!valor.trim() || valor.trim() === d.etiqueta) return;
    setDocs((l) => l.map((x) => (x.id === d.id ? { ...x, etiqueta: valor.trim() } : x)));
    const r = await renombrarDocumento(d.id, valor);
    if (r.error) setAviso(r.error);
  }

  // En vivo: cuando llega un documento por WhatsApp o la IA termina de leerlo
  useEffect(() => {
    const canal = supabase.channel(`docs-${contacto.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentos_cliente', filter: `contacto_id=eq.${contacto.id}` },
        ({ eventType, new: fila, old }) => setDocs((l) => {
          if (eventType === 'DELETE') return l.filter((d) => d.id !== old.id);
          return l.some((d) => d.id === fila.id) ? l.map((d) => (d.id === fila.id ? fila : d)) : [...l, fila];
        }))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [contacto.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!docs.length && !['Por cerrar', 'Falta de cobro'].includes(etapa)) return null;

  const modalidad = contacto.venta?.tipo ?? tipoDeModalidad(contacto.cotizacion?.modalidad);
  const tiene = (req) => (req === 'email' ? Boolean(contacto.email) : docs.some((d) => cubre[req].includes(d.tipo)));
  const faltan = DOCUMENTOS_REQUERIDOS[modalidad].filter((r) => !tiene(r));

  async function subir(ev) {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    setSubiendo(true); setAviso('');
    try {
      const path = `${contacto.id}/${crypto.randomUUID()}.${EXT[archivo.type] ?? 'bin'}`;
      const { error } = await supabase.storage.from('documentos-clientes').upload(path, archivo, { contentType: archivo.type || undefined });
      if (error) throw error;
      const r = await registrarDocumento(contacto.id, { path, mime: archivo.type, nombre: archivo.name });
      if (r.error) throw new Error(r.error);
      setDocs((l) => (l.some((d) => d.id === r.doc.id) ? l.map((d) => (d.id === r.doc.id ? r.doc : d)) : [...l, r.doc]));
    } catch (e) {
      setAviso(`No se pudo subir: ${e.message}`);
    } finally {
      setSubiendo(false);
    }
  }

  // "Ver": ventana emergente dentro del CRM (link nuevo, por si el de la miniatura venció)
  async function ver(d) {
    const nombre = d.etiqueta ?? d.nombre_archivo ?? 'Documento';
    const tipo = tipoArchivo(d.nombre_archivo ?? '', d.mime ?? '');
    const directo = linkDoc(d);
    if (directo) {
      if (tipo === 'pdf' && !muestraPdf()) window.open(directo, '_blank'); else setVisor({ url: directo, nombre, tipo });
      return;
    }
    setVisor({ url: null, nombre, tipo });
    const r = await verDocumentoCliente(d.id);
    if (r.url) setVisor({ url: r.url, nombre, tipo }); else { setVisor(null); setAviso(r.error ?? 'No se pudo abrir'); }
  }

  async function usarSueldo(d, i) {
    const sueldos = [...(contacto.cotizacion?.sueldos ?? ['', ''])];
    sueldos[i] = String(Math.round(d.datos.sueldo_bruto));
    const cotizacion = { ...(contacto.cotizacion ?? {}), sueldos, modalidad: 'derivacion' };
    const { error } = await supabase.from('contactos').update({ cotizacion }).eq('id', contacto.id);
    if (error) return setAviso('No se pudo cargar el sueldo');
    onContacto({ cotizacion });
    setAviso(`Sueldo cargado en el cotizador (${i ? 'pareja' : 'titular'})`);
  }

  return (
    <div className="bloque documentacion">
      <div className="doc-cabecera">
        <span className="bloque-titulo">Documentación · {modalidad === 'desregulado' ? 'desregulado' : 'directo'}</span>
        <button type="button" className="boton-link-texto" disabled={subiendo} onClick={() => archivoRef.current?.click()}>
          {subiendo ? 'Leyendo…' : '+ Adjuntar'}
        </button>
        <input ref={archivoRef} type="file" accept="image/*,application/pdf" hidden onChange={subir} />
      </div>

      <div className="doc-checklist">
        {DOCUMENTOS_REQUERIDOS[modalidad].map((r) => (
          <span key={r} className={`doc-req${tiene(r) ? ' ok' : ''}`}>{tiene(r) ? '✓' : '·'} {r === 'email' ? 'Email' : TIPOS_DOCUMENTO[r]}</span>
        ))}
      </div>
      {faltan.length === 0 && <span className="selector-detalle">Documentación completa ✓</span>}

      {docs.map((d) => (
        <div key={d.id} className={`doc-fila${d.estado === 'ilegible' || d.estado === 'error' ? ' alerta' : ''}`}>
          <Miniatura doc={d} onAbrir={() => ver(d)} />
          <div className="doc-info">
          {renombrando === d.id ? (
            <input className="doc-nombre-input" autoFocus defaultValue={d.etiqueta ?? ''} maxLength={80} list="doc-nombres"
              onBlur={(e) => guardarNombre(d, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenombrando(null); }} />
          ) : (
            <button type="button" className="doc-nombre" title="Cambiar el nombre" onClick={() => setRenombrando(d.id)}>
              {d.etiqueta ?? d.nombre_archivo ?? TIPOS_DOCUMENTO[d.tipo]} <span aria-hidden="true">✎</span>
            </button>
          )}
          <div className="doc-linea">
            <select value={d.tipo} aria-label="Tipo de documento" onChange={async (e) => {
              const tipo = e.target.value;
              setDocs((l) => l.map((x) => (x.id === d.id ? { ...x, tipo } : x)));
              const r = await clasificarDocumento(d.id, tipo);
              if (r.etiqueta) setDocs((l) => l.map((x) => (x.id === d.id ? { ...x, etiqueta: r.etiqueta } : x)));
            }}>
              {Object.entries(TIPOS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <button type="button" className="boton-link-texto" onClick={() => ver(d)}>Ver</button>
            <button type="button" className="boton-link-texto peligro" aria-label="Borrar documento"
              onClick={async () => confirm('¿Borrar este documento?') && (await borrarDocumento(d.id)).ok && setDocs((l) => l.filter((x) => x.id !== d.id))}>✕</button>
          </div>
          {d.estado === 'leyendo'
            ? <span className="selector-detalle">La IA lo está leyendo…</span>
            : <span className="selector-detalle">{resumen(d).filter(Boolean).join(' · ')}</span>}
          {d.observacion && (
            <span className="doc-obs">
              {d.observacion}
              {d.estado === 'error' && <button type="button" className="boton-link-texto" onClick={async () => { const r = await releerDocumento(d.id); if (r.doc) setDocs((l) => l.map((x) => (x.id === d.id ? r.doc : x))); }}>Reintentar</button>}
            </span>
          )}
          {d.tipo === 'recibo' && d.datos?.sueldo_bruto > 0 && (
            <span className="doc-usar">Cargar en el cotizador:
              <button type="button" className="boton-link-texto" onClick={() => usarSueldo(d, 0)}>titular</button>
              <button type="button" className="boton-link-texto" onClick={() => usarSueldo(d, 1)}>pareja</button>
            </span>
          )}
          </div>
        </div>
      ))}
      {visor && <VisorArchivo {...visor} onCerrar={() => setVisor(null)} />}
      <datalist id="doc-nombres">
        {['DNI TITULAR', 'DNI CÓNYUGE', 'DNI HIJO', `RECIBO DE SUELDO (${contacto.nombre ?? ''})`, `OPCIÓN DE CAMBIO (${contacto.nombre ?? ''})`].map((n) => <option key={n} value={n} />)}
      </datalist>
      {aviso && <span className="pp-aviso">{aviso}</span>}
    </div>
  );
}
