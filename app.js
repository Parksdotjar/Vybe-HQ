import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hjyqbsvmhcrkzbnvsnbx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqeXFic3ZtaGNya3pibnZzbmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjA2NTgsImV4cCI6MjA4Mzk5NjY1OH0.CRCkps-aiZ4mbOygFd6IxdxLiiHbUOh_VTHsc4RYvbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const appEl = document.getElementById("app");
const authModalEl = document.getElementById("authModal");

const chatEl = document.getElementById("chat");
const statusEl = document.getElementById("status");
const authStatusEl = document.getElementById("authStatus");
const channelListEl = document.getElementById("channels");
const channelTitleEl = document.getElementById("channelTitle");

const channelNameEl = document.getElementById("channelName");
const createChannelBtn = document.getElementById("createChannel");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");

const loginBtn = document.getElementById("login");
const signupBtn = document.getElementById("signup");
const logoutBtn = document.getElementById("logout");

const sendForm = document.getElementById("sendForm");
const msgInput = document.getElementById("message");

let messagesChannel = null;
let channelsChannel = null;
let currentChannelId = null;
let currentChannelName = null;

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

function setStatus(text) {
  statusEl.textContent = text;
  if (!authModalEl.classList.contains("hidden")) {
    authStatusEl.textContent = text;
  }
}

function setAuthVisible(show) {
  authModalEl.classList.toggle("hidden", !show);
  appEl.setAttribute("aria-hidden", show ? "true" : "false");
}

function resetChat() {
  chatEl.innerHTML = "";
  seenIds.clear();
}

function clearChannels() {
  channelListEl.innerHTML = "";
  currentChannelId = null;
  currentChannelName = null;
  channelTitleEl.textContent = "Select a channel";
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

function addChannelRow(channel) {
  if (!channel?.id || !channel?.name) return;
  if (channelListEl.querySelector(`[data-id="${channel.id}"]`)) return;

  const btn = document.createElement("button");
  btn.className = "channel-btn";
  btn.dataset.id = channel.id;
  btn.textContent = `# ${channel.name}`;
  btn.addEventListener("click", () => selectChannel(channel));

  channelListEl.appendChild(btn);

  if (!currentChannelId) {
    selectChannel(channel);
  }
}

function updateActiveChannelButton() {
  const buttons = channelListEl.querySelectorAll(".channel-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === currentChannelId);
  });
}

async function loadMessages() {
  if (!currentChannelId) {
    resetChat();
    setStatus("Select a channel to load messages.");
    return;
  }

  resetChat();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", currentChannelId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    setStatus("Load error: " + error.message);
    return;
  }

  setStatus(`Logged in | Loaded ${data.length} messages`);
  for (const m of data) addMessageRow(m);

  chatEl.scrollTop = chatEl.scrollHeight;
}

async function loadChannels() {
  clearChannels();

  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    setStatus("Channel load error: " + error.message);
    return;
  }

  for (const c of data) addChannelRow(c);

  if (!data.length) {
    setStatus("No channels yet. Create one to start chatting.");
  }
}

async function ensureMessagesSubscribed() {
  if (!currentChannelId) return;

  if (messagesChannel) {
    await supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }

  messagesChannel = supabase
    .channel(`vybe-messages-${currentChannelId}`, { config: { broadcast: { ack: true } } })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${currentChannelId}` },
      (payload) => addMessageRow(payload.new)
    )
    .subscribe((state) => {
      const base = statusEl.textContent.includes("Logged in")
        ? statusEl.textContent.split(" | ")[0]
        : "Logged in";
      setStatus(`${base} | Realtime: ${state}`);
    });
}

async function ensureChannelsSubscribed() {
  if (channelsChannel) return;

  channelsChannel = supabase
    .channel("vybe-channels", { config: { broadcast: { ack: true } } })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "channels" },
      (payload) => addChannelRow(payload.new)
    )
    .subscribe();
}

async function teardownRealtime() {
  if (messagesChannel) {
    await supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }
  if (channelsChannel) {
    await supabase.removeChannel(channelsChannel);
    channelsChannel = null;
  }
}

function selectChannel(channel) {
  if (!channel?.id) return;
  if (currentChannelId === channel.id) return;

  currentChannelId = channel.id;
  currentChannelName = channel.name;
  channelTitleEl.textContent = `# ${currentChannelName}`;
  updateActiveChannelButton();

  loadMessages();
  ensureMessagesSubscribed();
}

function setLoggedInUI(loggedIn) {
  loginBtn.style.display = loggedIn ? "none" : "";
  signupBtn.style.display = loggedIn ? "none" : "";
  logoutBtn.style.display = loggedIn ? "" : "none";
  sendForm.style.display = loggedIn ? "flex" : "none";
  createChannelBtn.disabled = !loggedIn;
  channelNameEl.disabled = !loggedIn;

  setAuthVisible(!loggedIn);

  if (!loggedIn) {
    setStatus("Not logged in");
  }
}

async function refreshAuthUI() {
  const { data } = await supabase.auth.getSession();
  setLoggedInUI(!!data.session);
}

loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus("Login error: " + error.message);
    return;
  }

  await refreshAuthUI();
  await loadChannels();
  await ensureChannelsSubscribed();
});

signupBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) setStatus("Signup error: " + error.message);
  else setStatus("Account created! Now log in.");
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

createChannelBtn.addEventListener("click", async () => {
  const name = channelNameEl.value.trim();
  if (!name) {
    setStatus("Enter a channel name.");
    return;
  }

  const { error } = await supabase.from("channels").insert({ name });
  if (error) {
    setStatus("Channel create error: " + error.message);
    return;
  }

  channelNameEl.value = "";
});

sendForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const content = msgInput.value.trim();
  if (!content) return;
  if (!currentChannelId) {
    setStatus("Pick a channel before sending messages.");
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    setStatus("You must be logged in.");
    return;
  }

  const display_name = user.email?.split("@")[0] ?? "user";

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
    channel_id: currentChannelId,
  });

  if (error) {
    setStatus("Send error: " + error.message);
  }
});

// On refresh: if already logged in, load + subscribe once
await refreshAuthUI();
const session = await supabase.auth.getSession();
if (session.data.session) {
  await loadChannels();
  await ensureChannelsSubscribed();
}

supabase.auth.onAuthStateChange(async (event, session) => {
  const loggedIn = !!session;
  setLoggedInUI(loggedIn);

  if (loggedIn) {
    await loadChannels();
    await ensureChannelsSubscribed();
  } else {
    await teardownRealtime();
    clearChannels();
    resetChat();
  }
});
