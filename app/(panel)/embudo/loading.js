// El tablero aparece al instante con las columnas en gris, mientras llegan los leads
export default function Cargando() {
  return (
    <main className="embudo-pagina" aria-busy="true" aria-label="Cargando el embudo">
      <header className="embudo-cabecera">
        <div>
          <h1>Embudo</h1>
          <p className="selector-detalle">Cargando…</p>
        </div>
      </header>
      <div className="columnas">
        {[3, 2, 1, 2, 1].map((tarjetas, i) => (
          <section key={i} className="columna">
            <header className="columna-cabecera"><span className="esqueleto linea" style={{ width: 110 }} /></header>
            <div className="columna-tarjetas">
              {Array.from({ length: tarjetas }, (_, j) => <div key={j} className="tarjeta-lead esqueleto" style={{ height: 78 }} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
