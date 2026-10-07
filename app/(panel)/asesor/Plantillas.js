'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PASOS_SECUENCIA, USOS_PLANTILLA, problemasPlantilla, secuenciaPara } from '@/lib/plantillas-uso';
import { enviarAMeta, guardarUsos, sincronizarPlantillas } from './acciones';

const ESTADOS = {
  APPROVED: { rotulo: 'Aprobada', clase: 'ok' },
  PENDING: { rotulo: 'En revisión', clase: 'espera' },
  IN_APPEAL: { rotulo: 'En apelación', clase: 'espera' },
  REJECTED: { rotulo: 'Rechazada', clase: 'mal' },
  PAUSED: { rotulo: 'Pausada por Meta', clase: 'mal' },
  DISABLED: { rotulo: 'Deshabilitada', clase: 'mal' }
};
const MOTIVOS = {
  INVALID_FORMAT: 'formato inválido', TAG_CONTENT_MISMATCH: 'la categoría no coincide con el texto', ABUSIVE_CONTENT: 'contenido no permitido',
  INCORRECT_CATEGORY: 'categoría incorrecta', PROMOTIONAL: 'es promocional (va como Marketing)', SCAM: 'parece engañosa'
};
// Imagen de la plantilla (bucket privado): se pide un link temporal para mostrarla
function ImagenPlantilla({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    createClient().storage.from('plantillas').createSignedUrl(path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url ? <img className="plantilla-imagen" src={url} alt="Imagen de la plantilla" /> : null;
}

// Botones de respuesta: los del borrador o, si vino de Meta, los de la plantilla aprobada
const botonesDe = (p) => (p.botones?.length ? p.botones
  : (p.componentes ?? []).find((c) => c.type === 'BUTTONS')?.buttons?.filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text) ?? []);
const estadoDe = (p) => ESTADOS[p.estado_meta] ?? { rotulo: 'No enviada a Meta', clase: 'nada' };

// Plantillas de WhatsApp: se traen de Meta, se crean desde acá y se elige cuál usar para cada cosa.
// {{1}} = primer nombre del contacto.
export default function Plantillas({ inicial, usosIniciales }) {
  const supabase = createClient();
  const [plantillas, setPlantillas] = useState(inicial);
  const [usos, setUsos] = useState(usosIniciales ?? {});
  const [editando, setEditando] = useState(null); // id | 'nueva' | null
  const [borrador, setBorrador] = useState({ nombre: '', cuerpo: '' });
  const [aviso, setAviso] = useState('');
  const [ocupado, iniciar] = useTransition();

  const reemplazar = (p) => setPlantillas((l) => l.map((x) => (x.id === p.id ? p : x)));

  function traer() {
    setAviso('');
    iniciar(async () => {
      const r = await sincronizarPlantillas();
      if (r.error) return setAviso(r.error);
      setPlantillas(r.plantillas);
      setAviso(`Listo: ${r.traidas} plantilla${r.traidas === 1 ? '' : 's'} de Meta actualizada${r.traidas === 1 ? '' : 's'}.`);
    });
  }

  function aprobar(p) {
    setAviso('');
    iniciar(async () => {
      const r = await enviarAMeta(p.id);
      if (r.error) return setAviso(`${p.nombre}: ${r.error}`);
      reemplazar(r.plantilla);
      setAviso(`"${p.nombre}" se mandó a Meta. Suele aprobarse en minutos (a veces hasta 24 h): tocá "Traer plantillas de Meta" para ver el estado.`);
    });
  }

  async function guardar(ev, id) {
    ev.preventDefault();
    const f = ev.currentTarget;
    const datos = {
      nombre: f.nombre.value.trim().toLowerCase().replace(/\s+/g, '_'),
      idioma: f.idioma.value.trim() || 'es_AR',
      categoria: f.categoria.value,
      cuerpo: f.cuerpo.value.trim(),
      uso: f.uso.value.trim() || null,
      botones: f.botones.value.split('\n').map((x) => x.trim()).filter(Boolean)
    };
    const malos = problemasPlantilla(datos);
    if (malos.length) return setAviso(malos.join(' '));
    // Imagen arriba del texto (opcional): JPG o PNG hasta 5 MB
    const imagen = f.imagen?.files?.[0];
    if (imagen) {
      if (!['image/jpeg', 'image/png'].includes(imagen.type)) return setAviso('La imagen tiene que ser JPG o PNG.');
      if (imagen.size > 5 * 1048576) return setAviso('La imagen supera los 5 MB.');
      const ruta = `${datos.nombre}-${crypto.randomUUID()}.${imagen.type === 'image/png' ? 'png' : 'jpg'}`;
      const { error: errImg } = await supabase.storage.from('plantillas').upload(ruta, imagen, { contentType: imagen.type });
      if (errImg) return setAviso(`No se pudo subir la imagen: ${errImg.message}`);
      datos.imagen_path = ruta;
      datos.nota = null;
    }
    const consulta = id === 'nueva'
      ? supabase.from('plantillas').insert(datos).select().single()
      : supabase.from('plantillas').update(datos).eq('id', id).select().single();
    const { data, error } = await consulta;
    if (error) return setAviso(`No se pudo guardar: ${error.message}`);
    setPlantillas((l) => (id === 'nueva' ? [...l, data] : l.map((p) => (p.id === id ? data : p))).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setEditando(null); setAviso('');
  }

  async function alternar(p) {
    const { data, error } = await supabase.from('plantillas').update({ activa: !p.activa }).eq('id', p.id).select().single();
    if (!error) reemplazar(data);
  }

  function elegirUso(clave, valor, i = null) {
    const nuevo = i === null
      ? { ...usos, [clave]: valor || undefined }
      : { ...usos, [clave]: Object.assign([null, null, null, null], usos[clave] ?? [], { [i]: valor || null }) };
    setUsos(nuevo);
    iniciar(async () => { const r = await guardarUsos(nuevo); if (r.error) setAviso(r.error); });
  }

  // Resumen de estados
  const cuenta = (fn) => plantillas.filter(fn).length;
  const resumen = [
    ['ok', `✓ ${cuenta((p) => p.estado_meta === 'APPROVED')} aprobadas`],
    ['espera', `⏳ ${cuenta((p) => ['PENDING', 'IN_APPEAL'].includes(p.estado_meta))} en revisión`],
    ['mal', `✕ ${cuenta((p) => ['REJECTED', 'PAUSED', 'DISABLED'].includes(p.estado_meta))} rechazadas o pausadas`],
    ['nada', `${cuenta((p) => !p.estado_meta)} sin enviar a Meta`]
  ];

  const abrirEditor = (p) => { setEditando(p?.id ?? 'nueva'); setBorrador({ nombre: p?.nombre ?? '', cuerpo: p?.cuerpo ?? '' }); };
  const problemas = problemasPlantilla({ nombre: borrador.nombre.trim().toLowerCase().replace(/\s+/g, '_'), cuerpo: borrador.cuerpo });

  const formulario = (p) => (
    <form className="form-audio" onSubmit={(ev) => guardar(ev, p?.id ?? 'nueva')}>
      <div className="campos-dobles">
        <label className="campo"><span>Nombre (minúsculas y guiones bajos)</span>
          <input name="nombre" required defaultValue={p?.nombre ?? ''} placeholder="seguimiento_precio"
            onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))} /></label>
        <label className="campo"><span>Idioma</span><input name="idioma" defaultValue={p?.idioma ?? 'es_AR'} /></label>
      </div>
      <label className="campo"><span>Categoría</span>
        <select name="categoria" defaultValue={p?.categoria ?? 'marketing'}>
          <option value="marketing">Marketing (seguimientos, promos, campañas)</option>
          <option value="utility">Utilidad (avisos de un trámite: link de pago, alta)</option>
        </select>
      </label>
      <label className="campo"><span>Texto ({'{{1}}'} = nombre del cliente)</span>
        <textarea name="cuerpo" required rows={3} defaultValue={p?.cuerpo ?? ''} placeholder="Hola {{1}}, pudiste ver la cotización que te pasé?"
          onChange={(e) => setBorrador((b) => ({ ...b, cuerpo: e.target.value }))} /></label>
      {problemas.length > 0 && borrador.cuerpo && <ul className="plantilla-problemas">{problemas.map((x) => <li key={x}>{x}</li>)}</ul>}
      <label className="campo"><span>Botones de respuesta (opcional): uno por renglón, hasta 3, máximo 25 letras cada uno</span>
        <textarea name="botones" rows={3} defaultValue={(p?.botones ?? []).join('\n')} placeholder={'Sí, cotizame\nNo, gracias'} /></label>
      <label className="campo"><span>Imagen arriba del texto (opcional · JPG o PNG, hasta 5 MB){p?.imagen_path ? ' · ya tiene una: elegí otra solo si querés cambiarla' : ''}</span>
        <input name="imagen" type="file" accept="image/jpeg,image/png" /></label>
      <label className="campo"><span>¿Para qué sirve? (la IA lo usa para elegirla)</span>
        <input name="uso" defaultValue={p?.uso ?? ''} placeholder="Retomar un lead que recibió la cotización y no respondió" /></label>
      {p?.estado_meta === 'APPROVED' && <p className="selector-detalle">Ojo: esta ya está aprobada. Si cambiás el texto acá, en Meta sigue el original. Para otro texto, creá una nueva con otro nombre.</p>}
      <div className="acciones">
        <button type="submit" className="boton-primario">Guardar</button>
        <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </form>
  );

  const opciones = plantillas.map((p) => (
    <option key={p.id} value={p.nombre}>{p.nombre}{p.estado_meta === 'APPROVED' ? '' : ` (${estadoDe(p).rotulo.toLowerCase()})`}</option>
  ));

  return (
    <>
      <section className="tarjeta form-audio">
        <div className="selector-cabecera">
          <h2>Plantillas de WhatsApp</h2>
          <div className="acciones">
            <button type="button" className="boton-secundario" disabled={ocupado} onClick={traer}>{ocupado ? 'Un momento…' : '↻ Traer plantillas de Meta'}</button>
            {editando !== 'nueva' && <button type="button" className="boton-primario" onClick={() => abrirEditor(null)}>+ Nueva plantilla</button>}
          </div>
        </div>
        <div className="plantillas-resumen">
          {resumen.map(([clase, texto]) => <span key={clase} className={`estado-plantilla ${clase}`}>{texto}</span>)}
        </div>
        <p className="selector-detalle">
          Pasadas las 24 h del último mensaje del cliente, WhatsApp solo deja mandar plantillas aprobadas por Meta.
          Creá una nueva acá y tocá &quot;Enviar a Meta&quot;: queda en revisión y suele aprobarse en minutos.
        </p>
        {aviso && <p className="pp-aviso">{aviso}</p>}
        {editando === 'nueva' && formulario(null)}
        <ul className="lista-audios">
          {plantillas.map((p) => {
            const e = estadoDe(p);
            return (
              <li key={p.id} className={`audio${p.activa ? '' : ' inactivo'}`}>
                {editando === p.id ? formulario(p) : (
                  <>
                    <div className="audio-info">
                      <strong>{p.nombre}</strong><span className="audio-duracion">{p.idioma} · {p.categoria}</span>
                      <span className={`estado-plantilla ${e.clase}`}>{e.rotulo}{p.motivo_rechazo ? `: ${MOTIVOS[p.motivo_rechazo] ?? p.motivo_rechazo}` : ''}</span>
                      {!p.activa && p.estado_meta === 'APPROVED' && !p.nota && <span className="etiqueta etiqueta-humano">Desactivada en el CRM</span>}
                      {p.imagen_path && <ImagenPlantilla path={p.imagen_path} />}
                      <p>{p.cuerpo}</p>
                      {botonesDe(p).length > 0 && (
                        <span className="plantilla-botones">{botonesDe(p).map((b) => <span key={b} className="plantilla-boton">{b}</span>)}</span>
                      )}
                      {p.nota && <p className="cuando">{p.nota}</p>}
                      {p.uso && <p className="cuando"><strong>Para:</strong> {p.uso}</p>}
                    </div>
                    <div className="acciones">
                      {(!p.estado_meta || p.estado_meta === 'REJECTED') && (
                        <button type="button" className="boton-primario" disabled={ocupado} onClick={() => aprobar(p)}>Enviar a Meta</button>
                      )}
                      <button type="button" className="boton-secundario" onClick={() => abrirEditor(p)}>Editar</button>
                      {p.estado_meta === 'APPROVED' && !p.nota && (
                        <button type="button" className="boton-secundario" onClick={() => alternar(p)}>{p.activa ? 'Desactivar' : 'Activar'}</button>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tarjeta form-audio">
        <h2>Qué plantilla usar para cada cosa</h2>
        <p className="selector-detalle">Si no elegís, se usa la del nombre por defecto. Elegí aprobadas: las demás no salen.</p>
        <div className="usos-plantilla">
          {USOS_PLANTILLA.map((u) => (
            <label key={u.clave} className="campo"><span>{u.rotulo}{u.ayuda ? ` · ${u.ayuda}` : ''}</span>
              <select value={usos[u.clave] ?? ''} onChange={(ev) => elegirUso(u.clave, ev.target.value)}>
                <option value="">Por defecto ({u.defecto})</option>{opciones}
              </select>
            </label>
          ))}
          {PASOS_SECUENCIA.map((s) => {
            const defecto = secuenciaPara({}, s.clave).plantillas;
            return (
              <fieldset key={s.clave} className="usos-secuencia">
                <legend>{s.rotulo}</legend>
                {s.pasos.map((paso, i) => (
                  <label key={paso} className="campo"><span>{paso}</span>
                    <select value={usos[s.clave]?.[i] ?? ''} onChange={(ev) => elegirUso(s.clave, ev.target.value, i)}>
                      <option value="">Por defecto ({defecto[i]})</option>{opciones}
                    </select>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </section>
    </>
  );
}
