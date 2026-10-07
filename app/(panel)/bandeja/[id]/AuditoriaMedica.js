'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { enviarDesdeBandeja } from './acciones';
import { fechaCorta, nombreVisible, ventana } from '@/lib/formato';
import { PREFIJO_FORMULARIOS } from '@/lib/formularios';

/**
 * Auditoría médica: botoncito "AM +" de la ficha (la mayoría de los leads no pasa por auditoría, así no ocupa lugar).
 * Abre un pop-up con los formularios marcados como "de auditoría médica" en la sección Formularios (resumen de
 * historia clínica, certificado de buena salud…): se toca uno y se le manda al cliente por WhatsApp.
 */
export default function AuditoriaMedica({ conversacion, formularios = [], onContacto }) {
  const dialogo = useRef(null);
  const [expira, setExpira] = useState(conversacion.ventana_expira_at);
  const [enviados, setEnviados] = useState({}); // media_path → cuándo se le mandó a este cliente
  const [error, setError] = useState('');
  const [cual, setCual] = useState(null);
  const [movido, setMovido] = useState(false); // con este envío el lead pasó a la columna Auditoría médica
  const [enviando, iniciar] = useTransition();

  const deAM = formularios.filter((f) => f.auditoria_medica);
  const ruta = (f) => `${PREFIJO_FORMULARIOS}${f.path}`;
  const abierta = ventana(expira).abierta;

  async function abrir() {
    setError('');
    dialogo.current?.showModal();
    // Al abrir: cómo está la ventana de 24 h ahora y cuáles ya se le mandaron a este cliente
    const supabase = createClient();
    const [{ data: conv }, { data: mensajes }] = await Promise.all([
      supabase.from('conversaciones').select('ventana_expira_at').eq('id', conversacion.id).maybeSingle(),
      deAM.length
        ? supabase.from('mensajes').select('media_path, creado_at').eq('conversacion_id', conversacion.id).eq('direccion', 'saliente')
          .in('media_path', deAM.map(ruta)).order('creado_at')
        : Promise.resolve({ data: [] })
    ]);
    if (conv) setExpira(conv.ventana_expira_at);
    setEnviados(Object.fromEntries((mensajes ?? []).map((m) => [m.media_path, m.creado_at])));
  }

  function enviar(f) {
    if (enviados[ruta(f)] && !confirm(`Ya le mandaste "${f.nombre}" (${fechaCorta(enviados[ruta(f)])}). ¿Mandarlo de nuevo?`)) return;
    setError(''); setCual(f.id);
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conversacion.id, { tipo: 'formulario', formularioId: f.id });
      setCual(null);
      if (r?.error) return setError(r.error);
      setEnviados((e) => ({ ...e, [ruta(f)]: new Date().toISOString() }));
      if (r.etapaId) { setMovido(true); onContacto?.({ etapa_id: r.etapaId }); }
    });
  }

  return (
    <div className="am">
      <button type="button" className="am-boton" onClick={abrir} title="Auditoría médica: formularios para mandarle al cliente">
        AM <span aria-hidden="true">+</span><span className="oculto">: formularios de auditoría médica</span>
      </button>

      <dialog ref={dialogo} className="dialogo dialogo-am" aria-labelledby="titulo-am">
        <div className="selector-cabecera">
          <h2 id="titulo-am">Auditoría médica</h2>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => dialogo.current?.close()}>×</button>
        </div>
        <p className="selector-detalle">Tocá un formulario y se lo manda a {nombreVisible(conversacion.contacto)} por WhatsApp.</p>
        {!abierta && deAM.length > 0 && (
          <p className="aviso-error" role="alert">Pasaron más de 24 h desde su último mensaje: WhatsApp no deja mandar archivos. Mandale primero una plantilla y, cuando conteste, volvé acá.</p>
        )}
        {error && <p className="aviso-error" role="alert">{error}</p>}
        {movido && <p className="am-movido" role="status">Listo: pasó a la columna Auditoría médica. Sale de Mis chats y vuelve cuando conteste.</p>}

        <ul className="am-lista">
          {deAM.map((f) => (
            <li key={f.id}>
              <button type="button" className="am-formulario" disabled={enviando || !abierta} onClick={() => enviar(f)}>
                <span className="formulario-icono" aria-hidden="true">📋</span>
                <span className="am-formulario-texto">
                  <strong>{f.nombre}</strong>
                  {f.descripcion && <span className="selector-detalle">{f.descripcion}</span>}
                  {enviados[ruta(f)] && <span className="am-enviado">✓ Enviado {fechaCorta(enviados[ruta(f)])}</span>}
                </span>
                <span className="am-accion">{cual === f.id ? 'Enviando…' : enviados[ruta(f)] ? 'Reenviar' : 'Enviar'}</span>
              </button>
              <a className="am-ver" href={`/api/archivo?path=${encodeURIComponent(ruta(f))}`} target="_blank" rel="noreferrer" title="Ver el formulario">Ver</a>
            </li>
          ))}
        </ul>
        {deAM.length === 0 && (
          <p className="selector-vacio">
            Todavía no hay formularios de auditoría médica. Subilos en <Link href="/formularios">Formularios</Link> y tildá «Es de auditoría médica».
          </p>
        )}
        {deAM.length > 0 && !movido && (
          <p className="selector-detalle">Al mandar un formulario, el lead pasa a la columna Auditoría médica y sale de Mis chats hasta que conteste.</p>
        )}
      </dialog>
    </div>
  );
}
