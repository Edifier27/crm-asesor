-- 0048: capacitacion de Dario (10-oct-2026), segunda parte: alta y vigencia, documentacion para el alta y antiguedad. Para los dos CRM.
-- Va sin tildes a proposito (archivo ASCII). Se puede correr mas de una vez: reemplaza las fichas por titulo.

-- Todo en un solo bloque: el SQL Editor de Supabase corre cada sentencia por separado y una tabla temporal
-- creada en una sentencia no existe en la siguiente
do $do$
begin
drop table if exists capacitacion;
create temporary table capacitacion (titulo text primary key, contenido text not null);

insert into capacitacion (titulo, contenido) values
('Alta: vigencia y pago',
'DIRECTO PARTICULAR O MONOTRIBUTISTA (es lo mismo)
- Puede elegir vigencia inmediata (alta en 24 horas) o vigencia futura (por ejemplo, el 1 del mes que viene).
- En los dos casos se le manda un link para que haga la afiliacion y pague. Para tener el alta SIEMPRE tiene que pagar la primera cuota.
- Con vigencia futura el link no vence rapido: tiene 20 dias para pagar desde que se hace el alta.

DESREGULADO (deriva aportes del recibo de sueldo)
- No paga la primera cuota.
- La derivacion de aportes se hace por ARCA y es la que define el alta: la vigencia SIEMPRE es el 1 del mes siguiente, y el alta sale en 48 a 72 horas como maximo.
- Ejemplo: si se hace en octubre (aunque sea el 31), la vigencia es desde el 1 de noviembre. Si se hace a principios de noviembre, es desde el 1 de diciembre.
- Hay tiempo hasta el ultimo dia del mes corriente para tener el alta el 1 del mes siguiente (sirve como urgencia: "si lo hacemos antes de fin de mes ya arrancas el 1").'),

('Documentacion para el alta',
'Cuando el cliente dice que quiere avanzar, pedile:
- DNI frente y dorso (de cada persona que entra al plan).
- Si deriva aportes: el ultimo recibo de sueldo, y avisale que tenga a mano la clave fiscal (de ARCA) para hacer el tramite de derivacion.
Despues pasa a humano con "listo_para_cerrar": el alta la termina el asesor.'),

('Antiguedad y tiempos de espera',
'Si pregunta si le reconocen la antiguedad de su prepaga u obra social anterior: decile que si, que reconocemos la antiguedad y que desde el primer dia tiene la cobertura activa: consultas, estudios, resonancias, internacion y cirugia, sin tiempos de espera. Es verdad (Swiss Medical no tiene tiempos de espera, salvo la carencia de embarazo de 2 meses) y es la forma de decirle que si al cliente.');

delete from public.conocimiento k
 where k.cuenta in (select cuenta from public.numeros_whatsapp)
   and k.titulo in (select titulo from capacitacion);

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
