import { useEffect } from 'react';

export const APP_NAME = 'Tribu.io';

/** Título do separador: "Página · Tribu.io". */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}
