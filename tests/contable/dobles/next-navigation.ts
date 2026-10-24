// Doble de "next/navigation" para Server Actions: redirect() corta la ejecución
// lanzando una señal que el test puede reconocer.
export class RedirectSignal extends Error {
  constructor(public url: string) {
    super("REDIRECT " + url);
  }
}

export function redirect(url: string): never {
  throw new RedirectSignal(url);
}

export function notFound(): never {
  throw new Error("NOT_FOUND");
}
