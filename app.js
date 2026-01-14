import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hjyqbsvmhcrkzbnvsnbx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqeXFic3ZtaGNya3pibnZzbmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjA2NTgsImV4cCI6MjA4Mzk5NjY1OH0.CRCkps-aiZ4mbOygFd6IxdxLiiHbUOh_VTHsc4RYvbc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chatEl = document.getElementById("chat");
const statusEl = document.getElementById("status");
const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const sendForm = document.getElementById("sendForm");
const msgInput = document.getElementById("message");

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function addMessageRow(m) {
  const div = document.createElement("div");
  div.className = "msg";
  const when = new Date(m.created_at).toLocaleString();
  const name = m.display_name || "staff";
  div.innerHTML = `
    <div><b>${escapeHtml(name)}:</b> ${escapeHtml(m.content)}</div>
    <div class="meta">${when}</div>
  `;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function loadMessages() {
  chatEl.innerHTML = "";
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    statusEl.textContent = "Load error: " + error.message;
    return;
  }
  data.forEach(addMessageRow);
}

async function refreshAuthUI() {
  const { data } = await supabase.auth.getSession();
  const loggedIn = !!data.session;

  loginBtn.style.display = loggedIn ? "none" : "";
  logoutBtn.style.display = loggedIn ? "" : "none";
  sendForm.style.display = loggedIn ? "flex" : "none";

  statusEl.textContent = loggedIn ? "Logged in ✅" : "Not logged in";
}

// Login (email+password) :contentReference[oaicite:8]{index=8}
loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) statusEl.textContent = "Login error: " + error.message;
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

sendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = msgInput.value.trim();
  if (!content) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    statusEl.textContent = "You must log in.";
    return;
  }

  const display_name = user.email?.split("@")[0] ?? "staff";

  const { error } = await supabase.from("messages").insert({
    user_id: user.id,
    display_name,
    content,
  });

  if (error) statusEl.textContent = "Send error: " + error.message;
  else msgInput.value = "";
});

// Realtime: listen for INSERTs (live messages)
// Requires table in supabase_realtime publication :contentReference[oaicite:9]{index=9}
supabase
  .channel("vybe-chat")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => addMessageRow(payload.new)
  )
  .subscribe();

supabase.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  await loadMessages();
});

// initial
await refreshAuthUI();
if ((await supabase.auth.getSession()).data.session) await loadMessages();
