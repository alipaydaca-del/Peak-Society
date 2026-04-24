/* ═══════════════════════════════════════════════
   PEAK SOCIETY — APP.JS
   Front-end logic: auth, forum, admin, channels
═══════════════════════════════════════════════ */

"use strict";

/* ─────────────────────────────────────────────
   SECURITY HELPERS
───────────────────────────────────────────── */
const sanitize = (str) => {
  const div = document.createElement("div");
  div.textContent = String(str).slice(0, 2000);
  return div.innerHTML;
};

const sanitizeHTML = (html) => {
  const allowedTags = [
    "b",
    "strong",
    "i",
    "em",
    "u",
    "br",
    "ul",
    "ol",
    "li",
    "p",
    "span",
  ];
  const allowedAttrs = ["style"];
  const template = document.createElement("template");
  template.innerHTML = html;
  const clean = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!allowedTags.includes(node.tagName.toLowerCase())) {
        node.replaceWith(document.createTextNode(node.textContent));
        return;
      }
      [...node.attributes].forEach((attr) => {
        if (!allowedAttrs.includes(attr.name)) node.removeAttribute(attr.name);
      });
    }
    [...node.childNodes].forEach(clean);
  };
  [...template.content.childNodes].forEach(clean);
  const div = document.createElement("div");
  div.appendChild(template.content);
  return div.innerHTML;
};

const csrfToken = crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36);

// Initialize Supabase — credentials loaded from server via /config.js
const SUPABASE_URL =
  (window.__CONFIG__ && window.__CONFIG__.SUPABASE_URL) || "";
const SUPABASE_ANON_KEY =
  (window.__CONFIG__ && window.__CONFIG__.SUPABASE_ANON_KEY) || "";

let sbClient = null;
try {
  // Ensure the browser loaded window.supabase before app.js
  if (window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.sbClient = sbClient;
    console.log("Supabase initialized successfully.");
  } else {
    console.error(
      "Supabase SDK not found on window object. Is it loaded in index.html?",
    );
  }
} catch (error) {
  console.error("Failed to initialize Supabase:", error);
}

/* ─────────────────────────────────────────────
   STATE — Supabase-backed store
───────────────────────────────────────────── */
const Store = (() => {
  const defaults = {
    auditLog: [],
    notifications: [],
    session: null,
    adminSession: null,
  };

  const memoryKeys = [
    "users",
    "posts",
    "comments",
    "likes",
    "announcements",
    "reports",
    "lessons",
    "user_progress",
  ];
  const memoryData = {
    users: [],
    posts: [],
    comments: [],
    likes: [],
    announcements: [],
    reports: [],
    lessons: [],
    user_progress: [],
  };

  const get = (key) => {
    if (memoryKeys.includes(key)) return memoryData[key];
    try {
      const raw = localStorage.getItem("ps_" + key);
      return raw ? JSON.parse(raw) : defaults[key] || [];
    } catch {
      return defaults[key] || [];
    }
  };

  const _localSet = (key, val) => {
    if (memoryKeys.includes(key)) {
      memoryData[key] = val;
      return;
    }
    try {
      localStorage.setItem("ps_" + key, JSON.stringify(val));
    } catch {}
  };

  const set = async (key, val, skipDb = false) => {
    _localSet(key, val);
    // Push changes to Supabase async
    if (!skipDb && sbClient && key !== "session" && key !== "adminSession") {
      try {
        if (memoryKeys.includes(key)) {
          // Handled individually by calling sbClient.from(...).insert/upsert directly
        } else {
          await sbClient
            .from("store")
            .upsert({ id: key, data: JSON.stringify(val) });
        }
      } catch (err) {
        console.error("Supabase Save Error:", err);
      }
    }
  };

  // Init defaults if not set locally
  ["auditLog", "notifications"].forEach((k) => {
    if (localStorage.getItem("ps_" + k) === null)
      _localSet(k, defaults[k] || []);
  });

  const handleRealtimeUpdate = (table, payload) => {
    let current = memoryData[table] || [];
    if (payload.eventType === "INSERT") {
      let newItem = payload.new;
      if (table === "posts")
        newItem = {
          ...newItem,
          body: newItem.content || newItem.body,
          comments: newItem.commentsCount ?? newItem.comments,
          date: newItem.created_at || newItem.date,
          likedBy: newItem.likedBy || [],
        };
      if (table === "announcements")
        newItem = {
          ...newItem,
          subject: newItem.title || newItem.subject,
          body: newItem.content || newItem.body,
          authorId: newItem.author || newItem.authorId,
          date: newItem.created_at || newItem.date,
        };
      if (table === "comments")
        newItem = {
          ...newItem,
          postId: newItem.postId,
          userId: newItem.userId,
          body: newItem.content || newItem.body,
          date: newItem.created_at || newItem.date,
        };
      if (table === "likes")
        newItem = {
          ...newItem,
          postId: newItem.postId || newItem.postid,
          userId: newItem.userId || newItem.userid,
        };
      current.unshift(newItem);
    } else if (payload.eventType === "UPDATE") {
      let newItem = payload.new;
      if (table === "posts")
        newItem = {
          ...newItem,
          body: newItem.content || newItem.body,
          comments: newItem.commentsCount ?? newItem.comments,
          date: newItem.created_at || newItem.date,
          likedBy: newItem.likedBy || [],
        };
      if (table === "announcements")
        newItem = {
          ...newItem,
          subject: newItem.title || newItem.subject,
          body: newItem.content || newItem.body,
          authorId: newItem.author || newItem.authorId,
          date: newItem.created_at || newItem.date,
        };
      if (table === "comments")
        newItem = {
          ...newItem,
          postId: newItem.postId,
          userId: newItem.userId,
          body: newItem.content || newItem.body,
          date: newItem.created_at || newItem.date,
        };
      if (table === "likes")
        newItem = {
          ...newItem,
          postId: newItem.postId || newItem.postid,
          userId: newItem.userId || newItem.userid,
        };
      const idx = current.findIndex((x) => x.id === newItem.id);
      if (idx !== -1) current[idx] = newItem;
      else current.unshift(newItem);
    } else if (payload.eventType === "DELETE") {
      current = current.filter((x) => x.id !== payload.old.id);
    }
    _localSet(table, current);

    // Dispatch granular events if needed, but for now we dispatch the same general event
    window.dispatchEvent(new CustomEvent("ps_db_updated", { detail: table }));
  };

  // Real-time Supabase Synchronization
  if (sbClient) {
    // 1. Fetch initial explicit tables with limits
    sbClient
      .from("users")
      .select("*")
      .limit(50)
      .then(({ data, error }) => {
        if (data) {
          _localSet("users", data);
          window.dispatchEvent(
            new CustomEvent("ps_db_updated", { detail: "users" }),
          );
        }
      });

    sbClient
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (data) {
          _localSet("reports", data);
          window.dispatchEvent(
            new CustomEvent("ps_db_updated", { detail: "reports" }),
          );
        }
      });

    // Pagination for posts
    sbClient
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (data) {
          data = data.map((p) => ({
            ...p,
            body: p.content || p.body,
            comments: p.commentsCount ?? p.comments,
            date: p.created_at || p.date,
            likedBy: p.likedBy || [],
          }));
          _localSet("posts", data);
          window.dispatchEvent(
            new CustomEvent("ps_db_updated", { detail: "posts" }),
          );
        }
      });

    sbClient
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (data) {
          data = data.map((a) => ({
            ...a,
            subject: a.title || a.subject,
            body: a.content || a.body,
            authorId: a.author || a.authorId,
            date: a.created_at || a.date,
          }));
          _localSet("announcements", data);
          window.dispatchEvent(
            new CustomEvent("ps_db_updated", { detail: "announcements" }),
          );
        }
      });

    ["lessons", "user_progress"].forEach((cat) => {
      sbClient
        .from(cat)
        .select("*")
        .then(({ data, error }) => {
          if (data) {
            _localSet(cat, data);
            window.dispatchEvent(
              new CustomEvent("ps_db_updated", { detail: cat }),
            );
          }
        });
    });

    // Fetch initial store subsets (legacy non-relational values)
    ["auditLog", "notifications"].forEach((k) => {
      sbClient
        .from("store")
        .select("*")
        .eq("id", k)
        .maybeSingle()
        .then(({ data, error }) => {
          if (data && data.data) {
            try {
              _localSet(k, JSON.parse(data.data));
              window.dispatchEvent(
                new CustomEvent("ps_db_updated", { detail: k }),
              );
            } catch (e) {}
          } else if (!data) {
            sbClient
              .from("store")
              .upsert({ id: k, data: JSON.stringify(get(k)) })
              .then(() => {});
          }
        });
    });

    // 2. Realtime Subscriptions
    sbClient
      .channel("public:users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => handleRealtimeUpdate("users", payload),
      )
      .subscribe();
    sbClient
      .channel("public:reports")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports" },
        (payload) => handleRealtimeUpdate("reports", payload),
      )
      .subscribe();
    sbClient
      .channel("public:posts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        (payload) => handleRealtimeUpdate("posts", payload),
      )
      .subscribe();
    sbClient
      .channel("public:comments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        (payload) => handleRealtimeUpdate("comments", payload),
      )
      .subscribe();
    sbClient
      .channel("public:likes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "likes" },
        (payload) => handleRealtimeUpdate("likes", payload),
      )
      .subscribe();
    sbClient
      .channel("public:announcements")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        (payload) => handleRealtimeUpdate("announcements", payload),
      )
      .subscribe();

    sbClient
      .channel("public:store")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store" },
        (payload) => {
          const row = payload.new;
          if (row && row.id) {
            try {
              _localSet(row.id, JSON.parse(row.data));
              window.dispatchEvent(
                new CustomEvent("ps_db_updated", { detail: row.id }),
              );
            } catch (e) {}
          }
        },
      )
      .subscribe();
  }

  return { get, set };
})();

/* ─────────────────────────────────────────────
   NOTIFICATIONS ENGINE
───────────────────────────────────────────── */
const navBell = document.getElementById("navBell");
const notificationDropdown = document.getElementById("notificationDropdown");
const notificationWrapper = document.getElementById("notificationWrapper");
const notificationBadge = document.getElementById("notificationBadge");
const notificationList = document.getElementById("notificationList");
const markAllReadBtn = document.getElementById("markAllReadBtn");

let audioCtx = null;
const playNotificationSound = () => {
  try {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    // Create a crisp "ding" synth bell
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      1400,
      audioCtx.currentTime + 0.1,
    );

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + 0.5,
    );

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
};

const dispatchNotification = (
  targetUserId,
  type,
  title,
  body,
  actionData = null,
) => {
  let notifs = Store.get("notifications") || [];
  const newNotif = {
    id: "n" + Date.now() + Math.floor(Math.random() * 1000),
    userId: targetUserId,
    type,
    title,
    body,
    actionData,
    read: false,
    date: new Date().toISOString(),
  };
  notifs.push(newNotif);

  // Clean up notifications older than 7 days
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  notifs = notifs.filter((n) => new Date(n.date).getTime() > oneWeekAgo);

  Store.set("notifications", notifs);

  const currentSession = Store.get("session");
  if (
    currentSession &&
    (targetUserId === "all" || targetUserId === currentSession.userId)
  ) {
    playNotificationSound();
    renderNotifications();
  }
};

const renderNotifications = () => {
  if (!notificationWrapper) return;
  const session = Store.get("session");
  if (!session) {
    notificationWrapper.style.display = "none";
    return;
  }
  notificationWrapper.style.display = "block";

  let allNotifs = Store.get("notifications") || [];

  // Clean up notifications older than 7 days for all users
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const validNotifs = allNotifs.filter(
    (n) => new Date(n.date).getTime() > oneWeekAgo,
  );
  if (validNotifs.length !== allNotifs.length) {
    Store.set("notifications", validNotifs);
    allNotifs = validNotifs;
  }

  const myNotifs = allNotifs
    .filter((n) => n.userId === "all" || n.userId === session.userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const unreadCount = myNotifs.filter((n) => !n.read).length;

  if (unreadCount > 0) {
    notificationBadge.removeAttribute("hidden");
    notificationBadge.textContent = unreadCount > 9 ? "9+" : unreadCount;
  } else {
    notificationBadge.setAttribute("hidden", "");
  }

  if (myNotifs.length === 0) {
    notificationList.innerHTML =
      '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  notificationList.innerHTML = myNotifs
    .slice(0, 20)
    .map((n) => {
      const actionAttr = n.actionData
        ? ` data-action='${sanitize(JSON.stringify(n.actionData))}'`
        : "";
      return `
      <div class="notification-item ${n.read ? "" : "unread"}" data-nid="${sanitize(n.id)}"${actionAttr} style="cursor: pointer;">
         <div class="notif-icon">${n.type === "announcement" ? "📢" : n.type === "violation" ? "⚠️" : n.type === "like" ? "❤️" : "💬"}</div>
         <div class="notif-content">
            <div class="notif-title">${sanitize(n.title)}</div>
            <div class="notif-body">${sanitize(n.body)}</div>
            <div class="notif-date">${new Date(n.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
         </div>
      </div>
      `;
    })
    .join("");

  notificationList.querySelectorAll(".notification-item").forEach((item) => {
    item.addEventListener("click", () => {
      const nid = item.dataset.nid;
      const actionStr = item.dataset.action;

      const notifs = Store.get("notifications") || [];
      const notif = notifs.find((n) => n.id === nid);

      let needsRender = false;
      if (notif && !notif.read) {
        notif.read = true;
        Store.set("notifications", notifs);
        needsRender = true;
      }

      notificationDropdown.setAttribute("hidden", "");
      navBell.classList.remove("active");

      if (actionStr) {
        try {
          const action = JSON.parse(
            actionStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
          );
          if (action.hash) {
            window.location.hash = action.hash;
          } else if (action.postId) {
            const allPosts = Store.get("posts") || [];
            if (allPosts.some((p) => p.id === action.postId)) {
              openViewPost(action.postId);
            } else {
              customConfirm(
                "This post was removed or is no longer available.",
                "Post Not Found",
              );
            }
          }
        } catch (e) {}
      }

      if (needsRender) renderNotifications();
    });
  });
};

if (navBell) {
  navBell.addEventListener("click", () => {
    const hidden = notificationDropdown.hasAttribute("hidden");
    if (hidden) {
      notificationDropdown.removeAttribute("hidden");
      navBell.classList.add("active");
      // Optional: mark all as read when opened? We have a button for that.
    } else {
      notificationDropdown.setAttribute("hidden", "");
      navBell.classList.remove("active");
    }
  });
}

if (markAllReadBtn) {
  markAllReadBtn.addEventListener("click", () => {
    const session = Store.get("session");
    if (!session) return;
    const notifs = Store.get("notifications") || [];
    let changed = false;
    notifs.forEach((n) => {
      if ((n.userId === "all" || n.userId === session.userId) && !n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) {
      Store.set("notifications", notifs);
      renderNotifications();
    }
  });
}

// Click outside to close nav menus including bell
document.addEventListener("click", (e) => {
  if (notificationWrapper && !notificationWrapper.contains(e.target)) {
    notificationDropdown?.setAttribute("hidden", "");
    navBell?.classList.remove("active");
  }
});

/* ─────────────────────────────────────────────
   CURSOR
───────────────────────────────────────────── */
const cursor = document.getElementById("cursor");
const cursorDot = document.getElementById("cursorDot");
let cursorX = 0,
  cursorY = 0;
let cursorTargetX = 0,
  cursorTargetY = 0;

document.addEventListener("mousemove", (e) => {
  cursorTargetX = e.clientX;
  cursorTargetY = e.clientY;
  cursorDot.style.left = e.clientX + "px";
  cursorDot.style.top = e.clientY + "px";
});

(function animateCursor() {
  cursorX += (cursorTargetX - cursorX) * 0.12;
  cursorY += (cursorTargetY - cursorY) * 0.12;
  cursor.style.left = cursorX + "px";
  cursor.style.top = cursorY + "px";
  requestAnimationFrame(animateCursor);
})();

document
  .querySelectorAll(
    "a, button, [data-channel], .channel-item, .forum-post, .forum-tab",
  )
  .forEach((el) => {
    el.addEventListener("mouseenter", () =>
      document.body.classList.add("cursor-hovering"),
    );
    el.addEventListener("mouseleave", () =>
      document.body.classList.remove("cursor-hovering"),
    );
  });

/* ─────────────────────────────────────────────
   NAVBAR
───────────────────────────────────────────── */
window.addEventListener("scroll", () => {
  const nav = document.getElementById("navbar");
  if (nav) nav.classList.toggle("scrolled", window.scrollY > 40);
});

const hamburger = document.getElementById("navHamburger");
const mobileMenu = document.getElementById("navMobile");
const toggleMenu = () => {
  if (!mobileMenu || !hamburger) return;
  const open = mobileMenu.classList.toggle("open");
  hamburger.setAttribute("aria-expanded", open);
  mobileMenu.setAttribute("aria-hidden", !open);
};
if (hamburger) hamburger.addEventListener("click", toggleMenu);

// Close menu when a link is clicked
if (mobileMenu) {
  mobileMenu.querySelectorAll("a, button").forEach((el) => {
    el.addEventListener("click", () => {
      if (mobileMenu.classList.contains("open")) toggleMenu();
    });
  });
}

/* ─────────────────────────────────────────────
   COUNTER ANIMATION
───────────────────────────────────────────── */
const animateCounter = (el, target) => {
  let current = 0;
  const step = target / 60;
  const tick = () => {
    current = Math.min(current + step, target);
    el.textContent = Math.floor(current).toLocaleString();
    if (current < target) requestAnimationFrame(tick);
  };
  tick();
};

const statsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const target = parseInt(e.target.dataset.target);
        animateCounter(e.target, target);
        statsObserver.unobserve(e.target);
      }
    });
  },
  { threshold: 0.5 },
);

document
  .querySelectorAll(".stat-number[data-target]")
  .forEach((el) => statsObserver.observe(el));

/* ─────────────────────────────────────────────
   SCROLL REVEAL
───────────────────────────────────────────── */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        e.target.style.transitionDelay = i * 0.05 + "s";
        e.target.classList.add("visible");
        revealObserver.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1 },
);

document
  .querySelectorAll(
    ".feature-card, .announcement-card, .forum-post, .yt-card, .about-text, .creator-info",
  )
  .forEach((el) => {
    el.classList.add("reveal");
    revealObserver.observe(el);
  });

/* ─────────────────────────────────────────────
   3D HERO ROTATION
───────────────────────────────────────────── */
const heroPlayButton = document.getElementById("heroPlayButton");
const heroScene = document.querySelector(".hero-3d-scene");
if (heroPlayButton && heroScene) {
  let targetRotX = 15;
  let targetRotY = -25;
  let currentRotX = 15;
  let currentRotY = -25;
  let isDragging = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let autoSpin = 0;

  const animate3D = () => {
    if (!isDragging) {
      autoSpin += 0.4;
      currentRotX += (targetRotX - currentRotX) * 0.1;
      currentRotY += (targetRotY + autoSpin - currentRotY) * 0.1;
    } else {
      currentRotX += (targetRotX - currentRotX) * 0.2;
      currentRotY += (targetRotY - currentRotY) * 0.2;
    }

    heroPlayButton.style.transform = `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`;
    requestAnimationFrame(animate3D);
  };
  animate3D();

  heroScene.addEventListener("mousedown", (e) => {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    targetRotY = currentRotY;
    targetRotX = currentRotX;
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      targetRotX = 15;
      targetRotY = -25;
      autoSpin = currentRotY - targetRotY;
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    targetRotY += deltaX * 0.6;
    targetRotX -= deltaY * 0.6;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    if (targetRotX > 60) targetRotX = 60;
    if (targetRotX < -60) targetRotX = -60;
  });
}

/* ─────────────────────────────────────────────
   CHANNELS PREVIEW
───────────────────────────────────────────── */
const channelData = {
  rules: {
    messages: [
      {
        author: "⚡ Owner",
        role: "Owner",
        avatar: "⚡",
        text: "📋 Welcome to Peak Society! Please read all rules before participating. Failure to comply = ban.",
      },
      {
        author: "⚡ Owner",
        role: "Owner",
        avatar: "⚡",
        text: "1. No spam or self-promotion outside designated channels.\n2. Be respectful — we're all here to grow.\n3. Share only verified information in #resources.",
      },
      {
        author: "🤖 Bot",
        role: "BOT",
        avatar: "🤖",
        text: "React with ✅ to gain access to the full server.",
      },
    ],
  },
  welcome: {
    messages: [
      {
        author: "nar",
        role: "Admin",
        avatar: "🛠️",
        text: "Welcome to Peak Society everyone! This is where your journey begins.",
      },
      {
        author: "Jane",
        role: "Member",
        avatar: "👋",
        text: "Just joined! Excited to start my first automation channel with you all. Day 1 begins now.",
      },
      {
        author: "YTA_Dev",
        role: "Member",
        avatar: "👋",
        text: "Hey everyone! Been lurking YouTube Shorts for a while, finally decided to take the leap. Happy to be here!",
      },
    ],
  },
  announcements: {
    messages: [
      {
        author: "⚡ Owner",
        role: "Owner",
        avatar: "⚡",
        text: "📢 NEW: Free 120+ Sound Effects have been added to #resources. Go check them out and let us know what you find!",
      },
      {
        author: "⚡ Owner",
        role: "Owner",
        avatar: "⚡",
        text: "🎉 We hit 1500 members! Massive thank you to everyone who's been spreading the word. You are Peak Society.",
      },
    ],
  },
  verses: {
    messages: [
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: '📖Zechariah 4:10: "Do not despise these small beginnings, for the Lord rejoices to see the work begin..."',
      },
      {
        author: "nar",
        role: "Admin",
        avatar: "🛠️",
        text: "Trust in God Alone💯",
      },
    ],
  },
  uploads: {
    messages: [
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: "📹 Just uploaded my Day 13 on TikTok! Seeing slow but steady growth. The system works if you work the system.",
      },
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: "I uploaded my first YT long form video. Go check it out and dont forget to Subscribe!",
      },
    ],
  },
  general: {
    messages: [
      {
        author: "FIRE | Ian",
        role: "Peak",
        avatar: "⚡",
        text: "I got 12 million views in my new upload guys",
      },
      {
        author: "Phinx",
        role: "Peak",
        avatar: "⚡",
        text: "I got 13 million views in my new channel",
      },
      {
        author: "Boss Chamz",
        role: "Admin",
        avatar: "🛠️",
        text: "Watch the #niches channel — dropping a breakdown post on this today. Stay tuned.",
      },
    ],
  },
  questions: {
    messages: [
      {
        author: "JABEE",
        role: "Member",
        avatar: "👋",
        text: "How do I find trending audio for Shorts without TikTok? Any tools?",
      },
      {
        author: "satorouya",
        role: "Admin",
        avatar: "🛠️",
        text: "Check out YT Studio's trending sounds tab. Also CapCut has a trending audio section updated daily.",
      },
      { author: "yatot", role: "Member", avatar: "👋", text: "dobolyu chat" },
    ],
  },
  wins: {
    messages: [
      {
        author: "Stigbidi",
        role: "Member",
        avatar: "👋",
        text: "🏆 WOW. Just hit 1 million views! Started 2 weeks ago. Followed the how-to-start guide step by step. THANK YOU all!",
      },
      {
        author: "Korei",
        role: "Member",
        avatar: "👋",
        text: "🎉 First monetization check: $342! Month 1 of Shorts play bonus. The system is real.",
      },
      {
        author: "satorouya",
        role: "Admin",
        avatar: "🛠️",
        text: "LETS GO! These wins never get old. Keep posting them — they fuel the whole community.",
      },
    ],
  },
  resources: {
    messages: [
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: "📚 PINNED: Complete YTA Starter Pack — Niche database, script templates, thumbnail guides, and posting schedule. Link in the message below.",
      },
      {
        author: "StaffMike",
        role: "Staff",
        avatar: "👋",
        text: "🆕 Added: AI Voiceover Tool Comparison 2026. Covers ElevenLabs and Fish.Audio side by side.",
      },
    ],
  },
  niches: {
    messages: [
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: '🎯 NICHE ALERT: "Ranking Niche are getting 500K+ views consistently.',
      },
      {
        author: "satorouya",
        role: "Staff",
        avatar: "👋",
        text: "Roblox Niche is also goldmine right now.",
      },
    ],
  },
  tips: {
    messages: [
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: "💡 TIP: Hook in the first 1.5 seconds. If you don't grab them, they scroll. Use a visual + text hook together.",
      },
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: "💡 Post between 12am-3am, that is the peak time in US.",
      },
    ],
  },
};

const previewName = document.getElementById("previewName");
const previewMessages = document.getElementById("previewMessages");

const renderChannelPreview = (channel) => {
  if (!previewName || !previewMessages) return;
  previewName.textContent = channel;
  const data = channelData[channel] || {
    messages: [
      {
        author: "Gelo",
        role: "Owner",
        avatar: "👑",
        text: "Join Discord to see this channel!",
      },
    ],
  };
  previewMessages.innerHTML = data.messages
    .map(
      (m) => `
    <div class="preview-msg">
      <div class="msg-avatar">${sanitize(m.avatar)}</div>
      <div class="msg-content">
        <span class="msg-author">${sanitize(m.author)}</span>
        <span class="msg-role">${sanitize(m.role)}</span>
        <div class="msg-text">${sanitize(m.text).replace(/\n/g, "<br>")}</div>
      </div>
    </div>
  `,
    )
    .join("");
};

document.querySelectorAll(".channel-item").forEach((item) => {
  item.addEventListener("click", () => {
    document
      .querySelectorAll(".channel-item")
      .forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    renderChannelPreview(item.dataset.channel);
  });
});

renderChannelPreview("rules");

/* ─────────────────────────────────────────────
   YOUTUBE CREATOR SECTION
───────────────────────────────────────────── */
const ytVideos = [
  {
    id: "647p_dYV1VY",
    title: "Export in Capcut With Pro Features 2026 (No Pro Required)",
    views: "143 views",
    date: "1 day ago",
  },
  {
    id: "647p_dYV1VY",
    title: "Export in Capcut With Pro Features 2026 (No Pro Required)",
    views: "143 views",
    date: "1 day ago",
  },
  {
    id: "647p_dYV1VY",
    title: "Export in Capcut With Pro Features 2026 (No Pro Required)",
    views: "143 views",
    date: "1 day ago",
  },
  {
    id: "647p_dYV1VY",
    title: "Export in Capcut With Pro Features 2026 (No Pro Required)",
    views: "143 views",
    date: "1 day ago",
  },
];

const creatorVideos = document.getElementById("creatorVideos");
if (creatorVideos) {
  creatorVideos.innerHTML = ytVideos
    .map(
      (v) => `
    <a href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener noreferrer" class="yt-card reveal">
      <div class="yt-thumb">
        <img src="https://img.youtube.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt="${sanitize(v.title)}" loading="lazy" />
        <div class="yt-play-btn" aria-hidden="true">
          <div class="yt-play-icon">▶</div>
        </div>
      </div>
      <div class="yt-card-info">
        <div class="yt-card-title">${sanitize(v.title)}</div>
        <div class="yt-card-meta">${sanitize(v.views)} · ${sanitize(v.date)}</div>
      </div>
    </a>
  `,
    )
    .join("");

  ytVideos.forEach((_, i) => {
    const el = creatorVideos.children[i];
    if (el) {
      el.classList.add("reveal");
      revealObserver.observe(el);
    }
  });
}

/* ─────────────────────────────────────────────
   ANNOUNCEMENTS RENDER
───────────────────────────────────────────── */
let showAllAnnouncements = false;
const stripRichHTML = (html) => {
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

const renderAnnouncements = () => {
  const list = document.getElementById("announcementsList");
  if (!list) return;
  const announcements = Store.get("announcements");
  const users = Store.get("users");
  if (!announcements.length) {
    list.innerHTML =
      '<p style="color:var(--mid);text-align:center;padding:3rem 0;">No announcements yet. Check back soon!</p>';
    return;
  }

  const reversed = announcements.slice().reverse();
  const visible = showAllAnnouncements ? reversed : reversed.slice(0, 3);

  let htmlOutput = visible
    .map((a) => {
      const author = users.find((u) => u.username === a.authorId || u.id === a.authorId);
      const date = new Date(a.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const userRole = author && author.role === "owner" ? "Owner" : "Staff";

      const plainText = stripRichHTML(a.body);
      const isTruncated = plainText.length > 200;
      const previewBody = isTruncated
        ? plainText.slice(0, 200) + "..."
        : plainText;

      return `
      <div class="announcement-card reveal" style="cursor: pointer;" onclick="openViewAnnouncement('${sanitize(a.id)}')">
        <div class="announcement-tag">ANNOUNCEMENT</div>
        <div class="announcement-title">${sanitize(a.subject)}</div>
        <div class="announcement-body default-text-preview" style="color:var(--mid); font-size:1rem; margin-bottom:1rem; line-height:1.6;">${sanitize(previewBody)}</div>
        <div class="announcement-meta">
          <span class="announcement-author-badge">${userRole}</span>
          <span>${date}</span>
        </div>
      </div>
    `;
    })
    .join("");

  if (!showAllAnnouncements && reversed.length > 3) {
    htmlOutput += `
      <div style="text-align:center; padding: 1rem 0;">
        <button class="btn-secondary" onclick="showAllAnnouncements = true; renderAnnouncements();">View More Announcements</button>
      </div>
    `;
  }

  list.innerHTML = htmlOutput;
  list
    .querySelectorAll(".announcement-card")
    .forEach((el) => revealObserver.observe(el));
};

renderAnnouncements();

/* ─────────────────────────────────────────────
   FORUM RENDER
───────────────────────────────────────────── */
let currentTab = "all";
window.forumPostLimit = 20;

const categoryLabels = {
  wins: "🥇 Win",
  questions: "❓ Question",
  "tutorial-requests": "🎬 Tutorial Request",
};

const loadMorePosts = async () => {
  const btn = document.getElementById("loadMorePostsBtn");
  if (btn) btn.textContent = "Loading...";

  const posts = Store.get("posts");
  const lastPost = posts[posts.length - 1];
  if (!lastPost) return;

  if (sbClient) {
    const { data } = await sbClient
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .lt("created_at", lastPost.date || lastPost.created_at)
      .limit(20);

    if (data && data.length > 0) {
      const newPosts = data.map((p) => ({
        ...p,
        body: p.content || p.body,
        comments: p.commentsCount ?? p.comments,
        date: p.created_at || p.date,
        likedBy: p.likedBy || [],
      }));
      // Only add posts that don't already exist
      const uniqueNewPosts = newPosts.filter(
        (np) => !posts.some((p) => p.id === np.id),
      );
      Store.set("posts", [...posts, ...uniqueNewPosts], true);
      window.forumPostLimit += 20;
      renderForum();
    } else {
      if (btn) {
        btn.textContent = "No more posts";
        btn.disabled = true;
      }
    }
  }
};

const renderForum = () => {
  const container = document.getElementById("forumPosts");
  if (!container) return;
  const session = Store.get("session");

  if (!session) {
    container.classList.remove("forum-posts");
    container.innerHTML = `
      <div class="sign-in-wall">
        <h3>Join the conversation</h3>
        <p>Sign in to post wins, ask questions, and request tutorials.</p>
        <button class="btn-primary" id="forumSignInBtn">Sign In to Post</button>
      </div>
    `;
    document
      .getElementById("forumSignInBtn")
      ?.addEventListener("click", () => openAuthModal());
  } else {
    container.classList.add("forum-posts");
    container.innerHTML = renderPostCards();

    const posts = window.forumSearchResults || Store.get("posts");
    const filtered =
      currentTab === "all"
        ? posts
        : posts.filter((p) => p.category === currentTab);

    // Only show Load More if we are not searching, and if we have at least as many posts as the limit
    if (
      !window.forumSearchResults &&
      filtered.length >= window.forumPostLimit
    ) {
      container.innerHTML += `<div style="text-align:center; padding: 2rem;"><button id="loadMorePostsBtn" class="btn-secondary" onclick="loadMorePosts()">Load More Posts</button></div>`;
    }
  }

  container.querySelectorAll(".forum-post").forEach((card) => {
    card.addEventListener("click", () => openViewPost(card.dataset.postId));
    revealObserver.observe(card);
  });
};

const renderPostCards = () => {
  const posts = window.forumSearchResults || Store.get("posts");
  const users = Store.get("users");
  const filtered =
    currentTab === "all"
      ? posts
      : posts.filter((p) => p.category === currentTab);

  if (!filtered.length)
    return '<p style="color:var(--mid);text-align:center;padding:3rem 0;">No posts found.</p>';

  return filtered
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, window.forumPostLimit)
    .map((p) => {
      let author = users.find((u) => u.username === p.userId || u.id === p.userId);
      if (!author && p.authorName)
        author = { username: p.authorName, role: p.authorRole || "member" };
      const date = new Date(p.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const commentCount =
        typeof p.comments === "number" ? p.comments : p.commentsCount || 0;
      const likeCount =
        typeof p.likes === "number" ? p.likes : p.likedBy?.length || 0;
      return `
      <div class="forum-post reveal" data-post-id="${sanitize(p.id)}" role="article" tabindex="0">
        <div class="post-header" style="cursor: pointer; z-index: 2; position: relative;" onclick="event.stopPropagation(); if(typeof openPublicProfile === 'function') openPublicProfile('${sanitize(p.userId)}');" title="View Profile">
          ${author && author.profilePicture ? `<div class="post-avatar" style="background-image:url('${author.profilePicture}'); background-size: cover; border-radius: 50%;"></div>` : `<div class="post-avatar" style="font-size: 1.2rem;">&#128100;</div>`}
          <span class="post-author">${sanitize(author ? author.displayName || author.username : "Unknown")}</span>
          ${author ? `<span class="post-role-badge">${sanitize(author.role)}</span>` : ""}
          <span class="post-date">${date}</span>
        </div>
        <div class="post-category-tag">${categoryLabels[p.category] || p.category}</div>
        <div class="post-title">${sanitize(p.title)}</div>
        <div class="post-excerpt">${sanitize(p.body.slice(0, 180))}${p.body.length > 180 ? "…" : ""}</div>
        ${
          p.image
            ? `
        <div class="post-image-container">
          <div class="post-image-wrapper">
            <img src="${p.image}" alt="Attached image" class="post-image-img" loading="lazy" />
          </div>
        </div>`
            : ""
        }
        <div class="post-footer">
          <span class="post-action">❤️ ${sanitize(String(likeCount))}</span>
          <span class="post-action">💬 ${sanitize(String(commentCount))}</span>
        </div>
      </div>
    `;
    })
    .join("");
};

const forumTabs = document.querySelectorAll(".forum-tab");
if (forumTabs.length > 0) {
  forumTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".forum-tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      currentTab = tab.dataset.tab;
      renderForum();
    });
  });
}

renderForum();

/* ─────────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────────── */
const openModal = (id) => {
  const modal = document.getElementById(id);
  modal.removeAttribute("hidden");
  modal.querySelector('[role="dialog"]')?.focus?.();
  document.body.style.overflow = "hidden";
};

const closeModal = (id) => {
  document.getElementById(id).setAttribute("hidden", "");
  document.body.style.overflow = "";
};

const setupModalClose = (backdropId, closeBtnId) => {
  const backdrop = document.getElementById(backdropId);
  const closeBtn = document.getElementById(closeBtnId);
  if (!backdrop) return;
  if (closeBtn)
    closeBtn.addEventListener("click", () => closeModal(backdropId));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdropId);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hasAttribute("hidden"))
      closeModal(backdropId);
  });
};

setupModalClose("authModal", "authModalClose");
setupModalClose("postModal", "postModalClose");
setupModalClose("adminModal", "adminModalClose");
setupModalClose("adminAuthModal", "adminAuthClose");
setupModalClose("composerModal", "composerClose");
setupModalClose("viewPostModal", "viewPostClose");
setupModalClose("viewAnnouncementModal", "viewAnnouncementClose");
setupModalClose("profileModal", "profileModalClose");
setupModalClose("publicProfileModal", "publicProfileClose");

window.openPublicProfile = (userId) => {
  const users = Store.get("users");
  const targetUser = users.find(
    (u) => u.username === userId || u.id === userId,
  );
  if (!targetUser) return;

  const displayName = targetUser.displayName || targetUser.username;
  document.getElementById("publicUsername").textContent = displayName;

  const roleClasses = {
    owner: "role-owner",
    admin: "role-admin",
    staff: "role-staff",
    member: "role-member",
  };

  document.getElementById("publicRoleBadge").innerHTML =
    `<span class="role-badge ${roleClasses[targetUser.role] || "role-member"}">${sanitize(targetUser.role)}</span>`;

  document.getElementById("publicBio").textContent =
    targetUser.bio || "This user hasn't added a bio yet.";

  const socialsDiv = document.getElementById("publicSocials");
  let socialsHtml = "";
  if (targetUser.youtubeLink) {
    socialsHtml += `<a href="${sanitize(targetUser.youtubeLink)}" target="_blank" class="btn-youtube btn-sm" style="text-decoration:none;">YouTube</a>`;
  }
  if (targetUser.discordHandle) {
    socialsHtml += `<div class="btn-discord btn-sm">Discord: ${sanitize(targetUser.discordHandle)}</div>`;
  }
  socialsDiv.innerHTML = socialsHtml;

  const avatarBox = document.getElementById("publicAvatarBox");
  if (targetUser.profilePicture) {
    avatarBox.style.backgroundImage = `url('${targetUser.profilePicture}')`;
    avatarBox.innerHTML = "";
  } else {
    avatarBox.style.backgroundImage = "none";
    avatarBox.innerHTML = `&#128100;`;
  }

  const allPosts = Store.get("posts") || [];
  const userPosts = allPosts
    .filter((p) => p.userId === userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const actList = document.getElementById("publicActivityList");
  if (userPosts.length === 0) {
    actList.innerHTML =
      '<p style="color:var(--mid);text-align:center;font-size:0.85rem;">No recent activity.</p>';
  } else {
    actList.innerHTML = userPosts
      .map((p) => {
        const commentCount = (Store.get("comments") || []).filter(
          (c) => c.postId === p.id,
        ).length;
        const likeCount = (Store.get("likes") || []).filter(
          (l) => l.postId === p.id,
        ).length;
        return `
      <div class="activity-item" style="cursor: pointer;" onclick="closeModal('publicProfileModal'); openViewPost('${sanitize(p.id)}');">
        <div class="activity-title">${sanitize(p.title)}</div>
        <div class="activity-meta">
          <span>❤️ ${likeCount}</span>
          <span>💬 ${commentCount}</span>
          <span>${new Date(p.date).toLocaleDateString()}</span>
        </div>
      </div>
    `;
      })
      .join("");
  }

  openModal("publicProfileModal");
};

/* ─────────────────────────────────────────────
   AUTH MODAL
───────────────────────────────────────────── */
const openAuthModal = (startInRegister = false) => {
  // Reset modal state
  isRegisterMode = startInRegister;
  applyAuthMode();
  document.getElementById("authUsername").value = "";
  document.getElementById("authPassword").value = "";
  document.getElementById("authError").setAttribute("hidden", "");
  document.getElementById("authSuccess")?.setAttribute("hidden", "");
  openModal("authModal");
};

// Nav sign-in / sign-out toggle
const navSignIn = document.getElementById("navSignIn");
if (navSignIn) {
  navSignIn.addEventListener("click", async () => {
    if (Store.get("session")) {
      if (
        await customConfirm("Are you sure you want to sign out?", "Sign Out")
      ) {
        signOut();
      }
    } else {
      openAuthModal();
    }
  });
}
document
  .getElementById("navSignInMobile")
  ?.addEventListener("click", async () => {
    if (Store.get("session")) {
      if (
        await customConfirm("Are you sure you want to sign out?", "Sign Out")
      ) {
        signOut();
      }
    } else {
      openAuthModal();
    }
  });

document
  .getElementById("profileSignOutBtn")
  ?.addEventListener("click", async () => {
    if (await customConfirm("Are you sure you want to log out?", "Log Out")) {
      closeModal("profileModal");
      signOut();
    }
  });

document
  .getElementById("profileDeleteAccountBtn")
  ?.addEventListener("click", () => {
    const footerActions = document.getElementById("profileFooterActions");
    const confirmationSection = document.getElementById(
      "deleteAccountConfirmation",
    );
    if (footerActions && confirmationSection) {
      footerActions.style.display = "none";
      confirmationSection.style.display = "block";
    }
  });

document.getElementById("cancelDeleteBtn")?.addEventListener("click", () => {
  const footerActions = document.getElementById("profileFooterActions");
  const confirmationSection = document.getElementById(
    "deleteAccountConfirmation",
  );
  const passwordInput = document.getElementById("profileDeletePass");
  if (footerActions && confirmationSection) {
    confirmationSection.style.display = "none";
    footerActions.style.display = "flex";
    if (passwordInput) passwordInput.value = "";
  }
});

document
  .getElementById("confirmDeleteAccountBtn")
  ?.addEventListener("click", async () => {
    const passwordInput = document.getElementById("profileDeletePass");
    const password = passwordInput ? passwordInput.value : "";

    if (!password) {
      alert("Please enter your current password to delete your account.");
      return;
    }

    if (
      await customConfirm(
        "DANGER: Are you certain you want to permanently delete your account, posts, and data? This cannot be undone.",
        "Delete Account",
      )
    ) {
      const session = Store.get("session");
      if (!session) return;

      // Disable button to prevent double-clicks
      const confirmBtn = document.getElementById("confirmDeleteAccountBtn");
      const originalText = confirmBtn.textContent;
      confirmBtn.textContent = "Deleting...";
      confirmBtn.disabled = true;

      try {
        if (sbClient) {
          // Re-authenticate to verify password
          const sessionResp = await sbClient.auth.getSession();
          const userEmail = sessionResp.data?.session?.user?.email;

          if (!userEmail)
            throw new Error("Could not retrieve user email for verification.");

          const { error: authError } = await sbClient.auth.signInWithPassword({
            email: userEmail,
            password: password,
          });

          if (authError) {
            alert("Incorrect password. Account deletion aborted.");
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
            return;
          }

          // Proceed with deletion if password was correct
          await sbClient.from("users").delete().eq("id", session.userId);
          await sbClient.rpc("delete_user_account"); // Custom RPC to delete auth.users
        }
        closeModal("profileModal");
        signOut();
        alert("Your account has been successfully deleted.");
      } catch (e) {
        console.error(e);
        alert(
          "Failed to fully delete account. Please contact an administrator.",
        );
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
      }
    }
  });

document.getElementById("newPostBtn")?.addEventListener("click", () => {
  if (!Store.get("session")) {
    openAuthModal();
    return;
  }
  openModal("postModal");
});

const signOut = async () => {
  const s = Store.get("session");
  if (s) addAuditLog("User signed out", s.username, s.username);
  if (sbClient) await sbClient.auth.signOut();
  Store.set("session", null);
  Store.set("adminSession", null);
  updateNavForSession();
  renderForum();
};

let isRegisterMode = false;

const applyAuthMode = () => {
  document.getElementById("authRegisterToggle").textContent = isRegisterMode
    ? "Already have an account? Sign in"
    : "Don't have an account? Sign up";
  document.querySelector("#authModal h2").textContent = isRegisterMode
    ? "Create Account"
    : "Welcome back";
  document.getElementById("authSubmit").textContent = isRegisterMode
    ? "Create Account"
    : "Sign In";
  document.querySelector("#authModal .modal-sub").textContent = isRegisterMode
    ? "Choose a username, email, and password"
    : "Sign in to post in the community";
  const emailEl = document.getElementById("authEmail");
  if (emailEl) emailEl.style.display = isRegisterMode ? "block" : "none";
  const forgotBtn = document.getElementById("authForgotPassword");
  if (forgotBtn) forgotBtn.style.display = isRegisterMode ? "none" : "";
};

document.getElementById("authRegisterToggle")?.addEventListener("click", () => {
  isRegisterMode = !isRegisterMode;
  applyAuthMode();
  document.getElementById("authError").setAttribute("hidden", "");
  document.getElementById("authSuccess")?.setAttribute("hidden", "");
});

document.getElementById("authForgotPassword")?.addEventListener("click", () => {
  if (typeof openForgotPasswordModal === "function") openForgotPasswordModal();
});

// Rate limiting state
let authAttempts = 0;
let authLockUntil = 0;

document.getElementById("authSubmit")?.addEventListener("click", async () => {
  const errEl = document.getElementById("authError");
  errEl.setAttribute("hidden", "");
  document.getElementById("authSuccess")?.setAttribute("hidden", "");

  // Rate limit check
  if (Date.now() < authLockUntil) {
    const secs = Math.ceil((authLockUntil - Date.now()) / 1000);
    errEl.textContent = `Too many attempts. Please wait ${secs} seconds.`;
    errEl.removeAttribute("hidden");
    return;
  }

  const username = document.getElementById("authUsername").value.trim();
  const password = document.getElementById("authPassword").value;
  const email = isRegisterMode
    ? document.getElementById("authEmail")?.value.trim() || ""
    : "";

  if (!username || !password) {
    errEl.textContent = "Please fill in all fields.";
    errEl.removeAttribute("hidden");
    return;
  }
  if (username.length < 3 || username.length > 32) {
    errEl.textContent = "Username must be between 3 and 32 characters.";
    errEl.removeAttribute("hidden");
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errEl.textContent =
      "Username may only contain letters, numbers, and underscores.";
    errEl.removeAttribute("hidden");
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.removeAttribute("hidden");
    return;
  }

  const btn = document.getElementById("authSubmit");
  btn.disabled = true;
  btn.textContent = isRegisterMode ? "Creating account..." : "Signing in...";

  if (isRegisterMode) {
    if (!email || !email.includes("@")) {
      errEl.textContent = "Please enter a valid email address.";
      errEl.removeAttribute("hidden");
      btn.disabled = false;
      btn.textContent = "Create Account";
      return;
    }

    const { error } = await Auth.signUp(username, email, password);
    btn.disabled = false;
    btn.textContent = "Create Account";

    if (error) {
      authAttempts++;
      if (authAttempts >= 5) {
        authLockUntil = Date.now() + 30000;
        authAttempts = 0;
        errEl.textContent = "Too many failed attempts. Please wait 30 seconds.";
      } else {
        errEl.textContent = error.message;
      }
      errEl.removeAttribute("hidden");
      return;
    }
    addAuditLog("User registered", "system", username);

    document.getElementById("authUsername").value = "";
    document.getElementById("authPassword").value = "";
    if (document.getElementById("authEmail"))
      document.getElementById("authEmail").value = "";
    const authSuccess = document.getElementById("authSuccess");
    if (authSuccess) authSuccess.removeAttribute("hidden");
    return;
  } else {
    const { error } = await Auth.signIn(username, password);
    btn.disabled = false;
    btn.textContent = "Sign In";

    if (error) {
      authAttempts++;
      if (authAttempts >= 5) {
        authLockUntil = Date.now() + 30000;
        authAttempts = 0;
        errEl.textContent = "Too many failed attempts. Please wait 30 seconds.";
      } else {
        errEl.textContent = `Incorrect username or password. (${5 - authAttempts} attempt${5 - authAttempts !== 1 ? "s" : ""} remaining)`;
      }
      errEl.removeAttribute("hidden");
      return;
    }
    authAttempts = 0;
    addAuditLog("User signed in", username, username);
  }

  document.getElementById("authUsername").value = "";
  document.getElementById("authPassword").value = "";
  if (document.getElementById("authEmail"))
    document.getElementById("authEmail").value = "";
  closeModal("authModal");
  updateNavForSession();
  renderForum();
});

// Allow Enter key to submit auth form
["authUsername", "authPassword"].forEach((id) => {
  document.getElementById(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("authSubmit")?.click();
  });
});

const updateNavForSession = () => {
  const session = Store.get("session");
  const btn = document.getElementById("navSignIn");
  const mobileBtn = document.getElementById("navSignInMobile");
  const profileWidget = document.getElementById("navProfileWidget");

  if (session) {
    if (btn) btn.style.display = "none";
    if (mobileBtn)
      mobileBtn.textContent = `Sign Out (${sanitize(session.username)})`;
    if (profileWidget) {
      profileWidget.style.display = "flex";
      const users = Store.get("users") || [];
      const me = users.find((u) => u.username === session.username);
      const avatarBlock = document.getElementById("navProfileAvatar");
      if (me) {
        if (me.profilePicture) {
          avatarBlock.style.backgroundImage = `url('${me.profilePicture}')`;
          avatarBlock.innerHTML = "";
        } else {
          avatarBlock.style.backgroundImage = "none";
          avatarBlock.innerHTML = "&#128100;";
        }
      }
    }
  } else {
    if (btn) {
      btn.style.display = "inline-block";
      btn.textContent = "Sign In";
    }
    if (mobileBtn) mobileBtn.textContent = "Sign In";
    if (profileWidget) profileWidget.style.display = "none";
  }

  const adminAnncBtn = document.getElementById("adminAnnouncementsBtn");
  const adminFooterBtn = document.getElementById("footerAdminBtn");
  // Admin portal visilibity check
  if (session && ["owner", "admin", "staff"].includes(session.role)) {
    if (adminAnncBtn) adminAnncBtn.style.display = "inline-block";
    if (adminFooterBtn) adminFooterBtn.style.display = "inline-block";
  } else {
    if (adminAnncBtn) adminAnncBtn.style.display = "none";
    if (adminFooterBtn) adminFooterBtn.style.display = "none";
  }

  if (typeof renderNotifications === "function") renderNotifications();
};

updateNavForSession();

/* ─────────────────────────────────────────────
   POST IMAGE BUCKET HELPER
───────────────────────────────────────────── */
async function deletePostImageFromBucket(imageUrl) {
  if (!sbClient || !imageUrl || imageUrl.startsWith("data:")) return;
  try {
    const url = new URL(imageUrl);
    const parts = url.pathname.split("/post-images/");
    if (parts.length < 2) return;
    await sbClient.storage.from("post-images").remove([parts[1]]);
  } catch (e) {
    console.error("Failed to delete post image from bucket:", e);
  }
}

/* ─────────────────────────────────────────────
   NEW POST
───────────────────────────────────────────── */
document.getElementById("postSubmit")?.addEventListener("click", async () => {
  const session = Store.get("session");
  if (!session) {
    closeModal("postModal");
    openAuthModal();
    return;
  }

  const title = document.getElementById("postTitle").value.trim();
  const body = document.getElementById("postBody").value.trim();
  const category = document.getElementById("postCategory").value;
  const imageInput = document.getElementById("postImageBtn");
  const errEl = document.getElementById("postError");
  errEl.setAttribute("hidden", "");

  if (!title || !body) {
    errEl.textContent = "Please fill in all fields.";
    errEl.removeAttribute("hidden");
    return;
  }
  if (title.length < 5) {
    errEl.textContent = "Title must be at least 5 characters.";
    errEl.removeAttribute("hidden");
    return;
  }

  let imageUrl = null;
  if (imageInput && imageInput.files && imageInput.files[0]) {
    const file = imageInput.files[0];
    if (file.size > 2 * 1024 * 1024) {
      errEl.textContent = "Image must be less than 2MB.";
      errEl.removeAttribute("hidden");
      return;
    }
    const btn = document.getElementById("postSubmit");
    btn.textContent = "Uploading...";
    btn.disabled = true;
    const compressImageToBlob = (f, maxWidth, maxHeight, quality) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width,
              height = img.height;
            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height *= maxWidth / width));
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width *= maxHeight / height));
                height = maxHeight;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolve, "image/jpeg", quality);
          };
        };
      });
    };
    const compressedBlob = await compressImageToBlob(file, 800, 800, 0.6);
    if (sbClient) {
      const fileName = `${session.username}_${Date.now()}.jpg`;
      const { error: uploadError } = await sbClient.storage
        .from("post-images")
        .upload(fileName, compressedBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (uploadError) {
        errEl.textContent = "Image upload failed: " + uploadError.message;
        errEl.removeAttribute("hidden");
        btn.textContent = "Publish Post";
        btn.disabled = false;
        return;
      }
      const { data: urlData } = sbClient.storage
        .from("post-images")
        .getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
    }
    btn.textContent = "Publish Post";
    btn.disabled = false;
  }

  const newPost = {
    id: "p-" + crypto.randomUUID(),
    userId: session.username,
    category,
    title,
    body,
    image: imageUrl,
    likes: 0,
    comments: 0,
    likedBy: [],
    date: new Date().toISOString(),
  };
  const newPostDB = {
    id: newPost.id,
    userId: newPost.userId,
    category: newPost.category,
    title: newPost.title,
    content: newPost.body,
    image: newPost.image,
    likes: 0,
    commentsCount: 0,
    likedBy: [],
    created_at: newPost.date,
  };

  if (sbClient) {
    const { error } = await sbClient.from("posts").insert([newPostDB]);
    if (error) {
      errEl.textContent = "Database Error: " + error.message;
      errEl.removeAttribute("hidden");
      return;
    }
    // Optimistic UI Update locally without triggering massive upserts
    const posts = Store.get("posts");
    posts.push(newPost);
    try {
      localStorage.setItem("ps_posts", JSON.stringify(posts));
    } catch {}
  } else {
    errEl.textContent = "Database offline. Cannot post locally.";
    errEl.removeAttribute("hidden");
    return;
  }
  addAuditLog("Forum post created", session.username, title);

  document.getElementById("postTitle").value = "";
  document.getElementById("postBody").value = "";
  if (imageInput) imageInput.value = "";
  closeModal("postModal");
  renderForum();
});

/* ─────────────────────────────────────────────
   CUSTOM CONFIRM MODAL
───────────────────────────────────────────── */
const customConfirm = (message, title = "This page says") => {
  return new Promise((resolve) => {
    document.getElementById("confirmMessage").textContent = message;
    document.getElementById("confirmTitle").textContent = title;

    const cancelBtn = document.getElementById("confirmCancelBtn");
    const acceptBtn = document.getElementById("confirmAcceptBtn");
    const closeBtn = document.getElementById("confirmClose");

    const cleanup = () => {
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      acceptBtn.removeEventListener("click", onAccept);
      closeModal("confirmModal");
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onAccept = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
    acceptBtn.addEventListener("click", onAccept);

    openModal("confirmModal");
  });
};

/* ─────────────────────────────────────────────
   VIEW POST
───────────────────────────────────────────── */
window.openViewAnnouncement = (id) => {
  const announcements = Store.get("announcements");
  const a = announcements.find((x) => x.id === id);
  if (!a) return;
  const users = Store.get("users");
  const author = users.find((u) => u.username === a.authorId || u.id === a.authorId);
  const date = new Date(a.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const userRole = author && author.role === "owner" ? "Owner" : "Staff";

  document.getElementById("viewAnnouncementBody").innerHTML = `
    <div class="announcement-tag" style="margin-bottom:1rem;">ANNOUNCEMENT</div>
    <h2 style="font-size:1.6rem;margin-bottom:1rem;color:var(--white);">${sanitize(a.subject)}</h2>
    <div class="post-header" style="margin-bottom:1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
      <span class="announcement-author-badge" style="margin-right:0.5rem;font-size:0.9rem;">${userRole}</span>
      <span class="post-date" style="font-size:0.95rem;">${date}</span>
    </div>
    <div style="color:var(--off-white);line-height:1.7;font-size:1.05rem;" class="rich-content-render">${sanitizeHTML(a.body)}</div>
  `;
  openModal("viewAnnouncementModal");
};

const openViewPost = (postId) => {
  const posts = Store.get("posts");
  const users = Store.get("users");
  const post = posts.find((p) => p.id === postId);
  if (!post) return;
  const commentCount =
    typeof post.comments === "number" ? post.comments : post.commentsCount || 0;
  const likeCount =
    typeof post.likes === "number" ? post.likes : post.likedBy?.length || 0;
  let author = users.find(
    (u) => u.username === post.userId || u.id === post.userId,
  );
  if (!author && post.authorName)
    author = { username: post.authorName, role: post.authorRole || "member" };
  const date = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const session = Store.get("session");
  const isLiked =
    session &&
    Array.isArray(post.likedBy) &&
    post.likedBy.includes(session.userId);
  let canDelete = false;
  let canReport = false;
  if (session) {
    if (session.userId === post.userId || session.username === post.userId)
      canDelete = true;
    else canReport = true;

    // Elevate privileges strictly based on the active frontend user session, not the background admin cookie
    if (["owner", "admin", "staff"].includes(session.role)) canDelete = true;
  }

  document.getElementById("viewPostBody").innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <div class="post-category-tag" style="margin-bottom:1rem;">${categoryLabels[post.category] || post.category}</div>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        ${canReport ? `<button id="reportPostBtn" style="background:transparent; border:1px solid var(--border); color:var(--mid); cursor:pointer; font-size:0.85rem; padding:0.4rem 0.6rem; border-radius:var(--radius-sm); transition:background 0.2s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='transparent'">🚩 Report Post</button>` : ""}
        ${canDelete ? `<button id="deletePostBtn" style="background:transparent; border:1px solid transparent; color:var(--error); cursor:pointer; font-size:0.85rem; padding:0.4rem 0.6rem; border-radius:var(--radius-sm); transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--error)'" onmouseout="this.style.borderColor='transparent'">🗑️ Delete Post</button>` : ""}
      </div>
    </div>
    <h2 style="font-size:1.4rem;margin-bottom:1rem;">${sanitize(post.title)}</h2>
    <div class="post-header" style="margin-bottom:1.5rem; cursor:pointer;" onclick="if(typeof openPublicProfile === 'function') openPublicProfile('${sanitize(post.userId)}');" title="View Profile">
      ${author && author.profilePicture ? `<div class="post-avatar" style="background-image:url('${author.profilePicture}'); background-size: cover; border-radius: 50%;"></div>` : `<div class="post-avatar">${sanitize(author ? author.username[0] : "?")}</div>`}
      <span class="post-author">${sanitize(author ? author.displayName || author.username : "Unknown")}</span>
      ${author ? `<span class="post-role-badge">${sanitize(author.role)}</span>` : ""}
      <span class="post-date">${date}</span>
    </div>
    <p style="color:var(--mid);line-height:1.8;font-size:1rem;">${sanitize(post.body).replace(/\n/g, "<br>")}</p>
    ${post.image ? `<img src="${post.image}" alt="Attached image" style="margin-top:1.5rem;border-radius:var(--radius-lg);max-height:500px;width:100%;object-fit:cover;border:1px solid var(--border);" />` : ""}
    <div class="post-footer" style="margin-top:1.5rem;">
      <button id="postModalLikeBtn" class="post-action ${isLiked ? "liked" : ""}" style="background:transparent;border:none;cursor:pointer;">
        ❤️ <span id="postModalLikeCount">${sanitize(String(likeCount))}</span>
      </button>
      <span class="post-action">💬 ${sanitize(String(commentCount))}</span>
    </div>
    
    <div class="comments-section" style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border);">
      <h3 style="font-size:1.1rem;margin-bottom:1rem;">Comments</h3>
      <div id="modalCommentsContainer" class="comments-list"></div>
      
      ${
        session
          ? `
        <div class="comment-reply-box" style="margin-top:1.5rem;display:flex;flex-direction:column;gap:0.5rem;">
          <textarea id="modalCommentInput" class="form-input form-textarea" placeholder="Add a comment..." style="min-height:80px;"></textarea>
          <button id="modalCommentSubmit" class="btn-primary btn-sm" style="align-self:flex-end;">Reply</button>
        </div>
      `
          : `
        <div class="sign-in-wall" style="padding:1.5rem;margin-top:1.5rem;">
          <p style="margin:0;font-size:0.9rem;">Sign In to Interact and join the conversation.</p>
        </div>
      `
      }
    </div>

    <div style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border);color:var(--mid);font-size:0.88rem;text-align:center;">
      <p>Join the full discussion on <a href="https://discord.gg/peaksociety" target="_blank" rel="noopener noreferrer" style="color:var(--white);text-decoration:underline;">our Discord</a>.</p>
    </div>
  `;

  let commentsLimit = 2; // Initial visible comments limit

  let cachedPostComments = null;
  const renderComments = async () => {
    const container = document.getElementById("modalCommentsContainer");
    if (!container) return;

    if (cachedPostComments === null && sbClient) {
      container.innerHTML =
        '<p style="color:var(--mid);font-size:0.9rem;text-align:center;">Loading comments...</p>';
      const { data } = await sbClient
        .from("comments")
        .select("*")
        .eq("postId", postId)
        .order("created_at", { ascending: false });
      if (data) {
        cachedPostComments = data.map((c) => ({
          ...c,
          postId: c.postId,
          userId: c.userId,
          body: c.content || c.body,
          date: c.created_at || c.date,
        }));
      } else {
        cachedPostComments = [];
      }
    } else if (cachedPostComments === null) {
      const allComments = Store.get("comments") || [];
      cachedPostComments = allComments.filter((c) => c.postId === postId);
    }
    const postComments = cachedPostComments;

    if (postComments.length === 0) {
      container.innerHTML =
        '<p style="color:var(--mid);font-size:0.9rem;">No comments yet. Be the first to share your thoughts!</p>';
      return;
    }

    const visibleComments = postComments.slice(0, commentsLimit);

    let html = visibleComments
      .map((c) => {
        let cAuthor = users.find(
          (u) => u.username === c.userId || u.id === c.userId,
        );
        if (!cAuthor)
          cAuthor = {
            username: c.authorName || "Unknown",
            role: c.authorRole || "member",
          };
        const cDate = new Date(c.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
        <div class="comment-block">
          <div class="post-header" style="margin-bottom:0.4rem; cursor:pointer;" onclick="if(typeof openPublicProfile === 'function') openPublicProfile('${sanitize(c.userId)}');" title="View Profile">
            ${cAuthor && cAuthor.profilePicture ? `<div class="post-avatar" style="width:24px;height:24px;background-image:url('${cAuthor.profilePicture}'); background-size: cover; border-radius: 50%;"></div>` : `<div class="post-avatar" style="width:24px;height:24px;font-size:0.7rem;">${sanitize(cAuthor.username[0])}</div>`}
            <span class="post-author" style="font-size:0.8rem;">${sanitize(cAuthor.displayName || cAuthor.username)}</span>
            <span class="post-role-badge" style="font-size:0.6rem;">${sanitize(cAuthor.role)}</span>
            <span class="post-date" style="font-size:0.7rem;margin-left:auto;">${cDate}</span>
          </div>
          <div class="comment-body" style="padding-left:32px;font-size:0.9rem;color:var(--off-white);line-height:1.5;">
            ${sanitize(c.body).replace(/\n/g, "<br>")}
          </div>
        </div>
      `;
      })
      .join("");

    if (postComments.length > commentsLimit) {
      html += `
        <div style="text-align:center; padding-top:1rem;">
          <button id="viewMoreCommentsBtn" class="admin-btn" style="padding:0.4rem 1rem; border-radius:var(--radius-lg);">View More Comments (${postComments.length - commentsLimit} remaining)</button>
        </div>
      `;
    }

    container.innerHTML = html;

    const viewMoreBtn = document.getElementById("viewMoreCommentsBtn");
    if (viewMoreBtn) {
      viewMoreBtn.addEventListener("click", () => {
        commentsLimit += 3; // Load 3 more
        renderComments(); // Re-render
      });
    }
  };

  setTimeout(renderComments, 0);

  if (session) {
    setTimeout(() => {
      // Like listener
      const likeBtn = document.getElementById("postModalLikeBtn");
      const likeCount = document.getElementById("postModalLikeCount");
      if (likeBtn) {
        likeBtn.addEventListener("click", async () => {
          try {
            let currentPosts = Store.get("posts");
            let currentPostIndex = currentPosts.findIndex(
              (p) => p.id === postId,
            );
            if (currentPostIndex === -1) return;
            let currentPost = currentPosts[currentPostIndex];

            // Ensure likedBy is an array
            let likedByArray = Array.isArray(currentPost.likedBy)
              ? currentPost.likedBy
              : [];
            const hasLiked = likedByArray.includes(session.userId);

            if (hasLiked) {
              // Unlike
              likedByArray = likedByArray.filter(
                (uid) => uid !== session.userId,
              );
              currentPost.likes = Math.max(0, (currentPost.likes || 1) - 1);
              likeBtn.classList.remove("liked");
            } else {
              // Like
              likedByArray.push(session.userId);
              currentPost.likes = (currentPost.likes || 0) + 1;
              likeBtn.classList.add("liked");

              addAuditLog("Post liked", session.username, currentPost.title);
              if (currentPost.userId !== session.userId) {
                dispatchNotification(
                  currentPost.userId,
                  "like",
                  "New Like",
                  `${session.username} liked your post: "${currentPost.title}"`,
                  { postId: currentPost.id },
                );
              }
            }
            currentPost.likedBy = likedByArray;

            // Update local store explicitly
            Store.set("posts", currentPosts);
            likeCount.textContent = currentPost.likes;
            renderForum();

            // Sync with Supabase (updating the posts table directly)
            if (sbClient) {
              const { error } = await sbClient
                .from("posts")
                .update({
                  likes: currentPost.likes,
                  likedBy: currentPost.likedBy,
                })
                .eq("id", currentPost.id);

              if (error) {
                console.error("Supabase like update failed:", error);
                alert("Failed to sync like with database: " + error.message);
              }
            }
          } catch (e) {
            console.error("Like Error:", e);
            alert("Local Error while liking post: " + e.message);
          }
        });
      }

      // Comment listener
      const replyBtn = document.getElementById("modalCommentSubmit");
      const replyInput = document.getElementById("modalCommentInput");
      if (replyBtn && replyInput) {
        replyBtn.addEventListener("click", async () => {
          try {
            const body = replyInput.value.trim();
            if (!body) return;

            replyBtn.disabled = true;
            replyBtn.textContent = "Posting...";

            const newComment = {
              id: "c-" + crypto.randomUUID(),
              postId: postId,
              userId: session.username,
              authorName: session.username,
              authorRole: session.role,
              body: body,
              date: new Date().toISOString(),
            };
            if (cachedPostComments !== null) {
              cachedPostComments.unshift(newComment);
            }

            if (sbClient) {
              const { error: commentsErr } = await sbClient
                .from("comments")
                .insert([
                  {
                    id: newComment.id,
                    postId: newComment.postId,
                    userId: newComment.userId,
                    content: newComment.body,
                    created_at: newComment.date,
                  },
                ]);
              if (commentsErr) {
                alert(
                  "Supabase Database Error inserting comment: " +
                    commentsErr.message +
                    "\nAre you sure the 'comments' table exists in Supabase?",
                );
                replyBtn.disabled = false;
                replyBtn.textContent = "Reply";
                return;
              }
            }

            let currentPosts = Store.get("posts");
            let currentPostIndex = currentPosts.findIndex(
              (p) => p.id === postId,
            );
            if (currentPostIndex !== -1) {
              currentPosts[currentPostIndex].comments =
                (currentPosts[currentPostIndex].comments || 0) + 1;
              Store.set("posts", currentPosts);
              if (sbClient)
                await sbClient
                  .from("posts")
                  .update({
                    commentsCount: currentPosts[currentPostIndex].comments,
                  })
                  .eq("id", currentPosts[currentPostIndex].id);
            }

            addAuditLog(
              "Comment added",
              session.username,
              `Replying to ${post.title}`,
            );
            if (post.userId !== session.userId) {
              dispatchNotification(
                post.userId,
                "comment",
                "New Comment",
                `${session.username} replied to your post: "${post.title}"`,
                { postId: post.id },
              );
            }

            replyInput.value = "";
            replyBtn.disabled = false;
            replyBtn.textContent = "Reply";

            commentsLimit += 1; // Increase limit to show the newly posted comment immediately
            renderComments();
            const commentCounters = document.querySelectorAll(
              ".post-footer .post-action",
            );
            if (commentCounters.length === 2) {
              commentCounters[1].innerHTML = `💬 ${sanitize(String(currentPosts[currentPostIndex]?.comments || 0))}`;
            }

            renderForum();
          } catch (err) {
            console.error("Comment Reply Error:", err);
            alert(
              "A local error occurred while posting your comment: " +
                err.message,
            );
            replyBtn.disabled = false;
            replyBtn.textContent = "Reply";
          }
        });
      }
    }, 0);
  }

  if (canDelete) {
    const delBtn = document.getElementById("deletePostBtn");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        const confirmed = await customConfirm(
          "Are you certain you want to permanently delete this post?",
        );
        if (!confirmed) return;

        // Instant visual feedback
        delBtn.textContent = "Deleting...";
        delBtn.style.opacity = "0.5";
        delBtn.style.pointerEvents = "none";

        // Optimistic UI Update first
        closeModal("viewPostModal");
        let allPosts = Store.get("posts");
        allPosts = allPosts.filter((p) => String(p.id) !== String(postId));
        Store.set("posts", allPosts, true); // true forces save if needed, but Store handles it
        renderForum(); // Instantly hide it from the grid

        // Background network requests
        try {
          await deletePostImageFromBucket(post.image);
          if (sbClient) {
            await sbClient.from("posts").delete().eq("id", postId);
          }
          addAuditLog("Post deleted", session.username, post.title || postId);
          if (session.username !== post.userId) {
            dispatchNotification(
              post.userId,
              "violation",
              "Post Deleted",
              `Your post "${post.title}" was removed by a moderator.`,
            );
          }
        } catch (err) {
          console.error("Delayed delete failed:", err);
        }
      });
    }
  }

  if (canReport) {
    document.getElementById("reportPostBtn")?.addEventListener("click", () => {
      document.getElementById("reportPostId").value = postId;
      document.getElementById("reportReason").value = "Spam or Misleading";
      document.getElementById("reportMessage").value = "";
      openModal("reportModal");
      closeModal("viewPostModal");
    });
  }

  openModal("viewPostModal");
};

document
  .getElementById("reportModalClose")
  ?.addEventListener("click", () => closeModal("reportModal"));

document.getElementById("reportSubmitBtn")?.addEventListener("click", () => {
  const session = Store.get("session");
  if (!session) return;
  const postId = document.getElementById("reportPostId").value;
  const reason = document.getElementById("reportReason").value;
  const message = document.getElementById("reportMessage").value.trim();

  const allPosts = Store.get("posts");
  const targetPost = allPosts.find((p) => p.id === postId);
  if (!targetPost) return;

  const newReport = {
    id: "rep-" + crypto.randomUUID(),
    postId: postId,
    postTitle: targetPost.title,
    uploaderId: targetPost.userId,
    reportedBy: session.userId,
    reporterName: session.username,
    reason: reason,
    message: message,
    date: new Date().toISOString(),
  };
  const currentReports = Store.get("reports") || [];
  currentReports.push(newReport);
  Store.set("reports", currentReports);

  if (sbClient) {
    sbClient
      .from("reports")
      .insert([newReport])
      .then((res) => {
        if (res.error)
          console.error("Report Insert DB Error:", res.error.message);
      });
  }

  addAuditLog("Post reported", session.username, targetPost.title);

  closeModal("reportModal");
  customConfirm(
    "Your report has been submitted anonymously to the moderation team. Thank you.",
    "Report Received",
  );
});

/* ─────────────────────────────────────────────
   ADMIN PORTAL
───────────────────────────────────────────── */
const openAdminAuth = () => {
  const adminSession = Store.get("adminSession");
  const profile = Auth.getProfile();
  const isAdminPage = !!document.querySelector(".admin-standalone");

  if (adminSession && ["owner", "admin", "staff"].includes(adminSession.role)) {
    if (isAdminPage) {
      openAdminPortal();
    } else {
      window.location.href = "admin.html";
    }
  } else if (profile && ["owner", "admin", "staff"].includes(profile.role)) {
    Store.set("adminSession", {
      userId: profile.id,
      username: profile.username,
      role: profile.role,
    });
    if (isAdminPage) {
      openAdminPortal();
    } else {
      window.location.href = "admin.html";
    }
  } else {
    if (isAdminPage) {
      openModal("adminAuthModal");
    } else {
      window.location.href = "admin.html";
    }
  }
};

// If we are on the admin page, trigger the flow on load
if (document.querySelector(".admin-standalone")) {
  setTimeout(openAdminAuth, 100);
}

const adminAnncBtn = document.getElementById("adminAnnouncementsBtn");
if (adminAnncBtn)
  adminAnncBtn.addEventListener("click", (e) => {
    // If it's explicitly rendered as a link, the browser handles it. If not, trigger auth manually.
    if (adminAnncBtn.tagName !== "A") openAdminAuth();
  });

const footAdminBtn = document.getElementById("footerAdminBtn");
if (footAdminBtn)
  footAdminBtn.addEventListener("click", (e) => {
    if (footAdminBtn.tagName !== "A") openAdminAuth();
  });

document
  .getElementById("adminAuthSubmit")
  ?.addEventListener("click", async () => {
    const username = document.getElementById("adminAuthUser").value.trim();
    const password = document.getElementById("adminAuthPass").value;
    const errEl = document.getElementById("adminAuthError");
    errEl.setAttribute("hidden", "");

    if (!sbClient) {
      errEl.textContent = "Connection unavailable.";
      errEl.removeAttribute("hidden");
      return;
    }

    const { error } = await Auth.signIn(username, password);
    if (error) {
      errEl.textContent = "Invalid credentials.";
      errEl.removeAttribute("hidden");
      return;
    }

    const profile = Auth.getProfile();
    if (!profile || !["owner", "admin", "staff"].includes(profile.role)) {
      errEl.textContent = "Invalid credentials or insufficient permissions.";
      errEl.removeAttribute("hidden");
      await sbClient.auth.signOut();
      return;
    }

    Store.set("adminSession", {
      userId: profile.id,
      username: profile.username,
      role: profile.role,
    });
    addAuditLog("Admin login", profile.username, "portal");
    closeModal("adminAuthModal");
    openAdminPortal();
  });

const openAdminPortal = () => {
  const session = Store.get("adminSession");
  if (!session) {
    openAdminAuth();
    return;
  }

  const adminModal = document.getElementById("adminModal");
  if (adminModal) {
    if (adminModal.innerHTML.trim() === "") {
      const template = document.getElementById("adminTemplate");
      if (template) {
        adminModal.appendChild(template.content.cloneNode(true));

        // Bind listeners exclusively inside the newly injected DOM
        document
          .getElementById("adminLogout")
          ?.addEventListener("click", () => {
            const s = Store.get("adminSession");
            if (s) addAuditLog("Admin logout", s.username, "portal");
            Store.set("adminSession", null);
            adminModal.setAttribute("hidden", "");
            adminModal.innerHTML = ""; // Wipe DOM from devtools
            openAdminAuth();
          });

        const hamburger = document.getElementById("adminHamburger");
        const nav = document.getElementById("adminNav");
        hamburger?.addEventListener("click", () => {
          const isExpanded = hamburger.getAttribute("aria-expanded") === "true";
          hamburger.setAttribute("aria-expanded", !isExpanded);
          if (!isExpanded) {
            nav?.classList.add("open");
            hamburger.classList.add("open");
          } else {
            nav?.classList.remove("open");
            hamburger.classList.remove("open");
          }
        });

        document.querySelectorAll(".admin-nav-item").forEach((btn) => {
          btn.addEventListener("click", () => {
            nav?.classList.remove("open");
            hamburger?.classList.remove("open");
            hamburger?.setAttribute("aria-expanded", "false");

            document
              .querySelectorAll(".admin-nav-item")
              .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderAdminPanel(btn.dataset.panel);
          });
        });
      }
    }
    adminModal.removeAttribute("hidden");
  }

  const userInfoEl = document.getElementById("adminUserInfo");
  if (userInfoEl)
    userInfoEl.innerHTML = `<strong>${sanitize(session.username)}</strong><br><span class="role-badge role-${session.role}">${sanitize(session.role)}</span>`;
  renderAdminPanel("dashboard");
};

const canDo = (action) => {
  const s = Store.get("adminSession");
  if (!s) return false;
  if (s.role === "owner") return true;
  if (s.role === "admin")
    return [
      "post_announcement",
      "manage_posts",
      "view_users",
      "manage_users",
      "view_audit",
      "view_status",
      "manage_lessons",
    ].includes(action);
  if (s.role === "staff")
    return ["post_announcement", "manage_posts", "manage_lessons"].includes(
      action,
    );
  return false;
};

const renderAdminPanel = (panel) => {
  const main = document.getElementById("adminMain");
  const session = Store.get("adminSession");

  switch (panel) {
    case "dashboard": {
      const users = Store.get("users");
      const posts = Store.get("posts");
      const announcements = Store.get("announcements");
      main.innerHTML = `
        <div class="admin-panel-title">Dashboard</div>
        <div class="admin-stats-grid">
          <div class="admin-stat-card"><div class="stat-number">${users.length}</div><div class="stat-label">Total Users</div></div>
          <div class="admin-stat-card"><div class="stat-number">${posts.length}</div><div class="stat-label">Forum Posts</div></div>
          <div class="admin-stat-card"><div class="stat-number">${announcements.length}</div><div class="stat-label">Announcements</div></div>
        </div>
        <h3 style="font-size:0.95rem;margin-bottom:1rem;color:var(--mid);">Recent Activity</h3>
        ${Store.get("auditLog")
          .slice(-5)
          .reverse()
          .map(
            (l) => `
          <div class="audit-entry">
            <div class="audit-action">${sanitize(l.action)}: <strong>${sanitize(l.target)}</strong></div>
            <div class="audit-meta"><span>By: ${sanitize(l.performedBy)}</span><span>${new Date(l.date).toLocaleString()}</span></div>
          </div>
        `,
          )
          .join("")}
      `;
      break;
    }
    case "announcements": {
      const canPost = canDo("post_announcement");
      main.innerHTML = `<div class="admin-panel-title">Loading Announcements...</div>`;
      if (sbClient) {
        sbClient
          .from("announcements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50)
          .then(({ data: ann, error }) => {
            if (error || !ann) ann = [];
            main.innerHTML = `
            <div class="admin-section-header">
              <div class="admin-panel-title" style="border:none;margin:0;padding:0;">Announcements (Recent 50)</div>
              ${canPost ? '<button class="btn-primary btn-sm" id="newAnnouncementBtn">+ New Announcement</button>' : '<span style="color:var(--mid);font-size:0.82rem;">View only</span>'}
            </div>
            <div style="overflow-x:auto; width:100%;"><table class="admin-table">
              <thead><tr><th>Subject</th><th>Author ID</th><th>Date</th>${canPost ? "<th>Actions</th>" : ""}</tr></thead>
              <tbody>
                ${ann
                  .map(
                    (a) => `<tr>
                    <td>${sanitize(a.subject || a.title)}</td>
                    <td>${sanitize(a.authorId || a.author || "—")}</td>
                    <td>${new Date(a.created_at || a.date).toLocaleDateString()}</td>
                    ${canPost ? `<td><button class="admin-btn danger" data-delete-ann="${sanitize(a.id)}">Delete</button></td>` : ""}
                  </tr>`,
                  )
                  .join("")}
              </tbody>
            </table></div>
          `;
            document
              .getElementById("newAnnouncementBtn")
              ?.addEventListener("click", () => openModal("composerModal"));
            main.querySelectorAll("[data-delete-ann]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                if (
                  !(await customConfirm(
                    "Are you certain you want to permanently delete this announcement?",
                  ))
                )
                  return;
                const annId = btn.dataset.deleteAnn;
                await sbClient.from("announcements").delete().eq("id", annId);
                addAuditLog("Announcement deleted", session.username, annId);
                renderAdminPanel("announcements");
              });
            });
          });
      }
      break;
    }
    case "posts": {
      const canManage = canDo("manage_posts");
      main.innerHTML = `<div class="admin-panel-title">Loading Forum Posts...</div>`;
      if (sbClient) {
        sbClient
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50)
          .then(({ data: posts, error }) => {
            if (error || !posts) posts = [];
            main.innerHTML = `
            <div class="admin-panel-title">Forum Posts (Recent 50)</div>
            <div style="overflow-x:auto; width:100%;"><table class="admin-table">
              <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Date</th>${canManage ? "<th>Actions</th>" : ""}</tr></thead>
              <tbody>
                ${posts
                  .map(
                    (p) => `<tr>
                    <td><a href="#" class="admin-view-post" data-post-id="${sanitize(p.id)}" style="color:var(--white);text-decoration:underline;">${sanitize(p.title.slice(0, 40))}${p.title.length > 40 ? "…" : ""}</a></td>
                    <td>${sanitize(p.userId || p.authorName || "—")}</td>
                    <td>${sanitize(categoryLabels[p.category] || p.category)}</td>
                    <td>${new Date(p.created_at || p.date).toLocaleDateString()}</td>
                    ${canManage ? `<td><button class="admin-btn danger" data-delete-post="${sanitize(p.id)}" data-post-image="${sanitize(p.image || "")}">Delete</button></td>` : ""}
                  </tr>`,
                  )
                  .join("")}
              </tbody>
            </table></div>
          `;
            main.querySelectorAll(".admin-view-post").forEach((link) => {
              link.addEventListener("click", (e) => {
                e.preventDefault();
                openViewPost(link.dataset.postId);
              });
            });
            main.querySelectorAll("[data-delete-post]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                if (
                  !(await customConfirm(
                    "Are you certain you want to permanently delete this post?",
                  ))
                )
                  return;
                const postId = btn.dataset.deletePost;
                const postImage = btn.dataset.postImage;
                if (postImage) await deletePostImageFromBucket(postImage);
                await sbClient.from("posts").delete().eq("id", postId);
                addAuditLog("Forum post deleted", session.username, postId);
                renderAdminPanel("posts");
              });
            });
          });
      }
      break;
    }
    case "reports": {
      if (!canDo("manage_posts")) {
        main.innerHTML =
          '<div class="admin-panel-title">Report Logs</div><p style="color:var(--mid);">You do not have permission to view reports.</p>';
        return;
      }
      main.innerHTML = `<div class="admin-panel-title">Loading Reports...</div>`;
      if (sbClient) {
        sbClient
          .from("reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50)
          .then(({ data: reports, error }) => {
            if (error || !reports) reports = [];
            main.innerHTML = `
            <div class="admin-panel-title">Report Logs (Recent 50)</div>
            <div style="overflow-x:auto; width:100%;"><table class="admin-table">
              <thead><tr><th>Date</th><th>Reported By</th><th>Post Title</th><th>Reason</th><th>Message</th><th>Actions</th></tr></thead>
              <tbody>
                ${reports.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--mid);">No active reports</td></tr>' : ""}
                ${reports
                  .map(
                    (r) => `<tr>
                  <td style="white-space:nowrap;">${new Date(r.created_at || r.date).toLocaleDateString()}</td>
                  <td>${sanitize(r.reporterName || "Unknown")}</td>
                  <td><a href="#" class="report-view-post" data-post-id="${sanitize(r.postId)}" style="color:var(--white);text-decoration:underline;">${sanitize(r.postTitle ? r.postTitle.slice(0, 30) : "—")}${r.postTitle && r.postTitle.length > 30 ? "…" : ""}</a></td>
                  <td><span style="color:var(--error);">${sanitize(r.reason)}</span></td>
                  <td>${sanitize(r.message || "—")}</td>
                  <td style="white-space:nowrap;">
                    <button class="admin-btn danger" style="margin-right:0.4rem;" data-report-delete-post="${sanitize(r.postId)}" data-report-id="${sanitize(r.id)}">Delete Post</button>
                    <button class="admin-btn danger" style="margin-right:0.4rem;" data-report-delete-user="${sanitize(r.uploaderId)}" data-report-id="${sanitize(r.id)}">Delete Account</button>
                    <button class="admin-btn" style="color:var(--mid);" data-report-dismiss="${sanitize(r.id)}">Dismiss</button>
                  </td>
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table></div>
          `;

            main.querySelectorAll(".report-view-post").forEach((link) => {
              link.addEventListener("click", (e) => {
                e.preventDefault();
                openViewPost(link.dataset.postId);
              });
            });

            main.querySelectorAll("[data-report-dismiss]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                if (
                  !(await customConfirm(
                    "Dismiss this report? No action will be taken.",
                  ))
                )
                  return;
                const rid = btn.dataset.reportDismiss;
                await sbClient.from("reports").delete().eq("id", rid);
                addAuditLog("Report dismissed", session.username, rid);
                renderAdminPanel("reports");
              });
            });

            main
              .querySelectorAll("[data-report-delete-post]")
              .forEach((btn) => {
                btn.addEventListener("click", async () => {
                  if (
                    !(await customConfirm(
                      "Are you certain you want to delete the reported post?",
                    ))
                  )
                    return;
                  const pid = btn.dataset.reportDeletePost;
                  const rid = btn.dataset.reportId;
                  await sbClient.from("posts").delete().eq("id", pid);
                  await sbClient.from("reports").delete().eq("id", rid);
                  addAuditLog("Post deleted via Report", session.username, pid);
                  renderAdminPanel("reports");
                });
              });

            main
              .querySelectorAll("[data-report-delete-user]")
              .forEach((btn) => {
                btn.addEventListener("click", async () => {
                  if (
                    !(await customConfirm(
                      "DANGER: Delete the uploader's entire account?",
                    ))
                  )
                    return;
                  const uid = btn.dataset.reportDeleteUser;
                  const rid = btn.dataset.reportId;
                  if (uid) {
                    await sbClient.from("users").delete().eq("id", uid);
                    addAuditLog("User wiped via Report", session.username, uid);
                  } else {
                    await sbClient.from("reports").delete().eq("id", rid);
                  }
                  renderAdminPanel("reports");
                });
              });
          });
      }
      break;
    }
    case "users": {
      if (!canDo("view_users")) {
        main.innerHTML =
          '<div class="admin-panel-title">Users</div><p style="color:var(--mid);">You do not have permission to view users.</p>';
        return;
      }
      const isOwner = session.role === "owner";
      const canManage = canDo("manage_users");

      main.innerHTML = `<div class="admin-panel-title">Loading Users...</div>`;

      if (sbClient) {
        sbClient
          .from("users")
          .select("*")
          .then(({ data, error }) => {
            if (error) {
              main.innerHTML = `<p style="color:var(--error);">Failed to load users from Supabase.</p>`;
              return;
            }

            let usersList = data || [];
            // Organize by role logic (owner > admin > staff > member)
            const roleWeight = { owner: 4, admin: 3, staff: 2, member: 1 };
            usersList.sort((a, b) => {
              const diff =
                (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0);
              return diff !== 0 ? diff : a.username.localeCompare(b.username);
            });

            main.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
              <div class="admin-panel-title">Users (${usersList.length})</div>
              <input type="text" id="adminUserSearch" class="form-input" placeholder="Search a username..." style="width:100%; max-width:250px; padding:0.4rem 0.8rem; margin-bottom:1.5rem;" />
            </div>
            <div style="overflow-x:auto; width:100%;"><table class="admin-table">
              <thead><tr><th>Username</th><th>Role</th><th>Joined</th>${canManage ? "<th>Actions</th>" : ""}</tr></thead>
              <tbody id="adminUsersTableBody">
                ${usersList
                  .map(
                    (u) => `<tr data-row-username="${sanitize(u.username)}">
                  <td>${sanitize(u.username)}</td>
                  <td><span class="role-badge role-${u.role}" id="badge-${sanitize(u.username)}">${sanitize(u.role)}</span></td>
                  <td>${sanitize(u.joined)}</td>
                  ${
                    canManage && u.username !== session.username
                      ? `<td>
                    ${
                      isOwner
                        ? `<select class="form-input form-select" style="padding:0.2rem 0.4rem;font-size:0.78rem;width:auto;display:inline-block;" data-role-user="${sanitize(u.username)}">
                      <option value="member"${u.role === "member" ? " selected" : ""}>member</option>
                      <option value="staff"${u.role === "staff" ? " selected" : ""}>staff</option>
                      <option value="admin"${u.role === "admin" ? " selected" : ""}>admin</option>
                    </select>
                    <button class="admin-btn" style="margin-left:0.4rem;" data-save-role="${sanitize(u.username)}">Save</button>`
                        : ""
                    }
                    <button class="admin-btn danger" style="margin-left:0.4rem;" data-delete-user="${sanitize(u.username)}">Delete</button>
                  </td>`
                      : canManage
                        ? '<td><span style="color:var(--mid);font-size:0.78rem;">You</span></td>'
                        : ""
                  }
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table></div>
          `;

            // Search functionality
            const searchInput = document.getElementById("adminUserSearch");
            if (searchInput) {
              searchInput.addEventListener("input", (e) => {
                const term = e.target.value.toLowerCase();
                document
                  .querySelectorAll("#adminUsersTableBody tr")
                  .forEach((row) => {
                    const uname = row.dataset.rowUsername.toLowerCase();
                    row.style.display = uname.includes(term) ? "" : "none";
                  });
              });
            }

            // Deletion handler
            main.querySelectorAll("[data-delete-user]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                if (
                  !confirm(
                    "Are you sure you want to permanently delete this user account?",
                  )
                )
                  return;
                const uname = btn.dataset.deleteUser;

                const { error } = await sbClient
                  .from("users")
                  .delete()
                  .eq("username", uname);
                if (error) {
                  alert(`Failed to delete user in Supabase: ${error.message}`);
                  return;
                }

                // Instant UI update
                const row = document.querySelector(
                  `tr[data-row-username="${sanitize(uname)}"]`,
                );
                if (row) row.remove();

                const usersArr = Store.get("users").filter(
                  (u) => u.username !== uname,
                );
                Store.set("users", usersArr);

                if (session.username === uname) {
                  Store.set("session", null);
                  updateNavForSession();
                  renderForum();
                }
                addAuditLog("User deleted", session.username, uname);
              });
            });

            // Role change handler
            main.querySelectorAll("[data-save-role]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                const uname = btn.dataset.saveRole;
                const select = main.querySelector(
                  `[data-role-user="${sanitize(uname)}"]`,
                );
                if (!select) return;
                const newRole = select.value;

                // Get session directly to debug authentication
                const sessionResp = await sbClient.auth.getSession();
                const authUser = sessionResp.data?.session?.user;
                if (!authUser) {
                  alert(
                    "Debug: You are not authenticated in Supabase! (sbClient has no session)",
                  );
                  return;
                }

                const { data, error } = await sbClient
                  .from("users")
                  .update({ role: newRole })
                  .eq("username", uname)
                  .select();
                if (error) {
                  console.error("Supabase role update error:", error);
                  alert(
                    `Failed to update Role in Supabase:\n\n${error.message}`,
                  );
                  return; // Stop local optimistic update since DB rejected it
                }

                if (!data || data.length === 0) {
                  alert(
                    `Debug: The database update matched ZERO rows.\nCurrent Auth UID: ${authUser.id}\nTarget Username: ${uname}\nExpected Role: ${newRole}\n\nThis means your row-level security policy rejected the update (likely because it doesn't recognize your UID as an admin/owner).`,
                  );
                  return;
                }

                // Instant optimistic UI update
                const badge = main.querySelector(`#badge-${sanitize(uname)}`);
                let oldRole = "unknown";
                if (badge) {
                  oldRole = badge.textContent;
                  badge.className = `role-badge role-${newRole}`;
                  badge.textContent = newRole;
                }
                btn.textContent = "Saved!";
                setTimeout(() => {
                  if (btn) btn.textContent = "Save";
                }, 1500);

                const usersArr = Store.get("users");
                const user = usersArr.find((u) => u.username === uname);
                if (user) {
                  user.role = newRole;
                  Store.set("users", usersArr);
                  addAuditLog(
                    `Role changed ${oldRole} → ${newRole}`,
                    session.username,
                    uname,
                  );
                }
              });
            });
          });
      } else {
        main.innerHTML = `<p style="color:var(--error);">Supabase disconnected.</p>`;
      }
      break;
    }
    case "lessons": {
      if (!canDo("manage_lessons")) {
        main.innerHTML =
          '<div class="admin-panel-title">Lessons</div><p style="color:var(--mid);">You do not have permission to manage lessons.</p>';
        return;
      }
      const lessons = Store.get("lessons") || [];
      lessons.sort(
        (a, b) =>
          parseFloat(a.step_number || 0) - parseFloat(b.step_number || 0),
      );

      main.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <div class="admin-panel-title" style="margin-bottom:0;">Roadmap Lessons (${lessons.length})</div>
          <button class="btn-primary" id="lessonNewBtn">New Lesson</button>
        </div>
        <div style="overflow-x:auto; width:100%;"><table class="admin-table">
          <thead><tr><th>Step</th><th>Loc</th><th>Section</th><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${lessons.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--mid);">No lessons yet.</td></tr>' : ""}
            ${lessons
              .map(
                (l) => `<tr>
              <td>${sanitize(l.step_number?.toString() || "0")}</td>
              <td><span style="color:var(--primary);">${sanitize(l.tab_level)}</span></td>
              <td>${sanitize(l.section)}</td>
              <td><strong>${sanitize(l.title)}</strong></td>
              <td><span class="role-badge role-${l.status === "published" ? "owner" : "member"}">${sanitize(l.status)}</span></td>
              <td style="white-space:nowrap;">
                <button class="admin-btn edit-lesson-btn" data-id="${sanitize(l.id)}">Edit</button>
                <button class="admin-btn danger del-lesson-btn" data-id="${sanitize(l.id)}">Delete</button>
              </td>
            </tr>`,
              )
              .join("")}
          </tbody>
        </table></div>
      `;

      main.querySelector("#lessonNewBtn").addEventListener("click", () => {
        document.getElementById("lessonId").value = "";
        document.getElementById("lessonStep").value = "";
        document.getElementById("lessonTab").value = "Beginner";
        document.getElementById("lessonSection").value = "";
        document.getElementById("lessonTitle").value = "";
        document.getElementById("lessonDescription").value = "";
        document.getElementById("lessonIcon").value = "📚";
        document.getElementById("lessonStatus").value = "Published";
        document.getElementById("lessonVideoUrl").value = "";
        document.getElementById("lessonContent").value = "";
        document.getElementById("lessonModalTitle").textContent =
          "Create Lesson";
        document.getElementById("lessonError").hidden = true;
        document.getElementById("lessonModal").hidden = false;
      });

      main.querySelectorAll(".edit-lesson-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const l = lessons.find((x) => x.id === btn.dataset.id);
          if (!l) return;
          document.getElementById("lessonId").value = l.id;
          document.getElementById("lessonStep").value = l.step_number || "";
          document.getElementById("lessonTab").value =
            l.tab_level || "Beginner";
          document.getElementById("lessonSection").value = l.section || "";
          document.getElementById("lessonTitle").value = l.title || "";
          document.getElementById("lessonDescription").value =
            l.description || "";
          document.getElementById("lessonIcon").value = l.icon || "📚";
          document.getElementById("lessonStatus").value =
            l.status || "Published";

          let rawContent = l.content || "";
          let matchedVid = rawContent.match(
            /<div class="youtube-embed-wrapper" style="margin-bottom:1\.5rem;"><iframe width="100%" height="315" src="https:\/\/www\.youtube\.com\/embed\/([^"?]+)".*?<\/iframe><\/div>/,
          );
          if (matchedVid && matchedVid[1]) {
            document.getElementById("lessonVideoUrl").value =
              "https://youtube.com/watch?v=" + matchedVid[1];
            rawContent = rawContent.replace(matchedVid[0], "");
          } else {
            document.getElementById("lessonVideoUrl").value = "";
          }
          document.getElementById("lessonContent").value = rawContent;

          document.getElementById("lessonModalTitle").textContent =
            "Edit Lesson";
          document.getElementById("lessonError").hidden = true;
          document.getElementById("lessonModal").hidden = false;
        });
      });

      main.querySelectorAll(".del-lesson-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!(await customConfirm("Delete this lesson permanently?"))) return;
          const id = btn.dataset.id;
          if (sbClient) {
            await sbClient.from("lessons").delete().eq("id", id);
          }
          const updated = Store.get("lessons").filter((l) => l.id !== id);
          Store.set("lessons", updated);
          renderAdminPanel("lessons");
        });
      });
      break;
    }
    case "audit": {
      if (!canDo("view_audit")) {
        main.innerHTML =
          '<div class="admin-panel-title">Audit Log</div><p style="color:var(--mid);">You do not have permission to view the audit log.</p>';
        return;
      }

      const allLogs = Store.get("auditLog").slice().reverse();

      const renderLogs = (filterDate) => {
        const filtered = filterDate
          ? allLogs.filter((l) => {
              const d = new Date(l.date);
              const lDate =
                d.getFullYear() +
                "-" +
                String(d.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(d.getDate()).padStart(2, "0");
              return lDate === filterDate;
            })
          : allLogs;

        const countEl = document.getElementById("auditLogCount");
        if (countEl) countEl.textContent = `(${filtered.length} entries)`;

        const container = document.getElementById("auditLogContainer");
        if (!container) return;

        if (filtered.length === 0) {
          container.innerHTML =
            '<p style="color:var(--mid); padding:1rem 0;">No audit logs found for this date.</p>';
        } else {
          container.innerHTML = filtered
            .map(
              (l) => `
              <div class="audit-entry">
                <div class="audit-action">${sanitize(l.action)}: <strong>${sanitize(l.target)}</strong></div>
                <div class="audit-meta"><span>By: ${sanitize(l.performedBy)}</span><span>${new Date(l.date).toLocaleString()}</span></div>
              </div>
            `,
            )
            .join("");
        }
      };

      main.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom: 1.5rem;">
          <div class="admin-panel-title" style="margin-bottom:0;">Audit Log <span id="auditLogCount" style="font-size:1rem; color:var(--mid);"></span></div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
             <span style="color:var(--mid); font-size:0.85rem;">Filter:</span>
             <input type="date" id="auditDateFilter" class="form-input" style="padding:0.4rem 0.8rem; width:auto; cursor:pointer;" />
             <button id="auditDateClearBtn" class="admin-btn" style="padding:0.4rem 0.8rem; display:none;">Clear</button>
          </div>
        </div>
        <div id="auditLogContainer"></div>
      `;

      renderLogs("");

      const dateInput = document.getElementById("auditDateFilter");
      const clearBtn = document.getElementById("auditDateClearBtn");

      dateInput.addEventListener("change", (e) => {
        const d = e.target.value;
        clearBtn.style.display = d ? "inline-block" : "none";
        renderLogs(d);
      });

      clearBtn.addEventListener("click", () => {
        dateInput.value = "";
        clearBtn.style.display = "none";
        renderLogs("");
      });

      break;
    }
    case "status": {
      if (!canDo("view_status")) {
        main.innerHTML =
          '<div class="admin-panel-title">System Status</div><p style="color:var(--mid);">You do not have permission to view the system status.</p>';
        return;
      }

      const dbStatus = supabase
        ? '<span style="color:var(--primary); font-weight:bold;">Online (Connected)</span>'
        : '<span style="color:var(--error); font-weight:bold;">Offline</span>';

      main.innerHTML = `
        <div class="admin-panel-title">System Status</div>
        <div class="admin-stats-grid" style="grid-template-columns: 1fr;">
          <div class="admin-stat-card" style="text-align: left; padding: 2rem;">
            <div style="font-size: 1.2rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; color:var(--white);">Database Services</div>
            <p style="margin-bottom: 0.5rem;"><strong style="color:var(--white);">Supabase PostgreSQL:</strong> ${dbStatus}</p>
            <p style="margin-bottom: 0.5rem;"><strong style="color:var(--white);">Local Cache Storage:</strong> <span style="color:var(--primary); font-weight:bold;">Active</span></p>
            
            <div style="margin-top: 1.5rem; padding: 1.5rem; background: rgba(0,0,0,0.2); border-radius: var(--radius-lg); border: 1px solid var(--border);">
               <h4 style="margin-bottom: 1rem; color:var(--white); font-size:1rem;">Cloud Connectivity Test</h4>
               <button id="adminPingDbBtn" class="btn-primary btn-sm">Start Connection Test</button>
               <div id="adminPingDbResult" style="margin-top:1rem; font-size:0.95rem; color:var(--mid);">Awaiting test execution...</div>
            </div>
            
            <div style="font-size: 1.2rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-top: 2rem; color:var(--white);">Application State</div>
            <p style="margin-bottom: 0.5rem;"><strong style="color:var(--white);">Version:</strong> 2.0.0</p>
            <p style="margin-bottom: 0.5rem;"><strong style="color:var(--white);">Total Data Collections:</strong> <span style="color:var(--primary); font-weight:bold;">Synchronized</span></p>
            <p style="margin-bottom: 0.5rem;"><strong style="color:var(--white);">Global Health:</strong> <span style="color:var(--primary); font-weight:bold;">All Systems Operational</span></p>
          </div>
        </div>
      `;

      setTimeout(() => {
        const pingBtn = document.getElementById("adminPingDbBtn");
        const pingRes = document.getElementById("adminPingDbResult");
        if (pingBtn && sbClient) {
          pingBtn.addEventListener("click", () => {
            pingBtn.disabled = true;
            pingRes.innerHTML =
              'Connecting to cloud... <span class="loading-spinner" style="display:inline-block;width:12px;height:12px;border:2px solid var(--mid);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></span>';

            // Quick connection test for Supabase
            sbClient
              .from("status_check")
              .upsert({
                id: "ping",
                last_online: new Date().toISOString(),
                message: "Hello from Peak Society Admin!",
              })
              .then(({ error }) => {
                if (error) throw error;
                const time = new Date().toLocaleTimeString();
                pingRes.innerHTML = `<span style="color:var(--primary);">✅ Supabase Connection Successful!</span> <span style="color:var(--mid);font-size:0.8rem;">(Last check: ${time})</span>`;
                console.log("✅ Supabase Connection Successful!");
                pingBtn.disabled = false;
                pingBtn.textContent = "Run Test Again";
              })
              .catch((error) => {
                pingRes.innerHTML = `<span style="color:var(--error);">❌ Supabase Connection Error: ${sanitize(error.message || error)}</span>`;
                console.error("❌ Supabase Connection Error: ", error);
                pingBtn.disabled = false;
                pingBtn.textContent = "Retry Test";
              });
          });
        } else if (pingBtn && !sbClient) {
          pingBtn.disabled = true;
          pingRes.innerHTML =
            '<span style="color:var(--error);">❌ Supabase is not initialized.</span>';
        }
      }, 0);
      break;
    }
  }
};

/* ─────────────────────────────────────────────
   AUDIT LOG HELPER
───────────────────────────────────────────── */
const addAuditLog = (action, performedBy, target) => {
  const session = Store.get("session");
  // Only record audit logs for owner, admin, or staff
  if (session && session.role === "member") return;

  const newLog = {
    id: "log-" + crypto.randomUUID(),
    action,
    performedBy,
    target,
    date: new Date().toISOString(),
  };

  const logs = Store.get("auditLog");
  logs.push(newLog);
  // Perform local update, skipping the generic 'store' backup mechanism
  Store.set("auditLog", logs, true);

  if (sbClient) {
    // Write directly to the structured SQL audit_logs table instead of JSON blobs
    sbClient
      .from("audit_logs")
      .insert([
        {
          id: newLog.id,
          action: newLog.action,
          performedBy: newLog.performedBy,
          target: newLog.target,
          date: newLog.date,
        },
      ])
      .then((res) => {
        if (res.error) console.error("Audit DB Error:", res.error.message);
      });
  }
};

/* ─────────────────────────────────────────────
   RICH TEXT ANNOUNCEMENT COMPOSER
───────────────────────────────────────────── */
document.querySelectorAll(".toolbar-btn[data-cmd]").forEach((btn) => {
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault(); // Prevent button from stealing focus
    document.execCommand(btn.dataset.cmd, false, null);
    document.getElementById("announcementBody").focus();
  });
});

document.getElementById("textColorPicker")?.addEventListener("input", (e) => {
  document.execCommand("foreColor", false, e.target.value);
  document.getElementById("announcementBody").focus();
});

document
  .getElementById("composerSubmit")
  ?.addEventListener("click", async () => {
    const session = Store.get("adminSession");
    if (!session || !canDo("post_announcement")) {
      closeModal("composerModal");
      return;
    }

    const subject = document.getElementById("announcementSubject").value.trim();
    const body = document.getElementById("announcementBody").innerHTML.trim();
    const errEl = document.getElementById("composerError");
    errEl.setAttribute("hidden", "");

    if (!subject) {
      errEl.textContent = "Please provide a subject/title.";
      errEl.removeAttribute("hidden");
      return;
    }
    if (!body || body === "<br>") {
      errEl.textContent = "Please write some content.";
      errEl.removeAttribute("hidden");
      return;
    }

    const newAnn = {
      id: "a-" + crypto.randomUUID(),
      authorId: session.username,
      subject,
      body: sanitizeHTML(body),
      date: new Date().toISOString(),
    };
    const newAnnDB = {
      id: newAnn.id,
      title: newAnn.subject,
      content: newAnn.body,
      author: newAnn.authorId,
      tag: "Staff",
      created_at: newAnn.date,
    };
    if (sbClient) {
      const { error } = await sbClient.from("announcements").insert([newAnnDB]);
      if (error) {
        errEl.textContent = "Database Error: " + error.message;
        errEl.removeAttribute("hidden");
        return;
      }
      // Optimistic UI Update locally without triggering massive upserts
      const announcements = Store.get("announcements");
      announcements.push(newAnn);
      try {
        localStorage.setItem("ps_announcements", JSON.stringify(announcements));
      } catch {}
    } else {
      errEl.textContent = "Database offline. Cannot post locally.";
      errEl.removeAttribute("hidden");
      return;
    }
    addAuditLog("Announcement posted", session.username, subject);
    dispatchNotification(
      "all",
      "announcement",
      "New Announcement",
      `Admin posted a new announcement: "${subject}".`,
      { hash: "#announcements" },
    );

    document.getElementById("announcementSubject").value = "";
    document.getElementById("announcementBody").innerHTML = "";
    closeModal("composerModal");
    renderAnnouncements();
    renderAdminPanel("announcements");
  });

/* ─────────────────────────────────────────────
   SECURITY: Prevent common attacks
───────────────────────────────────────────── */
// Disable right-click inspection of sensitive elements
document.querySelectorAll(".admin-main, .modal").forEach((el) => {
  el.addEventListener("contextmenu", (e) => e.preventDefault());
});

// Rate limiting is handled inside the authSubmit listener above.

// Disable dev tools shortcut hint
document.addEventListener("keydown", (e) => {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key))
  ) {
    // Note: We don't block DevTools (impossible and counterproductive),
    // but we ensure no sensitive data is in window scope
  }
});

// Freeze admin session check to prevent console manipulation
Object.freeze(canDo);
/* ─────────────────────────────────────────────
   PROFILE & ACCOUNT LOGIC
───────────────────────────────────────────── */
if (document.getElementById("navProfileWidget")) {
  document.getElementById("navProfileWidget").addEventListener("click", () => {
    const session = Store.get("session");
    if (!session) return;
    const users = Store.get("users");
    const me = users.find((u) => u.username === session.username);
    if (!me) return;

    document
      .querySelectorAll(".profile-tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".profile-panel")
      .forEach((p) => p.setAttribute("hidden", ""));
    document
      .querySelector('.profile-tab[data-target="profileDisplay"]')
      ?.classList.add("active");
    document.getElementById("profileDisplay")?.removeAttribute("hidden");

    document.getElementById("profileDisplayName").value =
      me.displayName || me.username;
    document.getElementById("profileBio").value = me.bio || "";

    const avatarEl = document.getElementById("profileEditAvatar");
    const innerBase = `<div class="profile-avatar-overlay">Upload</div><input type="file" id="profileImageUpload" accept="image/png, image/jpeg" />`;
    if (me.profilePicture) {
      avatarEl.style.backgroundImage = `url('${me.profilePicture}')`;
      avatarEl.innerHTML = innerBase;
      avatarEl.dataset.b64 = me.profilePicture;
    } else {
      avatarEl.style.backgroundImage = "none";
      avatarEl.innerHTML =
        innerBase +
        '<span style="font-size: 2.5rem; color: var(--mid);">&#128100;</span>';
      avatarEl.dataset.b64 = "";
    }

    // Re-attach event listener since innerHTML replaced the input
    setTimeout(() => {
      document.getElementById("profileImageUpload")?.addEventListener(
        "change",
        window.profileUploadCallback ||
          (window.profileUploadCallback = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              const b64 = ev.target.result;
              const aEl = document.getElementById("profileEditAvatar");
              aEl.style.backgroundImage = `url('${b64}')`;
              aEl.innerHTML = innerBase; // Remove the user icon visually when uploaded
              aEl.dataset.b64 = b64;
            };
            reader.readAsDataURL(file);
          }),
      );
    }, 50);

    document.getElementById("profileNewUsername").value = me.username;
    const lockEl = document.getElementById("usernameLockLabel");
    if (me.lastUsernameChange) {
      const ms = Date.now() - new Date(me.lastUsernameChange).getTime();
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      if (days < 14) {
        lockEl.innerHTML = `<span style="color:var(--error);">Username locked for ${14 - days} more day(s)</span>`;
      } else {
        lockEl.innerHTML = `You can change your username.`;
      }
    } else {
      lockEl.innerHTML = `You can change your username.`;
    }
    document.getElementById("profileCurrentPass").value = "";
    document.getElementById("profileNewPass").value = "";

    openModal("profileModal");
  });
}

document.querySelectorAll(".profile-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".profile-tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".profile-panel")
      .forEach((p) => p.setAttribute("hidden", ""));

    tab.classList.add("active");
    document.getElementById(tab.dataset.target)?.removeAttribute("hidden");

    if (tab.dataset.target === "profileActivity") {
      renderProfileActivity();
    }
  });
});

const renderProfileActivity = () => {
  const session = Store.get("session");
  const posts = Store.get("posts")
    .filter((p) => p.userId === session.username)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const list = document.getElementById("profileActivityList");
  if (!posts.length) {
    list.innerHTML = `<p style="color:var(--mid);">You haven't posted anything yet.</p>`;
    return;
  }
  list.innerHTML = posts
    .map((p) => {
      const commentCount = (Store.get("comments") || []).filter(
        (c) => c.postId === p.id,
      ).length;
      const likeCount = (Store.get("likes") || []).filter(
        (l) => l.postId === p.id,
      ).length;
      return `
      <div class="activity-item" data-pid="${sanitize(p.id)}">
        <div class="activity-title">${sanitize(p.title)}</div>
        <div class="activity-meta"><span>❤️ ${likeCount}</span><span>💬 ${commentCount}</span><span>📅 ${new Date(p.date).toLocaleDateString()}</span></div>
      </div>
    `;
    })
    .join("");
  list.querySelectorAll(".activity-item").forEach((item) => {
    item.addEventListener("click", () => {
      closeModal("profileModal");
      openViewPost(item.dataset.pid);
    });
  });
};

document.getElementById("profileEditAvatar")?.addEventListener("click", () => {
  document.getElementById("profileImageUpload")?.click();
});

document
  .getElementById("profileImageUpload")
  ?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result;
      const avatarEl = document.getElementById("profileEditAvatar");
      avatarEl.style.backgroundImage = `url('${b64}')`;
      avatarEl.dataset.b64 = b64;
    };
    reader.readAsDataURL(file);
  });

document
  .getElementById("saveProfileDisplayBtn")
  ?.addEventListener("click", async () => {
    const session = Store.get("session");
    const users = Store.get("users");
    const me = users.find((u) => u.username === session.username);
    if (!me) return;

    me.displayName = document.getElementById("profileDisplayName").value.trim();
    me.bio = document.getElementById("profileBio").value.trim();
    const newB64 = document.getElementById("profileEditAvatar")?.dataset.b64;
    me.profilePicture = newB64 || null;

    Store.set("users", users);
    if (sbClient)
      await sbClient
        .from("users")
        .update({
          profilePicture: me.profilePicture,
          displayName: me.displayName,
          bio: me.bio,
        })
        .eq("id", me.id);
    updateNavForSession();
    renderForum();

    const succ = document.getElementById("profileDisplaySuccess");
    if (succ) {
      succ.removeAttribute("hidden");
      setTimeout(() => {
        succ.setAttribute("hidden", "");
      }, 3000);
    }
  });

document
  .getElementById("saveUsernameBtn")
  ?.addEventListener("click", async () => {
    const newName = document.getElementById("profileNewUsername").value.trim();
    const session = Store.get("session");
    const users = Store.get("users");
    const me = users.find((u) => u.username === session.username);

    if (!newName || newName === me.username) return;
    if (!/^[a-zA-Z0-9_]+$/.test(newName)) {
      alert("Only letters, numbers, and underscores allowed.");
      return;
    }
    if (newName.length < 3 || newName.length > 32) {
      alert("Username must be 3-32 chars.");
      return;
    }

    if (me.lastUsernameChange) {
      const ms = Date.now() - new Date(me.lastUsernameChange).getTime();
      if (ms < 14 * 24 * 60 * 60 * 1000) {
        alert("You can only change your username once every 14 days.");
        return;
      }
    }

    if (
      users.some(
        (u) =>
          u.username.toLowerCase() === newName.toLowerCase() && u.id !== me.id,
      )
    ) {
      alert("Username is already taken.");
      return;
    }

    me.username = newName;
    me.lastUsernameChange = new Date().toISOString();
    Store.set("users", users);

    session.username = newName;
    Store.set("session", session);
    if (sbClient)
      await sbClient
        .from("users")
        .update({
          username: newName,
          lastUsernameChange: me.lastUsernameChange,
        })
        .eq("id", me.id);
    alert("Username updated successfully!");
    updateNavForSession();
    renderForum();
  });

document
  .getElementById("savePasswordBtn")
  ?.addEventListener("click", async () => {
    try {
      const currPass = document.getElementById("profileCurrentPass").value;
      const newPass = document.getElementById("profileNewPass").value;
      const err = document.getElementById("profileAccountError");
      const succ = document.getElementById("profileAccountSuccess");
      if (err) err.setAttribute("hidden", "");
      if (succ) succ.style.display = "none";

      if (!currPass || newPass.length < 6) {
        if (err) {
          err.textContent =
            "Enter current password and a new password (min 6 chars).";
          err.removeAttribute("hidden");
        }
        return;
      }

      const session = Store.get("session");
      if (!session || !sbClient) return;

      // Re-verify current password before allowing the change
      const { error: reAuthError } = await Auth.signIn(
        session.username,
        currPass,
      );
      if (reAuthError) {
        if (err) {
          err.textContent = "Current password is incorrect.";
          err.removeAttribute("hidden");
        }
        return;
      }

      // We temporarily store the desired new password while we send a confirmation email.
      // When they click the email link, forgot-password.js will retrieve this to finish the actual password update.
      localStorage.setItem("ps_pending_new_password", newPass);

      const userRes = await sbClient.auth.getUser();
      if (userRes.error || !userRes.data?.user?.email) {
        if (err) {
          err.textContent =
            "Could not retrieve email for password verification.";
          err.removeAttribute("hidden");
        }
        return;
      }

      // Trigger the generic password recovery flow which essentially acts as our change-confirmation.
      const { error: resetError } = await sbClient.auth.resetPasswordForEmail(
        userRes.data.user.email,
        {
          redirectTo: window.location.origin + window.location.pathname,
        },
      );

      if (resetError) {
        if (err) {
          err.textContent = "Error sending verify email: " + resetError.message;
          err.removeAttribute("hidden");
        }
        return;
      }

      if (succ) {
        succ.textContent =
          "Please verify the changes in your email (Gmail) to finish updating your password.";
        succ.style.display = "flex"; // Use flex or block based on original css
        succ.removeAttribute("hidden");
        // keep it showing for a bit longer so they can read it
        setTimeout(() => {
          succ.setAttribute("hidden", "");
          succ.style.display = "none";
        }, 8000);
      }
      document.getElementById("profileCurrentPass").value = "";
      document.getElementById("profileNewPass").value = "";
    } catch (e) {
      console.error(e);
      alert("An unexpected error occurred: " + e.message);
    }
  });

const openPublicProfile = (userId) => {
  const users = Store.get("users");
  const u = users.find((x) => x.username === userId);
  if (!u) return;

  document.getElementById("publicUsername").textContent =
    u.displayName || u.username;
  document.getElementById("publicRoleBadge").innerHTML =
    `<span class="role-badge role-${u.role}">${u.role}</span>`;
  document.getElementById("publicBio").textContent =
    u.bio || "This user has not set a bio yet.";

  const avatarBox = document.getElementById("publicAvatarBox");
  if (u.profilePicture) {
    avatarBox.style.backgroundImage = `url('${u.profilePicture}')`;
    avatarBox.innerHTML = "";
  } else {
    avatarBox.style.backgroundImage = "none";
    avatarBox.innerHTML =
      '<span style="font-size: 2.5rem; color: var(--mid);">&#128100;</span>';
  }

  const socials = document.getElementById("publicSocials");
  let sHTML = "";
  if (u.youtube)
    sHTML += `<a href="${sanitize(u.youtube)}" target="_blank" style="padding:0.3rem 0.6rem; border-radius:10px; background:rgba(255,0,0,0.1); color:#ff4040; text-decoration:none; font-size:0.8rem;">▶ YouTube</a>`;
  if (u.discord)
    sHTML += `<span style="padding:0.3rem 0.6rem; border-radius:10px; background:rgba(88,101,242,0.1); color:#8899fa; font-size:0.8rem;">💬 ${sanitize(u.discord)}</span>`;
  socials.innerHTML = sHTML;

  const posts = Store.get("posts")
    .filter((p) => p.userId === u.username)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  const activityList = document.getElementById("publicActivityList");
  if (!posts.length) {
    activityList.innerHTML = `<p style="color:var(--mid); font-size:0.85rem; text-align:center;">No posts yet.</p>`;
  } else {
    activityList.innerHTML = posts
      .map((p) => {
        const likeCount = (Store.get("likes") || []).filter(
          (l) => l.postId === p.id,
        ).length;
        return `
         <div class="activity-item" data-pid="${sanitize(p.id)}" style="padding:0.8rem; text-align:left;">
           <div class="activity-title" style="font-size:0.95rem;">${sanitize(p.title)}</div>
           <div class="activity-meta"><span>❤️ ${likeCount}</span><span>📅 ${new Date(p.date).toLocaleDateString()}</span></div>
         </div>
      `;
      })
      .join("");
    activityList.querySelectorAll(".activity-item").forEach((item) => {
      item.addEventListener("click", () => {
        closeModal("publicProfileModal");
        openViewPost(item.dataset.pid);
      });
    });
  }

  openModal("publicProfileModal");
};

// Global listener for Firebase Real-time Updates
window.addEventListener("ps_db_updated", (e) => {
  const key = e.detail;
  if (key === "posts") {
    if (typeof renderForum === "function") renderForum();
    if (
      typeof renderAdminPosts === "function" &&
      !document.getElementById("adminModal").hasAttribute("hidden")
    )
      renderAdminPosts();
  } else if (key === "announcements") {
    if (typeof renderAnnouncements === "function") renderAnnouncements();
    if (
      typeof renderAdminAnnouncements === "function" &&
      !document.getElementById("adminModal").hasAttribute("hidden")
    )
      renderAdminAnnouncements();
  } else if (key === "notifications") {
    if (typeof renderNotifications === "function") renderNotifications();
  } else if (key === "users") {
    if (typeof renderForum === "function") renderForum();
    updateNavForSession();
    // Just refresh admin panel if open
    if (
      typeof renderAdminUsers === "function" &&
      !document.getElementById("adminModal").hasAttribute("hidden")
    )
      renderAdminUsers();
  }
});

/* ─────────────────────────────────────────────
   PASSWORD VISIBILITY TOGGLE
   Auto-attaches a show/hide eye button to every
   input[type="password"] on the page.
───────────────────────────────────────────── */
const _eyeShow = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const _eyeHide = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

document.querySelectorAll('input[type="password"]').forEach((input) => {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:relative;width:100%;";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle password visibility");
  toggle.style.cssText =
    "position:absolute;right:0.75rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--mid);padding:0;line-height:0;";
  toggle.innerHTML = _eyeShow;
  wrapper.appendChild(toggle);

  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.innerHTML = show ? _eyeHide : _eyeShow;
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    input.focus();
  });
});
// --- Lessons Admin Logic ---
document.getElementById("lessonClose")?.addEventListener("click", () => {
  document.getElementById("lessonModal").hidden = true;
});
document.getElementById("lessonSubmit")?.addEventListener("click", async () => {
  const err = document.getElementById("lessonError");
  err.hidden = true;

  const id = document.getElementById("lessonId").value || crypto.randomUUID();
  const step = document.getElementById("lessonStep").value;
  const tab = document.getElementById("lessonTab").value;
  const sectionStr = document.getElementById("lessonSection").value.trim();
  const title = document.getElementById("lessonTitle").value.trim();
  const desc = document.getElementById("lessonDescription").value.trim();
  const icon = document.getElementById("lessonIcon").value || "📚";
  const status = document.getElementById("lessonStatus").value;
  const vidUrlRaw = document.getElementById("lessonVideoUrl").value.trim();
  let contentHtml = document.getElementById("lessonContent").value.trim();

  if (!step || !title || !sectionStr) {
    err.textContent = "Step Number, Section Name, and Title are required.";
    err.hidden = false;
    return;
  }

  // Parse YouTube ID
  let vidId = "";
  if (vidUrlRaw) {
    const match = vidUrlRaw.match(
      /(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
    );
    if (match && match[1]) vidId = match[1];
  }

  // Prevent double iframes if editing
  if (vidId && !contentHtml.includes("youtube-embed-wrapper")) {
    contentHtml =
      `<div class="youtube-embed-wrapper" style="margin-bottom:1.5rem;"><iframe width="100%" height="315" src="https://www.youtube.com/embed/${vidId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` +
      contentHtml;
  }

  const payload = {
    id,
    step_number: parseFloat(step) || 1, // Cast to integer/float to satisfy Supabase
    tab_level: tab,
    section: sectionStr,
    title,
    description: desc,
    icon,
    status,
    content: contentHtml,
  };

  const oldLessons = Store.get("lessons") || [];
  const existingIdx = oldLessons.findIndex((l) => l.id === id);
  if (existingIdx > -1) oldLessons[existingIdx] = payload;
  else oldLessons.push(payload);

  try {
    const oldBtnText = document.getElementById("lessonSubmit").textContent;
    document.getElementById("lessonSubmit").textContent = "Saving...";

    if (sbClient) {
      const { error } = await sbClient.from("lessons").upsert(payload);
      if (error) throw error;
    }

    Store.set("lessons", oldLessons);
    document.getElementById("lessonModal").hidden = true;
    if (typeof renderAdminPanel === "function") renderAdminPanel("lessons");
    document.getElementById("lessonSubmit").textContent = oldBtnText;
  } catch (e) {
    console.error("Save Lesson Error:", e);
    document.getElementById("lessonSubmit").textContent = "Save Lesson";
    err.textContent =
      "Error saving lesson: " +
      (e?.message || JSON.stringify(e) || "Unknown error");
    err.hidden = false;
  }
});

// Initialise Supabase Auth — restores existing session and listens for auth state changes
if (sbClient) Auth.init();
