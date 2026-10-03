'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TEMPERATURAS, cuandoSeguimiento } from '@/lib/formato';
import { ajustarAHorarioHabil } from '@/lib/horario';

// Atajos de un toque (hora local del navegador)
function enHoras(h) { return new Date(Date.now() + h * 3_600_000); }
function aLas10(diasMas) { const d = new Date(); d.setDate(d.getDate() + diasMas); d.setHours(10, 0, 0, 0); return d; }
function proximoLunes() { const d = new Date(); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); d.setHours(10, 0, 0, 0); return d; }
const ATAJOS = [['En 2 h', () => enHoras(2)], ['Mañana', () => aLas10(1)], ['En 3 días', () => aLas10(3)], ['Lunes', proximoLunes]];

// Secuencias de insistencia si el lead no responde (horas). La temperatura propone una; el asesor la cambia.
export const SECUENCIAS = [
  { id: 'rapida', rotulo: 'Rápida', horas: [24, 48, 72], temperatura: 'caliente' },
  { id: 'normal', rotulo: 'Normal', horas: [48, 72, 120], temperatura: 'tibio' },
  { id: 'espaciada', rotulo: 'Espaciada', horas: [120, 240, 480], temperatura: 'frio' },
  { id: 'ninguna', rotulo: 'No insistir', horas: [] }
];
export const textoHoras = (h) => (h <= 72 ? `${h} h` : `${Math.round(h / 24)} d`);
const secuenciaDe = (horas) => SECUENCIAS.find((s) => s.horas.length && JSON.stringify(s.horas) === JSON.stringify(horas));

const aInputLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * Próximo paso del lead: cuándo, qué y quién (IA o el asesor) + temperatura.
 * Lo completa la IA sola; acá el asesor lo ve y lo pisa con un toque.
 */
export default function ProximoPaso({ conversacionId, contactoId, inicial, temperaturaInicial }) {
  const supabase = createClient();
  const [paso, setPaso] = useState(inicial);              // { seguimiento_at, seguimiento_motivo, seguimiento_responsable, seguimiento_cadencia, seguimientos_sin_respuesta }
  const [temperatura, setTemperatura] = useState(temperaturaInicial);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [, refrescar] = useState(0);
  const [aviso, setAviso] = useState('');

  // En vivo: la IA puede reprogramar mientras la ficha está abierta
  useEffect(() => {
    const canal = supabase.channel(`paso-${conversacionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversaciones', filter: `id=eq.${conversacionId}` },
        ({ new: f }) => setPaso({
          seguimiento_at: f.seguimiento_at, seguimiento_motivo: f.seguimiento_motivo, seguimiento_responsable: f.seguimiento_responsable,
          seguimiento_cadencia: f.seguimiento_cadencia, seguimientos_sin_respuesta: f.seguimientos_sin_respuesta
        }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contactos', filter: `id=eq.${contactoId}` },
        ({ new: f }) => setTemperatura(f.temperatura))
      .subscribe();
    const reloj = setInterval(() => refrescar((n) => n + 1), 60_000);
    return () => { supabase.removeChannel(canal); clearInterval(reloj); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionId, contactoId]);

  function abrirEditor() {
    setBorrador({
      cuando: paso.seguimiento_at ? aInputLocal(new Date(paso.seguimiento_at)) : aInputLocal(aLas10(1)),
      motivo: paso.seguimiento_motivo ?? '',
      responsable: paso.seguimiento_responsable ?? 'ia',
      // Secuencia actual, o la que propone la temperatura
      cadencia: paso.seguimiento_cadencia ?? SECUENCIAS.find((s) => s.temperatura === temperatura)?.horas ?? []
    });
    setEditando(true);
  }

  // Quién lo hace define también quién atiende: "la IA" → modo IA; "yo" → entra a Mis chats
  async function guardar(cambios) {
    const nuevo = { ...paso, ...cambios };
    setPaso(nuevo); setEditando(false);
    await supabase.from('conversaciones').update({
      ...cambios,
      ...(cambios.seguimiento_responsable ? { modo: cambios.seguimiento_responsable === 'ia' ? 'ia' : 'humano' } : {}),
      ...(cambios.seguimiento_at ? { seguimientos_sin_respuesta: 0 } : {})
    }).eq('id', conversacionId);
    if (cambios.seguimiento_at) setPaso((p) => ({ ...p, seguimientos_sin_respuesta: 0 }));
  }

  async function cambiarTemperatura(t) {
    const valor = temperatura === t ? null : t;
    setTemperatura(valor);
    await supabase.from('contactos').update({ temperatura: valor }).eq('id', contactoId);
    // Si la IA tiene un seguimiento en curso, la temperatura ajusta la secuencia de insistencia
    const sugerida = SECUENCIAS.find((s) => s.temperatura === valor);
    if (sugerida && paso.seguimiento_at && paso.seguimiento_responsable !== 'asesor') {
      setPaso((p) => ({ ...p, seguimiento_cadencia: sugerida.horas }));
      await supabase.from('conversaciones').update({ seguimiento_cadencia: sugerida.horas }).eq('id', conversacionId);
      setAviso(`Secuencia ${sugerida.rotulo.toLowerCase()}: ${sugerida.horas.map(textoHoras).join(' → ')}`);
    }
  }

  const cuando = cuandoSeguimiento(paso.seguimiento_at);
  const esIA = paso.seguimiento_responsable !== 'asesor';

  return (
    <div className={`proximo-paso${cuando?.vencido ? ' vencido' : ''}`}>
      <div className="pp-cabecera">
        <span className="bloque-titulo">Próximo paso</span>
        <div className="pp-temperaturas" role="group" aria-label="Temperatura del lead">
          {Object.entries(TEMPERATURAS).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={temperatura === k} title={t.rotulo}
              className={`pp-temp${temperatura === k ? ' activa' : ''}`} style={{ '--temp': t.color }} onClick={() => cambiarTemperatura(k)}>
              <span className="punto" />{t.rotulo}
            </button>
          ))}
        </div>
      </div>

      {!editando && (
        cuando ? (
          <>
          <button type="button" className="pp-resumen" onClick={abrirEditor}>
            <span className={`pp-quien ${esIA ? 'ia' : 'yo'}`}>{esIA ? 'IA' : 'Vos'}</span>
            <span className="pp-texto">
              <strong>{cuando.texto}</strong>
              <span>{paso.seguimiento_motivo ?? 'Seguimiento'}</span>
            </span>
            <span className="pp-editar">Cambiar</span>
          </button>
          {esIA && paso.seguimiento_cadencia?.length > 0 && (
            <span className="pp-secuencia">
              Si no responde: {paso.seguimiento_cadencia.map(textoHoras).join(' → ')}
              {' · '}intento {Math.min((paso.seguimientos_sin_respuesta ?? 0) + 1, paso.seguimiento_cadencia.length)} de {paso.seguimiento_cadencia.length}
            </span>
          )}
          </>
        ) : (
          <button type="button" className="pp-vacio" onClick={abrirEditor}>Sin próximo paso · <strong>Programar</strong></button>
        )
      )}

      {aviso && !editando && <span className="pp-aviso">{aviso}</span>}

      {/* Terminó la secuencia sin respuesta: decisión de un toque */}
      {!editando && paso.seguimiento_responsable === 'asesor' && /^No respondió/.test(paso.seguimiento_motivo ?? '') && (
        <div className="pp-decision">
          <button type="button" className="boton-secundario peligro" onClick={async () => {
            const { data: perdido } = await supabase.from('etapas').select('id').eq('nombre', 'Perdido').single();
            await supabase.from('contactos').update({ etapa_id: perdido.id, motivo_perdida: 'no_responde', temperatura: 'frio' }).eq('id', contactoId);
            await guardar({ seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null });
            setAviso('Marcado como perdido: no responde.');
          }}>Marcar perdido · No responde</button>
          <button type="button" className="boton-secundario" onClick={async () => {
            const { fecha } = ajustarAHorarioHabil(enHoras(30 * 24));
            await guardar({
              seguimiento_at: fecha.toISOString(), seguimiento_motivo: 'Reactivación a 30 días: retomar con una novedad (precios, promo)',
              seguimiento_responsable: 'ia', seguimiento_cadencia: [720]
            });
            setAviso(`La IA lo reintenta ${cuandoSeguimiento(fecha.toISOString())?.texto}.`);
          }}>Reactivar en 30 días</button>
          <button type="button" className="boton-secundario" onClick={abrirEditor}>Insistir de nuevo</button>
        </div>
      )}

      {editando && borrador && (
        <div className="pp-editor">
          <div className="pp-atajos">
            {ATAJOS.map(([r, f]) => (
              <button key={r} type="button" className="chip-filtro" onClick={() => setBorrador({ ...borrador, cuando: aInputLocal(f()) })}>{r}</button>
            ))}
          </div>
          <input type="datetime-local" value={borrador.cuando} onChange={(e) => setBorrador({ ...borrador, cuando: e.target.value })} aria-label="Fecha y hora" />
          <input value={borrador.motivo} maxLength={200} placeholder="¿Qué hay que hacer? Ej.: preguntar si lo habló con la pareja"
            onChange={(e) => setBorrador({ ...borrador, motivo: e.target.value })} aria-label="Motivo" />
          <div className="pp-responsable" role="radiogroup" aria-label="Quién lo hace">
            {[['ia', 'Lo hace la IA'], ['asesor', 'Lo hago yo']].map(([v, r]) => (
              <label key={v} className={`chip-filtro${borrador.responsable === v ? ' activo' : ''}`}>
                <input type="radio" name="responsable" value={v} checked={borrador.responsable === v} className="oculto"
                  onChange={() => setBorrador({ ...borrador, responsable: v })} />{r}
              </label>
            ))}
          </div>
          {borrador.responsable === 'ia' && (
            <div className="pp-secuencias">
              <span className="bloque-titulo">Si no responde, insistir</span>
              <div className="pp-atajos">
                {SECUENCIAS.map((s) => {
                  const activa = s.horas.length ? secuenciaDe(borrador.cadencia)?.id === s.id : !borrador.cadencia?.length;
                  return (
                    <button key={s.id} type="button" className={`chip-filtro${activa ? ' activo' : ''}`} aria-pressed={activa}
                      title={s.temperatura ? `Sugerida para leads ${TEMPERATURAS[s.temperatura].rotulo.toLowerCase()}s` : ''}
                      onClick={() => setBorrador({
                        ...borrador, cadencia: s.horas,
                        // El primer mensaje sale al cumplirse el primer tiempo de la secuencia
                        ...(s.horas.length ? { cuando: aInputLocal(ajustarAHorarioHabil(enHoras(s.horas[0])).fecha) } : {})
                      })}>
                      {s.rotulo}{s.horas.length ? ` · ${s.horas.map(textoHoras).join(' → ')}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="pp-explicacion">
            {borrador.responsable === 'ia'
              ? (borrador.cadencia?.length
                ? `La IA le escribe en la fecha elegida; si no contesta, vuelve a insistir a las ${borrador.cadencia.slice(1).map(textoHoras).join(' y ') || '—'} y después te lo pasa. Si contesta, la secuencia se corta. Con más de 24 h sin respuesta del cliente usa la plantilla aprobada que mejor encaje. Lun a vie de 8 a 20.`
                : 'Ese día la IA le escribe sola según el motivo, una sola vez. Si ya pasaron 24 h desde su último mensaje, le manda la plantilla aprobada que mejor encaje. Lun a vie de 8 a 20.')
              : 'Ese día te aparece en Mis chats (filtro "Para hoy") para que le escribas vos. No sale nada automático.'}
          </p>
          <div className="acciones">
            <button type="button" className="boton-primario" disabled={!borrador.cuando}
              onClick={() => {
                // Lun-vie 8-20: lo que cae fuera de horario se corre solo (ej.: sábado → lunes)
                const { fecha, movida } = ajustarAHorarioHabil(new Date(borrador.cuando));
                setAviso(movida ? `Fuera de horario: se programó para ${cuandoSeguimiento(fecha.toISOString())?.texto}.` : '');
                guardar({
                seguimiento_at: fecha.toISOString(),
                seguimiento_motivo: borrador.motivo.trim() || null,
                seguimiento_responsable: borrador.responsable,
                seguimiento_cadencia: borrador.responsable === 'ia' && borrador.cadencia?.length ? borrador.cadencia : null
              });
              }}>Guardar</button>
            <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>
            {paso.seguimiento_at && (
              <button type="button" className="boton-secundario peligro"
                onClick={() => guardar({ seguimiento_at: null, seguimiento_motivo: null })}>Quitar</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
