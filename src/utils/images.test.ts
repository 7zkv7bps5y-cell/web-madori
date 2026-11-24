import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../model/project';
import { dataUrlBytes, embeddedImageBytes } from './images';

describe('埋め込み画像の容量', () => {
  it('base64 の長さからバイト数を求める', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(400))).toBe(300);
  });

  it('全案・全パーツの埋め込み画像を合計し、URL 画像は数えない', () => {
    const p = createProject();
    const room = createRoom('living', { x: 0, y: 0, w: 1000, h: 1000 }, p.settings.activeFloorId);
    room.info = {
      links: [],
      images: [
        { id: 'a', kind: 'embedded', src: 'data:image/jpeg;base64,' + 'A'.repeat(4000) },
        { id: 'b', kind: 'url', src: 'https://example.com/x.jpg' },
      ],
    };
    p.rooms.push(room);
    expect(embeddedImageBytes(p)).toBe(3000);
  });
});
