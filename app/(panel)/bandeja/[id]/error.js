'use client';

export default function ErrorChat({ error, reset }) {
  return (
    <main className="vacio">
      <div>
        <p><strong>No se pudo abrir el chat.</strong></p>
        <p>{error.message}</p>
        <button type="button" className="boton-secundario" onClick={reset}>Reintentar</button>
      </div>
    </main>
  );
}
