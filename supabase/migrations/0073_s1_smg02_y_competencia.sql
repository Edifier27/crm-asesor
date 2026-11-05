-- 0073: correcciones de Darío (3-nov-2026) en la base de conocimiento de la IA, para los dos CRM.
-- 1) S1 y SMG02 no son "el mismo plan": misma cartilla y estructura, pero el S1 suma optica y reintegros en
--    protesis e implantes (comparativo oficial de coberturas de Swiss Medical, julio 2026).
-- 2) Equivalencias con OSDE: 210 = SMG20, 310 = SMG30, 410 = SMG50.
-- 3) Afiliados con el dato oficial de la SSSalud (agosto 2026) y 20 SMG Center (Dario, 2-nov-2026).
-- 4) Copago de S1 y S2 (Dario, 5-nov-2026): fijo de $14.000 solo en consultas; en estudios hay tres niveles segun el
--    estudio y no se dan montos.
-- Va sin tildes a proposito (archivo ASCII). Usa replace(): si la ficha ya se edito a mano, solo cambia lo que coincide.

update public.conocimiento
   set contenido = replace(replace(replace(replace(replace(contenido,
       'El S1 tiene un copago fijo de $14.000 en consultas y estudios (el resto esta todo cubierto)',
       'El S1 tiene copago: fijo de $14.000 en las consultas; en los estudios depende del estudio (tres niveles, no se dan montos). La internacion y el resto, cubiertos'),
       'el S2 con copago fijo de $14.000 en consultas y estudios',
       'el S2 con copago fijo de $14.000 en las consultas (en los estudios, tres niveles segun el estudio)'),
       'la diferencia es que pagas un copago de 14 mil pesos en consultas y estudios, el resto esta cubierto',
       'la diferencia es que pagas un copago fijo de 14 mil pesos en las consultas y en los estudios depende del estudio, el resto esta cubierto'),
       'SMG02 y S1. Son el mismo plan: misma cartilla, misma estructura, misma calidad.',
       'SMG02 y S1. Misma cartilla, misma estructura, misma calidad. El S1 ademas suma optica y reintegros en protesis e implantes, que el SMG02 no tiene.'),
       'Se ofrecen S2 y SMG20, mismo plan entre si:',
       'Se ofrecen S2 y SMG20, misma cartilla entre si:')
 where titulo = 'Planes que ofrecemos y para quien';

update public.conocimiento
   set contenido = replace(replace(contenido,
       'OSDE tiene unos 2,5 millones de afiliados y Swiss Medical unos 2 millones: a una prepaga la hace la cantidad de afiliados.',
       'Segun la Superintendencia de Servicios de Salud (agosto 2026), OSDE tiene 2.213.740 afiliados y Swiss Medical 1.095.739: son las dos prepagas mas grandes del pais. Equivalencias: OSDE 210 = SMG20, OSDE 310 = SMG30, OSDE 410 = SMG50.'),
       'y unos 30 Swiss Medical Center.',
       ', 11 sanatorios propios en total y 20 SMG Center.')
 where titulo = 'Competencia: OSDE, Galeno, Medife, Sancor';

-- Control: una fila por CRM y por ficha, con las frases nuevas
select p.nombre as crm, k.titulo,
       k.contenido like '%suma optica%' as s1_ok,
       k.contenido like '%2.213.740%' as afiliados_ok,
       k.contenido not like '%consultas y estudios%' as copago_ok
  from public.conocimiento k join public.perfiles p on p.id = k.cuenta
 where k.titulo in ('Planes que ofrecemos y para quien', 'Competencia: OSDE, Galeno, Medife, Sancor');
