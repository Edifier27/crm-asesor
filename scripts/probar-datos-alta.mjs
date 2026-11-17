// Casos de lib/ia/datos-alta.js. Datos inventados.   node scripts/probar-datos-alta.mjs
import { datosDelAlta } from '../lib/ia/datos-alta.js';
let fallas = 0;
const ver = (que, obtenido, esperado) => { const b = JSON.stringify(obtenido) === JSON.stringify(esperado); if (!b) fallas++; console.log(`${b ? '✓' : '✗'} ${que}${b ? '' : `\n   esperado ${JSON.stringify(esperado)}\n   obtenido ${JSON.stringify(obtenido)}`}`); };
const dni = (tipo, datos = {}, persona = 'titular') => ({ tipo, persona, datos });
const completo = dni('dni_completo', { dni: '30123456', nombre_completo: 'EJEMPLO ANA', fecha_nacimiento: '1990-05-04', domicilio: 'CALLE FALSA 123, CASTELAR' });

ver('nuevo, sin nada: falta el DNI, el mail y el domicilio', datosDelAlta({ relevamiento: {} }, []).faltan, ['la foto del DNI del titular, frente y dorso', 'el mail', 'el domicilio con la localidad']);
ver('nuevo con DNI completo y mail: nada falta', datosDelAlta({ email: 'a@b.com', relevamiento: {} }, [completo]).faltan, []);
ver('el domicilio sale del DNI', datosDelAlta({ email: 'a@b.com', relevamiento: {} }, [completo]).titular.domicilio, 'CALLE FALSA 123, CASTELAR');
ver('la localidad que dijo reemplaza al domicilio', datosDelAlta({ email: 'a@b.com', relevamiento: { localidad: 'Castelar' } }, [dni('dni_frente', { dni: '30123456' }), dni('dni_dorso')]).faltan, []);
ver('solo el frente: se pide el dorso pero no frena', datosDelAlta({ email: 'a@b.com', venta: { dni: '30123456' }, relevamiento: { localidad: 'Castelar' } }, [dni('dni_frente', { dni: '30123456' })]).pedir.length, 1);
ver('el DNI como número en la ficha alcanza para no frenar', datosDelAlta({ email: 'a@b.com', venta: { dni: '30.123.456' }, relevamiento: { localidad: 'X' } }, []).faltan, []);
const sf = datosDelAlta({ salesforce_id: '00Qxxxxxxxxxxxxxxx', relevamiento: {} }, [completo]);
ver('de Salesforce: no se pide mail ni domicilio', sf.faltan, []);
ver('de Salesforce: se chequea contra la ficha', sf.chequear.length > 0 && sf.vieneDeSalesforce, true);
ver('de Salesforce sin foto: igual se pide el DNI', datosDelAlta({ salesforce_id: '00Qxxxxxxxxxxxxxxx', relevamiento: {} }, []).faltan, ['la foto del DNI del titular, frente y dorso']);
ver('el DNI de un hijo no cuenta como del titular', datosDelAlta({ email: 'a@b.com', relevamiento: { localidad: 'X' } }, [dni('dni_completo', { dni: '50111222' }, 'hijo')]).faltan.length, 1);
ver('la foto que se está leyendo no se vuelve a pedir', datosDelAlta({ email: 'a@b.com', relevamiento: { localidad: 'X' } }, [{ tipo: 'pendiente', estado: 'leyendo', datos: null }]).faltan, []);
ver('una foto ilegible sí se vuelve a pedir', datosDelAlta({ email: 'a@b.com', relevamiento: { localidad: 'X' } }, [{ tipo: 'dni_frente', persona: 'titular', estado: 'ilegible', datos: {} }]).faltan, ['la foto del DNI del titular, frente y dorso']);
console.log(fallas ? `\n${fallas} casos fallaron` : '\nTodos los casos dan lo esperado');
process.exit(fallas ? 1 : 0);
