/** PostgREST returns plain objects rather than Error instances. */
export function workSaveError(error: unknown, fallback: string): string {
 if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') return fallback;
 if ('code' in error && error.code === '23505') {
  if (error.message.includes('título alternativo')) return 'Já existe uma obra com esse título ou título alternativo.';
  return 'Essa obra ou endereço já está no catálogo. Confira os títulos e o endereço da obra.';
 }
 return error.message || fallback;
}
