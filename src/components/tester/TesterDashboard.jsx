import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatAssignedTeam, getAssignedTeam } from "../../utils/bugTeam";
import "./TesterDashboard.css";

const API_URL = "http://localhost:8000/api";

const EMPTY_FORM = {
    title: "",
    description: "",
    priority: "medium",
    team: "frontend",
    assigned_to: "",
    image: null,
    url: "",
};

const parseJson = async (response) => {
    try {
        return await response.json();
    } catch {
        return {};
    }
};

const extractList = (data, key) => {
    const list = data?.[key] || data?.data || data;
    return Array.isArray(list) ? list : [];
};

const countStats = (list) => ({
    total: list.length,
    pending: list.filter((b) => b.status === "pending").length,
    inProgress: list.filter((b) => b.status === "in_progress").length,
    resolved: list.filter((b) => b.status === "resolved").length,
    reopened: list.filter((b) => b.status === "reopened").length,
    closed: list.filter((b) => b.status === "closed").length,
});

/*
 * Builds a working image URL from whatever the API returns:
 * - full URL            -> used as is (host rewritten if it points at the wrong server)
 * - "bugs/abc.png"      -> BASE/storage/bugs/abc.png
 * - "/storage/bugs/..." -> BASE/storage/bugs/...
 */
const API_BASE = API_URL.replace(/\/api\/?$/, "");

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

            // APP_URL on the backend may be wrong (e.g. localhost vs ngrok)
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

/*
 * Tries a normal <img>. If that fails (e.g. ngrok warning page),
 * retries via fetch() with the ngrok header and shows it as a blob.
 */
function BugImage({ src, alt, className }) {
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

    if (!src) return null;

    if (mode === "failed") {
        return (
            <div className="image-error">
                Image could not be loaded.{" "}
                <a href={src} target="_blank" rel="noreferrer">
                    Open directly ↗
                </a>
            </div>
        );
    }

    if (mode === "blob" && !blobUrl) {
        return <div className="image-error">Loading image...</div>;
    }

    return (
        <img
            src={mode === "blob" ? blobUrl : src}
            alt={alt}
            className={className}
            onError={() => setMode(mode === "direct" ? "blob" : "failed")}
        />
    );
}

const getBugUrl = (bug) => {
    const raw = bug?.url || bug?.url;
    if (typeof raw !== "string" || !raw.trim()) return null;

    const candidate = /^https?:\/\//i.test(raw.trim())
        ? raw.trim()
        : `https://${raw.trim()}`;

    try {
        const parsed = new URL(candidate);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
};

const shortUrl = (url) => {
    let text = url;

    try {
        const parsed = new URL(url);
        text = parsed.host + (parsed.pathname !== "/" ? parsed.pathname : "");
    } catch {
        /* keep original */
    }

    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

const PROJECT_STATUS_ORDER = ["active", "on hold", "finished", "archived"];

const normalizeProjectStatus = (status) =>
    String(status || "other").toLowerCase().trim().replace(/[\s-]+/g, "_");

const formatProjectStatus = (status) => {
    if (status === "other") return "Other";
    return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

/* URL field with Copy + Open buttons */
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
                    {shortUrl(value)}
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

function TesterDashboard() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");

    const [activePage, setActivePage] = useState("dashboard");

    const [projects, setProjects] = useState([]);
    const [developers, setDevelopers] = useState([]);
    const [bugs, setBugs] = useState([]); // bugs of the selected project
    const [allBugs, setAllBugs] = useState([]); // bugs of every project

    const [selectedProject, setSelectedProject] = useState(null);
    const [selectedBug, setSelectedBug] = useState(null);

    const [loadingProjects, setLoadingProjects] = useState(true);
    const [loadingBugs, setLoadingBugs] = useState(false);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const [toast, setToast] = useState(null);
    const [bugForm, setBugForm] = useState(EMPTY_FORM);

    const toastTimer = useRef(null);
    const bugsRequestId = useRef(0);

    /* ------------------------------------------------------------------ */
    /* Toast                                                               */
    /* ------------------------------------------------------------------ */

    const showToast = (message, type = "success") => {
        clearTimeout(toastTimer.current);
        setToast({ id: Date.now(), message, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    /* ------------------------------------------------------------------ */
    /* API helper (auth headers, safe JSON, 401 handling)                  */
    /* ------------------------------------------------------------------ */

    const handleUnauthorized = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.clear();
        navigate("/", { replace: true });
    };

    const request = async (path, options = {}) => {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "ngrok-skip-browser-warning": "true",
                ...(options.headers || {}),
            },
        });

        if (response.status === 401) {
            handleUnauthorized();
            throw new Error("Session expired. Please log in again.");
        }

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data.message || "Request failed");
        }

        return data;
    };

    /* ------------------------------------------------------------------ */
    /* Fetchers                                                            */
    /* ------------------------------------------------------------------ */

    const fetchProjects = async () => {
        try {
            setLoadingProjects(true);
            const data = await request("/projects");
            setProjects(extractList(data, "projects"));
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to load projects", "error");
        } finally {
            setLoadingProjects(false);
        }
    };

    const fetchDevelopers = async () => {
        try {
            const data = await request("/admin/developers");
            setDevelopers(extractList(data, "developers"));
        } catch (error) {
            console.error(error);
            showToast("Failed to load developers", "error");
        }
    };

    const fetchProjectBugs = async (projectId) => {
        if (!projectId) return;

        const requestId = ++bugsRequestId.current;

        try {
            setLoadingBugs(true);
            const data = await request(`/projects/${projectId}/bugs`);

            if (requestId !== bugsRequestId.current) return; // stale response

            setBugs(extractList(data, "bugs"));
        } catch (error) {
            console.error(error);

            if (requestId !== bugsRequestId.current) return;

            showToast(error.message || "Failed to load bugs", "error");
            setBugs([]);
        } finally {
            if (requestId === bugsRequestId.current) {
                setLoadingBugs(false);
            }
        }
    };

    const fetchAllBugs = async (projectList = projects) => {
        try {
            const results = await Promise.all(
                projectList.map(async (project) => {
                    try {
                        const data = await request(`/projects/${project.id}/bugs`);
                        return extractList(data, "bugs");
                    } catch {
                        return [];
                    }
                })
            );

            setAllBugs(results.flat());
        } catch (error) {
            console.error(error);
        }
    };

    // Refresh the current project's table and the global counts
    const refreshBugs = () => {
        if (selectedProject) fetchProjectBugs(selectedProject.id);
        fetchAllBugs();
    };

    /* ------------------------------------------------------------------ */
    /* Effects                                                             */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        if (!token) {
            navigate("/login", { replace: true });
            return;
        }

        fetchProjects();
        fetchDevelopers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (projects.length) fetchAllBugs(projects);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key !== "Escape") return;

            setShowViewModal(false);
            setShowEditModal(false);
            setShowCreateModal(false);
        };

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, []);

    /* ------------------------------------------------------------------ */
    /* Navigation                                                          */
    /* ------------------------------------------------------------------ */

    const handleProjectSelect = (project) => {
        setSelectedProject(project);
        setActivePage("project");
        setSearch("");
        setStatusFilter("all");
        setBugs([]);
        fetchProjectBugs(project.id); // always fetches, even for same project
    };

    /* ------------------------------------------------------------------ */
    /* Form                                                                */
    /* ------------------------------------------------------------------ */

    const filteredDevelopers = useMemo(() => {
        return developers.filter((developer) => {
            const developerTeam =
                developer.team ||
                developer.department ||
                developer.developer_team ||
                "";

            return developerTeam.toLowerCase() === bugForm.team.toLowerCase();
        });
    }, [developers, bugForm.team]);

    const handleFormChange = (e) => {
        const { name, value } = e.target;

        setBugForm((previous) => ({
            ...previous,
            [name]: value,
            ...(name === "team" ? { assigned_to: "" } : {}),
        }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files?.[0] || null;
        setBugForm((previous) => ({ ...previous, image: file }));
    };

    const resetForm = () => setBugForm(EMPTY_FORM);

    const buildFormData = () => {
        const formData = new FormData();

        formData.append("title", bugForm.title);
        formData.append("description", bugForm.description);
        formData.append("priority", bugForm.priority);
        formData.append("team", bugForm.team);
        formData.append("assigned_to", bugForm.assigned_to); // developer ID

        if (bugForm.url) formData.append("url", bugForm.url);
        if (bugForm.image) formData.append("image", bugForm.image);

        return formData;
    };

    const closeFormModals = () => {
        setShowCreateModal(false);
        setShowEditModal(false);
    };

    /* ------------------------------------------------------------------ */
    /* CRUD                                                                */
    /* ------------------------------------------------------------------ */

    const handleCreateBug = async (e) => {
        e.preventDefault();

        if (!selectedProject) {
            showToast("Please select a project", "error");
            return;
        }

        try {
            await request(`/projects/${selectedProject.id}/create-bug`, {
                method: "POST",
                body: buildFormData(),
            });

            showToast("Bug created successfully");
            setShowCreateModal(false);
            resetForm();
            refreshBugs();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to create bug", "error");
        }
    };

    const openViewBug = async (bug) => {
        try {
            const data = await request(`/bugs/${bug.id}`);
            setSelectedBug(data.bug || data.data || data);
            setShowViewModal(true);
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to load bug", "error");
        }
    };

    const openEditModal = async (bug) => {
        setSelectedBug(bug);

        setBugForm({
            title: bug.title || "",
            description: bug.description || "",
            priority: bug.priority || "medium",
            team: (getBugTeam(bug) || "frontend").toLowerCase(),
            assigned_to: bug.assigned_to ? String(bug.assigned_to) : "",
            image: null,
            url: bug.url || bug.url || "",
        });

        setShowEditModal(true);

        // The list endpoint often omits the image — always load full details
        try {
            const data = await request(`/bugs/${bug.id}`);
            const detail = data.bug || data.data || data;
            setSelectedBug(detail);

            const detailTeam = getBugTeam(detail);
            if (detailTeam) {
                setBugForm((previous) => ({ ...previous, team: detailTeam.toLowerCase() }));
            }
        } catch {
            /* ignore */
        }
    };

    const handleUpdateBug = async (e) => {
        e.preventDefault();

        if (!selectedBug) return;

        try {
            const formData = buildFormData();
            formData.append("_method", "PUT"); // Laravel method spoofing

            await request(`/bugs/${selectedBug.id}`, {
                method: "POST",
                body: formData,
            });

            showToast("Bug updated successfully");
            setShowEditModal(false);
            setSelectedBug(null);
            resetForm();
            refreshBugs();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to update bug", "error");
        }
    };

    const handleDeleteBug = async (bugId) => {
        if (!window.confirm("Are you sure you want to delete this bug?")) return;

        try {
            await request(`/bugs/${bugId}`, { method: "DELETE" });

            showToast("Bug deleted successfully");
            refreshBugs();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to delete bug", "error");
        }
    };

    const handleRetest = async (bug, status) => {
        try {
            await request(`/bugs/${bug.id}/retest`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            showToast(status === "closed" ? "Bug marked as closed" : "Bug reopened");
            refreshBugs();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Retest failed", "error");
        }
    };

    const handleLogout = async () => {
        try {
            if (token) {
                await fetch(`${API_URL}/logout`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                });
            }
        } catch (error) {
            console.error("Logout request failed:", error);
        } finally {
            handleUnauthorized();
        }
    };

    /* ------------------------------------------------------------------ */
    /* Derived data                                                        */
    /* ------------------------------------------------------------------ */

    // The API may not send `team` on the bug itself, so fall back to the
    // assigned developer's team.
    const filteredBugs = useMemo(() => {
        const searchText = search.toLowerCase();

        return bugs.filter((bug) => {
            const matchesSearch =
                bug.title?.toLowerCase().includes(searchText) ||
                bug.description?.toLowerCase().includes(searchText);

            const matchesStatus =
                statusFilter === "all" ||
                bug.status?.toLowerCase() === statusFilter.toLowerCase();

            return matchesSearch && matchesStatus;
        });
    }, [bugs, search, statusFilter]);

    const resolvedBugs = useMemo(
        () => allBugs.filter((bug) => bug.status?.toLowerCase() === "resolved"),
        [allBugs]
    );

    const statistics = countStats(activePage === "project" ? bugs : allBugs);
    const projectGroups = useMemo(() => {
        const groupedProjects = new Map();

        projects.forEach((project) => {
            const status = normalizeProjectStatus(project.status);
            groupedProjects.set(status, [...(groupedProjects.get(status) || []), project]);
        });

        return [...groupedProjects.entries()]
            .sort(([firstStatus], [secondStatus]) => {
                const firstOrder = PROJECT_STATUS_ORDER.indexOf(firstStatus);
                const secondOrder = PROJECT_STATUS_ORDER.indexOf(secondStatus);
                return (firstOrder < 0 ? PROJECT_STATUS_ORDER.length : firstOrder) -
                    (secondOrder < 0 ? PROJECT_STATUS_ORDER.length : secondOrder);
            })
            .map(([status, items]) => ({ status, items }));
    }, [projects]);

    /* ------------------------------------------------------------------ */
    /* Renderers                                                           */
    /* ------------------------------------------------------------------ */

    const renderStatistics = () => (
        <section className="statistics">
            <div className="stat-card">
                <span>Total Bugs</span>
                <strong>{statistics.total}</strong>
            </div>

            <div className="stat-card pending">
                <span>Pending</span>
                <strong>{statistics.pending}</strong>
            </div>

            <div className="stat-card progress">
                <span>In Progress</span>
                <strong>{statistics.inProgress}</strong>
            </div>

            <div className="stat-card resolved">
                <span>Resolved</span>
                <strong>{statistics.resolved}</strong>
            </div>

            <div className="stat-card reopened">
                <span>Reopened</span>
                <strong>{statistics.reopened}</strong>
            </div>

            <div className="stat-card closed">
                <span>Closed</span>
                <strong>{statistics.closed}</strong>
            </div>
        </section>
    );

    const renderDashboard = () => (
        <>
            <div className="dashboard-header">
                <div>
                    <span className="eyebrow">TESTER DASHBOARD</span>
                    <h1>Dashboard</h1>
                    <p>Overview of your projects and testing activity.</p>
                </div>
            </div>

            {renderStatistics()}

            <section className="dashboard-panels">
                <div className="dashboard-panel">
                    <h2>Projects</h2>
                    <p>Select a project from the sidebar to manage its bugs.</p>
                    <strong>{projects.length}</strong>
                    <span>Available Projects</span>
                </div>

                <div className="dashboard-panel retest-panel">
                    <h2>Waiting for Retest</h2>
                    <p>Resolved bugs waiting for verification.</p>
                    <strong>{resolvedBugs.length}</strong>

                    <button onClick={() => setActivePage("resolved")}>
                        View Resolved Bugs →
                    </button>
                </div>
            </section>
        </>
    );

    const renderResolvedBugs = () => (
        <>
            <div className="dashboard-header">
                <div>
                    <span className="eyebrow">TESTING</span>
                    <h1>Resolved Bugs</h1>
                    <p>Retest resolved bugs and either close or reopen them.</p>
                </div>
            </div>

            <section className="retest-section">
                {resolvedBugs.length === 0 ? (
                    <div className="no-resolved">
                        ✓ No resolved bugs waiting for retesting.
                    </div>
                ) : (
                    <div className="retest-list">
                        {resolvedBugs.map((bug) => (
                            <div className="retest-card" key={bug.id}>
                                <div>
                                    <span className="bug-id">BUG #{bug.id}</span>
                                    <h3>{bug.title}</h3>
                                    <p>{bug.description}</p>

                                    {getBugUrl(bug) && (
                                        <a
                                            className="bug-link"
                                            href={getBugUrl(bug)}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={getBugUrl(bug)}
                                        >
                                            🔗 {shortUrl(getBugUrl(bug))}
                                        </a>
                                    )}

                                    <div className="retest-meta">
                                        <span>Team: {formatAssignedTeam(getAssignedTeam(bug, developers))}</span>
                                        <span>
                                            Developer:{" "}
                                            {bug.assigned_to_name || bug.assigned_to || "Unassigned"}
                                        </span>
                                    </div>
                                </div>

                                <div className="retest-actions">
                                    <button
                                        className="close-bug"
                                        onClick={() => handleRetest(bug, "closed")}
                                    >
                                        ✓ Close Bug
                                    </button>

                                    <button
                                        className="reopen-bug"
                                        onClick={() => handleRetest(bug, "reopened")}
                                    >
                                        ↻ Reopen Bug
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    );

    const renderProject = () => (
        <>
            <div className="dashboard-header">
                <div>
                    <span className="eyebrow">PROJECT</span>
                    <h1>{selectedProject?.name}</h1>
                    <p>Manage bugs for this project.</p>
                </div>

                <button
                    className="create-button"
                    onClick={() => {
                        resetForm();
                        setSelectedBug(null);
                        setShowCreateModal(true);
                    }}
                >
                    + Create Bug
                </button>
            </div>

            {renderStatistics()}

            <section className="bugs-section">
                <div className="bugs-header">
                    <div>
                        <h2>Project Bugs</h2>
                        <p>View and manage bugs for this project.</p>
                    </div>

                    <div className="filters">
                        <div className="search-box">
                            🔎
                            <input
                                type="text"
                                placeholder="Search bugs..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <select
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
                    </div>
                </div>

                {loadingBugs ? (
                    <div className="loading">
                        <div className="spinner" />
                        Loading bugs...
                    </div>
                ) : (
                    <div className="bug-table-wrapper">
                        <table className="bug-table">
                            <thead>
                                <tr>
                                    <th>Bug</th>
                                    <th>Team</th>
                                    <th>Developer</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredBugs.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="empty-table">
                                            No bugs found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredBugs.map((bug) => (
                                        <tr key={bug.id}>
                                            <td>
                                                <div className="bug-name">
                                                    <strong>{bug.title}</strong>
                                                    <span>#{bug.id}</span>
                                                    <small>
                                                        {(bug.description || "").substring(0, 70)}
                                                    </small>
                                                </div>
                                            </td>

                                            <td>
                                                <span className="team-badge">{formatAssignedTeam(getAssignedTeam(bug, developers))}</span>
                                            </td>

                                            <td>
                                                {bug.assigned_to_name ||
                                                    bug.assigned_to ||
                                                    "Unassigned"}
                                            </td>

                                            <td>
                                                <span className={`priority priority-${bug.priority}`}>
                                                    {bug.priority}
                                                </span>
                                            </td>

                                            <td>
                                                <span className={`status-badge status-${bug.status}`}>
                                                    {bug.status}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="action-buttons">
                                                    <button
                                                        className="view-button"
                                                        onClick={() => openViewBug(bug)}
                                                    >
                                                        View
                                                    </button>

                                                    <button
                                                        className="edit-button"
                                                        onClick={() => openEditModal(bug)}
                                                    >
                                                        Edit
                                                    </button>

                                                    <button
                                                        className="delete-button"
                                                        onClick={() => handleDeleteBug(bug.id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );

    /* ------------------------------------------------------------------ */
    /* JSX                                                                 */
    /* ------------------------------------------------------------------ */

    return (
        <div className="tester-dashboard">
            {/* Toast */}
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

            {/* Sidebar */}
            <aside className="tester-sidebar">
                <div className="brand">
                    <div className="brand-icon">B</div>

                    <div>
                        <h2>Bug Tracker</h2>
                        <span>Tester Panel</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <button
                        className={`sidebar-nav-item ${
                            activePage === "dashboard" ? "active" : ""
                        }`}
                        onClick={() => {
                            setActivePage("dashboard");
                            setSelectedProject(null);
                            setBugs([]);
                        }}
                    >
                        <span>⌂</span>
                        Dashboard
                    </button>

                    <button
                        className={`sidebar-nav-item ${
                            activePage === "resolved" ? "active" : ""
                        }`}
                        onClick={() => setActivePage("resolved")}
                    >
                        <span>✓</span>
                        Resolved Bugs
                        {resolvedBugs.length > 0 && <b>{resolvedBugs.length}</b>}
                    </button>
                </nav>

                <div className="sidebar-section">
                    <p>PROJECTS</p>

                    {loadingProjects ? (
                        <div className="sidebar-loading">Loading...</div>
                    ) : projects.length === 0 ? (
                        <div className="sidebar-loading">No projects</div>
                    ) : (
                        projectGroups.map(({ status, items }) => (
                            <div className="project-group" key={status}>
                                <div className="project-group-heading">
                                    <span>{formatProjectStatus(status)}</span>
                                    <b>{items.length}</b>
                                </div>
                                {items.map((project) => (
                                    <button
                                        key={project.id}
                                        className={`project-menu ${
                                            activePage === "project" &&
                                            selectedProject?.id === project.id
                                                ? "active"
                                                : ""
                                        }`}
                                        onClick={() => handleProjectSelect(project)}
                                    >
                                        <span className="project-dot" />
                                        <span className="project-menu-name">{project.name}</span>
                                        <span className={`project-status-chip project-status-${status}`}>
                                            {formatProjectStatus(status)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>

                <button className="logout-button" onClick={handleLogout}>
                    ⇥ Logout
                </button>
            </aside>

            {/* Main */}
            <main className="tester-main">
                {activePage === "dashboard" && renderDashboard()}
                {activePage === "resolved" && renderResolvedBugs()}
                {activePage === "project" && selectedProject && renderProject()}
            </main>

            {/* VIEW BUG MODAL */}
            {showViewModal && selectedBug && (
                <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
                    <div className="bug-view-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <span>BUG DETAILS</span>
                                <h2>{selectedBug.title}</h2>
                            </div>

                            <button onClick={() => setShowViewModal(false)}>×</button>
                        </div>

                        <div className="bug-details">
                            <div className="detail-item">
                                <label>Bug ID</label>
                                <strong>#{selectedBug.id}</strong>
                            </div>

                            <div className="detail-item">
                                <label>Status</label>
                                <span className={`status-badge status-${selectedBug.status}`}>
                                    {selectedBug.status}
                                </span>
                            </div>

                            <div className="detail-item">
                                <label>Priority</label>
                                <span className={`priority priority-${selectedBug.priority}`}>
                                    {selectedBug.priority}
                                </span>
                            </div>

                            <div className="detail-item">
                                <label>Assigned Team</label>
                                <strong>{formatAssignedTeam(getAssignedTeam(selectedBug, developers))}</strong>
                            </div>

                            <div className="detail-item">
                                <label>Assigned Developer</label>
                                <strong>
                                    {selectedBug.assigned_to_name ||
                                        selectedBug.assigned_to ||
                                        "Unassigned"}
                                </strong>
                            </div>

                            <div className="detail-item full">
                                <label>Description</label>
                                <p>{selectedBug.description || "No description available."}</p>
                            </div>

                            {getBugUrl(selectedBug) && (
                                <div className="detail-item full">
                                    <CopyField
                                        label="Bug URL"
                                        value={getBugUrl(selectedBug)}
                                    />
                                </div>
                            )}

                            {getImageUrl(selectedBug) && (
                                <div className="bug-image-section">
                                    <label>Bug Image</label>

                                    <div className="bug-image-wrapper">
                                        <BugImage
                                            src={getImageUrl(selectedBug)}
                                            alt="Bug screenshot"
                                            className="bug-detail-image"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-actions">
                            <button
                                className="cancel-button"
                                onClick={() => setShowViewModal(false)}
                            >
                                Close
                            </button>

                            <button
                                className="save-button"
                                onClick={() => {
                                    setShowViewModal(false);
                                    openEditModal(selectedBug);
                                }}
                            >
                                Change Bug
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE / EDIT BUG MODAL */}
            {(showCreateModal || showEditModal) && (
                <div className="modal-overlay" onClick={closeFormModals}>
                    <div className="bug-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <span>{showEditModal ? "EDIT BUG" : "NEW BUG"}</span>
                                <h2>{showEditModal ? "Change Bug" : "Create New Bug"}</h2>
                            </div>

                            <button type="button" onClick={closeFormModals}>
                                ×
                            </button>
                        </div>

                        <form
                            className="bug-form"
                            onSubmit={showEditModal ? handleUpdateBug : handleCreateBug}
                        >
                            <div className="form-field">
                                <label>Bug Title</label>
                                <input
                                    name="title"
                                    value={bugForm.title}
                                    onChange={handleFormChange}
                                    placeholder="Enter bug title"
                                    required
                                />
                            </div>

                            <div className="form-field">
                                <label>Description</label>
                                <textarea
                                    name="description"
                                    value={bugForm.description}
                                    onChange={handleFormChange}
                                    rows="5"
                                    placeholder="Describe the bug..."
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-field">
                                    <label>Priority</label>
                                    <select
                                        name="priority"
                                        value={bugForm.priority}
                                        onChange={handleFormChange}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>

                                <div className="form-field">
                                    <label>Assigned Team</label>
                                    <select
                                        name="team"
                                        value={bugForm.team}
                                        onChange={handleFormChange}
                                    >
                                        <option value="frontend">Frontend</option>
                                        <option value="backend">Backend</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-field">
                                <label>Developer</label>

                                <select
                                    name="assigned_to"
                                    value={bugForm.assigned_to}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="">Select {bugForm.team} developer</option>

                                    {filteredDevelopers.map((developer) => (
                                        <option key={developer.id} value={String(developer.id)}>
                                            {developer.name}
                                        </option>
                                    ))}
                                </select>

                                {filteredDevelopers.length === 0 && (
                                    <small className="field-warning">
                                        No {bugForm.team} developers found.
                                    </small>
                                )}
                            </div>

                            <div className="form-field">
                                <label>Bug URL</label>
                                <input
                                    type="url"
                                    name="url"
                                    value={bugForm.url}
                                    onChange={handleFormChange}
                                    placeholder="https://..."
                                />
                            </div>

                            <div className="form-field">
                                <label>Bug Image</label>

                                {showEditModal && getImageUrl(selectedBug) && (
                                    <div className="current-image">
                                        <span>Current image</span>
                                        <BugImage
                                            src={getImageUrl(selectedBug)}
                                            alt="Current bug"
                                        />
                                    </div>
                                )}

                                <input type="file" accept="image/*" onChange={handleImageChange} />

                                {bugForm.image && <small>Selected: {bugForm.image.name}</small>}

                                {showEditModal && (
                                    <small>
                                        Select a new image only if you want to replace the current
                                        image.
                                    </small>
                                )}
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="cancel-button"
                                    onClick={closeFormModals}
                                >
                                    Cancel
                                </button>

                                <button type="submit" className="save-button">
                                    {showEditModal ? "Update Bug" : "Create Bug"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TesterDashboard;