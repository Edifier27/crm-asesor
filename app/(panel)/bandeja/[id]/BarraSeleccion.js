'use client';

// Selección múltiple de mensajes (como WhatsApp): reemplaza la barra de escribir mientras hay mensajes elegidos.
// Copiar arma el texto con fecha y autor, como "Copiar" de WhatsApp con varios mensajes.
const cuando = (iso) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export default function BarraSeleccion({ elegidos, nombreCliente, onCancelar, onDestacar, onReenviar, onAviso }) {
  const enOrden = [...elegidos].sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at));
  const n = enOrden.length;

  async function copiar() {
    const texto = enOrden.map((m) => `[${cuando(m.creado_at)}] ${m.direccion === 'entrante' ? nombreCliente : m.autor === 'ia' ? 'Asesor IA' : 'Vos'}: ${m.tipo === 'audio' ? (m.transcripcion || m.texto || 'Audio') : (m.texto ?? '')}`).join('\n');
    try { await navigator.clipboard.writeText(texto); onAviso(n === 1 ? 'Mensaje copiado' : `${n} mensajes copiados`); } catch { onAviso('No se pudo copiar'); }
    onCancelar();
  }
  // Si alguno no está destacado se destacan todos; si ya lo estaban todos, se les saca
  const todosDestacados = enOrden.every((m) => m.destacado_at);

  return (
    <footer className="barra-seleccion" role="toolbar" aria-label="Mensajes elegidos">
      <button type="button" className="cabecera-icono" aria-label="Cancelar la selección" onClick={onCancelar}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <span className="seleccion-cuenta">{n === 1 ? '1 elegido' : `${n} elegidos`}</span>
      <button type="button" className="cabecera-icono" title="Copiar" aria-label="Copiar" onClick={copiar} disabled={!n}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      </button>
      <button type="button" className="cabecera-icono" title={todosDestacados ? 'Quitar destacado' : 'Destacar'} aria-label={todosDestacados ? 'Quitar destacado' : 'Destacar'}
        onClick={() => onDestacar(todosDestacados ? enOrden : enOrden.filter((m) => !m.destacado_at))} disabled={!n}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill={todosDestacados ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></svg>
      </button>
      <button type="button" className="cabecera-icono" title="Reenviar" aria-label="Reenviar" onClick={() => onReenviar(enOrden)} disabled={!n}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></svg>
      </button>
    </footer>
  );
}
