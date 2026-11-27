import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/store';
import { checkFurniture } from './collision';
import { computeWalls, isEmbeddedStairs, nearestWall, roomConflicts, wallRooms } from './geometry';
import { createProject, parseProject, serializeProject } from './project';
import { floorArea } from './stats';
import type { Room } from './types';

const s = () => useStore.getState();
const rooms = () => s().project.rooms;
const byType = (t: Room['type']) => rooms().filter((r) => r.type === t);
const fl = () => s().project.settings.activeFloorId;

// LDK（5460×3640）と、その右隣の洋室（2730×3640）
beforeEach(() => {
  useStore.setState({ past: [], future: [], selection: null, viewer: null, stash: null });
  s().loadProject(createProject(), false);
  s().addRoomAt('ldk', { x: 0, y: 0, w: 5460, h: 3640 });
  s().addRoomAt('bedroom', { x: 5460, y: 0, w: 2730, h: 3640 });
});
const ldk = () => byType('ldk')[0];

describe('階段の配置（干渉判定）', () => {
  it('1. リビングの内部に置ける。壁は作らず、ドア・窓も付かない', () => {
    expect(s().addRoomAt('stairs', { x: 3640, y: 0, w: 910, h: 2730 })).toBe(true);
    const st = byType('stairs')[0];
    expect(isEmbeddedStairs(st, rooms())).toBe(true);
    // 壁は LDK と洋室だけから作られる（階段の周りに余計な壁ができない）
    const walls = computeWalls(rooms(), fl());
    expect(walls.every((w) => w.rooms.every((r) => r.roomId !== st.id))).toBe(true);
    expect(wallRooms(rooms()).map((r) => r.type)).toEqual(['ldk', 'bedroom']);
    // 階段の縁（LDK の中）にはドア・窓を付けられない
    const hit = nearestWall({ x: 3640, y: 1365 }, rooms(), 780, 100);
    expect(hit?.roomId).not.toBe(st.id);
  });

  it('2. 部屋の境界付近: 壁に接して内側なら置ける。壁をまたぐ配置は置けない', () => {
    // 右の壁（LDK と洋室の境）にぴったり接する
    expect(s().addRoomAt('stairs', { x: 4550, y: 910, w: 910, h: 2730 })).toBe(true);
    // 洋室側へ 455mm はみ出す（境界の壁をまたぐ）
    expect(roomConflicts({ x: 5005, y: 0, w: 910, h: 2730 }, 'stairs', rooms())).toBe(true);
    // 外壁をまたいで建物の外に出る
    expect(roomConflicts({ x: 2730, y: -455, w: 910, h: 2730 }, 'stairs', rooms())).toBe(true);
    // 部屋の外（どの部屋とも重ならない）は従来どおり置ける
    expect(roomConflicts({ x: 0, y: 3640, w: 910, h: 2730 }, 'stairs', rooms())).toBe(false);
  });

  it('2b. ドラッグ（移動）・サイズ変更でも同じ規則', () => {
    s().addRoomAt('stairs', { x: 0, y: 3640, w: 910, h: 2730 });
    const id = byType('stairs')[0].id;
    expect(s().setRoomRect(id, { x: 910, y: 455, w: 910, h: 2730 })).toBe(true);
    expect(s().setRoomRect(id, { x: 4550, y: 1365, w: 910, h: 2730 })).toBe(false); // 下の外壁から出る
    expect(s().setRoomRect(id, { x: 910, y: 455, w: 910, h: 4000 })).toBe(false); // 伸ばして外に出る
    // LDK を縮めて階段がはみ出す変更はできない
    expect(s().setRoomRect(ldk().id, { x: 1365, y: 0, w: 4095, h: 3640 })).toBe(false);
    expect(s().setRoomRect(ldk().id, { x: 0, y: 0, w: 5460, h: 3640 + 910 })).toBe(true);
  });

  it('3. 回転: 部屋の中・壁際の階段も回せる。回すと外に出る場合は回さない', () => {
    // 壁際（部屋の外・洋室の右）の細長い階段: 中心で回すと洋室に食い込むが、角を固定して回せる
    s().addRoomAt('stairs', { x: 8190, y: 0, w: 910, h: 2730 });
    const outside = byType('stairs')[0];
    expect(s().rotateRoom(outside.id)).toBe(true);
    const r1 = rooms().find((r) => r.id === outside.id)!;
    expect(r1).toMatchObject({ w: 2730, h: 910, rotation: 90 });
    expect(roomConflicts(r1, 'stairs', rooms(), [r1.id])).toBe(false);
    // LDK の中の階段
    s().addRoomAt('stairs', { x: 2730, y: 455, w: 910, h: 2730 });
    const inner = byType('stairs').find((r) => r.id !== outside.id)!;
    expect(s().rotateRoom(inner.id)).toBe(true);
    const r2 = rooms().find((r) => r.id === inner.id)!;
    expect(r2.w).toBe(2730);
    expect(isEmbeddedStairs(r2, rooms())).toBe(true);
  });

  it('3b. 回転: 部屋の中に収まらないときは回せない（細い部屋）', () => {
    s().addRoomAt('hall', { x: 0, y: 3640, w: 910, h: 3640 });
    s().addRoomAt('stairs', { x: 0, y: 3640, w: 910, h: 2730 });
    const st = byType('stairs')[0];
    expect(isEmbeddedStairs(st, rooms())).toBe(true);
    expect(s().rotateRoom(st.id)).toBe(false);
  });

  it('3c. 部屋を回すと中の階段も一緒に回る', () => {
    s().addRoomAt('room', { x: 0, y: 3640, w: 3640, h: 2730 });
    const host = rooms().find((r) => r.type === 'room')!;
    s().addRoomAt('stairs', { x: 0, y: 3640, w: 2730, h: 910 });
    expect(s().rotateRoom(host.id)).toBe(true);
    const h2 = rooms().find((r) => r.id === host.id)!;
    const st = byType('stairs')[0];
    expect(h2).toMatchObject({ w: 2730, h: 3640 });
    expect(st).toMatchObject({ w: 910, h: 2730, rotation: 90 });
    expect(isEmbeddedStairs(st, rooms())).toBe(true);
    s().undo();
    expect(byType('stairs')[0]).toMatchObject({ w: 2730, h: 910, rotation: 0 });
  });

  it('4. 複数の部屋に接する配置: 接するだけなら置ける。2 部屋に重なると置けない', () => {
    // LDK と洋室の境の下（屋外側）で両方に接する
    expect(s().addRoomAt('stairs', { x: 4550, y: 3640, w: 1820, h: 910 })).toBe(true);
    const st = byType('stairs')[0];
    expect(isEmbeddedStairs(st, rooms())).toBe(false);
    // 独立した階段室として壁ができ、LDK・洋室との境は共有壁になる
    const walls = computeWalls(rooms(), fl()).filter((w) => w.rooms.some((r) => r.roomId === st.id));
    expect(walls.some((w) => !w.exterior)).toBe(true);
    // LDK と洋室の両方に重なる（境界の壁をまたぐ）
    expect(roomConflicts({ x: 5005, y: 910, w: 910, h: 1820 }, 'stairs', rooms())).toBe(true);
  });

  it('5. 実際に逸脱する配置は従来どおり置けない（屋外・別の階段・部屋側からの重なり）', () => {
    s().addRoomAt('balcony', { x: 0, y: -910, w: 3640, h: 910 });
    expect(roomConflicts({ x: 0, y: -910, w: 910, h: 910 }, 'stairs', rooms())).toBe(true); // バルコニーの中
    s().addRoomAt('stairs', { x: 910, y: 910, w: 910, h: 2730 });
    expect(roomConflicts({ x: 910, y: 1365, w: 910, h: 1820 }, 'stairs', rooms())).toBe(true); // 階段同士
    // 普通の部屋同士の重なりは今までどおり不可
    expect(roomConflicts({ x: 4550, y: 0, w: 1820, h: 1820 }, 'room', rooms())).toBe(true);
    // 階段の上に部屋を置く（階段がはみ出す）のも不可
    expect(roomConflicts({ x: 910, y: 910, w: 910, h: 1820 }, 'toilet', rooms())).toBe(true);
    // バルコニーは階段を囲めない
    expect(roomConflicts({ x: 0, y: 0, w: 5460, h: 3640 }, 'balcony', rooms(), [ldk().id])).toBe(true);
  });

  it('床面積は二重に数えない。保存・読み込みで状態が戻る', () => {
    const before = floorArea(rooms());
    s().addRoomAt('stairs', { x: 3640, y: 0, w: 910, h: 2730 });
    expect(floorArea(rooms())).toBeCloseTo(before);
    const r = parseProject(serializeProject(s().project));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.rooms.filter((x) => isEmbeddedStairs(x, r.project.rooms))).toHaveLength(1);
  });

  it('階段を中に入れると、階段に付いていたドア・窓は外れる（元に戻すで戻る）', () => {
    s().addRoomAt('stairs', { x: 0, y: 3640, w: 910, h: 2730 });
    const st = byType('stairs')[0];
    s().addOpening('door', { roomId: st.id, side: 'bottom', offset: 0, width: 780, distance: 0 });
    expect(s().project.openings).toHaveLength(1);
    expect(s().setRoomRect(st.id, { x: 910, y: 455, w: 910, h: 2730 })).toBe(true);
    expect(s().project.openings).toHaveLength(0);
    s().undo();
    expect(s().project.openings).toHaveLength(1);
  });

  it('LDK を削除しても階段は残り、独立した階段室になる', () => {
    s().addRoomAt('stairs', { x: 3640, y: 0, w: 910, h: 2730 });
    s().deleteRoom(ldk().id);
    const st = byType('stairs')[0];
    expect(isEmbeddedStairs(st, rooms())).toBe(false);
    expect(computeWalls(rooms(), fl()).some((w) => w.rooms.some((r) => r.roomId === st.id))).toBe(true);
  });
});

describe('階段と家具の干渉', () => {
  const issuesOf = (id: string) => checkFurniture(s().project).get(id) ?? [];

  it('6. 家具が階段に重なると警告。階段の横（LDK の中）なら警告なし', () => {
    s().addRoomAt('stairs', { x: 3640, y: 0, w: 910, h: 2730 });
    // 階段のすぐ左（LDK の中）: 以前は階段の周りに壁ができて「壁と干渉」になっていた
    s().addFurniture('dining-table', { x: 2900, y: 1365 });
    const near = s().project.furniture[0];
    s().updateFurniture(near.id, { x: 3640 - 675 - 5, y: 1365 });
    expect(issuesOf(near.id)).toEqual([]);
    // 階段の上に置くと警告（判定範囲 = 描画範囲 = 階段の矩形）
    s().updateFurniture(near.id, { x: 3640 + 200, y: 1365 });
    expect(issuesOf(near.id).map((i) => i.kind)).toContain('stairs');
    // 回転して階段にかかる場合も判定する
    s().updateFurniture(near.id, { x: 3640 - 450, y: 1365, rotation: 90 });
    expect(issuesOf(near.id).map((i) => i.kind)).not.toContain('stairs');
    s().updateFurniture(near.id, { x: 3640 - 300, y: 1365, rotation: 0 });
    expect(issuesOf(near.id).map((i) => i.kind)).toContain('stairs');
  });

  it('6b. 独立した階段室の中に置いた家具も警告。壁付けの家電は対象外', () => {
    s().addRoomAt('stairs', { x: 0, y: 3640, w: 910, h: 2730 });
    s().addFurniture('bed-single', { x: 455, y: 5000 });
    const bed = s().project.furniture[0];
    expect(issuesOf(bed.id).map((i) => i.kind)).toContain('stairs');
    s().addFurniture('aircon', { x: 455, y: 3800 });
    const ac = s().project.furniture[1];
    expect(issuesOf(ac.id).map((i) => i.kind)).not.toContain('stairs');
  });

  it('7. 階段がない間取りでは、これまでどおりの判定（重なり・壁・部屋の外）', () => {
    s().addFurniture('bed-single', { x: 1000, y: 1500 });
    s().addFurniture('dining-table', { x: 1000, y: 1500 });
    const [a, b] = s().project.furniture;
    expect(issuesOf(a.id)).toEqual([{ kind: 'overlap', otherId: b.id }]);
    s().updateFurniture(b.id, { x: 5300, y: 1500 });
    expect(issuesOf(b.id).map((i) => i.kind)).toEqual(['wall']);
    s().updateFurniture(b.id, { x: 10000, y: 1500 });
    expect(issuesOf(b.id).map((i) => i.kind)).toEqual(['outside']);
    expect(issuesOf(a.id)).toEqual([]);
  });
});
