'use client';

import { useEffect, useState } from 'react';
import { TONOS, guardarPreferencias, leerPreferencias, notificarSistema, sonarAviso } from '../componentes/avisos-prefs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TEMAS } from '@/lib/temas';
import { guardarModo, leerModo } from '@/lib/modo';
import NotificacionesPush from '../componentes/NotificacionesPush';
import { generarClaveScript } from './acciones';

export default function Perfil({ id, email, nombreInicial, temaInicial }) {
  const router = useRouter();
  const [tema, setTema] = useState(temaInicial);
  // Claro / oscuro / automático: se guarda en este dispositivo (lib/modo.js); se lee después de dibujar
  const [modo, setModo] = useState('claro');
  useEffect(() => { setModo(leerModo()); }, []);
  const [aviso, setAviso] = useState('');
  const [avisos, setAvisos] = useState({ sonido: true, cartel: true, tono: 'cristal' });
  const [permiso, setPermiso] = useState('default');
  const [prueba, setPrueba] = useState('');
  useEffect(() => {
    setAvisos(leerPreferencias());
    setPermiso(typeof Notification === 'undefined' ? 'no' : Notification.permission);
  }, []);
  // Clave del script de Salesforce: se ve una sola vez, al generarla
  const [claveSf, setClaveSf] = useState('');
  const [avisoSf, setAvisoSf] = useState('');
  async function nuevaClaveSf() {
    setAvisoSf('');
    const r = await generarClaveScript().catch((e) => ({ error: e.message }));
    if (r.error) return setAvisoSf(r.error);
    setClaveSf(r.clave);
  }
  const cambiarAviso = (campos) => { const p = { ...avisos, ...campos }; setAvisos(p); guardarPreferencias(p); };

  async function guardar(campos, previo) {
    const { error } = await createClient().from('perfiles').update(campos).eq('id', id);
    if (error) { previo?.(); setAviso('No se pudo guardar'); return; }
    setAviso('Guardado');
    setTimeout(() => setAviso(''), 2000);
    router.refresh();
  }

  function elegir(t) {
    const anterior = tema;
    const app = document.querySelector('.app');
    // Se ve al instante; si falla el guardado vuelve al color anterior
    setTema(t); if (app) app.dataset.tema = t;
    guardar({ tema: t }, () => { setTema(anterior); if (app) app.dataset.tema = anterior; });
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1>Mi perfil</h1>
        <p>{email}</p>
      </header>

      <section className="tarjeta">
        <label className="campo">
          <span>Tu nombre</span>
          <input defaultValue={nombreInicial} placeholder="Cómo te ve el equipo" maxLength={60}
            onBlur={(e) => e.target.value.trim() !== nombreInicial && guardar({ nombre: e.target.value.trim() || null })} />
        </label>
      </section>

      <section className="tarjeta">
        <h2>Apariencia</h2>
        <p className="selector-detalle">Claro u oscuro, como en WhatsApp. Automático sigue lo que tenga tu celular o tu compu. Se guarda en este dispositivo.</p>
        <div className="pp-atajos" role="radiogroup" aria-label="Apariencia">
          {[['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Automático']].map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={modo === v} className={`chip-filtro${modo === v ? ' activo' : ''}`}
              onClick={() => { setModo(v); guardarModo(v); }}>{r}</button>
          ))}
        </div>
      </section>

      <section className="tarjeta">
        <h2>Color de tu aplicación</h2>
        <p className="selector-detalle">Solo cambia cómo la ves vos. Los clientes no ven ninguna diferencia.</p>
        <div className="temas" role="radiogroup" aria-label="Color de la aplicación">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tema === t.id}
              className={`tema-opcion${tema === t.id ? ' activo' : ''}`} onClick={() => elegir(t.id)}>
              <span className="tema-muestra" style={{ background: `linear-gradient(135deg, ${t.riel} 0 50%, ${t.muestra} 50% 100%)` }} />
              {t.nombre}
            </button>
          ))}
        </div>
        {aviso && <p className="pp-aviso" role="status">{aviso}</p>}
      </section>

      <section className="tarjeta">
        <h2>Avisos de mensajes nuevos</h2>
        <p className="selector-detalle">Como en WhatsApp: cuando un cliente te escribe aparece un cartel con el mensaje y suena el aviso del CRM. Se configura en cada dispositivo.</p>
        <label className="check"><input type="checkbox" checked={avisos.cartel} onChange={(e) => cambiarAviso({ cartel: e.target.checked })} /> Mostrar el cartel con el mensaje</label>
        <label className="check"><input type="checkbox" checked={avisos.sonido} onChange={(e) => cambiarAviso({ sonido: e.target.checked })} /> Sonido</label>
        <div className="tonos" role="radiogroup" aria-label="Sonido del aviso">
          {Object.entries(TONOS).map(([clave, t]) => (
            <button key={clave} type="button" role="radio" aria-checked={avisos.tono === clave}
              className={`tono-opcion${avisos.tono === clave ? ' activo' : ''}`}
              onClick={() => { cambiarAviso({ tono: clave, sonido: true }); sonarAviso(clave); }}>
              <span className="tono-play" aria-hidden="true">▶</span>
              <span><strong>{t.nombre}</strong><span className="selector-detalle">{t.descripcion}</span></span>
            </button>
          ))}
        </div>
        <div className="acciones">
          {permiso === 'default' && (
            <button type="button" className="boton-primario" onClick={async () => setPermiso(await Notification.requestPermission())}>Avisarme también con otra ventana abierta</button>
          )}
        </div>
        {permiso === 'granted' && (
          <>
            <p className="selector-detalle">✓ Si estás en otra ventana o programa, te llega la notificación de la computadora (con el CRM abierto, aunque sea detrás).</p>
            <div className="acciones">
              <button type="button" className="boton-secundario" onClick={() => {
                const motivo = notificarSistema('AsesorCRM · prueba', 'Así te va a llegar cuando te escriba un cliente.', 'prueba');
                setPrueba(motivo ? `No se pudo mostrar: ${motivo}` : 'Notificación enviada: si no la ves abajo a la derecha, revisá la configuración de Windows (abajo).');
                setTimeout(() => setPrueba(''), 8000);
              }}>Probar notificación</button>
            </div>
            {prueba && <p className="pp-aviso" role="status">{prueba}</p>}
            <p className="selector-detalle">¿No aparece? En Windows: Configuración → Sistema → Notificaciones → que estén activadas para tu navegador (Chrome o Edge) y que "No molestar" esté apagado.</p>
          </>
        )}
        {permiso === 'denied' && <p className="selector-detalle">Las notificaciones están bloqueadas para este sitio: activalas desde el candadito de la barra de direcciones.</p>}
        <NotificacionesPush />
      </section>

      <section className="tarjeta">
        <h2>Script de Salesforce</h2>
        <p className="selector-detalle">La clave que va en el script de Tampermonkey (CRM_CLAVE) para que Salesforce reciba tus pedidos de link de alta y te devuelva los resultados. Es personal: el script con tu clave solo ve tus pedidos.</p>
        {claveSf ? (
          <>
            <input className="clave-script" readOnly value={claveSf} onFocus={(e) => e.target.select()} aria-label="Tu clave del script" />
            <p className="selector-detalle">Copiala ahora y pegala en el script: no se vuelve a mostrar.</p>
            <button type="button" className="boton-secundario" onClick={() => navigator.clipboard?.writeText(claveSf).then(() => setAvisoSf('Copiada'), () => {})}>Copiar clave</button>
          </>
        ) : (
          <button type="button" className="boton-secundario" onClick={nuevaClaveSf}>Generar clave</button>
        )}
        <p className="selector-detalle">Si generás una nueva, la anterior deja de andar.</p>
        {avisoSf && <p className="selector-detalle">{avisoSf}</p>}
      </section>

      <section className="tarjeta">
        <h2>Contraseña</h2>
        <Link href="/bienvenida" className="boton-secundario">Cambiar contraseña</Link>
      </section>
    </div>
  );
}
