-- 0047: capacitacion de Dario (10-oct-2026) en la base de conocimiento de la IA, para los dos CRM.
-- Fichas nuevas: competencia, promociones, medicamentos y anticonceptivos, cobertura en el exterior, embarazo,
-- edad maxima (AMBU 1 / INTER 1). Se reescriben: planes que ofrecemos (orden nuevo y diferencias de cobertura),
-- chequeo medico total y prestadores destacados (ya no dicen "lo consultas": la IA no puede decirlo).
-- Va sin tildes a proposito (archivo ASCII). Se puede correr mas de una vez: reemplaza las fichas por titulo.

-- Todo en un solo bloque: el SQL Editor de Supabase corre cada sentencia por separado y una tabla temporal
-- creada en una sentencia no existe en la siguiente
do $do$
begin
drop table if exists capacitacion;
create temporary table capacitacion (titulo text primary key, contenido text not null);

insert into capacitacion (titulo, contenido) values
('Planes que ofrecemos y para quien',
'QUE PLANES OFRECER (no ofrecer otros salvo que el cliente pida algo puntual)
- AMBA (CABA y GBA): SMG02 y S1. Son el mismo plan: misma cartilla, misma estructura, misma calidad. El S1 tiene un copago fijo de $14.000 en consultas y estudios (el resto esta todo cubierto); el SMG02 no tiene copago.
- Resto del pais (interior, Cordoba, Patagonia, etc.): el S1 y el SMG02 NO existen. Se ofrecen S2 y SMG20, mismo plan entre si: el S2 con copago fijo de $14.000 en consultas y estudios, el SMG20 sin copago.
- Plan Sport: NO se ofrece. Solo si pide cobertura de gimnasio o deporte, pasa a humano.

ORDEN PARA PRESENTARLOS
- AMBA: empezar por el SMG02 (en AMBA a la gente no le gustan los copagos y lo puede pagar). Si le parece caro, bajar al S1: "tengo algo mucho mas economico, de iguales caracteristicas, misma calidad de servicio, misma cartilla y misma estructura de plan. la diferencia es que pagas un copago de 14 mil pesos en consultas y estudios, el resto esta cubierto".
- Interior y resto del pais: empezar por el S2 (es mas economico y en el interior el poder adquisitivo viene cayendo). Si pide un plan sin copago, subir al SMG20.
- Mayores de 50, sobre todo en el interior: directo el S2.
- Si viene de una prepaga mas barata (por ej. Sancor) o el precio es su preocupacion: el plan con copago.

QUE INCLUYEN TODOS (S1, SMG02, S2, SMG20)
Internacion y cirugia en habitacion individual, odontologia general, medico online, chequeo medico total, descuento en medicamentos y anticonceptivos. Cobertura en todo el pais.

DIFERENCIAS ENTRE PLANES (para responder si preguntan)
- Optica al 100%: S1, S2 y SMG20 si. El SMG02 NO tiene optica.
- Reintegros odontologicos en protesis e implantes: S1 y S2 si. El SMG02 tiene solo odontologia general, sin reintegros.
- Por eso, para quien quiere optica o implantes, en AMBA el S1 es mejor que el SMG02.
- Ortodoncia fija y removible al 100%: SMG20 para menores de 15 anos; SMG30 para menores de 18 (y reintegros en protesis e implantes para mayores); SMG50 para todas las edades e incluye una cirugia estetica.
- Cobertura internacional: desde el SMG30 en adelante. S1, SMG02, S2 y SMG20 tienen solo cobertura nacional.'),

('Competencia: OSDE, Galeno, Medife, Sancor',
'- La unica competencia directa de Swiss Medical es OSDE. OSDE tiene unos 2,5 millones de afiliados y Swiss Medical unos 2 millones: a una prepaga la hace la cantidad de afiliados.
- OSDE es lider y es muy buena (cartilla amplia, sin autorizaciones, muy eficiente en lo administrativo). Nunca hables mal de OSDE. Decile que Swiss Medical es lo mas parecido a OSDE, esta en igualdad de condiciones en cobertura y es mucho mas economica.
- La gran diferencia de Swiss Medical: prestadores propios, que dan prioridad en la atencion. Clinica Suizo Argentina, Sanatorio Los Arcos, Sanatorio Agote, Sanatorio Zabala y unos 30 Swiss Medical Center. Hay centros en Salta, Neuquen y todo el pais, sobre todo en CABA y GBA.
- Galeno, Medife y Sancor: para acceder a una cartilla como la del S1 o el SMG02 hay que irse a planes mucho mas altos de esas prepagas. Sancor y Galeno piden autorizaciones; Swiss Medical no.
- Precio: el S1 y el SMG02 tienen un precio imbatible. El S1 suele salir mas economico que Sancor o Medife.
- Objecion "Swiss Medical es cara": la gente lo cree por lo bien posicionada que esta. Por eso siempre se arranca por los planes de entrada.
- Si lo tienta una promocion de otra prepaga: Sancor, Medife o Galeno ofrecen promociones muy atractivas para entrar, pero duran 3 o 4 meses. Las de Swiss Medical duran un ano.'),

('Promociones y como dar el precio',
'- No anuncies "tenes una promocion": el precio que se le pasa ya tiene la promocion aplicada. Los precios los manda el asesor con el cotizador, la IA no da precios.
- Las promociones duran un ano (las de la competencia, 3 o 4 meses).
- Como se aplican (lo calcula el cotizador): todos los adultos (individual, pareja o grupo familiar) tienen 15%. Los menores de 26 (hasta 25 anos y 11 meses) y los hijos, 50%. Monotributista sin hijos (individual o pareja): 25% en vez del 15%. Monotributista con hijos: 15% mas 50% a los hijos (el 25% del monotributo no se suma al 50% de los hijos, no conviene). Nordelta, Tigre, Escobar y Pilar: 25% que SI se suma al 50% de los hijos.
- No hay descuento por debito automatico.'),

('Medicamentos y anticonceptivos',
'Solo para responder si el cliente pregunta por la cobertura. Nunca preguntes que medicacion toma (eso es dato de salud: si lo cuenta, aguardame un segundo y pasa a humano).
- Descuento en medicamentos del 40% al 100% segun el medicamento: venta libre 40%; tratamiento prolongado (por ejemplo hipotiroidismo o hipertension arterial) 70%; internacion y cirugia o medicacion de por vida 100%.
- Anticonceptivos: las pastillas al 100% en la farmacia y el DIU al 100%; el parche anticonceptivo al 40%. Los preservativos al 100% por reintegro: se compran, se guarda el ticket y se pide el reintegro.'),

('Cobertura en el exterior',
'- Solo desde el SMG30 en adelante. S1, SMG02, S2 y SMG20 tienen cobertura nacional.
- La brinda Universal Assistance, con el plan mas alto que tienen.
- Se activa desde la app o llamando a Universal Assistance: te piden el destino, cuando salis y cuando volves.
- Europa tiene un minimo asegurado (fee) mas alto que el resto del mundo, por eso en cualquier cobertura viajar a Europa sale mas caro que, por ejemplo, a Estados Unidos.'),

('Embarazo: carencia e ingreso',
'- Carencia de embarazo: 2 meses. Si se afilia en noviembre, puede quedar embarazada desde enero.
- Si queda embarazada antes, paga la carencia: si queda en diciembre paga 1 mes, si queda en noviembre paga 2 meses.
- En ninguna circunstancia se puede ingresar embarazada: con un embarazo en curso se consulta en una sucursal de Swiss Medical.'),

('Edad maxima y mayores de 65',
'- Para un plan integral se puede ingresar hasta los 65 anos y 11 meses. Con 66 o mas no entra a un plan integral.
- Para esas personas hay dos planes que complementan la obra social de origen (tiene que tener PAMI u otra obra social de convenio; casi siempre son jubilados con PAMI):
  AMBU 1: cubre consultas, tratamientos y estudios; la internacion va por PAMI o su obra social.
  INTER 1: cubre guardias, internacion y cirugia; lo ambulatorio va por PAMI o su obra social.
- La IA explica que hay estos complementos y pasa a humano con "pide_cotizacion".
- Los jubilados NO derivan aportes del recibo de jubilacion: hasta 65 anos y 11 meses entran como particulares (directo); con 66 o mas, el complemento (por ejemplo INTER 1) mas su PAMI.'),

('Chequeo medico total',
'Todos los planes que ofrecemos (S1, SMG02, S2 y SMG20) incluyen el "chequeo medico total", que incluye el apto fisico. Se dice asi: "chequeo medico total".
- En unas 3 horas te haces todos los estudios del ano, clinico y ginecologico, para todo el grupo familiar.
- En los planes con copago (S1, S2) aplica el copago; en los sin copago (SMG02, SMG20) es sin cargo.
- En AMBA se hace en el Instituto Dupuytren. En el resto del pais hay varios centros: solo nombralo; el socio busca el centro en la cartilla o la app.'),

('Prestadores destacados en CABA',
'Linea propia de Swiss Medical: Clinica Suizo Argentina, Sanatorio Los Arcos, Sanatorio Agote, Sanatorio Zabala y los Swiss Medical Center. Ademas: Hospital Britanico, Sanatorio de la Trinidad, CEMIC, Mater Dei e Instituto Dupuytren. Nombralos cuando el lead esta en CABA o GBA. Si pregunta por un prestador puntual que no esta en esta lista, mandale "aguardame un segundo" y pasa a humano.');

-- Las fichas viejas con el mismo tema (algunas tienen tildes en el titulo) se reemplazan en las dos cuentas
delete from public.conocimiento k
 where k.cuenta in (select cuenta from public.numeros_whatsapp)
   and (k.titulo in (select titulo from capacitacion)
        or k.titulo ilike 'Planes que ofrecemos y para qui%'
        or k.titulo ilike 'Chequeo m_dico total'
        or k.titulo ilike 'Prestadores destacados en CABA');

insert into public.conocimiento (cuenta, titulo, contenido, activo)
select n.cuenta, c.titulo, c.contenido, true
  from capacitacion c cross join (select distinct cuenta from public.numeros_whatsapp) n;

drop table capacitacion;
end
$do$;

-- Control: fichas activas de cada CRM
select p.nombre as crm, k.titulo
  from public.conocimiento k join public.perfiles p on p.id = k.cuenta
 where k.activo
 order by p.nombre, k.titulo;
