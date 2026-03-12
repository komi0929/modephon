"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { renderProgressiveImage } from "@/lib/imageRenderer";
import { LatencyQueue } from "@/lib/latencyQueue";
import { ALL_NPCS, NPC_GYARU, NPC_GYARUO } from "@/lib/npcCharacters";
import {
  ToggleInputState,
  createInitialState,
  processKeyPress,
  confirmChar,
  deleteChar,
  cycleMode,
  getModeLabel,
  getCurrentCandidates,
  KEY_LABELS,
} from "@/lib/toggleInput";

/* =========================================
   Types
   ========================================= */
type Screen =
  | "register"
  | "idle"
  | "mainMenu"
  | "inbox"
  | "outbox"
  | "compose"
  | "messageDetail"
  | "settings"
  | "addressBook"
  | "addressDetail"
  | "camera"
  | "cameraShot"
  | "photoGallery"
  | "internet"
  | "internetPage"
  | "dataFolder"
  | "dataFolderSub"
  | "profile"
  | "userSearch"
  | "infraredSend"
  | "infraredReceive"
  | "profileEdit";

interface Message {
  id: string;
  sender_email: string;
  receiver_email: string;
  subject: string;
  body: string;
  image_url?: string;
  image_size_kb?: number;
  is_read: boolean;
  created_at: string;
}

interface UserProfile {
  id: string;
  virtual_email: string;
  display_name?: string;
}

/* =========================================
   Demo Data
   ========================================= */
const DEMO_MESSAGES: Message[] = [
  {
    id: "demo-1",
    sender_email: NPC_GYARU.email,
    receiver_email: "user@motephon.ne.jp",
    subject: NPC_GYARU.welcomeMessage.subject,
    body: NPC_GYARU.welcomeMessage.body,
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    sender_email: NPC_GYARUO.email,
    receiver_email: "user@motephon.ne.jp",
    subject: NPC_GYARUO.welcomeMessage.subject,
    body: NPC_GYARUO.welcomeMessage.body,
    is_read: false,
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
];

/* Key labels are now imported from toggleInput.ts as KEY_LABELS */

/* =========================================
   PhoneApp Component
   ========================================= */
export default function PhoneApp() {
  // --- Core State ---
  const [screen, setScreen] = useState<Screen>("register");
  const [screenStack, setScreenStack] = useState<Screen[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [newMailNotification, setNewMailNotification] = useState(false);
  const [clock, setClock] = useState("");
  const [dateStr, setDateStr] = useState("");
  // colorMode is now initialized from localStorage below

  // Settings state (初期値はlocalStorageから復元)
  const [mannerMode, setMannerMode] = useState(() => { try { return localStorage.getItem("mp_manner") === "true"; } catch { return false; } });
  const [ringtone, setRingtone] = useState(() => { try { return localStorage.getItem("mp_ringtone") || "着信音1"; } catch { return "着信音1"; } });
  const [wallpaper, setWallpaper] = useState(() => { try { return localStorage.getItem("mp_wallpaper") || "標準"; } catch { return "標準"; } });
  const [fontSize, setFontSize] = useState(() => { try { return localStorage.getItem("mp_fontsize") || "標準"; } catch { return "標準"; } });
  const [brightness, setBrightness] = useState(() => { try { const v = localStorage.getItem("mp_brightness"); return v ? Number(v) : 3; } catch { return 3; } });
  const [colorMode, _setColorMode] = useState(() => { try { return localStorage.getItem("mp_color") !== "false"; } catch { return true; } });
  const setColorMode = useCallback((fn: (prev: boolean) => boolean) => {
    _setColorMode(prev => { const v = fn(prev); try { localStorage.setItem("mp_color", String(v)); } catch {} return v; });
  }, []);

  // Toast state for melody DL feedback
  const [melodyToast, setMelodyToast] = useState<string | null>(null);
  // Wallpaper DL animation state
  const [wpDownloading, setWpDownloading] = useState<string | null>(null);
  // General toast for send/action feedback
  const [actionToast, setActionToast] = useState<string | null>(null);

  // --- Haptic feedback (ガラケーのボタン触感) ---
  const vibrate = useCallback((ms: number = 10) => {
    try { if (!mannerMode && navigator.vibrate) navigator.vibrate(ms); } catch {}
  }, [mannerMode]);

  // Camera state
  const [cameraCountdown, setCameraCountdown] = useState(-1);
  const [photoGallery, setPhotoGallery] = useState<{id: string; timestamp: string; label: string}[]>([]);

  // Internet sub page
  const [internetPage, setInternetPage] = useState("");

  // Address book detail
  const [selectedContact, setSelectedContact] = useState<typeof ALL_NPCS[0] | null>(null);

  // Data folder sub
  const [dataFolderCategory, setDataFolderCategory] = useState("");

  // User search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{virtual_email: string; display_name: string; is_npc: boolean}[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // 赤外線通信 state
  const [irCode, setIrCode] = useState("");
  const [irCountdown, setIrCountdown] = useState(-1);
  const [irInputCode, setIrInputCode] = useState("");
  const [irResult, setIrResult] = useState<{found: boolean; sender?: {email: string; name: string}; message?: string} | null>(null);
  const [irLoading, setIrLoading] = useState(false);
  const irTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 名前編集 state
  const [editingName, setEditingName] = useState("");

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeImage, setComposeImage] = useState<File | null>(null);
  const [composeImagePreviewUrl, setComposeImagePreviewUrl] = useState<string | null>(null);
  const [composeField, setComposeField] = useState<"to" | "subject" | "body" | "none">("none");
  const [composeSending, setComposeSending] = useState(false);

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [regStep, setRegStep] = useState<"email" | "password">("email");
  const [regField, setRegField] = useState<"email" | "password">("email");
  const [isLogin, setIsLogin] = useState(false);

  // Toggle input state
  const [toggleState, setToggleState] = useState<ToggleInputState>(createInitialState("", "number"));
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const detailImageRef = useRef<HTMLCanvasElement>(null);

  const [latencyQueue] = useState(
    () =>
      new LatencyQueue<Message>((msg) => {
        setMessages((prev) => [msg, ...prev]);
        setNewMailNotification(true);
        setTimeout(() => setNewMailNotification(false), 3000);
      })
  );

  const supabase = useMemo(() => createClient(), []);

  // --- Am I in text input mode? ---
  const isInputActive = useMemo(() => {
    if (screen === "register") return true;
    if (screen === "compose" && composeField !== "none") return true;
    if (screen === "userSearch") return true;
    if (screen === "infraredReceive") return true;
    if (screen === "profileEdit") return true;
    return false;
  }, [screen, composeField]);

  // --- Settings persistence ---
  useEffect(() => { try { localStorage.setItem("mp_manner", String(mannerMode)); } catch {} }, [mannerMode]);
  useEffect(() => { try { localStorage.setItem("mp_ringtone", ringtone); } catch {} }, [ringtone]);
  useEffect(() => { try { localStorage.setItem("mp_wallpaper", wallpaper); } catch {} }, [wallpaper]);
  useEffect(() => { try { localStorage.setItem("mp_fontsize", fontSize); } catch {} }, [fontSize]);
  useEffect(() => { try { localStorage.setItem("mp_brightness", String(brightness)); } catch {} }, [brightness]);

  // --- Clock ---
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      const days = ["日", "月", "火", "水", "木", "金", "土"];
      setDateStr(`${now.getMonth() + 1}/${now.getDate()}(${days[now.getDay()]})`);
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  // --- 日替わりコンテンツ用シード乱数 ---
  const seedRandom = useCallback((seed: number) => {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }, []);
  const todaySeed = useMemo(() => {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }, []);

  // --- 文字サイズスケール ---
  const fontScale = useMemo(() => {
    const scales: Record<string, number> = { "小": 0.85, "標準": 1, "大": 1.2 };
    return scales[fontSize] || 1;
  }, [fontSize]);
  const brightnessOpacity = useMemo(() => 0.4 + (brightness / 5) * 0.6, [brightness]);

  // --- Navigation ---
  const pushScreen = useCallback((next: Screen) => {
    setScreenStack((prev) => [...prev, screen]);
    setScreen(next);
    setSelectedIndex(0);
  }, [screen]);

  const popScreen = useCallback(() => {
    setScreenStack((prev) => {
      const copy = [...prev];
      const last = copy.pop();
      if (last) { setScreen(last); setSelectedIndex(0); }
      return copy;
    });
  }, []);

  // --- Flush toggle input to current field ---
  const flushToggleInput = useCallback(() => {
    const text = toggleState.text;
    if (!text) return;

    if (screen === "register") {
      if (regField === "email") setRegUsername((prev) => prev + text);
      else setRegPassword((prev) => prev + text);
    } else if (screen === "compose") {
      switch (composeField) {
        case "to": setComposeTo((prev) => prev + text); break;
        case "subject": setComposeSubject((prev) => prev + text); break;
        case "body": setComposeBody((prev) => prev + text); break;
      }
    } else if (screen === "userSearch") {
      setSearchQuery((prev) => prev + text);
    } else if (screen === "infraredReceive") {
      setIrInputCode((prev) => prev + text);
    } else if (screen === "profileEdit") {
      setEditingName((prev) => prev + text);
    }
    setToggleState(createInitialState());
  }, [toggleState, screen, regField, composeField]);

  // --- Handle numpad key press ---
  const handleNumpadKey = useCallback((key: string) => {
    // idle画面での数字キーショートカット（実機準拠）
    if (screen === "idle" && !isInputActive) {
      vibrate(8);
      const shortcutMap: Record<string, () => void> = {
        "1": () => pushScreen("inbox"),
        "2": () => { setComposeTo(""); setComposeSubject(""); setComposeBody(""); setComposeImage(null); setComposeImagePreviewUrl(null); setComposeField("to"); setToggleState(createInitialState()); pushScreen("compose"); },
        "3": () => pushScreen("mainMenu"),
        "0": () => pushScreen("mainMenu"),
      };
      if (shortcutMap[key]) { shortcutMap[key](); return; }
    }
    if (!isInputActive) return;
    vibrate(8);

    // Clear previous confirm timer
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
    }

    setToggleState((prev) => {
      const next = processKeyPress(prev, key);

      // Set auto-confirm timer
      confirmTimerRef.current = setTimeout(() => {
        setToggleState((s) => confirmChar(s));
      }, 1000);

      return next;
    });
  }, [isInputActive, vibrate]);

  // --- Handle backspace ---
  const handleBackspace = useCallback(() => {
    if (!isInputActive) return;

    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
    }

    setToggleState((prev) => {
      if (prev.isComposing || prev.text.length > 0) {
        return deleteChar(prev);
      }
      // Delete from actual field
      if (screen === "register") {
        if (regField === "email") setRegUsername((p) => p.slice(0, -1));
        else setRegPassword((p) => p.slice(0, -1));
      } else if (screen === "compose") {
        switch (composeField) {
          case "to": setComposeTo((p) => p.slice(0, -1)); break;
          case "subject": setComposeSubject((p) => p.slice(0, -1)); break;
          case "body": setComposeBody((p) => p.slice(0, -1)); break;
        }
      } else if (screen === "userSearch") {
        setSearchQuery((p) => p.slice(0, -1));
      } else if (screen === "infraredReceive") {
        setIrInputCode((p) => p.slice(0, -1));
      } else if (screen === "profileEdit") {
        setEditingName((p) => p.slice(0, -1));
      }
      return prev;
    });
  }, [isInputActive, screen, regField, composeField]);

  // --- Handle mode cycle ---
  const handleModeChange = useCallback(() => {
    if (!isInputActive) return;
    flushToggleInput();
    setToggleState((prev) => cycleMode(prev));
  }, [isInputActive, flushToggleInput]);

  // --- D-pad actions ---
  const handleDpadUp = useCallback(() => {
    if (screen === "compose") {
      flushToggleInput();
      setToggleState(createInitialState());
      const fields: typeof composeField[] = ["to", "subject", "body"];
      const idx = fields.indexOf(composeField);
      if (idx > 0) setComposeField(fields[idx - 1]);
      return;
    }
    if (isInputActive) return;
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, [isInputActive, screen, composeField, flushToggleInput]);

  const handleDpadDown = useCallback(() => {
    if (screen === "compose") {
      flushToggleInput();
      setToggleState(createInitialState());
      const fields: typeof composeField[] = ["to", "subject", "body"];
      const idx = fields.indexOf(composeField);
      if (idx < fields.length - 1) setComposeField(fields[idx + 1]);
      return;
    }
    if (isInputActive) return;
    // 画面ごとの上限を設定
    const maxMap: Partial<Record<Screen, number>> = {
      mainMenu: 8, inbox: messages.length - 1, outbox: sentMessages.length - 1,
      settings: 7, addressBook: ALL_NPCS.length - 1, internet: 5,
      addressDetail: 1, dataFolder: 3, photoGallery: photoGallery.length - 1,
      camera: 1,
    };
    const max = maxMap[screen] ?? 99;
    setSelectedIndex((prev) => Math.min(prev + 1, max));
  }, [isInputActive, screen, composeField, flushToggleInput, messages.length, sentMessages.length]);

  const handleDpadLeft = useCallback(() => {
    if (isInputActive) return;
    if (screen === "mainMenu") setSelectedIndex((prev) => Math.max(0, prev - 1));
    // 受信BOX↔送信BOX を左右で切替（ガラケーのタブ操作風）
    if (screen === "outbox") { setSelectedIndex(0); setScreen("inbox"); }
    if (screen === "inbox") { setSelectedIndex(0); setScreen("outbox"); }
  }, [isInputActive, screen]);

  const handleDpadRight = useCallback(() => {
    if (isInputActive) return;
    if (screen === "mainMenu") setSelectedIndex((prev) => Math.min(prev + 1, 8));
    // 受信BOX↔送信BOX を左右で切替
    if (screen === "inbox") { setSelectedIndex(0); setScreen("outbox"); }
    if (screen === "outbox") { setSelectedIndex(0); setScreen("inbox"); }
  }, [isInputActive, screen]);

  // --- Select / OK ---
  const handleSelect = useCallback(() => {
    // If input mode, confirm char and move to next field
    if (isInputActive && toggleState.isComposing) {
      flushToggleInput();
      setToggleState(createInitialState());
      return;
    }

    switch (screen) {
      case "register":
        handleRegister();
        break;
      case "idle":
        pushScreen("mainMenu");
        break;
      case "mainMenu":
        handleMainMenuSelect(selectedIndex);
        break;
      case "inbox":
        if (messages.length > 0) {
          const idx = Math.min(selectedIndex, messages.length - 1);
          const msg = messages[idx];
          setSelectedMessage(msg);
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m)));
          // DB更新
          try { supabase.from("messages").update({ is_read: true }).eq("id", msg.id).then(); } catch {}
          pushScreen("messageDetail");
        }
        break;
      case "outbox":
        if (sentMessages.length > 0) {
          const idx = Math.min(selectedIndex, sentMessages.length - 1);
          setSelectedMessage(sentMessages[idx]);
          pushScreen("messageDetail");
        }
        break;
      case "compose":
        if (composeField === "to") {
          flushToggleInput(); setToggleState(createInitialState()); setComposeField("subject");
        } else if (composeField === "subject") {
          flushToggleInput(); setToggleState(createInitialState()); setComposeField("body");
        } else {
          handleSendMessage();
        }
        break;
      case "settings":
        handleSettingsSelect(selectedIndex);
        break;
      case "addressBook":
        if (ALL_NPCS[selectedIndex]) {
          setSelectedContact(ALL_NPCS[selectedIndex]);
          pushScreen("addressDetail");
        }
        break;
      case "addressDetail":
        if (selectedContact && selectedIndex === 0) {
          setComposeTo(selectedContact.email.split("@")[0]);
          setComposeSubject(""); setComposeBody("");
          setComposeImage(null); setComposeImagePreviewUrl(null);
          setComposeField("subject"); setToggleState(createInitialState());
          pushScreen("compose");
        }
        break;
      case "camera":
        handleCameraShoot();
        break;
      case "internet":
        handleInternetSelect(selectedIndex);
        break;
      case "internetPage":
        break;
      case "dataFolder":
        handleDataFolderSelect(selectedIndex);
        break;
      case "photoGallery":
        break;
      case "userSearch":
        handleUserSearch();
        break;
      case "infraredReceive":
        handleInfraredReceive();
        break;
      case "profileEdit":
        handleSaveName();
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedIndex, messages, sentMessages, isInputActive, toggleState, supabase]);

  const handleMainMenuSelect = useCallback((menuIdx?: number) => {
    const items = ["inbox", "compose", "outbox", "camera", "addressBook", "internet", "settings", "data", "profile"] as const;
    const idx = Math.min(menuIdx ?? selectedIndex, items.length - 1);
    switch (items[idx]) {
      case "inbox": pushScreen("inbox"); break;
      case "compose":
        setComposeTo(""); setComposeSubject(""); setComposeBody("");
        setComposeImage(null); setComposeImagePreviewUrl(null);
        setComposeField("to"); setToggleState(createInitialState());
        pushScreen("compose"); break;
      case "outbox": pushScreen("outbox"); break;
      case "addressBook": pushScreen("addressBook"); break;
      case "settings": pushScreen("settings"); break;
      case "camera": pushScreen("camera"); break;
      case "internet": pushScreen("internet"); break;
      case "data": pushScreen("dataFolder"); break;
      case "profile": pushScreen("profile"); break;
    }
  }, [selectedIndex, pushScreen]);

  // --- Settings select ---
  const handleSettingsSelect = useCallback((idx?: number) => {
    const i = idx ?? selectedIndex;
    switch (i) {
      case 0: setColorMode((p) => !p); break;
      case 1: setMannerMode((p) => !p); break;
      case 2: {
        const tones = ["着信音1", "着信音2", "着信音3", "ﾊﾞｲﾌﾞ", "ﾏﾅｰ"];
        setRingtone((p) => tones[(tones.indexOf(p) + 1) % tones.length]);
        break;
      }
      case 3: {
        const wps = ["標準", "夜空☆", "海辺", "花畑", "ｷﾗｷﾗ"];
        setWallpaper((p) => wps[(wps.indexOf(p) + 1) % wps.length]);
        break;
      }
      case 4: {
        const sizes = ["小", "標準", "大"];
        setFontSize((p) => sizes[(sizes.indexOf(p) + 1) % sizes.length]);
        break;
      }
      case 5:
        setBrightness((p) => (p % 5) + 1);
        break;
    }
  }, [selectedIndex]);

  // --- Camera shoot ---
  const handleCameraShoot = useCallback(() => {
    if (selectedIndex === 1) {
      pushScreen("photoGallery");
      return;
    }
    setCameraCountdown(3);
    const interval = setInterval(() => {
      setCameraCountdown((p) => {
        if (p <= 1) {
          clearInterval(interval);
          // フラッシュ（0表示）→ 撮影完了
          setTimeout(() => {
            const newPhoto = {
              id: `photo-${Date.now()}`,
              timestamp: new Date().toLocaleString("ja-JP"),
              label: `写真${String(photoGallery.length + 1).padStart(3, "0")}.jpg`,
            };
            setPhotoGallery((prev) => [newPhoto, ...prev]);
            setCameraCountdown(-1);
            pushScreen("cameraShot");
          }, 400);
          return 0; // フラッシュ表示
        }
        return p - 1;
      });
    }, 600);
  }, [selectedIndex, photoGallery.length, pushScreen]);

  // --- Internet select ---
  const handleInternetSelect = useCallback((idx?: number) => {
    const i = idx ?? selectedIndex;
    const pages = ["yahoo", "weather", "news", "melody", "wallpapers", "fortune"];
    if (i < pages.length) {
      setInternetPage(pages[i]);
      pushScreen("internetPage");
    }
  }, [selectedIndex, pushScreen]);

  // --- Data folder select ---
  const handleDataFolderSelect = useCallback((idx?: number) => {
    const i = idx ?? selectedIndex;
    const cats = ["received", "sent", "images", "melodies"];
    if (i < cats.length) {
      setDataFolderCategory(cats[i]);
      pushScreen("dataFolderSub");
    }
  }, [selectedIndex, pushScreen]);

  // --- Load messages from Supabase ---
  const loadMessages = useCallback(async (virtualEmail: string) => {
    try {
      const { data: inbox } = await supabase.from("messages").select("*").eq("receiver_email", virtualEmail).order("created_at", { ascending: false });
      if (inbox) setMessages(inbox.map((m: Record<string, unknown>) => ({ ...m, id: String(m.id), is_read: Boolean(m.is_read) } as Message)));
      const { data: sent } = await supabase.from("messages").select("*").eq("sender_email", virtualEmail).order("created_at", { ascending: false });
      if (sent) setSentMessages(sent.map((m: Record<string, unknown>) => ({ ...m, id: String(m.id), is_read: true } as Message)));
    } catch { /* demo mode - no DB */ }
  }, [supabase]);

  // --- Realtime subscription ---
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("messages-realtime").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_email=eq.${user.virtual_email}` }, (payload: { new: Record<string, unknown> }) => {
      const msg = { ...payload.new, id: String(payload.new.id), is_read: false } as Message;
      setMessages((prev) => { if (prev.some((m) => m.id === msg.id)) return prev; return [msg, ...prev]; });
      setNewMailNotification(true);
      setTimeout(() => setNewMailNotification(false), 3000);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, supabase]);

  // --- Poll for delayed messages (NPC返信の取得) ---
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      loadMessages(user.virtual_email);
    }, 30000); // 30秒ごとにポーリング
    return () => clearInterval(interval);
  }, [user, loadMessages]);

  // --- Register (4桁数字) ---
  const handleRegister = useCallback(async () => {
    let username = regUsername;
    let password = regPassword;
    if (toggleState.text) {
      if (regField === "email") username += toggleState.text;
      else password += toggleState.text;
      setToggleState(createInitialState("", "number"));
    }

    if (regStep === "email") {
      if (regField === "email") {
        if (!/^\d{4}$/.test(username)) { setRegError("4ケタの番号を入力してね"); return; }
        setRegUsername(username);
        setRegStep("password");
        setRegField("password");
        setRegError("");
        setToggleState(createInitialState("", "number"));
        return;
      }
    }

    if (!/^\d{4}$/.test(password)) {
      setRegError("4ケタの番号を入力してね"); return;
    }
    setRegPassword(password);

    const virtualEmail = `${username}@motephon.ne.jp`;
    const authEmail = `${username}@motephon.app`;
    // Supabase Authは6文字以上必要なので、パスワードをパディング
    const authPassword = `mp${password}xx`;
    // ネットワーク/接続エラーかどうか判定するヘルパー
    const isNetworkError = (msg: string) =>
      ["placeholder", "fetch", "load failed", "Failed to fetch", "NetworkError", "network", "CORS", "ERR_"].some(
        (k) => msg.toLowerCase().includes(k.toLowerCase())
      );

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) {
          if (isNetworkError(error.message)) { enterDemoMode(virtualEmail, username); return; }
          if (error.message.includes("Invalid login")) { setRegError("番号が違うょ…"); return; }
          // その他の認証エラーもデモモードへ
          enterDemoMode(virtualEmail, username); return;
        }
        if (data.user) {
          const { data: profile } = await supabase.from("users").select("*").eq("id", data.user.id).single();
          const u: UserProfile = profile ? { id: data.user.id, virtual_email: profile.virtual_email, display_name: profile.display_name } : { id: data.user.id, virtual_email: virtualEmail, display_name: username };
          setUser(u);
          await loadMessages(u.virtual_email);
          setScreen("idle");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) {
          if (isNetworkError(error.message)) { enterDemoMode(virtualEmail, username); return; }
          if (error.message.includes("already registered")) { setRegError("もう登録してあるょ！\nﾛｸﾞｲﾝに切替えてね"); setIsLogin(true); return; }
          // その他のエラーもデモモードへ
          enterDemoMode(virtualEmail, username); return;
        }
        if (data.user) {
          await supabase.from("users").insert({ id: data.user.id, virtual_email: virtualEmail, display_name: username });
          setUser({ id: data.user.id, virtual_email: virtualEmail, display_name: username });
          for (const npc of ALL_NPCS) {
            latencyQueue.enqueue({ id: `welcome-${npc.email}-${Date.now()}`, sender_email: npc.email, receiver_email: virtualEmail, subject: npc.welcomeMessage.subject, body: npc.welcomeMessage.body, is_read: false, created_at: new Date().toISOString() });
          }
          setScreen("idle");
        }
      }
    } catch {
      enterDemoMode(virtualEmail, username);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regUsername, regPassword, regStep, regField, toggleState, supabase, latencyQueue, isLogin, loadMessages]);

  const enterDemoMode = useCallback((virtualEmail: string, displayName: string) => {
    setUser({ id: "demo-user", virtual_email: virtualEmail, display_name: displayName });
    for (const msg of DEMO_MESSAGES) {
      latencyQueue.enqueue({ ...msg, receiver_email: virtualEmail, id: `${msg.id}-${Date.now()}` });
    }
    setScreen("idle");
  }, [latencyQueue]);

  // --- Send Message ---
  const handleSendMessage = useCallback(async () => {
    // Flush pending input
    let body = composeBody;
    let subject = composeSubject;
    let to = composeTo;
    if (toggleState.text) {
      switch (composeField) {
        case "body": body += toggleState.text; break;
        case "subject": subject += toggleState.text; break;
        case "to": to += toggleState.text; break;
      }
      setToggleState(createInitialState());
    }

    if (!to.trim()) { setActionToast("宛先を入力してね!"); setTimeout(() => setActionToast(null), 2000); setComposeSending(false); return; }
    if (!body.trim()) { setActionToast("本文を入力してね!"); setTimeout(() => setActionToast(null), 2000); setComposeSending(false); return; }
    setComposeSending(true);

    const receiverEmail = to.includes("@") ? to : `${to}@motephon.ne.jp`;
    const newMsg: Message = {
      id: `sent-${Date.now()}`,
      sender_email: user?.virtual_email || "user@motephon.ne.jp",
      receiver_email: receiverEmail,
      subject: subject || "(ﾅｼ)",
      body: body,
      image_url: composeImagePreviewUrl || undefined,
      image_size_kb: composeImage ? Math.round(composeImage.size / 1024) : undefined,
      is_read: true,
      created_at: new Date().toISOString(),
    };

    setSentMessages((prev) => [newMsg, ...prev]);
    try { await supabase.from("messages").insert({ sender_email: newMsg.sender_email, receiver_email: newMsg.receiver_email, subject: newMsg.subject, body: newMsg.body, image_url: newMsg.image_url, image_size_kb: newMsg.image_size_kb }); } catch {}

    const npc = ALL_NPCS.find((n) => n.email === receiverEmail);
    if (npc) {
      try {
        // サーバーサイドでDB直接INSERT（deliver_at付き）→ リロードしても消えない
        await fetch("/api/npc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npcEmail: npc.email,
            userMessage: body,
            senderEmail: user?.virtual_email || "",
          }),
        });
        // 返信は30秒ポーリングで自動取得される
      } catch {
        // オフライン/エラー時のみローカルフォールバック
        const isGyaru = npc.email === NPC_GYARU.email;
        const fallbackReply = isGyaru
          ? `ぇ～ﾏﾁﾞで!?\nｳｹﾙんだけどww\n\nまたﾒｰﾙしてねぇ♪\n(^_^)v☆`
          : `ﾏﾁﾞかょ～!!\nｳｹﾙww\n\nまたﾒｰﾙ\nしてこいよ～!\n('-'*)`;
        latencyQueue.enqueueWithDelay({ id: `npc-fallback-${Date.now()}`, sender_email: npc.email, receiver_email: user?.virtual_email || "", subject: `Re: ${newMsg.subject}`, body: fallbackReply, is_read: false, created_at: new Date().toISOString() }, 600000);
      }
    }
    setComposeSending(false);
    vibrate(30);
    setActionToast("✉ 送信完了♪");
    setTimeout(() => setActionToast(null), 2000);
    popScreen();
  }, [composeTo, composeSubject, composeBody, composeImage, composeImagePreviewUrl, composeField, toggleState, user, supabase, latencyQueue, popScreen]);

  // --- Image attachment (ガラケーサイズに圧縮) ---
  const handleImageAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComposeImage(file);
    // 画像を120x90に圧縮してbase64化（ガラケーの写メールサイズ）
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxW = 120, maxH = 90;
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        const compressedUrl = canvas.toDataURL("image/jpeg", 0.6);
        setComposeImagePreviewUrl(compressedUrl);
        if (imageCanvasRef.current) {
          renderProgressiveImage(imageCanvasRef.current, compressedUrl, { maxWidth: 120, maxHeight: 90, sliceHeight: 2, delayMs: 30 });
        }
      }
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  // --- Detail image render ---
  useEffect(() => {
    if (screen === "messageDetail" && selectedMessage?.image_url && detailImageRef.current) {
      renderProgressiveImage(detailImageRef.current, selectedMessage.image_url, { maxWidth: 180, maxHeight: 140, sliceHeight: 2, delayMs: 50 });
    }
  }, [screen, selectedMessage]);

  // --- Helpers ---
  const getSenderName = useCallback((email: string) => {
    const npc = ALL_NPCS.find((n) => n.email === email);
    return npc ? npc.displayName : email.split("@")[0];
  }, []);

  const unreadCount = useMemo(() => messages.filter((m) => !m.is_read).length, [messages]);

  const getSoftKeys = useCallback((): [string, string, string] => {
    switch (screen) {
      case "register": return ["", "決定", ""];
      case "idle": return ["ﾒﾆｭｰ", "開く", "ﾒｰﾙ"];
      case "mainMenu": return ["戻る", "選択", ""];
      case "inbox": case "outbox": return ["戻る", "開く", "新規"];
      case "compose":
        if (composeField === "body") return ["戻る", "送信", "添付"];
        return ["戻る", "次へ", "添付"];
      case "messageDetail": return ["戻る", "", "返信"];
      case "settings": return ["戻る", "変更", ""];
      case "addressBook": return ["戻る", "ﾒｰﾙ", ""];
      case "camera": return ["戻る", "撮影", "ｱﾙﾊﾞﾑ"];
      case "photoGallery": case "cameraShot":
        return ["戻る", "", ""];
      case "internet": return ["戻る", "開く", ""];
      case "internetPage": return ["戻る", "", ""];
      case "dataFolder": return ["戻る", "開く", ""];
      case "dataFolderSub": return ["戻る", "選択", ""];
      case "profile": return ["戻る", "", ""];
      case "userSearch": return ["戻る", "検索", ""];
      case "infraredSend": return ["戻る", "", ""];
      case "infraredReceive": return ["戻る", "受信", ""];
      case "profileEdit": return ["戻る", "保存", ""];
      default: return ["", "", ""];
    }
  }, [screen, composeField]);

  const handleSoftKeyLeft = useCallback(() => {
    if (screen === "idle") { pushScreen("mainMenu"); return; }
    if (screenStack.length > 0) {
      flushToggleInput();
      setToggleState(createInitialState());
      popScreen();
    }
  }, [screen, pushScreen, popScreen, screenStack, flushToggleInput]);

  const handleSoftKeyRight = useCallback(() => {
    switch (screen) {
      case "idle": pushScreen("inbox"); break;
      case "inbox": case "outbox":
        setComposeTo(""); setComposeSubject(""); setComposeBody("");
        setComposeImage(null); setComposeImagePreviewUrl(null);
        setComposeField("to"); setToggleState(createInitialState());
        pushScreen("compose"); break;
      case "compose":
        document.getElementById("image-attach")?.click(); break;
      case "messageDetail":
        if (selectedMessage) {
          setComposeTo(selectedMessage.sender_email.split("@")[0]);
          setComposeSubject(`Re: ${selectedMessage.subject}`);
          setComposeBody(""); setComposeImage(null); setComposeImagePreviewUrl(null);
          setComposeField("body"); setToggleState(createInitialState());
          pushScreen("compose");
        }
        break;
    }
  }, [screen, selectedMessage, pushScreen]);

  // --- Get current toggle candidates ---
  const candidates = getCurrentCandidates(toggleState);

  // --- Current field value with composing text ---
  const getFieldDisplay = useCallback((baseValue: string, fieldName: string) => {
    const isActive = (screen === "register" && regField === fieldName) ||
                     (screen === "compose" && composeField === fieldName);
    if (!isActive) return baseValue;
    const pending = toggleState.text || "";
    return baseValue + pending;
  }, [screen, regField, composeField, toggleState]);

  /* ============================================
     RENDER SCREENS
     ============================================ */

  const renderScreen = () => {
    switch (screen) {
      case "register": return renderRegisterScreen();
      case "idle": return renderIdleScreen();
      case "mainMenu": return renderMainMenuScreen();
      case "inbox": return renderInboxScreen();
      case "outbox": return renderOutboxScreen();
      case "compose": return renderComposeScreen();
      case "messageDetail": return renderMessageDetailScreen();
      case "settings": return renderSettingsScreen();
      case "addressBook": return renderAddressBookScreen();
      case "addressDetail": return renderAddressDetailScreen();
      case "camera": return renderCameraScreen();
      case "cameraShot": return renderCameraShotScreen();
      case "photoGallery": return renderPhotoGalleryScreen();
      case "internet": return renderInternetScreen();
      case "internetPage": return renderInternetPageScreen();
      case "dataFolder": return renderDataScreen();
      case "dataFolderSub": return renderDataFolderSubScreen();
      case "profile": return renderProfileScreen();
      case "userSearch": return renderUserSearchScreen();
      case "infraredSend": return renderInfraredSendScreen();
      case "infraredReceive": return renderInfraredReceiveScreen();
      case "profileEdit": return renderProfileEditScreen();
      default: return null;
    }
  };

  const renderRegisterScreen = () => (
    <div className="auth-screen screen-enter">
      <div className="title">motephon</div>
      <div style={{ fontSize: "9px", opacity: 0.5, marginBottom: 8 }}>写ﾒｰﾙ ﾈｯﾄﾜｰｸ</div>
      <div style={{ fontSize: "10px", width: "100%", textAlign: "left", marginBottom: 4 }}>
        {regStep === "email" ? "📱 ﾏｲ番号を決めよう" : "🔒 ﾊﾟｽﾜｰﾄﾞを決めよう"}
        {isLogin && <span style={{ fontSize: "8px", opacity: 0.7 }}> (ﾛｸﾞｲﾝ)</span>}
      </div>
      <div style={{ fontSize: "9px", opacity: 0.6, marginBottom: 4, textAlign: "center" }}>
        {regStep === "email" ? "好きな4ケタの数字を入力してね" : "4ケタの暗証番号を入力してね"}
      </div>
      {regStep === "email" ? (
        <>
          <div className={`auth-field-value ${regField === "email" ? "active" : ""}`}
            onClick={() => setRegField("email")}>
            <span style={{ letterSpacing: "4px", fontSize: "18px" }}>{getFieldDisplay(regUsername, "email")}</span>
            {regField === "email" && <span className="cursor-blink" />}
          </div>
          <div className="domain" style={{ width: "100%", textAlign: "right", fontSize: "10px", opacity: 0.5 }}>
            @motephon.ne.jp
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "4px", marginTop: 2 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width: 12, height: 3, borderRadius: 1, background: getFieldDisplay(regUsername, "email").length > i ? "#6af" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={`auth-field-value ${regField === "password" ? "active" : ""}`}
            onClick={() => setRegField("password")}>
            <span style={{ letterSpacing: "8px", fontSize: "20px" }}>{"●".repeat(getFieldDisplay(regPassword, "password").length)}</span>
            {regField === "password" && <span className="cursor-blink" />}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "4px", marginTop: 4 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width: 12, height: 3, borderRadius: 1, background: getFieldDisplay(regPassword, "password").length > i ? "#6af" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        </>
      )}
      {regError && <div className="error-text">{regError}</div>}
      <div style={{ fontSize: "8px", opacity: 0.3, marginTop: 8 }}>※数字ｷｰで入力 → 決定で次へ</div>
      <div style={{ fontSize: "8px", opacity: 0.5, marginTop: 4, cursor: "pointer", textDecoration: "underline" }}
        onClick={() => { setIsLogin((p) => !p); setRegError(""); }}>
        {isLogin ? "新規登録に切替" : "ﾛｸﾞｲﾝに切替"}
      </div>
    </div>
  );

  const renderIdleScreen = () => {
    // 壁紙に応じた背景
    const wallpaperBg: Record<string, string> = {
      "標準": "linear-gradient(180deg, #1a1a3a 0%, #2a2a5a 100%)",
      "夜空☆": "linear-gradient(180deg, #0a0a2a 0%, #1a1a4a 50%, #0a0a2a 100%)",
      "海辺": "linear-gradient(180deg, #87ceeb 0%, #4682b4 40%, #daa520 80%, #f5deb3 100%)",
      "花畑": "linear-gradient(180deg, #87ceeb 0%, #98fb98 50%, #90ee90 100%)",
      "ｷﾗｷﾗ": "linear-gradient(135deg, #ff69b4 0%, #ff1493 25%, #da70d6 50%, #ba55d3 75%, #ff69b4 100%)",
    };
    // 壁紙ごとの装飾テキスト
    const wallpaperDeco: Record<string, string> = {
      "夜空☆": "☆  ✦    ★   ✧  ☆",
      "海辺": "〜〜〜🌊〜〜〜",
      "花畑": "🌷 🌼 🌸 🌺 🌻",
      "ｷﾗｷﾗ": "✧ ✦ ♡ ✧ ♡ ✦ ✧",
    };

    return (
      <div className="idle-screen screen-enter" style={{
        background: wallpaperBg[wallpaper] || wallpaperBg["標準"],
        opacity: brightnessOpacity,
      }}>
        {wallpaperDeco[wallpaper] && (
          <div style={{ fontSize: `${8 * fontScale}px`, opacity: 0.3, letterSpacing: 2, marginBottom: 4 }}>{wallpaperDeco[wallpaper]}</div>
        )}
        <div className="idle-clock" style={{ fontSize: `${28 * fontScale}px` }}>{clock}</div>
        <div className="idle-date" style={{ fontSize: `${10 * fontScale}px` }}>{dateStr}</div>
        <div className="idle-carrier" style={{ fontSize: `${8 * fontScale}px` }}>motephon</div>
        {unreadCount > 0 && (
          <div className="idle-notification" style={{ fontSize: `${10 * fontScale}px` }}>
            <span className="envelope-icon">✉</span> 新着ﾒｰﾙ {unreadCount}件
          </div>
        )}
        {wallpaperDeco[wallpaper] && (
          <div style={{ fontSize: `${8 * fontScale}px`, opacity: 0.2, letterSpacing: 2, marginTop: 8 }}>{wallpaperDeco[wallpaper]}</div>
        )}
      </div>
    );
  };

  const renderMainMenuScreen = () => {
    const items = [
      { icon: "✉", label: "受信BOX", badge: unreadCount || undefined },
      { icon: "✏", label: "新規ﾒｰﾙ" },
      { icon: "📤", label: "送信BOX" },
      { icon: "📷", label: "ｶﾒﾗ" },
      { icon: "📖", label: "ｱﾄﾞﾚｽ帳" },
      { icon: "🌐", label: "ｲﾝﾀｰﾈｯﾄ" },
      { icon: "⚙", label: "設定" },
      { icon: "📁", label: "ﾃﾞｰﾀ" },
      { icon: "👤", label: "ﾌﾟﾛﾌｨｰﾙ" },
    ];
    return (
      <div className="screen-enter">
        <div className="screen-title">ﾒﾆｭｰ</div>
        <div className="grid-menu">
          {items.map((item, i) => (
            <div key={i} className={`grid-menu-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => { setSelectedIndex(i); handleMainMenuSelect(i); }}>
              <div className="icon">{item.icon}</div>
              <div className="label">{item.label}</div>
              {item.badge && (
                <div style={{ fontSize: "7px", background: colorMode ? "#cc3333" : "#222", color: "#fff", borderRadius: "4px", padding: "0 3px", marginTop: 1 }}>
                  {item.badge}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderInboxScreen = () => (
    <div className="screen-enter">
      <div className="screen-title" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "8px", opacity: 0.4 }}>◀送信</span>
        <span>受信BOX ({messages.length})</span>
        <span style={{ fontSize: "8px", opacity: 0.4 }}>送信▶</span>
      </div>
      <div className="viewport-scroll">
        {messages.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", fontSize: "10px", opacity: 0.5 }}>ﾒｰﾙはありません</div>
        ) : messages.map((msg, i) => (
          <div key={msg.id} className={`message-item ${selectedIndex === i ? "selected" : ""} ${!msg.is_read ? "unread" : ""}`}
            onClick={() => { setSelectedIndex(i); setSelectedMessage(msg); setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: true } : m)); pushScreen("messageDetail"); }}>
            <div className="from">
              <span>{!msg.is_read && "● "}{getSenderName(msg.sender_email)}</span>
              <span style={{ fontSize: "8px", opacity: 0.5 }}>{new Date(msg.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="subject">{msg.subject}</div>
            <div className="preview">{msg.image_url ? "📎 " : ""}{msg.body.substring(0, 40)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderOutboxScreen = () => (
    <div className="screen-enter">
      <div className="screen-title" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "8px", opacity: 0.4 }}>◀受信</span>
        <span>送信BOX ({sentMessages.length})</span>
        <span style={{ fontSize: "8px", opacity: 0.4 }}>受信▶</span>
      </div>
      <div className="viewport-scroll">
        {sentMessages.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", fontSize: "10px", opacity: 0.5 }}>送信ﾒｰﾙはありません</div>
        ) : sentMessages.map((msg, i) => (
          <div key={msg.id} className={`message-item ${selectedIndex === i ? "selected" : ""}`}
            onClick={() => { setSelectedIndex(i); setSelectedMessage(msg); pushScreen("messageDetail"); }}>
            <div className="from">
              <span>To: {getSenderName(msg.receiver_email)}</span>
              <span style={{ fontSize: "8px", opacity: 0.5 }}>{new Date(msg.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="subject">{msg.subject}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderComposeScreen = () => {
    const imageKb = composeImage ? Math.round(composeImage.size / 1024) : 0;
    return (
      <div className="screen-enter" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="screen-title">ﾒｰﾙ作成</div>
        <div className="compose-field" onClick={() => { flushToggleInput(); setComposeField("to"); setToggleState(createInitialState()); }}>
          <span className="field-label">宛先</span>
          <div className={`field-value ${composeField === "to" ? "active" : ""}`}>
            {getFieldDisplay(composeTo, "to")}
            {composeField === "to" && <span className="cursor-blink" />}
          </div>
        </div>
        <div className="compose-field" onClick={() => { flushToggleInput(); setComposeField("subject"); setToggleState(createInitialState()); }}>
          <span className="field-label">件名</span>
          <div className={`field-value ${composeField === "subject" ? "active" : ""}`}>
            {getFieldDisplay(composeSubject, "subject") || <span style={{ opacity: 0.3 }}>(ﾅｼ)</span>}
            {composeField === "subject" && <span className="cursor-blink" />}
          </div>
        </div>
        <div className="compose-body-area" onClick={() => { flushToggleInput(); setComposeField("body"); setToggleState(createInitialState("", "hiragana")); }}
          style={{ flex: 1, cursor: "text" }}>
          {getFieldDisplay(composeBody, "body")}
          {composeField === "body" && <span className="cursor-blink" />}
        </div>
        {composeImagePreviewUrl && <div className="image-canvas-wrap"><canvas ref={imageCanvasRef} /></div>}
        <div className="capacity-bar">
          <span>📎{imageKb > 0 ? `${imageKb}KB` : "ﾅｼ"}</span>
          <div className="bar-bg"><div className="bar-fill" style={{ width: `${Math.min(100, (imageKb / 50) * 100)}%` }} /></div>
          <span>{imageKb}KB/50KB</span>
        </div>
        <input type="file" accept="image/*" id="image-attach" className="hidden-file-input" onChange={handleImageAttach} />
        {composeSending && <div style={{ textAlign: "center", padding: 4, fontSize: "10px" }}>送信中...</div>}
      </div>
    );
  };

  const renderMessageDetailScreen = () => {
    if (!selectedMessage) return null;
    const isSent = selectedMessage.sender_email === user?.virtual_email;
    return (
      <div className="screen-enter">
        <div className="screen-title">{isSent ? "送信ﾒｰﾙ" : "受信ﾒｰﾙ"}</div>
        <div className="viewport-scroll">
          <div className="mail-header">
            <div className="row"><span className="label">{isSent ? "To" : "From"}</span><span>{isSent ? getSenderName(selectedMessage.receiver_email) : getSenderName(selectedMessage.sender_email)}</span></div>
            <div className="row"><span className="label">件名</span><span>{selectedMessage.subject}</span></div>
            <div className="row"><span className="label">日時</span><span style={{ fontSize: "9px" }}>{new Date(selectedMessage.created_at).toLocaleString("ja-JP")}</span></div>
            {selectedMessage.image_size_kb && <div className="row"><span className="label">添付</span><span>📎 {selectedMessage.image_size_kb}KB</span></div>}
          </div>
          <div className="mail-body">{selectedMessage.body}</div>
          {selectedMessage.image_url && <div className="image-canvas-wrap"><canvas ref={detailImageRef} /></div>}
        </div>
      </div>
    );
  };

  // ========== SETTINGS SCREEN ==========
  const renderSettingsScreen = () => {
    const settingsItems = [
      { label: "画面ﾓｰﾄﾞ", value: colorMode ? "ｶﾗｰ(TFT)" : "ﾓﾉｸﾛ(STN)", icon: "🖥" },
      { label: "ﾏﾅｰﾓｰﾄﾞ", value: mannerMode ? "ON" : "OFF", icon: "🔇" },
      { label: "着信音", value: ringtone, icon: "🔔" },
      { label: "待受画面", value: wallpaper, icon: "🎨" },
      { label: "文字ｻｲｽﾞ", value: fontSize, icon: "🔤" },
      { label: "画面の明るさ", value: "▮".repeat(brightness) + "▯".repeat(5 - brightness), icon: "☀" },
      { label: "ﾏｲｱﾄﾞﾚｽ", value: user?.virtual_email || "--", icon: "📧" },
      { label: "ﾊﾞｰｼﾞｮﾝ", value: "v2.0.0", icon: "ℹ" },
    ];
    return (
      <div className="screen-enter">
        <div className="screen-title">設定</div>
        <div className="viewport-scroll">
          {settingsItems.map((item, i) => (
            <div key={i} className={`settings-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => { setSelectedIndex(i); handleSettingsSelect(i); }}>
              <span>{item.icon} {item.label}</span>
              <span className="value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ========== CAMERA SCREEN ==========
  const renderCameraScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">📷 ｶﾒﾗ</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 6, padding: 8 }}>
        {/* ファインダー */}
        <div style={{ width: "85%", aspectRatio: "4/3", background: "linear-gradient(135deg, #1a2a1a 0%, #0d1a0d 100%)", border: "2px solid #444", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, position: "relative", overflow: "hidden" }}>
          {/* ファインダーグリッド */}
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 32%, rgba(255,255,255,0.03) 32%, rgba(255,255,255,0.03) 33.3%), repeating-linear-gradient(90deg, transparent, transparent 49%, rgba(255,255,255,0.03) 49%, rgba(255,255,255,0.03) 50%)", pointerEvents: "none" }} />
          {/* クロスヘア */}
          <div style={{ position: "absolute", width: 24, height: 24, border: "1px solid rgba(255,255,255,0.3)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", width: 1, height: 12, background: "rgba(255,255,255,0.2)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
          <div style={{ position: "absolute", width: 12, height: 1, background: "rgba(255,255,255,0.2)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
          {/* ステータス */}
          <div style={{ position: "absolute", top: 4, left: 6, fontSize: "7px", color: "#4a4" }}>● REC</div>
          <div style={{ position: "absolute", top: 4, right: 6, fontSize: "7px", color: "#aaa" }}>VGA</div>
          <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: "7px", color: "#aaa" }}>{photoGallery.length}枚</div>
          <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: "7px", color: "#aaa" }}>📷0.3MP</div>
          {/* カウントダウン */}
          {cameraCountdown > 0 && (
            <div style={{ fontSize: "28px", color: "#f44", fontWeight: "bold", animation: "cursorBlink 0.5s steps(1) infinite" }}>{cameraCountdown}</div>
          )}
          {cameraCountdown === 0 && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "10px", color: "#333" }}>📸 ﾊﾟｼｬ!</div>
            </div>
          )}
        </div>
        {/* ボタン */}
        <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "center" }}>
          {[{icon: "📸", label: "撮影", idx: 0}, {icon: "🖼", label: "ｱﾙﾊﾞﾑ", idx: 1}].map(({icon, label, idx}) => (
            <div key={idx} className={`menu-item ${selectedIndex === idx ? "selected" : ""}`}
              style={{ flex: 1, justifyContent: "center", padding: "6px 0" }}
              onClick={() => { setSelectedIndex(idx); if (idx === 1) pushScreen("photoGallery"); else handleCameraShoot(); }}>
              <div className="icon">{icon}</div>
              <div className="label" style={{ fontSize: "10px" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: "8px", opacity: 0.4, textAlign: "center" }}>OK:撮影 / ▶:ｱﾙﾊﾞﾑ</div>
      </div>
    </div>
  );

  const renderCameraShotScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">📷 撮影完了</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 12, gap: 8 }}>
        <div style={{ width: "80%", aspectRatio: "4/3", background: "linear-gradient(135deg, #2a3a2a 0%, #1a2a1a 100%)", border: "2px solid #555", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: "32px" }}>📸</div>
        </div>
        <div style={{ fontSize: "10px", textAlign: "center" }}>保存しました！</div>
        <div style={{ fontSize: "9px", opacity: 0.5, textAlign: "center" }}>
          {photoGallery.length > 0 ? photoGallery[0].label : ""}<br/>
          VGA / 約15KB
        </div>
        {/* メールに添付ショートカット */}
        <div className="menu-item" style={{ cursor: "pointer", marginTop: 4, justifyContent: "center", width: "80%" }}
          onClick={() => {
            setComposeTo(""); setComposeSubject("写メ☆"); setComposeBody("");
            setComposeImage(null); setComposeImagePreviewUrl(null);
            setComposeField("to"); setToggleState(createInitialState());
            pushScreen("compose");
          }}>
          <div className="icon">✉</div>
          <div className="label" style={{ fontSize: "10px" }}>ﾒｰﾙに添付</div>
        </div>
      </div>
    </div>
  );

  const renderPhotoGalleryScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">📸 ｱﾙﾊﾞﾑ ({photoGallery.length}枚)</div>
      <div className="viewport-scroll">
        {photoGallery.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: "10px", opacity: 0.5 }}>写真はまだありません📷\nｶﾒﾗで撮影してね</div>
        ) : photoGallery.map((photo, i) => (
          <div key={photo.id} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
            onClick={() => setSelectedIndex(i)}>
            <div className="icon" style={{ fontSize: "16px" }}>🖼</div>
            <div className="label">
              <div style={{ fontSize: "10px" }}>{photo.label}</div>
              <div style={{ fontSize: "8px", opacity: 0.5 }}>{photo.timestamp} / 約15KB</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ========== INTERNET SCREEN ==========
  const renderInternetScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">🌐 J-SKY web</div>
      <div style={{ padding: "4px 8px" }}>
        <div style={{ textAlign: "center", fontSize: "12px", fontWeight: "bold", padding: "6px 0 2px", borderBottom: "1px dashed rgba(0,0,0,0.15)" }}>J-SKY ﾎﾟｰﾀﾙ</div>
        <div style={{ textAlign: "center", fontSize: "8px", opacity: 0.5, padding: "2px 0 6px" }}>28.8kbps接続中...</div>
        <div className="viewport-scroll">
          {["Yahoo!ｹｰﾀｲ", "天気予報", "ﾆｭｰｽ速報", "着ﾒﾛ♪", "待受画像DL", "今日の占い"].map((item, i) => (
            <div key={i} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => { setSelectedIndex(i); handleInternetSelect(i); }}>
              <div className="icon">{["🔍","☀","📰","🎵","🖼","🔮"][i]}</div>
              <div className="label" style={{ fontSize: "11px" }}>{item}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderInternetPageScreen = () => {
    const pages: Record<string, {title: string; content: React.ReactNode}> = {
      yahoo: { title: "Yahoo!ｹｰﾀｲ", content: (
        <div style={{ padding: 8 }}>
          <div className="screen-title" style={{ background: "#b00", color: "#fff", fontWeight: "bold" }}>Yahoo! JAPAN</div>
          <div style={{ padding: "8px 4px", fontSize: "10px" }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>🔍 検索</div>
            <div style={{ background: "rgba(0,0,0,0.05)", padding: 4, borderRadius: 2, marginBottom: 8, fontSize: "9px", opacity: 0.5 }}>検索ﾜｰﾄﾞを入力...</div>
            <div style={{ borderBottom: "1px dotted rgba(0,0,0,0.2)", paddingBottom: 4, marginBottom: 4 }}>📱 着うた♪ﾗﾝｷﾝｸﾞ</div>
            <div style={{ borderBottom: "1px dotted rgba(0,0,0,0.2)", paddingBottom: 4, marginBottom: 4 }}>🎮 ﾐﾆｹﾞｰﾑ</div>
            <div style={{ borderBottom: "1px dotted rgba(0,0,0,0.2)", paddingBottom: 4, marginBottom: 4 }}>⚾ ｽﾎﾟｰﾂ速報</div>
            <div style={{ borderBottom: "1px dotted rgba(0,0,0,0.2)", paddingBottom: 4, marginBottom: 4 }}>🎬 映画情報</div>
            <div style={{ borderBottom: "1px dotted rgba(0,0,0,0.2)", paddingBottom: 4 }}>💰 ｵｰｸｼｮﾝ</div>
          </div>
        </div>
      )},
      weather: { title: "\u5929\u6c17\u4e88\u5831", content: (() => {
        const rng = seedRandom(todaySeed + 1);
        const hour = new Date().getHours();
        const areas = ["\u6771\u4eac", "\u5927\u962a", "\u672d\u5e4c", "\u798f\u5ca1", "\u6c96\u7e04"];
        const baseTemps = [15, 14, 2, 13, 22];
        const icons = ["☀", "⛅", "🌧", "❄", "☁"];
        const txts = ["晴れ", "曇り時々晴れ", "雨", "雪", "曇り", "晴れのち曇", "雨のち晴"];
        const hourMod = hour < 10 ? -3 : hour < 16 ? 2 : -1;
        return (
          <div style={{ padding: 8 }}>
            <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: 8, fontSize: "11px" }}>☀ 全国天気予報</div>
            {areas.map((area, i) => {
              const variation = Math.floor(rng() * 8) - 4;
              const high = baseTemps[i] + variation + hourMod;
              const low = high - 8 - Math.floor(rng() * 5);
              const iconIdx = Math.floor(rng() * icons.length);
              const txtIdx = Math.floor(rng() * txts.length);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dotted rgba(0,0,0,0.1)", fontSize: "10px" }}>
                  <span>{icons[iconIdx]} {area}</span>
                  <span style={{ opacity: 0.7 }}>{high}℃/{low}℃</span>
                  <span style={{ fontSize: "9px" }}>{txts[txtIdx]}</span>
                </div>
              );
            })}
            <div style={{ fontSize: "8px", opacity: 0.4, marginTop: 8, textAlign: "center" }}>更新: {dateStr} {clock}</div>
          </div>
        );
      })()},
      news: { title: "ﾆｭｰｽ速報", content: (() => {
        const allNews = [
          "ﾓｰﾆﾝｸﾞ娘。新曲ｵﾘｺﾝ1位獲得", "ﾜｰﾙﾄﾞｶｯﾌﾟ日本代表合宿ｽﾀｰﾄ",
          "新型携帯続々登場 ｶﾒﾗ機能が進化", "渋谷109春ﾌｧｯｼｮﾝ特集",
          "人気ﾄﾞﾗﾏ最終回 視聴率30%超", "宇多田ヒカル新アルバム発売決定",
          "コンビニ各社 iMode対応強化", "浜崎あゆみ アジアツアー開催発表",
          "少年ジャンプ NARUTO起連載開始", "ケータイ純増 1億台突破",
          "トヨタ・ホンダ ハイブリッド車開発加速", "塗るだけエステ 100万本突破",
          "J-フォン 新サービス「J-SKY Walker」開始", "SMAP×SMAP 視聴率25%の安定感",
          "au GPSナビゲーションサービス開始", "メガバンク 着うた配信数500曲突破",
          "イチロー メジャー通算257号HR", "映画『千と千尋』興行収入300億突破",
          "DoCoMo FOMA加入者30万人突破", "NTTドコモ 504iシリーズ発表",
        ];
        const rng = seedRandom(todaySeed + 2);
        const indices: number[] = [];
        while (indices.length < 5) {
          const idx = Math.floor(rng() * allNews.length);
          if (!indices.includes(idx)) indices.push(idx);
        }
        return (
          <div style={{ padding: 8 }}>
            <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: 6, fontSize: "11px" }}>📰 ﾆｭｰｽ速報</div>
            {indices.map((idx, i) => (
              <div key={i} style={{ padding: "5px 0", borderBottom: "1px dotted rgba(0,0,0,0.1)", fontSize: "10px" }}>
                <span style={{ color: colorMode ? "#c33" : "inherit", fontSize: "9px" }}>[速報]</span> {allNews[idx]}
              </div>
            ))}
            <div style={{ fontSize: "8px", opacity: 0.4, marginTop: 6, textAlign: "center" }}>{dateStr} 更新</div>
          </div>
        );
      })()},
      melody: { title: "着ﾒﾛ♫", content: (
        <div style={{ padding: 8 }}>
          <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: 6, fontSize: "11px" }}>🎵 着ﾒﾛﾗﾝｷﾝｸﾞ</div>
          <div style={{ fontSize: "9px", opacity: 0.5, marginBottom: 6, textAlign: "center" }}>40和音対応 / 各3KB</div>
          {[{rank: 1, song: "LOVEﾏｼｰﾝ", artist: "ﾓｰﾆﾝｸﾞ娘。", hot: true}, {rank: 2, song: "Automatic", artist: "宇多田ﾋｶﾙ"}, {rank: 3, song: "ﾂﾅﾐ", artist: "ｻｻﾞﾝ"}, {rank: 4, song: "SEASONS", artist: "浜崎あゆみ"}, {rank: 5, song: "桜坂", artist: "福山雅治"}, {rank: 6, song: "夏祭り", artist: "Whiteberry"}, {rank: 7, song: "secret base", artist: "ZONE"}].map((m) => (
            <div key={m.rank} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 0", borderBottom: "1px dotted rgba(0,0,0,0.1)", fontSize: "10px" }}>
              <span style={{ fontWeight: "bold", width: 14, fontSize: "11px", color: m.rank <= 3 ? (colorMode ? "#c33" : "inherit") : "inherit" }}>{m.rank}</span>
              <span style={{ flex: 1 }}>{m.song}<span style={{ fontSize: "8px", opacity: 0.5 }}> - {m.artist}</span></span>
              {m.hot && <span style={{ fontSize: "7px", background: colorMode ? "#c33" : "#333", color: "#fff", borderRadius: 2, padding: "0 3px" }}>HOT</span>}
              {ringtone === m.song ? (
                <span style={{ fontSize: "7px", background: colorMode ? "#4466aa" : "#555", color: "#fff", borderRadius: 2, padding: "0 3px" }}>✔設定中</span>
              ) : (
                <span style={{ fontSize: "8px", opacity: 0.5, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setRingtone(m.song); setMelodyToast(`♫ ${m.song} を着信音に設定！`); setTimeout(() => setMelodyToast(null), 2000); }}>♫DL</span>
              )}
            </div>
          ))}
          {melodyToast && (
            <div style={{ marginTop: 6, textAlign: "center", background: colorMode ? "#4466aa" : "#555", color: "#fff", fontSize: "9px", padding: "4px 8px", borderRadius: 3 }}>
              {melodyToast}
            </div>
          )}
        </div>
      )},
      wallpapers: { title: "待受画像DL", content: (() => {
        const wpItems = [
          { emoji: "🌸", name: "桜", wpKey: "標準" },
          { emoji: "🌊", name: "海", wpKey: "海辺" },
          { emoji: "🌙", name: "月", wpKey: "夜空☆" },
          { emoji: "🐱", name: "猫", wpKey: "標準" },
          { emoji: "🌈", name: "虹", wpKey: "ｷﾗｷﾗ" },
          { emoji: "⭐", name: "星空", wpKey: "夜空☆" },
          { emoji: "🗼", name: "東京", wpKey: "標準" },
          { emoji: "🎀", name: "ﾘﾎﾞﾝ", wpKey: "ｷﾗｷﾗ" },
          { emoji: "💎", name: "宝石", wpKey: "標準" },
          { emoji: "🌻", name: "花", wpKey: "花畑" },
        ];
        return (
          <div style={{ padding: 8 }}>
            <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: 6, fontSize: "11px" }}>🖼 待受画像</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {wpItems.map((w, i) => (
                <div key={i} style={{ aspectRatio: "3/4", background: wallpaper === w.wpKey ? (colorMode ? "rgba(68,102,170,0.15)" : "rgba(0,0,0,0.15)") : "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, fontSize: "11px", flexDirection: "column", gap: 2, cursor: "pointer", border: wallpaper === w.wpKey ? "1px solid rgba(68,102,170,0.4)" : "1px solid transparent" }}
                  onClick={() => {
                    if (wpDownloading) return;
                    setWpDownloading(w.name);
                    setTimeout(() => { setWallpaper(w.wpKey); setWpDownloading(null); }, 800);
                  }}>
                  <div style={{ fontSize: "18px" }}>{wpDownloading === w.name ? "⏳" : w.emoji}</div>
                  <div style={{ fontSize: "8px" }}>{wpDownloading === w.name ? "DL中..." : w.name}</div>
                  {wallpaper === w.wpKey && <div style={{ fontSize: "6px", opacity: 0.5 }}>✓設定中</div>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: "8px", opacity: 0.4, marginTop: 6, textAlign: "center" }}>120×160ﾋﾟｸｾﾙ / 各5KB</div>
          </div>
        );
      })()},
      fortune: { title: "今日の占い", content: (() => {
        const signs = ["♈牡羊座", "♉牡牛座", "♊双子座", "♋蟹座", "♌獅子座", "♍乙女座", "♎天秤座", "♏蠎座", "♐射手座", "♑山羊座", "♒水瓶座", "♓魚座"];
        const allLucks = ["◎大吉", "○吉", "○吉", "△小吉", "◎大吉", "○吉", "×凶", "○中吉", "△小吉", "○吉"];
        const luckyItems = ["☆ｽﾄﾗｯﾌﾟ", "♡ﾌﾟﾘｸﾗ帳", "♪着ﾒﾛ", "✶ﾍｱｻﾞｱｸｾ", "✧シルバーリング", "❀花柄ハンカチ", "★迷彩柄バッグ", "◇クリアファイル", "♡ピンクのペン", "☆メガネケース", "♪ワイヤレスイヤホン", "✶ミサンガ"];
        const rng = seedRandom(todaySeed + 3);
        const dailyLucks = signs.map(() => allLucks[Math.floor(rng() * allLucks.length)]);
        const dailyItem = luckyItems[Math.floor(rng() * luckyItems.length)];
        return (
          <div style={{ padding: 8 }}>
            <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: 6, fontSize: "11px" }}>🔮 今日の運勢</div>
            <div style={{ fontSize: "8px", opacity: 0.5, marginBottom: 6, textAlign: "center" }}>{dateStr}の占い</div>
            {signs.map((sign, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px dotted rgba(0,0,0,0.08)", fontSize: "9px" }}>
                <span>{sign}</span>
                <span style={{ fontWeight: dailyLucks[i].includes("大吉") ? "bold" : "normal", color: dailyLucks[i].includes("凶") && colorMode ? "#c33" : "inherit" }}>{dailyLucks[i]}</span>
              </div>
            ))}
            <div style={{ fontSize: "9px", marginTop: 8, padding: 6, background: "rgba(0,0,0,0.04)", borderRadius: 2 }}>ﾗｯｷｰｱｲﾃﾑ: {dailyItem}</div>
          </div>
        );
      })()},
    };
    const page = pages[internetPage] || { title: "404", content: <div style={{ padding: 12, textAlign: "center", fontSize: "10px" }}>ﾍﾟｰｼﾞが見つかりません</div> };
    return (
      <div className="screen-enter" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="screen-title">🌐 {page.title}</div>
        <div className="viewport-scroll">{page.content}</div>
      </div>
    );
  };

  // ========== DATA FOLDER SCREEN ==========
  const renderDataScreen = () => {
    const imgCount = photoGallery.length + sentMessages.filter((m) => m.image_url).length + messages.filter((m) => m.image_url).length;
    const totalKb = Math.round((messages.length + sentMessages.length) * 0.8 + photoGallery.length * 15);
    const items = [
      { icon: "📨", label: "受信ﾒｰﾙ", value: `${messages.length}件` },
      { icon: "📤", label: "送信ﾒｰﾙ", value: `${sentMessages.length}件` },
      { icon: "🖼", label: "画像", value: `${imgCount}件` },
      { icon: "🎵", label: "着信音/着ﾒﾛ", value: "5件" },
    ];
    return (
      <div className="screen-enter">
        <div className="screen-title">📁 ﾃﾞｰﾀﾌｫﾙﾀﾞ</div>
        <div className="viewport-scroll">
          {items.map((item, i) => (
            <div key={i} className={`settings-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => { setSelectedIndex(i); handleDataFolderSelect(i); }}>
              <span>{item.icon} {item.label}</span>
              <span className="value">{item.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: "6px 8px", borderTop: "1px solid rgba(0,0,0,0.1)", fontSize: "9px", opacity: 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>💾 使用容量</span>
              <span>{totalKb}KB / 1024KB</span>
            </div>
            <div style={{ marginTop: 4, height: 6, background: "rgba(0,0,0,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (totalKb / 1024) * 100)}%`, background: colorMode ? "#4466aa" : "#666", borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDataFolderSubScreen = () => {
    const contents: Record<string, React.ReactNode> = {
      received: (
        <div>
          {messages.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: "10px", opacity: 0.5 }}>ﾃﾞｰﾀなし</div>
          ) : messages.map((msg, i) => (
            <div key={msg.id} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => { setSelectedIndex(i); setSelectedMessage(msg); pushScreen("messageDetail"); }}>
              <div className="icon">📨</div>
              <div className="label">
                <div style={{ fontSize: "10px" }}>{getSenderName(msg.sender_email)}</div>
                <div style={{ fontSize: "8px", opacity: 0.5 }}>{msg.subject}</div>
              </div>
            </div>
          ))}
        </div>
      ),
      sent: (
        <div>
          {sentMessages.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: "10px", opacity: 0.5 }}>ﾃﾞｰﾀなし</div>
          ) : sentMessages.map((msg, i) => (
            <div key={msg.id} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => { setSelectedIndex(i); setSelectedMessage(msg); pushScreen("messageDetail"); }}>
              <div className="icon">📤</div>
              <div className="label">
                <div style={{ fontSize: "10px" }}>To: {getSenderName(msg.receiver_email)}</div>
                <div style={{ fontSize: "8px", opacity: 0.5 }}>{msg.subject}</div>
              </div>
            </div>
          ))}
        </div>
      ),
      images: (
        <div>
          {photoGallery.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: "10px", opacity: 0.5 }}>画像なし\nｶﾒﾗで撮影してね📷</div>
          ) : photoGallery.map((photo, i) => (
            <div key={photo.id} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => setSelectedIndex(i)}>
              <div className="icon">🖼</div>
              <div className="label">
                <div style={{ fontSize: "10px" }}>{photo.label}</div>
                <div style={{ fontSize: "8px", opacity: 0.5 }}>{photo.timestamp}</div>
              </div>
            </div>
          ))}
        </div>
      ),
      melodies: (
        <div>
          {["着信音1 (ﾃﾞﾌｫﾙﾄ)", "着信音2 (ﾎﾟﾘﾌｫﾆｰ)", "着信音3 (和音)", "ﾊﾞｲﾌﾞﾚｰｼｮﾝ", "ﾏﾅｰﾓｰﾄﾞ"].map((melody, i) => (
            <div key={i} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
              onClick={() => setSelectedIndex(i)}>
              <div className="icon">🎵</div>
              <div className="label">
                <div style={{ fontSize: "10px" }}>{melody}</div>
                <div style={{ fontSize: "8px", opacity: 0.5 }}>{i < 3 ? "40和音 / 3KB" : "ｼｽﾃﾑ"}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    };
    const catLabels: Record<string, string> = { received: "📨 受信ﾒｰﾙ", sent: "📤 送信ﾒｰﾙ", images: "🖼 画像", melodies: "🎵 着信音" };
    return (
      <div className="screen-enter">
        <div className="screen-title">{catLabels[dataFolderCategory] || "ﾃﾞｰﾀ"}</div>
        <div className="viewport-scroll">
          {contents[dataFolderCategory] || <div style={{ padding: 12, textAlign: "center", fontSize: "10px" }}>ﾃﾞｰﾀがありません</div>}
        </div>
      </div>
    );
  };

  // ========== PROFILE SCREEN ==========
  const renderProfileScreen = () => {
    const totalMails = messages.length + sentMessages.length;
    return (
      <div className="screen-enter">
        <div className="screen-title">👤 ﾌﾟﾛﾌｨｰﾙ</div>
        <div className="viewport-scroll" style={{ padding: 8 }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontSize: "32px", marginBottom: 2 }}>👤</div>
            <div
              style={{ fontSize: "13px", fontWeight: "bold", cursor: "pointer", textDecoration: "underline dotted", textDecorationColor: "rgba(0,0,0,0.2)" }}
              onClick={() => {
                setEditingName(user?.display_name || "");
                setToggleState(createInitialState("", "hiragana"));
                pushScreen("profileEdit");
              }}
            >
              {user?.display_name || "--"} ✏️
            </div>
            <div style={{ fontSize: "7px", opacity: 0.4, marginTop: 2 }}>タップで名前変更</div>
          </div>
          {[
            { label: "ﾏｲｱﾄﾞﾚｽ", value: user?.virtual_email || "--", icon: "📧" },
            { label: "端末名", value: "J-SH51", icon: "📱" },
            { label: "ｷｬﾘｱ", value: "motephon (J-ﾌｫﾝ)", icon: "📡" },
            { label: "ﾒﾓﾘ", value: "1MB内蔵 + SDｶｰﾄﾞ", icon: "💾" },
            { label: "ｶﾒﾗ", value: "0.3MP CMOS (VGA)", icon: "📷" },
            { label: "液晶", value: colorMode ? "65536色 TFT" : "ﾓﾉｸﾛ STN", icon: "🖥" },
            { label: "ﾒｰﾙ通数", value: `${totalMails}通`, icon: "✉" },
            { label: "写真枚数", value: `${photoGallery.length}枚`, icon: "🖼" },
            { label: "ﾊﾟｹｯﾄ通信", value: "28.8kbps", icon: "🌐" },
            { label: "Java", value: "対応 (100KB)", icon: "☕" },
            { label: "着信音", value: "40和音", icon: "🎵" },
            { label: "ﾊﾞｰｼﾞｮﾝ", value: "v2.0.0", icon: "ℹ" },
          ].map((item, i) => (
            <div key={i} className="settings-item" style={{ cursor: "default" }}>
              <span style={{ fontSize: "10px" }}>{item.icon} {item.label}</span>
              <span className="value" style={{ fontSize: "9px" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ========== PROFILE EDIT (NAME) SCREEN ==========
  const handleSaveName = useCallback(async () => {
    let name = editingName;
    if (toggleState.text) {
      name += toggleState.text;
      setEditingName(name);
      setToggleState(createInitialState());
    }
    if (!name.trim()) return;
    // Update local state
    setUser(prev => prev ? { ...prev, display_name: name } : prev);
    // Update DB
    try {
      if (user?.id && user.id !== "demo-user") {
        await supabase.from("users").update({ display_name: name }).eq("id", user.id);
      }
    } catch {}
    popScreen();
  }, [editingName, toggleState, user, supabase, popScreen]);

  const renderProfileEditScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">✏️ 名前変更</div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: "10px", opacity: 0.7, marginBottom: 8, textAlign: "center" }}>
          相手に表示される名前を入力してね
        </div>
        <div style={{
          background: "rgba(0,0,0,0.05)",
          padding: "8px",
          borderRadius: 2,
          fontSize: "16px",
          textAlign: "center",
          marginBottom: 8,
          border: "1px solid rgba(0,0,0,0.1)",
          minHeight: 30,
        }}>
          {getFieldDisplay(editingName, "profileEdit")}
          <span className="cursor-blink" />
        </div>
        <div style={{ fontSize: "8px", opacity: 0.4, textAlign: "center", marginBottom: 12 }}>
          ※キーで入力 → 決定で保存
        </div>
        <div
          className="menu-item selected"
          style={{ justifyContent: "center", padding: "6px 0" }}
          onClick={handleSaveName}
        >
          <div className="icon">💾</div>
          <div className="label" style={{ fontSize: "11px" }}>保存する</div>
        </div>
      </div>
    </div>
  );

  // ========== USER SEARCH SCREEN ==========
  const handleUserSearch = useCallback(async () => {
    let q = searchQuery;
    if (toggleState.text) {
      q += toggleState.text;
      setSearchQuery(q);
      setToggleState(createInitialState("", "number"));
    }
    if (!q.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch {} 
    setSearchLoading(false);
  }, [searchQuery, toggleState]);

  const renderUserSearchScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">🔍 ﾕｰｻﾞｰ検索</div>
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: "10px", marginBottom: 6, opacity: 0.7 }}>
          相手の4ケタ番号を入力して検索
        </div>
        <div style={{
          background: "rgba(0,0,0,0.05)",
          padding: "6px 8px",
          borderRadius: 2,
          fontSize: "14px",
          letterSpacing: 4,
          textAlign: "center",
          marginBottom: 8,
          border: "1px solid rgba(0,0,0,0.1)",
          minHeight: 24,
        }}>
          {getFieldDisplay(searchQuery, "search")}
          <span className="cursor-blink" />
        </div>
        <div
          className="menu-item selected"
          style={{ justifyContent: "center", padding: "6px 0", marginBottom: 8 }}
          onClick={handleUserSearch}
        >
          <div className="icon">🔍</div>
          <div className="label" style={{ fontSize: "11px" }}>検索する</div>
        </div>

        {searchLoading && (
          <div style={{ textAlign: "center", fontSize: "10px", opacity: 0.5, padding: 8 }}>
            検索中...
          </div>
        )}
        {!searchLoading && searchResults.length > 0 && (
          <div>
            <div style={{ fontSize: "9px", opacity: 0.5, marginBottom: 4 }}>検索結果:</div>
            {searchResults.map((u, i) => (
              <div key={u.virtual_email} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
                onClick={() => {
                  setComposeTo(u.virtual_email.split("@")[0]);
                  setComposeSubject(""); setComposeBody("");
                  setComposeImage(null); setComposeImagePreviewUrl(null);
                  setComposeField("subject"); setToggleState(createInitialState());
                  pushScreen("compose");
                }}>
                <div className="icon" style={{ fontSize: "16px" }}>👤</div>
                <div className="label">
                  <div style={{ fontSize: "11px", fontWeight: "bold" }}>{u.display_name || u.virtual_email.split("@")[0]}</div>
                  <div style={{ fontSize: "8px", opacity: 0.5 }}>{u.virtual_email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!searchLoading && searchQuery && searchResults.length === 0 && (
          <div style={{ textAlign: "center", fontSize: "10px", opacity: 0.5, padding: 12 }}>
            見つかりませんでした…
          </div>
        )}
      </div>
    </div>
  );

  // ========== INFRARED SEND SCREEN ==========
  const renderInfraredSendScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">📶 赤外線送信</div>
      <div style={{ padding: 12, textAlign: "center" }}>
        {/* 赤外線アニメーション */}
        <div style={{
          width: 60, height: 60, margin: "0 auto 12px",
          borderRadius: "50%",
          background: irCountdown > 0
            ? "radial-gradient(circle, #ff4444 0%, #cc0000 50%, #880000 100%)"
            : "radial-gradient(circle, #666 0%, #333 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: irCountdown > 0 ? "0 0 20px rgba(255,0,0,0.4)" : "none",
          animation: irCountdown > 0 ? "cursorBlink 1s steps(1) infinite" : "none",
        }}>
          <div style={{ fontSize: "24px" }}>📶</div>
        </div>

        {irCode ? (
          <>
            <div style={{ fontSize: "9px", opacity: 0.6, marginBottom: 4 }}>
              このコードを相手に伝えてね
            </div>
            <div style={{
              fontSize: "28px", fontWeight: "bold", letterSpacing: 8,
              padding: "8px 0", fontFamily: "monospace",
              color: irCountdown > 0 ? "inherit" : "rgba(0,0,0,0.3)",
            }}>
              {irCode}
            </div>
            <div style={{
              fontSize: "10px",
              color: irCountdown > 30 ? "inherit" : (colorMode ? "#c33" : "inherit"),
              marginTop: 4,
            }}>
              {irCountdown > 0
                ? `⬇ 残り ${Math.floor(irCountdown / 60)}:${String(irCountdown % 60).padStart(2, "0")}`
                : "⚠ 期限切れ… 戻ってもう一度やってね"}
            </div>
            {/* プログレスバー */}
            <div style={{ marginTop: 12, height: 4, background: "rgba(0,0,0,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 1s linear",
                width: `${Math.max(0, (irCountdown / 120) * 100)}%`,
                background: irCountdown > 30 ? (colorMode ? "#4466aa" : "#888") : (colorMode ? "#cc3333" : "#666"),
              }} />
            </div>
          </>
        ) : (
          <div style={{ fontSize: "10px", opacity: 0.5, padding: 12 }}>
            コードを生成中...
          </div>
        )}
      </div>
    </div>
  );

  // ========== INFRARED RECEIVE SCREEN ==========
  const handleInfraredReceive = useCallback(async () => {
    let code = irInputCode;
    if (toggleState.text) {
      code += toggleState.text;
      setIrInputCode(code);
      setToggleState(createInitialState("", "number"));
    }
    if (!code.trim() || code.length < 6) return;
    setIrLoading(true);
    try {
      const res = await fetch(`/api/infrared?code=${encodeURIComponent(code)}&receiver=${encodeURIComponent(user?.virtual_email || "")}`);
      if (res.ok) {
        const data = await res.json();
        setIrResult(data);
      }
    } catch {
      setIrResult({ found: false, message: "通信エラーです" });
    }
    setIrLoading(false);
  }, [irInputCode, toggleState, user]);

  const renderInfraredReceiveScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">📱 赤外線受信</div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: "10px", marginBottom: 8, opacity: 0.7, textAlign: "center" }}>
          相手から教えてもらった<br/>6ケタのコードを入力してね
        </div>

        {/* コード入力欄 */}
        <div style={{
          background: "rgba(0,0,0,0.05)",
          padding: "8px",
          borderRadius: 2,
          fontSize: "24px",
          fontFamily: "monospace",
          letterSpacing: 8,
          textAlign: "center",
          marginBottom: 8,
          border: "1px solid rgba(0,0,0,0.1)",
          minHeight: 36,
        }}>
          {irInputCode}
          <span className="cursor-blink" />
        </div>

        {/* 入力ドット表示 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 10 }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{
              width: 10, height: 3, borderRadius: 1,
              background: irInputCode.length > i ? (colorMode ? "#4466aa" : "#888") : "rgba(0,0,0,0.1)",
            }} />
          ))}
        </div>

        {/* 受信ボタン */}
        <div
          className="menu-item selected"
          style={{ justifyContent: "center", padding: "6px 0", marginBottom: 8 }}
          onClick={handleInfraredReceive}
        >
          <div className="icon">📡</div>
          <div className="label" style={{ fontSize: "11px" }}>受信する</div>
        </div>

        {irLoading && (
          <div style={{ textAlign: "center", fontSize: "10px", opacity: 0.5, padding: 8 }}>
            通信中...
          </div>
        )}

        {irResult && !irLoading && (
          irResult.found ? (
            <div style={{ textAlign: "center", padding: 8, background: "rgba(0,100,0,0.05)", borderRadius: 4, marginTop: 4 }}>
              <div style={{ fontSize: "20px", marginBottom: 4 }}>✨</div>
              <div style={{ fontSize: "11px", fontWeight: "bold" }}>連絡先を受信しました！</div>
              <div style={{ fontSize: "10px", marginTop: 4 }}>
                {irResult.sender?.name || ""}
              </div>
              <div style={{ fontSize: "8px", opacity: 0.5, marginTop: 2 }}>
                {irResult.sender?.email || ""}
              </div>
              <div
                className="menu-item selected"
                style={{ justifyContent: "center", padding: "6px 0", marginTop: 8 }}
                onClick={() => {
                  if (irResult.sender) {
                    setComposeTo(irResult.sender.email.split("@")[0]);
                    setComposeSubject(""); setComposeBody("");
                    setComposeImage(null); setComposeImagePreviewUrl(null);
                    setComposeField("subject"); setToggleState(createInitialState());
                    pushScreen("compose");
                  }
                }}
              >
                <div className="icon">📧</div>
                <div className="label" style={{ fontSize: "11px" }}>早速ﾒｰﾙを書く！</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: "10px", padding: 8, color: colorMode ? "#c33" : "inherit" }}>
              {irResult.message || "見つかりませんでした"}
            </div>
          )
        )}
      </div>
    </div>
  );

  const renderAddressBookScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">📖 ｱﾄﾞﾚｽ帳 ({ALL_NPCS.length}件)</div>
      <div className="viewport-scroll">
        {ALL_NPCS.map((npc, i) => (
          <div key={npc.email} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
            onClick={() => {
              setSelectedIndex(i);
              setSelectedContact(npc);
              pushScreen("addressDetail");
            }}>
            <div className="icon" style={{ fontSize: "16px" }}>👤</div>
            <div className="label">
              <div style={{ fontSize: "11px", fontWeight: "bold" }}>{npc.displayName}</div>
              <div style={{ fontSize: "8px", opacity: 0.5 }}>{npc.email}</div>
            </div>
          </div>
        ))}
        {/* 赤外線通信 & 番号検索ボタン */}
        <div style={{ borderTop: "1px dashed rgba(0,0,0,0.15)", marginTop: 6, paddingTop: 6 }}>
          {/* 赤外線送信 */}
          <div className={`menu-item ${selectedIndex === ALL_NPCS.length ? "selected" : ""}`}
            onClick={async () => {
              setIrCode(""); setIrCountdown(-1); setIrResult(null);
              pushScreen("infraredSend");
              // コード発行
              try {
                const res = await fetch("/api/infrared", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ senderEmail: user?.virtual_email, senderName: user?.display_name }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setIrCode(data.code);
                  setIrCountdown(data.expiresIn || 120);
                  // カウントダウン開始
                  if (irTimerRef.current) clearInterval(irTimerRef.current);
                  irTimerRef.current = setInterval(() => {
                    setIrCountdown(p => {
                      if (p <= 1) {
                        if (irTimerRef.current) clearInterval(irTimerRef.current);
                        return 0;
                      }
                      return p - 1;
                    });
                  }, 1000);
                }
              } catch {}
            }}>
            <div className="icon" style={{ fontSize: "16px" }}>📶</div>
            <div className="label">
              <div style={{ fontSize: "11px", fontWeight: "bold" }}>赤外線送信</div>
              <div style={{ fontSize: "8px", opacity: 0.5 }}>自分のコードを表示</div>
            </div>
          </div>
          {/* 赤外線受信 */}
          <div className={`menu-item ${selectedIndex === ALL_NPCS.length + 1 ? "selected" : ""}`}
            onClick={() => {
              setIrInputCode(""); setIrResult(null); setIrLoading(false);
              setToggleState(createInitialState("", "number"));
              pushScreen("infraredReceive");
            }}>
            <div className="icon" style={{ fontSize: "16px" }}>📱</div>
            <div className="label">
              <div style={{ fontSize: "11px", fontWeight: "bold" }}>赤外線受信</div>
              <div style={{ fontSize: "8px", opacity: 0.5 }}>相手のコードを入力</div>
            </div>
          </div>
          {/* 番号検索 */}
          <div className={`menu-item ${selectedIndex === ALL_NPCS.length + 2 ? "selected" : ""}`}
            onClick={() => {
              setSearchQuery(""); setSearchResults([]);
              setToggleState(createInitialState("", "number"));
              pushScreen("userSearch");
            }}>
            <div className="icon" style={{ fontSize: "16px" }}>🔍</div>
            <div className="label">
              <div style={{ fontSize: "11px", fontWeight: "bold" }}>番号検索</div>
              <div style={{ fontSize: "8px", opacity: 0.5 }}>4ケタの番号で探す</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAddressDetailScreen = () => {
    if (!selectedContact) return null;
    return (
      <div className="screen-enter">
        <div className="screen-title">📖 連絡先詳細</div>
        <div style={{ padding: 12 }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontSize: "28px", marginBottom: 2 }}>👤</div>
            <div style={{ fontSize: "13px", fontWeight: "bold" }}>{selectedContact.displayName}</div>
          </div>
          <div className="mail-header" style={{ borderBottom: "none" }}>
            <div className="row"><span className="label">ﾒｰﾙ</span><span style={{ fontSize: "10px" }}>{selectedContact.email}</span></div>
            <div className="row"><span className="label">ｸﾞﾙｰﾌﾟ</span><span style={{ fontSize: "10px" }}>友達</span></div>
            <div className="row"><span className="label">ﾒﾓ</span><span style={{ fontSize: "10px" }}>{selectedContact.personality === "gyaru" ? "渋谷109が好き♪" : "ｾﾝﾀｰ街によくいる"}</span></div>
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { label: "📧 ﾒｰﾙを書く", idx: 0 },
              { label: "📖 ﾒｰﾙ履歴", idx: 1 },
            ].map(({label, idx}) => (
              <div key={idx} className={`menu-item ${selectedIndex === idx ? "selected" : ""}`}
                onClick={() => {
                  setSelectedIndex(idx);
                  if (idx === 0) {
                    setComposeTo(selectedContact.email.split("@")[0]);
                    setComposeSubject(""); setComposeBody("");
                    setComposeImage(null); setComposeImagePreviewUrl(null);
                    setComposeField("subject"); setToggleState(createInitialState());
                    pushScreen("compose");
                  } else if (idx === 1) {
                    // メール履歴: そのNPCとのやりとりを個別メッセージとして表示
                    const historyMessages = [
                      ...messages.filter(m => m.sender_email === selectedContact.email),
                      ...sentMessages.filter(m => m.receiver_email === selectedContact.email),
                    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    if (historyMessages.length > 0) {
                      setSelectedMessage(historyMessages[0]);
                      pushScreen("messageDetail");
                    } else {
                      // 履歴がない場合のフィードバック
                      setSelectedMessage({ id: "empty", sender_email: selectedContact.email, receiver_email: "", subject: "履歴なし", body: `${selectedContact.displayName}とのﾒｰﾙ履歴はまだありません。\n\nﾒｰﾙを書いてみよう！`, is_read: true, created_at: new Date().toISOString() });
                      pushScreen("messageDetail");
                    }
                  }
                }}>
                <div className="label" style={{ fontSize: "11px" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const softKeys = getSoftKeys();

  /* ============================================
     MAIN RENDER
     ============================================ */
  return (
    <div className={`app-shell ${colorMode ? "lcd-color-mode" : ""}`}>
      {/* ===== 上部: ディスプレイ領域 (55%) ===== */}
      <div className="display-area">
        <div className="lcd-container">
          <div className="lcd-screen">
            {/* Status Bar */}
            <div className="status-bar">
              <div className="left">
                <div className="antenna"><div className="bar" /><div className="bar" /><div className="bar" /></div>
                <span style={{ fontSize: "8px" }}>motephon</span>
              </div>
              <div className="center">{clock}</div>
              <div className="right">
                {mannerMode && <span style={{ fontSize: "9px" }}>🔇</span>}
                {unreadCount > 0 && <span className="envelope-icon">✉</span>}
                <div className="battery"><div className="battery-body"><div className="cell" /><div className="cell" /><div className="cell" /></div><div className="battery-tip" /></div>
              </div>
            </div>

            {/* Viewport */}
            <div className="main-viewport" style={{ fontSize: `${10 * fontScale}px`, opacity: screen === "idle" ? 1 : brightnessOpacity }}>{renderScreen()}</div>

            {/* Soft Key Bar */}
            <div className="softkey-bar">
              <div className="key" onClick={handleSoftKeyLeft}>{softKeys[0]}</div>
              <div className="key center" onClick={handleSelect}>{softKeys[1]}</div>
              <div className="key" onClick={handleSoftKeyRight}>{softKeys[2]}</div>
            </div>
          </div>
        </div>

        {/* New mail notification */}
        {newMailNotification && (
          <div className="new-mail-popup">
            <span className="envelope-icon">✉</span><br />新着ﾒｰﾙ受信
          </div>
        )}
        {/* Action toast (送信完了等) */}
        {actionToast && (
          <div className="new-mail-popup" style={{ background: "rgba(0,80,0,0.85)", color: "#9ce89c" }}>
            {actionToast}
          </div>
        )}
      </div>

      {/* ===== 下部: キーボード領域 (45%) ===== */}
      <div className="keypad-area">
        {/* 入力インジケーター */}
        {isInputActive && (
          <div className="input-indicator">
            <div className="input-mode-badge" onClick={handleModeChange}>
              {getModeLabel(toggleState.mode)}
            </div>
            {candidates && (
              <div className="composing-chars">
                {candidates.map((c, i) => (
                  <span key={i} className={`composing-char ${i === toggleState.currentIndex ? "active" : ""}`}>{c}</span>
                ))}
              </div>
            )}
            <div style={{ fontSize: "8px", cursor: "pointer" }} onClick={handleBackspace}>
              ← 削除
            </div>
          </div>
        )}

        {/* 上段: ソフトキー + D-pad */}
        <div className="keypad-top">
          <button className="soft-btn" onClick={handleSoftKeyLeft}>
            {softKeys[0] || "◁"}
          </button>

          <div className="dpad-container">
            <div className="dpad-ring" />
            <button className="dpad-btn up" onClick={handleDpadUp}>▲</button>
            <button className="dpad-btn down" onClick={handleDpadDown}>▼</button>
            <button className="dpad-btn left" onClick={handleDpadLeft}>◀</button>
            <button className="dpad-btn right" onClick={handleDpadRight}>▶</button>
            <button className="dpad-center" onClick={handleSelect}>OK</button>
          </div>

          <button className="soft-btn" onClick={handleSoftKeyRight}>
            {softKeys[2] || "▷"}
          </button>
        </div>

        {/* 下段: 12キー */}
        <div className="numpad">
          {KEY_LABELS[isInputActive ? toggleState.mode : "number"].map(({ key, label, sub }) => (
            <button
              key={key}
              className="num-key"
              onClick={() => handleNumpadKey(key)}
            >
              <span className="key-num">{isInputActive ? label : key}</span>
              <span className="key-chars">{isInputActive ? sub : ""}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
