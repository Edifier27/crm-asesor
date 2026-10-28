// Carga en la base de conocimiento de la IA (las dos cuentas) las respuestas de Darío del 26/28-oct-2026
import { createRequire } from 'module';
const require = createRequire('C:/Users/USUARIO/Desktop/WEBS/crm-asesor/package.json');
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CUENTAS = ['744ee759-b166-4db6-95ed-6961e7c1c784', '8a16229f-fee0-48fa-9b27-309d7e98971b'];
const aplicar = process.argv.includes('--aplicar');

const NUEVOS = [
  ['Sanatorios por plan (que tiene cada uno)', `- S1 y SMG02 (cartilla Nubial): en Capital tienen practicamente todos los prestadores. En Buenos Aires NO tienen Clinica Bessone (San Martin / San Miguel) salvo para guardia, ni Hospital Austral (Pilar).
- Desde el S2 (cartilla Global) suman: Clinica Bessone para todo (tambien consultas programadas), Hospital Austral, Hospital Italiano, Fundacion Favaloro y Otamendi-Miroli.
- Hospital Aleman y Fleni: desde el SMG30 (cartilla Premium).
- En todos los planes: Sanatorio Allende (Cordoba), San Camilo y Centro Deragopyan.
- En Pinamar, Tandil, Villa Gesell y Moreno estan todos los sanatorios de mayor prestigio de la zona.
- Si con S1 o SMG02 pregunta por uno que no tiene (Italiano, Favaloro, Otamendi, Austral, Bessone para consultas): decile que lo suma en el siguiente plan, sin nombrar el plan si no pregunta.
- Para mostrarle los sanatorios de su zona usa enviar_cartilla_o_prestaciones: "prestaciones" si pregunta por sanatorios o clinicas, "cartilla" si pide la cartilla. Al S1 y al SMG02 se les manda la cartilla Global a proposito (son casi iguales y le muestra lo que suma subiendo de plan).`],
  ['Prestaciones por plan (psicologia, kinesio, odontologia, ojos, laboratorio)', `- Psicologia: S1 y SMG02 con copago. Desde el SMG20, 30 sesiones sin cargo, en todo el pais.
- Kinesiologia: S1 con copago. SMG02, 25 sesiones. Desde el SMG20 sin tope, e incluye RPG (rehabilitacion postural global).
- Nutricion: en el S1 con copago; en el SMG02 entra como consulta.
- SMG20 ademas incluye flebologia y un par de lentes al 100%.
- Laboratorio: S1 y S2 con copago. SMG02, SMG20 y los demas al 100%.
- Emergencias: cubiertas en todos los planes. Visita medica a domicilio: al 100% desde el SMG20; en S1, SMG02 y S2 con copago.
- Ortodoncia: desde el SMG20, para menores de 15 años al 100%. En el SMG50 la ortodoncia no tiene tope para todo el grupo, a cualquier edad y con cualquier prestador.
- Implantes y protesis: siempre por reintegro (no estan en el PMO). A mayor plan, mayor reintegro. El porcentaje depende del presupuesto del odontologo: si el presupuesto es 100 y le reintegran 10, paga 90. En odontologia el S1, S2 y SMG20 son abiertos (con reintegros).
- Cirugia refractiva (ojos): en S1 y S2 por reintegro segun presupuesto; desde el SMG20 al 100%.
- Cirugia estetica: desde el SMG50 (hasta el SMG70). Se ofrece el SMG50 como el plan que incluye la cirugia estetica y la ortodoncia.
- Plan cerrado: si va a un medico fuera de cartilla no tiene reintegro de la consulta.`],
  ['Aumentos, rangos de edad y promocion', `- Aumentos: bimestrales, en general medio punto menos que la inflacion (si la inflacion da 2%, aumenta 1,5%).
- Rangos de edad: cambian a los 26, 36, 41, 46, 51, 56 y 61 (el ultimo). Cada salto suma alrededor de un 10%.
- La promocion (15% o 25%) dura 1 año. Al terminar el cliente llama y, con un uso normal (consultas, estudios, operaciones), en general se la renuevan; con un caso de salud complejo no. Esto solo si pregunta: las promociones no se anuncian.`],
  ['Pago: IVA, debito y primer mes', `- El precio lleva IVA para directos y monotributistas. Con recibo de sueldo (derivacion) no lleva IVA.
- Si elige vigencia inmediata, el primer mes se cobra un proporcional.
- Fecha de debito a eleccion: el 5, el 10 o el 20.
- Formas de pago: todas las tarjetas de credito y debito, billeteras digitales, etc.`],
  ['Derivacion de aportes: prepagas, obras sociales, cautivas y jubilados', `- Para el tramite de derivacion se le pasa al cliente un instructivo (lo manda el asesor).
- De prepaga a prepaga (ej.: de OSDE a Swiss Medical) se pasa de un mes al otro, sin tiempo de espera.
- Si viene de una obra social (ej.: OSECAC) tiene que haber pasado 1 año desde su ultimo cambio de obra social.
- Obras sociales cautivas (provinciales, IOSEP, IAPOS, OSEP, OSFA y similares): no pueden derivar aportes; va como particular, con precio especial.
- Jubilados: no pueden derivar los aportes; van como particulares.`],
  ['Baja de la prepaga anterior sin pagar doble', `1. Primero se da el alta en Swiss Medical y la bienvenida.
2. La vigencia la elige el cliente: inmediata o el 1 del mes que viene. Si viene de otra prepaga, en general es el 1 del mes siguiente.
3. Con la bienvenida, pide en su prepaga actual una baja futura: tiene esa cobertura hasta el ultimo dia del mes y desde el 1 ya arranca con Swiss Medical.`],
  ['Despues del alta: credencial y app', `- Desde la fecha de vigencia se crea el usuario con su DNI en swissmedical.com.ar o en la app Swiss Medical Mobile, y ahi tiene la credencial (se muestra el celular).
- Con alta futura (ej.: el 1 del mes que viene), la app recien lo deja entrar desde esa fecha.`],
  ['Grupo familiar: pausas, planes distintos y empresas', `- No se puede pausar a un integrante (ej.: un hijo que se va unos meses al exterior): se le da la baja y cuando vuelve el asesor le da el alta de nuevo.
- Se pueden poner integrantes del grupo en planes distintos.
- Grupos grandes o planes de empresa se cotizan aparte: pasa a humano.`]
];
// Embarazo en curso: se agrega al tema que ya existe
const EMBARAZO = '\n- Si ya esta embarazada al momento de afiliarse, por nosotros no se puede: se la deriva a una sucursal de Swiss Medical (decilo con amabilidad y pasa a humano).';

for (const cuenta of CUENTAS) {
  const { data: hay } = await s.from('conocimiento').select('id, titulo, contenido').eq('cuenta', cuenta);
  for (const [titulo, contenido] of NUEVOS) {
    const ya = hay.find((h) => h.titulo === titulo);
    console.log(cuenta.slice(0, 8), ya ? 'actualiza' : 'nuevo', '|', titulo);
    if (!aplicar) continue;
    if (ya) await s.from('conocimiento').update({ contenido, activo: true }).eq('id', ya.id);
    else await s.from('conocimiento').insert({ cuenta, titulo, contenido, activo: true });
  }
  const emb = hay.find((h) => h.titulo.startsWith('Embarazo'));
  if (emb && !emb.contenido.includes('sucursal')) {
    console.log(cuenta.slice(0, 8), 'agrega a', emb.titulo);
    if (aplicar) await s.from('conocimiento').update({ contenido: emb.contenido + EMBARAZO }).eq('id', emb.id);
  }
}
console.log(aplicar ? 'APLICADO' : 'prueba en seco (agregá --aplicar)');
