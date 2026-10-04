'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fechaCorta, hora, nombreVisible } from '@/lib/formato';

// Precios de Claude Sonnet 5.5 por millón de tokens (USD)
const PRECIO = { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 };
const costo = (e) =>
  ((e.tokens_entrada ?? 0) * PRECIO.entrada + (e.tokens_salida ?? 0) * PRECIO.salida +
   (e.tokens_cache_lectura ?? 0) * PRECIO.cacheLectura + (e.tokens_cache_escritura ?? 0) * PRECIO.cacheEscritura) / 1e6;

const RESULTADOS = { respondio: 'Respondió', paso_a_humano: 'Pasó a humano', sin_accion: 'Sin acción', error: 'Error', omitida: 'Omitida' };

export default function PanelAsesor({ config: configInicial, conocimientoInicial, ejecuciones, tieneClave, plantillas }) {
  const supabase = createClient();
  const [config, setConfig] = useState(configInicial ?? { activo: true, instrucciones: '', firma: '' });
  const [conocimiento, setConocimiento] = useState(conocimientoInicial);
  const [editando, setEditando] = useState(null); // id | 'nuevo' | null
  const [aviso, setAviso] = useState('');

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2500); };

  async function guardarConfig(campos) {
    const nuevo = { ...config, ...campos };
    setConfig(nuevo);
    const { error } = await supabase.from('asesor_config').update({ ...campos, actualizado_at: new Date().toISOString() }).eq('id', true);
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
          IA activa (si la apagás, ningún chat recibe respuestas automáticas)
        </label>
        <div className="campo"><span>Qué hace la IA</span>
          <div className="pp-atajos" role="radiogroup" aria-label="Modo de la IA">
            {[['copiloto', 'Copiloto', 'Ordena los datos, te deja tareas y consejos, y solo manda plantillas aprobadas a quien no responde. Cuando el cliente contesta, lo atendés vos.'],
              ['automatico', 'Automático', 'La IA asesora y conversa con los leads por WhatsApp.']].map(([v, r, t]) => (
              <button key={v} type="button" role="radio" aria-checked={(config.modo_ia ?? 'copiloto') === v} title={t}
                className={`chip-filtro${(config.modo_ia ?? 'copiloto') === v ? ' activo' : ''}`}
                onClick={() => (v !== 'automatico' || confirm('¿Pasar a modo automático? La IA va a empezar a conversar con los leads.')) && guardarConfig({ modo_ia: v })}>{r}</button>
            ))}
          </div>
          <span className="selector-detalle">{(config.modo_ia ?? 'copiloto') === 'copiloto'
            ? 'Copiloto: la IA no conversa. Ordena la ficha, te deja la tarea con un consejo y manda solo plantillas aprobadas a quien no responde.'
            : 'Automático: la IA asesora y conversa con los leads.'}</span>
        </div>
        <label className="campo"><span>Cómo se presenta</span>
          <input defaultValue={config.firma ?? ''} placeholder="tu asesor de Swiss Medical"
            onBlur={(e) => e.target.value !== (config.firma ?? '') && guardarConfig({ firma: e.target.value })} /></label>
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
