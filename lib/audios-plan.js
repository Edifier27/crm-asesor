// Audios de la biblioteca asociados a planes y zona: se ofrecen en el cotizador al tocar un plan.
export const PLANES_AUDIO = ['S1', 'SMG02', 'S2', 'SMG20', 'SMG30', 'SMG40', 'SMG50', 'SMG60', 'SMG70'];
export const ZONAS_AUDIO = { todas: 'Todo el país', AMBA: 'AMBA', RESTO: 'Resto del país (fuera de AMBA)' };

/** Audios para ese plan en esa zona de precios ('AMBA' o cualquier otra = resto del país). */
export const audiosDelPlan = (audios, plan, zona) =>
  (audios ?? []).filter((a) => a.planes?.includes(plan) && (!a.zona || a.zona === 'todas' || a.zona === (zona === 'AMBA' ? 'AMBA' : 'RESTO')));
