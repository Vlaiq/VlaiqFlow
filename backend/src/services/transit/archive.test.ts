import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../../../../scripts/lib/gtfs_archive.py', import.meta.url));
const python = (script: string, input: unknown) => JSON.parse(execFileSync('python3', ['-c', `
import importlib.util,json,sys,io,zipfile,tempfile,pathlib
spec=importlib.util.spec_from_file_location('gtfs',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
x=json.load(sys.stdin)
${script}
` , helper], { input: JSON.stringify(input), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 10000 }));
const csv = (text: string) => python("print(json.dumps(m.read_csv(x,'test.txt')))", text);
const archive = (entries: [string, string][], mode = 'normal') => python(`
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d)/'feed.zip'
 with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_DEFLATED) as z:
  for name,data in x['entries']:
   if x['mode']=='symlink':
    e=zipfile.ZipInfo(name); e.external_attr=0o120777<<16; z.writestr(e,data)
   elif x['mode']=='bzip': z.writestr(name,data,compress_type=zipfile.ZIP_BZIP2)
   elif x['mode']=='utf8': z.writestr(name,b'\\xff')
   else: z.writestr(name,data)
 if x['mode']=='truncated': p.write_bytes(p.read_bytes()[:20])
 if x['mode']=='oversize': m.MAX_EXPANDED=1
 if x['mode']=='many': m.MAX_FILES=1
 print(json.dumps(m.read_archive(p)))`, { entries, mode });

describe('maintained CSV parsing used by ingestion', () => {
  it.each(['\n', '\r\n'])('handles quoted commas, escaped quotes, empty values, UTF-8 and newlines %j', (newline) => {
    expect(csv(`name,id,optional${newline}"Piața, \"\"Test\"\"",a,${newline}`).rows).toEqual([{ name: 'Piața, "Test"', id: 'a', optional: '' }]);
  });
  it('preserves quoted embedded newlines and independent column order', () => expect(csv('id,name\nb,"two\nlines"\n').rows).toEqual([{ id: 'b', name: 'two\nlines' }]));
  it.each(['id,id\na,b\n', 'id,name\na\n', 'id,name\na,b,c\n', 'id,name\na,"unterminated\n', 'id,name\na,\u0000\n'])('rejects malformed CSV %j', (text) => expect(() => csv(text)).toThrow());
});
describe('safe archive handling without extraction', () => {
  it('accepts root and single-directory archives', () => {
    expect(archive([['agency.txt', 'id,name\na,test\n']])['agency.txt'].rows).toHaveLength(1);
    expect(archive([['feed/agency.txt', 'id,name\na,test\n']])['agency.txt'].rows).toHaveLength(1);
  });
  it.each(['../agency.txt', '/agency.txt', 'feed/../agency.txt', 'C:/agency.txt', 'feed\\agency.txt', 'a/b/agency.txt'])('rejects unsafe/unexpected paths %s', (path) => expect(() => archive([[path, 'id\na\n']])).toThrow());
  it.each(['symlink', 'bzip', 'utf8', 'truncated', 'oversize'])('rejects %s archives', (mode) => expect(() => archive([['agency.txt', 'id\na\n']], mode)).toThrow());
  it('rejects excessive counts and mixed structures', () => {
    expect(() => archive([['agency.txt', 'id\na\n'], ['stops.txt', 'id\nb\n']], 'many')).toThrow();
    expect(() => archive([['a/agency.txt', 'id\na\n'], ['b/stops.txt', 'id\nb\n']])).toThrow();
  });
});
