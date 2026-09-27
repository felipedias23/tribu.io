import { Transform } from 'class-transformer';

/** Remove espaços nas pontas de textos (valores não textuais passam intactos). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Emails são guardados e comparados em minúsculas. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
