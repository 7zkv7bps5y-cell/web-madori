import { beforeEach, describe, expect, it } from 'vitest';
import { createCustomPart, defaultDesign } from '../model/customParts';
import { createProject } from '../model/project';
import { useStore } from './store';
import { MAX_ZOOM, MIN_ZOOM, useView, ZOOM_100, zoomPercent } from './view';

const s = () => useStore.getState();
const floor = () => s().project.settings.activeFloorId;
const part = () => createCustomPart(defaultDesign('rect'), { x: 1000, y: 1000, w: 1820, h: 910 }, floor());

beforeEach(() => {
  useStore.setState({ past: [], future: [], selection: null, viewer: null, stash: null });
  s().loadProject(createProject(), false);
  s().addRoomAt('room', { x: 0, y: 0, w: 2730, h: 3640 });
});

describe('カスタムパーツの操作（元に戻す・複製・削除）', () => {
  it('追加・変更・複製・削除ができ、元に戻すで戻る', () => {
    const p = part();
    s().addCustomPart(p);
    expect(s().selection).toEqual({ kind: 'custom', id: p.id });
    s().updateCustomPart(p.id, { fill: '#ff0000', w: 2000 });
    expect(s().project.customParts[0]).toMatchObject({ fill: '#ff0000', w: 2000 });
    s().duplicateSelection();
    expect(s().project.customParts).toHaveLength(2);
    expect(s().project.customParts[1].id).not.toBe(p.id);
    s().deleteSelection();
    expect(s().project.customParts).toHaveLength(1);
    s().undo();
    s().undo();
    expect(s().project.customParts).toHaveLength(1);
    expect(s().project.customParts[0].w).toBe(2000);
    s().undo();
    expect(s().project.customParts[0].w).toBe(1820);
    s().redo();
    expect(s().project.customParts[0].w).toBe(2000);
  });

  it('回転は選択中のカスタムパーツにも効く', () => {
    const p = part();
    s().addCustomPart(p);
    s().rotateSelection();
    expect(s().project.customParts[0].rotation).toBe(90);
  });

  it('案を複製するとカスタムパーツも別 ID で複製され、案ごとに独立する', () => {
    s().addCustomPart(part());
    expect(s().addPlan(true)).toBe(true);
    const copied = s().project.customParts;
    expect(copied).toHaveLength(1);
    s().updateCustomPart(copied[0].id, { name: 'B案だけ' });
    const firstPlan = s().project.plans[0].id;
    s().switchPlan(firstPlan);
    expect(s().project.customParts[0].name).not.toBe('B案だけ');
  });
});

describe('パーツ別の参考情報', () => {
  it('部屋・家具・カスタムパーツに付けられ、外すこともできる（元に戻す対応）', () => {
    const room = s().project.rooms[0];
    const info = { memo: '南向き', links: [], images: [] };
    s().setPartInfo({ kind: 'room', id: room.id }, info);
    expect(s().project.rooms[0].info?.memo).toBe('南向き');
    s().addFurniture('sofa-2', { x: 1000, y: 1000 });
    const f = s().project.furniture[0];
    s().setPartInfo({ kind: 'furniture', id: f.id }, { productName: 'ソファ', links: [{ url: 'https://example.com/' }], images: [] });
    expect(s().project.furniture[0].info?.productName).toBe('ソファ');
    const p = part();
    s().addCustomPart(p);
    s().setPartInfo({ kind: 'custom', id: p.id }, { memo: 'x', links: [], images: [] });
    expect(s().project.customParts[0].info?.memo).toBe('x');
    s().setPartInfo({ kind: 'room', id: room.id }, undefined);
    expect(s().project.rooms[0].info).toBeUndefined();
    s().undo();
    expect(s().project.rooms[0].info?.memo).toBe('南向き');
  });

  it('家具を複製すると参考情報も複製される（独立したコピー）', () => {
    s().addFurniture('sofa-2', { x: 1000, y: 1000 });
    const f = s().project.furniture[0];
    s().setPartInfo({ kind: 'furniture', id: f.id }, { memo: 'a', links: [], images: [] });
    s().duplicateFurniture(f.id);
    const [a, b] = s().project.furniture;
    expect(b.info?.memo).toBe('a');
    s().setPartInfo({ kind: 'furniture', id: b.id }, { memo: 'b', links: [], images: [] });
    expect(s().project.furniture.find((x) => x.id === a.id)!.info?.memo).toBe('a');
  });
});

describe('閲覧モード（共有リンク）', () => {
  const shared = () => {
    const p = createProject('共有された間取り');
    return p;
  };

  it('閲覧中は編集できず、閉じると自分の間取りと履歴に戻る', () => {
    const mine = s().project;
    s().addCustomPart(part());
    const before = s().project;
    const pastLen = s().past.length;
    const other = shared();
    other.rooms.push({ ...mine.rooms[0], floorId: other.settings.activeFloorId });
    s().enterViewer(other, { name: '共有', token: 'a'.repeat(64) });
    expect(s().viewer).not.toBeNull();
    // 編集操作はすべて無視される
    s().addRoomAt('room', { x: 5000, y: 0, w: 1820, h: 1820 });
    s().deleteRoom(s().project.rooms[0].id);
    s().setPartInfo({ kind: 'room', id: s().project.rooms[0].id }, { memo: 'x', links: [], images: [] });
    s().beginDrag();
    expect(s().project).toBe(other);
    expect(s().past).toHaveLength(0);
    s().exitViewer();
    expect(s().viewer).toBeNull();
    expect(s().project).toBe(before);
    expect(s().past).toHaveLength(pastLen);
  });

  it('「コピーして編集」すると独立したデータになり、元に戻すで自分の間取りに戻れる', () => {
    const before = s().project;
    const other = shared();
    s().enterViewer(other, { name: '共有', token: 'b'.repeat(64) });
    s().copyViewerToLocal({ ...structuredClone(other), projectId: 'prj-copy' });
    expect(s().viewer).toBeNull();
    expect(s().project.projectId).toBe('prj-copy');
    s().addRoomAt('room', { x: 0, y: 0, w: 1820, h: 1820 });
    expect(other.rooms).toHaveLength(0);
    s().undo();
    s().undo();
    expect(s().project).toBe(before);
  });

  it('閲覧中でも案の切り替えはできる（履歴は残さない）', () => {
    const other = shared();
    s().loadProject(other, false);
    s().addPlan(false);
    const withPlans = s().project;
    s().loadProject(createProject(), false);
    s().enterViewer(withPlans, { name: '共有', token: 'c'.repeat(64) });
    s().switchPlan(withPlans.plans[0].id);
    expect(s().project.activePlanId).toBe(withPlans.plans[0].id);
    expect(s().past).toHaveLength(0);
  });

  it('ほかの間取りを読み込むと閲覧モードは終わる', () => {
    s().enterViewer(shared(), { name: '共有', token: 'd'.repeat(64) });
    s().loadProject(createProject('別'), false);
    expect(s().viewer).toBeNull();
    expect(s().project.projectName).toBe('別');
  });
});

describe('拡大・縮小', () => {
  it('100% 表示・上下限', () => {
    const v = useView.getState();
    v.set({ zoom: 0.37, width: 800, height: 600 });
    v.zoomReset();
    expect(zoomPercent(useView.getState().zoom)).toBe(100);
    expect(useView.getState().zoom).toBeCloseTo(ZOOM_100);
    v.zoomAt(1000);
    expect(useView.getState().zoom).toBe(MAX_ZOOM);
    v.zoomAt(1e-6);
    expect(useView.getState().zoom).toBe(MIN_ZOOM);
  });

  it('拡大しても間取りの寸法は変わらない', () => {
    const before = structuredClone(s().project.rooms);
    useView.getState().zoomAt(3);
    useView.getState().zoomAt(0.2);
    expect(s().project.rooms).toEqual(before);
  });
});
