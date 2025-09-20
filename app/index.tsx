import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Task = {
  id: string;
  name: string;
  time: number; // in seconds
  running: boolean;
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskName, setTaskName] = useState<string>('');
  const timerRefs = useRef<Map<string, NodeJS.Timer>>(new Map());

  useEffect(() => {
    const loadTasks = async () => {
      const saved = await AsyncStorage.getItem('tasks');
      if (saved) {
        const parsed: Task[] = JSON.parse(saved);
        setTasks(parsed);
        parsed.forEach(task => {
          if (task.running) resumeTask(task.id, true);
        });
      }
    };
    loadTasks();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  const startTask = (name: string) => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a task name.');
      return;
    }

    const id = Date.now().toString();
    const newTask: Task = { id, name, time: 0, running: true };
    setTasks(prev => [...prev, newTask]);

    const interval = setInterval(() => {
      setTasks(prev =>
        prev.map(task => (task.id === id ? { ...task, time: task.time + 1 } : task))
      );
    }, 1000);

    timerRefs.current.set(id, interval);
    setTaskName('');
  };

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.running ? pauseTask(id) : resumeTask(id);
  };

  const pauseTask = (id: string) => {
    const interval = timerRefs.current.get(id);
    if (interval) clearInterval(interval);
    timerRefs.current.delete(id);

    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, running: false } : t))
    );
  };

  const resumeTask = (id: string, fromStorage = false) => {
    const interval = setInterval(() => {
      setTasks(prev =>
        prev.map(t => (t.id === id ? { ...t, time: t.time + 1 } : t))
      );
    }, 1000);

    timerRefs.current.set(id, interval);

    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, running: true } : t))
    );
  };

  const resetTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    Alert.alert(
      'Reset Task',
      `Are you sure you want to reset "${task.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const interval = timerRefs.current.get(id);
            if (interval) clearInterval(interval);
            timerRefs.current.delete(id);

            setTasks(prev =>
              prev.map(t => (t.id === id ? { ...t, time: 0, running: false } : t))
            );
          },
        },
      ]
    );
  };

  const removeTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    Alert.alert(
      'Remove Task',
      `Are you sure you want to remove "${task.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const interval = timerRefs.current.get(id);
            if (interval) clearInterval(interval);
            timerRefs.current.delete(id);

            setTasks(prev => prev.filter(t => t.id !== id));
          },
        },
      ]
    );
  };

  const formatTime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${days}d ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const renderItem = ({ item }: { item: Task }) => (
    <View style={styles.taskCard}>
      <View style={{ flex: 1, marginBottom: 10 }}>
        <Text style={styles.taskName}>{item.name}</Text>
        <Text style={styles.taskTime}>{formatTime(item.time)}</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: item.running ? '#FF9F9F' : '#9FFF9F' }]}
          onPress={() => toggleTask(item.id)}
        >
          <Text style={styles.buttonText}>{item.running ? 'Pause' : 'Start'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, { backgroundColor: '#FFCC66' }]} onPress={() => resetTask(item.id)}>
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, { backgroundColor: '#FF6B6B' }]} onPress={() => removeTask(item.id)}>
          <Text style={styles.buttonText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Time Tracker</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Task Name"
          placeholderTextColor="#aaa"
          value={taskName}
          onChangeText={setTaskName}
        />
        <TouchableOpacity style={styles.addButton} onPress={() => startTask(taskName)}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 50, paddingHorizontal: 20 },
  header: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#1E1E1E', color: '#fff', borderRadius: 10, paddingHorizontal: 15, height: 50 },
  addButton: { marginLeft: 10, backgroundColor: '#4E9F3D', borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  taskCard: { backgroundColor: '#1F1F1F', padding: 15, borderRadius: 12, marginBottom: 15 },
  taskName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  taskTime: { fontSize: 16, color: '#ccc', marginTop: 5 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 70, alignItems: 'center', marginHorizontal: 2 },
  buttonText: { color: '#1E1E1E', fontWeight: 'bold' },
});
