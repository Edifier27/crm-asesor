'use client';

import { useEffect, useState } from 'react';
import { TONOS, guardarPreferencias, leerPreferencias, sonarAviso } from '../componentes/avisos-prefs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TEMAS } from '@/lib/temas';

export default function Perfil({ id, email, nombreInicial, temaInicial }) {
  const router = useRouter();
  const [tema, setTema] = useState(temaInicial);
  const [aviso, setAviso] = useState('');
  const [avisos, setAvisos] = useState({ sonido: true, cartel: true, tono: 'cristal' });
  const [permiso, setPermiso] = useState('default');
  useEffect(() => {
    setAvisos(leerPreferencias());
    setPermiso(typeof Notification === 'undefined' ? 'no' : Notification.permission);
  }, []);
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
        {permiso === 'granted' && <p className="selector-detalle">✓ Si estás en otra ventana o programa, te llega la notificación de la computadora (con el CRM abierto).</p>}
        {permiso === 'denied' && <p className="selector-detalle">Las notificaciones están bloqueadas para este sitio: activalas desde el candadito de la barra de direcciones.</p>}
      </section>

      <section className="tarjeta">
        <h2>Contraseña</h2>
        <Link href="/bienvenida" className="boton-secundario">Cambiar contraseña</Link>
      </section>
    </div>
  );
}
