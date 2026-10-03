'use client';

import { useActionState, useRef } from 'react';
import { crearLead } from './acciones';

export default function NuevoLead() {
  const dialogo = useRef(null);
  const [estado, accion, guardando] = useActionState(crearLead, null);

  return (
    <>
      <button type="button" className="boton-nuevo" onClick={() => dialogo.current?.showModal()} aria-label="Nuevo lead" title="Nuevo lead">
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
          <label className="check"><input type="checkbox" name="bienvenida" defaultChecked /> Enviar la plantilla de bienvenida</label>
          {estado?.error && <p className="aviso-error" role="alert">{estado.error}</p>}
          <button type="submit" className="boton-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear lead'}</button>
        </form>
      </dialog>
    </>
  );
}
