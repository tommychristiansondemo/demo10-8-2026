import { thinkingTagFilter } from '../../shared/agentLoop.ts';
const run = (chunks: string[]) => { const f = thinkingTagFilter(); return chunks.map((c) => f(c)).join('') + f.flush(); };
const cases: [string[], string][] = [
  [['Hello <thinking>secret</thinking> world'], 'Hello world'],
  [['A <thi', 'nking>x y z</thin', 'king>\n\nB'], 'A B'],
  [['under 5 < 10 miles'], 'under 5 < 10 miles'],
  [['ends with <'], 'ends with <'],
  [['<thinking>only</thinking>Answer'], 'Answer'],
];
let ok = true;
for (const [c, want] of cases) { const got = run(c); console.log(got === want ? 'PASS' : 'FAIL', JSON.stringify(got)); ok &&= got === want; }
process.exit(ok ? 0 : 1);
