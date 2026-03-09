/**
 * ガラケー トグル入力（マルチタップ入力）ステートマシン
 * 1キー連打: あ→い→う→え→お→あ...
 * 一定時間経過 or 別キー押下で確定
 */

// キーマッピング: 各キーに対応する文字配列
export const KEY_MAP: Record<string, string[]> = {
  "1": ["あ", "い", "う", "え", "お", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"],
  "2": ["か", "き", "く", "け", "こ"],
  "3": ["さ", "し", "す", "せ", "そ"],
  "4": ["た", "ち", "つ", "て", "と", "っ"],
  "5": ["な", "に", "ぬ", "ね", "の"],
  "6": ["は", "ひ", "ふ", "へ", "ほ"],
  "7": ["ま", "み", "む", "め", "も"],
  "8": ["や", "ゆ", "よ", "ゃ", "ゅ", "ょ"],
  "9": ["ら", "り", "る", "れ", "ろ"],
  "0": ["わ", "を", "ん", "ー", "～"],
  "*": ["。", "、", "!", "?", "・", "♪", "☆", "(", ")", "♥"],
  "#": [" ", "　"],
};

// 半角カタカナ変換マップ
const HANKAKU_MAP: Record<string, string> = {
  "あ": "ｱ", "い": "ｲ", "う": "ｳ", "え": "ｴ", "お": "ｵ",
  "か": "ｶ", "き": "ｷ", "く": "ｸ", "け": "ｹ", "こ": "ｺ",
  "さ": "ｻ", "し": "ｼ", "す": "ｽ", "せ": "ｾ", "そ": "ｿ",
  "た": "ﾀ", "ち": "ﾁ", "つ": "ﾂ", "て": "ﾃ", "と": "ﾄ",
  "な": "ﾅ", "に": "ﾆ", "ぬ": "ﾇ", "ね": "ﾈ", "の": "ﾉ",
  "は": "ﾊ", "ひ": "ﾋ", "ふ": "ﾌ", "へ": "ﾍ", "ほ": "ﾎ",
  "ま": "ﾏ", "み": "ﾐ", "む": "ﾑ", "め": "ﾒ", "も": "ﾓ",
  "や": "ﾔ", "ゆ": "ﾕ", "よ": "ﾖ",
  "ら": "ﾗ", "り": "ﾘ", "る": "ﾙ", "れ": "ﾚ", "ろ": "ﾛ",
  "わ": "ﾜ", "を": "ｦ", "ん": "ﾝ",
  "ぁ": "ｧ", "ぃ": "ｨ", "ぅ": "ｩ", "ぇ": "ｪ", "ぉ": "ｫ",
  "ゃ": "ｬ", "ゅ": "ｭ", "ょ": "ｮ", "っ": "ｯ",
  "ー": "ー", "～": "～",
};

export type InputMode = "hiragana" | "katakana" | "alpha" | "number";

// アルファベットマップ
const ALPHA_MAP: Record<string, string[]> = {
  "1": [".", "@", "-", "_", "/", ":", "1"],
  "2": ["a", "b", "c", "A", "B", "C", "2"],
  "3": ["d", "e", "f", "D", "E", "F", "3"],
  "4": ["g", "h", "i", "G", "H", "I", "4"],
  "5": ["j", "k", "l", "J", "K", "L", "5"],
  "6": ["m", "n", "o", "M", "N", "O", "6"],
  "7": ["p", "q", "r", "s", "P", "Q", "R", "S", "7"],
  "8": ["t", "u", "v", "T", "U", "V", "8"],
  "9": ["w", "x", "y", "z", "W", "X", "Y", "Z", "9"],
  "0": [" ", "0"],
  "*": [".", ",", "!", "?", "'", "\"", "-", "(", ")", "*"],
  "#": [" "],
};

// 数字マップ
const NUMBER_MAP: Record<string, string[]> = {
  "1": ["1"], "2": ["2"], "3": ["3"],
  "4": ["4"], "5": ["5"], "6": ["6"],
  "7": ["7"], "8": ["8"], "9": ["9"],
  "0": ["0"], "*": ["*"], "#": ["#"],
};

export interface ToggleInputState {
  text: string;
  currentKey: string | null;
  currentIndex: number;
  isComposing: boolean; // 未確定文字がある
  mode: InputMode;
}

export function createInitialState(initialText: string = ""): ToggleInputState {
  return {
    text: initialText,
    currentKey: null,
    currentIndex: 0,
    isComposing: false,
    mode: "hiragana",
  };
}

function getMapForMode(mode: InputMode): Record<string, string[]> {
  switch (mode) {
    case "hiragana":
    case "katakana":
      return KEY_MAP;
    case "alpha":
      return ALPHA_MAP;
    case "number":
      return NUMBER_MAP;
  }
}

function convertChar(char: string, mode: InputMode): string {
  if (mode === "katakana") {
    return HANKAKU_MAP[char] || char;
  }
  return char;
}

/**
 * キー押下を処理して新しいステートを返す
 */
export function processKeyPress(
  state: ToggleInputState,
  key: string
): ToggleInputState {
  const map = getMapForMode(state.mode);
  const chars = map[key];
  if (!chars) return state;

  if (state.isComposing && state.currentKey === key) {
    // 同じキー連打 → 次の文字候補へ
    const nextIndex = (state.currentIndex + 1) % chars.length;
    const newChar = convertChar(chars[nextIndex], state.mode);
    // 末尾を置換
    const textWithoutLast = state.text.slice(0, -1);
    return {
      ...state,
      text: textWithoutLast + newChar,
      currentIndex: nextIndex,
    };
  } else {
    // 別のキー → 前の文字を確定し、新しい文字を追加
    const newChar = convertChar(chars[0], state.mode);
    return {
      ...state,
      text: state.text + newChar,
      currentKey: key,
      currentIndex: 0,
      isComposing: true,
    };
  }
}

/**
 * 文字を確定（タイマー切れ or 別操作）
 */
export function confirmChar(state: ToggleInputState): ToggleInputState {
  return {
    ...state,
    currentKey: null,
    currentIndex: 0,
    isComposing: false,
  };
}

/**
 * バックスペース（1文字削除）
 */
export function deleteChar(state: ToggleInputState): ToggleInputState {
  if (state.text.length === 0) return state;
  return {
    ...state,
    text: state.text.slice(0, -1),
    currentKey: null,
    currentIndex: 0,
    isComposing: false,
  };
}

/**
 * 入力モード切替
 */
export function cycleMode(state: ToggleInputState): ToggleInputState {
  const modes: InputMode[] = ["hiragana", "katakana", "alpha", "number"];
  const currentIdx = modes.indexOf(state.mode);
  const nextMode = modes[(currentIdx + 1) % modes.length];

  // 確定してからモード変更
  return {
    ...confirmChar(state),
    mode: nextMode,
  };
}

/**
 * 現在の入力モードの表示ラベル
 */
export function getModeLabel(mode: InputMode): string {
  switch (mode) {
    case "hiragana": return "あ";
    case "katakana": return "ｶﾅ";
    case "alpha": return "A/a";
    case "number": return "123";
  }
}

/**
 * 現在のキーの候補文字一覧を取得
 */
export function getCurrentCandidates(
  state: ToggleInputState
): string[] | null {
  if (!state.isComposing || !state.currentKey) return null;
  const map = getMapForMode(state.mode);
  const chars = map[state.currentKey];
  if (!chars) return null;
  return chars.map((c) => convertChar(c, state.mode));
}
