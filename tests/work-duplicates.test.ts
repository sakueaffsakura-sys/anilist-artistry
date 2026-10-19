import { expect, it } from 'bun:test';
import { duplicateTitleKey, findDuplicateWorks } from '../src/lib/work-duplicates';
const work = (id: string, title: string, alt_titles: string | null = null, published = true) => ({ id, title, alt_titles, published });
it('matches repeated principal titles ignoring case, Latin accents and whitespace', () => {
 expect(duplicateTitleKey('  ÁRVORE   Azul ')).toBe('arvore azul');
 expect(findDuplicateWorks([work('1','Árvore azul'), work('2',' ARVORE  AZUL ')])[0]?.works.length).toBe(2);
});
it('matches principal and alternate titles using all supported separators', () => {
 for (const separator of [',',';','|','\n','\r']) {
  expect(findDuplicateWorks([work('1','First', `Alias${separator}Other`),work('2','Other')])[0]?.matches).toEqual(['other']);
 }
 expect(findDuplicateWorks([work('1','First','Alias'),work('2','Second','Alias')])[0]?.works.length).toBe(2);
});
it('groups three or more linked duplicates once', () => {
 const result = findDuplicateWorks([work('1','A','B'),work('2','B','C'),work('3','C')]);
 expect(result.length).toBe(1); expect(result[0]?.works.map(w=>w.id).sort()).toEqual(['1','2','3']);
});
it('only includes published works and excludes self matches or similar names', () => {
 expect(findDuplicateWorks([work('1','A','A; A'),work('2','A',null,false),work('3','A sequel')])).toEqual([]);
});
it('removing one duplicate recalculates remaining groups', () => {
 const works = [work('1','A'),work('2','A'),work('3','A')];
 expect(findDuplicateWorks(works.slice(1))[0]?.works.length).toBe(2);
 expect(findDuplicateWorks(works.slice(2))).toEqual([]);
});
