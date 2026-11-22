import { describe, expect, it } from 'vitest';
import { inAppBrowserName, isIOS, projectFileAccept, safeFileName } from './io';

describe('ファイル名', () => {
  it('日本語はそのまま使う', () => {
    expect(safeFileName('平屋 2LDK サンプル')).toBe('平屋_2LDK_サンプル');
  });
  it('使えない記号・制御文字・連続した区切りを整理する', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(safeFileName('タブ\tと\n改行')).toBe('タブ_と_改行');
    expect(safeFileName('  ..間取り..  ')).toBe('間取り');
  });
  it('空・予約名・長すぎる名前', () => {
    expect(safeFileName('   ')).toBe('madori');
    expect(safeFileName('...')).toBe('madori');
    expect(safeFileName('CON')).toBe('CON_madori');
    const long = safeFileName('あ'.repeat(100));
    expect(Array.from(long)).toHaveLength(60);
    // 絵文字（サロゲートペア）を途中で切らない
    expect(Array.from(safeFileName('🏠'.repeat(70))).every((c) => c === '🏠')).toBe(true);
  });
});

describe('端末の判定', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
  it('iOS / iPadOS', () => {
    expect(isIOS(iphone, 5)).toBe(true);
    expect(isIOS(ipad, 5)).toBe(true);
    expect(isIOS(ipad, 0)).toBe(false); // Mac
    expect(isIOS(android, 5)).toBe(false);
  });
  it('iOS ではファイル選択を絞り込まない', () => {
    expect(projectFileAccept(true)).toBeUndefined();
    expect(projectFileAccept(false)).toContain('.floorplan');
  });
  it('アプリ内ブラウザ', () => {
    expect(inAppBrowserName(`${iphone} Line/13.0.0`)).toBe('LINE');
    expect(inAppBrowserName(`${iphone} Instagram 300.0`)).toBe('Instagram');
    expect(inAppBrowserName(android)).toBeNull();
    expect(inAppBrowserName(iphone)).toBeNull();
  });
});
