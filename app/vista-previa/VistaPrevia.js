'use client';

import { useEffect, useState } from 'react';
import ListaChats from '../(panel)/bandeja/ListaChats';
import Conversacion from '../(panel)/bandeja/[id]/Conversacion';
import RielPlegable from '../(panel)/RielPlegable';
import Ficha from '../(panel)/bandeja/[id]/Ficha';
import RielLinks from '../(panel)/RielLinks';
import VisorArchivo from '../(panel)/componentes/VisorArchivo';

// Tono de prueba (WAV) para escuchar la nota de voz sin servidor
function tono(segundos = 6) {
  const tasa = 8000, n = tasa * segundos, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const txt = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, tasa, true);
  v.setUint32(28, tasa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / tasa * 2 * Math.PI * 220) * 6000 * (0.5 + 0.5 * Math.sin(i / 1500)), true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

const hace = (min) => new Date(Date.now() - min * 60_000).toISOString();
const contacto = { id: '11111111-1111-1111-1111-111111111111', nombre: 'Lucía Fernández', telefono: '5491122334455', origen: 'web', etiquetas: [] };

export default function VistaPrevia() {
  const [audio, setAudio] = useState(null);
  const [visor, setVisor] = useState(false);
  useEffect(() => { setAudio(tono()); setVisor(new URLSearchParams(location.search).has('visor')); }, []);
  if (!audio) return null;

  const mensajes = [
    { id: 'a1', direccion: 'saliente', autor: 'sistema', tipo: 'texto', texto: 'Lead nuevo de la web (Formulario familias)', creado_at: hace(1500) },
    { id: 'a2', direccion: 'saliente', autor: 'ia', tipo: 'plantilla', plantilla: 'bienvenida', texto: 'Hola Lucía, mi nombre es Darío, te contacto por la consulta que hiciste en la web. El plan sería para vos o para tu grupo familiar?', estado: 'leido', creado_at: hace(1490) },
    { id: 'a3', direccion: 'entrante', autor: 'contacto', tipo: 'texto', texto: 'Hola! para mí, mi marido y mi hija de 3', creado_at: hace(80) },
    { id: 'a4', direccion: 'entrante', autor: 'contacto', tipo: 'texto', texto: 'tenemos 34 y 36', creado_at: hace(79), reacciones: { asesor: '👍' } },
    { id: 'a5', direccion: 'saliente', autor: 'asesor', tipo: 'texto', texto: 'Genial Lucía! Lo harían en forma particular o derivando aportes?', estado: 'leido', creado_at: hace(70), responde_a: 'a4' },
    { id: 'a6', direccion: 'saliente', autor: 'asesor', tipo: 'audio', texto: 'Audio grabado (0:06)', urlLocal: audio, estado: 'leido', escuchado_at: hace(60), creado_at: hace(69) },
    { id: 'a7', direccion: 'entrante', autor: 'contacto', tipo: 'audio', urlLocal: audio, texto: 'derivando, yo estoy en relación de dependencia', creado_at: hace(30) },
    { id: 'a8', direccion: 'saliente', autor: 'asesor', tipo: 'texto', texto: 'Perfecto, ya te armo la cotización 🙌', estado: 'enviado', creado_at: hace(2) }
  ];
  const largos = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, direccion: i % 2 ? 'entrante' : 'saliente', autor: i % 2 ? 'contacto' : 'asesor', tipo: 'texto', texto: `Mensaje de prueba número ${i + 1} para que el chat sea largo`, estado: 'leido', creado_at: hace(60 - i) }));
  mensajes.push(...largos);
  const conversacion = {
    id: '00000000-0000-0000-0000-000000000000', modo: 'humano', ventana_expira_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    ia_pensando_desde: null, resumen_ia: null, contacto
  };
  const lista = [
    { id: conversacion.id, modo: 'humano', ultimo_mensaje_at: hace(2), ultimo_mensaje_texto: 'Perfecto, ya te armo la cotización 🙌', no_leidos: 0, contacto: { ...contacto, temperatura: 'caliente' } },
    { id: 'c2', modo: 'humano', ultimo_mensaje_at: hace(15), ultimo_mensaje_texto: 'me pasás los valores?', no_leidos: 2, contacto: { id: 'x', nombre: 'Martín Gómez', telefono: '5491133445566', temperatura: 'tibio', etiquetas: [] } },
    { id: 'c3', modo: 'humano', ultimo_mensaje_at: hace(300), ultimo_mensaje_texto: '🎤 Audio', no_leidos: 0, seguimiento_responsable: 'asesor', seguimiento_at: hace(10), seguimiento_motivo: 'Volver a contactar: quedó en verlo', contacto: { id: 'y', nombre: 'Carla Ruiz', telefono: '5491144556677', temperatura: 'frio', etiquetas: [] } }
  ];

  return (
    <div className="app">
      {/* Probar la lupa del visor: /vista-previa?visor=1 */}
      {visor && <VisorArchivo url="/icono-512.png" nombre="Foto de prueba" tipo="imagen" onCerrar={() => setVisor(false)} />}
      <RielPlegable><div className="riel-marca">AC</div><RielLinks esAdmin /></RielPlegable>
      <ListaChats inicial={lista} iaInicial={3} />
      <Conversacion conversacion={conversacion} mensajesIniciales={mensajes} onFicha={() => {}} audios={[]} plantillas={[]} modoPrueba={false}
        equipo={{ yo: 'yo', nombres: { yo: 'Darío' } }} respuestasIniciales={[]} sinConexion />
      <Ficha conversacion={{ ...conversacion, contacto: { ...contacto, etapa_id: 4, relevamiento: {}, documentos: [] } }} abierta lista={null} todasEtiquetas={[]} onCerrar={() => {}}
        etapas={[{ id: 1, nombre: 'Nuevo', orden: 1, color: '#999' }, { id: 4, nombre: 'Cotizado', orden: 4, color: '#7C3AED' }, { id: 5, nombre: 'Por cerrar', orden: 5, color: '#B45309' }, { id: 8, nombre: 'Perdido', orden: 8, color: '#999' }]} />
    </div>
  );
}
