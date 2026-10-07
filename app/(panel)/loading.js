// Al tocar una sección del menú se ve esto al instante, mientras llegan los datos (antes la pantalla quedaba quieta).
export default function Cargando() {
  return (
    <main className="pagina" aria-busy="true" aria-label="Cargando">
      <span className="esqueleto linea" style={{ width: 200, height: 26 }} />
      <span className="esqueleto linea" style={{ width: 'min(520px, 80%)' }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="tarjeta cargando-tarjeta">
          <span className="esqueleto linea" style={{ width: '35%' }} />
          <span className="esqueleto linea" style={{ width: '90%' }} />
          <span className="esqueleto linea" style={{ width: '70%' }} />
        </div>
      ))}
    </main>
  );
}
