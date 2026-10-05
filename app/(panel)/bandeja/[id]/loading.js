// Al tocar un chat se ve esto al instante, mientras llegan los mensajes
export default function Cargando() {
  return (
    <main className="conversacion cargando-chat" aria-busy="true">
      <header className="conv-cabecera"><span className="avatar esqueleto" /><span className="esqueleto linea" /></header>
      <div className="mensajes">
        {[60, 40, 70, 30, 55].map((w, i) => (
          <div key={i} className={`burbuja-envoltura ${i % 2 ? 'saliente' : 'entrante'}`}>
            <div className="burbuja esqueleto" style={{ width: `${w}%`, height: 38 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
