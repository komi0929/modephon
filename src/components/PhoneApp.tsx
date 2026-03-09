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
  KEY_MAP,
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
  | "camera"
  | "internet"
  | "dataFolder"
  | "profile";

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
    receiver_email: "user@j-phone.ne.jp",
    subject: NPC_GYARU.welcomeMessage.subject,
    body: NPC_GYARU.welcomeMessage.body,
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    sender_email: NPC_GYARUO.email,
    receiver_email: "user@j-phone.ne.jp",
    subject: NPC_GYARUO.welcomeMessage.subject,
    body: NPC_GYARUO.welcomeMessage.body,
    is_read: false,
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
];

/* Key labels for the 12-key pad */
const NUMPAD_KEYS = [
  { key: "1", label: "あ", sub: "あいうえお" },
  { key: "2", label: "か", sub: "かきくけこ" },
  { key: "3", label: "さ", sub: "さしすせそ" },
  { key: "4", label: "た", sub: "たちつてと" },
  { key: "5", label: "な", sub: "なにぬねの" },
  { key: "6", label: "は", sub: "はひふへほ" },
  { key: "7", label: "ま", sub: "まみむめも" },
  { key: "8", label: "や", sub: "やゆよ" },
  { key: "9", label: "ら", sub: "らりるれろ" },
  { key: "*", label: "記号", sub: "。、!?" },
  { key: "0", label: "わ", sub: "わをんー" },
  { key: "#", label: "空白", sub: "" },
];

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
  const [colorMode, setColorMode] = useState(true);

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
  const [toggleState, setToggleState] = useState<ToggleInputState>(createInitialState());
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
    return false;
  }, [screen, composeField]);

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
    }
    setToggleState(createInitialState());
  }, [toggleState, screen, regField, composeField]);

  // --- Handle numpad key press ---
  const handleNumpadKey = useCallback((key: string) => {
    if (!isInputActive) return;

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
  }, [isInputActive]);

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
    setSelectedIndex((prev) => prev + 1);
  }, [isInputActive, screen, composeField, flushToggleInput]);

  const handleDpadLeft = useCallback(() => {
    if (isInputActive) return;
    if (screen === "mainMenu") setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, [isInputActive, screen]);

  const handleDpadRight = useCallback(() => {
    if (isInputActive) return;
    if (screen === "mainMenu") setSelectedIndex((prev) => prev + 1);
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
        handleMainMenuSelect();
        break;
      case "inbox":
        if (messages.length > 0) {
          const idx = Math.min(selectedIndex, messages.length - 1);
          const msg = messages[idx];
          setSelectedMessage(msg);
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m)));
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
        if (selectedIndex === 0) setColorMode((prev) => !prev);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedIndex, messages, sentMessages, isInputActive, toggleState]);

  const handleMainMenuSelect = useCallback(() => {
    const items = ["inbox", "compose", "outbox", "camera", "addressBook", "internet", "settings", "data", "profile"] as const;
    const idx = Math.min(selectedIndex, items.length - 1);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // --- Register ---
  const handleRegister = useCallback(async () => {
    let username = regUsername;
    let password = regPassword;
    if (toggleState.text) {
      if (regField === "email") username += toggleState.text;
      else password += toggleState.text;
      setToggleState(createInitialState());
    }

    if (regStep === "email") {
      if (regField === "email") {
        if (!username.trim()) { setRegError("ﾒｰﾙｱﾄﾞﾚｽを入力"); return; }
        setRegUsername(username);
        setRegStep("password");
        setRegField("password");
        setRegError("");
        setToggleState(createInitialState());
        return;
      }
    }

    if (!password.trim() || password.length < 6) {
      setRegError("ﾊﾟｽﾜｰﾄﾞは6文字以上"); return;
    }
    setRegPassword(password);

    const virtualEmail = `${username}@j-phone.ne.jp`;
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: `${username}@motephon.app`, password });
        if (error) {
          if (error.message.includes("placeholder") || error.message.includes("fetch")) { enterDemoMode(virtualEmail, username); return; }
          setRegError(error.message); return;
        }
        if (data.user) {
          const { data: profile } = await supabase.from("users").select("*").eq("id", data.user.id).single();
          const u: UserProfile = profile ? { id: data.user.id, virtual_email: profile.virtual_email, display_name: profile.display_name } : { id: data.user.id, virtual_email: virtualEmail, display_name: username };
          setUser(u);
          await loadMessages(u.virtual_email);
          setScreen("idle");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: `${username}@motephon.app`, password });
        if (error) {
          if (error.message.includes("placeholder") || error.message.includes("fetch")) { enterDemoMode(virtualEmail, username); return; }
          if (error.message.includes("already registered")) { setRegError("既に登録済み。ﾛｸﾞｲﾝに切替"); setIsLogin(true); return; }
          setRegError(error.message); return;
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

    if (!to.trim() || !body.trim()) return;
    setComposeSending(true);

    const receiverEmail = to.includes("@") ? to : `${to}@j-phone.ne.jp`;
    const newMsg: Message = {
      id: `sent-${Date.now()}`,
      sender_email: user?.virtual_email || "user@j-phone.ne.jp",
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
        const res = await fetch("/api/npc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ npcEmail: npc.email, userMessage: body }) });
        if (res.ok) {
          const data = await res.json();
          latencyQueue.enqueue({ id: `npc-reply-${Date.now()}`, sender_email: npc.email, receiver_email: user?.virtual_email || "", subject: `Re: ${newMsg.subject}`, body: data.reply, is_read: false, created_at: new Date().toISOString() });
        } else { generateFallbackNpcReply(npc.email, newMsg); }
      } catch { generateFallbackNpcReply(npc.email, newMsg); }
    }
    setComposeSending(false);
    popScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeTo, composeSubject, composeBody, composeImage, composeImagePreviewUrl, composeField, toggleState, user, supabase, latencyQueue, popScreen]);

  const generateFallbackNpcReply = useCallback((npcEmail: string, originalMsg: Message) => {
    const isGyaru = npcEmail === NPC_GYARU.email;
    const replies = isGyaru
      ? [`ぇ～ﾏﾁﾞで!?\nｳｹﾙんだけどww\n\nまたﾒｰﾙしてねぇ♪\n(^_^)v☆`, `ぉ返事ありがとぉ!!\nﾁｮｰ嬉しぃ～\n(≧∇≦)\n\nぁたしも写メ\n撮ったょ～♪♪`, `ﾏﾁﾞﾏﾁﾞ!?\nそれﾔﾊﾞｲんだけど!!\nwww\n\n今度ﾌﾟﾘ撮ろ～\n(*^o^*)`]
      : [`ﾏﾁﾞかょ～!!\nｳｹﾙww\n\nまたﾒｰﾙ\nしてこいよ～!\n('-'*)`, `ｵｯｽ!!\n返事ﾄﾞｰﾓ!!\n\n今ﾊﾟﾗﾊﾟﾗの\n練習中だし!!\n(笑)`, `ﾁｮｰ最高じゃね!?\nwww\n\n今度ｾﾝﾀｰ街\n行こうぜ～!!\n(\`・ω・´)`];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    latencyQueue.enqueue({ id: `npc-fallback-${Date.now()}`, sender_email: npcEmail, receiver_email: user?.virtual_email || "", subject: `Re: ${originalMsg.subject}`, body: reply, is_read: false, created_at: new Date().toISOString() });
  }, [latencyQueue, user]);

  // --- Image attachment ---
  const handleImageAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComposeImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setComposeImagePreviewUrl(url);
      if (imageCanvasRef.current) {
        renderProgressiveImage(imageCanvasRef.current, url, { maxWidth: 120, maxHeight: 90, sliceHeight: 2, delayMs: 30 });
      }
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
      case "camera": case "internet": case "dataFolder": case "profile":
        return ["戻る", "", ""];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      case "camera": return renderCameraScreen();
      case "internet": return renderInternetScreen();
      case "dataFolder": return renderDataScreen();
      case "profile": return renderProfileScreen();
      default: return null;
    }
  };

  const renderRegisterScreen = () => (
    <div className="auth-screen screen-enter">
      <div className="title">J-PHONE</div>
      <div style={{ fontSize: "9px", opacity: 0.5, marginBottom: 8 }}>写ﾒｰﾙ ﾈｯﾄﾜｰｸ</div>
      <div style={{ fontSize: "10px", width: "100%", textAlign: "left", marginBottom: 4 }}>
        {regStep === "email" ? "ﾒｰﾙｱﾄﾞﾚｽ設定" : "ﾊﾟｽﾜｰﾄﾞ設定"}
        {isLogin && <span style={{ fontSize: "8px", opacity: 0.7 }}> (ﾛｸﾞｲﾝ)</span>}
      </div>
      {regStep === "email" ? (
        <>
          <div className={`auth-field-value ${regField === "email" ? "active" : ""}`}
            onClick={() => setRegField("email")}>
            {getFieldDisplay(regUsername, "email")}
            {regField === "email" && <span className="cursor-blink" />}
          </div>
          <div className="domain" style={{ width: "100%", textAlign: "right", fontSize: "10px", opacity: 0.5 }}>
            @j-phone.ne.jp
          </div>
        </>
      ) : (
        <div className={`auth-field-value ${regField === "password" ? "active" : ""}`}
          onClick={() => setRegField("password")}>
          {"●".repeat(getFieldDisplay(regPassword, "password").length)}
          {regField === "password" && <span className="cursor-blink" />}
        </div>
      )}
      {regError && <div className="error-text">{regError}</div>}
      <div style={{ fontSize: "8px", opacity: 0.3, marginTop: 8 }}>※下のｷｰで入力 / 決定で次へ</div>
      <div style={{ fontSize: "8px", opacity: 0.5, marginTop: 4, cursor: "pointer", textDecoration: "underline" }}
        onClick={() => { setIsLogin((p) => !p); setRegError(""); }}>
        {isLogin ? "新規登録に切替" : "ﾛｸﾞｲﾝに切替"}
      </div>
    </div>
  );

  const renderIdleScreen = () => (
    <div className="idle-screen screen-enter">
      <div className="idle-clock">{clock}</div>
      <div className="idle-date">{dateStr}</div>
      <div className="idle-carrier">J-PHONE</div>
      {unreadCount > 0 && (
        <div className="idle-notification">
          <span className="envelope-icon">✉</span> 新着ﾒｰﾙ {unreadCount}件
        </div>
      )}
    </div>
  );

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
              onClick={() => { setSelectedIndex(i); handleMainMenuSelect(); }}>
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
      <div className="screen-title">受信BOX ({messages.length})</div>
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
      <div className="screen-title">送信BOX ({sentMessages.length})</div>
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
        <div className="compose-body-area" onClick={() => { flushToggleInput(); setComposeField("body"); setToggleState(createInitialState()); }}
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

  const renderSettingsScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">設定</div>
      {[
        { label: "画面ﾓｰﾄﾞ", value: colorMode ? "ｶﾗｰ(TFT)" : "ﾓﾉｸﾛ(STN)" },
        { label: "ﾏｲｱﾄﾞﾚｽ", value: user?.virtual_email || "--" },
        { label: "ﾊﾞｰｼﾞｮﾝ", value: "v2.0.0" },
      ].map((item, i) => (
        <div key={i} className={`settings-item ${selectedIndex === i ? "selected" : ""}`}
          onClick={() => { setSelectedIndex(i); if (i === 0) setColorMode((p) => !p); }}>
          <span>{item.label}</span>
          <span className="value">{item.value}</span>
        </div>
      ))}
    </div>
  );

  const renderCameraScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">ｶﾒﾗ</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "70%", gap: 8 }}>
        <div style={{ width: "80%", aspectRatio: "4/3", background: "#000", border: "1px solid #444", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2 }}>
          <div style={{ fontSize: "10px", color: "#666" }}>📷 ﾌｧｲﾝﾀﾞｰ</div>
        </div>
        <div style={{ fontSize: "9px", opacity: 0.5 }}>添付ﾌｧｲﾙは作成画面から追加</div>
      </div>
    </div>
  );

  const renderInternetScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">ｲﾝﾀｰﾈｯﾄ</div>
      <div style={{ padding: 12, textAlign: "center" }}>
        <div style={{ fontSize: "12px", marginBottom: 8 }}>J-SKY web</div>
        <div style={{ fontSize: "10px", opacity: 0.6, marginBottom: 12 }}>ﾎﾟｰﾀﾙｻｲﾄ</div>
        {["Yahoo!ｹｰﾀｲ", "天気予報", "ﾆｭｰｽ", "着ﾒﾛ♪", "待受画像", "占い"].map((item, i) => (
          <div key={i} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
            onClick={() => setSelectedIndex(i)}>
            <div className="icon">{["🔍", "☀", "📰", "🎵", "🖼", "🔮"][i]}</div>
            <div className="label" style={{ fontSize: "11px" }}>{item}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderDataScreen = () => {
    const imgCount = sentMessages.filter((m) => m.image_url).length + messages.filter((m) => m.image_url).length;
    return (
      <div className="screen-enter">
        <div className="screen-title">ﾃﾞｰﾀ</div>
        {[
          { icon: "📨", label: "受信ﾒｰﾙ", value: `${messages.length}件` },
          { icon: "📤", label: "送信ﾒｰﾙ", value: `${sentMessages.length}件` },
          { icon: "🖼", label: "画像", value: `${imgCount}件` },
          { icon: "📊", label: "使用容量", value: `${Math.round((messages.length + sentMessages.length) * 0.8)}KB` },
        ].map((item, i) => (
          <div key={i} className={`settings-item ${selectedIndex === i ? "selected" : ""}`}
            onClick={() => setSelectedIndex(i)}>
            <span>{item.icon} {item.label}</span>
            <span className="value">{item.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderProfileScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">ﾌﾟﾛﾌｨｰﾙ</div>
      <div style={{ padding: 12 }}>
        <div style={{ textAlign: "center", fontSize: "24px", marginBottom: 8 }}>👤</div>
        {[
          { label: "名前", value: user?.display_name || "--" },
          { label: "ｱﾄﾞﾚｽ", value: user?.virtual_email || "--" },
          { label: "端末", value: "J-SH51" },
          { label: "ｷｬﾘｱ", value: "J-PHONE" },
        ].map((item, i) => (
          <div key={i} className="settings-item" style={{ cursor: "default" }}>
            <span>{item.label}</span>
            <span className="value" style={{ fontSize: "10px" }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAddressBookScreen = () => (
    <div className="screen-enter">
      <div className="screen-title">ｱﾄﾞﾚｽ帳</div>
      {ALL_NPCS.map((npc, i) => (
        <div key={npc.email} className={`menu-item ${selectedIndex === i ? "selected" : ""}`}
          onClick={() => {
            setSelectedIndex(i);
            setComposeTo(npc.email.split("@")[0]); setComposeSubject(""); setComposeBody("");
            setComposeImage(null); setComposeImagePreviewUrl(null);
            setComposeField("subject"); setToggleState(createInitialState());
            pushScreen("compose");
          }}>
          <div className="icon">👤</div>
          <div className="label">
            <div style={{ fontSize: "11px" }}>{npc.displayName}</div>
            <div style={{ fontSize: "8px", opacity: 0.5 }}>{npc.email}</div>
          </div>
        </div>
      ))}
    </div>
  );

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
                <span style={{ fontSize: "8px" }}>J-PHONE</span>
              </div>
              <div className="center">{clock}</div>
              <div className="right">
                {unreadCount > 0 && <span className="envelope-icon">✉</span>}
                <div className="battery"><div className="battery-body"><div className="cell" /><div className="cell" /><div className="cell" /></div><div className="battery-tip" /></div>
              </div>
            </div>

            {/* Viewport */}
            <div className="main-viewport">{renderScreen()}</div>

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
          {NUMPAD_KEYS.map(({ key, label, sub }) => (
            <button
              key={key}
              className="num-key"
              onClick={() => handleNumpadKey(key)}
            >
              <span className="key-num">{isInputActive && toggleState.mode === "hiragana" ? label : key}</span>
              <span className="key-chars">{isInputActive ? (toggleState.mode === "hiragana" ? sub : (KEY_MAP[key] || []).slice(0, 5).join("")) : ""}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
