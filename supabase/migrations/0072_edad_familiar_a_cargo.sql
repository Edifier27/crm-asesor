-- 0072: regla de edad de Dario (2-nov-2026) en la base de conocimiento de la IA, para los dos CRM.
-- El titular entra a un plan integral hasta los 65 anos y 11 meses; si el titular entra, el resto del
-- grupo (conyuge o un familiar a cargo: mama, papa, abuela, abuelo) puede entrar hasta los 69 anos y 11
-- meses, al precio de lista. Antes la ficha decia 65 para todos y la IA le negaba el integral a una
-- abuela de 69 que entraba con su familia.
-- Va sin tildes a proposito (archivo ASCII). Se puede correr mas de una vez.

update public.conocimiento
   set titulo = 'Edad maxima y mayores de 65',
       contenido =
'- El TITULAR entra a un plan integral hasta los 65 anos y 11 meses. Con 66 o mas no puede ser titular de un plan integral.
- Si el titular entra (65 anos y 11 meses o menos), el resto del grupo puede entrar hasta los 69 anos y 11 meses:
  el conyuge o pareja, y un familiar a cargo que se suma al grupo (mama, papa, abuela, abuelo).
  Ejemplos: un matrimonio de 65 y 69 entra junto. Una familia de 27, 35 y 40 con una abuela de 69 entra toda junta.
  Se cotiza al precio de lista, sin recargo.
- Con 70 o mas no entra a un plan integral, ni siquiera dentro de un grupo. Si alguien que esta solo (o el titular) tiene 66 o mas, tampoco.
- Para esas personas hay dos planes que complementan la obra social de origen (tiene que tener PAMI u otra obra social de convenio; casi siempre son jubilados con PAMI):
  AMBU 1: cubre consultas, tratamientos y estudios; la internacion va por PAMI o su obra social.
  INTER 1: cubre guardias, internacion y cirugia; lo ambulatorio va por PAMI o su obra social.
  En un grupo, el resto entra al plan integral y esa persona va al complemento.
- La IA explica que hay estos complementos y pasa a humano con "pide_cotizacion".
- Los jubilados NO derivan aportes del recibo de jubilacion: entran como particulares (directo) dentro de las edades de arriba; si no entran, el complemento (por ejemplo INTER 1) mas su PAMI.'
 where titulo = 'Edad maxima y mayores de 65';

-- Control: tiene que devolver una fila por CRM
select p.nombre as crm, k.titulo, left(k.contenido, 90) as inicio
  from public.conocimiento k join public.perfiles p on p.id = k.cuenta
 where k.titulo = 'Edad maxima y mayores de 65';
