'use client';

import { useActionState, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { crearLead } from './acciones';

export default function NuevoLead() {
  const dialogo = useRef(null);
  const [estado, accion, guardando] = useActionState(crearLead, null);
  // Plantillas aprobadas de la cuenta, para elegir qué mandarle (se piden la primera vez que se abre el formulario).
  // Solo las que el CRM puede completar sola: a lo sumo llevan el nombre.
  const [plantillas, setPlantillas] = useState(null);

  function abrir() {
    dialogo.current?.showModal();
    if (plantillas !== null) return;
    createClient().from('plantillas').select('id, nombre, cuerpo').eq('activa', true).order('nombre')
      .then(({ data }) => setPlantillas((data ?? []).filter((p) => !/\{\{[2-9]\}\}/.test(p.cuerpo))));
  }

  return (
    <>
      <button type="button" className="boton-nuevo" onClick={abrir} aria-label="Nuevo lead" title="Nuevo lead">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <dialog ref={dialogo} className="dialogo" aria-labelledby="titulo-nuevo-lead">
        <form action={accion} className="form-audio">
          <div className="selector-cabecera">
            <h2 id="titulo-nuevo-lead">Nuevo lead</h2>
            <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => dialogo.current?.close()}>×</button>
          </div>
          <label className="campo"><span>Celular (con código de área)</span>
            <input name="telefono" type="tel" required placeholder="11 2233-4455" autoComplete="off" /></label>
          <label className="campo"><span>Nombre</span><input name="nombre" placeholder="Nombre y apellido" /></label>
          <div className="campos-dobles">
            <label className="campo"><span>Origen</span>
              <select name="origen" defaultValue="swiss_medical">
                <option value="swiss_medical">Swiss Medical</option>
                <option value="manual">Otro / referido</option>
              </select>
            </label>
            <label className="campo"><span>Zona</span>
              <select name="zona" defaultValue="">
                <option value="">Sin definir</option>
                {['AMBA', 'INTERIOR', 'CORDOBA', 'PATAGONIA', 'TDF', 'RESTO'].map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
          </div>
          <label className="campo"><span>Detalle del origen (opcional)</span><input name="origen_detalle" placeholder="Ej.: asignación SMG octubre" /></label>
          <label className="campo"><span>Email (opcional)</span><input name="email" type="email" /></label>
          <label className="campo"><span>Comentario (opcional)</span><textarea name="mensaje" rows={2} /></label>
          {/* Lo elige quien carga el lead: no sale nada sin que lo decida */}
          <label className="campo"><span>Qué plantilla mandarle al crearlo</span>
            <select name="plantilla" required defaultValue="">
              <option value="" disabled>Elegí una opción…</option>
              <option value="ninguna">Ninguna: no mandarle nada todavía</option>
              <option value="auto">El saludo de siempre (el que elegiste en Asesor IA)</option>
              {(plantillas ?? []).map((p) => <option key={p.id} value={p.nombre}>{p.nombre} · {p.cuerpo.replace(/\s+/g, ' ').slice(0, 70)}</option>)}
            </select>
          </label>
          {estado?.error && <p className="aviso-error" role="alert">{estado.error}</p>}
          <button type="submit" className="boton-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear lead'}</button>
        </form>
      </dialog>
    </>
  );
}
