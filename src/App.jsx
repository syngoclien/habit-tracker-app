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
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#F07167]">Ngọc Liên</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0A6962] md:text-4xl">Habit Tracker</h1>
            <p className="mt-1 text-sm text-[#756B66]">Theo dõi việc tuần và thói quen tháng thật gọn gàng.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#FFF0EA] px-4 py-2 text-sm font-bold text-[#C65D54]">Hôm nay: {todayProgress}%</span>
            <span className="rounded-full bg-[#EAF7FA] px-4 py-2 text-sm font-bold text-[#0081A7]">{session.user.email}</span>
            {!isInstalled && (
              <button
                onClick={handleInstallApp}
                className="rounded-full bg-[#0081A7] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                Cài app
              </button>
            )}
            <button onClick={signOut} className="rounded-full bg-[#F6EEE9] px-4 py-2 text-sm font-bold text-[#756B66] hover:bg-[#F07167] hover:text-white">Đăng xuất</button>
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
          />

          <MonthlyHabitTracker
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            monthDays={monthDays}
            habits={habits}
            isItemDone={isItemDone}
            toggleDone={toggleDone}
            deleteItem={deleteItem}
          />
        </main>
      </div>
    </div>
  );
}

function TodayBoard({ todayKey, todayTasks, habits, todayProgress, todayDoneCount, totalToday, isItemDone, toggleDone, deleteItem }) {
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
        <div className="rounded-[24px] border border-[#F0E1D9] bg-[#FFFDFC] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-[#F0E1D9] pb-2">
            <h3 className="font-black text-[#3F3A36]">📝 Công việc hôm nay</h3>
            <span className="rounded-full bg-[#FFF0EA] px-3 py-1 text-xs font-bold text-[#C65D54]">{todayTasks.length} việc</span>
          </div>

          <div className="space-y-2">
            {todayTasks.length === 0 ? (
              <p className="rounded-2xl bg-[#FFF9F4] px-4 py-4 text-center text-sm text-[#9A8B85]">Hôm nay chưa có công việc nào.</p>
            ) : (
              todayTasks.map((task) => (
                <TodayItem
                  key={task.id}
                  item={task}
                  dateKey={todayKey}
                  isItemDone={isItemDone}
                  toggleDone={toggleDone}
                  deleteItem={deleteItem}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#D8ECF0] bg-[#F8FDFF] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-[#D8ECF0] pb-2">
            <h3 className="font-black text-[#3F3A36]">🌿 Thói quen hôm nay</h3>
            <span className="rounded-full bg-[#EAF7FA] px-3 py-1 text-xs font-bold text-[#0081A7]">{habits.length} thói quen</span>
          </div>

          <div className="space-y-2">
            {habits.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-4 text-center text-sm text-[#9A8B85]">Chưa có thói quen nào.</p>
            ) : (
              habits.map((habit) => (
                <TodayItem
                  key={habit.id}
                  item={habit}
                  dateKey={todayKey}
                  isItemDone={isItemDone}
                  toggleDone={toggleDone}
                  deleteItem={deleteItem}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TodayItem({ item, dateKey, isItemDone, toggleDone, deleteItem }) {
  const done = isItemDone(item, dateKey);

  return (
    <div className="group flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#F0E1D9] transition hover:-translate-y-0.5 hover:shadow-sm">
      <button
        onClick={() => toggleDone(item, dateKey)}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-black ${
          done ? "border-[#0081A7] bg-[#0081A7] text-white" : "border-[#C9B8B0] bg-white text-transparent"
        }`}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold leading-5 ${done ? "text-[#A0938E] line-through" : "text-[#3F3A36]"}`}>{item.title}</p>
        {item.type === "task" && item.rollover_count > 0 && !item.completed_date && (
          <p className="mt-1 text-xs font-bold text-[#C65D54]">Chuyển tiếp {item.rollover_count} ngày</p>
        )}
      </div>

      <button onClick={() => deleteItem(item)} className="hidden rounded-full bg-[#FFF0EA] px-3 py-1 text-xs font-bold text-[#C65D54] group-hover:block hover:bg-[#F07167] hover:text-white">
        Xóa
      </button>
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

function WeeklyTaskBoard({ weekDays, selectedDate, setSelectedDate, getTasksForDate, isItemDone, toggleDone, deleteItem }) {
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

      <div className="grid gap-3 md:grid-cols-7">
        {weekDays.map((day, index) => {
          const dateKey = getDateKey(day);
          const dayTasks = getTasksForDate(dateKey);
          return (
            <div key={dateKey} className="min-h-[170px] rounded-[22px] border border-[#F0E1D9] bg-[#FFFDFC] p-3">
              <div className="mb-3 border-b border-[#F0E1D9] pb-2 text-center">
                <p className="text-sm font-black text-[#0081A7]">{WEEK_LABELS[index]}</p>
                <p className="text-xs text-[#756B66]">{day.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</p>
              </div>

              <div className="space-y-2">
                {dayTasks.length === 0 ? (
                  <p className="rounded-2xl bg-[#FFF9F4] px-3 py-3 text-center text-xs text-[#A0918B]">Trống</p>
                ) : (
                  dayTasks.map((task) => (
                    <div key={`${dateKey}-${task.id}`} className="group flex items-start gap-2 rounded-2xl bg-[#FFF9F4] px-3 py-2">
                      <button onClick={() => toggleDone(task, dateKey)} className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${isItemDone(task, dateKey) ? "border-[#0081A7] bg-[#0081A7] text-white" : "border-[#C9B8B0] bg-white text-transparent"}`}>✓</button>
                      <span className={`flex-1 text-sm leading-5 ${isItemDone(task, dateKey) ? "text-[#A0938E] line-through" : "text-[#3F3A36]"}`}>{task.title}</span>
                      <button onClick={() => deleteItem(task)} className="hidden text-xs font-bold text-[#C65D54] group-hover:block">×</button>
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

function MonthlyHabitTracker({ selectedDate, setSelectedDate, monthDays, habits, isItemDone, toggleDone, deleteItem }) {
  return (
    <section className="rounded-[28px] border border-[#F3D8D1] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F07167]">Habit Tracker</p>
          <h2 className="text-2xl font-black text-[#0A6962]">{getMonthLabel(selectedDate)}</h2>
          <p className="text-sm text-[#756B66]">Đánh dấu những ngày đã thực hiện được từng thói quen.</p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setSelectedDate(addDays(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), -1))} className="rounded-full bg-[#FFF0EA] px-4 py-2 text-sm font-bold text-[#C65D54]">Tháng trước</button>
          <button onClick={() => setSelectedDate(addDays(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1), 0))} className="rounded-full bg-[#EAF7FA] px-4 py-2 text-sm font-bold text-[#0081A7]">Tháng sau</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[22px] border border-[#F0E1D9]">
        <table className="w-full min-w-[980px] border-collapse bg-[#FFFDFC] text-sm">
          <thead>
            <tr className="border-b border-[#E7D5CC] bg-[#FFF4F1]">
              <th className="sticky left-0 z-10 min-w-[220px] bg-[#FFF4F1] px-4 py-3 text-left font-black text-[#3F3A36]">Habit</th>
              {monthDays.map((day) => (
                <th key={getDateKey(day)} className="px-2 py-3 text-center font-black text-[#756B66]">{day.getDate()}</th>
              ))}
              <th className="min-w-[60px] px-3 py-3 text-center font-black text-[#756B66]">Xóa</th>
            </tr>
          </thead>
          <tbody>
            {habits.length === 0 ? (
              <tr>
                <td colSpan={monthDays.length + 2} className="px-4 py-8 text-center text-[#8D7E77]">Chưa có thói quen nào. Chị thêm thói quen ở phía trên nhé.</td>
              </tr>
            ) : (
              habits.map((habit) => {
                const doneCount = monthDays.filter((day) => isItemDone(habit, getDateKey(day))).length;
                return (
                  <tr key={habit.id} className="border-b border-[#F0E1D9] last:border-b-0">
                    <td className="sticky left-0 z-10 bg-[#FFFDFC] px-4 py-3">
                      <div className="font-bold text-[#3F3A36]">{habit.title}</div>
                      <div className="text-xs text-[#9A8B85]">{doneCount}/{monthDays.length} ngày</div>
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
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => deleteItem(habit)} className="rounded-full bg-[#FFF0EA] px-3 py-1 text-xs font-bold text-[#C65D54] hover:bg-[#F07167] hover:text-white">Xóa</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
