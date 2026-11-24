import { describe, expect, it } from 'vitest';
import { createCustomPart, defaultDesign } from './customParts';
import { copyProject, createProject, createRoom, parseProject, PROJECT_EXTENSION, serializeProject } from './project';
import type { PartInfo, Project } from './types';

const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(100);

function withEverything(): Project {
  const p = createProject('テスト');
  const floorId = p.settings.activeFloorId;
  const info: PartInfo = {
    title: 'リビング',
    productName: 'ソファ',
    price: 59800,
    description: '説明',
    specs: 'W1800',
    memo: 'メモ',
    links: [{ url: 'https://example.com/item', label: '商品ページ' }],
    images: [
      { id: 'img1', kind: 'url', src: 'https://example.com/a.jpg', caption: '外観' },
      { id: 'img2', kind: 'embedded', src: jpeg },
    ],
  };
  p.rooms.push({ ...createRoom('living', { x: 0, y: 0, w: 3640, h: 3640 }, floorId), info });
  p.customParts.push({ ...createCustomPart(defaultDesign('ellipse'), { x: 1000, y: 1000, w: 1200, h: 800 }, floorId), info });
  return p;
}

const roundTrip = (p: Project) => {
  const r = parseProject(serializeProject(p));
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

describe('データ形式 v3（カスタムパーツ・参考情報）', () => {
  it('.floorplan に保存して開くと、カスタムパーツと参考情報がそのまま戻る', () => {
    const p = withEverything();
    const q = roundTrip(p);
    expect(q.customParts).toHaveLength(1);
    expect(q.customParts[0]).toMatchObject({ shape: 'ellipse', w: 1200, h: 800 });
    expect(q.rooms[0].info).toEqual(p.rooms[0].info);
    expect(q.customParts[0].info?.images).toHaveLength(2);
    expect(PROJECT_EXTENSION).toBe('.floorplan');
  });

  it('保存形式は v3', () => {
    const p = withEverything();
    const text = serializeProject(p);
    expect(JSON.parse(text).version).toBe(3);
  });

  it('旧形式（v2: customParts も info もない）も読み込める', () => {
    const p = withEverything();
    const data = JSON.parse(serializeProject(p));
    data.version = 2;
    for (const pl of data.plans) {
      delete pl.customParts;
      for (const r of pl.rooms) delete r.info;
    }
    const r = parseProject(JSON.stringify(data));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.customParts).toEqual([]);
      expect(r.project.rooms[0].info).toBeUndefined();
    }
  });

  it('より新しい版のデータは理由を示して拒否する', () => {
    const data = JSON.parse(serializeProject(withEverything()));
    data.version = 4;
    const r = parseProject(JSON.stringify(data));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('新しい版');
  });

  const reject = (mutate: (info: PartInfo) => void) => {
    const p = withEverything();
    mutate(p.rooms[0].info!);
    return parseProject(serializeProject(p)).ok;
  };

  it('危険なリンク（javascript: / data: など）は拒否する', () => {
    expect(reject((i) => (i.links[0].url = 'javascript:alert(1)'))).toBe(false);
    expect(reject((i) => (i.links[0].url = 'data:text/html,<script>'))).toBe(false);
    expect(reject((i) => (i.links[0].url = 'http://example.com/'))).toBe(true);
  });

  it('画像 URL は https のみ。埋め込みは JPEG/PNG/WebP のみで SVG は拒否', () => {
    expect(reject((i) => (i.images[0].src = 'http://example.com/a.jpg'))).toBe(false);
    expect(reject((i) => (i.images[0].src = 'javascript:alert(1)'))).toBe(false);
    expect(reject((i) => (i.images[1].src = 'data:image/svg+xml;base64,PHN2Zz4='))).toBe(false);
    expect(reject((i) => (i.images[1].src = 'data:image/png;base64,AAAA'))).toBe(true);
  });

  it('画像・リンクは 20 件まで', () => {
    expect(reject((i) => (i.links = Array.from({ length: 21 }, () => ({ url: 'https://example.com/' }))))).toBe(false);
  });

  it('コピーは新しい ID・名前の独立したデータになる（元は変わらない）', () => {
    const p = withEverything();
    const c = copyProject(p, '受け取った間取り');
    expect(c.projectId).not.toBe(p.projectId);
    expect(c.projectName).toBe('受け取った間取り');
    c.rooms[0].info!.memo = '変更';
    c.customParts[0].w = 9999;
    expect(p.rooms[0].info!.memo).toBe('メモ');
    expect(p.customParts[0].w).toBe(1200);
  });
});
