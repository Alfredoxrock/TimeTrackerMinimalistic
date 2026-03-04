import AsyncStorage from "@react-native-async-storage/async-storage";
import { DMMono_400Regular, DMMono_500Medium, useFonts as useDMMono } from "@expo-google-fonts/dm-mono";
import { PlayfairDisplay_700Bold, useFonts as usePlayfair } from "@expo-google-fonts/playfair-display";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

const { width } = Dimensions.get("window");

//  Color system 
const C = {
  bg:      "#0a0a0f",
  surface: "#13131a",
  rim:     "#1e1e2e",
  text:    "#e8e4d9",
  muted:   "#5a5870",
  accent:  "#c8b8ff",
  pulse:   "#ff6b6b",
};

//  Types 
type TaskConfig = { id: string; label: string; emoji: string; color: string };
type TaskState  = { accumulated: number; startTimestamp?: number; running: boolean };
type AllTasks   = Record<string, TaskState>;

//  Default tasks 
const DEFAULT_TASKS: TaskConfig[] = [
  { id: "reading",    label: "Reading",    emoji: "\uD83D\uDCD6", color: "#7eb8f7" },
  { id: "writing",    label: "Writing",    emoji: "\u270D\uFE0F", color: "#f7c97e" },
  { id: "cooking",    label: "Cooking",    emoji: "\uD83C\uDF73", color: "#f7a07e" },
  { id: "exercise",   label: "Exercise",   emoji: "\uD83C\uDFC3", color: "#7ef7b0" },
  { id: "work",       label: "Work",       emoji: "\uD83D\uDCBB", color: "#c8b8ff" },
  { id: "learning",   label: "Learning",   emoji: "\uD83C\uDF93", color: "#f7e97e" },
  { id: "rest",       label: "Rest",       emoji: "\uD83D\uDECF\uFE0F", color: "#b8d4ff" },
  { id: "social",     label: "Social",     emoji: "\uD83D\uDE42", color: "#ffb8d4" },
  { id: "creative",   label: "Creative",   emoji: "\uD83C\uDFA8", color: "#ffcb7e" },
];

const PALETTE: string[] = [
  "#7eb8f7","#f7c97e","#f7a07e","#7ef7b0","#c8b8ff","#f7e97e","#b8d4ff","#ffb8d4","#ffcb7e",
];

const EMOJI_LIST = [
  "\uD83D\uDCD6", "\u270D\uFE0F", "\uD83C\uDF73", "\uD83C\uDFC3",
  "\uD83D\uDCBB", "\uD83C\uDF93", "\uD83D\uDECF\uFE0F", "\uD83D\uDE42",
  "\uD83C\uDFA8", "\uD83D\uDD2C", "\uD83C\uDFAF", "\uD83D\uDCDD",
  "\uD83D\uDCA1", "\uD83C\uDF31", "\uD83D\uDE80", "\uD83C\uDFB5",
  "\uD83D\uDCAA", "\u2764\uFE0F", "\uD83C\uDF0D", "\uD83C\uDFB8",
];

const DAYS   = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// ─── Clock ring helpers ──────────────────────────────────────────────────────
const ring = (r: number) => ({ r, circ: 2 * Math.PI * r });
const H_RING = ring(106);
const M_RING = ring(87);
const S_RING = ring(68);
const arc = (circ: number, p: number) => circ * (1 - Math.max(0, Math.min(1, p)));

// ─── Time formatting ─────────────────────────────────────────────────────────
const fmtTime = (s: number): string => {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h < 10)   return `${h}h ${m}m`;
  return `${h}h`;
};
const fmt      = (n: number) => String(n).padStart(2, "0");
const fmtTotal = (s: number): string => {
  if (s <= 0) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m tracked` : `${m}m tracked`;
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [dmLoaded]      = useDMMono({ DMMono_400Regular, DMMono_500Medium });
  const [pfLoaded]      = usePlayfair({ PlayfairDisplay_700Bold });

  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>(DEFAULT_TASKS);
  const [tasks, setTasks] = useState<AllTasks>(() =>
    Object.fromEntries(DEFAULT_TASKS.map(t => [t.id, { accumulated: 0, running: false }]))
  );
  const [now, setNow]   = useState(Date.now());
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edit modal state
  const [editId, setEditId]               = useState<string | null>(null);
  const [editLabel, setEditLabel]         = useState("");
  const [editEmoji, setEditEmoji]         = useState(EMOJI_LIST[0]);
  const [editColorIdx, setEditColorIdx]   = useState(0);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("tasks_v5"),
      AsyncStorage.getItem("taskConfigs_v5"),
    ]).then(([st, sc]) => {
      if (sc) setTaskConfigs(JSON.parse(sc));
      if (st) setTasks(JSON.parse(st));
    });
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener("change", next => {
      if (next === "active") setNow(Date.now());
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, []);

  useEffect(() => { AsyncStorage.setItem("tasks_v5", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { AsyncStorage.setItem("taskConfigs_v5", JSON.stringify(taskConfigs)); }, [taskConfigs]);

  const getSeconds = (task?: TaskState): number => {
    if (!task) return 0;
    return task.running && task.startTimestamp
      ? task.accumulated + Math.floor((now - task.startTimestamp) / 1000)
      : task.accumulated;
  };

  const toggleTask = (id: string) => {
    setTasks(prev => {
      const task = prev[id] ?? { accumulated: 0, running: false };
      if (task.running) {
        const elapsed = task.startTimestamp ? Math.floor((Date.now() - task.startTimestamp) / 1000) : 0;
        return { ...prev, [id]: { accumulated: task.accumulated + elapsed, running: false } };
      }
      const updated: AllTasks = {};
      for (const [k, v] of Object.entries(prev)) {
        updated[k] = v.running && v.startTimestamp
          ? { accumulated: v.accumulated + Math.floor((Date.now() - v.startTimestamp) / 1000), running: false }
          : v;
      }
      updated[id] = { accumulated: (updated[id] ?? { accumulated: 0 }).accumulated, startTimestamp: Date.now(), running: true };
      return updated;
    });
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

  const resetFromEdit = () => {
    if (!editId) return;
    Alert.alert("Reset Timer", "Reset all tracked time for this task?", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => {
        setTasks(prev => ({ ...prev, [editId]: { accumulated: 0, running: false } }));
        setEditId(null);
      }},
    ]);
  };

  // Derived clock values
  const nowDate  = new Date(now);
  const clockH   = nowDate.getHours() % 12 + nowDate.getMinutes() / 60;
  const clockM   = nowDate.getMinutes() + nowDate.getSeconds() / 60;
  const clockS   = nowDate.getSeconds();
  const dateStr  = `${MONTHS[nowDate.getMonth()]} ${nowDate.getDate()}, ${nowDate.getFullYear()}`;
  const dayStr   = DAYS[nowDate.getDay()];
  const timeStr  = `${fmt(nowDate.getHours())}:${fmt(nowDate.getMinutes())}:${fmt(nowDate.getSeconds())}`;
  const totalSec = taskConfigs.reduce((s, t) => s + getSeconds(tasks[t.id]), 0);
  const activeCfg = taskConfigs.find(t => tasks[t.id]?.running) ?? null;

  // Grid sizing — 3 per row
  const COLS  = 3;
  const H_PAD = 20;
  const GAP   = 10;
  const CS    = Math.floor((width - H_PAD * 2 - GAP * (COLS - 1)) / COLS);

  if (!dmLoaded || !pfLoaded) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topDate}>{dateStr}</Text>
        <Text style={styles.topDay}>{dayStr}</Text>
      </View>

      {/* Total tracked */}
      {totalSec > 0 && (
        <Text style={styles.totalText}>{fmtTotal(totalSec).toUpperCase()}</Text>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.mainTitle}>Day Circles</Text>

        {/* Triple-ring clock */}
        <View style={styles.clockWrapper}>
          <Svg width={250} height={250} viewBox="0 0 250 250">
            {/* Track rings */}
            <Circle cx={125} cy={125} r={H_RING.r} stroke={C.accent} strokeOpacity={0.07} strokeWidth={11} fill="none" />
            <Circle cx={125} cy={125} r={M_RING.r} stroke={C.accent} strokeOpacity={0.07} strokeWidth={7}  fill="none" />
            <Circle cx={125} cy={125} r={S_RING.r} stroke={C.accent} strokeOpacity={0.07} strokeWidth={4}  fill="none" />
            {/* Progress rings */}
            <Circle cx={125} cy={125} r={H_RING.r} stroke={C.accent} strokeOpacity={1}    strokeWidth={11} fill="none"
              strokeDasharray={`${H_RING.circ}`} strokeDashoffset={arc(H_RING.circ, clockH / 12)}
              strokeLinecap="round" transform="rotate(-90,125,125)" />
            <Circle cx={125} cy={125} r={M_RING.r} stroke={C.accent} strokeOpacity={0.55} strokeWidth={7}  fill="none"
              strokeDasharray={`${M_RING.circ}`} strokeDashoffset={arc(M_RING.circ, clockM / 60)}
              strokeLinecap="round" transform="rotate(-90,125,125)" />
            <Circle cx={125} cy={125} r={S_RING.r} stroke={C.accent} strokeOpacity={0.3}  strokeWidth={4}  fill="none"
              strokeDasharray={`${S_RING.circ}`} strokeDashoffset={arc(S_RING.circ, clockS / 60)}
              strokeLinecap="round" transform="rotate(-90,125,125)" />
          </Svg>
          <View style={styles.clockFace}>
            <Text style={styles.clockDigits}>{timeStr}</Text>
            {activeCfg && (
              <View style={styles.activeTag}>
                <Text style={styles.activeTagEmoji}>{activeCfg.emoji}</Text>
                <Text style={[styles.activeTagLabel, { color: activeCfg.color }]}>{activeCfg.label}</Text>
                <View style={[styles.pulseDot, { backgroundColor: C.pulse }]} />
              </View>
            )}
          </View>
        </View>

        {/* Task grid */}
        <View style={[styles.grid, { paddingHorizontal: H_PAD, gap: GAP }]}>
          {taskConfigs.map(cfg => {
            const task     = tasks[cfg.id];
            const secs     = getSeconds(task);
            const isActive = task?.running ?? false;
            return (
              <TouchableOpacity
                key={cfg.id}
                style={[
                  styles.taskCircle,
                  { width: CS, height: CS, borderRadius: CS / 2 },
                  isActive
                    ? { borderColor: cfg.color, shadowColor: cfg.color, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 }
                    : { borderColor: C.rim },
                ]}
                onPress={() => toggleTask(cfg.id)}
                onLongPress={() => openEdit(cfg.id)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: CS * 0.22 }}>{cfg.emoji}</Text>
                <Text style={[styles.taskLabel, isActive && { color: cfg.color }, { fontSize: CS * 0.1 }]}>{cfg.label}</Text>
                <Text style={[styles.taskTime, isActive && { color: cfg.color }, { fontSize: CS * 0.115 }]}>{fmtTime(secs)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.hint}>tap to start{"\u2002\u00B7\u2002"}hold to edit</Text>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editId !== null} transparent animationType="fade" onRequestClose={() => setEditId(null)}>
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  topBar:         { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 22, paddingTop: 56, paddingBottom: 2 },
  topDate:        { fontFamily: "DMMono_400Regular", fontSize: 12, color: C.muted, letterSpacing: 0.5 },
  topDay:         { fontFamily: "DMMono_400Regular", fontSize: 12, color: C.muted, letterSpacing: 0.5 },
  totalText:      { fontFamily: "DMMono_400Regular", fontSize: 10, color: C.rim, textAlign: "center", letterSpacing: 1.5, paddingVertical: 2 },
  scroll:         { alignItems: "center", paddingBottom: 52 },
  mainTitle:      { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, color: C.text, letterSpacing: 0.5, marginTop: 4, marginBottom: 2 },
  clockWrapper:   { width: 250, height: 250, alignItems: "center", justifyContent: "center", marginVertical: 4 },
  clockFace:      { position: "absolute", alignItems: "center", justifyContent: "center" },
  clockDigits:    { fontFamily: "DMMono_500Medium", fontSize: 26, color: C.text, letterSpacing: 2 },
  activeTag:      { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 },
  activeTagEmoji: { fontSize: 13 },
  activeTagLabel: { fontFamily: "DMMono_400Regular", fontSize: 12, letterSpacing: 0.3 },
  pulseDot:       { width: 6, height: 6, borderRadius: 3 },
  grid:           { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 8, width: "100%" },
  taskCircle:     { backgroundColor: C.surface, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 2 },
  taskLabel:      { fontFamily: "DMMono_400Regular", color: C.muted, letterSpacing: 0.2 },
  taskTime:       { fontFamily: "DMMono_500Medium",  color: C.rim,   letterSpacing: 0.3 },
  hint:           { marginTop: 20, fontFamily: "DMMono_400Regular", fontSize: 11, color: C.rim, letterSpacing: 0.3 },
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" },
  modalBox:       { backgroundColor: C.surface, borderRadius: 24, padding: 24, width: width - 56, borderWidth: 1, borderColor: C.rim },
  modalTitle:     { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: C.text, marginBottom: 16, textAlign: "center" },
  emojiScroll:    { marginBottom: 14 },
  emojiBtn:       { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 6 },
  emojiBtnActive: { backgroundColor: C.rim },
  modalInput:     { backgroundColor: C.bg, color: C.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "DMMono_400Regular", fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: C.rim },
  colorRow:       { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" },
  colorDot:       { width: 26, height: 26, borderRadius: 13 },
  resetBtn:       { paddingVertical: 11, borderRadius: 12, backgroundColor: C.bg, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "#3a1515" },
  resetBtnText:   { fontFamily: "DMMono_500Medium", color: C.pulse, fontSize: 13, letterSpacing: 0.5 },
  modalBtns:      { flexDirection: "row", gap: 12 },
  modalCancel:    { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: C.bg, alignItems: "center", borderWidth: 1, borderColor: C.rim },
  modalCancelText:{ fontFamily: "DMMono_400Regular", color: C.muted, fontSize: 14 },
  modalSave:      { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalSaveText:  { fontFamily: "DMMono_500Medium", color: C.bg, fontSize: 14 },
});