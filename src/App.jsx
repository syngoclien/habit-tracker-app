import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(baseDate = new Date()) {
  const monday = getMonday(baseDate);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function getMonthDays(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => new Date(year, month, index + 1));
}

function getMonthLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function daysBetween(fromDateKey, toDateKey) {
  let cursor = parseDateKey(fromDateKey);
  const end = parseDateKey(toDateKey);
  const days = [];
  while (cursor < end) {
    days.push(getDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

const WEEK_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

export default function HabitTrackerApp() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState("");

  const [items, setItems] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [rolloverHistory, setRolloverHistory] = useState([]);

  const [newTask, setNewTask] = useState("");
  const [newTaskDate, setNewTaskDate] = useState(getDateKey(new Date()));
  const [newHabit, setNewHabit] = useState("");
  const [displayName, setDisplayName] = useState("Ngọc Liên");
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("Ngọc Liên");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const todayKey = getDateKey(new Date());
  const selectedDateKey = getDateKey(selectedDate);
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const monthDays = useMemo(() => getMonthDays(selectedDate), [selectedDate]);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!session?.user) return;
    const name = session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "Người dùng";
    setDisplayName(name);
    setDisplayNameInput(name);
  }, [session]);

  const habits = items.filter((item) => item.type === "habit");
  const tasks = items.filter((item) => item.type === "task");

  useEffect(() => {
    const checkInstalled = () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      const iosStandalone = window.navigator.standalone === true;
      setIsInstalled(standalone || iosStandalone);
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    checkInstalled();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(data.session);
      setLoading(false);
    }

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadCloudData();
  }, [userId]);

  async function handleAuthSubmit() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setAuthMessage("Chị nhập đủ email và mật khẩu nhé.");
      return;
    }

    if (password.length < 6) {
      setAuthMessage("Mật khẩu nên có ít nhất 6 ký tự.");
      return;
    }

    setSaving(true);
    setAuthMessage("");

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      setSaving(false);
      if (error) {
        setAuthMessage("Không đăng nhập được. Chị kiểm tra lại email/mật khẩu nhé.");
      }
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    setSaving(false);
    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage("Tạo tài khoản thành công. Nếu Supabase yêu cầu xác nhận email, chị mở email để xác nhận trước khi đăng nhập nhé.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setItems([]);
    setCompletions([]);
    setRolloverHistory([]);
  }

  async function saveDisplayName() {
    const value = displayNameInput.trim();
    if (!value) {
      alert("Tên hiển thị không được để trống nhé.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.auth.updateUser({
      data: { display_name: value },
    });
    setSaving(false);

    if (error) return alert(error.message);

    setDisplayName(data.user.user_metadata?.display_name || value);
    setEditingDisplayName(false);
  }

  function cancelEditDisplayName() {
    setDisplayNameInput(displayName);
    setEditingDisplayName(false);
  }

  async function handleInstallApp() {
    if (!installPrompt) {
      alert("Nếu trình duyệt chưa hiện nút cài, chị có thể bấm menu của trình duyệt rồi chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.");
      return;
    }

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
  }

  async function loadCloudData() {
    setLoading(true);

    const [itemsResult, completionsResult, rolloverResult] = await Promise.all([
      supabase.from("habit_items").select("*").order("created_at", { ascending: true }),
      supabase.from("habit_completions").select("*"),
      supabase.from("habit_rollover_history").select("*"),
    ]);

    if (itemsResult.error || completionsResult.error || rolloverResult.error) {
      console.error(itemsResult.error || completionsResult.error || rolloverResult.error);
      setLoading(false);
      return;
    }

    setCompletions(completionsResult.data || []);
    setRolloverHistory(rolloverResult.data || []);

    const rolledItems = await rolloverIncompleteTasks(itemsResult.data || [], rolloverResult.data || []);
    setItems(rolledItems);
    setLoading(false);
  }

  async function rolloverIncompleteTasks(cloudItems, currentRolloverHistory) {
    const taskUpdates = [];
    const historyInserts = [];

    for (const item of cloudItems) {
      if (item.type !== "task") continue;
      if (item.completed_date) continue;
      if (!item.due_date || item.due_date >= todayKey) continue;

      const missedDays = daysBetween(item.due_date, todayKey);
      const existingKeys = new Set(
        currentRolloverHistory
          .filter((row) => row.item_id === item.id)
          .map((row) => `${row.item_id}-${row.missed_date}`)
      );

      for (const missedDate of missedDays) {
        const key = `${item.id}-${missedDate}`;
        if (!existingKeys.has(key)) {
          historyInserts.push({
            user_id: userId,
            item_id: item.id,
            missed_date: missedDate,
            status: "missed-and-moved",
          });
        }
      }

      taskUpdates.push({
        id: item.id,
        due_date: todayKey,
        rollover_count: (item.rollover_count || 0) + missedDays.length,
      });
    }

    if (historyInserts.length > 0) {
      await supabase.from("habit_rollover_history").upsert(historyInserts, {
        onConflict: "user_id,item_id,missed_date",
      });
    }

    for (const update of taskUpdates) {
      await supabase
        .from("habit_items")
        .update({ due_date: update.due_date, rollover_count: update.rollover_count })
        .eq("id", update.id);
    }

    if (taskUpdates.length === 0 && historyInserts.length === 0) return cloudItems;

    const [itemsResult, rolloverResult] = await Promise.all([
      supabase.from("habit_items").select("*").order("created_at", { ascending: true }),
      supabase.from("habit_rollover_history").select("*"),
    ]);

    setRolloverHistory(rolloverResult.data || []);
    return itemsResult.data || cloudItems;
  }

  async function addTask() {
    const value = newTask.trim();
    if (!value || !userId) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("habit_items")
      .insert({
        user_id: userId,
        title: value,
        type: "task",
        due_date: newTaskDate || todayKey,
        completed_date: null,
        rollover_count: 0,
      })
      .select()
      .single();

    setSaving(false);
    if (error) return alert(error.message);

    setItems((current) => [...current, data]);
    setNewTask("");
  }

  async function addHabit() {
    const value = newHabit.trim();
    if (!value || !userId) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("habit_items")
      .insert({
        user_id: userId,
        title: value,
        type: "habit",
        due_date: null,
        completed_date: null,
        rollover_count: 0,
      })
      .select()
      .single();

    setSaving(false);
    if (error) return alert(error.message);

    setItems((current) => [...current, data]);
    setNewHabit("");
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setEditingTitle(item.title);
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditingTitle("");
  }

  async function saveEditItem(item) {
    const value = editingTitle.trim();
    if (!value) {
      alert("Tên không được để trống nhé.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("habit_items")
      .update({ title: value })
      .eq("id", item.id)
      .select()
      .single();

    setSaving(false);

    if (error) return alert(error.message);

    setItems((current) => current.map((row) => (row.id === item.id ? data : row)));
    cancelEditItem();
  }

  async function deleteItem(item) {
    const confirmed = window.confirm(`Xóa “${item.title}” nhé?`);
    if (!confirmed) return;

    const { error } = await supabase.from("habit_items").delete().eq("id", item.id);
    if (error) return alert(error.message);

    setItems((current) => current.filter((row) => row.id !== item.id));
    setCompletions((current) => current.filter((row) => row.item_id !== item.id));
    setRolloverHistory((current) => current.filter((row) => row.item_id !== item.id));
  }

  async function toggleDone(item, dateKey) {
    if (item.type === "habit") {
      await toggleHabitDone(item, dateKey);
      return;
    }
    await toggleTaskDone(item, dateKey);
  }

  async function toggleHabitDone(item, dateKey) {
    const existing = completions.find((row) => row.item_id === item.id && row.completed_date === dateKey);

    if (existing) {
      const { error } = await supabase.from("habit_completions").delete().eq("id", existing.id);
      if (error) return alert(error.message);
      setCompletions((current) => current.filter((row) => row.id !== existing.id));
      return;
    }

    const { data, error } = await supabase
      .from("habit_completions")
      .insert({ user_id: userId, item_id: item.id, completed_date: dateKey })
      .select()
      .single();

    if (error) return alert(error.message);
    setCompletions((current) => [...current, data]);
  }

  async function toggleTaskDone(item, dateKey) {
    const isAlreadyDoneOnThisDate = item.completed_date === dateKey;
    const nextData = isAlreadyDoneOnThisDate
      ? { completed_date: null, due_date: dateKey < todayKey ? todayKey : dateKey }
      : { completed_date: dateKey, due_date: dateKey };

    const { data, error } = await supabase
      .from("habit_items")
      .update(nextData)
      .eq("id", item.id)
      .select()
      .single();

    if (error) return alert(error.message);
    setItems((current) => current.map((row) => (row.id === item.id ? data : row)));
  }

  function isItemDone(item, dateKey) {
    if (item.type === "task") return item.completed_date === dateKey;
    return completions.some((row) => row.item_id === item.id && row.completed_date === dateKey);
  }

  function getTasksForDate(dateKey) {
    return tasks.filter((item) => {
      const wasMovedFromThisDate = rolloverHistory.some((row) => row.item_id === item.id && row.missed_date === dateKey);
      return item.due_date === dateKey || item.completed_date === dateKey || wasMovedFromThisDate;
    });
  }

  function getTodayTasks() {
    return tasks.filter((item) => (item.due_date <= todayKey && !item.completed_date) || item.completed_date === todayKey);
  }

  const todayTasks = getTodayTasks();
  const todayItems = [...todayTasks, ...habits];
  const todayDoneCount = todayItems.filter((item) => isItemDone(item, todayKey)).length;
  const todayProgress = todayItems.length ? Math.round((todayDoneCount / todayItems.length) * 100) : 0;

  if (!supabaseUrl || !supabaseAnonKey) {
    return <CenteredMessage title="Thiếu cấu hình Supabase" subtitle="Chị kiểm tra lại file .env nhé." />;
  }

  if (loading) {
    return <CenteredMessage title="Đang mở habit tracker..." subtitle="Chờ app tải dữ liệu một chút nhé." />;
  }

  if (!session) {
    return (
      <AuthScreen
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        authMode={authMode}
        setAuthMode={setAuthMode}
        message={authMessage}
        saving={saving}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF9F4] px-4 py-6 text-[#3F3A36] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 rounded-[28px] border border-[#F3D8D1] bg-white px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            {editingDisplayName ? (
              <div className="max-w-md space-y-2">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#F07167]">
                  Tên hiển thị
                </p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveDisplayName()}
                    className="min-w-0 flex-1 rounded-2xl border border-[#F3D8D1] bg-white px-4 py-3 text-lg font-black text-[#0A6962] outline-none focus:border-[#F07167]"
                    autoFocus
                  />

                  <button
                    onClick={saveDisplayName}
                    disabled={saving}
                    className="rounded-2xl bg-[#0081A7] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Lưu
                  </button>

                  <button
                    onClick={cancelEditDisplayName}
                    className="rounded-2xl bg-[#F6EEE9] px-4 py-2 text-sm font-bold text-[#756B66]"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#F07167]">
                    {displayName}
                  </p>

                  <button
                    onClick={() => setEditingDisplayName(true)}
                    className="rounded-full bg-[#FFF0EA] px-3 py-1 text-xs font-bold text-[#C65D54] hover:bg-[#F07167] hover:text-white"
                  >
                    Đổi tên
                  </button>
                </div>

                <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0A6962] md:text-4xl">
                  Habit Tracker
                </h1>

                <p className="mt-1 text-sm text-[#756B66]">
                  Theo dõi việc tuần và thói quen tháng thật gọn gàng.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#FFF0EA] px-4 py-2 text-sm font-bold text-[#C65D54]">
              Hôm nay: {todayProgress}%
            </span>

            <span className="rounded-full bg-[#EAF7FA] px-4 py-2 text-sm font-bold text-[#0081A7]">
              {session.user.email}
            </span>

            {!isInstalled && (
              <button
                onClick={handleInstallApp}
                className="rounded-full bg-[#0081A7] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                Cài app
              </button>
            )}

            <button
              onClick={signOut}
              className="rounded-full bg-[#F6EEE9] px-4 py-2 text-sm font-bold text-[#756B66] hover:bg-[#F07167] hover:text-white"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="space-y-5">
          <TodayBoard
            todayKey={todayKey}
            todayTasks={todayTasks}
            habits={habits}
            todayProgress={todayProgress}
            todayDoneCount={todayDoneCount}
            totalToday={todayItems.length}
            isItemDone={isItemDone}
            toggleDone={toggleDone}
            deleteItem={deleteItem}
            editingItemId={editingItemId}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            startEditItem={startEditItem}
            cancelEditItem={cancelEditItem}
            saveEditItem={saveEditItem}
          />

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card title="Thêm nhiệm vụ tuần" icon="📝">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="Ví dụ: Viết bài blog, quay video ngắn..."
                  className="min-w-0 flex-1 rounded-2xl border border-[#F3D8D1] bg-white px-4 py-3 outline-none focus:border-[#F07167]"
                />
                <input
                  type="date"
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate(e.target.value)}
                  className="rounded-2xl border border-[#F3D8D1] bg-white px-4 py-3 outline-none focus:border-[#F07167]"
                />
                <button disabled={saving} onClick={addTask} className="rounded-2xl bg-[#F07167] px-5 py-3 font-bold text-white disabled:opacity-60">Thêm</button>
              </div>
            </Card>

            <Card title="Thêm thói quen tháng" icon="🌿">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newHabit}
                  onChange={(e) => setNewHabit(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHabit()}
                  placeholder="Ví dụ: Uống nước, đọc sách, vẽ 15 phút..."
                  className="min-w-0 flex-1 rounded-2xl border border-[#CDE9EE] bg-white px-4 py-3 outline-none focus:border-[#0081A7]"
                />
                <button disabled={saving} onClick={addHabit} className="rounded-2xl bg-[#0081A7] px-5 py-3 font-bold text-white disabled:opacity-60">Thêm</button>
              </div>
            </Card>
          </section>

          <WeeklyTaskBoard
            weekDays={weekDays}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            getTasksForDate={getTasksForDate}
            isItemDone={isItemDone}
            toggleDone={toggleDone}
            deleteItem={deleteItem}
            editingItemId={editingItemId}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            startEditItem={startEditItem}
            cancelEditItem={cancelEditItem}
            saveEditItem={saveEditItem}
          />

          <MonthlyHabitTracker
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            monthDays={monthDays}
            habits={habits}
            isItemDone={isItemDone}
            toggleDone={toggleDone}
            deleteItem={deleteItem}
            editingItemId={editingItemId}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            startEditItem={startEditItem}
            cancelEditItem={cancelEditItem}
            saveEditItem={saveEditItem}
          />
        </main>
      </div>
    </div>
  );
}

function TodayBoard({ todayKey, todayTasks, habits, todayProgress, todayDoneCount, totalToday, isItemDone, toggleDone, deleteItem, editingItemId, editingTitle, setEditingTitle, startEditItem, cancelEditItem, saveEditItem }) {
  const todayLabel = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <section className="rounded-[28px] border border-[#F3D8D1] bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F07167]">Today</p>
          <h2 className="text-2xl font-black text-[#0A6962]">Hôm nay cần làm</h2>
          <p className="text-sm capitalize text-[#756B66]">{todayLabel}</p>
        </div>

        <div className="rounded-2xl bg-[#FFF0EA] px-5 py-3 text-right">
          <p className="text-xs font-bold text-[#A8564C]">Tiến độ hôm nay</p>
          <p className="text-3xl font-black text-[#F07167]">{todayProgress}%</p>
          <p className="text-xs text-[#A8564C]">{todayDoneCount}/{totalToday} mục đã xong</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayListPanel
          title="📝 Công việc hôm nay"
          countLabel={`${todayTasks.length} việc`}
          emptyText="Hôm nay chưa có công việc nào."
          tone="task"
        >
          {todayTasks.map((task) => (
            <TodayItem
              key={task.id}
              item={task}
              dateKey={todayKey}
              isItemDone={isItemDone}
              toggleDone={toggleDone}
              deleteItem={deleteItem}
              editingItemId={editingItemId}
              editingTitle={editingTitle}
              setEditingTitle={setEditingTitle}
              startEditItem={startEditItem}
              cancelEditItem={cancelEditItem}
              saveEditItem={saveEditItem}
            />
          ))}
        </TodayListPanel>

        <TodayListPanel
          title="🌿 Thói quen hôm nay"
          countLabel={`${habits.length} thói quen`}
          emptyText="Chưa có thói quen nào."
          tone="habit"
        >
          {habits.map((habit) => (
            <TodayItem
              key={habit.id}
              item={habit}
              dateKey={todayKey}
              isItemDone={isItemDone}
              toggleDone={toggleDone}
              deleteItem={deleteItem}
              editingItemId={editingItemId}
              editingTitle={editingTitle}
              setEditingTitle={setEditingTitle}
              startEditItem={startEditItem}
              cancelEditItem={cancelEditItem}
              saveEditItem={saveEditItem}
            />
          ))}
        </TodayListPanel>
      </div>
    </section>
  );
}

function TodayListPanel({ title, countLabel, emptyText, tone = "task", children }) {
  const isHabit = tone === "habit";
  const itemCount = React.Children.count(children);

  return (
    <div className={`rounded-[24px] border p-4 ${isHabit ? "border-[#D8ECF0] bg-[#F8FDFF]" : "border-[#F0E1D9] bg-[#FFFDFC]"}`}>
      <div className={`mb-3 flex items-center justify-between border-b pb-2 ${isHabit ? "border-[#D8ECF0]" : "border-[#F0E1D9]"}`}>
        <h3 className="font-black text-[#3F3A36]">{title}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isHabit ? "bg-[#EAF7FA] text-[#0081A7]" : "bg-[#FFF0EA] text-[#C65D54]"}`}>
          {countLabel}
        </span>
      </div>

      {itemCount === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-4 text-center text-sm text-[#9A8B85]">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#F0E1D9] bg-white divide-y divide-[#F0E1D9]">
          {children}
        </div>
      )}
    </div>
  );
}

function TodayItem({ item, dateKey, isItemDone, toggleDone, deleteItem, editingItemId, editingTitle, setEditingTitle, startEditItem, cancelEditItem, saveEditItem }) {
  const done = isItemDone(item, dateKey);
  const isEditing = editingItemId === item.id;

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-[#FFF9F4] sm:px-4 sm:py-3">
      <button
        onClick={() => toggleDone(item, dateKey)}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-black ${
          done ? "border-[#0081A7] bg-[#0081A7] text-white" : "border-[#C9B8B0] bg-white text-transparent"
        }`}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="space-y-2">
            <input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEditItem(item)}
              className="w-full rounded-xl border border-[#F3D8D1] px-3 py-2 text-sm font-bold outline-none focus:border-[#F07167]"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => saveEditItem(item)} className="rounded-full bg-[#0081A7] px-3 py-1 text-xs font-bold text-white">Lưu</button>
              <button onClick={cancelEditItem} className="rounded-full bg-[#F6EEE9] px-3 py-1 text-xs font-bold text-[#756B66]">Hủy</button>
            </div>
          </div>
        ) : (
          <>
            <p className={`text-sm font-bold leading-5 ${done ? "text-[#A0938E] line-through" : "text-[#3F3A36]"}`}>{item.title}</p>
            {item.type === "task" && item.rollover_count > 0 && !item.completed_date && (
              <p className="mt-1 text-xs font-bold text-[#C65D54]">Chuyển tiếp {item.rollover_count} ngày</p>
            )}
          </>
        )}
      </div>

      {!isEditing && (
        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
          <button
            onClick={() => startEditItem(item)}
            className="grid h-8 w-8 place-items-center rounded-full text-[#0081A7]/75 hover:bg-[#EAF7FA] hover:text-[#0081A7]"
            title="Sửa"
            aria-label="Sửa"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => deleteItem(item)}
            className="grid h-8 w-8 place-items-center rounded-full text-[#C65D54]/75 hover:bg-[#FFF0EA] hover:text-[#C65D54]"
            title="Xóa"
            aria-label="Xóa"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function AuthScreen({ email, setEmail, password, setPassword, showPassword, setShowPassword, authMode, setAuthMode, message, saving, onSubmit }) {
  const isLogin = authMode === "login";

  return (
    <div className="grid min-h-screen place-items-center bg-[#FFF9F4] px-4 py-8 text-[#3F3A36]">
      <div className="w-full max-w-md rounded-[32px] border border-[#F3D8D1] bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#F07167]">Ngọc Liên</p>
        <h1 className="mt-2 text-3xl font-black text-[#0A6962]">Habit Tracker</h1>
        <p className="mt-2 text-sm leading-6 text-[#756B66]">
          {isLogin ? "Đăng nhập bằng email và mật khẩu. App sẽ tự lưu phiên đăng nhập trên thiết bị này." : "Tạo tài khoản mới để lưu dữ liệu thói quen lâu dài."}
        </p>

        <div className="mt-5 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-2xl border border-[#F3D8D1] px-4 py-3 outline-none focus:border-[#F07167]"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Mật khẩu"
              className="w-full rounded-2xl border border-[#F3D8D1] px-4 py-3 pr-12 outline-none focus:border-[#F07167]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-[#756B66] hover:text-[#F07167]"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button disabled={saving} onClick={onSubmit} className="w-full rounded-2xl bg-[#F07167] px-5 py-3 font-black text-white disabled:opacity-60">
            {saving ? "Đang xử lý..." : isLogin ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </div>

        {message && <div className="mt-4 rounded-2xl bg-[#EAF7FA] px-4 py-3 text-sm leading-6 text-[#0081A7]">{message}</div>}

        <button
          onClick={() => {
            setAuthMode(isLogin ? "signup" : "login");
          }}
          className="mt-4 text-sm font-bold text-[#0081A7] hover:underline"
        >
          {isLogin ? "Chưa có tài khoản? Tạo tài khoản mới" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}

function WeeklyTaskBoard({ weekDays, selectedDate, setSelectedDate, getTasksForDate, isItemDone, toggleDone, deleteItem, editingItemId, editingTitle, setEditingTitle, startEditItem, cancelEditItem, saveEditItem }) {
  const weekLabel = `${weekDays[0].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} - ${weekDays[6].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  return (
    <section className="rounded-[28px] border border-[#F3D8D1] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F07167]">Weekly Tasks</p>
          <h2 className="text-2xl font-black text-[#0A6962]">Bảng nhiệm vụ tuần</h2>
          <p className="text-sm text-[#756B66]">{weekLabel}</p>
        </div>
        <input
          type="date"
          value={getDateKey(selectedDate)}
          onChange={(e) => setSelectedDate(parseDateKey(e.target.value))}
          className="rounded-2xl border border-[#F3D8D1] bg-[#FFFDFC] px-4 py-3 outline-none focus:border-[#F07167]"
        />
      </div>

      <div className="grid gap-2 md:grid-cols-7">
        {weekDays.map((day, index) => {
          const dateKey = getDateKey(day);
          const dayTasks = getTasksForDate(dateKey);
          return (
            <div key={dateKey} className="min-h-[140px] rounded-[18px] border border-[#F0E1D9] bg-[#FFFDFC] p-2">
              <div className="mb-2 border-b border-[#F0E1D9] pb-1.5 text-center">
                <p className="text-sm font-black text-[#0081A7]">{WEEK_LABELS[index]}</p>
                <p className="text-xs text-[#756B66]">{day.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</p>
              </div>

              <div className="space-y-2">
                {dayTasks.length === 0 ? (
                  <p className="rounded-xl bg-[#FFF9F4] px-2 py-2 text-center text-xs text-[#A0918B]">Trống</p>
                ) : (
                  dayTasks.map((task) => (
                    <div key={`${dateKey}-${task.id}`} className="group flex items-start gap-1.5 rounded-xl bg-[#FFF9F4] px-2 py-1.5">
                      <button onClick={() => toggleDone(task, dateKey)} className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] font-black ${isItemDone(task, dateKey) ? "border-[#0081A7] bg-[#0081A7] text-white" : "border-[#C9B8B0] bg-white text-transparent"}`}>✓</button>
                      {editingItemId === task.id ? (
                        <div className="flex-1 space-y-2">
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveEditItem(task)}
                            className="w-full rounded-xl border border-[#F3D8D1] px-2 py-1 text-xs font-bold outline-none focus:border-[#F07167]"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button onClick={() => saveEditItem(task)} className="rounded-full bg-[#0081A7] px-2 py-1 text-[11px] font-bold text-white">Lưu</button>
                            <button onClick={cancelEditItem} className="rounded-full bg-[#F6EEE9] px-2 py-1 text-[11px] font-bold text-[#756B66]">Hủy</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className={`flex-1 break-words text-xs leading-4 ${isItemDone(task, dateKey) ? "text-[#A0938E] line-through" : "text-[#3F3A36]"}`}>{task.title}</span>
                          <div className="hidden gap-1 group-hover:flex">
                            <button
                              onClick={() => startEditItem(task)}
                              className="grid h-6 w-6 place-items-center rounded-full text-[#0081A7]/75 hover:bg-[#EAF7FA] hover:text-[#0081A7]"
                              title="Sửa"
                              aria-label="Sửa"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteItem(task)}
                              className="grid h-6 w-6 place-items-center rounded-full text-[#C65D54]/75 hover:bg-[#FFF0EA] hover:text-[#C65D54]"
                              title="Xóa"
                              aria-label="Xóa"
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthlyHabitTracker({
  selectedDate,
  setSelectedDate,
  monthDays,
  habits,
  isItemDone,
  toggleDone,
  deleteItem,
  editingItemId,
  editingTitle,
  setEditingTitle,
  startEditItem,
  cancelEditItem,
  saveEditItem,
}) {
  return (
    <section className="rounded-[28px] border border-[#F3D8D1] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F07167]">Habit Tracker</p>
          <h2 className="text-2xl font-black text-[#0A6962]">{getMonthLabel(selectedDate)}</h2>
          <p className="text-sm text-[#756B66]">Đánh dấu những ngày đã thực hiện được từng thói quen.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setSelectedDate(addDays(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), -1))}
            className="rounded-full bg-[#FFF0EA] px-4 py-2 text-sm font-bold text-[#C65D54]"
          >
            Tháng trước
          </button>
          <button
            onClick={() => setSelectedDate(addDays(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1), 0))}
            className="rounded-full bg-[#EAF7FA] px-4 py-2 text-sm font-bold text-[#0081A7]"
          >
            Tháng sau
          </button>
        </div>
      </div>

      {habits.length === 0 ? (
        <div className="rounded-[22px] border border-[#F0E1D9] bg-[#FFFDFC] px-4 py-8 text-center text-[#8D7E77]">
          Chưa có thói quen nào. Chị thêm thói quen ở phía trên nhé.
        </div>
      ) : (
        <>
          {/* Mobile layout */}
          <div className="space-y-4 md:hidden">
            {habits.map((habit) => {
              const doneCount = monthDays.filter((day) => isItemDone(habit, getDateKey(day))).length;
              const isEditing = editingItemId === habit.id;

              return (
                <div key={habit.id} className="rounded-[22px] border border-[#F0E1D9] bg-[#FFFDFC] p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEditItem(habit)}
                        className="w-full rounded-xl border border-[#F3D8D1] px-3 py-2 text-sm font-bold outline-none focus:border-[#F07167]"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEditItem(habit)} className="rounded-full bg-[#0081A7] px-3 py-1 text-xs font-bold text-white">Lưu</button>
                        <button onClick={cancelEditItem} className="rounded-full bg-[#F6EEE9] px-3 py-1 text-xs font-bold text-[#756B66]">Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-[#3F3A36]">{habit.title}</div>
                        <div className="mt-1 text-xs text-[#9A8B85]">{doneCount}/{monthDays.length} ngày</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => startEditItem(habit)}
                          className="grid h-9 w-9 place-items-center rounded-full text-[#0081A7]/75 hover:bg-[#EAF7FA] hover:text-[#0081A7]"
                          title="Sửa"
                          aria-label="Sửa"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteItem(habit)}
                          className="grid h-9 w-9 place-items-center rounded-full text-[#C65D54]/75 hover:bg-[#FFF0EA] hover:text-[#C65D54]"
                          title="Xóa"
                          aria-label="Xóa"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-7 gap-2">
                    {monthDays.map((day) => {
                      const dateKey = getDateKey(day);
                      const done = isItemDone(habit, dateKey);
                      return (
                        <div key={`${habit.id}-${dateKey}`} className="flex flex-col items-center gap-1">
                          <span className="text-[11px] font-bold text-[#8D7E77]">{day.getDate()}</span>
                          <button
                            onClick={() => toggleDone(habit, dateKey)}
                            className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-black transition ${done ? "border-[#F07167] bg-[#FAD1D0] text-[#9E3F3C]" : "border-[#C9B8B0] bg-white text-transparent hover:border-[#F07167]"}`}
                            title={dateKey}
                          >
                            ✓
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop/tablet layout */}
          <div className="hidden overflow-x-auto rounded-[22px] border border-[#F0E1D9] md:block">
            <table className="w-full min-w-[1100px] border-collapse bg-[#FFFDFC] text-sm">
              <thead>
                <tr className="border-b border-[#E7D5CC] bg-[#FFF4F1]">
                  <th className="sticky left-0 z-20 min-w-[240px] bg-[#FFF4F1] px-4 py-3 text-left font-black text-[#3F3A36]">Habit</th>
                  {monthDays.map((day) => (
                    <th key={getDateKey(day)} className="px-2 py-3 text-center font-black text-[#756B66]">{day.getDate()}</th>
                  ))}
                  <th className="sticky right-0 z-20 min-w-[120px] bg-[#FFF4F1] px-4 py-3 text-center font-black text-[#3F3A36]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {habits.map((habit) => {
                  const doneCount = monthDays.filter((day) => isItemDone(habit, getDateKey(day))).length;
                  const isEditing = editingItemId === habit.id;

                  return (
                    <tr key={habit.id} className="border-b border-[#F0E1D9] last:border-b-0">
                      <td className="sticky left-0 z-10 bg-[#FFFDFC] px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && saveEditItem(habit)}
                              className="w-full rounded-xl border border-[#F3D8D1] px-3 py-2 text-sm font-bold outline-none focus:border-[#F07167]"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={() => saveEditItem(habit)} className="rounded-full bg-[#0081A7] px-3 py-1 text-xs font-bold text-white">Lưu</button>
                              <button onClick={cancelEditItem} className="rounded-full bg-[#F6EEE9] px-3 py-1 text-xs font-bold text-[#756B66]">Hủy</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-[#3F3A36]">{habit.title}</div>
                            <div className="mt-1 text-xs text-[#9A8B85]">{doneCount}/{monthDays.length} ngày</div>
                          </div>
                        )}
                      </td>

                      {monthDays.map((day) => {
                        const dateKey = getDateKey(day);
                        const done = isItemDone(habit, dateKey);
                        return (
                          <td key={`${habit.id}-${dateKey}`} className="px-2 py-3 text-center">
                            <button
                              onClick={() => toggleDone(habit, dateKey)}
                              className={`mx-auto grid h-7 w-7 place-items-center rounded-full border text-sm font-black transition ${done ? "border-[#F07167] bg-[#FAD1D0] text-[#9E3F3C]" : "border-[#C9B8B0] bg-white text-transparent hover:border-[#F07167]"}`}
                              title={dateKey}
                            >
                              ✓
                            </button>
                          </td>
                        );
                      })}

                      <td className="sticky right-0 z-10 bg-[#FFFDFC] px-4 py-3">
                        {!isEditing && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => startEditItem(habit)}
                              className="grid h-8 w-8 place-items-center rounded-full text-[#0081A7]/75 hover:bg-[#EAF7FA] hover:text-[#0081A7]"
                              title="Sửa"
                              aria-label="Sửa"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteItem(habit)}
                              className="grid h-8 w-8 place-items-center rounded-full text-[#C65D54]/75 hover:bg-[#FFF0EA] hover:text-[#C65D54]"
                              title="Xóa"
                              aria-label="Xóa"
                            >
                              <CloseIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}


function Card({ title, icon, children }) {
  return (
    <section className="rounded-[28px] border border-[#F3D8D1] bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-black text-[#0A6962]"><span>{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function PencilIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function CloseIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CenteredMessage({ title, subtitle }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#FFF9F4] px-4 text-center text-[#3F3A36]">
      <div className="rounded-[32px] border border-[#F3D8D1] bg-white p-8 shadow-sm">
        <div className="mb-4 text-4xl">🌱</div>
        <h1 className="text-2xl font-black text-[#0A6962]">{title}</h1>
        <p className="mt-2 text-[#756B66]">{subtitle}</p>
      </div>
    </div>
  );
}
