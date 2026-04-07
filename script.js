/* =========================================================
   L'Oreal Chatbot Frontend Logic
   Organized into: setup, storage helpers, rendering, API, events
   ========================================================= */

/* ---------- DOM references ---------- */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const newChatBtn = document.getElementById("newChatBtn");
const saveChatBtn = document.getElementById("saveChatBtn");
const deleteChatBtn = document.getElementById("deleteChatBtn");
const chatLibrarySelect = document.getElementById("chatLibrarySelect");

/* ---------- App configuration ---------- */
const workerUrl = "https://loreal-worker.liwinsto.workers.dev/";
const legacyHistoryStorageKey = "lorealChatHistory";
const libraryStorageKey = "lorealChatLibrary";
const activeConversationIdKey = "lorealActiveConversationId";
const maxHistoryMessages = 12;
const assistantDisplayName = "Ava";

// This sets the assistant's role and boundaries for every API request.
const systemMessage = {
  role: "system",
  content:
    "You are a L'Oreal beauty assistant. Only answer questions about L'Oreal products, beauty routines, skincare, makeup, haircare, fragrance, and product-related financial topics like pricing, deals, and discounts. For pricing, deals, or discount questions, add a brief note that prices and offers can vary by region, retailer, and time, and suggest checking official L'Oreal or retailer pages for the latest details. If the question is outside this scope, politely refuse and redirect to beauty-related topics.",
};

/* ---------- App state ---------- */
let conversationHistory = [];
let conversationLibrary = [];
let activeConversationId = "";

/* ---------- Domain keywords ---------- */
const lorealKeywords = [
  "loreal",
  "l'oreal",
  "price",
  "pricing",
  "cost",
  "budget",
  "deal",
  "deals",
  "discount",
  "discounts",
  "sale",
  "promo",
  "promotion",
  "coupon",
  "offer",
  "makeup",
  "foundation",
  "mascara",
  "lipstick",
  "skincare",
  "serum",
  "moisturizer",
  "sunscreen",
  "haircare",
  "shampoo",
  "conditioner",
  "fragrance",
  "routine",
  "skin",
  "hair",
  "beauty",
  "product",
  "recommend",
];

/* ---------- Storage and data helpers ---------- */

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.filter(
    (message) =>
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim() !== "",
  );
}

function isLikelyCustomTitle(title) {
  return (
    !/^Chat \d+$/.test(title || "") &&
    title !== "Untitled chat" &&
    title !== "Imported chat"
  );
}

function loadConversationLibrary() {
  const savedLibrary = localStorage.getItem(libraryStorageKey);
  if (!savedLibrary) {
    return [];
  }

  try {
    const parsedLibrary = JSON.parse(savedLibrary);
    if (!Array.isArray(parsedLibrary)) {
      return [];
    }

    return parsedLibrary
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title || "Untitled chat",
        isCustomTitle:
          typeof conversation.isCustomTitle === "boolean"
            ? conversation.isCustomTitle
            : isLikelyCustomTitle(conversation.title),
        createdAt: conversation.createdAt || new Date().toISOString(),
        updatedAt: conversation.updatedAt || new Date().toISOString(),
        messages: sanitizeMessages(conversation.messages),
      }))
      .filter((conversation) => conversation.id);
  } catch (error) {
    console.error("Could not load saved chat library:", error);
    return [];
  }
}

function saveConversationLibrary() {
  localStorage.setItem(libraryStorageKey, JSON.stringify(conversationLibrary));
}

function createConversation(title) {
  return {
    id: `chat-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    title,
    isCustomTitle: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function createTitleFromUserMessage(messageText) {
  const text = messageText.toLowerCase();

  if (
    text.includes("skincare") ||
    text.includes("serum") ||
    text.includes("moisturizer")
  ) {
    return "Skincare Advice";
  }

  if (
    text.includes("makeup") ||
    text.includes("foundation") ||
    text.includes("mascara") ||
    text.includes("lipstick")
  ) {
    return "Makeup Help";
  }

  if (
    text.includes("haircare") ||
    text.includes("shampoo") ||
    text.includes("conditioner") ||
    text.includes("hair")
  ) {
    return "Haircare Tips";
  }

  if (text.includes("fragrance") || text.includes("perfume")) {
    return "Fragrance Picks";
  }

  if (text.includes("routine")) {
    return "Beauty Routine";
  }

  if (text.includes("recommend")) {
    return "Product Recommendations";
  }

  const trimmed = messageText.trim();
  if (!trimmed) {
    return "New Chat";
  }

  const firstWords = trimmed.split(/\s+/).slice(0, 5).join(" ");
  return firstWords.length > 40 ? `${firstWords.slice(0, 40)}...` : firstWords;
}

function maybeAutoNameActiveConversation() {
  const activeConversation = conversationLibrary.find(
    (conversation) => conversation.id === activeConversationId,
  );

  if (!activeConversation || activeConversation.isCustomTitle) {
    return;
  }

  const firstUserMessage = conversationHistory.find(
    (message) => message.role === "user",
  );

  if (!firstUserMessage) {
    return;
  }

  activeConversation.title = createTitleFromUserMessage(
    firstUserMessage.content,
  );
}

function migrateLegacyHistoryIfNeeded() {
  const savedHistory = localStorage.getItem(legacyHistoryStorageKey);
  if (!savedHistory) {
    return;
  }

  try {
    const parsedHistory = JSON.parse(savedHistory);

    if (!Array.isArray(parsedHistory) || parsedHistory.length === 0) {
      localStorage.removeItem(legacyHistoryStorageKey);
      return;
    }

    // If a modern library already exists, just clear the old key.
    if (conversationLibrary.length > 0) {
      localStorage.removeItem(legacyHistoryStorageKey);
      return;
    }

    const migratedConversation = createConversation("Imported chat");
    migratedConversation.messages = sanitizeMessages(parsedHistory);
    conversationLibrary.push(migratedConversation);
    saveConversationLibrary();
    localStorage.removeItem(legacyHistoryStorageKey);
  } catch (error) {
    console.error("Could not migrate legacy chat history:", error);
  }
}

function saveActiveConversationHistory() {
  const activeConversation = conversationLibrary.find(
    (conversation) => conversation.id === activeConversationId,
  );

  if (!activeConversation) {
    return;
  }

  activeConversation.messages = [...conversationHistory];
  maybeAutoNameActiveConversation();
  activeConversation.updatedAt = new Date().toISOString();
  saveConversationLibrary();
  renderConversationLibrary();
}

/* ---------- Rendering ---------- */

function setActiveConversation(conversationId) {
  activeConversationId = conversationId;
  localStorage.setItem(activeConversationIdKey, activeConversationId);

  const activeConversation = conversationLibrary.find(
    (conversation) => conversation.id === activeConversationId,
  );

  conversationHistory = activeConversation
    ? [...activeConversation.messages]
    : [];
  renderConversationLibrary();
  renderConversationHistory();
}

function renderConversationLibrary() {
  chatLibrarySelect.innerHTML = "";

  conversationLibrary.forEach((conversation, index) => {
    const option = document.createElement("option");
    option.value = conversation.id;
    option.textContent = `${index + 1}. ${conversation.title}`;
    option.selected = conversation.id === activeConversationId;
    chatLibrarySelect.appendChild(option);
  });
}

// Rebuilds all visible messages from the active conversation.
function renderConversationHistory() {
  chatWindow.innerHTML = "";

  if (conversationHistory.length === 0) {
    addMessage(
      assistantDisplayName,
      "Hello! Ask me about L'Oreal products and routines.",
      false,
    );
    return;
  }

  conversationHistory.forEach((message) => {
    const sender = message.role === "user" ? "You" : assistantDisplayName;
    addMessage(sender, message.content, false);
  });
}

// Creates one bubble row and appends it to the chat window.
function addMessage(sender, text, shouldAnimate = true) {
  const isUser = sender === "You";

  const row = document.createElement("div");
  row.className = `message-row ${isUser ? "user" : "assistant"}`;
  if (shouldAnimate) {
    row.classList.add("message-row-enter");
  }

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  if (shouldAnimate) {
    bubble.classList.add("bubble-enter");
  }

  const senderLabel = document.createElement("span");
  senderLabel.className = "message-sender";
  senderLabel.textContent = sender;

  const messageText = document.createElement("p");
  messageText.className = "message-text";
  messageText.textContent = text;

  bubble.appendChild(senderLabel);
  bubble.appendChild(messageText);
  row.appendChild(bubble);
  chatWindow.appendChild(row);

  if (shouldAnimate) {
    window.requestAnimationFrame(() => {
      chatWindow.scrollTop = chatWindow.scrollHeight;
    });
    return;
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------- Relevance and API helpers ---------- */

function isLorealRelevant(question) {
  const normalizedQuestion = question.toLowerCase();
  return lorealKeywords.some((word) => normalizedQuestion.includes(word));
}

function hasPreviousLorealContext() {
  const userMessages = conversationHistory.filter(
    (message) => message.role === "user",
  );
  return userMessages.some((message) => isLorealRelevant(message.content));
}

function buildMessagesForApi(currentQuestion) {
  const recentHistory = conversationHistory.slice(-maxHistoryMessages);

  return [
    systemMessage,
    ...recentHistory,
    {
      role: "user",
      content: currentQuestion,
    },
  ];
}

function addOutOfScopeReply(question) {
  const outOfScopeReply =
    "I can help with L'Oreal products, skincare, makeup, haircare, beauty routines, and product pricing/deals/discount questions. Please ask a L'Oreal beauty-related question.";

  addMessage(assistantDisplayName, outOfScopeReply);
  conversationHistory.push({ role: "user", content: question });
  conversationHistory.push({ role: "assistant", content: outOfScopeReply });
  saveActiveConversationHistory();
}

async function fetchAssistantReply(question) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: buildMessagesForApi(question),
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  return (
    data.choices[0]?.message?.content ||
    "I couldn't generate a response just now."
  );
}

/* ---------- Startup ---------- */

function initializeApp() {
  conversationLibrary = loadConversationLibrary();
  migrateLegacyHistoryIfNeeded();

  if (conversationLibrary.length === 0) {
    conversationLibrary.push(createConversation("Chat 1"));
  }

  const savedActiveConversationId = localStorage.getItem(
    activeConversationIdKey,
  );
  const hasSavedActiveConversation = conversationLibrary.some(
    (conversation) => conversation.id === savedActiveConversationId,
  );

  activeConversationId = hasSavedActiveConversation
    ? savedActiveConversationId
    : conversationLibrary[0].id;

  setActiveConversation(activeConversationId);
}

/* ---------- Event handlers ---------- */

chatLibrarySelect.addEventListener("change", (event) => {
  setActiveConversation(event.target.value);
});

newChatBtn.addEventListener("click", () => {
  const nextChatNumber = conversationLibrary.length + 1;
  const newConversation = createConversation(`Chat ${nextChatNumber}`);
  conversationLibrary.unshift(newConversation);
  saveConversationLibrary();
  setActiveConversation(newConversation.id);
  userInput.focus();
});

saveChatBtn.addEventListener("click", () => {
  const activeConversation = conversationLibrary.find(
    (conversation) => conversation.id === activeConversationId,
  );

  if (!activeConversation) {
    return;
  }

  const newTitle = prompt("Name this chat:", activeConversation.title);
  if (!newTitle) {
    return;
  }

  activeConversation.title = newTitle.trim() || activeConversation.title;
  activeConversation.isCustomTitle = true;
  activeConversation.updatedAt = new Date().toISOString();
  saveConversationLibrary();
  renderConversationLibrary();
});

deleteChatBtn.addEventListener("click", () => {
  if (conversationLibrary.length === 0) {
    return;
  }

  const selectedConversationId =
    chatLibrarySelect.value || activeConversationId;
  const selectedConversation = conversationLibrary.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  if (!selectedConversation) {
    alert("Please select a chat from the list first.");
    return;
  }

  const confirmed = confirm(
    `Delete this chat: "${selectedConversation.title}"? This cannot be undone.`,
  );

  if (!confirmed) {
    return;
  }

  conversationLibrary = conversationLibrary.filter(
    (conversation) => conversation.id !== selectedConversation.id,
  );

  // Keep at least one chat so the app always has an active conversation.
  if (conversationLibrary.length === 0) {
    conversationLibrary.push(createConversation("Chat 1"));
  }

  const isActiveConversationDeleted =
    selectedConversation.id === activeConversationId;
  saveConversationLibrary();

  if (isActiveConversationDeleted) {
    setActiveConversation(conversationLibrary[0].id);
  } else {
    renderConversationLibrary();
  }

  userInput.focus();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();
  if (!question) {
    return;
  }

  addMessage("You", question);
  userInput.value = "";

  // Allow off-topic follow-ups only when the conversation already has beauty context.
  if (!isLorealRelevant(question) && !hasPreviousLorealContext()) {
    addOutOfScopeReply(question);
    return;
  }

  try {
    // Cloudflare Worker forwards this request to OpenAI.
    const reply = await fetchAssistantReply(question);
    addMessage(assistantDisplayName, reply);

    conversationHistory.push({ role: "user", content: question });
    conversationHistory.push({ role: "assistant", content: reply });
    saveActiveConversationHistory();
  } catch (error) {
    addMessage(
      assistantDisplayName,
      "Sorry, something went wrong. Please try again.",
    );
    console.error("API error:", error);
  }
});

initializeApp();
