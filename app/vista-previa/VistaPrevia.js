'use client';

import { useEffect, useState } from 'react';
import ListaChats from '../(panel)/bandeja/ListaChats';
import Conversacion from '../(panel)/bandeja/[id]/Conversacion';
import RielPlegable from '../(panel)/RielPlegable';
import Ficha from '../(panel)/bandeja/[id]/Ficha';
import RielLinks from '../(panel)/RielLinks';
import VisorArchivo from '../(panel)/componentes/VisorArchivo';
import ReproductorGlobal from '../(panel)/componentes/ReproductorGlobal';
import Tablero from '../(panel)/embudo/Tablero';

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

// /vista-previa?embudo → el tablero del Embudo con leads de ejemplo
const ETAPAS_EJEMPLO = [['Nuevo', '#64748B'], ['En conversación', '#0B6E5F'], ['PrepagaYa', '#E8002D'], ['Botmaker', '#DB2777'], ['Salesforce', '#0176D3'],
  ['Datos completos', '#0E7490'], ['Cotizado', '#7C3AED'], ['Por cerrar', '#B45309'], ['Falta de cobro', '#C2410C'], ['Ganado', '#15803D'], ['Perdido', '#B91C1C']]
  .map(([nombre, color], i) => ({ id: i + 1, nombre, orden: i + 1, color }));
const leadEjemplo = (n, nombre, etapa_id, modo = 'ia') => ({
  id: `conv-${n}`, modo, ultimo_mensaje_at: hace(n * 17), ultimo_mensaje_texto: 'Hola, quería consultar por un plan para mi familia', no_leidos: 0,
  ia_pensando_desde: null, resumen_ia: null, seguimiento_at: null, seguimiento_motivo: null, seguimiento_responsable: 'ia',
  contacto: { id: `c-${n}`, nombre, telefono: `54911223344${10 + n}`, etapa_id, zona: 'AMBA', origen: 'web', temperatura: n % 3 === 0 ? 'caliente' : null, valor: 0, plan_cotizado: null, relevamiento: {}, etiquetas: [] }
});
// Uno con un próximo paso bien largo: es lo que antes ensanchaba la columna entera
const conPasoLargo = (l) => ({ ...l, seguimiento_at: hace(540), seguimiento_responsable: 'asesor',
  seguimiento_motivo: 'Responderle ahora: pagó 377.000 por 4 estudios de audición en consultorio de otorrino de cartilla. Mirar la imagen, averiguar con qué plan o copago cuenta y si el prestador factura esos estudios' });
const LEADS_EJEMPLO = [leadEjemplo(1, 'Carla Ruiz', 1), leadEjemplo(2, 'Martín Sosa', 1), conPasoLargo(leadEjemplo(3, 'Ana Paz', 2, 'humano')), leadEjemplo(4, 'Julián Vera', 3),
  leadEjemplo(5, 'Sol Ibáñez', 6), leadEjemplo(6, 'Pedro Gil', 7, 'humano'), leadEjemplo(7, 'Rocío Luna', 11, 'pausada')];

// /vista-previa?embudo=120 → el tablero con esa cantidad de leads (para probar que no se trabe con una cartera real)
const muchosLeads = (n) => Array.from({ length: n }, (_, i) => {
  const l = leadEjemplo(i + 1, `Lead de prueba ${i + 1}`, (i % 11) + 1, i % 3 ? 'ia' : 'humano');
  l.contacto.etiquetas = [{ etiqueta: { id: 1, nombre: 'Familia', color: '#7C3AED' } }, { etiqueta: { id: 2, nombre: 'Relación de dependencia', color: '#0E7490' } }];
  return i % 2 ? conPasoLargo(l) : l;
});

// Plantillas de ejemplo para probar el selector del chat (buscador)
const PLANTILLAS_EJEMPLO = [
  ['recontacto_48hs', 'Hola {{1}}, te escribo para saber si pudiste ver la cotizacion que te mande. Te quedo alguna duda?'],
  ['sin_respuesta_2do_contacto', 'Hola {{1}}, como estas? Te escribi hace unos dias por tu consulta de Swiss Medical. Seguis buscando cobertura?'],
  ['pudiste_ver_el_plan', 'Hola {{1}}, pudiste ver el plan que te pase? Si queres lo repasamos juntos.'],
  ['cotizado_48hs', 'Hola {{1}}, te deje la cotizacion hace dos dias. Queres que avancemos con el alta?'],
  ['link_de_pago', 'Hola {{1}}, te paso el link para completar el pago: {{2}}'],
  ['reclamo_documentacion', 'Hola {{1}}, me falta la documentacion para avanzar con tu legajo. Me la podes enviar?']
].map(([nombre, cuerpo], i) => ({ id: i + 1, nombre, cuerpo, uso: null, conexion: null }));

export default function VistaPrevia() {
  const [embudo, setEmbudo] = useState(false);
  const [cantidad, setCantidad] = useState(0);
  useEffect(() => { setCantidad(Number(new URLSearchParams(location.search).get('embudo')) || 0); }, []);
  useEffect(() => { setEmbudo(new URLSearchParams(location.search).has('embudo')); }, []);
  const [audio, setAudio] = useState(null);
  const [visor, setVisor] = useState(false);
  const [conChat, setConChat] = useState(true); // probar la barrita: window.__salirDelChat()
  useEffect(() => { window.__salirDelChat = () => setConChat(false); }, []);
  useEffect(() => { setAudio(tono()); setVisor(new URLSearchParams(location.search).has('visor')); }, []);
  if (embudo) return <div className="app"><Tablero key={cantidad} etapas={ETAPAS_EJEMPLO} inicial={cantidad ? muchosLeads(cantidad) : LEADS_EJEMPLO} /></div>;
  if (!audio) return null;

  const mensajes = [
    { id: 'a1', direccion: 'saliente', autor: 'sistema', tipo: 'texto', texto: 'Lead nuevo de la web (Formulario familias)', creado_at: hace(1500) },
    { id: 'a2', direccion: 'saliente', autor: 'ia', tipo: 'plantilla', plantilla: 'bienvenida', texto: 'Hola Lucía, mi nombre es Darío, te contacto por la consulta que hiciste en la web. El plan sería para vos o para tu grupo familiar?', estado: 'leido', creado_at: hace(1490) },
    { id: 'a3', direccion: 'entrante', autor: 'contacto', tipo: 'texto', texto: 'Hola! para mí, mi marido y mi hija de 3', creado_at: hace(80) },
    { id: 'a4', direccion: 'entrante', autor: 'contacto', tipo: 'texto', texto: 'tenemos 34 y 36', creado_at: hace(79), reacciones: { asesor: '👍' } },
    { id: 'a5', direccion: 'saliente', autor: 'asesor', tipo: 'texto', texto: 'Genial Lucía! Lo harían en forma particular o derivando aportes?', estado: 'leido', creado_at: hace(70), responde_a: 'a4' },
    { id: 'a6', direccion: 'saliente', autor: 'asesor', tipo: 'audio', texto: 'Audio grabado (0:06)', urlLocal: audio, estado: 'leido', escuchado_at: hace(60), creado_at: hace(69) },
    { id: 'a7', direccion: 'entrante', autor: 'contacto', tipo: 'audio', urlLocal: audio, transcripcion: 'Hola, te cuento que estoy en relación de dependencia y quiero derivar los aportes, somos tres en total.', creado_at: hace(30) },
    { id: 'a8', direccion: 'saliente', autor: 'asesor', tipo: 'texto', texto: 'Perfecto, ya te armo la cotización 🙌', estado: 'enviado', creado_at: hace(2) }
  ];
  const largos = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, direccion: i % 2 ? 'entrante' : 'saliente', autor: i % 2 ? 'contacto' : 'asesor', tipo: 'texto', texto: `Mensaje de prueba número ${i + 1} para que el chat sea largo`, estado: 'leido', creado_at: hace(60 - i) }));
  mensajes.push(...largos);
  const conversacion = {
    id: '00000000-0000-0000-0000-000000000000', modo: 'humano', ventana_expira_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    ia_pensando_desde: null, resumen_ia: null, contacto
  };
  const lista = [
    { id: conversacion.id, modo: 'humano', ultimo_mensaje_at: hace(2), ultimo_mensaje_texto: 'Perfecto, ya te armo la cotización 🙌', ultimo_es_propio: true, no_leidos: 0, contacto: { ...contacto, temperatura: 'caliente' } },
    { id: 'c2', modo: 'humano', ultimo_mensaje_at: hace(15), ultimo_mensaje_texto: 'me pasás los valores?', no_leidos: 2, espera_desde: hace(15), contacto: { id: 'x', nombre: 'Martín Gómez', telefono: '5491133445566', temperatura: 'tibio', etiquetas: [] } },
    { id: 'c3', modo: 'humano', ultimo_mensaje_at: hace(300), ultimo_mensaje_texto: '🎤 Audio', no_leidos: 0, espera_desde: hace(95), seguimiento_responsable: 'asesor', seguimiento_at: hace(10), seguimiento_motivo: 'Volver a contactar: quedó en verlo', contacto: { id: 'y', nombre: 'Carla Ruiz', telefono: '5491144556677', temperatura: 'frio', etiquetas: [] } }
  ];

  return (
    <div className="app">
      {/* Probar la lupa del visor: /vista-previa?visor=1 */}
      {visor && <VisorArchivo url="/icono-512.png" nombre="Foto de prueba" tipo="imagen" onCerrar={() => setVisor(false)} />}
      <RielPlegable><div className="riel-marca">AC</div><RielLinks esAdmin /></RielPlegable>
      <ListaChats inicial={lista} iaInicial={3} />
      <ReproductorGlobal />
      {conChat && <Conversacion conversacion={conversacion} mensajesIniciales={mensajes} onFicha={() => {}} audios={[]} plantillas={PLANTILLAS_EJEMPLO} modoPrueba={false}
        equipo={{ yo: 'yo', nombres: { yo: 'Darío' } }} respuestasIniciales={[]} sinConexion />}
      <Ficha conversacion={{ ...conversacion, contacto: { ...contacto, etapa_id: 4, relevamiento: {}, documentos: [] } }} abierta lista={null} todasEtiquetas={[]} onCerrar={() => {}}
        formularios={[{ id: 'f1', nombre: 'Resumen de historia clínica', descripcion: 'Lo completa y firma el médico tratante', path: 'ejemplo-1.pdf', auditoria_medica: true },
          { id: 'f2', nombre: 'Certificado de buena salud', descripcion: 'Menores de 2 años: firmado y sellado por el pediatra', path: 'ejemplo-2.pdf', auditoria_medica: true },
          { id: 'f3', nombre: 'Declaración jurada', descripcion: null, path: 'ejemplo-3.pdf', auditoria_medica: false }]}
        etapas={[{ id: 1, nombre: 'Nuevo', orden: 1, color: '#999' }, { id: 4, nombre: 'Cotizado', orden: 4, color: '#7C3AED' }, { id: 5, nombre: 'Por cerrar', orden: 5, color: '#B45309' }, { id: 8, nombre: 'Perdido', orden: 8, color: '#999' }]} />
    </div>
  );
}
