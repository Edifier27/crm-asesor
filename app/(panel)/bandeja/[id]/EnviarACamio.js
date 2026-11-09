'use client';

import { useState } from 'react';
import { nombreVisible } from '@/lib/formato';

// "Enviar a Camio" (Darío, 2-nov-2026): cuando un lead no cierra, se le pasa el dato a Camio, asesor de otra
// prepaga, para que le arme una propuesta. Manda por mail celular, edades, sueldo bruto o particular, y zona.
// Con EmailJS configurado (NEXT_PUBLIC_EMAILJS_*) sale solo desde el navegador, por la cuenta de mail que se
// conectó en EmailJS; el destinatario está en la plantilla de EmailJS. Sin configurar, abre el mail del asesor
// con el texto armado (mailto).
const EMAILJS = {
  servicio: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
  plantilla: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
  clave: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
};
const DESTINATARIO = process.env.NEXT_PUBLIC_MAIL_CAMIO ?? '';
const pesos = (n) => `$ ${Math.round(Number(n)).toLocaleString('es-AR')}`;

/** Los datos del lead en texto, para el mail. */
export function datosParaCamio(contacto) {
  const rel = contacto.relevamiento ?? {};
  const cot = contacto.cotizacion ?? {};
  const integrantes = (rel.integrantes ?? []).filter((i) => i.edad !== null && i.edad !== '' && i.edad !== undefined);
  const edades = integrantes.length
    ? integrantes.map((i) => `${i.parentesco ?? 'Integrante'} ${i.edad}`).join(', ')
    : 'sin dato';
  const sueldos = (cot.sueldos ?? []).map(Number).filter((n) => n > 0);
  const monotributo = /monotribut/i.test(rel.situacion ?? '');
  const aportes = sueldos.length
    ? `Deriva aportes, sueldo bruto ${sueldos.map(pesos).join(' y ')}`
    : cot.modalidad === 'derivacion' ? 'Deriva aportes (sueldo bruto sin dato)'
      : monotributo ? 'Monotributo' : cot.modalidad === 'directo' ? 'Particular' : 'sin dato';
  // Localidad y provincia (CABA, GBA Sur, Córdoba…); si no hay, la zona de precios (AMBA, INTERIOR…)
  const zona = [rel.localidad, rel.provincia].filter(Boolean).join(', ') || contacto.zona || 'sin dato';
  return {
    nombre: nombreVisible(contacto),
    celular: contacto.telefono ? `+${contacto.telefono}` : 'sin dato',
    edades, aportes, zona,
    // Lo que contó de su trabajo (ej. "él en relación de dependencia, la pareja monotributista")
    situacion: rel.situacion ?? ''
  };
}

export function textoParaCamio(d) {
  return `Hola Camio, te paso un dato para que le armes una propuesta:\n\nNombre: ${d.nombre}\nCelular: ${d.celular}\nEdades: ${d.edades}\nAportes: ${d.aportes}\n${d.situacion ? `Situación laboral: ${d.situacion}\n` : ''}Zona: ${d.zona}\n\nGracias!`;
}

export default function EnviarACamio({ contacto }) {
  const [estado, setEstado] = useState(''); // '', 'enviando', 'enviado', o el error
  const conEmailjs = EMAILJS.servicio && EMAILJS.plantilla && EMAILJS.clave;

  async function enviar() {
    const d = datosParaCamio(contacto);
    const asunto = `Dato para cotizar: ${d.nombre}`;
    const texto = textoParaCamio(d);
    if (!conEmailjs) {
      location.href = `mailto:${DESTINATARIO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
      return;
    }
    if (!confirm(`¿Mandarle a Camio el dato de ${d.nombre}?`)) return;
    setEstado('enviando');
    try {
      const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAILJS.servicio, template_id: EMAILJS.plantilla, user_id: EMAILJS.clave,
          template_params: { asunto, mensaje: texto, ...d }
        })
      });
      if (!r.ok) throw new Error((await r.text()) || `error ${r.status}`);
      setEstado('enviado');
    } catch (e) {
      setEstado(`No se pudo mandar: ${e.message}`);
    }
  }

  return (
    <div className="enviar-camio">
      <button type="button" className="boton-secundario" onClick={enviar} disabled={estado === 'enviando'}>
        {estado === 'enviando' ? 'Enviando…' : estado === 'enviado' ? '✓ Enviado a Camio' : '✉️ Enviar a Camio'}
      </button>
      {estado && !['enviando', 'enviado'].includes(estado) && <p className="aviso-error" role="alert">{estado}</p>}
      <small className="selector-detalle">Le manda por mail celular, edades, sueldo bruto o particular, y zona.</small>
    </div>
  );
}
