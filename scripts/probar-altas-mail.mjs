// Casos del cruce de los mails de alta impactada con la planilla (lib/altas-mail.js). Nombres y números inventados.
//   node scripts/probar-altas-mail.mjs
import { fechaIso, leerMailDeAlta, nombreLindo, ventaDelAlta } from '../lib/altas-mail.js';

let fallas = 0;
const ver = (que, obtenido, esperado) => {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!bien) fallas++;
  console.log(`${bien ? '✓' : '✗'} ${que}${bien ? '' : `\n    esperado ${JSON.stringify(esperado)}\n    obtenido ${JSON.stringify(obtenido)}`}`);
};

const CUERPO = `Hola ASESOR, DE PRUEBA:
Te informamos que la solicitud ha sido impactada.
<ul><li>Número de solicitud:: 18000001</li><li>Prepaga: 0</li><li>Número de asociado: 2300001 </li>
<li>Fecha de aplicación: 01/12/2026 0:00:00</li><li>Fecha de realización: 14/11/2026 3:05:02</li><li>Fecha de alta: 12/11/2026 19:11:28</li><li>Integrante: Titular</li>
<li>Apellido(s) y Nombre(s): EJEMPLO PRUEBA, ANA MARIA</li><li>Número de DNI: 30000001</li><li>Código de asesor: XX000 </li>
<li>Plan: S2 </li><li>Tarifa: 0S2_X </li></ul>`;
const alta = leerMailDeAlta({ asunto: 'Informe de Alta Total impactada -Solicitud Nro 18000001', texto: CUERPO });
ver('lee el mail', alta, { solicitud: '18000001', dni: '30000001', nombre: 'EJEMPLO PRUEBA, ANA MARIA', asociado: '2300001', vigencia: '2026-12-01', fechaAlta: '2026-11-12', plan: 'S2', integrante: 'Titular', parcial: false });
ver('nombre lindo', [nombreLindo('VELASQUEZ BENITEZ, JULIO CESAR'), nombreLindo('SCHULZ, JULIETA'), nombreLindo("D'ANGELO, MARÍA-JOSÉ")], ['Julio Cesar Velasquez Benitez', 'Julieta Schulz', "María-José D'Angelo"]);
ver('alta parcial', leerMailDeAlta({ asunto: 'Informe de Alta Parcial impactada -Solicitud Nro 18000002', texto: CUERPO }).parcial, true);
ver('otro mail no es un alta', leerMailDeAlta({ asunto: 'Notificación dictamen DDJJ', texto: 'Te informamos que la solicitud ha sido Rechazada\nNúmero de precarga: 18000003' }), null);
ver('fecha', fechaIso('1/2/2027 0:00:00'), '2027-02-01');

const V = (id, nombres, dni = null, precarga = null) => ({ id, nombres, dni, precarga });
const ventas = [V('a', ['Ana Ejemplo']), V('b', ['Bruno Prueba'], '30000002'), V('c', ['Carla'], null, '18000009'), V('d', ['Diego Muestra', 'Diego M'])];
const por = (r) => (r.venta ? `${r.venta.id}/${r.por}` : r.motivo);
ver('por precarga', por(ventaDelAlta(ventas, { solicitud: '18000009', dni: '1', nombre: 'OTRA, PERSONA' })), 'c/precarga');
ver('por DNI (con puntos)', por(ventaDelAlta(ventas, { solicitud: '18000010', dni: '30.000.002', nombre: 'X, Y' })), 'b/dni');
ver('por nombre, apellido primero y segundo nombre', por(ventaDelAlta(ventas, alta)), 'a/nombre');
ver('por nombre con tilde', por(ventaDelAlta(ventas, { solicitud: '1', dni: '2', nombre: 'MUESTRA, DIÉGO' })), 'd/nombre');
ver('un solo nombre en la planilla no alcanza', por(ventaDelAlta(ventas, { solicitud: '1', dni: '2', nombre: 'GOMEZ, CARLA' })), 'sin_coincidencia');
ver('mismo nombre con otro DNI cargado no es', por(ventaDelAlta(ventas, { solicitud: '1', dni: '39999999', nombre: 'PRUEBA, BRUNO' })), 'sin_coincidencia');
ver('dos ventas con el mismo nombre: a mano', por(ventaDelAlta([...ventas, V('e', ['Ana Ejemplo'])], alta)), 'nombre_repetido');
// DNI y nombre de los documentos que el cliente mandó al chat (la planilla tiene solo "Rocio")
const conDocs = [V('x', ['Rocio'], null, null), V('y', ['Rocio'], null, null)];
conDocs[0].dnis = ['30.000.111']; conDocs[0].nombres.push('ROCIO BELEN EJEMPLO');
conDocs[1].dnis = ['30000222'];
ver('por el DNI del documento del chat', por(ventaDelAlta(conDocs, { solicitud: '1', dni: '30000111', nombre: 'EJEMPLO, ROCIO BELEN' })), 'x/dni');
ver('mismo nombre del documento pero otro DNI: no es', por(ventaDelAlta([conDocs[0]], { solicitud: '1', dni: '30000999', nombre: 'EJEMPLO, ROCIO BELEN' })), 'sin_coincidencia');
const soloNombre = V('z', ['Rocio']); soloNombre.nombres.push('ROCIO BELEN EJEMPLO');
ver('por el nombre completo del documento del chat', por(ventaDelAlta([soloNombre], { solicitud: '1', dni: '30000555', nombre: 'EJEMPLO, ROCIO BELEN' })), 'z/nombre');
ver('nadie', por(ventaDelAlta(ventas, { solicitud: '1', dni: '2', nombre: 'NADIE, CONOCIDO' })), 'sin_coincidencia');

console.log(fallas ? `\n${fallas} casos fallaron` : '\nTodos los casos dan lo esperado');
process.exit(fallas ? 1 : 0);
