import { useEffect, useMemo, useRef, useState } from "react";
import "./Dashboard.css";

const API_URL = "http://localhost:8000/api";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

/* ========================================================================
   Helpers
======================================================================== */

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Open bugs first (critical -> low), closed bugs always at the bottom
const sortBugs = (list) =>
    [...list].sort((a, b) => {
        const aClosed = normalizeStatus(a.status) === "closed" ? 1 : 0;
        const bClosed = normalizeStatus(b.status) === "closed" ? 1 : 0;

        if (aClosed !== bClosed) return aClosed - bClosed;

        const aPriority = PRIORITY_ORDER[a.priority?.toLowerCase()] ?? 4;
        const bPriority = PRIORITY_ORDER[b.priority?.toLowerCase()] ?? 4;

        if (aPriority !== bPriority) return aPriority - bPriority;

        return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

// Statuses a developer is allowed to set
const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
];

const parseJson = async (response) => {
    try {
        return await response.json();
    } catch {
        return {};
    }
};

const normalizeStatus = (status) =>
    (status || "").toString().toLowerCase().trim().replace(/\s+/g, "_");

const formatStatus = (status) => {
    const value = normalizeStatus(status);

    if (!value) return "Unknown";

    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/*
 * Builds a working image URL from whatever the API returns:
 * - full URL            -> used as is (host fixed if it points to wrong server)
 * - "bugs/abc.png"      -> BASE/storage/bugs/abc.png
 * - "/storage/bugs/..." -> BASE/storage/bugs/...
 */
const getImageUrl = (bug) => {
    const raw =
        bug?.image_url ||
        bug?.image ||
        bug?.image_path ||
        bug?.screenshot ||
        bug?.screenshot_url;

    if (!raw || typeof raw !== "string") return null;

    if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;

    if (/^https?:\/\//i.test(raw)) {
        try {
            const url = new URL(raw);

            // APP_URL on backend may be wrong (localhost vs ngrok)
            if (url.pathname.startsWith("/storage")) {
                return `${API_BASE}${url.pathname}${url.search}`;
            }
        } catch {
            /* fall through */
        }

        return raw;
    }

    const path = raw.replace(/^\/+/, "");

    return path.startsWith("storage/")
        ? `${API_BASE}/${path}`
        : `${API_BASE}/storage/${path}`;
};

/* ========================================================================
   BugImage — normal <img> first, then fetch() fallback (ngrok / CORS)
======================================================================== */

function BugImage({ src, alt }) {
    const [mode, setMode] = useState("direct"); // direct | blob | failed
    const [blobUrl, setBlobUrl] = useState(null);

    useEffect(() => {
        setMode("direct");
        setBlobUrl(null);
    }, [src]);

    useEffect(() => {
        if (mode !== "blob" || !src) return;

        let cancelled = false;
        let created = null;

        fetch(src, { headers: { "ngrok-skip-browser-warning": "true" } })
            .then((res) => {
                if (!res.ok) throw new Error("Image request failed");
                return res.blob();
            })
            .then((blob) => {
                if (cancelled) return;
                if (!blob.type.startsWith("image/")) {
                    throw new Error("Not an image");
                }
                created = URL.createObjectURL(blob);
                setBlobUrl(created);
            })
            .catch(() => {
                if (!cancelled) setMode("failed");
            });

        return () => {
            cancelled = true;
            if (created) URL.revokeObjectURL(created);
        };
    }, [mode, src]);

    if (mode === "failed") {
        return (
            <div className="image-error">
                <span>🖼</span>
                <p>Image could not be loaded.</p>
                <a href={src} target="_blank" rel="noopener noreferrer">
                    Open directly ↗
                </a>
            </div>
        );
    }

    if (mode === "blob" && !blobUrl) {
        return (
            <div className="image-error">
                <div className="loader small" />
            </div>
        );
    }

    return (
        <img
            src={mode === "blob" ? blobUrl : src}
            alt={alt}
            onError={() => setMode(mode === "direct" ? "blob" : "failed")}
        />
    );
}

/* ========================================================================
   CopyField — shows a URL with Copy + Open buttons
======================================================================== */

function CopyField({ label, value }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(null);

    useEffect(() => () => clearTimeout(timer.current), []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            // Fallback for non-secure contexts
            const area = document.createElement("textarea");
            area.value = value;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();

            try {
                document.execCommand("copy");
            } catch {
                /* ignore */
            }

            document.body.removeChild(area);
        }

        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="copy-field">
            <label>{label}</label>

            <div className="copy-row">
                <span className="copy-url" title={value}>
                    {value}
                </span>

                <button
                    type="button"
                    className={`copy-btn ${copied ? "copied" : ""}`}
                    onClick={handleCopy}
                >
                    {copied ? "✓ Copied" : "⧉ Copy"}
                </button>

                <a
                    className="open-btn"
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Open ↗
                </a>
            </div>
        </div>
    );
}

/* ========================================================================
   StatusDropdown — custom styled dropdown
======================================================================== */

function StatusDropdown({ value, onChange, disabled }) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
            }
        };

        const handleKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);

        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, []);

    const current = normalizeStatus(value) || "pending";

    return (
        <div className={`dd ${open ? "open" : ""}`} ref={wrapperRef}>
            <button
                type="button"
                className="dd-trigger"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((previous) => !previous)}
            >
                <span className="dd-left">
                    <i className={`dot dot-${current}`} />
                    {formatStatus(current)}
                </span>

                <span className="dd-caret">▾</span>
            </button>

            {open && (
                <ul className="dd-menu" role="listbox">
                    {STATUS_OPTIONS.map((option) => (
                        <li key={option.value}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={option.value === current}
                                className={`dd-option ${
                                    option.value === current ? "selected" : ""
                                }`}
                                onClick={() => {
                                    setOpen(false);
                                    onChange(option.value);
                                }}
                            >
                                <i className={`dot dot-${option.value}`} />
                                <span>{option.label}</span>

                                {option.value === current && (
                                    <b className="dd-check">✓</b>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/* ========================================================================
   Dashboard
======================================================================== */

function Dashboard() {
    const token = localStorage.getItem("token");

    const [user, setUser] = useState(null);

    const [assignedBugs, setAssignedBugs] = useState([]);
    const [projects, setProjects] = useState([]);

    const [selectedProject, setSelectedProject] = useState(null);
    const [projectBugs, setProjectBugs] = useState([]);

    const [selectedBug, setSelectedBug] = useState(null);

    const [loading, setLoading] = useState(true);
    const [projectLoading, setProjectLoading] = useState(false);
    const [bugLoading, setBugLoading] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);

    const [error, setError] = useState("");

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");

    const [projectPage, setProjectPage] = useState(1);
    const [projectLastPage, setProjectLastPage] = useState(1);

    const [toast, setToast] = useState(null);

    const toastTimer = useRef(null);
    const projectRequestId = useRef(0);
    const bugRequestId = useRef(0);
    const bugsSectionRef = useRef(null);

    /* ---------------------------------------------------------------- */
    /* Toast                                                             */
    /* ---------------------------------------------------------------- */

    const showToast = (message, type = "success") => {
        clearTimeout(toastTimer.current);
        setToast({ id: Date.now(), message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    /* ---------------------------------------------------------------- */
    /* API helper                                                        */
    /* ---------------------------------------------------------------- */

    const clearSession = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/";
    };

    const request = async (path, options = {}) => {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                ...(options.headers || {}),
            },
        });

        if (response.status === 401) {
            clearSession();
            throw new Error("Session expired. Please log in again.");
        }

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data.message || "Request failed");
        }

        return data;
    };

    /* ---------------------------------------------------------------- */
    /* Initial load                                                      */
    /* ---------------------------------------------------------------- */

    useEffect(() => {
        if (!token) {
            window.location.href = "/";
            return;
        }

        const savedUser = localStorage.getItem("user");

        if (savedUser) {
            try {
                setUser(JSON.parse(savedUser));
            } catch {
                console.log("Invalid user data");
            }
        }

        loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Close modal with Escape
    useEffect(() => {
        if (!selectedBug) return;

        const handleKey = (e) => {
            if (e.key === "Escape") closeBug();
        };

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBug]);

    async function loadDashboard() {
        try {
            setLoading(true);
            setError("");

            const [assignedData, projectsData] = await Promise.all([
                request("/developer/assigned-bugs"),
                request("/projects"),
            ]);

            const assigned = assignedData.bugs || assignedData.data || [];
            const projectList = projectsData.projects || projectsData.data || [];

            setAssignedBugs(Array.isArray(assigned) ? assigned : []);
            setProjects(Array.isArray(projectList) ? projectList : []);
        } catch (err) {
            console.error(err);
            setError("Unable to load dashboard.");
            showToast("Unable to load dashboard.", "error");
        } finally {
            setLoading(false);
        }
    }

    /* ---------------------------------------------------------------- */
    /* Project bugs                                                      */
    /* ---------------------------------------------------------------- */

    async function loadProjectBugs(project, page = 1) {
        const requestId = ++projectRequestId.current;

        try {
            setProjectLoading(true);
            setError("");

            setSelectedProject(project);
            closeBug();

            if (page === 1) {
                setSearch("");
                setStatusFilter("all");
                setPriorityFilter("all");
            }

            const data = await request(`/projects/${project.id}/bugs?page=${page}`);

            if (requestId !== projectRequestId.current) return; // stale

            const list = data.bugs || data.data || [];

            setProjectBugs(Array.isArray(list) ? list : []);
            setProjectPage(data.current_page || data.meta?.current_page || page);
            setProjectLastPage(data.last_page || data.meta?.last_page || 1);
        } catch (err) {
            console.error(err);

            if (requestId !== projectRequestId.current) return;

            setError("Unable to load project bugs.");
            showToast("Unable to load project bugs.", "error");
        } finally {
            if (requestId === projectRequestId.current) {
                setProjectLoading(false);
            }
        }
    }

    function showAssignedBugs() {
        projectRequestId.current++;

        setSelectedProject(null);
        setProjectBugs([]);
        setProjectLoading(false);
        closeBug();

        setSearch("");
        setStatusFilter("all");
        setPriorityFilter("all");
    }

    /* ---------------------------------------------------------------- */
    /* Single bug                                                        */
    /* ---------------------------------------------------------------- */

    async function openBug(bug) {
        const requestId = ++bugRequestId.current;

        // Open immediately with the data we already have
        setSelectedBug(bug);
        setBugLoading(true);

        try {
            const data = await request(`/bugs/${bug.id}`);

            if (requestId !== bugRequestId.current) return; // closed / changed

            setSelectedBug((previous) => ({
                ...bug,
                ...(data.bug || data.data || data),
                status: previous?.status ?? (data.bug || data.data || data).status,
            }));
        } catch (err) {
            console.error(err);

            if (requestId === bugRequestId.current) {
                showToast("Some bug details could not be loaded.", "error");
            }
        } finally {
            if (requestId === bugRequestId.current) {
                setBugLoading(false);
            }
        }
    }

    function closeBug() {
        bugRequestId.current++;
        setSelectedBug(null);
        setBugLoading(false);
    }

    /* ---------------------------------------------------------------- */
    /* Status update                                                     */
    /* ---------------------------------------------------------------- */

    async function updateBugStatus(status) {
        if (!selectedBug) return;
        if (status === normalizeStatus(selectedBug.status)) return;

        const bugId = selectedBug.id;

        try {
            setStatusUpdating(true);

            await request(`/bugs/${bugId}/status`, {
                method: "PUT",
                body: JSON.stringify({ status }),
            });

            const apply = (list) =>
                list.map((bug) => (bug.id === bugId ? { ...bug, status } : bug));

            setSelectedBug((previous) =>
                previous && previous.id === bugId ? { ...previous, status } : previous
            );
            setAssignedBugs(apply);
            setProjectBugs(apply);

            showToast(`Bug #${bugId} status updated to ${formatStatus(status)}.`);
        } catch (err) {
            console.error(err);
            showToast(err.message || "Unable to update bug status.", "error");
        } finally {
            setStatusUpdating(false);
        }
    }

    /* ---------------------------------------------------------------- */
    /* Derived data                                                      */
    /* ---------------------------------------------------------------- */

    const displayedBugs = useMemo(() => {
        const source = selectedProject ? projectBugs : assignedBugs;
        const searchText = search.toLowerCase();

        const filtered = source.filter((bug) => {
            const title = bug.title || bug.name || "";
            const description = bug.description || "";

            const matchesSearch =
                title.toLowerCase().includes(searchText) ||
                description.toLowerCase().includes(searchText) ||
                String(bug.id).includes(searchText);

            const matchesStatus =
                statusFilter === "all" || normalizeStatus(bug.status) === statusFilter;

            const matchesPriority =
                priorityFilter === "all" ||
                bug.priority?.toLowerCase() === priorityFilter;

            return matchesSearch && matchesStatus && matchesPriority;
        });

        return sortBugs(filtered);
    }, [
        assignedBugs,
        projectBugs,
        selectedProject,
        search,
        statusFilter,
        priorityFilter,
    ]);

    const countByStatus = (status) =>
        assignedBugs.filter((bug) => normalizeStatus(bug.status) === status).length;

    const stats = [
        { label: "Assigned Bugs", value: assignedBugs.length, icon: "#", tone: "total", filter: "all" },
        { label: "Pending", value: countByStatus("pending"), icon: "!", tone: "pending", filter: "pending" },
        { label: "In Progress", value: countByStatus("in_progress"), icon: "↻", tone: "progress", filter: "in_progress" },
        { label: "Reopened", value: countByStatus("reopened"), icon: "↺", tone: "reopened", filter: "reopened" },
        { label: "Resolved", value: countByStatus("resolved"), icon: "✓", tone: "resolved", filter: "resolved" },
    ];

    // Clicking a card shows the assigned bugs filtered by that status
    const handleStatClick = (filter) => {
        showAssignedBugs();
        setStatusFilter(filter);

        setTimeout(() => {
            bugsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
    };

    /* ---------------------------------------------------------------- */
    /* Logout                                                            */
    /* ---------------------------------------------------------------- */

    async function handleLogout() {
        try {
            if (token) {
                await fetch(`${API_URL}/logout`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
                });
            }
        } catch (err) {
            console.error("Logout request failed:", err);
        } finally {
            clearSession();
        }
    }

    /* ---------------------------------------------------------------- */
    /* Loading                                                           */
    /* ---------------------------------------------------------------- */

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="loader" />
                <p>Loading developer dashboard...</p>
            </div>
        );
    }

    const imageUrl = selectedBug ? getImageUrl(selectedBug) : null;
    const selectedStatus = normalizeStatus(selectedBug?.status);

    return (
        <div className="dashboard">
            {/* HEADER */}
            <header className="topbar">
                <div className="topbar-left">
                    <div className="brand-icon">B</div>

                    <div>
                        <h1>Developer Dashboard</h1>
                        <p>Track and update the bugs assigned to you</p>
                    </div>
                </div>

                <div className="topbar-right">
                    <div className="user-chip">
                        <div className="developer-avatar">
                            {(user?.name || "D").charAt(0).toUpperCase()}
                        </div>

                        <div className="user-chip-text">
                            <strong>{user?.name || "Developer"}</strong>
                            <span>Developer</span>
                        </div>
                    </div>

                    <button className="logout-button" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </header>

            {error && <div className="alert error-alert">{error}</div>}

            {/* STATISTICS */}
            <section className="stats-container">
                {stats.map((stat) => {
                    const active =
                        selectedProject === null && statusFilter === stat.filter;

                    return (
                        <button
                            type="button"
                            key={stat.label}
                            className={`stat-card ${active ? "active" : ""}`}
                            onClick={() => handleStatClick(stat.filter)}
                            title={`Show ${stat.label.toLowerCase()}`}
                        >
                            <div className={`stat-icon ${stat.tone}`}>{stat.icon}</div>

                            <div>
                                <span>{stat.label}</span>
                                <strong>{stat.value}</strong>
                            </div>
                        </button>
                    );
                })}
            </section>

            <div className="dashboard-layout">
                {/* SIDEBAR */}
                <aside className="projects-sidebar">
                    <div className="sidebar-heading">
                        <h2>Projects</h2>
                        <span>{projects.length} projects</span>
                    </div>

                    <button
                        className={`project-item ${selectedProject === null ? "active" : ""}`}
                        onClick={showAssignedBugs}
                    >
                        <div className="project-left">
                            <div className="project-icon">✓</div>

                            <div>
                                <strong>My Assigned Bugs</strong>
                                <small>Bugs assigned to me</small>
                            </div>
                        </div>

                        <span className="bug-count">{assignedBugs.length}</span>
                    </button>

                    <div className="project-list">
                        {projects.map((project) => (
                            <button
                                key={project.id}
                                className={`project-item ${
                                    selectedProject?.id === project.id ? "active" : ""
                                }`}
                                onClick={() => loadProjectBugs(project)}
                            >
                                <div className="project-left">
                                    <div className="project-icon">
                                        {project.name?.charAt(0).toUpperCase() || "P"}
                                    </div>

                                    <div>
                                        <strong>{project.name}</strong>
                                        <small>View project bugs</small>
                                    </div>
                                </div>

                                <span className="arrow">→</span>
                            </button>
                        ))}
                    </div>
                </aside>

                {/* BUGS */}
                <main className="bugs-section" ref={bugsSectionRef}>
                    <div className="bugs-toolbar">
                        <div>
                            <h2>
                                {selectedProject ? selectedProject.name : "My Assigned Bugs"}
                            </h2>

                            <p>
                                {selectedProject
                                    ? "All bugs from this project"
                                    : "Bugs currently assigned to you"}
                            </p>
                        </div>

                        <div className="search-box">
                            <span>⌕</span>

                            <input
                                type="text"
                                placeholder="Search bugs..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="filters">
                        <span className="filter-label">Filters</span>

                        <select
                            className="select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="reopened">Reopened</option>
                            <option value="closed">Closed</option>
                        </select>

                        <select
                            className="select"
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                        >
                            <option value="all">All Priority</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>

                        <span className="result-count">{displayedBugs.length} bugs</span>
                    </div>

                    {projectLoading ? (
                        <div className="table-loading">
                            <div className="loader" />
                            <p>Loading project bugs...</p>
                        </div>
                    ) : displayedBugs.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">✓</div>
                            <h3>No bugs found</h3>
                            <p>Try changing your filters or search.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Bug</th>
                                        <th>Project</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {displayedBugs.map((bug) => (
                                        <tr key={bug.id}>
                                            <td>
                                                <span className="bug-id">#{bug.id}</span>
                                            </td>

                                            <td>
                                                <div className="bug-name">
                                                    {bug.title || bug.name || "Untitled Bug"}
                                                </div>

                                                <div className="bug-description">
                                                    {bug.description || "No description"}
                                                </div>
                                            </td>

                                            <td>
                                                {bug.project?.name ||
                                                    bug.project_name ||
                                                    selectedProject?.name ||
                                                    "—"}
                                            </td>

                                            <td>
                                                <span
                                                    className={`priority ${
                                                        bug.priority?.toLowerCase() || ""
                                                    }`}
                                                >
                                                    {bug.priority || "Normal"}
                                                </span>
                                            </td>

                                            <td>
                                                <span
                                                    className={`status status-${normalizeStatus(
                                                        bug.status
                                                    )}`}
                                                >
                                                    {formatStatus(bug.status)}
                                                </span>
                                            </td>

                                            <td>
                                                <button
                                                    className="view-button"
                                                    onClick={() => openBug(bug)}
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {selectedProject && projectLastPage > 1 && (
                        <div className="pagination">
                            <button
                                disabled={projectPage <= 1}
                                onClick={() => loadProjectBugs(selectedProject, projectPage - 1)}
                            >
                                ← Previous
                            </button>

                            <span>
                                Page <strong>{projectPage}</strong> of{" "}
                                <strong>{projectLastPage}</strong>
                            </span>

                            <button
                                disabled={projectPage >= projectLastPage}
                                onClick={() => loadProjectBugs(selectedProject, projectPage + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {/* SINGLE BUG MODAL */}
            {selectedBug && (
                <div className="modal-overlay" onClick={closeBug}>
                    <div className="bug-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <span className="modal-bug-id">
                                    BUG #{selectedBug.id}
                                    {bugLoading && (
                                        <em className="loading-note">Loading details…</em>
                                    )}
                                </span>

                                <h2>
                                    {selectedBug.title || selectedBug.name || "Bug Details"}
                                </h2>
                            </div>

                            <button className="close-button" onClick={closeBug}>
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="bug-detail-grid">
                                <div>
                                    <label>Project</label>
                                    <p>
                                        {selectedBug.project?.name ||
                                            selectedBug.project_name ||
                                            selectedProject?.name ||
                                            "—"}
                                    </p>
                                </div>

                                <div>
                                    <label>Priority</label>
                                    <p>
                                        <span
                                            className={`priority ${
                                                selectedBug.priority?.toLowerCase() || ""
                                            }`}
                                        >
                                            {selectedBug.priority || "Normal"}
                                        </span>
                                    </p>
                                </div>

                                <div>
                                    <label>Reporter</label>
                                    <p>
                                        {selectedBug.reporter?.name ||
                                            selectedBug.created_by_name ||
                                            selectedBug.tester?.name ||
                                            "—"}
                                    </p>
                                </div>

                                <div>
                                    <label>Assigned To</label>
                                    <p>
                                        {selectedBug.assigned_to_name ||
                                            selectedBug.assignee?.name ||
                                            user?.name ||
                                            "—"}
                                    </p>
                                </div>
                            </div>

                            <div className="description-section">
                                <label>Description</label>

                                <div className="description-box">
                                    {selectedBug.description || "No description available."}
                                </div>
                            </div>

                            {(selectedBug.bug_url || selectedBug.url) && (
                                <CopyField
                                    label="Bug URL"
                                    value={selectedBug.bug_url || selectedBug.url}
                                />
                            )}

                            {imageUrl && (
                                <div className="image-section">
                                    <label>Bug Screenshot</label>

                                    <div className="image-preview">
                                        <BugImage src={imageUrl} alt="Bug screenshot" />
                                    </div>
                                </div>
                            )}

                            <div className="status-section">
                                <label>Change Status</label>

                                {selectedStatus === "closed" ? (
                                    <div className="closed-note">
                                        ✓ This bug was verified and closed by the tester.
                                    </div>
                                ) : (
                                    <>
                                        <StatusDropdown
                                            value={selectedBug.status}
                                            disabled={statusUpdating}
                                            onChange={updateBugStatus}
                                        />

                                        {statusUpdating && (
                                            <span className="updating-text">Updating...</span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST */}
            {toast && (
                <div
                    key={toast.id}
                    className={`toast ${
                        toast.type === "error" ? "toast-error" : "toast-success"
                    }`}
                    role="status"
                >
                    <div className="toast-icon">{toast.type === "error" ? "!" : "✓"}</div>

                    <div className="toast-content">
                        <strong className="toast-title">
                            {toast.type === "error" ? "Something went wrong" : "Success"}
                        </strong>
                        <p className="toast-message">{toast.message}</p>
                    </div>

                    <button
                        type="button"
                        className="toast-close"
                        aria-label="Close"
                        onClick={() => setToast(null)}
                    >
                        ×
                    </button>

                    <span className="toast-progress" />
                </div>
            )}
        </div>
    );
}

export default Dashboard;