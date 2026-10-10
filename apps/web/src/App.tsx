import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  Home as HomeIcon,
  LayoutList,
  LifeBuoy,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Gradebook } from "./Gradebook";
import { TokenExpiryReminder } from "./TokenExpiry";
import { SUPPORT_DISCORD_URL } from "./support";
import type { Assignment, Snapshot } from "../../../packages/domain/src";
import {
  accountKey,
  api,
  ApiError,
  clearCache,
  clearLocalData,
  defaults,
  readCache,
  readPrefs,
  saveCache,
  savePrefs,
  type Preferences,
} from "./data";
import {
  Assignments,
  Calendar,
  Courses,
  Detail,
  Empty,
  fmtFull,
  Home,
  Settings,
  type ViewProps,
} from "./views";

const navItems = [
  { icon: HomeIcon, name: "Home", path: "/" },
  { icon: LayoutList, name: "Assignments", path: "/assignments" },
  { icon: CalendarDays, name: "Calendar", path: "/calendar" },
  { icon: BookOpen, name: "Courses", path: "/courses" },
  { icon: BookOpenCheck, name: "Gradebook", path: "/gradebook" },
  { icon: SettingsIcon, name: "Settings", path: "/settings" },
];
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [prefs, setPrefs] = useState<Preferences>({ ...defaults });
  const [phase, setPhase] = useState<"loading" | "ready" | "login" | "error">(
    "loading",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine);
  const [requiresLogin, setRequiresLogin] = useState(false),
    [selected, setSelected] = useState<Assignment | null>(null),
    [now, setNow] = useState(new Date());
  const busyRef = useRef(false),
    dataRef = useRef(data),
    sessionEpoch = useRef(0);
  const assignmentVisibility = useRef<{ key: string; hidden: string[] }>({
    key: "",
    hidden: [],
  });
  dataRef.current = data;
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const location = useLocation();
  const acceptData = useCallback(async (next: Snapshot) => {
    const p = readPrefs(accountKey(next));
    if (dataRef.current && accountKey(dataRef.current) !== accountKey(next))
      await clearCache();
    setData(next);
    dataRef.current = next;
    setPrefs(p);
    setPhase("ready");
    if (p.offline)
      try {
        await saveCache(next);
      } catch {
        setError(
          "Offline storage is unavailable in this browser. Your live workspace still works.",
        );
      }
  }, []);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const epoch = sessionEpoch.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<Snapshot>("sync", "POST");
      if (epoch !== sessionEpoch.current) return;
      await acceptData(next);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearCache();
        setData(null);
        setSelected(null);
        setPhase("login");
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Refresh failed. Previous data was kept.",
        );
        if (!dataRef.current) setPhase("error");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [acceptData]);
  const start = useCallback(async () => {
    setError("");
    try {
      const boot = await api<{
        authenticated: boolean;
        requiresLogin: boolean;
      }>("bootstrap");
      setRequiresLogin(boot.requiresLogin);
      if (!boot.authenticated) {
        await clearCache();
        setData(null);
        setPhase("login");
        return;
      }
      const snapshot = await api<Snapshot | null>("snapshot");
      if (snapshot) await acceptData(snapshot);
      await refresh();
    } catch {
      try {
        const cached = await readCache();
        if (cached && readPrefs(accountKey(cached)).offline) {
          await acceptData(cached);
          setOffline(true);
          setError("Connection unavailable. Showing saved assignments.");
          return;
        }
      } catch {
        /* storage can be disabled */
      }
      setError(
        "The app server is unavailable. If it is waking up, try again in a moment.",
      );
      setPhase("error");
    }
  }, [acceptData, refresh]);
  useEffect(() => {
    void start();
  }, [start]);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 30000);
    const syncIfStale = () => {
      update();
      if (
        document.visibilityState === "visible" &&
        dataRef.current &&
        (!dataRef.current.fetchedAt ||
          Date.now() - Date.parse(dataRef.current.fetchedAt) > 300000)
      )
        void refresh();
    };
    const online = () => {
        setOffline(false);
        if (dataRef.current) void refresh();
      },
      off = () => setOffline(true);
    const interval = setInterval(syncIfStale, 300000);
    window.addEventListener("online", online);
    window.addEventListener("offline", off);
    window.addEventListener("focus", syncIfStale);
    document.addEventListener("visibilitychange", syncIfStale);
    return () => {
      clearInterval(timer);
      clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", syncIfStale);
      document.removeEventListener("visibilitychange", syncIfStale);
    };
  }, [refresh]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : prefs.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme]);
  const updatePrefs = (patch: Partial<Preferences>) => {
    if (!data) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      savePrefs(accountKey(data), next);
    } catch {
      setError("This browser could not save your preferences.");
    }
    if (patch.offline === false)
      void clearCache().catch(() =>
        setError("Could not clear offline data. Try clearing browser storage."),
      );
    if (patch.offline === true)
      void saveCache(data).catch(() =>
        setError("Offline storage is unavailable in this browser."),
      );
  };
  const logout = async () => {
    sessionEpoch.current++;
    try {
      await api("logout", "POST");
      await clearLocalData();
      setData(null);
      dataRef.current = null;
      setSelected(null);
      setPrefs({ ...defaults });
      setPhase("login");
    } catch {
      setError("Sign out needs a connection. Reconnect and try again.");
    }
  };
  const clearData = async () => {
    try {
      await clearLocalData();
      setPrefs({ ...defaults });
      setError("Saved assignments and preferences cleared from this device.");
    } catch {
      setError(
        "Could not clear saved data. Try your browser’s site storage settings.",
      );
    }
  };
  if (phase === "login") return <Login onSuccess={start} />;
  if (!data)
    return (
      <div className="center-screen">
        <img src="/favicon.svg" alt="Better Canvas" width="52" />
        <h1>
          {phase === "error" ? "Let’s reconnect." : "Opening your workspace…"}
        </h1>
        <p>{error || "Getting your assignments ready."}</p>
        {phase === "error" && (
          <button className="button primary" onClick={() => void start()}>
            Try again
          </button>
        )}
      </div>
    );
  const title =
    navItems.find((n) => n.path === location.pathname)?.name ?? "Assignments";
  const selectedSync = data.sync.filter(
    (s) => !prefs.hidden.includes(s.courseId),
  );
  const incomplete =
    !!data.error || selectedSync.some((s) => !!s.error || !s.successAt);
  const stale = selectedSync.some(
    (s) => !s.successAt || now.getTime() - Date.parse(s.successAt) > 900000,
  );
  const freshness = offline
    ? "Offline"
    : incomplete
      ? "Some data unavailable"
      : stale
        ? "Update needed"
        : "Up to date";
  const visibilityKey = `${accountKey(data)}:${location.pathname}:${new URLSearchParams(location.search).get("filter") ?? "all"}`;
  if (assignmentVisibility.current.key !== visibilityKey)
    assignmentVisibility.current = {
      key: visibilityKey,
      hidden: [...prefs.hiddenAssignments],
    };
  const props: ViewProps = {
    data,
    prefs,
    updatePrefs,
    now,
    open: setSelected,
    hiddenAtEntry: assignmentVisibility.current.hidden,
  };
  return (
    <div className={`shell${title === "Gradebook" ? " gradebook-shell" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <img src="/favicon.svg" alt="" />
          better<span>canvas</span>
        </Link>
        <div className="workspace-label">MY WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map(({ icon: Icon, name, path }) => (
            <NavLink key={path} to={path} end aria-label={name}>
              <Icon size={20} />
              <span className="nav-label-full">{name}</span>
              <span className="nav-label-short" aria-hidden="true">
                {name === "Assignments"
                  ? "Tasks"
                  : name === "Gradebook"
                    ? "Grades"
                    : name}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={17} />
          <span>Your personal Canvas companion</span>
        </div>
        <TokenExpiryReminder date={prefs.canvasTokenExpiry} now={now} />
        <a
          className="sidebar-support"
          href={SUPPORT_DISCORD_URL}
          target="_blank"
          rel="noreferrer"
        >
          <LifeBuoy size={17} />
          <span>Support on Discord</span>
        </a>
        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">
            <BookOpenCheck size={16} />
          </span>
          <div>
            <strong>{data.demo ? "Demo workspace" : "Canvas connected"}</strong>
            <small>
              {data.demo
                ? "Sample data · add your Canvas key"
                : "Read-only: courses, assignments, submissions"}
            </small>
          </div>
        </div>
      </aside>
      <main id="main-content">
        <header className="topbar">
          <span>
            <Link
              className="topbar-logo"
              to="/"
              aria-label="Better Canvas home"
            >
              <img src="/favicon.svg" alt="" width="28" height="28" />
            </Link>
            <span className="workspace-name">Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </span>
          <span>
            <span className={data.demo ? "demo-pill" : "connection-pill"}>
              {offline ? (
                <WifiOff size={14} />
              ) : data.demo ? null : (
                <ShieldCheck size={14} />
              )}{" "}
              {data.demo ? "Demo workspace" : freshness}
            </span>
            {/* The Gradebook page portals its disconnect button in here, so the
                control sits with the rest of the topbar while its connection
                state stays inside <Gradebook>. Empty on every other page. */}
            <div id="gb-topbar-actions" className="gb-topbar-actions" />
          </span>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {title === "Home"
                  ? new Intl.DateTimeFormat("en-US", {
                      timeZone: prefs.zone,
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                      .format(now)
                      .toUpperCase()
                  : "YOUR WORKSPACE"}
              </p>
              <h1>{title === "Home" ? "Let’s make progress." : title}</h1>
              <p>
                {
                  (
                    {
                      Home: "Your classes. Your assignments. One clear next step.",
                      Assignments:
                        "Every assignment, with its status in plain sight.",
                      Calendar: "A little more perspective on what’s ahead.",
                      Courses: "Make room for the classes that matter.",
                      Gradebook: "Your StudentVUE grades, with a clearer view.",
                      Settings: "Make this workspace yours.",
                    } as Record<string, string>
                  )[title]
                }
              </p>
            </div>
            {title !== "Gradebook" && (
              <button
                className="button refresh-button"
                aria-label={
                  busy ? "Refreshing assignments" : "Refresh assignments"
                }
                disabled={busy || offline}
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} className={busy ? "spin" : ""} />
                <span>{busy ? "Refreshing" : "Refresh"}</span>
              </button>
            )}
          </div>
          {data.demo && title !== "Gradebook" && (
            <div className="demo-banner">
              <span>
                Sample assignments · This is a preview of your workspace.
              </span>
              <Link to="/settings">
                Connect Canvas <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {title !== "Gradebook" &&
            (offline || incomplete || stale || error) && (
              <div role="status" className="notice">
                <AlertCircle size={18} />
                <div>
                  {error ||
                    data.error ||
                    (offline
                      ? "Offline — showing saved assignments."
                      : incomplete
                        ? "Some courses could not update. Previous data is still shown."
                        : "These assignments have not been checked in more than 15 minutes.")}{" "}
                  <Link to="/settings">View connection details</Link>
                </div>
              </div>
            )}
          {needRefresh && (
            <div className="notice">
              An app update is ready.{" "}
              <button
                className="text-button"
                onClick={() => void updateServiceWorker(true)}
              >
                Update now
              </button>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <Home {...props} incomplete={incomplete || stale || offline} />
              }
            />
            <Route path="/assignments" element={<Assignments {...props} />} />
            <Route path="/calendar" element={<Calendar {...props} />} />
            <Route path="/courses" element={<Courses {...props} />} />
            <Route
              path="/gradebook"
              element={<Gradebook demoWorkspace={data.demo} />}
            />
            <Route
              path="/settings"
              element={
                <Settings
                  {...props}
                  logout={requiresLogin ? logout : undefined}
                  clearData={clearData}
                />
              }
            />
            <Route
              path="*"
              element={
                <Empty
                  title="That page isn’t here."
                  text="Your workspace is one click away."
                  action={
                    <Link to="/" className="button">
                      Go home
                    </Link>
                  }
                />
              }
            />
          </Routes>
          {title !== "Gradebook" && (
            <footer className="page-footer">
              <span>
                {data.demo
                  ? "Demo data"
                  : `Checked ${data.fetchedAt ? fmtFull(data.fetchedAt, prefs.zone) : "not yet"}`}{" "}
                · {prefs.zone.replaceAll("_", " ")}
              </span>
              <a href={data.account.origin} target="_blank" rel="noreferrer">
                Open Canvas ↗
              </a>
            </footer>
          )}
        </div>
      </main>
      {selected && (
        <Detail
          a={
            data.assignments.find(
              (a) => a.id === selected.id && a.courseId === selected.courseId,
            ) ?? selected
          }
          {...props}
          close={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function Login({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("login", "POST", { password });
      setPassword("");
      await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/favicon.svg" alt="" width="48" />
        <p className="eyebrow">BETTER CANVAS</p>
        <h1>Your workspace awaits.</h1>
        <p>Sign in with your app passphrase to see your assignments.</p>
        <form onSubmit={submit}>
          <label htmlFor="password">App passphrase</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="field-help">
            Use the separate passphrase you set for this app.
          </p>
          {error && (
            <p className="red-text" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Open my workspace"}
            <ArrowRight size={16} />
          </button>
        </form>
        <small>Your Canvas password is never needed here.</small>
      </div>
    </div>
  );
}
