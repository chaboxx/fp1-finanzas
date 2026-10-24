"use client";
export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="panel mx-auto my-12 max-w-lg text-center">
      <h1 className="text-xl font-semibold">No pudimos cargar esta pantalla</h1>
      <p className="muted my-4">
        Revisa tu conexión y vuelve a intentarlo. Si el problema continúa,
        vuelve a abrir la app en unos momentos.
      </p>
      <button onClick={reset} className="btn btn-primary">
        Reintentar
      </button>
    </div>
  );
}
