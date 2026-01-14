import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hjyqbsvmhcrkzbnvsnbx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqeXFic3ZtaGNya3pibnZzbmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjA2NTgsImV4cCI6MjA4Mzk5NjY1OH0.CRCkps-aiZ4mbOygFd6IxdxLiiHbUOh_VTHsc4RYvbc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🔗 DOM ELEMENTS
const chatEl = document.getElementById("chat");
const statusEl = document.getElementById("status");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");

const loginBtn = document.getElementById("login");
const signupBtn = document.getElementById("signup");
const logoutBtn = document.getElementById("logout");

const sendForm = document.getElementById("sendForm");
const msgInput = document.getElementById("message");

// 🧼 ESCAPE HTML (SECURITY)
function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

// 💬 ADD MESSAGE TO UI
function addMessageRow(msg) {
  const div = document.createElement("div");
  div.className = "msg";

  const time = new Date(msg.created_at).toLocaleTimeString();
  const name = msg.display_name || "user";

  div.innerHTML = `
    <div><b>${escapeHtml(name)}:</b> ${escapeHtml(msg.content)}</div>
    <div class="meta">${time}</div>
  `;

  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// 📥 LOAD EXISTING MESSAGES
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

// 🔐 AUTH UI STATE
async function refreshAuthUI() {
  const { data } = await supabase.auth.getSession();
  const loggedIn = !!data.session;

  loginBtn.style.display = loggedIn ? "none" : "";
  signupBtn.style.display = loggedIn ? "none" : "";
  logoutBtn.style.display = loggedIn ? "" : "";

  sendForm.style.display = loggedIn ? "flex" : "none";

  statusEl.textContent = loggedIn
    ? "Logged in ✅"
    : "Not logged in";
}

// 🔑 LOGIN
loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    statusEl.textContent = "Login error: " + error.message;
  }
});

// 🆕 SIGN UP (PUBLIC ACCOUNT CREATION)
signupBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    statusEl.textContent = "Signup error: " + error.message;
  } else {
    statusEl.textContent = "Account created! You can now log in.";
  }
});

// 🚪 LOG OUT
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

// ✉️ SEND MESSAGE
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

  const { error } = await supabase.from("messages").insert({
    user_id: user.id,
    display_name,
    content,
  });

  if (error) {
    statusEl.textContent = "Send error: " + error.message;
  } else {
    msgInput.value = "";
  }
});

// ⚡ REALTIME CHAT LISTENER
supabase
  .channel("live-chat")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => addMessageRow(payload.new)
  )
  .subscribe();

// 🔁 AUTH STATE CHANGE HANDLER
supabase.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  await loadMessages();
});

// 🚀 INITIAL LOAD
await refreshAuthUI();
const session = await supabase.auth.getSession();
if (session.data.session) {
  await loadMessages();
}
