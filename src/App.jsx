import "./App.css";
import "./Landing.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ArrowUpDown,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Command,
  CreditCard,
  LayoutDashboard,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Wallet,
  MoreHorizontal,
  Utensils,
  House,
  CarFront,
  ShoppingBag,
  BriefcaseBusiness,
  CircleDollarSign,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
const initialTransactions = [
  {
    name: "Monthly stipend",
    category: "Income",
    date: "Oct 16, 2026",
    amount: 25000,
    icon: BriefcaseBusiness,
    type: "income",
  },
  {
    name: "Apartment rent",
    category: "Housing",
    date: "Oct 15, 2026",
    amount: -8500,
    icon: House,
    type: "expense",
  },
  {
    name: "Groceries",
    category: "Food & dining",
    date: "Oct 14, 2026",
    amount: -1850,
    icon: ShoppingBag,
    type: "expense",
  },
  {
    name: "Uber ride",
    category: "Transport",
    date: "Oct 13, 2026",
    amount: -320,
    icon: CarFront,
    type: "expense",
  },
  {
    name: "Dinner with friends",
    category: "Food & dining",
    date: "Oct 12, 2026",
    amount: -740,
    icon: Utensils,
    type: "expense",
  },
];
const formatMoney = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const getTransactionDate = (transaction) => {
  if (transaction.dateISO) {
    const [year, month, day] = transaction.dateISO.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  // Supports the older demo dates already saved in localStorage.
  const parsed = new Date(transaction.date);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatTransactionDate = (date) =>
  date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const iconByCategory = (category, type) => {
  if (type === "income") return BriefcaseBusiness;
  if (category === "Housing") return House;
  if (category === "Transport") return CarFront;
  if (category === "Food & dining") return Utensils;
  if (category === "Shopping") return ShoppingBag;
  return CreditCard;
};

const readSavedTransactions = () => {
  try {
    const saved = localStorage.getItem("ledgerly.transactions.v1");
    return saved ? JSON.parse(saved) : initialTransactions.map((item, index) => ({ ...item, id: `demo-${index}` }));
  } catch {
    return initialTransactions.map((item, index) => ({ ...item, id: `demo-${index}` }));
  }
};

function AnimatedMoney({ amount }) {
  const value = useMotionValue(0);
  const springValue = useSpring(value, { stiffness: 92, damping: 22, mass: 0.8 });
  const formatted = useTransform(springValue, (latest) => formatMoney(Math.round(latest)));

  useEffect(() => {
    value.set(amount);
  }, [amount, value]);

  return <motion.span>{formatted}</motion.span>;
}

const updateSpotlight = (event) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
};

function SidebarLink({ icon: Icon, children, active = false, onClick }) {
  return (
    <motion.button
      className={`sidebar-link ${active ? "active" : ""}`}
      type="button"
      onClick={onClick}
      aria-current={active ? "location" : undefined}
      whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.06)" }}
      whileTap={{ scale: 0.975, x: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      <motion.span className="sidebar-link-icon" whileHover={{ rotate: -7, scale: 1.08 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
        <Icon size={18} strokeWidth={1.7} />
      </motion.span>
      <span className="sidebar-link-label" data-label={children}><span>{children}</span></span>
    </motion.button>
  );
}
function SummaryCard({ label, amount, change, icon: Icon, kind, onClick }) {
  return (
    <motion.article
      className="summary-card spotlight-card"
      onPointerMove={updateSpotlight}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick?.(); } }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: ${formatMoney(amount)}. Show related transactions.` : undefined}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.58, delay: kind === "income" ? 0.08 : kind === "expense" ? 0.16 : 0.24, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -7, scale: 1.012, borderColor: "#73736a", boxShadow: "0 24px 58px rgba(0, 0, 0, 0.3)" }}
      whileTap={{ scale: 0.992 }}
    >
      <div className="summary-top">
        <span className="summary-label">{label}</span>
        <span className={`summary-icon ${kind}`}>
          <Icon size={18} strokeWidth={1.7} />
        </span>
      </div>
      <div className="summary-amount"><AnimatedMoney amount={amount} /></div>
      <div className="summary-bottom">
        <span className={`change-pill ${kind}`}>
          <span className="summary-mark" aria-hidden="true">·</span>
          {change}
        </span>
        <span className="summary-caption">from your entries</span>
      </div>
      <span className="summary-reveal">Show related activity <ArrowUpRight size={13} /></span>
    </motion.article>
  );
}

function LandingPage({ onEnter }) {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="landing-page" id="landing-top">
      <motion.header className="landing-nav" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
        <a className="landing-brand" href="#landing-top" aria-label="Ledgerly home" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="landing-brand-mark"><Wallet size={17} strokeWidth={1.8} /></span>
          <span>ledgerly<span className="landing-brand-period">.</span></span>
        </a>
        <nav className="landing-nav-links" aria-label="Main navigation">
          <button type="button" onClick={() => scrollTo("landing-system")}>The system</button>
          <button type="button" onClick={() => scrollTo("landing-how")}>How it works</button>
        </nav>
        <div className="landing-nav-actions">
          <span className="landing-private"><ShieldCheck size={14} /> Private by design</span>
          <motion.button className="landing-nav-cta" type="button" onClick={onEnter} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
            Dashboard <ArrowUpRight size={14} />
          </motion.button>
        </div>
      </motion.header>

      <section className="landing-hero">
        <motion.div className="landing-copy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}>
          <div className="landing-eyebrow"><span className="landing-eyebrow-dot" /> A CLEARER WAY TO HANDLE MONEY</div>
          <h1>Give every rupee<br /><span>a direction.</span></h1>
          <p className="landing-description">Know what came in, where it went, and what you can do next. Your money, all in one calm and clear view.</p>
          <div className="landing-actions">
            <motion.button className="landing-primary" type="button" onClick={onEnter} whileHover={{ y: -3, boxShadow: "0 12px 42px rgba(185, 235, 105, 0.15)" }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 430, damping: 24 }}>
              Open your dashboard <span><ArrowUpRight size={15} /></span>
            </motion.button>
            <motion.button className="landing-secondary" type="button" onClick={() => scrollTo("landing-system")} whileHover={{ x: 4 }} whileTap={{ scale: 0.97 }}>
              Explore Ledgerly <ArrowDownRight size={15} />
            </motion.button>
          </div>
          <div className="landing-proof"><div className="landing-proof-icon"><CircleDollarSign size={15} /></div><span>A thoughtful system for everyday money.</span></div>
        </motion.div>

        <motion.div className="landing-visual-wrap" initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}>
          <div className="landing-visual-glow" aria-hidden="true" />
          <motion.div className="landing-dashboard-preview" whileHover={{ y: -7, rotateX: 1.5, rotateY: -1.4 }} transition={{ type: "spring", stiffness: 180, damping: 24 }}>
            <div className="preview-topline">
              <div className="preview-brand"><span className="preview-brand-symbol"><Wallet size={12} /></span> LEDGERLY <span className="preview-slash">/</span> OVERVIEW</div>
              <span className="preview-menu-dots"><i /><i /><i /></span>
            </div>
            <div className="preview-balance-label">TOTAL BALANCE <span>ILLUSTRATIVE</span></div>
            <div className="preview-balance"><span>₹1,24,860</span><span className="preview-change">+8.2%</span></div>
            <div className="preview-chart" aria-label="Illustrative upward balance trend">
              <div className="preview-chart-grid"><i /><i /><i /></div>
              <svg viewBox="0 0 520 126" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="landingChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#bdf27b" stopOpacity=".23" /><stop offset="100%" stopColor="#bdf27b" stopOpacity="0" /></linearGradient></defs>
                <motion.path d="M0 99 C28 92 44 104 71 91 S114 79 136 86 S171 69 195 77 S232 90 259 62 S304 72 331 57 S366 64 389 44 S432 56 457 26 S493 36 520 8 L520 126 L0 126 Z" fill="url(#landingChartFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.1, delay: .4 }} />
                <motion.path d="M0 99 C28 92 44 104 71 91 S114 79 136 86 S171 69 195 77 S232 90 259 62 S304 72 331 57 S366 64 389 44 S432 56 457 26 S493 36 520 8" fill="none" stroke="#c5f37a" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, delay: .3, ease: "easeOut" }} />
              </svg>
              <div className="preview-chart-months"><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span><span>OCT</span></div>
            </div>
            <div className="preview-divider" />
            <div className="preview-metrics">
              <div><span>INCOME</span><strong>₹48,500</strong><small>Across 4 entries</small></div>
              <div><span>SPENDING</span><strong>₹18,240</strong><small>Across 12 entries</small></div>
              <div><span>SET ASIDE</span><strong>₹12,600</strong><small>Ready for what’s next</small></div>
            </div>
          </motion.div>
          <motion.div className="preview-float-note" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .6, delay: .8 }}>
            <span className="preview-note-icon"><ArrowDownRight size={16} /></span><span><small>THIS MONTH</small><strong>Spending in view</strong></span><span className="preview-note-bars"><i /><i /><i /><i /><i /><i /><i /></span>
          </motion.div>
          <div className="landing-visual-caption"><span /> A preview of your money, made easier to read</div>
        </motion.div>
      </section>

      <div className="landing-marquee" aria-label="Track income, spending, savings, and goals">
        <div className="landing-marquee-track">{[0, 1].map((copy) => <div className="landing-marquee-run" key={copy} aria-hidden={copy === 1}><span>INCOME</span><i>✳</i><span>SPENDING</span><i>✳</i><span>SAVINGS</span><i>✳</i><span>GOALS</span><i>✳</i><span>CLARITY</span><i>✳</i></div>)}</div>
      </div>

      <motion.section className="landing-system" id="landing-system" initial={{ opacity: 0, y: 25 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .65, ease: [0.16, 1, .3, 1] }}>
        <div className="landing-section-intro"><span className="landing-section-kicker">A BETTER MONEY ROUTINE</span><h2>Clarity in the details.<br /><span>Confidence in the next move.</span></h2></div>
        <div className="landing-feature-grid">
          <motion.article className="landing-feature" whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 280, damping: 24 }}>
            <span className="landing-feature-index">01 / SEE IT CLEARLY</span><span className="landing-feature-icon"><CircleDollarSign size={18} /></span>
            <h3>One view of your money.</h3><p>Income, spending, and what remains sit together, so the picture is easy to understand.</p>
            <div className="feature-mini-lines"><i /><i /><i /><i /></div>
          </motion.article>
          <motion.article className="landing-feature" whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 280, damping: 24 }}>
            <span className="landing-feature-index">02 / FOLLOW THE FLOW</span><span className="landing-feature-icon"><ArrowUpRight size={18} /></span>
            <h3>Know where it goes.</h3><p>Find your recent activity, follow useful trends, and spot the patterns that matter.</p>
            <div className="feature-flow"><span>IN</span><i /><span>OUT</span><i /><span>LEFT</span></div>
          </motion.article>
          <motion.article className="landing-feature" whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 280, damping: 24 }}>
            <span className="landing-feature-index">03 / MOVE WITH INTENT</span><span className="landing-feature-icon"><Target size={18} /></span>
            <h3>Make the next step yours.</h3><p>Set a goal, keep a buffer, or simply check in. Ledgerly gives you room to decide.</p>
            <div className="feature-goal"><span>RAINY DAY FUND</span><strong><i /></strong><small>68% there</small></div>
          </motion.article>
        </div>
      </motion.section>

      <motion.section className="landing-how" id="landing-how" initial={{ opacity: 0, y: 25 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .65, ease: [0.16, 1, .3, 1] }}>
        <div className="landing-how-heading"><span className="landing-section-kicker">NO SPREADSHEETS REQUIRED</span><h2>A small habit.<br /><span>A clearer picture.</span></h2></div>
        <div className="landing-steps">
          <div className="landing-step"><span>01</span><div><h3>Record the moment</h3><p>Add income or an expense in a few seconds.</p></div><ArrowRight size={15} /></div>
          <div className="landing-step"><span>02</span><div><h3>See the whole month</h3><p>Watch your balance and trends come into focus.</p></div><ArrowRight size={15} /></div>
          <div className="landing-step"><span>03</span><div><h3>Choose what comes next</h3><p>Use what you know to make your next move.</p></div><ArrowRight size={15} /></div>
        </div>
      </motion.section>

      <motion.section className="landing-endcap" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .65 }}>
        <div className="landing-endcap-orbit" aria-hidden="true"><i /><i /><i /></div>
        <span className="landing-section-kicker">START WITH WHAT YOU HAVE</span>
        <h2>Your money can feel<br />a little more <em>in place.</em></h2>
        <p>Open Ledgerly and get a clearer look at today.</p>
        <motion.button className="landing-primary" type="button" onClick={onEnter} whileHover={{ y: -3 }} whileTap={{ scale: .97 }}>Go to your dashboard <span><ArrowUpRight size={15} /></span></motion.button>
      </motion.section>

      <footer className="landing-footer"><a className="landing-brand" href="#landing-top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span className="landing-brand-mark"><Wallet size={16} /></span><span>ledgerly<span className="landing-brand-period">.</span></span></a><span>Make room for a clearer view.</span><button type="button" onClick={onEnter}>Open dashboard <ArrowUpRight size={13} /></button></footer>
    </main>
  );
}

function App() {
  const [showDashboard, setShowDashboard] = useState(() => window.location.hash === "#dashboard");
  const [transactions, setTransactions] = useState(readSavedTransactions);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState("6");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", amount: "", category: "Food & dining", type: "expense" });
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [notice, setNotice] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openTransactionMenu, setOpenTransactionMenu] = useState(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const searchInputRef = useRef(null);
  const scrollScrubRef = useRef(null);
  const scrollScrubMovedRef = useRef(false);

  useEffect(() => {
    const syncPageFromHistory = () => setShowDashboard(window.location.hash === "#dashboard");
    window.addEventListener("popstate", syncPageFromHistory);
    window.addEventListener("hashchange", syncPageFromHistory);
    return () => {
      window.removeEventListener("popstate", syncPageFromHistory);
      window.removeEventListener("hashchange", syncPageFromHistory);
    };
  }, []);

  const enterDashboard = () => {
    window.history.pushState({ view: "dashboard" }, "", `${window.location.pathname}${window.location.search}#dashboard`);
    setShowDashboard(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const returnToLanding = () => {
    window.history.pushState({ view: "landing" }, "", `${window.location.pathname}${window.location.search}`);
    setShowDashboard(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    localStorage.setItem("ledgerly.transactions.v1", JSON.stringify(transactions.map(({ icon, ...item }) => item)));
  }, [transactions]);

  useEffect(() => {
    const updateScrollProgress = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0);

      const scrollSections = [
        ["recent-transactions", "Transactions"],
        ["financial-pulse", "Budgets & goals"],
        ["balance-overview", "Accounts"],
        ["overview-section", "Dashboard"],
      ];
      const currentSection = scrollSections.find(([id]) => {
        const section = document.getElementById(id);
        return section && section.getBoundingClientRect().top <= 150;
      });
      setActiveNav(currentSection?.[1] ?? "Dashboard");
    };
    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      window.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("resize", updateScrollProgress);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), notice.action ? 6500 : 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setShowTransactionModal(false);
        setNotificationOpen(false);
        setProfileOpen(false);
        setOpenTransactionMenu(null);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const showNotice = (message, action, onAction) => setNotice({ message, action, onAction });
  const scrollToSection = (id, label) => {
    setActiveNav(label);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const startScrollScrub = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollScrubRef.current = { pointerId: event.pointerId, startY: event.clientY, startProgress: scrollProgress };
    scrollScrubMovedRef.current = false;
    setIsScrubbing(true);
  };
  const moveScrollScrub = (event) => {
    const start = scrollScrubRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const delta = start.startY - event.clientY;
    if (Math.abs(delta) > 3) scrollScrubMovedRef.current = true;
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const nextProgress = Math.max(0, Math.min(1, start.startProgress + delta / (window.innerHeight * 0.7)));
    window.scrollTo({ top: scrollableHeight * nextProgress, behavior: "auto" });
  };
  const endScrollScrub = () => {
    scrollScrubRef.current = null;
    setIsScrubbing(false);
  };
  const handleScrollOrbitClick = () => {
    if (scrollScrubMovedRef.current) {
      scrollScrubMovedRef.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleNavigation = (label) => {
    const destinations = {
      Dashboard: ["overview-section", "Dashboard"],
      Transactions: ["recent-transactions", "Transactions"],
      Accounts: ["balance-overview", "Accounts"],
      Recurring: ["financial-pulse", "Recurring"],
      "Budgets & goals": ["financial-pulse", "Budgets & goals"],
      Categories: ["recent-transactions", "Categories"],
    };
    const destination = destinations[label];
    if (destination) scrollToSection(...destination);
    else showNotice(label === "Settings" ? "Settings are coming into focus." : "Help is on the way.");
  };

  const totals = useMemo(() => {
    const income = transactions.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
    const expenses = transactions.reduce((sum, item) => sum + (item.amount < 0 ? Math.abs(item.amount) : 0), 0);
    return { income, expenses, savings: income - expenses, balance: 70660 + income - expenses };
  }, [transactions]);

  const visibleTransactions = useMemo(() => transactions.filter((item) =>
    `${item.name} ${item.category} ${item.date}`.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (transactionFilter === "all" || item.type === transactionFilter)
  ), [transactions, searchQuery, transactionFilter]);

  const displayedCashFlow = useMemo(() => {
    const count = Number(period);
    const now = new Date();
    const months = [];

    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push({
        year: monthDate.getFullYear(),
        monthIndex: monthDate.getMonth(),
        month: monthDate.toLocaleDateString("en-IN", { month: "short" }),
        income: 0,
        expenses: 0,
      });
    }

    transactions.forEach((transaction) => {
      const date = getTransactionDate(transaction);
      const bucket = months.find((month) => month.year === date.getFullYear() && month.monthIndex === date.getMonth());
      if (!bucket) return;
      if (transaction.amount > 0) bucket.income += transaction.amount;
      if (transaction.amount < 0) bucket.expenses += Math.abs(transaction.amount);
    });

    return months.map(({ year, monthIndex, ...month }) => month);
  }, [period, transactions]);

  const addTransaction = (event) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a description and an amount greater than zero.");
      return;
    }
    const type = form.type;
    const category = type === "income" ? "Income" : form.category;
    const now = new Date();
    const transaction = {
      id: `tx-${Date.now()}`,
      name: form.name.trim(),
      category,
      date: formatTransactionDate(now),
      dateISO: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      amount: type === "income" ? amount : -amount,
      type,
    };
    setTransactions((current) => [transaction, ...current]);
    setForm({ name: "", amount: "", category: "Food & dining", type: "expense" });
    setFormError("");
    setShowTransactionModal(false);
    showNotice("Transaction saved to your activity.");
  };

  const deleteTransaction = (id) => {
    const index = transactions.findIndex((item) => item.id === id);
    const removed = transactions[index];
    if (!removed) return;
    setTransactions((current) => current.filter((item) => item.id !== id));
    setOpenTransactionMenu(null);
    showNotice("Transaction removed", "Undo", () => {
      setTransactions((current) => {
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, removed);
        return restored;
      });
    });
  };

  if (!showDashboard) return <LandingPage onEnter={enterDashboard} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); returnToLanding(); }}>
          <span className="brand-mark">
            <Wallet size={20} strokeWidth={1.7} />
          </span>
          <span className="brand-name">ledgerly<span>.</span></span>
        </a>
        <div className="workspace">
          <div className="workspace-avatar">S</div>
          <div className="workspace-copy">
            <span className="workspace-name">Personal space</span>
            <span className="workspace-plan">Free account</span>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <div className="nav-section">
          <span className="nav-heading">OVERVIEW</span>
          <nav>
            <SidebarLink icon={LayoutDashboard} active={activeNav === "Dashboard"} onClick={() => handleNavigation("Dashboard")}>
              Dashboard
            </SidebarLink>
            <SidebarLink icon={ArrowUpDown} active={activeNav === "Transactions"} onClick={() => handleNavigation("Transactions")}>Transactions</SidebarLink>
            <SidebarLink icon={Wallet} active={activeNav === "Accounts"} onClick={() => handleNavigation("Accounts")}>Accounts</SidebarLink>
            <SidebarLink icon={CalendarDays} active={activeNav === "Recurring"} onClick={() => handleNavigation("Recurring")}>Recurring</SidebarLink>
          </nav>
        </div>
        <div className="nav-section">
          <span className="nav-heading">YOUR FINANCES</span>
          <nav>
            <SidebarLink icon={Target} active={activeNav === "Budgets & goals"} onClick={() => handleNavigation("Budgets & goals")}>Budgets & goals</SidebarLink>
            <SidebarLink icon={Settings2} active={activeNav === "Categories"} onClick={() => handleNavigation("Categories")}>Categories</SidebarLink>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">
              <Sparkles size={17} />
            </div>
            <p className="upgrade-title">A clearer financial picture.</p>
            <p className="upgrade-description">
              A clearer view of where it goes.
            </p>
            <button className="upgrade-link" type="button" onClick={() => showNotice("Money insights will get sharper as you add more activity.")}>
              Open money insights <ChevronRight size={14} />
            </button>
          </div>
          <SidebarLink icon={CircleHelp} onClick={() => handleNavigation("Help & support")}>Help & support</SidebarLink>
          <SidebarLink icon={Settings2} onClick={() => handleNavigation("Settings")}>Settings</SidebarLink>
          <div className="profile">
            <div className="profile-avatar">S</div>
            <div className="profile-copy">
              <span className="profile-name">Your workspace</span>
              <span className="profile-email">Personal account</span>
            </div>
            <MoreHorizontal size={19} className="muted-icon" />
          </div>
        </div>
      </aside>
      <motion.main
        className="main-content"
        id="dashboard"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        <motion.div className="scroll-progress" style={{ scaleX: scrollProgress }} aria-hidden="true" />
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <span className="breadcrumb-current">Dashboard</span>
          </div>
          <div className="topbar-actions">
            <label className="search-trigger search-field">
              <Search size={15} />
              <input ref={searchInputRef} aria-label="Search transactions" placeholder="Search transactions..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              {searchQuery && <button className="search-clear" type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>}
              {!searchQuery && <kbd><Command size={11} /> K</kbd>}
            </label>
            <div className="topbar-popover-wrap">
            <motion.button className={`icon-button ${notificationOpen ? "is-open" : ""}`} aria-label="Notifications" aria-expanded={notificationOpen} type="button" onClick={() => { setNotificationOpen((open) => !open); setProfileOpen(false); }} whileHover={{ rotate: [-7, 7, -4, 0], scale: 1.05 }} whileTap={{ scale: 0.9 }} transition={{ duration: 0.35 }}>
              <Bell size={18} />
              <span className="notification-dot" />
            </motion.button>
            <AnimatePresence>
              {notificationOpen && <motion.div className="topbar-popover notification-popover" initial={{ opacity: 0, y: -7, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.98 }} transition={{ duration: 0.16 }}><div className="popover-heading"><span>Notifications</span><span className="live-indicator">LIVE</span></div><div className="notification-empty"><span className="notification-empty-icon"><Bell size={16} /></span><strong>All caught up</strong><span>Your money updates will show up here.</span></div></motion.div>}
            </AnimatePresence>
            </div>
            <div className="topbar-popover-wrap">
              <motion.button className={`topbar-avatar ${profileOpen ? "is-open" : ""}`} type="button" aria-label="Open personal account menu" aria-expanded={profileOpen} onClick={() => { setProfileOpen((open) => !open); setNotificationOpen(false); }} whileHover={{ scale: 1.08, rotate: 5 }} whileTap={{ scale: 0.94 }} transition={{ type: "spring", stiffness: 450, damping: 18 }}>S</motion.button>
              <AnimatePresence>
                {profileOpen && <motion.div className="topbar-popover profile-popover" initial={{ opacity: 0, y: -7, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.98 }} transition={{ duration: 0.16 }}><div className="popover-profile"><span className="profile-avatar">S</span><span><strong>Your workspace</strong><small>Personal account</small></span></div><button type="button" onClick={() => { setProfileOpen(false); showNotice("You’re viewing your personal space."); }}>Manage workspace <ChevronRight size={14} /></button></motion.div>}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <div className="dashboard-content">
          <motion.section className="welcome-section scroll-reveal" id="overview-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            <div>
              <div className="eyebrow">
                <span className="status-dot" />
                YOUR FINANCIAL OVERVIEW
              </div>
              <h1>Your money,<br /><em>at a glance.</em></h1>
              <p className="welcome-description">
                A clear look at what came in, what went out, and what stays yours.
              </p>
            </div>
            <motion.button
              className="primary-button"
              type="button"
              onClick={() => setShowTransactionModal(true)}
              whileHover={{ y: -3, scale: 1.025, boxShadow: "0 12px 34px rgba(185, 235, 105, 0.22)" }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 460, damping: 22 }}
            >
              <Plus size={17} />
              Add transaction
            </motion.button>
          </motion.section>
          <motion.section className="balance-panel scroll-reveal" id="balance-overview" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.58, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}>
            <div className="balance-main">
              <div className="balance-label">
                TOTAL BALANCE
                <span className="balance-tooltip-wrap">
                  <button className="balance-info" type="button" aria-label="About total balance">i</button>
                  <span className="custom-tooltip" role="tooltip">Opening balance plus recorded income and spending.</span>
                </span>
              </div>
              <motion.div className="balance-amount" key={totals.balance} initial={{ opacity: 0.65, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}><AnimatedMoney amount={totals.balance} /><span>.00</span></motion.div>
              <div className="balance-footnote">
                Opening balance plus recorded activity
              </div>
            </div>
            <div className="balance-divider" />
            <div className="balance-insight">
              <div className="insight-icon">
                <Sparkles size={17} />
              </div>
              <div>
                <div className="insight-heading">Where you stand</div>
                <p>
                  {totals.savings >= 0 ? `You have ${formatMoney(totals.savings)} left after recorded spending.` : `Recorded spending is ${formatMoney(Math.abs(totals.savings))} higher than income.`}
                </p>
              </div>
            </div>
            <motion.div className="balance-decoration" aria-hidden="true" animate={{ rotate: 360 }} transition={{ duration: 90, repeat: Infinity, ease: "linear" }}>
              <div className="decoration-ring ring-one" />
              <div className="decoration-ring ring-two" />
              <div className="decoration-ring ring-three" />
            </motion.div>
          </motion.section>
          <motion.section className="summary-grid scroll-reveal" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}>
            <SummaryCard
              label="Total income"
              amount={totals.income}
              change="Money in"
              icon={ArrowDownLeft}
              kind="income"
              onClick={() => { setTransactionFilter("income"); setSearchQuery(""); scrollToSection("recent-transactions", "Transactions"); }}
            />
            <SummaryCard
              label="Total expenses"
              amount={totals.expenses}
              change="Money out"
              icon={ArrowUpRight}
              kind="expense"
              onClick={() => { setTransactionFilter("expense"); setSearchQuery(""); scrollToSection("recent-transactions", "Transactions"); }}
            />
            <SummaryCard
              label="Net savings"
              amount={totals.savings}
              change="Left over"
              icon={Wallet}
              kind="savings"
              onClick={() => { setTransactionFilter("all"); setSearchQuery(""); scrollToSection("recent-transactions", "Transactions"); }}
            />
          </motion.section>
          <motion.section className="content-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.12 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}>
            <motion.article className="panel cashflow-panel scroll-reveal" variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] } } }}>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">MONEY OVER TIME</span>
                  <h2>Income & spending</h2>
                  <p className="panel-description">
                    Monthly totals from your entries.
                  </p>
                </div>
                <label className="select-button period-select">
                  <select aria-label="Income & spending period" value={period} onChange={(event) => setPeriod(event.target.value)}>
                    <option value="3">Last 3 months</option>
                    <option value="6">Last 6 months</option>
                    <option value="12">Last 12 months</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot green" /> Income</span>
                <span><i className="legend-dot neutral" /> Expenses</span>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={displayedCashFlow}
                    margin={{ top: 12, right: 4, left: -20, bottom: 0 }}
                  >
                    <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#bdf27b" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#bdf27b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e8878e" stopOpacity={0.13} />
                        <stop offset="95%" stopColor="#e8878e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="#2c2d29"
                      strokeDasharray="3 5"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#85867f", fontSize: 11 }}
                      dy={10}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111210",
                        border: "1px solid #34352f",
                        borderRadius: "12px",
                        color: "#f2f2ed",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [formatMoney(value), ""]}
                      labelStyle={{ color: "#a1a19b", marginBottom: 5 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="income"
                      stroke="#bdf27b"
                      strokeWidth={2}
                      fill="url(#incomeFill)"
                      isAnimationActive={true}
                      animationDuration={1250}
                      animationEasing="ease-out"
                      activeDot={{ r: 4, fill: "#bdf27b", stroke: "#050505", strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stroke="#e8878e"
                      strokeWidth={1.8}
                      fill="url(#expenseFill)"
                      isAnimationActive={true}
                      animationDuration={1450}
                      animationEasing="ease-out"
                      activeDot={{ r: 4, fill: "#e8878e", stroke: "#050505", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-footer">
                <span>Based on your recorded transactions</span>
                <button type="button" className="text-link" onClick={() => scrollToSection("recent-transactions", "Transactions")}>
                  View insights <ChevronRight size={14} />
                </button>
              </div>
            </motion.article>
            <motion.article className="panel pulse-panel scroll-reveal" id="financial-pulse" variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] } } }}>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">YOUR MONEY, IN CONTEXT</span>
                  <h2>Financial Pulse</h2>
                </div>
                <span className="pulse-badge"><Sparkles size={13} /> Beta</span>
              </div>
              <p className="pulse-intro">
                A couple of useful next steps.
              </p>
              <div className="pulse-item">
                <div className="pulse-item-icon green">
                  <Target size={17} />
                </div>
                <div className="pulse-item-copy">
                  <h3>Start a buffer</h3>
                  <p>Choose a target for unexpected costs.</p>
                  <button type="button" className="text-link" onClick={() => showNotice("Your buffer goal is ready to set up.")}>
                    Set a goal <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <div className="pulse-separator" />
              <div className="pulse-item">
                <div className="pulse-item-icon gold">
                  <CalendarDays size={17} />
                </div>
                <div className="pulse-item-copy">
                  <h3>Plan for what's next</h3>
                  <p>Add recurring bills to see upcoming commitments.</p>
                  <button type="button" className="text-link" onClick={() => showNotice("Recurring payments will appear here when you add them.")}>
                    Explore recurring <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <div className="pulse-note">
                <Sparkles size={15} />
                <span>Insights will become personalized as you record transactions.</span>
              </div>
            </motion.article>
          </motion.section>
          <motion.section className="panel transactions-panel scroll-reveal" id="recent-transactions" initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div className="panel-header transaction-heading">
              <div>
                <span className="panel-kicker">YOUR MONEY, IN MOTION</span>
                <h2>Recent transactions</h2>
                <p className="panel-description">
                  The latest activity in your financial life.
                </p>
              </div>
              <motion.button className="select-button all-transactions-button" type="button" onClick={() => { setSearchQuery(""); setTransactionFilter("all"); scrollToSection("recent-transactions", "Transactions"); }} whileHover={{ y: -2, borderColor: "#545454" }} whileTap={{ scale: 0.96 }}>
                All transactions <ChevronRight size={14} />
              </motion.button>
            </div>
            <div className="transaction-filter-tabs" role="group" aria-label="Filter transactions">
              {[
                ["all", "All activity"],
                ["income", "Money in"],
                ["expense", "Money out"],
              ].map(([value, label]) => (
                <motion.button
                  className={`transaction-filter ${transactionFilter === value ? "active" : ""}`}
                  type="button"
                  key={value}
                  aria-pressed={transactionFilter === value}
                  onClick={() => setTransactionFilter(value)}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                >
                  {transactionFilter === value && <motion.span className="filter-active-pill" layoutId="transaction-filter-pill" transition={{ type: "spring", stiffness: 430, damping: 34 }} />}
                  <span>{label}</span>
                </motion.button>
              ))}
            </div>
            <div className="transaction-table">
              <div className="transaction-row transaction-table-head">
                <span>TRANSACTION</span>
                <span>CATEGORY</span>
                <span>DATE</span>
                <span className="align-right">AMOUNT</span>
                <span />
              </div>
              {visibleTransactions.length === 0 && <div className="empty-transactions">{searchQuery ? `No transactions match “${searchQuery}”. Try another search or add a transaction.` : transactionFilter === "income" ? "No income transactions yet." : transactionFilter === "expense" ? "No spending transactions yet." : "No transactions yet."}</div>}
              {visibleTransactions.map((transaction) => {
                const Icon = iconByCategory(transaction.category, transaction.type);
                return (
                  <motion.div className="transaction-row" key={transaction.id ?? transaction.name} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="transaction-name">
                      <span className={`transaction-icon ${transaction.type}`}>
                        <Icon size={17} strokeWidth={1.7} />
                      </span>
                      <span>{transaction.name}</span>
                    </div>
                    <div className="transaction-category">
                      {transaction.category}
                    </div>
                    <div className="transaction-date">{transaction.date}</div>
                    <div className={`transaction-amount ${transaction.type} align-right`}>
                      {transaction.amount > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(transaction.amount))}
                    </div>
                    <div className="row-action-wrap">
                      <motion.button className={`row-more ${openTransactionMenu === transaction.id ? "is-open" : ""}`} aria-label={`More options for ${transaction.name}`} aria-expanded={openTransactionMenu === transaction.id} type="button" onClick={() => setOpenTransactionMenu((current) => current === transaction.id ? null : transaction.id)} title="More transaction options" whileHover={{ rotate: 90, scale: 1.1 }} whileTap={{ scale: 0.9 }} transition={{ duration: 0.2 }}>
                        <MoreHorizontal size={17} />
                      </motion.button>
                      <AnimatePresence>
                        {openTransactionMenu === transaction.id && <motion.div className="row-menu" role="menu" initial={{ opacity: 0, y: 5, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 3, scale: 0.97 }} transition={{ duration: 0.14 }}><button type="button" role="menuitem" onClick={() => deleteTransaction(transaction.id)}>Remove transaction</button></motion.div>}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <div className="transactions-footer">
              <span>{visibleTransactions.length} transaction{visibleTransactions.length === 1 ? "" : "s"}{searchQuery ? " found" : " recorded"}</span>
              <button className="text-link" type="button" onClick={() => { setSearchQuery(""); setTransactionFilter("all"); scrollToSection("recent-transactions", "Transactions"); }}>
                See all activity <ChevronRight size={14} />
              </button>
            </div>
          </motion.section>
          <footer className="dashboard-footer">
            <span>LEDGERLY © 2026</span>
            <span>Designed for a clearer financial future.</span>
            <button type="button" className="footer-period" onClick={() => showNotice("Ledgerly is showing your current activity period.")}>
              <ChevronLeft size={13} /> October 2026 <ChevronRight size={13} />
            </button>
          </footer>
        </div>
      </motion.main>
      <AnimatePresence>
        {showTransactionModal && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTransactionModal(false); }}>
            <motion.section className="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-modal-title" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ type: "spring", stiffness: 340, damping: 28 }}>
              <div className="modal-heading">
                <div><span className="panel-kicker">KEEP YOUR RECORDS CURRENT</span><h2 id="transaction-modal-title">Add transaction</h2><p>Record money coming in or going out.</p></div>
                <button className="modal-close" type="button" onClick={() => setShowTransactionModal(false)} aria-label="Close modal">×</button>
              </div>
              <form onSubmit={addTransaction} className="transaction-form">
                <div className="transaction-type-switch" role="group" aria-label="Transaction type">
                  <button type="button" className={form.type === "expense" ? "selected expense-choice" : ""} onClick={() => setForm((current) => ({ ...current, type: "expense" }))}>Expense</button>
                  <button type="button" className={form.type === "income" ? "selected income-choice" : ""} onClick={() => setForm((current) => ({ ...current, type: "income" }))}>Income</button>
                </div>
                <label>Description<input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Freelance payment" maxLength={70} /></label>
                <label>Amount (₹)<input type="number" min="1" step="1" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
                {form.type === "expense" && <label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}><option>Food & dining</option><option>Housing</option><option>Transport</option><option>Shopping</option><option>Health</option><option>Education</option><option>Other</option></select></label>}
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowTransactionModal(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={16} /> Save transaction</button></div>
              </form>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {notice && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ type: "spring", stiffness: 430, damping: 29 }}><span>{notice.message}</span>{notice.action && <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={() => { notice.onAction?.(); setNotice(null); }}>{notice.action}</motion.button>}</motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {(scrollProgress > 0.015 || isScrubbing) && (
          <motion.button
            className={`scroll-orbit ${isScrubbing ? "is-scrubbing" : ""}`}
            type="button"
            aria-label={`Page scroll position ${Math.round(scrollProgress * 100)} percent. Drag up or down to scrub the page, or click to return to top.`}
            title="Drag to move through the page · Click to return to top"
            initial={{ opacity: 0, y: 14, scale: 0.82 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.84 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            onPointerDown={startScrollScrub}
            onPointerMove={moveScrollScrub}
            onPointerUp={endScrollScrub}
            onPointerCancel={endScrollScrub}
            onClick={handleScrollOrbitClick}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
          >
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="scroll-orbit-track" cx="22" cy="22" r="18" />
              <motion.circle className="scroll-orbit-progress" cx="22" cy="22" r="18" pathLength="100" style={{ strokeDashoffset: 100 - scrollProgress * 100 }} />
            </svg>
            <span>{Math.round(scrollProgress * 100)}<small>%</small></span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
export default App;
