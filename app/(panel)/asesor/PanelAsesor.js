'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fechaCorta, hora, nombreVisible } from '@/lib/formato';

// El mismo texto que lib/ausencia.js manda si la cuenta no escribió uno propio
const AUSENCIA_TEXTO = 'Hola! Gracias por escribirme. En este momento estoy fuera de horario (lunes a viernes de 8 a 20). Te respondo apenas vuelva 🙌';

// Precios de Claude Sonnet 5.5 por millón de tokens (USD)
const PRECIO = { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 };
const costo = (e) =>
  ((e.tokens_entrada ?? 0) * PRECIO.entrada + (e.tokens_salida ?? 0) * PRECIO.salida +
   (e.tokens_cache_lectura ?? 0) * PRECIO.cacheLectura + (e.tokens_cache_escritura ?? 0) * PRECIO.cacheEscritura) / 1e6;

const RESULTADOS = { respondio: 'Respondió', paso_a_humano: 'Pasó a humano', sin_accion: 'Sin acción', error: 'Error', omitida: 'Omitida' };

const MODOS_IA = [
  { id: 'copiloto', rotulo: 'Manual', config: { modo_ia: 'copiloto' },
    detalle: 'Atendés vos. La IA no le escribe a nadie: ordena la ficha, te deja la tarea con un consejo y siguen las automatizaciones (plantillas de recontacto a quien no contesta).' },
  { id: 'datos', rotulo: 'Automático, solo datos', config: { modo_ia: 'automatico', ia_cotiza: false },
    aviso: '¿Pasar a "solo datos"? La IA les va a escribir a los leads nuevos para pedirles los datos.',
    detalle: 'La IA les escribe solo a los leads nuevos: les pide los datos, los deja en el cotizador y te pasa el chat. Con los que ya atendiste no habla (te quedan a vos). Siguen las automatizaciones.' },
  { id: 'automatico', rotulo: 'Automático, todo', config: { modo_ia: 'automatico', ia_cotiza: true },
    aviso: '¿Pasar a "automático, todo"? La IA va a asesorar, cotizar y responder preguntas por WhatsApp.',
    detalle: 'La IA asesora a los leads nuevos y responde a los que hacen preguntas: cotiza, manda audios y te pasa el chat cuando corresponde.' }
];

export default function PanelAsesor({ config: configInicial, conocimientoInicial, ejecuciones, tieneClave, plantillas, aprendizajes, miPerfil }) {
  const supabase = createClient();
  const [config, setConfig] = useState(configInicial ?? { activo: true, instrucciones: '', firma: '' });
  const [conocimiento, setConocimiento] = useState(conocimientoInicial);
  const [editando, setEditando] = useState(null); // id | 'nuevo' | null
  const [aviso, setAviso] = useState('');

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2500); };
  // Tres modos (Darío, 15-oct-2026); en la base son modo_ia + ia_cotiza
  const modoActual = config.modo_ia !== 'automatico' ? 'copiloto' : config.ia_cotiza === false ? 'datos' : 'automatico';

  async function guardarConfig(campos) {
    // La configuración es de cada cuenta: lo que cambia uno no toca la IA del otro
    if (!miPerfil?.id) return avisar('No se pudo guardar: recargá la página.');
    const nuevo = { ...config, ...campos };
    setConfig(nuevo);
    const { error } = await supabase.from('config_asesor').update({ ...campos, actualizado_at: new Date().toISOString() }).eq('cuenta', miPerfil.id);
    avisar(error ? `No se pudo guardar: ${error.message}` : 'Guardado');
  }

  async function guardarEntrada(ev, id) {
    ev.preventDefault();
    const f = ev.currentTarget;
    const datos = { titulo: f.titulo.value.trim(), contenido: f.contenido.value.trim() };
    const consulta = id === 'nuevo'
      ? supabase.from('conocimiento').insert(datos).select().single()
      : supabase.from('conocimiento').update(datos).eq('id', id).select().single();
    const { data, error } = await consulta;
    if (error) return avisar(`No se pudo guardar: ${error.message}`);
    setConocimiento((l) => (id === 'nuevo' ? [...l, data] : l.map((c) => (c.id === id ? data : c))).sort((a, b) => a.titulo.localeCompare(b.titulo)));
    setEditando(null);
  }

  async function alternarEntrada(c) {
    const { data, error } = await supabase.from('conocimiento').update({ activo: !c.activo }).eq('id', c.id).select().single();
    if (!error) setConocimiento((l) => l.map((x) => (x.id === c.id ? data : x)));
  }

  async function borrarEntrada(c) {
    if (!confirm(`¿Borrar "${c.titulo}"?`)) return;
    const { error } = await supabase.from('conocimiento').delete().eq('id', c.id);
    if (!error) setConocimiento((l) => l.filter((x) => x.id !== c.id));
  }

  const FormEntrada = ({ c }) => (
    <form className="form-audio" onSubmit={(ev) => guardarEntrada(ev, c?.id ?? 'nuevo')}>
      <label className="campo"><span>Título</span><input name="titulo" required defaultValue={c?.titulo ?? ''} placeholder="Ej.: Derivación de aportes" /></label>
      <label className="campo"><span>Contenido</span>
        <textarea name="contenido" required rows={6} defaultValue={c?.contenido ?? ''} placeholder="Lo que la IA puede decir sobre este tema, con datos exactos." /></label>
      <div className="acciones">
        <button type="submit" className="boton-primario">Guardar</button>
        <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </form>
  );

  const gastoTotal = ejecuciones.reduce((s, e) => s + costo(e), 0);

  return (
    <main className="pagina">
      <header className="pagina-cabecera">
        <h1>Asesor IA</h1>
        <p>Responde por WhatsApp a los leads que están en modo IA, releva sus datos y te los pasa listos para cotizar.</p>
      </header>

      {!tieneClave && (
        <p className="aviso-prueba tarjeta">Falta la clave de la API de Claude (<code>ANTHROPIC_API_KEY</code>). Hasta cargarla, la IA no responde.</p>
      )}
      {aviso && <p className="ficha-aviso" role="status">{aviso}</p>}

      <section className="tarjeta form-audio">
        <h2>Funcionamiento</h2>
        <label className="check">
          <input type="checkbox" checked={config.activo} onChange={(e) => guardarConfig({ activo: e.target.checked })} />
          IA activa (si la apagás, ninguno de tus chats recibe respuestas automáticas)
        </label>
        <div className="campo"><span>Qué hace la IA</span>
          <div className="pp-atajos" role="radiogroup" aria-label="Modo de la IA">
            {MODOS_IA.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={modoActual === m.id} title={m.detalle}
                className={`chip-filtro${modoActual === m.id ? ' activo' : ''}`}
                onClick={() => modoActual !== m.id && (!m.aviso || confirm(m.aviso)) && guardarConfig(m.config)}>{m.rotulo}</button>
            ))}
          </div>
          <span className="selector-detalle">{MODOS_IA.find((m) => m.id === modoActual)?.detalle}</span>
        </div>
        {/* Mensaje de ausencia (como WhatsApp Business): fuera de horario, cuando la IA no contesta (0060) */}
        <label className="check">
          <input type="checkbox" checked={Boolean(config.ausencia_activa)} onChange={(e) => guardarConfig({ ausencia_activa: e.target.checked })} />
          Mensaje de ausencia: si un cliente escribe fuera de horario (lunes a viernes de 8 a 20) y la IA no lo atiende, le sale este mensaje (una vez por noche o fin de semana)
        </label>
        {config.ausencia_activa && (
          <label className="campo"><span>Texto del mensaje de ausencia</span>
            <textarea rows={3} defaultValue={config.ausencia_texto ?? AUSENCIA_TEXTO}
              onBlur={(e) => e.target.value !== (config.ausencia_texto ?? '') && guardarConfig({ ausencia_texto: e.target.value.trim() || null })} /></label>
        )}
        <label className="campo"><span>Cómo te presentás (tu firma: la usa la IA en tus chats)</span>
          <input defaultValue={miPerfil?.firma ?? config.firma ?? ''} placeholder="Ej.: Gabriela, asesora de Swiss Medical"
            onBlur={async (e) => {
              // La firma es de cada asesor (la tuya en tus chats, la de Gaby en los de ella)
              if (!miPerfil?.id || e.target.value === (miPerfil?.firma ?? '')) return;
              const { error } = await supabase.from('perfiles').update({ firma: e.target.value.trim() || null }).eq('id', miPerfil.id);
              if (error) alert('No se pudo guardar: ' + error.message);
            }} /></label>
        <label className="campo"><span>Indicaciones extra (tono, cosas a evitar, prioridades)</span>
          <textarea rows={4} defaultValue={config.instrucciones ?? ''} placeholder="Ej.: si preguntan por planes sin copago, mencioná que hay opciones y pasá a humano."
            onBlur={(e) => e.target.value !== (config.instrucciones ?? '') && guardarConfig({ instrucciones: e.target.value })} /></label>
      </section>

      <section className="tarjeta form-audio">
        <div className="selector-cabecera">
          <h2>Base de conocimiento</h2>
          {editando !== 'nuevo' && <button type="button" className="boton-secundario" onClick={() => setEditando('nuevo')}>+ Agregar tema</button>}
        </div>
        <p className="selector-detalle">La IA solo puede afirmar lo que esté acá. Sin esto, se limita a relevar datos y pasarte el lead.</p>
        {editando === 'nuevo' && <FormEntrada />}
        <ul className="lista-audios">
          {conocimiento.length === 0 && editando !== 'nuevo' && <li className="selector-vacio">Todavía no cargaste temas.</li>}
          {conocimiento.map((c) => (
            <li key={c.id} className={`audio${c.activo ? '' : ' inactivo'}`}>
              {editando === c.id ? <FormEntrada c={c} /> : (
                <>
                  <div className="audio-info">
                    <strong>{c.titulo}</strong>
                    {!c.activo && <span className="etiqueta etiqueta-humano">Inactivo</span>}
                    <p className="texto-largo">{c.contenido}</p>
                  </div>
                  <div className="acciones">
                    <button type="button" className="boton-secundario" onClick={() => setEditando(c.id)}>Editar</button>
                    <button type="button" className="boton-secundario" onClick={() => alternarEntrada(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                    <button type="button" className="boton-secundario peligro" onClick={() => borrarEntrada(c)}>Borrar</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {aprendizajes}

      {plantillas}

      <section className="tarjeta">
        <div className="selector-cabecera">
          <h2>Últimas respuestas</h2>
          <span className="selector-detalle">Costo aprox.: US$ {gastoTotal.toFixed(3)}</span>
        </div>
        {ejecuciones.length === 0 ? <p className="selector-vacio">La IA todavía no respondió ningún mensaje.</p> : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Cuándo</th><th>Lead</th><th>Resultado</th><th>Acciones</th><th>US$</th></tr></thead>
              <tbody>
                {ejecuciones.map((e) => (
                  <tr key={e.id}>
                    <td>{fechaCorta(e.creado_at)} {hora(e.creado_at)}</td>
                    <td>{e.conversacion ? <Link href={`/bandeja/${e.conversacion.id}`}>{nombreVisible(e.conversacion.contacto)}</Link> : '—'}</td>
                    <td title={e.error ?? ''}>{RESULTADOS[e.resultado] ?? e.resultado}{e.error ? ' ⚠' : ''}</td>
                    <td>{(e.herramientas ?? []).map((h) => h.nombre.replace('_', ' ')).join(', ') || '—'}</td>
                    <td>{costo(e).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
