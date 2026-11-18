import { beforeEach, describe, expect, it } from 'vitest';
import { computeWalls } from '../model/geometry';
import { useStore } from './store';

const s = () => useStore.getState();
const first = () => s().project.rooms[0];

beforeEach(() => {
  useStore.setState({ past: [], future: [], selection: null });
  s().loadProject(s().project.rooms.length ? { ...s().project, rooms: [], openings: [] } : s().project, false);
  s().addRoomAt('room', { x: 0, y: 0, w: 2730, h: 3640 });
});

describe('部屋の操作', () => {
  it('上下左右に追加でき、共通壁が作られる', () => {
    const base = first();
    expect(s().addRoomAdjacent(base.id, 'right', 'bedroom', 2730, 3640)).toBe(true);
    expect(s().addRoomAdjacent(base.id, 'bottom', 'toilet', 910, 1820)).toBe(true);
    expect(s().addRoomAdjacent(base.id, 'left', 'hall', 910, 3640)).toBe(true);
    expect(s().addRoomAdjacent(base.id, 'top', 'bath', 1820, 1820)).toBe(true);
    expect(s().project.rooms).toHaveLength(5);
    const interior = computeWalls(s().project.rooms, s().project.settings.activeFloorId).filter((w) => !w.exterior);
    expect(interior).toHaveLength(4);
    // 元の部屋は動いていない
    expect(first()).toMatchObject({ x: 0, y: 0, w: 2730, h: 3640 });
  });

  it('種類を変えても位置・寸法は維持し、標準名なら名前も変わる', () => {
    const r = first();
    s().setRoomType(r.id, 'washitsu');
    expect(first()).toMatchObject({ type: 'washitsu', name: '和室', x: 0, y: 0, w: 2730, h: 3640 });
    s().updateRoom(r.id, { name: '客間' });
    s().setRoomType(r.id, 'bedroom');
    expect(first().name).toBe('客間');
  });

  it('スタイル変更', () => {
    s().updateRoom(first().id, { style: { ...first().style, fill: '#ffffff', floor: 'tatami' } });
    expect(first().style).toMatchObject({ fill: '#ffffff', floor: 'tatami' });
  });

  it('重なるサイズ変更は拒否する', () => {
    const base = first();
    s().addRoomAdjacent(base.id, 'right', 'room', 2730, 3640);
    expect(s().setRoomRect(base.id, { x: 0, y: 0, w: 4000, h: 3640 })).toBe(false);
    expect(s().setRoomRect(base.id, { x: 0, y: 0, w: 2730, h: 4550 })).toBe(true);
  });

  it('複製は重ならない位置に置かれ、ドア・窓も複製される', () => {
    const base = first();
    s().addOpening('window', { roomId: base.id, side: 'top', offset: 100, width: 910, distance: 0 });
    expect(s().duplicateRoom(base.id)).toBe(true);
    expect(s().project.rooms).toHaveLength(2);
    expect(s().project.openings).toHaveLength(2);
    const [a, b] = s().project.rooms;
    expect(b.x >= a.x + a.w || b.y >= a.y + a.h).toBe(true);
  });

  it('削除しても隣の部屋は動かず、共有壁のドアは引き継がれる', () => {
    const base = first();
    s().addRoomAdjacent(base.id, 'right', 'room', 2730, 3640);
    const other = s().project.rooms[1];
    s().addOpening('door', { roomId: base.id, side: 'right', offset: 500, width: 780, distance: 0 });
    s().deleteRoom(base.id);
    expect(s().project.rooms).toEqual([other]);
    expect(s().project.openings[0]).toMatchObject({ roomId: other.id, side: 'left', offset: 500 });
  });

  it('回転で縦横が入れ替わる', () => {
    expect(s().rotateRoom(first().id)).toBe(true);
    expect(first()).toMatchObject({ w: 3640, h: 2730, rotation: 90 });
  });

  it('Undo / Redo', () => {
    const base = first();
    s().addRoomAdjacent(base.id, 'right', 'room', 2730, 3640);
    expect(s().project.rooms).toHaveLength(2);
    s().undo();
    expect(s().project.rooms).toHaveLength(1);
    s().redo();
    expect(s().project.rooms).toHaveLength(2);
  });

  it('ドラッグ中の変更は 1 回の履歴にまとまる', () => {
    const r = first();
    const before = s().past.length;
    s().beginDrag();
    for (let i = 1; i <= 5; i++) {
      s().dragUpdate((p) => ({ ...p, rooms: p.rooms.map((x) => (x.id === r.id ? { ...x, x: i * 455 } : x)) }));
    }
    s().endDrag();
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(first().x).toBe(0);
  });

  it('短すぎる壁には開口部を置けない', () => {
    const base = first();
    s().addOpening('largeWindow', { roomId: base.id, side: 'top', offset: 0, width: 300, distance: 0 });
    expect(s().project.openings).toHaveLength(0);
  });
});

describe('自動保存との連携', () => {
  it('ドラッグ確定時の通知では dragBase が解除済み（自動保存が確定後の状態を拾える）', () => {
    const r = first();
    const seen: { dragging: boolean; x: number }[] = [];
    const unsub = useStore.subscribe((st, prev) => {
      if (st.project !== prev.project) seen.push({ dragging: !!st.dragBase, x: st.project.rooms[0].x });
    });
    s().beginDrag();
    s().dragUpdate((p) => ({ ...p, rooms: p.rooms.map((x) => (x.id === r.id ? { ...x, x: 910 } : x)) }));
    s().endDrag();
    unsub();
    expect(seen.at(-1)).toEqual({ dragging: false, x: 910 });
  });
});
