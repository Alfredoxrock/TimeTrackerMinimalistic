import AsyncStorage from "@react-native-async-storage/async-storage";
import { DMMono_400Regular, DMMono_500Medium, useFonts as useDMMono } from "@expo-google-fonts/dm-mono";
import { PlayfairDisplay_700Bold, useFonts as usePlayfair } from "@expo-google-fonts/playfair-display";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line as SvgLine, Rect, Text as SvgText } from "react-native-svg";

const { width, height } = Dimensions.get("window");

//  Color system 
const C = {
  bg: "#0a0a0f",
  surface: "#13131a",
  rim: "#1e1e2e",
  text: "#e8e4d9",
  muted: "#5a5870",
  accent: "#c8b8ff",
  pulse: "#ff6b6b",
};

//  Types 
type TaskConfig = { id: string; label: string; emoji: string; color: string };
type TaskState = { accumulated: number; startTimestamp?: number; running: boolean };
type AllTasks = Record<string, TaskState>;
type HistoryEntry = { id: string; start: number; end: number };

//  Default tasks 
const DEFAULT_TASKS: TaskConfig[] = [
  { id: "reading", label: "Reading", emoji: "\uD83D\uDCD6", color: "#5b9cf6" },
  { id: "writing", label: "Writing", emoji: "\u270D\uFE0F", color: "#ffd93d" },
  { id: "cooking", label: "Cooking", emoji: "\uD83C\uDF73", color: "#ff6b6b" },
  { id: "exercise", label: "Exercise", emoji: "\uD83C\uDFC3", color: "#6bcb77" },
  { id: "work", label: "Work", emoji: "\uD83D\uDCBB", color: "#a78bfa" },
  { id: "learning", label: "Learning", emoji: "\uD83C\uDF93", color: "#22d3ee" },
  { id: "rest", label: "Rest", emoji: "\uD83D\uDECF\uFE0F", color: "#94a3b8" },
  { id: "social", label: "Social", emoji: "\uD83D\uDE42", color: "#fb923c" },
  { id: "creative", label: "Creative", emoji: "\uD83C\uDFA8", color: "#f472b6" },
];

const PALETTE: string[] = [
  "#5b9cf6", "#ffd93d", "#ff6b6b", "#6bcb77", "#a78bfa", "#22d3ee", "#94a3b8", "#fb923c", "#f472b6",
];

const EMOJI_LIST = [
  "\uD83D\uDCD6", "\u270D\uFE0F", "\uD83C\uDF73", "\uD83C\uDFC3",
  "\uD83D\uDCBB", "\uD83C\uDF93", "\uD83D\uDECF\uFE0F", "\uD83D\uDE42",
  "\uD83C\uDFA8", "\uD83D\uDD2C", "\uD83C\uDFAF", "\uD83D\uDCDD",
  "\uD83D\uDCA1", "\uD83C\uDF31", "\uD83D\uDE80", "\uD83C\uDFB5",
  "\uD83D\uDCAA", "\u2764\uFE0F", "\uD83C\uDF0D", "\uD83C\uDFB8",
];

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// ─── Feature flags ───────────────────────────────────────────────────────────
const DEBUG_CLOCK = true; // ← set false to hide 24h labels
const DEBUG_SEGMENTS = false; // set true to log segment start/end + computed arc values

// ─── Clock ring helpers ──────────────────────────────────────────────────────
const ring = (r: number) => ({ r, circ: 2 * Math.PI * r });
const H_RING = ring(112);
const M_RING = ring(93);
const S_RING = ring(74);
const arc = (circ: number, p: number) => circ * (1 - Math.max(0, Math.min(1, p)));
// arc segment: from/to are 0-1 fractions of full circle, result is [dashArray, dashOffset]
const arcSeg = (circ: number, from: number, to: number): [string, number] => {
  const len = Math.max(0, to - from) * circ;
  return [`${len} ${circ - len}`, circ * (1 - Math.max(0, from))];
};
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dateKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const heatColor = (seconds: number): string => {
  if (seconds <= 0) return C.rim;
  if (seconds < 1800) return "#2d2050";
  if (seconds < 7200) return "#5b3fa0";
  if (seconds < 14400) return "#8b6fd4";
  return C.accent;
};
const hexToRgba = (hex: string, a: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const taskHeatColor = (seconds: number, color: string): string => {
  if (seconds <= 0) return C.rim;
  if (seconds < 1800) return hexToRgba(color, 0.25);
  if (seconds < 7200) return hexToRgba(color, 0.5);
  if (seconds < 14400) return hexToRgba(color, 0.75);
  return color;
};
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const MON_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Time formatting ─────────────────────────────────────────────────────────
const fmtTime = (s: number): string => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h < 10) return `${h}h ${m}m`;
  return `${h}h`;
};
const fmt = (n: number) => String(n).padStart(2, "0");
const fmtTotal = (s: number): string => {
  if (s <= 0) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m tracked` : `${m}m tracked`;
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [dmLoaded] = useDMMono({ DMMono_400Regular, DMMono_500Medium });
  const [pfLoaded] = usePlayfair({ PlayfairDisplay_700Bold });

  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>(DEFAULT_TASKS);
  const [tasks, setTasks] = useState<AllTasks>(() =>
    Object.fromEntries(DEFAULT_TASKS.map(t => [t.id, { accumulated: 0, running: false }]))
  );
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dayHistory, setDayHistory] = useState<HistoryEntry[]>([]);
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({});
  // per-task per-day seconds: taskId -> dateKey -> seconds
  const [taskDailyTotals, setTaskDailyTotals] = useState<Record<string, Record<string, number>>>({});
  // which task circle is selected for heatmap filtering (null = all combined)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // per-day histories for the week view: storage key -> HistoryEntry[]
  const [weekHistories, setWeekHistories] = useState<Record<string, HistoryEntry[]>>({});
  const [viewIndex, setViewIndex] = useState(0); // 0=clock 1=week 2=month 3=year
  const viewIndexRef = useRef(0);
  const prevDayKeyRef = useRef(dateKey(Date.now()));
  const setView = (n: number) => { viewIndexRef.current = n; setViewIndex(n); };
  const [PREMIUM, setPremium] = useState(false);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        const cur = viewIndexRef.current;
        if (g.dx < -40 && cur < 3) { viewIndexRef.current = cur + 1; setViewIndex(cur + 1); }
        else if (g.dx > 40 && cur > 0) { viewIndexRef.current = cur - 1; setViewIndex(cur - 1); }
      },
    })
  ).current;

  // Edit modal state
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editEmoji, setEditEmoji] = useState(EMOJI_LIST[0]);
  const [editColorIdx, setEditColorIdx] = useState(0);

  // Add-circle modal state (premium only)
  const [addCircleVisible, setAddCircleVisible] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState(EMOJI_LIST[0]);
  const [newColorIdx, setNewColorIdx] = useState(0);

  // Help modal state
  const [helpVisible, setHelpVisible] = useState(false);

  // Title edit state
  const [titleValue, setTitleValue] = useState("Day Circles");
  const [titleEditing, setTitleEditing] = useState(false);
  const titleInputRef = useRef<TextInput | null>(null);

  const commitTitle = (val: string) => {
    const trimmed = val.trim() || "Day Circles";
    setTitleValue(trimmed);
    setTitleEditing(false);
    AsyncStorage.setItem("mainTitle_v1", trimmed);
  };

  useEffect(() => {
    AsyncStorage.getItem("premium_v1").then(v => { if (v === "1") setPremium(true); });
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("tasks_v5"),
      AsyncStorage.getItem("taskConfigs_v6"),
      AsyncStorage.getItem("mainTitle_v1"),
      AsyncStorage.getItem(`dayHistory_v1_${todayStr()}`),
      AsyncStorage.getItem("dailyTotals_v1"),
      AsyncStorage.getItem("taskDailyTotals_v1"),
    ]).then(([st, sc, title, hist, dt, tdt]) => {
      if (sc) setTaskConfigs(JSON.parse(sc));
      if (st) setTasks(JSON.parse(st));
      if (title) setTitleValue(title);
      if (hist) {
        // Sanitise entries: clip both start to today's midnight and end to now,
        // then write the clean version back so storage is permanently fixed.
        const todayMidnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
        const nowMs = Date.now();
        const sanitised: HistoryEntry[] = (JSON.parse(hist) as HistoryEntry[])
          .map(e => ({ ...e, start: Math.max(e.start, todayMidnight), end: Math.min(e.end, nowMs) }))
          .filter(e => e.end > todayMidnight && e.end > e.start);
        setDayHistory(sanitised);
        AsyncStorage.setItem(`dayHistory_v1_${todayStr()}`, JSON.stringify(sanitised));
      }
      if (dt) setDailyTotals(JSON.parse(dt));
      if (tdt) setTaskDailyTotals(JSON.parse(tdt));
    });
    // load last 7 days of saved dayHistory into weekHistories using YYYY-MM-DD keys
    (async () => {
      const map: Record<string, HistoryEntry[]> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        // storage uses unpadded todayStr() format; memory key uses padded dateKey() format
        const storageKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const memKey = dateKey(d.getTime());
        const raw = await AsyncStorage.getItem(`dayHistory_v1_${storageKey}`);
        if (raw) {
          try { map[memKey] = JSON.parse(raw); } catch { /* ignore */ }
        }
      }
      setWeekHistories(map);
    })();
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener("change", next => {
      if (next === "active") {
        // Refresh clock when returning to app — elapsed recalculates from persisted startTimestamp
        setNow(Date.now());
      }
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, []);

  // Reset dayHistory when the day rolls over while the app is running.
  useEffect(() => {
    const curKey = dateKey(now);
    if (prevDayKeyRef.current !== curKey) {
      prevDayKeyRef.current = curKey;
      (async () => {
        const d = new Date(now);
        const storageKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const raw = await AsyncStorage.getItem(`dayHistory_v1_${storageKey}`);
        if (raw) {
          try { setDayHistory(JSON.parse(raw)); } catch { setDayHistory([]); }
          try { setWeekHistories(prev => ({ ...prev, [curKey]: JSON.parse(raw) })); } catch { /* ignore */ }
        } else {
          setDayHistory([]);
          setWeekHistories(prev => ({ ...prev, [curKey]: [] }));
        }
      })();
    }
  }, [now]);

  useEffect(() => { AsyncStorage.setItem("tasks_v5", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { AsyncStorage.setItem("taskConfigs_v6", JSON.stringify(taskConfigs)); }, [taskConfigs]);
  useEffect(() => {
    if (dayHistory.length > 0)
      AsyncStorage.setItem(`dayHistory_v1_${todayStr()}`, JSON.stringify(dayHistory));
    // keep weekHistories entry for today in sync
    setWeekHistories(prev => ({ ...prev, [dateKey(Date.now())]: dayHistory }));
  }, [dayHistory]);
  useEffect(() => {
    if (Object.keys(dailyTotals).length > 0)
      AsyncStorage.setItem("dailyTotals_v1", JSON.stringify(dailyTotals));
  }, [dailyTotals]);
  useEffect(() => {
    if (Object.keys(taskDailyTotals).length > 0)
      AsyncStorage.setItem("taskDailyTotals_v1", JSON.stringify(taskDailyTotals));
  }, [taskDailyTotals]);

  const getSeconds = (task?: TaskState): number => {
    if (!task) return 0;
    return task.running && task.startTimestamp
      ? task.accumulated + Math.max(0, Math.floor((now - task.startTimestamp) / 1000))
      : task.accumulated;
  };

  const toggleTask = (id: string) => {
    const ts = Date.now();
    const task = tasks[id] ?? { accumulated: 0, running: false };
    const newEntries: HistoryEntry[] = [];
    if (task.running) {
      if (task.startTimestamp) newEntries.push({ id, start: task.startTimestamp, end: ts });
      setTasks(prev => ({
        ...prev,
        [id]: { accumulated: task.accumulated + Math.max(0, Math.floor((ts - (task.startTimestamp ?? ts)) / 1000)), running: false },
      }));
    } else {
      const updated: AllTasks = {};
      for (const [k, v] of Object.entries(tasks)) {
        if (v.running && v.startTimestamp) {
          newEntries.push({ id: k, start: v.startTimestamp, end: ts });
          updated[k] = { accumulated: v.accumulated + Math.max(0, Math.floor((ts - v.startTimestamp) / 1000)), running: false };
        } else {
          updated[k] = v;
        }
      }
      updated[id] = { accumulated: (updated[id] ?? { accumulated: 0 }).accumulated, startTimestamp: ts, running: true };
      setTasks(() => updated);
    }
    if (newEntries.length) {
      // Split cross-midnight segments: the portion before midnight goes to the previous
      // day's storage key; only the portion from midnight onward enters today's dayHistory.
      const todayEntries: HistoryEntry[] = [];
      const prevDayMap: Record<string, HistoryEntry[]> = {};
      for (const entry of newEntries) {
        const d = new Date(entry.end);
        const endMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        if (entry.start < endMidnight) {
          // Spans midnight — clip today's portion and stash the previous-day portion.
          todayEntries.push({ id: entry.id, start: endMidnight, end: entry.end });
          const prevKey = dateKey(entry.start);
          if (!prevDayMap[prevKey]) prevDayMap[prevKey] = [];
          prevDayMap[prevKey].push({ id: entry.id, start: entry.start, end: endMidnight });
        } else {
          todayEntries.push(entry);
        }
      }

      setDayHistory(h => [...h, ...todayEntries]);
      setDailyTotals(prev => {
        const updated = { ...prev };
        for (const { start, end } of newEntries) {
          const key = dateKey(start);
          updated[key] = (updated[key] || 0) + Math.max(0, Math.floor((end - start) / 1000));
        }
        return updated;
      });
      setTaskDailyTotals(prev => {
        const updated: Record<string, Record<string, number>> = {};
        for (const k of Object.keys(prev)) updated[k] = { ...prev[k] };
        for (const { id: eid, start, end } of newEntries) {
          const key = dateKey(start);
          if (!updated[eid]) updated[eid] = {};
          updated[eid][key] = (updated[eid][key] || 0) + Math.max(0, Math.floor((end - start) / 1000));
        }
        return updated;
      });

      // Persist each previous-day slice into its own AsyncStorage key and sync weekHistories.
      if (Object.keys(prevDayMap).length > 0) {
        (async () => {
          for (const [memKey, entries] of Object.entries(prevDayMap)) {
            const d = new Date(entries[0].start);
            const storageKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const raw = await AsyncStorage.getItem(`dayHistory_v1_${storageKey}`);
            const existing: HistoryEntry[] = raw ? JSON.parse(raw) : [];
            const merged = [...existing, ...entries];
            await AsyncStorage.setItem(`dayHistory_v1_${storageKey}`, JSON.stringify(merged));
            setWeekHistories(prev => ({ ...prev, [memKey]: merged }));
          }
        })();
      }
    }
    setNow(ts);
  };

  const openEdit = (id: string) => {
    const cfg = taskConfigs.find(t => t.id === id);
    if (!cfg) return;
    setEditId(id);
    setEditLabel(cfg.label);
    setEditEmoji(cfg.emoji);
    const idx = PALETTE.indexOf(cfg.color);
    setEditColorIdx(idx >= 0 ? idx : 0);
  };

  const saveEdit = () => {
    if (!editId || !editLabel.trim()) return;
    setTaskConfigs(prev => prev.map(t =>
      t.id === editId ? { ...t, label: editLabel.trim(), emoji: editEmoji, color: PALETTE[editColorIdx] } : t
    ));
    setEditId(null);
  };

  const addCircle = () => {
    if (!newLabel.trim()) return;
    const id = `task_${Date.now()}`;
    setTaskConfigs(prev => [...prev, { id, label: newLabel.trim(), emoji: newEmoji, color: PALETTE[newColorIdx] }]);
    setTasks(prev => ({ ...prev, [id]: { accumulated: 0, running: false } }));
    setAddCircleVisible(false);
    setNewLabel("");
    setNewEmoji(EMOJI_LIST[0]);
    setNewColorIdx(0);
  };

  const resetFromEdit = () => {
    if (!editId) return;
    Alert.alert("Reset Timer", "Reset all tracked time for this task?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset", style: "destructive", onPress: () => {
          setTasks(prev => ({ ...prev, [editId]: { accumulated: 0, running: false } }));
          setEditId(null);
        }
      },
    ]);
  };

  // Derived clock values
  const nowDate = new Date(now);
  const clockH = nowDate.getHours() % 12 + nowDate.getMinutes() / 60;
  const clockM = nowDate.getMinutes() + nowDate.getSeconds() / 60;
  const clockS = nowDate.getSeconds();
  const dateStr = `${MONTHS[nowDate.getMonth()]} ${nowDate.getDate()}, ${nowDate.getFullYear()}`;
  const dayStr = DAYS[nowDate.getDay()];
  const timeStr = `${fmt(nowDate.getHours())}:${fmt(nowDate.getMinutes())}:${fmt(nowDate.getSeconds())}`;
  const totalSec = taskConfigs.reduce((s, t) => s + getSeconds(tasks[t.id]), 0);
  const activeCfg = taskConfigs.find(t => tasks[t.id]?.running) ?? null;

  // 24h color map: combine saved history + live running segment
  const dayStartMs = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const DAY_MS = 86400000;
  const liveEntry: HistoryEntry[] = activeCfg && tasks[activeCfg.id]?.startTimestamp
    ? [{ id: activeCfg.id, start: Math.max(tasks[activeCfg.id].startTimestamp!, dayStartMs), end: now }]
    : [];
  const allSegments = [...dayHistory, ...liveEntry];
  // Only keep segments that overlap today, clip start to midnight and end to now (never render future time)
  const todaySegments = allSegments
    .filter(e => e.end > dayStartMs && e.start < dayStartMs + DAY_MS)
    .map(e => ({ ...e, start: Math.max(e.start, dayStartMs), end: Math.min(e.end, now, dayStartMs + DAY_MS) }))
    .filter(e => e.end > e.start);

  // Active task elapsed arcs (M + S rings)
  const activeElapsed = activeCfg ? getSeconds(tasks[activeCfg.id]) : 0;
  const taskArcM = (Math.floor((activeElapsed % 3600) / 60)) / 60 + (activeElapsed % 60) / 3600;
  const taskArcS = (activeElapsed % 60) / 60;

  // Grid sizing — 3 per row
  const COLS = 3;
  const H_PAD = 20;
  const GAP = 10;
  const CS = Math.floor((width - H_PAD * 2 - GAP * (COLS - 1)) / COLS);

  if (!dmLoaded || !pfLoaded) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topDate}>{dateStr}</Text>
        <Text style={styles.topDay}>{dayStr}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          {titleEditing ? (
            <TextInput
              ref={titleInputRef}
              style={styles.mainTitleInput}
              value={titleValue}
              onChangeText={setTitleValue}
              onBlur={() => commitTitle(titleValue)}
              onSubmitEditing={() => commitTitle(titleValue)}
              returnKeyType="done"
              maxLength={24}
              autoFocus
              selectTextOnFocus
            />
          ) : (
            <TouchableOpacity
              onLongPress={() => {
                setTitleEditing(true);
                setTimeout(() => titleInputRef.current?.focus(), 50);
              }}
              delayLongPress={400}
              activeOpacity={1}
            >
              <Text style={styles.mainTitle}>{titleValue}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setHelpVisible(true)} style={[styles.helpBtn, { position: "absolute", right: 14, top: 10 }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
        </View>
        {totalSec > 0 && (
          <Text style={styles.totalText}>{fmtTotal(totalSec).toUpperCase()}</Text>
        )}

        {/* Swipeable: 0=clock  1=week  2=month  3=year (views 1-3 require premium) */}
        <View
          {...panResponder.panHandlers}
          style={[styles.clockWrapper, PREMIUM && viewIndex > 0 && { height: "auto" as any, width: width - 32 }]}
        >

          {/* ── VIEW 0: triple-ring clock ── */}
          {viewIndex === 0 && (<>

            <TouchableOpacity
              activeOpacity={1}
              delayLongPress={10000}
              onLongPress={() => {
                if (!PREMIUM) {
                  setPremium(true);
                  AsyncStorage.setItem("premium_v1", "1");
                  Alert.alert("Premium Unlocked", "You now have access to week, month, and year tracking.");
                }
              }}
              style={{ alignItems: "center", justifyContent: "center" }}
            >
              <Svg width={250} height={250} viewBox="-16 -16 282 282">
                <Circle cx={125} cy={125} r={52} fill={C.surface} />
                <Circle cx={125} cy={125} r={H_RING.r} stroke={C.accent} strokeOpacity={0.07} strokeWidth={11} fill="none" />
                <Circle cx={125} cy={125} r={M_RING.r} stroke={C.accent} strokeOpacity={0.07} strokeWidth={7} fill="none" />
                <Circle cx={125} cy={125} r={S_RING.r} stroke={C.accent} strokeOpacity={0.07} strokeWidth={4} fill="none" />
                <Circle cx={125} cy={125} r={M_RING.r} stroke={C.accent} strokeOpacity={0.55} strokeWidth={7} fill="none"
                  strokeDasharray={`${M_RING.circ}`} strokeDashoffset={arc(M_RING.circ, clockM / 60)}
                  strokeLinecap="round" transform="rotate(-90,125,125)" />
                <Circle cx={125} cy={125} r={S_RING.r} stroke={C.accent} strokeOpacity={0.3} strokeWidth={4} fill="none"
                  strokeDasharray={`${S_RING.circ}`} strokeDashoffset={arc(S_RING.circ, clockS / 60)}
                  strokeLinecap="round" transform="rotate(-90,125,125)" />
                <Circle cx={125} cy={125} r={H_RING.r} stroke={C.accent} strokeOpacity={0.35} strokeWidth={11} fill="none"
                  strokeDasharray={`${H_RING.circ}`} strokeDashoffset={arc(H_RING.circ, (nowDate.getHours() * 60 + nowDate.getMinutes()) / 1440)}
                  strokeLinecap="round" transform="rotate(-90,125,125)" />
                {todaySegments.map((entry, i) => {
                  const cfg = taskConfigs.find(t => t.id === entry.id);
                  if (!cfg) return null;
                  const from = (entry.start - dayStartMs) / DAY_MS;
                  const to = (entry.end - dayStartMs) / DAY_MS;
                  if (to <= from) return null;
                  const [da, doff] = arcSeg(H_RING.circ, from, to);
                  return <Circle key={i} cx={125} cy={125} r={H_RING.r} stroke={cfg.color} strokeOpacity={0.9} strokeWidth={11} fill="none"
                    strokeDasharray={da} strokeDashoffset={doff} strokeLinecap="butt" transform="rotate(-90,125,125)" />;
                })}
                {activeCfg && <Circle cx={125} cy={125} r={M_RING.r} stroke={activeCfg.color} strokeOpacity={0.9} strokeWidth={7} fill="none"
                  strokeDasharray={`${M_RING.circ}`} strokeDashoffset={arc(M_RING.circ, taskArcM)} strokeLinecap="round" transform="rotate(-90,125,125)" />}
                {activeCfg && <Circle cx={125} cy={125} r={S_RING.r} stroke={activeCfg.color} strokeOpacity={0.9} strokeWidth={4} fill="none"
                  strokeDasharray={`${S_RING.circ}`} strokeDashoffset={arc(S_RING.circ, taskArcS)} strokeLinecap="round" transform="rotate(-90,125,125)" />}
                {/* ── DEBUG: 24h hour labels ── */}
                {DEBUG_CLOCK && Array.from({ length: 24 }, (_, h) => {
                  const angle = (h / 24) * 2 * Math.PI - Math.PI / 2;
                  const isMajor = h % 3 === 0;
                  const tIn = H_RING.r - (isMajor ? 8 : 4);
                  const tOut = H_RING.r + (isMajor ? 8 : 4);
                  const lx = 125 + (H_RING.r + 18) * Math.cos(angle);
                  const ly = 125 + (H_RING.r + 18) * Math.sin(angle);
                  const label = h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
                  return (
                    <React.Fragment key={h}>
                      <SvgLine
                        x1={125 + tIn * Math.cos(angle)} y1={125 + tIn * Math.sin(angle)}
                        x2={125 + tOut * Math.cos(angle)} y2={125 + tOut * Math.sin(angle)}
                        stroke="#ffffff" strokeOpacity={isMajor ? 0.45 : 0.18} strokeWidth={isMajor ? 1.5 : 0.75}
                      />
                      {isMajor && (
                        <SvgText x={lx} y={ly} textAnchor="middle" alignmentBaseline="central"
                          fill="#ffffff" fillOpacity={0.6} fontSize={7}>
                          {label}
                        </SvgText>
                      )}
                    </React.Fragment>
                  );
                })}
              </Svg>
              <View style={styles.clockFace}>
                <Text style={styles.clockDigits}>{timeStr}</Text>
                {activeCfg && (
                  <View style={styles.activeTag}>
                    <Text style={[styles.activeTagLabel, { color: activeCfg.color }]}>{activeCfg.label}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </>)}

          {/* ── VIEW 1: week bars (premium) ── */}
          {PREMIUM && viewIndex === 1 && (() => {
            const weekStart = new Date(nowDate);
            weekStart.setDate(nowDate.getDate() - nowDate.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const weekDays: Date[] = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(weekStart);
              d.setDate(weekStart.getDate() + i);
              weekDays.push(d);
            }
            const todayKey = dateKey(now);
            const liveBonus = activeCfg && tasks[activeCfg.id]?.startTimestamp
              ? Math.max(0, Math.floor((now - tasks[activeCfg.id].startTimestamp!) / 1000)) : 0;
            const BAR_H = 160;
            const barW = Math.floor((width - 32 - 6 * 6) / 7);
            const dayData = weekDays.map(d => {
              const k = dateKey(d.getTime());
              const isToday = k === todayKey;
              const perTask = taskConfigs.map(cfg => {
                let s = (taskDailyTotals[cfg.id]?.[k] || 0);
                if (isToday && activeCfg?.id === cfg.id) s += liveBonus;
                return { cfg, s };
              }).filter(x => x.s > 0);
              const total = perTask.reduce((sum, x) => sum + x.s, 0);
              return { k, isToday, perTask, total };
            });
            const maxTotal = Math.max(...dayData.map(d => d.total), 1);
            return (
              <View style={styles.heatWeek}>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
                  {weekDays.map((d, i) => {
                    const k = dateKey(d.getTime());
                    const isToday = k === todayKey;
                    const hist = weekHistories[k] || [];
                    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                    const segments: { from: number; to: number; color: string; key: string }[] = [];
                    hist.forEach((entry, idx) => {
                      const cfg = taskConfigs.find(t => t.id === entry.id);
                      if (!cfg) return;
                      const from = Math.max(0, (entry.start - dayStart) / DAY_MS);
                      const to = Math.min(1, (entry.end - dayStart) / DAY_MS);
                      if (to <= from) return;
                      segments.push({ from, to, color: cfg.color, key: `h_${k}_${idx}_${entry.id}` });
                    });
                    // include live running segment for today
                    if (isToday && activeCfg && tasks[activeCfg.id]?.startTimestamp) {
                      const sTs = tasks[activeCfg.id].startTimestamp!;
                      const from = Math.max(0, (sTs - dayStart) / DAY_MS);
                      const to = Math.min(1, (now - dayStart) / DAY_MS);
                      if (to > from) segments.push({ from, to, color: activeCfg.color, key: `live_${k}_${activeCfg.id}` });
                    }
                    segments.sort((a, b) => a.from - b.from);
                    return (
                      <View key={i} style={{ alignItems: "center", width: barW }}>
                        <Text style={[styles.heatDayLabel, { marginBottom: 6, width: barW, color: isToday ? C.accent : C.muted }]}>{DAY_LETTERS[d.getDay()]}</Text>
                        <View style={{ width: barW, height: BAR_H, backgroundColor: C.rim, borderRadius: 4, overflow: "hidden", position: "relative" as const, borderWidth: isToday ? 1 : 0, borderColor: C.accent }}>
                          {segments.map((s) => {
                            const top = Math.round(s.from * BAR_H);
                            const h = Math.max(1, Math.round((s.to - s.from) * BAR_H));
                            return <View key={s.key} style={{ position: "absolute" as const, left: 0, right: 0, top, height: h, backgroundColor: s.color }} />;
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {/* ── VIEW 2: month heatmap (premium) ── */}
          {PREMIUM && viewIndex === 2 && (() => {
            const yr = nowDate.getFullYear(), mo = nowDate.getMonth();
            const firstDow = new Date(yr, mo, 1).getDay();
            const daysInMonth = new Date(yr, mo + 1, 0).getDate();
            const todayKey = dateKey(now);
            const liveBonus = activeCfg && tasks[activeCfg.id]?.startTimestamp
              ? Math.max(0, Math.floor((now - tasks[activeCfg.id].startTimestamp!) / 1000)) : 0;
            const selCfg = selectedTaskId ? taskConfigs.find(t => t.id === selectedTaskId) ?? null : null;
            const cells: (number | null)[] = [];
            for (let i = 0; i < firstDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);
            while (cells.length % 7 !== 0) cells.push(null);
            const rows: (number | null)[][] = [];
            for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
            return (
              <View style={styles.heatMonth}>
                <Text style={styles.heatTitle}>{MONTHS[mo]} {yr}</Text>
                <View style={styles.heatDayRow}>
                  {DAY_LETTERS.map((l, i) => <Text key={i} style={styles.heatDayLabel}>{l}</Text>)}
                </View>
                {rows.map((row, ri) => (
                  <View key={ri} style={styles.heatDayRow}>
                    {row.map((day, ci) => {
                      if (!day) return <View key={ci} style={styles.heatCell} />;
                      const k = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const secs = selCfg
                        ? (taskDailyTotals[selCfg.id]?.[k] || 0) + (k === todayKey && activeCfg?.id === selCfg.id ? liveBonus : 0)
                        : (dailyTotals[k] || 0) + (k === todayKey ? liveBonus : 0);
                      const bg = selCfg ? taskHeatColor(secs, selCfg.color) : heatColor(secs);
                      return (
                        <View key={ci} style={[styles.heatCell, { backgroundColor: bg }]}>
                          <Text style={[styles.heatCellText, { color: secs > 0 ? C.bg : C.muted }]}>{day}</Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })()}

          {/* ── VIEW 3: year heatmap (premium) ── */}
          {PREMIUM && viewIndex === 3 && (() => {
            const yr = nowDate.getFullYear();
            const jan1 = new Date(yr, 0, 1);
            const CELL = 11, YGAP = 2, COL = CELL + YGAP;
            const weeks: (Date | null)[][] = [];
            const cur = new Date(jan1);
            cur.setDate(cur.getDate() - jan1.getDay());
            for (let w = 0; w < 54; w++) {
              const week: (Date | null)[] = [];
              for (let d = 0; d < 7; d++) {
                week.push(cur.getFullYear() === yr ? new Date(cur) : null);
                cur.setDate(cur.getDate() + 1);
              }
              if (week.every(d => d === null)) break;
              weeks.push(week);
            }
            const todayKey = dateKey(now);
            const liveBonus = activeCfg && tasks[activeCfg.id]?.startTimestamp
              ? Math.max(0, Math.floor((now - tasks[activeCfg.id].startTimestamp!) / 1000)) : 0;
            const selCfg = selectedTaskId ? taskConfigs.find(t => t.id === selectedTaskId) ?? null : null;
            const monthSpans: { mo: number; count: number }[] = [];
            weeks.forEach(week => {
              const firstDate = week.find(d => d !== null);
              if (!firstDate) return;
              const mo = firstDate.getMonth();
              if (monthSpans.length === 0 || monthSpans[monthSpans.length - 1].mo !== mo) {
                monthSpans.push({ mo, count: 1 });
              } else {
                monthSpans[monthSpans.length - 1].count++;
              }
            });
            return (
              <View style={styles.heatYear}>
                <Text style={styles.heatTitle}>{yr}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={{ flexDirection: "row", marginBottom: 4 }}>
                      {monthSpans.map((span, i) => (
                        <View key={i} style={{ width: span.count * COL }}>
                          <Text style={styles.heatMonthLabel}>{MON_LABELS[span.mo]}</Text>
                        </View>
                      ))}
                    </View>
                    {[0, 1, 2, 3, 4, 5, 6].map(dow => (
                      <View key={dow} style={{ flexDirection: "row", marginBottom: YGAP }}>
                        {weeks.map((week, wi) => {
                          const date = week[dow];
                          if (!date) return <View key={wi} style={{ width: CELL, height: CELL, marginRight: YGAP }} />;
                          const k = dateKey(date.getTime());
                          const secs = selCfg
                            ? (taskDailyTotals[selCfg.id]?.[k] || 0) + (k === todayKey && activeCfg?.id === selCfg.id ? liveBonus : 0)
                            : (dailyTotals[k] || 0) + (k === todayKey ? liveBonus : 0);
                          const bg = selCfg ? taskHeatColor(secs, selCfg.color) : heatColor(secs);
                          return <View key={wi} style={{ width: CELL, height: CELL, borderRadius: 2, backgroundColor: bg, marginRight: YGAP }} />;
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            );
          })()}
        </View>

        {/* Swipe dots (premium only) */}
        {
          PREMIUM && (
            <View style={styles.viewDots}>
              {[0, 1, 2, 3].map(i => <View key={i} style={[styles.viewDot, viewIndex === i && styles.viewDotActive]} />)}
            </View>
          )
        }

        {/* Task grid — tap selects for heatmap when not on clock view */}
        <View style={[styles.grid, { paddingHorizontal: H_PAD, gap: GAP }]}>
          {taskConfigs.map(cfg => {
            const task = tasks[cfg.id];
            const secs = getSeconds(task);
            const isActive = task?.running ?? false;
            const isSelected = selectedTaskId === cfg.id;
            return (
              <TouchableOpacity
                key={cfg.id}
                style={[
                  styles.taskCircle,
                  { width: CS, height: CS, borderRadius: CS / 2 },
                  isActive
                    ? { borderColor: cfg.color, shadowColor: cfg.color, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 }
                    : isSelected
                      ? { borderColor: cfg.color, borderWidth: 2.5 }
                      : { borderColor: C.rim },
                ]}
                onPress={() => {
                  if (viewIndex === 0) {
                    toggleTask(cfg.id);
                  } else {
                    setSelectedTaskId(prev => prev === cfg.id ? null : cfg.id);
                  }
                }}
                onLongPress={() => openEdit(cfg.id)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: CS * 0.22 }}>{cfg.emoji}</Text>
                <Text style={[styles.taskLabel, (isActive || isSelected) && { color: cfg.color }, { fontSize: CS * 0.1 }]}>{cfg.label}</Text>
                <Text style={[styles.taskTime, (isActive || isSelected) && { color: cfg.color }, { fontSize: CS * 0.115 }]}>{fmtTime(secs)}</Text>
              </TouchableOpacity>
            );
          })}
          {/* Add circle button — premium only */}
          {PREMIUM && (
            <TouchableOpacity
              style={[styles.taskCircle, { width: CS, height: CS, borderRadius: CS / 2, borderColor: C.muted, borderStyle: "dashed", opacity: 0.5 }]}
              onPress={() => setAddCircleVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: CS * 0.28, color: C.muted }}>+</Text>
              <Text style={[styles.taskLabel, { fontSize: CS * 0.09 }]}>new</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.hint}>tap to start {"\u00B7"} hold to edit{PREMIUM ? " \u00B7 swipe \u2192 history  \u00B7  tap circle to filter" : ""}</Text>
      </ScrollView >

      {/* Edit modal */}
      < Modal visible={editId !== null
      } transparent animationType="fade" onRequestClose={() => setEditId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Task</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
              {EMOJI_LIST.map((e, i) => (
                <TouchableOpacity key={i} onPress={() => setEditEmoji(e)}
                  style={[styles.emojiBtn, editEmoji === e && styles.emojiBtnActive]}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={styles.modalInput}
              placeholder="Task name..."
              placeholderTextColor={C.muted}
              value={editLabel}
              onChangeText={setEditLabel}
              maxLength={16}
            />

            <View style={styles.colorRow}>
              {PALETTE.map((color, i) => (
                <TouchableOpacity key={i} onPress={() => setEditColorIdx(i)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    editColorIdx === i && { borderWidth: 3, borderColor: C.text },
                  ]} />
              ))}
            </View>

            <TouchableOpacity style={styles.resetBtn} onPress={resetFromEdit}>
              <Text style={styles.resetBtnText}>Reset Timer</Text>
            </TouchableOpacity>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditId(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: PALETTE[editColorIdx] }]}
                onPress={saveEdit}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Add-circle modal (premium) */}
      <Modal visible={addCircleVisible} transparent animationType="fade" onRequestClose={() => setAddCircleVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>New Circle</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
              {EMOJI_LIST.map((e, i) => (
                <TouchableOpacity key={i} onPress={() => setNewEmoji(e)}
                  style={[styles.emojiBtn, newEmoji === e && styles.emojiBtnActive]}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={styles.modalInput}
              placeholder="Task name..."
              placeholderTextColor={C.muted}
              value={newLabel}
              onChangeText={setNewLabel}
              maxLength={16}
            />
            <View style={styles.colorRow}>
              {PALETTE.map((color, i) => (
                <TouchableOpacity key={i} onPress={() => setNewColorIdx(i)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    newColorIdx === i && { borderWidth: 3, borderColor: C.text },
                  ]} />
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setAddCircleVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: PALETTE[newColorIdx] }]}
                onPress={addCircle}
              >
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Help modal */}
      <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>How to use</Text>
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={styles.helpContent} style={{ maxHeight: height - 320 }}>
              {([
                ["Tap a circle", "Start or stop tracking time for that activity."],
                ["Hold a circle", "Edit its name, emoji and colour, or reset its timer."],
                ["Watch face", "The outer ring shows your 24h day — coloured arcs are tracked sessions. The middle and inner rings show the active task's minutes and seconds."],
                ["Swipe the watch \u2192", "(Premium) Switch to week, month and year tracking views."],
                ["Tap a circle (history views)", "(Premium) Filter the heatmap to one activity."],
                ["Hold the title", "Rename the app title."],
                ["+ circle", "(Premium) Add a brand-new tracking circle."],
              ] as [string, string][]).map(([title, desc], i) => (
                <View key={i} style={styles.helpItem}>
                  <Text style={styles.helpItemTitle}>{title}</Text>
                  <Text style={styles.helpItemDesc}>{desc}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalSave, { backgroundColor: C.accent, marginTop: 8 }]} onPress={() => setHelpVisible(false)}>
              <Text style={styles.modalSaveText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View >
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 34, paddingBottom: 6 },
  topDate: { fontFamily: "DMMono_400Regular", fontSize: 12, color: C.muted, letterSpacing: 0.5 },
  topDay: { fontFamily: "DMMono_400Regular", fontSize: 12, color: C.muted, letterSpacing: 0.5 },
  totalText: { fontFamily: "DMMono_400Regular", fontSize: 10, color: C.muted, textAlign: "center", letterSpacing: 1.5, paddingVertical: 2 },
  helpBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  helpBtnText: { fontFamily: "DMMono_400Regular", fontSize: 15, color: C.muted, opacity: 0.9 },
  scroll: { alignItems: "center", paddingBottom: 52 },
  mainTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: C.text, letterSpacing: 0.5, marginTop: -2, marginBottom: 0 },
  mainTitleInput: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: C.text, letterSpacing: 0.5, marginTop: -2, marginBottom: 0, borderBottomWidth: 1.5, borderBottomColor: C.accent, textAlign: "center", minWidth: 120 },
  clockWrapper: { width: 250, height: 250, alignItems: "center", justifyContent: "center", marginVertical: 4 },
  clockFace: { position: "absolute", alignItems: "center", justifyContent: "center" },
  clockDigits: { fontFamily: "DMMono_500Medium", fontSize: 20, color: C.text, letterSpacing: 2 },
  activeTag: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 },
  activeTagEmoji: { fontSize: 13 },
  activeTagLabel: { fontFamily: "DMMono_400Regular", fontSize: 12, letterSpacing: 0.3 },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 8, width: "100%" },
  taskCircle: { backgroundColor: C.surface, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 2 },
  taskLabel: { fontFamily: "DMMono_400Regular", color: C.muted, letterSpacing: 0.2 },
  taskTime: { fontFamily: "DMMono_500Medium", color: C.text, letterSpacing: 0.3 },
  hint: { marginTop: 20, paddingHorizontal: 20, fontFamily: "DMMono_400Regular", fontSize: 11, color: C.muted, letterSpacing: 0.3, textAlign: "center" as const },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" },
  titleRow: { width: "100%", alignItems: "center", justifyContent: "center", marginTop: 6 },
  modalBox: { backgroundColor: C.surface, borderRadius: 24, padding: 24, width: width - 56, borderWidth: 1, borderColor: C.rim, maxHeight: height - 160 },
  helpContent: { paddingBottom: 8 },
  helpItem: { marginBottom: 12 },
  helpItemTitle: { fontFamily: "DMMono_500Medium", fontSize: 13, color: C.accent, marginBottom: 4 },
  helpItemDesc: { fontFamily: "DMMono_400Regular", fontSize: 13, color: C.muted, lineHeight: 18 },
  modalTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: C.text, marginBottom: 16, textAlign: "center" },
  emojiScroll: { marginBottom: 14 },
  emojiBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 6 },
  emojiBtnActive: { backgroundColor: C.rim },
  modalInput: { backgroundColor: C.bg, color: C.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "DMMono_400Regular", fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: C.rim },
  colorRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" },
  colorDot: { width: 26, height: 26, borderRadius: 13 },
  resetBtn: { paddingVertical: 11, borderRadius: 12, backgroundColor: C.bg, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "#3a1515" },
  resetBtnText: { fontFamily: "DMMono_500Medium", color: C.pulse, fontSize: 13, letterSpacing: 0.5 },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: C.bg, alignItems: "center", borderWidth: 1, borderColor: C.rim },
  modalCancelText: { fontFamily: "DMMono_400Regular", color: C.muted, fontSize: 14 },
  modalSave: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  modalSaveText: { fontFamily: "DMMono_500Medium", color: C.bg, fontSize: 15, fontWeight: "700" as any },
  viewDots: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 6, marginBottom: 2 },
  viewDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.rim },
  viewDotActive: { backgroundColor: C.accent },
  heatWeek: { width: "100%", padding: 12, alignItems: "center" as const },
  heatMonth: { width: "100%", padding: 8, alignItems: "center" as const },
  heatYear: { width: "100%", padding: 8 },
  heatTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: C.text, marginBottom: 10, textAlign: "center" as const },
  heatDayRow: { flexDirection: "row" as const, marginBottom: 3 },
  heatDayLabel: { width: 32, textAlign: "center" as const, fontFamily: "DMMono_400Regular", fontSize: 9, color: C.muted, lineHeight: 14 },
  heatCell: { width: 32, height: 32, borderRadius: 6, marginHorizontal: 1, backgroundColor: C.rim, alignItems: "center" as const, justifyContent: "center" as const },
  heatCellText: { fontFamily: "DMMono_400Regular", fontSize: 10 },
  heatMonthLabel: { fontFamily: "DMMono_400Regular", fontSize: 10, color: C.muted },
});