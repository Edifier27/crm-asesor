// Casos de lib/alta-claude.js. Datos inventados.   node scripts/probar-alta-claude.mjs
import { armarOrden, leerResultado } from '../lib/alta-claude.js';
let fallas = 0;
const ver = (que, obtenido, esperado) => { const b = JSON.stringify(obtenido) === JSON.stringify(esperado); if (!b) fallas++; console.log(`${b ? '✓' : '✗'} ${que}${b ? '' : `\n   esperado ${JSON.stringify(esperado)}\n   obtenido ${JSON.stringify(obtenido)}`}`); };
const datos = { nombres: 'Ana', apellido: 'Ejemplo', dni: '30123456', fecha_nacimiento: '1990-05-04', domicilio: 'Calle Falsa 123', localidad: 'Castelar', provincia_sf: 'Buenos Aires', codigo_area: '11', telefono_numero: '55550000', email: 'ana@ejemplo.com', relacion_laboral: 'Particular', integrantes: [{ parentesco: 'titular', edad: 34 }, { parentesco: 'hijo', edad: 5 }], plan: 'SMG02', modalidad: 'directo' };

const nuevo = armarOrden('nuevo', datos, { faltan: [] });
ver('nuevo: dice que hay que crearlo', nuevo.includes('NUEVO, que hay que crear en Salesforce') && nuevo.includes('creá el candidato B2C'), true);
ver('nuevo: lleva los datos', ['Ana Ejemplo', '04/05/1990', 'Calle Falsa 123', 'Castelar', 'ana@ejemplo.com', 'hijo, 5 años', 'SMG02'].every((x) => nuevo.includes(x)), true);
const sf = armarOrden('salesforce', { ...datos, salesforce_id: '00Qabcdefghijkl123' }, { chequear: ['DNI: que coincida con la ficha de Salesforce'] });
ver('salesforce: no los vuelve a cargar y chequea', sf.includes('YA ESTÁ en Salesforce') && sf.includes('NO los vuelvas a cargar') && sf.includes('que coincida con la ficha de Salesforce'), true);
ver('salesforce: usa el ID del candidato', sf.includes('00Qabcdefghijkl123'), true);
ver('pide frenar antes de guardar', nuevo.includes('esperá mi OK') && sf.includes('esperá mi OK'), true);
ver('pide el bloque de resultado', nuevo.includes('RESULTADO PARA EL CRM') && nuevo.includes('Oportunidad:'), true);
ver('lo que falta se avisa', armarOrden('nuevo', datos, { faltan: ['el mail'] }).includes('Todavía le falta al CRM: el mail'), true);
ver('sin datos no se rompe', typeof armarOrden('nuevo', {}, {}), 'string');

const r = leerResultado('Listo.\nRESULTADO PARA EL CRM\nLink: https://asociarme.swissmedical.com.ar/personas/abc/solicitudes/302123456.\nCandidato: 00QAB1234567890XYZ\nOportunidad: 006AB1234567890XYZ\nDiferencias: ninguna');
ver('lee el link sin el punto final', r.link, 'https://asociarme.swissmedical.com.ar/personas/abc/solicitudes/302123456');
ver('lee candidato y Oportunidad', [r.salesforceId, r.oportunidad, r.diferencias], ['00QAB1234567890XYZ', '006AB1234567890XYZ', 'ninguna']);
ver('sin nada devuelve nulos', Object.values(leerResultado('no pude')).every((v) => v === null), true);
ver('link de clubswiss también', leerResultado('Link: https://asociarme.clubswiss.com.ar/x/1').link, 'https://asociarme.clubswiss.com.ar/x/1');
console.log(fallas ? `\n${fallas} casos fallaron` : '\nTodos los casos dan lo esperado');
process.exit(fallas ? 1 : 0);
