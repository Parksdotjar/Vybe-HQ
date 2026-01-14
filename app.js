import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hjyqbsvmhcrkzbnvsnbx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqeXFic3ZtaGNya3pibnZzbmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjA2NTgsImV4cCI6MjA4Mzk5NjY1OH0.CRCkps-aiZ4mbOygFd6IxdxLiiHbUOh_VTHsc4RYvbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chatEl = document.getElementById("chat");
const statusEl = document.getElementById("status");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");

const loginBtn = document.getElementById("login");
const signupBtn = document.getElementById("signup");
const logoutBtn = document.getElementById("logout");

const sendForm = document.getElementById("sendForm");
const msgInput = document.getElementById("message");

let channel = null;
const seenIds = new Set();

function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

function addMessageRow(msg) {
  if (!msg?.id) return;
  if (seenIds.has(msg.id)) return;
  seenIds.add(msg.id);

  const shouldAutoScroll = isNearBottom(chatEl);

  const div = document.createElement("div");
  div.className = "msg";

  const when = new Date(msg.created_at).toLocaleString();
  const name = msg.display_name || "user";

  div.innerHTML = `
    <div class="line">
      <span class="name">${escapeHtml(name)}</span>
      <span class="time">${escapeHtml(when)}</span>
    </div>
    <div class="content">${escapeHtml(msg.content)}</div>
  `;

  chatEl.appendChild(div);

  if (shouldAutoScroll) {
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

async function loadMessages() {
  chatEl.innerHTML = "";
  seenIds.clear();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    statusEl.textContent = "Load error: " + error.message;
    return;
  }

  statusEl.textContent = `Logged in ✅ | Loaded ${data.length} messages`;
  for (const m of data) addMessageRow(m);

  chatEl.scrollTop = chatEl.scrollHeight;
}

async function refreshAuthUI() {
  const { data } = await supabase.auth.getSession();
  const loggedIn = !!data.session;

  loginBtn.style.display = loggedIn ? "none" : "";
  signupBtn.style.display = loggedIn ? "none" : "";
  logoutBtn.style.display = loggedIn ? "" : "none";
  sendForm.style.display = loggedIn ? "flex" : "none";

  if (!loggedIn) statusEl.textContent = "Not logged in";
}

async function ensureRealtimeSubscribed() {
  // prevent duplicate subscriptions
  if (channel) return;

  channel = supabase
    .channel("vybe-chat", { config: { broadcast: { ack: true } } })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => addMessageRow(payload.new)
    )
    .subscribe((state) => {
      // states: SUBSCRIBED / TIMED_OUT / CLOSED / CHANNEL_ERROR
      const base = statusEl.textContent.includes("Logged in")
        ? statusEl.textContent.split(" | ")[0]
        : statusEl.textContent;
      statusEl.textContent = `${base} | Realtime: ${state}`;
    });
}

async function teardownRealtime() {
  if (!channel) return;
  await supabase.removeChannel(channel);
  channel = null;
}

loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    statusEl.textContent = "Login error: " + error.message;
    return;
  }

  await refreshAuthUI();
  await loadMessages();
  await ensureRealtimeSubscribed();
});

signupBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) statusEl.textContent = "Signup error: " + error.message;
  else statusEl.textContent = "Account created! Now log in.";
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await teardownRealtime();
  await refreshAuthUI();
  chatEl.innerHTML = "";
  seenIds.clear();
});

sendForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const content = msgInput.value.trim();
  if (!content) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    statusEl.textContent = "You must be logged in.";
    return;
  }

  const display_name = user.email?.split("@")[0] ?? "user";

  // Optimistic UI (feels faster)
  const tempId = "temp-" + crypto.randomUUID();
  addMessageRow({
    id: tempId,
    created_at: new Date().toISOString(),
    display_name,
    content,
  });

  msgInput.value = "";

  const { error } = await supabase.from("messages").insert({
    user_id: user.id,
    display_name,
    content,
  });

  if (error) {
    statusEl.textContent = "Send error: " + error.message;
  }
});

// On refresh: if already logged in, load + subscribe once
await refreshAuthUI();
const session = await supabase.auth.getSession();
if (session.data.session) {
  await loadMessages();
  await ensureRealtimeSubscribed();
}
