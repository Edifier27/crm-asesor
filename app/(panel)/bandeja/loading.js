// Volver del chat a la lista (o entrar a Mis chats) es instantáneo: no espera al servidor para mostrar el fondo vacío
export default function Cargando() {
  return (
    <main className="vacio">
      <div>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        <p>Elegí un chat para ver la conversación y la ficha del lead.</p>
      </div>
    </main>
  );
}
