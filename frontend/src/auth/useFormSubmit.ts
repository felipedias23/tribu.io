import { useState, type FormEvent } from 'react';
import { ApiError } from '../shared/api/http';

/**
 * Estado comum dos formulários de autenticação: envio em curso e erros vindos
 * da API (mensagem geral e mensagens por campo).
 */
export function useFormSubmit(action: (form: FormData) => Promise<void>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await action(new FormData(event.currentTarget));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Não foi possível comunicar com o servidor.'));
      setSubmitting(false);
    }
  }

  return {
    submitting,
    onSubmit,
    /** Mensagem geral, só quando não há erros por campo a mostrar. */
    formError: error && error.details.length === 0 ? error.message : null,
    fieldErrors: (field: string) => error?.fieldMessages(field) ?? [],
  };
}
