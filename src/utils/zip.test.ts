import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, createZip } from './zip';

describe('ZIP 作成', () => {
  it('CRC32 が正しい', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('標準のツールで展開でき、中身が一致する', () => {
    const files = [
      { name: 'project.floorplan', data: new TextEncoder().encode('{"日本語":"テスト"}') },
      { name: 'floorplan.png', data: new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]) },
    ];
    const zip = createZip(files);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const path = join(dir, 'a.zip');
    writeFileSync(path, zip);
    // Python 標準の zipfile で検証（CRC チェックを含む）
    const out = execFileSync('python3', [
      '-I',
      '-c',
      'import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps({n:list(z.read(n)) for n in z.namelist()}))',
      path,
    ]).toString();
    const parsed = JSON.parse(out) as Record<string, number[]>;
    expect(Object.keys(parsed)).toEqual(['project.floorplan', 'floorplan.png']);
    expect(new Uint8Array(parsed['floorplan.png'])).toEqual(files[1].data);
    expect(new TextDecoder().decode(new Uint8Array(parsed['project.floorplan']))).toBe('{"日本語":"テスト"}');
  });
});
