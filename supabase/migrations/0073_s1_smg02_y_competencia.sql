-- 0073: correcciones de Darío (3-nov-2026) en la base de conocimiento de la IA, para los dos CRM.
-- 1) S1 y SMG02 no son "el mismo plan": misma cartilla y estructura, pero el S1 suma optica y reintegros en
--    protesis e implantes (comparativo oficial de coberturas de Swiss Medical, julio 2026).
-- 2) Equivalencias con OSDE: 210 = SMG20, 310 = SMG30, 410 = SMG50.
-- 3) Afiliados con el dato oficial de la SSSalud (agosto 2026) y 20 SMG Center (Dario, 2-nov-2026).
-- Va sin tildes a proposito (archivo ASCII). Usa replace(): si la ficha ya se edito a mano, solo cambia lo que coincide.

update public.conocimiento
   set contenido = replace(replace(contenido,
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
       k.contenido like '%2.213.740%' as afiliados_ok
  from public.conocimiento k join public.perfiles p on p.id = k.cuenta
 where k.titulo in ('Planes que ofrecemos y para quien', 'Competencia: OSDE, Galeno, Medife, Sancor');
