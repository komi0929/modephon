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
  "*": ["゛", "゜", "。", "、", "!", "?", "・", "♪", "☆", "♥"],
  "#": [" ", "　"],
};

// 濁点変換マップ
const DAKUTEN_MAP: Record<string, string> = {
  "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
  "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
  "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど",
  "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ",
  "う": "ゔ",
  // 逆変換
  "が": "か", "ぎ": "き", "ぐ": "く", "げ": "け", "ご": "こ",
  "ざ": "さ", "じ": "し", "ず": "す", "ぜ": "せ", "ぞ": "そ",
  "だ": "た", "ぢ": "ち", "づ": "つ", "で": "て", "ど": "と",
  "ば": "は", "び": "ひ", "ぶ": "ふ", "べ": "へ", "ぼ": "ほ",
  "ゔ": "う",
  // カタカナ
  "ｶ": "ｶﾞ", "ｷ": "ｷﾞ", "ｸ": "ｸﾞ", "ｹ": "ｹﾞ", "ｺ": "ｺﾞ",
  "ｻ": "ｻﾞ", "ｼ": "ｼﾞ", "ｽ": "ｽﾞ", "ｾ": "ｾﾞ", "ｿ": "ｿﾞ",
  "ﾀ": "ﾀﾞ", "ﾁ": "ﾁﾞ", "ﾂ": "ﾂﾞ", "ﾃ": "ﾃﾞ", "ﾄ": "ﾄﾞ",
  "ﾊ": "ﾊﾞ", "ﾋ": "ﾋﾞ", "ﾌ": "ﾌﾞ", "ﾍ": "ﾍﾞ", "ﾎ": "ﾎﾞ",
  "ｳ": "ｳﾞ",
};

// 半濁点変換マップ
const HANDAKUTEN_MAP: Record<string, string> = {
  "は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ",
  "ば": "ぱ", "び": "ぴ", "ぶ": "ぷ", "べ": "ぺ", "ぼ": "ぽ",
  "ぱ": "は", "ぴ": "ひ", "ぷ": "ふ", "ぺ": "へ", "ぽ": "ほ",
  // カタカナ
  "ﾊ": "ﾊﾟ", "ﾋ": "ﾋﾟ", "ﾌ": "ﾌﾟ", "ﾍ": "ﾍﾟ", "ﾎ": "ﾎﾟ",
  "ﾊﾞ": "ﾊﾟ", "ﾋﾞ": "ﾋﾟ", "ﾌﾞ": "ﾌﾟ", "ﾍﾞ": "ﾍﾟ", "ﾎﾞ": "ﾎﾟ",
  "ﾊﾟ": "ﾊ", "ﾋﾟ": "ﾋ", "ﾌﾟ": "ﾌ", "ﾍﾟ": "ﾍ", "ﾎﾟ": "ﾎ",
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

export type InputMode = "hiragana" | "katakana" | "alpha" | "number" | "emoji";

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

// 絵文字マップ（ガラケー風絵文字セット）
const EMOJI_MAP: Record<string, string[]> = {
  "1": ["😊", "😄", "😆", "🥰", "😍", "🤗", "😎", "🤩", "😇"],
  "2": ["😢", "😭", "😤", "😠", "🤔", "😱", "😰", "🥺", "😵"],
  "3": ["❤️", "💕", "💖", "💗", "💓", "💘", "💝", "♥", "😘"],
  "4": ["🎵", "🎶", "♪", "🎤", "🎸", "🎹", "🥁", "🎺", "🎷"],
  "5": ["✨", "⭐", "🌟", "💫", "☀️", "🌙", "🌈", "🔥", "💥"],
  "6": ["👍", "👎", "✌️", "🤞", "👋", "🙏", "💪", "👏", "🤝"],
  "7": ["🌸", "🌹", "🌻", "🌺", "🍀", "🌿", "🌳", "🎀", "🎁"],
  "8": ["🍔", "🍰", "🍦", "☕", "🍣", "🍜", "🍙", "🍎", "🍺"],
  "9": ["🐱", "🐶", "🐰", "🐻", "🐼", "🐨", "🦊", "🐸", "🐧"],
  "0": ["📱", "💻", "📷", "🏠", "🚗", "✈️", "⏰", "📚", "💡"],
  "*": ["☺", "♡", "☆", "○", "●", "◇", "◆", "□", "■", "△"],
  "#": [" ", "　"],
};

// キーボード用のラベルマップ（各モードごと）
export const KEY_LABELS: Record<InputMode, { key: string; label: string; sub: string }[]> = {
  hiragana: [
    { key: "1", label: "あ", sub: "あいうえお" },
    { key: "2", label: "か", sub: "かきくけこ" },
    { key: "3", label: "さ", sub: "さしすせそ" },
    { key: "4", label: "た", sub: "たちつてと" },
    { key: "5", label: "な", sub: "なにぬねの" },
    { key: "6", label: "は", sub: "はひふへほ" },
    { key: "7", label: "ま", sub: "まみむめも" },
    { key: "8", label: "や", sub: "やゆよ" },
    { key: "9", label: "ら", sub: "らりるれろ" },
    { key: "*", label: "゛゜", sub: "゛゜。、!?" },
    { key: "0", label: "わ", sub: "わをんー" },
    { key: "#", label: "空白", sub: "" },
  ],
  katakana: [
    { key: "1", label: "ｱ", sub: "ｱｲｳｴｵ" },
    { key: "2", label: "ｶ", sub: "ｶｷｸｹｺ" },
    { key: "3", label: "ｻ", sub: "ｻｼｽｾｿ" },
    { key: "4", label: "ﾀ", sub: "ﾀﾁﾂﾃﾄ" },
    { key: "5", label: "ﾅ", sub: "ﾅﾆﾇﾈﾉ" },
    { key: "6", label: "ﾊ", sub: "ﾊﾋﾌﾍﾎ" },
    { key: "7", label: "ﾏ", sub: "ﾏﾐﾑﾒﾓ" },
    { key: "8", label: "ﾔ", sub: "ﾔﾕﾖ" },
    { key: "9", label: "ﾗ", sub: "ﾗﾘﾙﾚﾛ" },
    { key: "*", label: "゛゜", sub: "゛゜。、!?" },
    { key: "0", label: "ﾜ", sub: "ﾜｦﾝー" },
    { key: "#", label: "空白", sub: "" },
  ],
  alpha: [
    { key: "1", label: ".@", sub: ".@-_/:1" },
    { key: "2", label: "abc", sub: "abcABC2" },
    { key: "3", label: "def", sub: "defDEF3" },
    { key: "4", label: "ghi", sub: "ghiGHI4" },
    { key: "5", label: "jkl", sub: "jklJKL5" },
    { key: "6", label: "mno", sub: "mnoMNO6" },
    { key: "7", label: "pqrs", sub: "pqrsPQRS7" },
    { key: "8", label: "tuv", sub: "tuvTUV8" },
    { key: "9", label: "wxyz", sub: "wxyzWXYZ9" },
    { key: "*", label: "記号", sub: ".,!?'-()＊" },
    { key: "0", label: "空白", sub: " 0" },
    { key: "#", label: "空白", sub: "" },
  ],
  number: [
    { key: "1", label: "1", sub: "" },
    { key: "2", label: "2", sub: "" },
    { key: "3", label: "3", sub: "" },
    { key: "4", label: "4", sub: "" },
    { key: "5", label: "5", sub: "" },
    { key: "6", label: "6", sub: "" },
    { key: "7", label: "7", sub: "" },
    { key: "8", label: "8", sub: "" },
    { key: "9", label: "9", sub: "" },
    { key: "*", label: "*", sub: "" },
    { key: "0", label: "0", sub: "" },
    { key: "#", label: "#", sub: "" },
  ],
  emoji: [
    { key: "1", label: "😊", sub: "顔(嬉)" },
    { key: "2", label: "😢", sub: "顔(哀)" },
    { key: "3", label: "❤️", sub: "ﾊｰﾄ" },
    { key: "4", label: "🎵", sub: "音楽" },
    { key: "5", label: "✨", sub: "天候" },
    { key: "6", label: "👍", sub: "手" },
    { key: "7", label: "🌸", sub: "植物" },
    { key: "8", label: "🍔", sub: "食べ物" },
    { key: "9", label: "🐱", sub: "動物" },
    { key: "*", label: "☺", sub: "記号" },
    { key: "0", label: "📱", sub: "道具" },
    { key: "#", label: "空白", sub: "" },
  ],
};

export interface ToggleInputState {
  text: string;
  currentKey: string | null;
  currentIndex: number;
  isComposing: boolean; // 未確定文字がある
  mode: InputMode;
}

export function createInitialState(initialText: string = "", mode: InputMode = "hiragana"): ToggleInputState {
  return {
    text: initialText,
    currentKey: null,
    currentIndex: 0,
    isComposing: false,
    mode,
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
    case "emoji":
      return EMOJI_MAP;
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

  // ひらがな/カタカナモードで*キー押下時：濁点/半濁点変換を試行
  if (key === "*" && (state.mode === "hiragana" || state.mode === "katakana")) {
    // composing中なら、composing中の文字に対して変換
    if (state.isComposing && state.text.length > 0) {
      const lastChar = state.text[state.text.length - 1];
      // 最初に濁点を試行
      const dakuResult = DAKUTEN_MAP[lastChar];
      if (dakuResult) {
        return {
          ...state,
          text: state.text.slice(0, -1) + dakuResult,
          currentKey: key,
        };
      }
      // 半濁点を試行
      const handakuResult = HANDAKUTEN_MAP[lastChar];
      if (handakuResult) {
        return {
          ...state,
          text: state.text.slice(0, -1) + handakuResult,
          currentKey: key,
        };
      }
    }
    // 変換できない場合、通常の*キーとして記号入力
  }

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
  const modes: InputMode[] = ["hiragana", "katakana", "alpha", "number", "emoji"];
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
    case "emoji": return "絵文字";
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
