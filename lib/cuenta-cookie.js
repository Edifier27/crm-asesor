// De qué cuenta es la sesión de este navegador, LEYENDO la cookie sin verificarla ni tocarla.
// Para rutas que quedan fuera del proxy (/api/version, /api/diagnostico): ahí no se usa el cliente de Supabase, porque
// validar la sesión puede renovarla o borrar sus cookies a destiempo. No decide ningún permiso: solo sirve para saber
// si la pantalla tiene que recargarse o para anotar de quién es un aviso.
export function cuentaDeLaCookie(todas) {
  try {
    const primera = todas.find((c) => /^sb-.+-auth-token(\.0)?$/.test(c.name));
    if (!primera) return null;
    const base = primera.name.replace(/\.0$/, '');
    // La sesión puede venir en una sola cookie o partida en pedazos (.0, .1, …)
    let valor = todas.find((c) => c.name === base)?.value ?? '';
    if (!valor) for (let i = 0; ; i++) { const parte = todas.find((c) => c.name === `${base}.${i}`); if (!parte) break; valor += parte.value; }
    if (valor.startsWith('base64-')) valor = Buffer.from(valor.slice(7), 'base64url').toString('utf8');
    const token = JSON.parse(valor).access_token;
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub ?? null;
  } catch {
    return null;
  }
}
