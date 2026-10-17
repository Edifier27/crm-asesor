'use client';

// Notificaciones como WhatsApp en este dispositivo (Darío, 16-oct-2026): con el CRM cerrado, cuando un cliente escribe
// llega la notificación con su nombre y el mensaje; tocarla abre el chat. Se activa una vez en cada celular y cada PC.
// El aviso lo manda el servidor (lib/push.js) y lo muestra public/sw.js.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { probarNotificacion } from '../perfil/acciones';

export const CLAVE_PUSH = 'crm-push'; // en este navegador ya avisa el servidor: Avisos.js no repite la notificación

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
function aBytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)));
}
const nombreDispositivo = () => {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${so} · ${nav}`;
};

export default function NotificacionesPush() {
  const [estado, setEstado] = useState('revisando'); // revisando | sin-soporte | iphone-instalar | sin-claves | inactiva | activa | bloqueada
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/i.test(navigator.userAgent);
      const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        return setEstado(ios && !instalada ? 'iphone-instalar' : 'sin-soporte');
      }
      if (!CLAVE_PUBLICA) return setEstado('sin-claves');
      if (Notification.permission === 'denied') return setEstado('bloqueada');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub && Notification.permission === 'granted' ? 'activa' : 'inactiva');
    })().catch(() => setEstado('sin-soporte'));
  }, []);

  async function activar() {
    setTrabajando(true); setAviso('');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueada' : 'inactiva'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE_PUBLICA) });
      const { endpoint, keys } = sub.toJSON();
      const { error } = await createClient().from('push_suscripciones')
        .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, dispositivo: nombreDispositivo() }, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message);
      try { localStorage.setItem(CLAVE_PUSH, '1'); } catch {}
      setEstado('activa');
      setAviso('Listo: en este dispositivo te van a llegar las notificaciones. Probala con el botón.');
    } catch (e) {
      setAviso(`No se pudo activar: ${e.message}`);
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setTrabajando(true); setAviso('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await createClient().from('push_suscripciones').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      try { localStorage.removeItem(CLAVE_PUSH); } catch {}
      setEstado('inactiva');
      setAviso('Desactivadas en este dispositivo.');
    } finally {
      setTrabajando(false);
    }
  }

  async function probar() {
    setAviso('');
    const r = await probarNotificacion();
    setAviso(r.error ?? 'Te mandé una de prueba: tiene que aparecer en unos segundos, como un mensaje de WhatsApp.');
  }

  return (
    <div className="push">
      <h3>Notificaciones con el CRM cerrado</h3>
      <p className="selector-detalle">Como WhatsApp: aunque el CRM esté cerrado o el celular bloqueado, cuando un cliente te escribe te llega la notificación con su nombre y el mensaje. Tocala y se abre el chat. Hay que activarlas una vez en cada celular y en cada computadora.</p>
      {estado === 'activa' && (
        <>
          <p className="selector-detalle">✓ Activadas en este dispositivo.</p>
          <div className="acciones">
            <button type="button" className="boton-secundario" onClick={probar}>Probar</button>
            <button type="button" className="boton-secundario" disabled={trabajando} onClick={desactivar}>Desactivar en este dispositivo</button>
          </div>
        </>
      )}
      {estado === 'inactiva' && (
        <div className="acciones">
          <button type="button" className="boton-primario" disabled={trabajando} onClick={activar}>{trabajando ? 'Activando…' : 'Activar notificaciones en este dispositivo'}</button>
        </div>
      )}
      {estado === 'bloqueada' && <p className="selector-detalle">Las notificaciones están bloqueadas para este sitio. En el celular: mantené apretado el ícono del CRM → Información de la app → Notificaciones. En la compu: el candadito de la barra de direcciones → Notificaciones → Permitir.</p>}
      {estado === 'iphone-instalar' && <p className="selector-detalle">En iPhone primero hay que instalar el CRM: en Safari tocá Compartir → "Agregar a inicio", abrilo desde ese ícono y volvé a esta pantalla.</p>}
      {estado === 'sin-soporte' && <p className="selector-detalle">Este navegador no permite notificaciones. Usá Chrome o Edge (en el celular, Chrome).</p>}
      {estado === 'sin-claves' && <p className="selector-detalle">Falta cargar las claves de notificaciones en Vercel.</p>}
      {aviso && <p className="pp-aviso" role="status">{aviso}</p>}
    </div>
  );
}
