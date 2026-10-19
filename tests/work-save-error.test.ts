import { expect, it } from 'bun:test';
import { workSaveError } from '../src/lib/work-save-error';
it('recognizes database title collisions returned as plain objects', () => {
 expect(workSaveError({ code: '23505', message: 'Já existe uma obra com esse título ou título alternativo.' }, 'Erro')).toContain('título alternativo');
});
it('preserves unrelated errors', () => {
 expect(workSaveError({ code: '42501', message: 'Sem permissão' }, 'Erro')).toBe('Sem permissão');
 expect(workSaveError(null, 'Erro')).toBe('Erro');
});
