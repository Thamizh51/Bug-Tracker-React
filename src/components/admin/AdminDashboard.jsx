import { useEffect, useMemo, useRef, useState } from "react";
import { formatAssignedTeam, getAssignedTeam } from "../../utils/bugTeam";
import "./AdminDashboard.css";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const getImageUrl = (bug) => {
    const raw =
        bug?.image_url ||
        bug?.imageUrl ||
        bug?.image ||
        bug?.image_path ||
        bug?.imagePath ||
        bug?.screenshot ||
        bug?.screenshot_url ||
        bug?.screenshotUrl;

    if (typeof raw !== "string" || !raw.trim()) return null;

    const value = raw.trim();
    if (/^(data:|blob:)/i.test(value)) return value;

    if (/^https?:\/\//i.test(value)) {
        try {
            const url = new URL(value);
            // If the API returned a full backend URL for a Laravel storage file,
            // normalize it to the configured backend base while preserving query params.
            if (url.pathname.startsWith("/storage/")) {
                return `${API_BASE}${url.pathname}${url.search}`;
            }
        } catch {
            // Keep the original URL if it is not a parseable absolute URL.
        }
        return value;
    }

    let path = value.replace(/^\/+/, "");
    // Handle values saved as storage/..., public/storage/..., or storage/app/public/...
    path = path.replace(/^public\//i, "");
    path = path.replace(/^storage\/app\/public\//i, "");
    return path.startsWith("storage/")
        ? `${API_BASE}/${path}`
        : `${API_BASE}/storage/${path}`;
};

function BugImage({ src, alt, className }) {
    const [mode, setMode] = useState("direct");
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
            alt={alt || "Bug screenshot"}
            className={className || "bug-detail-image"}
            onError={() => {
                if (mode === "direct") setMode("blob");
                else setMode("failed");
            }}
        />
    );
}

function AdminDashboard() {
    const token = localStorage.getItem("token");

    const [activeSection, setActiveSection] = useState("dashboard");

    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [developers, setDevelopers] = useState([]);
    const [bugs, setBugs] = useState([]);

    const [selectedProject, setSelectedProject] = useState(null);
    const [selectedBug, setSelectedBug] = useState(null);

    const [loading, setLoading] = useState(true);
    const [bugsLoading, setBugsLoading] = useState(false);

    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showBugModal, setShowBugModal] = useState(false);

    const bugDetailsRequestId = useRef(0);

    const [editingProject, setEditingProject] = useState(null);
    const [editingUser, setEditingUser] = useState(null);

    const [search, setSearch] = useState("");

    const [projectStatusFilter, setProjectStatusFilter] = useState("all");
    const [bugStatusFilter, setBugStatusFilter] = useState("all");
    const [bugPriorityFilter, setBugPriorityFilter] = useState("all");
    const [userRoleFilter, setUserRoleFilter] = useState("all");

    const [toast, setToast] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);

    const [currentProjectPage, setCurrentProjectPage] = useState(1);
    const [projectPerPage] = useState(8);

    const [currentUserPage, setCurrentUserPage] = useState(1);
    const [userPerPage] = useState(8);

    const [currentBugPage, setCurrentBugPage] = useState(1);
    const [bugPerPage] = useState(10);

    const [testCases, setTestCases] = useState([]);
    const [selectedTestCase, setSelectedTestCase] = useState(null);
    const [testCasesLoading, setTestCasesLoading] = useState(false);
    const [showTestCaseModal, setShowTestCaseModal] = useState(false);
    const [editingTestCase, setEditingTestCase] = useState(null);
    const [testCaseSearch, setTestCaseSearch] = useState("");
    const [testCaseStatusFilter, setTestCaseStatusFilter] = useState("all");
    const [testCaseTypeFilter, setTestCaseTypeFilter] = useState("all");
    const [testCasePriorityFilter, setTestCasePriorityFilter] = useState("all");
    const [currentTestCasePage, setCurrentTestCasePage] = useState(1);
    const [testCasePerPage] = useState(8);

    const initialTestCaseForm = {
        title: "",
        test_case_code: "",
        module: "",
        type: "functional",
        priority: "medium",
        severity: "medium",
        status: "pending",
        preconditions: "",
        steps: "",
        expected_result: "",
        actual_result: "",
        description: "",
    };
    const [testCaseForm, setTestCaseForm] = useState(initialTestCaseForm);

    const [projectForm, setProjectForm] = useState({
        name: "",
        description: "",
        status: "active",
    });

    const [userForm, setUserForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "developer",
        department: "frontend",
    });

    // Sidebar collapsed state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    /*
    |--------------------------------------------------------------------------
    | API Headers
    |--------------------------------------------------------------------------
    */

    function headers() {
        return {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Toast
    |--------------------------------------------------------------------------
    */

    function showToast(message, type = "success") {
        setToast({ message, type });
        setTimeout(() => { setToast(null); }, 3500);
    }

    /*
    |--------------------------------------------------------------------------
    | Initial Data
    |--------------------------------------------------------------------------
    */

    useEffect(() => { loadAllData(); }, []);

    async function loadAllData() {
        try {
            setLoading(true);
            await Promise.all([loadProjects(), loadUsers(), loadDevelopers()]);
        } catch (error) {
            console.error(error);
            showToast("Unable to load admin data.", "error");
        } finally {
            setLoading(false);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Projects
    |--------------------------------------------------------------------------
    */

    async function loadProjects() {
        const response = await fetch(`${API_URL}/projects`, { headers: headers() });
        if (!response.ok) throw new Error("Failed to load projects");
        const data = await response.json();
        setProjects(data.projects || data.data || []);
    }

    async function saveProject(e) {
        e.preventDefault();
        try {
            const isEditing = Boolean(editingProject);
            const url = isEditing
                ? `${API_URL}/projects/${editingProject.id}`
                : `${API_URL}/create-project`;
            const method = isEditing ? "PUT" : "POST";
            const response = await fetch(url, {
                method,
                headers: headers(),
                body: JSON.stringify(projectForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to save project");
            await loadProjects();
            closeProjectModal();
            showToast(isEditing ? "Project updated successfully." : "Project created successfully.");
        } catch (error) {
            console.error(error);
            showToast(error.message || "Unable to save project.", "error");
        }
    }

    function openCreateProject() {
        setEditingProject(null);
        setProjectForm({ name: "", description: "", status: "active" });
        setShowProjectModal(true);
    }

    function openEditProject(project) {
        setEditingProject(project);
        setProjectForm({
            name: project.name || "",
            description: project.description || "",
            status: project.status || "active",
        });
        setShowProjectModal(true);
    }

    function closeProjectModal() {
        setShowProjectModal(false);
        setEditingProject(null);
    }

    async function updateProjectStatus(project, status) {
        try {
            const response = await fetch(`${API_URL}/projects/${project.id}/status`, {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify({ status }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to update project status");
            setProjects((previous) =>
                previous.map((item) => item.id === project.id ? { ...item, status } : item)
            );
            showToast(`Project status changed to ${formatStatus(status)}.`);
        } catch (error) {
            console.error(error);
            showToast(error.message || "Unable to update status.", "error");
        }
    }

    async function deleteProject(project) {
        try {
            const response = await fetch(`${API_URL}/projects/${project.id}`, {
                method: "DELETE",
                headers: headers(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to delete project");
            setProjects((previous) => previous.filter((item) => item.id !== project.id));
            setConfirmAction(null);
            showToast("Project deleted successfully.");
        } catch (error) {
            console.error(error);
            showToast(error.message || "Unable to delete project.", "error");
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Project Test Cases & Bugs
    |--------------------------------------------------------------------------
    */

    async function loadProjectTestCases(project) {
        try {
            setSelectedProject(project);
            setSelectedTestCase(null);
            setTestCasesLoading(true);
            setActiveSection("test-cases");
            setTestCaseSearch("");
            setTestCaseStatusFilter("all");
            setTestCaseTypeFilter("all");
            setTestCasePriorityFilter("all");
            setCurrentTestCasePage(1);
            const response = await fetch(`${API_URL}/projects/${project.id}/test-cases`, { headers: headers() });
            if (!response.ok) throw new Error("Failed to load test cases");
            const data = await response.json();
            setTestCases(data.test_cases || data.data || []);
        } catch (error) {
            console.error(error);
            showToast("Unable to load project test cases.", "error");
        } finally {
            setTestCasesLoading(false);
        }
    }

    async function viewTestCaseBugs(testCase) {
        try {
            setSelectedTestCase(testCase);
            setBugsLoading(true);
            setShowBugModal(false);
            setActiveSection("bugs");
            setCurrentBugPage(1);
            setSearch("");
            setBugStatusFilter("all");
            setBugPriorityFilter("all");
            const response = await fetch(`${API_URL}/test-cases/${testCase.id}/bugs`, { headers: headers() });
            if (!response.ok) throw new Error("Unable to load test case bugs");
            const data = await response.json();
            setBugs(data.bugs || data.data || []);
        } catch (error) {
            console.error(error);
            showToast("Unable to load test case bugs.", "error");
        } finally {
            setBugsLoading(false);
        }
    }

    function openCreateTestCase() {
        setEditingTestCase(null);
        setTestCaseForm({
            ...initialTestCaseForm,
            test_case_code: `TC-${String((testCases.length || 0) + 1).padStart(3, "0")}`,
        });
        setShowTestCaseModal(true);
    }

    function openEditTestCase(testCase) {
        setEditingTestCase(testCase);
        setTestCaseForm({
            title: testCase.title || "",
            test_case_code: testCase.test_case_code || "",
            module: testCase.module || "",
            type: testCase.type || "functional",
            priority: testCase.priority || "medium",
            severity: testCase.severity || "medium",
            status: testCase.status || "pending",
            preconditions: testCase.preconditions || "",
            steps: testCase.steps || "",
            expected_result: testCase.expected_result || "",
            actual_result: testCase.actual_result || "",
            description: testCase.description || "",
        });
        setShowTestCaseModal(true);
    }

    function closeTestCaseModal() {
        setShowTestCaseModal(false);
        setEditingTestCase(null);
        setTestCaseForm(initialTestCaseForm);
    }

    async function saveTestCase(e) {
        e.preventDefault();
        if (!selectedProject) return;

        try {
            const url = editingTestCase
                ? `${API_URL}/test-cases/${editingTestCase.id}`
                : `${API_URL}/projects/${selectedProject.id}/create-test-case`;
            const method = editingTestCase ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: headers(),
                body: JSON.stringify(testCaseForm),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to save test case");
            }

            showToast(editingTestCase ? "Test case updated successfully." : "Test case created successfully.", "success");
            closeTestCaseModal();
            if (selectedProject) {
                loadProjectTestCases(selectedProject);
            }
        } catch (error) {
            console.error(error);
            showToast(error.message || "Error saving test case.", "error");
        }
    }

    async function updateTestCaseStatus(testCase, newStatus) {
        try {
            const response = await fetch(`${API_URL}/test-cases/${testCase.id}`, {
                method: "PUT",
                headers: headers(),
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to update test case status");
            }
            showToast("Test case status updated.", "success");
            setTestCases((prev) =>
                prev.map((tc) => (tc.id === testCase.id ? { ...tc, status: newStatus } : tc))
            );
            if (selectedTestCase?.id === testCase.id) {
                setSelectedTestCase((prev) => ({ ...prev, status: newStatus }));
            }
        } catch (error) {
            showToast(error.message || "Failed to update test case status.", "error");
        }
    }

    async function deleteTestCase(testCase) {
        try {
            const response = await fetch(`${API_URL}/test-cases/${testCase.id}`, {
                method: "DELETE",
                headers: headers(),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to delete test case");
            }
            showToast("Test case deleted successfully.", "success");
            setConfirmAction(null);
            if (selectedProject) {
                loadProjectTestCases(selectedProject);
            }
        } catch (error) {
            showToast(error.message || "Error deleting test case.", "error");
        }
    }

    async function viewProjectBugs(project) {
        try {
            setSelectedProject(project);
            setSelectedTestCase(null);
            setBugsLoading(true);
            setShowBugModal(false);
            const response = await fetch(`${API_URL}/projects/${project.id}/bugs`, { headers: headers() });
            if (!response.ok) throw new Error("Unable to load project bugs");
            const data = await response.json();
            setBugs(data.bugs || data.data || []);
            setActiveSection("bugs");
            setCurrentBugPage(1);
        } catch (error) {
            console.error(error);
            showToast("Unable to load project bugs.", "error");
        } finally {
            setBugsLoading(false);
        }
    }

    async function viewBugDetails(bug) {
        const requestId = ++bugDetailsRequestId.current;
        setSelectedBug(bug);
        setShowBugModal(true);
        try {
            const response = await fetch(`${API_URL}/bugs/${bug.id}`, { headers: headers() });
            if (!response.ok) throw new Error("Unable to load bug details");
            const data = await response.json();
            if (requestId !== bugDetailsRequestId.current) return;
            setSelectedBug(data.bug || data.data || data);
        } catch (error) {
            if (requestId === bugDetailsRequestId.current) {
                showToast(error.message || "Unable to load bug details.", "error");
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Users
    |--------------------------------------------------------------------------
    */

    async function loadUsers() {
        const response = await fetch(`${API_URL}/admin/users`, { headers: headers() });
        if (!response.ok) throw new Error("Failed to load users");
        const data = await response.json();
        setUsers(data.users || data.data || []);
    }

    async function loadDevelopers() {
        const response = await fetch(`${API_URL}/admin/developers`, { headers: headers() });
        if (!response.ok) return;
        const data = await response.json();
        setDevelopers(data.developers || data.data || []);
    }

    async function saveUser(e) {
        e.preventDefault();
        try {
            const isEditing = Boolean(editingUser);
            if (isEditing) {
                showToast("User editing requires a PUT /admin/users/{id} endpoint.", "error");
                return;
            }
            const response = await fetch(`${API_URL}/admin/users`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({
                    ...userForm,
                    ...(userForm.role === "developer" ? {} : { department: undefined }),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to create user");
            await loadUsers();
            await loadDevelopers();
            closeUserModal();
            showToast("User created successfully.");
        } catch (error) {
            console.error(error);
            showToast(error.message || "Unable to create user.", "error");
        }
    }

    function openCreateUser() {
        setEditingUser(null);
        setUserForm({ name: "", email: "", password: "", role: "developer", department: "frontend" });
        setShowUserModal(true);
    }

    function openEditUser(user) {
        setEditingUser(user);
        setUserForm({
            name: user.name || "",
            email: user.email || "",
            password: "",
            role: user.role || "developer",
            department: user.department || "frontend",
        });
        setShowUserModal(true);
    }

    function closeUserModal() {
        setShowUserModal(false);
        setEditingUser(null);
    }

    async function deleteUser(user) {
        try {
            const response = await fetch(`${API_URL}/admin/users/${user.id}`, {
                method: "DELETE",
                headers: headers(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Unable to delete user");
            setUsers((previous) => previous.filter((item) => item.id !== user.id));
            setConfirmAction(null);
            showToast("User deleted successfully.");
        } catch (error) {
            console.error(error);
            showToast(error.message || "Unable to delete user.", "error");
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Logout
    |--------------------------------------------------------------------------
    */

    async function logout() {
        try {
            if (token) {
                await fetch(`${API_URL}/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                });
            }
        } catch (error) {
            console.error("Logout request failed:", error);
        } finally {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/";
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Filtering
    |--------------------------------------------------------------------------
    */

    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            const matchesSearch = `${project.name || ""} ${project.description || ""}`
                .toLowerCase()
                .includes(search.toLowerCase());
            const matchesStatus = projectStatusFilter === "all" || project.status === projectStatusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [projects, search, projectStatusFilter]);

    const filteredUsers = useMemo(() => {
        return users.filter((user) => {
            const matchesSearch = `${user.name || ""} ${user.email || ""}`
                .toLowerCase()
                .includes(search.toLowerCase());
            const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;
            return matchesSearch && matchesRole;
        });
    }, [users, search, userRoleFilter]);

    const filteredBugs = useMemo(() => {
        return bugs.filter((bug) => {
            const text = `${bug.title || ""} ${bug.description || ""} ${bug.id || ""}`.toLowerCase();
            const matchesSearch = text.includes(search.toLowerCase());
            const matchesStatus = bugStatusFilter === "all" || bug.status === bugStatusFilter;
            const matchesPriority = bugPriorityFilter === "all" || bug.priority === bugPriorityFilter;
            return matchesSearch && matchesStatus && matchesPriority;
        });
    }, [bugs, search, bugStatusFilter, bugPriorityFilter]);

    const filteredTestCases = useMemo(() => {
        return testCases.filter((tc) => {
            const text = `${tc.title || ""} ${tc.test_case_code || ""} ${tc.module || ""} ${tc.description || ""}`.toLowerCase();
            const matchesSearch = text.includes(testCaseSearch.toLowerCase());
            const matchesStatus = testCaseStatusFilter === "all" || tc.status === testCaseStatusFilter;
            const matchesType = testCaseTypeFilter === "all" || tc.type === testCaseTypeFilter;
            const matchesPriority = testCasePriorityFilter === "all" || tc.priority === testCasePriorityFilter;
            return matchesSearch && matchesStatus && matchesType && matchesPriority;
        });
    }, [testCases, testCaseSearch, testCaseStatusFilter, testCaseTypeFilter, testCasePriorityFilter]);

    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    */

    const projectPages = Math.ceil(filteredProjects.length / projectPerPage);
    const visibleProjects = filteredProjects.slice(
        (currentProjectPage - 1) * projectPerPage,
        currentProjectPage * projectPerPage
    );

    const userPages = Math.ceil(filteredUsers.length / userPerPage);
    const visibleUsers = filteredUsers.slice(
        (currentUserPage - 1) * userPerPage,
        currentUserPage * userPerPage
    );

    const testCasePages = Math.ceil(filteredTestCases.length / testCasePerPage);
    const visibleTestCases = filteredTestCases.slice(
        (currentTestCasePage - 1) * testCasePerPage,
        currentTestCasePage * testCasePerPage
    );

    const bugPages = Math.ceil(filteredBugs.length / bugPerPage);
    const visibleBugs = filteredBugs.slice(
        (currentBugPage - 1) * bugPerPage,
        currentBugPage * bugPerPage
    );

    /*
    |--------------------------------------------------------------------------
    | Dashboard Statistics
    |--------------------------------------------------------------------------
    */

    const activeProjects = projects.filter((p) => p.status === "active").length;
    const finishedProjects = projects.filter((p) => p.status === "finished").length;
    const archivedProjects = projects.filter((p) => p.status === "archived").length;
    const adminCount = users.filter((u) => u.role === "admin").length;
    const developerCount = users.filter((u) => u.role === "developer").length;
    const testerCount = users.filter((u) => u.role === "tester").length;

    const testCaseStats = useMemo(() => {
        return {
            total: testCases.length,
            passed: testCases.filter((tc) => tc.status === "passed").length,
            failed: testCases.filter((tc) => tc.status === "failed").length,
            blocked: testCases.filter((tc) => tc.status === "blocked").length,
            pending: testCases.filter((tc) => tc.status === "pending" || !tc.status).length,
            in_progress: testCases.filter((tc) => tc.status === "in_progress").length,
        };
    }, [testCases]);

    /*
    |--------------------------------------------------------------------------
    | Navigation
    |--------------------------------------------------------------------------
    */

    function changeSection(section) {
        setActiveSection(section);
        setSearch("");
        setTestCaseSearch("");
        if (section !== "bugs" && section !== "test-cases") {
            setSelectedProject(null);
            setSelectedTestCase(null);
        }
        if (section === "projects") loadProjects();
        if (section === "users") loadUsers();
    }

    /*
    |--------------------------------------------------------------------------
    | Breadcrumbs
    |--------------------------------------------------------------------------
    */

    function getBreadcrumbs() {
        const crumbs = [{ label: "Home", action: () => changeSection("dashboard") }];
        if (activeSection === "dashboard") {
            crumbs.push({ label: "Dashboard" });
        } else if (activeSection === "projects") {
            crumbs.push({ label: "Projects" });
        } else if (activeSection === "users") {
            crumbs.push({ label: "User Management" });
        } else if (activeSection === "test-cases") {
            crumbs.push({ label: "Projects", action: () => changeSection("projects") });
            if (selectedProject) {
                crumbs.push({ label: selectedProject.name });
            }
            crumbs.push({ label: "Test Cases" });
        } else if (activeSection === "bugs") {
            crumbs.push({ label: "Projects", action: () => changeSection("projects") });
            if (selectedProject) {
                crumbs.push({
                    label: selectedProject.name,
                    action: () => loadProjectTestCases(selectedProject),
                });
            }
            if (selectedTestCase) {
                crumbs.push({
                    label: selectedTestCase.test_case_code || selectedTestCase.title,
                    action: () => viewTestCaseBugs(selectedTestCase),
                });
            }
            crumbs.push({ label: "Bugs" });
        }
        return crumbs;
    }

    /*
    |--------------------------------------------------------------------------
    | Loading Screen — Skeleton
    |--------------------------------------------------------------------------
    */

    if (loading) {
        return (
            <div className="admin-dashboard">
                {/* Skeleton Sidebar */}
                <aside className="admin-sidebar">
                    <div className="admin-logo">
                        <div className="skel skel-logo-icon" />
                        <div>
                            <div className="skel skel-text-md" style={{ width: 90 }} />
                            <div className="skel skel-text-sm" style={{ width: 60, marginTop: 6 }} />
                        </div>
                    </div>
                    <nav className="admin-navigation">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="skel skel-nav-item" />
                        ))}
                    </nav>
                </aside>

                {/* Skeleton Content */}
                <main className="admin-content">
                    {/* Skeleton Topbar */}
                    <header className="admin-topbar">
                        <div>
                            <div className="skel skel-text-sm" style={{ width: 80 }} />
                            <div className="skel skel-text-lg" style={{ width: 160, marginTop: 8 }} />
                        </div>
                        <div className="admin-profile">
                            <div className="skel skel-avatar" />
                            <div>
                                <div className="skel skel-text-md" style={{ width: 90 }} />
                                <div className="skel skel-text-sm" style={{ width: 50, marginTop: 5 }} />
                            </div>
                        </div>
                    </header>

                    <section className="section-content">
                        {/* Skeleton Stat Cards */}
                        <div className="statistics-grid" style={{ marginBottom: 28 }}>
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="stat-card skeleton-card">
                                    <div className="skel skel-stat-icon" />
                                    <div>
                                        <div className="skel skel-text-sm" style={{ width: 70 }} />
                                        <div className="skel skel-text-xl" style={{ width: 40, marginTop: 8 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Skeleton panels */}
                        <div className="dashboard-columns">
                            {[1, 2].map((i) => (
                                <div key={i} className="dashboard-panel">
                                    <div className="panel-heading">
                                        <div>
                                            <div className="skel skel-text-md" style={{ width: 120 }} />
                                            <div className="skel skel-text-sm" style={{ width: 80, marginTop: 6 }} />
                                        </div>
                                    </div>
                                    {[1, 2, 3, 4].map((j) => (
                                        <div key={j} className="mini-project">
                                            <div className="skel skel-mini-icon" />
                                            <div style={{ flex: 1 }}>
                                                <div className="skel skel-text-md" style={{ width: "70%" }} />
                                                <div className="skel skel-text-sm" style={{ width: "50%", marginTop: 6 }} />
                                            </div>
                                            <div className="skel skel-badge" />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>
                </main>
            </div>
        );
    }

    const breadcrumbs = getBreadcrumbs();

    return (
        <div className={`admin-dashboard ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>

            {/* =====================================================
                SIDEBAR
            ===================================================== */}

            <aside className="admin-sidebar">
                <div className="admin-logo">
                    <div className="logo-mark">BT</div>
                    <div className="logo-text">
                        <strong>Bug Tracker</strong>
                        <span>Admin Panel</span>
                    </div>
                </div>

                <button
                    className="sidebar-toggle-btn"
                    onClick={() => setSidebarCollapsed((c) => !c)}
                    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {sidebarCollapsed ? "›" : "‹"}
                </button>

                <nav className="admin-navigation">
                    <div className="nav-section-label">Overview</div>

                    <button
                        className={activeSection === "dashboard" ? "nav-item active" : "nav-item"}
                        onClick={() => changeSection("dashboard")}
                        title="Dashboard"
                    >
                        <span className="nav-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect width="7" height="9" x="3" y="3" rx="1" />
                                <rect width="7" height="5" x="14" y="3" rx="1" />
                                <rect width="7" height="9" x="14" y="12" rx="1" />
                                <rect width="7" height="5" x="3" y="16" rx="1" />
                            </svg>
                        </span>
                        <span className="nav-label">Dashboard</span>
                    </button>

                    <div className="nav-section-label">Manage</div>

                    <button
                        className={activeSection === "projects" ? "nav-item active" : "nav-item"}
                        onClick={() => changeSection("projects")}
                        title="Projects"
                    >
                        <span className="nav-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3h7v7H3z" />
                                <path d="M14 3h7v7h-7z" />
                                <path d="M14 14h7v7h-7z" />
                                <path d="M3 14h7v7H3z" />
                            </svg>
                        </span>
                        <span className="nav-label">Projects</span>
                        {projects.length > 0 && <b className="nav-count">{projects.length}</b>}
                    </button>

                    <button
                        className={activeSection === "users" ? "nav-item active" : "nav-item"}
                        onClick={() => changeSection("users")}
                        title="Users"
                    >
                        <span className="nav-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </span>
                        <span className="nav-label">Users</span>
                        {users.length > 0 && <b className="nav-count">{users.length}</b>}
                    </button>
                </nav>

                <div className="sidebar-bottom">
                    <div className="sidebar-user-pill">
                        <div className="sidebar-avatar">A</div>
                        <div className="sidebar-user-info">
                            <strong>Administrator</strong>
                            <span>Admin</span>
                        </div>
                    </div>
                    <button className="logout-nav" onClick={logout} title="Logout">
                        <span className="nav-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" x2="9" y1="12" y2="12" />
                            </svg>
                        </span>
                        <span className="nav-label">Logout</span>
                    </button>
                </div>
            </aside>


            {/* =====================================================
                CONTENT
            ===================================================== */}

            <main className="admin-content">

                <header className="admin-topbar">
                    {/* Breadcrumbs */}
                    <div className="topbar-left">
                        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
                            {breadcrumbs.map((crumb, index) => (
                                <span key={index} className="breadcrumb-item">
                                    {index < breadcrumbs.length - 1 ? (
                                        <>
                                            <button
                                                className="breadcrumb-link"
                                                onClick={crumb.action}
                                            >
                                                {crumb.label}
                                            </button>
                                            <span className="breadcrumb-sep">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="m9 18 6-6-6-6" />
                                                </svg>
                                            </span>
                                        </>
                                    ) : (
                                        <span className="breadcrumb-current">{crumb.label}</span>
                                    )}
                                </span>
                            ))}
                        </nav>
                        <h1 className="topbar-title">{getPageTitle(activeSection)}</h1>
                    </div>

                    <div className="admin-profile">
                        <div className="admin-avatar" title="Administrator">A</div>
                        <div className="profile-text">
                            <strong>Administrator</strong>
                            <span>Admin</span>
                        </div>
                    </div>
                </header>


                {/* =================================================
                    DASHBOARD
                ================================================= */}

                {activeSection === "dashboard" && (
                    <section className="section-content animate-in">

                        {/* Welcome Banner */}
                        <div className="welcome-card">
                            <div className="welcome-content">
                                <div className="welcome-eyebrow">Overview</div>
                                <h2>Welcome back, Admin 👋</h2>
                                <p>Here&apos;s what&apos;s happening across your projects today.</p>
                            </div>
                            <div className="welcome-actions">
                                <button className="primary-button" onClick={openCreateProject}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                                    </svg>
                                    New Project
                                </button>
                            </div>
                        </div>

                        <div className="statistics-grid">
                            <StatCard
                                title="Total Projects"
                                value={projects.length}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>}
                                color="indigo"
                                trend={activeProjects > 0 ? `${activeProjects} active` : ""}
                            />
                            <StatCard
                                title="Active"
                                value={activeProjects}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>}
                                color="emerald"
                            />
                            <StatCard
                                title="Finished"
                                value={finishedProjects}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                                color="blue"
                            />
                            <StatCard
                                title="Total Users"
                                value={users.length}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                                color="violet"
                                trend={`${adminCount} admins`}
                            />
                            <StatCard
                                title="Developers"
                                value={developerCount}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
                                color="amber"
                            />
                            <StatCard
                                title="Testers"
                                value={testerCount}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5a2 2 0 0 0-2 2v4m4-6h10a2 2 0 0 1 2 2v4M9 14h10"/></svg>}
                                color="rose"
                            />
                        </div>


                        <div className="dashboard-columns">
                            <div className="dashboard-panel">
                                <div className="panel-heading">
                                    <div>
                                        <h2>Recent Projects</h2>
                                        <p>Latest projects in the system</p>
                                    </div>
                                    <button className="panel-link-btn" onClick={() => changeSection("projects")}>
                                        View All
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                    </button>
                                </div>

                                <div className="mini-project-list">
                                    {projects.slice(0, 5).map((project) => (
                                        <div
                                            className="mini-project"
                                            key={project.id}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => loadProjectTestCases(project)}
                                            title="Click to view test cases"
                                        >
                                            <div className="mini-project-icon">
                                                {project.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="mini-project-info">
                                                <strong>{project.name}</strong>
                                                <span>{project.description || "No description"}</span>
                                            </div>
                                            <StatusBadge status={project.status} />
                                        </div>
                                    ))}
                                    {projects.length === 0 && <EmptyState text="No projects created yet." icon="folder" />}
                                </div>
                            </div>

                            <div className="dashboard-panel">
                                <div className="panel-heading">
                                    <div>
                                        <h2>Team Overview</h2>
                                        <p>Users by role</p>
                                    </div>
                                    <button className="panel-link-btn" onClick={() => changeSection("users")}>
                                        Manage
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                    </button>
                                </div>

                                <div className="role-overview">
                                    <RoleBar label="Developers" value={developerCount} total={users.length} color="indigo" />
                                    <RoleBar label="Testers" value={testerCount} total={users.length} color="violet" />
                                    <RoleBar label="Admins" value={adminCount} total={users.length} color="rose" />
                                </div>

                                {/* Quick Stats */}
                                <div className="user-quick-stats">
                                    <div className="user-quick-stat">
                                        <strong>{users.length}</strong>
                                        <span>Total Members</span>
                                    </div>
                                    <div className="user-quick-stat">
                                        <strong>{developerCount}</strong>
                                        <span>Developers</span>
                                    </div>
                                    <div className="user-quick-stat">
                                        <strong>{testerCount}</strong>
                                        <span>QA Testers</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </section>
                )}


                {/* =================================================
                    PROJECTS
                ================================================= */}

                {activeSection === "projects" && (
                    <section className="section-content animate-in">

                        <div className="section-toolbar">
                            <div className="search-wrapper">
                                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search projects..."
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setCurrentProjectPage(1); }}
                                />
                            </div>

                            <div className="toolbar-actions">
                                <select
                                    value={projectStatusFilter}
                                    onChange={(e) => { setProjectStatusFilter(e.target.value); setCurrentProjectPage(1); }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="onhold">On Hold</option>
                                    <option value="finished">Finished</option>
                                    <option value="archived">Archived</option>
                                </select>

                                <button className="primary-button" onClick={openCreateProject}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                    New Project
                                </button>
                            </div>
                        </div>


                        <div className="data-card">
                            <div className="table-header">
                                <div>
                                    <h2>Projects</h2>
                                    <span className="table-count">{filteredProjects.length} projects</span>
                                </div>
                            </div>

                            <div className="table-scroll">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>PROJECT</th>
                                            <th>STATUS</th>
                                            <th>CREATED</th>
                                            <th>ACTIONS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleProjects.map((project) => (
                                            <tr key={project.id}>
                                                <td>
                                                    <div
                                                        className="table-project"
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => loadProjectTestCases(project)}
                                                        title="Click to view test cases"
                                                    >
                                                        <div className="table-project-icon">
                                                            {project.name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <strong>{project.name}</strong>
                                                            <span>{project.description || "No description"}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <select
                                                        className={`status-select ${project.status}`}
                                                        value={project.status || "active"}
                                                        onChange={(e) => updateProjectStatus(project, e.target.value)}
                                                    >
                                                        <option value="active">Active</option>
                                                        <option value="onhold">On Hold</option>
                                                        <option value="finished">Finished</option>
                                                        <option value="archived">Archived</option>
                                                    </select>
                                                </td>
                                                <td className="td-muted">{formatDate(project.created_at)}</td>
                                                <td>
                                                    <div className="action-buttons">
                                                        <button className="action-view" onClick={() => loadProjectTestCases(project)}>
                                                            Test Cases
                                                        </button>
                                                        <button className="action-edit" onClick={() => openEditProject(project)}>
                                                            Edit
                                                        </button>
                                                        <button className="action-delete" onClick={() => setConfirmAction({ type: "project", item: project })}>
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {visibleProjects.length === 0 && <EmptyState text="No projects found." icon="folder" />}

                            <Pagination
                                current={currentProjectPage}
                                total={projectPages}
                                onPrevious={() => setCurrentProjectPage((p) => Math.max(1, p - 1))}
                                onNext={() => setCurrentProjectPage((p) => Math.min(projectPages, p + 1))}
                            />
                        </div>

                    </section>
                )}


                {/* =================================================
                    TEST CASES
                ================================================= */}

                {activeSection === "test-cases" && (
                    <section className="section-content animate-in">

                        {selectedProject && (
                            <div className="bugs-context-bar">
                                <div className="bugs-context-info">
                                    <div className="bugs-context-icon">
                                        {selectedProject.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <span>Project</span>
                                        <strong>{selectedProject.name} — Test Cases</strong>
                                    </div>
                                </div>
                                <div className="context-bar-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                    <button className="ghost-button" onClick={() => changeSection("projects")}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m15 18-6-6 6-6"/>
                                        </svg>
                                        Back to Projects
                                    </button>
                                    <button className="primary-button" onClick={openCreateTestCase}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                                        </svg>
                                        New Test Case
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Test Case Stat Strip */}
                        <div className="statistics-grid testcases-stats-grid">
                            <StatCard
                                title="Total Test Cases"
                                value={testCaseStats.total}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>}
                                color="indigo"
                            />
                            <StatCard
                                title="Passed"
                                value={testCaseStats.passed}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                color="emerald"
                            />
                            <StatCard
                                title="Failed"
                                value={testCaseStats.failed}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
                                color="rose"
                            />
                            <StatCard
                                title="Blocked"
                                value={testCaseStats.blocked}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>}
                                color="amber"
                            />
                            <StatCard
                                title="Pending"
                                value={testCaseStats.pending}
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>}
                                color="violet"
                            />
                        </div>

                        <div className="section-toolbar">
                            <div className="search-wrapper">
                                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search test cases..."
                                    value={testCaseSearch}
                                    onChange={(e) => { setTestCaseSearch(e.target.value); setCurrentTestCasePage(1); }}
                                />
                            </div>

                            <div className="toolbar-actions">
                                <select
                                    value={testCaseStatusFilter}
                                    onChange={(e) => { setTestCaseStatusFilter(e.target.value); setCurrentTestCasePage(1); }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="passed">Passed</option>
                                    <option value="failed">Failed</option>
                                    <option value="blocked">Blocked</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="pending">Pending</option>
                                </select>

                                <select
                                    value={testCaseTypeFilter}
                                    onChange={(e) => { setTestCaseTypeFilter(e.target.value); setCurrentTestCasePage(1); }}
                                >
                                    <option value="all">All Types</option>
                                    <option value="functional">Functional</option>
                                    <option value="ui">UI</option>
                                    <option value="regression">Regression</option>
                                    <option value="smoke">Smoke</option>
                                    <option value="integration">Integration</option>
                                    <option value="performance">Performance</option>
                                    <option value="security">Security</option>
                                </select>

                                <select
                                    value={testCasePriorityFilter}
                                    onChange={(e) => { setTestCasePriorityFilter(e.target.value); setCurrentTestCasePage(1); }}
                                >
                                    <option value="all">All Priority</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>

                        <div className="data-card">
                            <div className="table-header">
                                <div>
                                    <h2>Test Cases</h2>
                                    <span className="table-count">{filteredTestCases.length} test cases</span>
                                </div>
                            </div>

                            {testCasesLoading ? (
                                <div className="bug-skeleton-wrapper">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <div key={i} className="bug-skeleton-row">
                                            <div className="skel skel-bug-id" />
                                            <div style={{ flex: 2 }}>
                                                <div className="skel skel-text-md" style={{ width: "70%", marginBottom: 6 }} />
                                                <div className="skel skel-text-sm" style={{ width: "40%" }} />
                                            </div>
                                            <div className="skel skel-badge" />
                                            <div className="skel skel-badge" />
                                            <div className="skel skel-btn" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="table-scroll">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>CODE</th>
                                                <th>TITLE</th>
                                                <th>MODULE</th>
                                                <th>TYPE</th>
                                                <th>PRIORITY</th>
                                                <th>STATUS</th>
                                                <th>BUGS</th>
                                                <th>ACTIONS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleTestCases.map((tc) => (
                                                <tr
                                                    key={tc.id}
                                                    className="clickable-testcase-row"
                                                    onClick={() => viewTestCaseBugs(tc)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            viewTestCaseBugs(tc);
                                                        }
                                                    }}
                                                    tabIndex={0}
                                                    role="button"
                                                    aria-label={`View bugs for test case ${tc.test_case_code || tc.id}: ${tc.title || "Untitled test case"}`}
                                                >
                                                    <td>
                                                        <span className="tc-code-pill" onClick={() => viewTestCaseBugs(tc)} style={{ cursor: "pointer" }}>
                                                            {tc.test_case_code || `TC-${tc.id}`}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div
                                                            className="table-project"
                                                            style={{ cursor: "pointer" }}
                                                            onClick={() => viewTestCaseBugs(tc)}
                                                            title="Click to view bugs in this test case"
                                                        >
                                                            <div>
                                                                <strong>{tc.title}</strong>
                                                                <span>{tc.description || tc.expected_result || "No description"}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="tc-module-tag">{tc.module || "General"}</span>
                                                    </td>
                                                    <td>
                                                        <span className="tc-type-badge">{tc.type || "functional"}</span>
                                                    </td>
                                                    <td>
                                                        <PriorityBadge priority={tc.priority || "medium"} />
                                                    </td>
                                                    <td>
                                                        <select
                                                            className={`status-select ${tc.status || "pending"}`}
                                                            value={tc.status || "pending"}
                                                            onClick={(event) => event.stopPropagation()}
                                                            onKeyDown={(event) => event.stopPropagation()}
                                                            onChange={(e) => updateTestCaseStatus(tc, e.target.value)}
                                                        >
                                                            <option value="pending">Pending</option>
                                                            <option value="in_progress">In Progress</option>
                                                            <option value="passed">Passed</option>
                                                            <option value="failed">Failed</option>
                                                            <option value="blocked">Blocked</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <button
                                                            className="tc-bugs-count-btn"
                                                            onClick={() => viewTestCaseBugs(tc)}
                                                            title="View bugs for this test case"
                                                        >
                                                            <span className="tc-bugs-num">{tc.bugs_count || 0}</span>
                                                            bugs
                                                        </button>
                                                    </td>
                                                    <td>
                                                        <div className="action-buttons">
                                                            <button
                                                                type="button"
                                                                className="action-view icon-action"
                                                                title="View bugs for this test case"
                                                                aria-label="View bugs for this test case"
                                                                onClick={(event) => { event.stopPropagation(); viewTestCaseBugs(tc); }}
                                                            >
                                                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-edit icon-action"
                                                                title="Edit test case"
                                                                aria-label="Edit test case"
                                                                onClick={(event) => { event.stopPropagation(); openEditTestCase(tc); }}
                                                            >
                                                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-delete icon-action"
                                                                title="Delete test case"
                                                                aria-label="Delete test case"
                                                                onClick={(event) => { event.stopPropagation(); setConfirmAction({ type: "testCase", item: tc }); }}
                                                            >
                                                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!testCasesLoading && visibleTestCases.length === 0 && (
                                <EmptyState text="No test cases found for this project." icon="folder" />
                            )}

                            <Pagination
                                current={currentTestCasePage}
                                total={testCasePages}
                                onPrevious={() => setCurrentTestCasePage((p) => Math.max(1, p - 1))}
                                onNext={() => setCurrentTestCasePage((p) => Math.min(testCasePages, p + 1))}
                            />
                        </div>

                    </section>
                )}


                {/* =================================================
                    USERS
                ================================================= */}

                {activeSection === "users" && (
                    <section className="section-content animate-in">

                        <div className="section-toolbar">
                            <div className="search-wrapper">
                                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setCurrentUserPage(1); }}
                                />
                            </div>

                            <div className="toolbar-actions">
                                <select
                                    value={userRoleFilter}
                                    onChange={(e) => { setUserRoleFilter(e.target.value); setCurrentUserPage(1); }}
                                >
                                    <option value="all">All Roles</option>
                                    <option value="admin">Admin</option>
                                    <option value="developer">Developer</option>
                                    <option value="tester">Tester</option>
                                </select>

                                <button className="primary-button" onClick={openCreateUser}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                    Create User
                                </button>
                            </div>
                        </div>


                        <div className="data-card">
                            <div className="table-header">
                                <div>
                                    <h2>Users</h2>
                                    <span className="table-count">{filteredUsers.length} users</span>
                                </div>
                            </div>

                            <div className="table-scroll">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>USER</th>
                                            <th>EMAIL</th>
                                            <th>ROLE</th>
                                            <th>CREATED</th>
                                            <th>ACTIONS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td>
                                                    <div className="table-user">
                                                        <div className="user-avatar">
                                                            {user.name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <strong>{user.name}</strong>
                                                    </div>
                                                </td>
                                                <td className="td-muted">{user.email}</td>
                                                <td>
                                                    <span className={`role-badge ${user.role}`}>
                                                        {formatStatus(user.role)}
                                                    </span>
                                                </td>
                                                <td className="td-muted">{formatDate(user.created_at)}</td>
                                                <td>
                                                    <div className="action-buttons">
                                                        <button className="action-edit" onClick={() => openEditUser(user)}>Edit</button>
                                                        <button className="action-delete" onClick={() => setConfirmAction({ type: "user", item: user })}>Delete</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {visibleUsers.length === 0 && <EmptyState text="No users found." icon="users" />}

                            <Pagination
                                current={currentUserPage}
                                total={userPages}
                                onPrevious={() => setCurrentUserPage((p) => Math.max(1, p - 1))}
                                onNext={() => setCurrentUserPage((p) => Math.min(userPages, p + 1))}
                            />
                        </div>

                    </section>
                )}


                {/* =================================================
                    BUGS
                ================================================= */}

                {activeSection === "bugs" && (
                    <section className="section-content animate-in">

                        {/* Inline Banner with Test Case & Project Context */}
                        {selectedTestCase ? (
                            <div className="tc-bug-header-card">
                                <div className="bugs-context-bar">
                                    <div className="bugs-context-info">
                                        <div className="bugs-context-icon">
                                            {selectedTestCase.test_case_code ? selectedTestCase.test_case_code.slice(0, 3) : "TC"}
                                        </div>
                                        <div>
                                            <span>Test Case • {selectedProject?.name}</span>
                                            <strong>{selectedTestCase.test_case_code ? `${selectedTestCase.test_case_code}: ` : ""}{selectedTestCase.title}</strong>
                                        </div>
                                    </div>
                                    <div className="context-bar-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                        <button
                                            className="ghost-button"
                                            onClick={() => selectedProject ? loadProjectTestCases(selectedProject) : changeSection("projects")}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="m15 18-6-6 6-6"/>
                                            </svg>
                                            Back to Test Cases
                                        </button>
                                    </div>
                                </div>

                                <div className="tc-detail-strip">
                                    <div className="tc-detail-item">
                                        <label>Module</label>
                                        <span>{selectedTestCase.module || "General"}</span>
                                    </div>
                                    <div className="tc-detail-item">
                                        <label>Type</label>
                                        <span className="tc-type-badge">{selectedTestCase.type || "functional"}</span>
                                    </div>
                                    <div className="tc-detail-item">
                                        <label>Priority</label>
                                        <PriorityBadge priority={selectedTestCase.priority || "medium"} />
                                    </div>
                                    <div className="tc-detail-item">
                                        <label>Status</label>
                                        <StatusBadge status={selectedTestCase.status || "pending"} />
                                    </div>
                                    {selectedTestCase.steps && (
                                        <div className="tc-detail-item full-width">
                                            <label>Steps</label>
                                            <p className="tc-steps-text">{selectedTestCase.steps}</p>
                                        </div>
                                    )}
                                    {selectedTestCase.expected_result && (
                                        <div className="tc-detail-item full-width">
                                            <label>Expected Result</label>
                                            <p className="tc-steps-text">{selectedTestCase.expected_result}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : selectedProject ? (
                            <div className="bugs-context-bar">
                                <div className="bugs-context-info">
                                    <div className="bugs-context-icon">
                                        {selectedProject.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <span>Project</span>
                                        <strong>{selectedProject.name}</strong>
                                    </div>
                                </div>
                                <button className="ghost-button" onClick={() => loadProjectTestCases(selectedProject)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m15 18-6-6 6-6"/>
                                    </svg>
                                    Back to Test Cases
                                </button>
                            </div>
                        ) : null}

                        <div className="section-toolbar">
                            <div className="search-wrapper">
                                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search bugs..."
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setCurrentBugPage(1); }}
                                />
                            </div>

                            <div className="toolbar-actions">
                                <select
                                    value={bugStatusFilter}
                                    onChange={(e) => { setBugStatusFilter(e.target.value); setCurrentBugPage(1); }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="resolved">Resolved</option>
                                </select>

                                <select
                                    value={bugPriorityFilter}
                                    onChange={(e) => { setBugPriorityFilter(e.target.value); setCurrentBugPage(1); }}
                                >
                                    <option value="all">All Priority</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                        </div>


                        <div className="data-card">
                            {bugsLoading ? (
                                /* Bug Skeleton Loading */
                                <div className="bug-skeleton-wrapper">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <div key={i} className="bug-skeleton-row">
                                            <div className="skel skel-bug-id" />
                                            <div style={{ flex: 2 }}>
                                                <div className="skel skel-text-md" style={{ width: "80%", marginBottom: 6 }} />
                                                <div className="skel skel-text-sm" style={{ width: "55%" }} />
                                            </div>
                                            <div className="skel skel-badge" />
                                            <div className="skel skel-badge" />
                                            <div className="skel skel-badge" />
                                            <div className="skel skel-btn" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="table-scroll">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>BUG</th>
                                                <th>PROJECT</th>
                                                <th>TEAM</th>
                                                <th>PRIORITY</th>
                                                <th>STATUS</th>
                                                <th>ASSIGNED TO</th>
                                                <th>ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleBugs.map((bug) => (
                                                <tr
                                                    key={bug.id}
                                                    className="clickable-bug-row"
                                                    onClick={() => viewBugDetails(bug)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            viewBugDetails(bug);
                                                        }
                                                    }}
                                                    tabIndex={0}
                                                    role="button"
                                                    aria-label={`View bug ${bug.id}: ${bug.title || bug.name || "Untitled Bug"}`}
                                                >
                                                    <td>
                                                        <div className="bug-table-cell">
                                                            <span className="bug-number">#{bug.id}</span>
                                                            <div>
                                                                <strong>{bug.title || bug.name || "Untitled Bug"}</strong>
                                                                <span>{bug.description || "No description"}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="td-muted">
                                                        {bug.project?.name || selectedProject?.name || "—"}
                                                    </td>
                                                    <td>
                                                        <span className="team-badge">
                                                            {formatAssignedTeam(getAssignedTeam(bug, developers))}
                                                        </span>
                                                    </td>
                                                    <td><PriorityBadge priority={bug.priority} /></td>
                                                    <td><StatusBadge status={bug.status} /></td>
                                                    <td className="td-muted">
                                                        {bug.assigned_to || bug.developer?.name || "Unassigned"}
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="action-view icon-action"
                                                            title="View bug details"
                                                            aria-label={`View bug ${bug.id}`}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                viewBugDetails(bug);
                                                            }}
                                                        >
                                                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!bugsLoading && visibleBugs.length === 0 && <EmptyState text="No bugs found." icon="bug" />}

                            <Pagination
                                current={currentBugPage}
                                total={bugPages}
                                onPrevious={() => setCurrentBugPage((p) => Math.max(1, p - 1))}
                                onNext={() => setCurrentBugPage((p) => Math.min(bugPages, p + 1))}
                            />
                        </div>

                    </section>
                )}

            </main>


            {/* =====================================================
                PROJECT MODAL
            ===================================================== */}

            {showProjectModal && (
                <Modal
                    title={editingProject ? "Edit Project" : "Create Project"}
                    onClose={closeProjectModal}
                >
                    <form className="modal-form" onSubmit={saveProject}>
                        <FormField label="Project Name" required>
                            <input
                                type="text"
                                value={projectForm.name}
                                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                                placeholder="Enter project name"
                                required
                            />
                        </FormField>

                        <FormField label="Description">
                            <textarea
                                value={projectForm.description}
                                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                                placeholder="Describe the project..."
                                rows="4"
                            />
                        </FormField>

                        <FormField label="Status">
                            <select
                                value={projectForm.status}
                                onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}
                            >
                                <option value="active">Active</option>
                                <option value="onhold">On Hold</option>
                                <option value="finished">Finished</option>
                                <option value="archived">Archived</option>
                            </select>
                        </FormField>

                        <div className="modal-actions">
                            <button type="button" className="secondary-button" onClick={closeProjectModal}>Cancel</button>
                            <button type="submit" className="primary-button">
                                {editingProject ? "Save Changes" : "Create Project"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}


            {/* =====================================================
                USER MODAL
            ===================================================== */}

            {showUserModal && (
                <Modal
                    title={editingUser ? "Edit User" : "Create User"}
                    onClose={closeUserModal}
                >
                    <form className="modal-form" onSubmit={saveUser}>
                        <FormField label="Full Name" required>
                            <input
                                type="text"
                                value={userForm.name}
                                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                                placeholder="Enter full name"
                                required
                            />
                        </FormField>

                        <FormField label="Email" required>
                            <input
                                type="email"
                                value={userForm.email}
                                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                placeholder="Enter email"
                                required
                            />
                        </FormField>

                        {!editingUser && (
                            <FormField label="Password" required>
                                <input
                                    type="password"
                                    value={userForm.password}
                                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                    placeholder="Enter password"
                                    required
                                />
                            </FormField>
                        )}

                        <FormField label="Role" required>
                            <select
                                value={userForm.role}
                                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                            >
                                <option value="admin">Admin</option>
                                <option value="developer">Developer</option>
                                <option value="tester">Tester</option>
                            </select>
                        </FormField>

                        {userForm.role === "developer" && (
                            <FormField label="Department" required>
                                <select
                                    value={userForm.department}
                                    onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                                    required
                                >
                                    <option value="frontend">Frontend</option>
                                    <option value="backend">Backend</option>
                                </select>
                            </FormField>
                        )}

                        <div className="modal-actions">
                            <button type="button" className="secondary-button" onClick={closeUserModal}>Cancel</button>
                            <button type="submit" className="primary-button">
                                {editingUser ? "Save Changes" : "Create User"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}


            {/* =====================================================
                BUG MODAL
            ===================================================== */}

            {showBugModal && selectedBug && (
                <Modal
                    title={`Bug #${selectedBug.id}`}
                    onClose={() => {
                        bugDetailsRequestId.current++;
                        setShowBugModal(false);
                    }}
                >
                    <div className="bug-modal-content">
                        <h2>{selectedBug.title || selectedBug.name || "Bug Details"}</h2>

                        <div className="bug-meta-grid">
                            <div>
                                <span>Project</span>
                                <strong>{selectedBug.project?.name || selectedProject?.name || "—"}</strong>
                            </div>
                            <div>
                                <span>Status</span>
                                <StatusBadge status={selectedBug.status} />
                            </div>
                            <div>
                                <span>Priority</span>
                                <PriorityBadge priority={selectedBug.priority} />
                            </div>
                            <div>
                                <span>Assigned To</span>
                                <strong>{selectedBug.assigned_to || selectedBug.developer?.name || "Unassigned"}</strong>
                            </div>
                            <div>
                                <span>Assigned Team</span>
                                <strong>{formatAssignedTeam(getAssignedTeam(selectedBug, developers))}</strong>
                            </div>
                        </div>

                        <div className="bug-description-full">
                            <label>Description</label>
                            <p>{selectedBug.description || "No description available."}</p>
                        </div>

                        {selectedBug.bug_url && (
                            <a
                                href={selectedBug.bug_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bug-external-link"
                            >
                                Open Bug URL ↗
                            </a>
                        )}

                        {getImageUrl(selectedBug) && (
                            <div className="bug-image-container">
                                <label>Screenshot</label>
                                <BugImage src={getImageUrl(selectedBug)} alt="Bug screenshot" />
                            </div>
                        )}
                    </div>
                </Modal>
            )}


            {/* =====================================================
                TEST CASE MODAL
            ===================================================== */}

            {showTestCaseModal && (
                <Modal
                    title={editingTestCase ? `Edit Test Case (${editingTestCase.test_case_code || 'TC'})` : "Create New Test Case"}
                    onClose={closeTestCaseModal}
                >
                    <form className="modal-form" onSubmit={saveTestCase}>
                        <div className="form-row">
                            <FormField label="Test Case Code">
                                <input
                                    type="text"
                                    value={testCaseForm.test_case_code}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, test_case_code: e.target.value })}
                                    placeholder="e.g. TC-001"
                                />
                            </FormField>

                            <FormField label="Module / Feature">
                                <input
                                    type="text"
                                    value={testCaseForm.module}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, module: e.target.value })}
                                    placeholder="e.g. Auth, Billing, Dashboard"
                                />
                            </FormField>
                        </div>

                        <FormField label="Title" required>
                            <input
                                type="text"
                                value={testCaseForm.title}
                                onChange={(e) => setTestCaseForm({ ...testCaseForm, title: e.target.value })}
                                placeholder="Enter descriptive test case title"
                                required
                            />
                        </FormField>

                        <div className="form-row">
                            <FormField label="Type" required>
                                <select
                                    value={testCaseForm.type}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, type: e.target.value })}
                                >
                                    <option value="functional">Functional</option>
                                    <option value="ui">UI / UX</option>
                                    <option value="regression">Regression</option>
                                    <option value="smoke">Smoke</option>
                                    <option value="integration">Integration</option>
                                    <option value="performance">Performance</option>
                                    <option value="security">Security</option>
                                </select>
                            </FormField>

                            <FormField label="Priority" required>
                                <select
                                    value={testCaseForm.priority}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, priority: e.target.value })}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </FormField>

                            <FormField label="Severity" required>
                                <select
                                    value={testCaseForm.severity}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, severity: e.target.value })}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </FormField>

                            <FormField label="Status" required>
                                <select
                                    value={testCaseForm.status}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, status: e.target.value })}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="passed">Passed</option>
                                    <option value="failed">Failed</option>
                                    <option value="blocked">Blocked</option>
                                </select>
                            </FormField>
                        </div>

                        <FormField label="Preconditions">
                            <textarea
                                rows="2"
                                value={testCaseForm.preconditions}
                                onChange={(e) => setTestCaseForm({ ...testCaseForm, preconditions: e.target.value })}
                                placeholder="e.g. User must be logged in as an Administrator"
                            />
                        </FormField>

                        <FormField label="Test Steps">
                            <textarea
                                rows="3"
                                value={testCaseForm.steps}
                                onChange={(e) => setTestCaseForm({ ...testCaseForm, steps: e.target.value })}
                                placeholder="1. Go to settings&#10;2. Click update profile&#10;3. Submit form"
                            />
                        </FormField>

                        <div className="form-row">
                            <FormField label="Expected Result">
                                <textarea
                                    rows="2"
                                    value={testCaseForm.expected_result}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, expected_result: e.target.value })}
                                    placeholder="What should happen"
                                />
                            </FormField>

                            <FormField label="Actual Result">
                                <textarea
                                    rows="2"
                                    value={testCaseForm.actual_result}
                                    onChange={(e) => setTestCaseForm({ ...testCaseForm, actual_result: e.target.value })}
                                    placeholder="What actually happened (if executed)"
                                />
                            </FormField>
                        </div>

                        <FormField label="Description / Notes">
                            <textarea
                                rows="2"
                                value={testCaseForm.description}
                                onChange={(e) => setTestCaseForm({ ...testCaseForm, description: e.target.value })}
                                placeholder="Additional details or test criteria..."
                            />
                        </FormField>

                        <div className="modal-actions">
                            <button type="button" className="secondary-button" onClick={closeTestCaseModal}>
                                Cancel
                            </button>
                            <button type="submit" className="primary-button">
                                {editingTestCase ? "Save Changes" : "Create Test Case"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}


            {/* =====================================================
                CONFIRMATION
            ===================================================== */}

            {confirmAction && (
                <div className="confirm-overlay">
                    <div className="confirm-box">
                        <div className="confirm-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>
                            </svg>
                        </div>
                        <h2>Confirm Delete</h2>
                        <p>
                            Are you sure you want to delete{" "}
                            <strong>{confirmAction.item.name || confirmAction.item.title || "this item"}</strong>?
                        </p>
                        <span>This action cannot be undone.</span>
                        <div className="confirm-actions">
                            <button className="secondary-button" onClick={() => setConfirmAction(null)}>
                                Cancel
                            </button>
                            <button
                                className="danger-button"
                                onClick={() => {
                                    if (confirmAction.type === "project") {
                                        deleteProject(confirmAction.item);
                                    } else if (confirmAction.type === "testCase") {
                                        deleteTestCase(confirmAction.item);
                                    } else {
                                        deleteUser(confirmAction.item);
                                    }
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* =====================================================
                TOAST
            ===================================================== */}

            {toast && (
                <div className={`admin-toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>
                    <div className="toast-symbol">
                        {toast.type === "error" ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                    </div>
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)}>×</button>
                </div>
            )}

        </div>
    );
}


/*
|--------------------------------------------------------------------------
| Sub-Components
|--------------------------------------------------------------------------
*/

function StatCard({ title, value, icon, color = "indigo", trend }) {
    return (
        <div className={`stat-card stat-card--${color}`}>
            <div className={`stat-card-icon stat-icon--${color}`}>
                {icon}
            </div>
            <div className="stat-card-body">
                <span className="stat-label">{title}</span>
                <strong className="stat-value">{value}</strong>
                {trend && <small className="stat-trend">{trend}</small>}
            </div>
        </div>
    );
}


function RoleBar({ label, value, total, color = "indigo" }) {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="role-bar">
            <div className="role-bar-header">
                <span>{label}</span>
                <strong>{value} <em>/ {total}</em></strong>
            </div>
            <div className="progress-track">
                <div
                    className={`progress-fill progress-fill--${color}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}


function StatusBadge({ status }) {
    return (
        <span className={`status-badge status--${status || "unknown"}`}>
            <span className="badge-dot" />
            {formatStatus(status)}
        </span>
    );
}


function PriorityBadge({ priority }) {
    return (
        <span className={`priority-badge priority--${priority || "normal"}`}>
            {formatStatus(priority || "normal")}
        </span>
    );
}


function EmptyState({ text, icon = "folder" }) {
    const icons = {
        folder: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
        ),
        users: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
        ),
        bug: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/>
            </svg>
        ),
    };

    return (
        <div className="empty-state">
            <div className="empty-icon">{icons[icon] || icons.folder}</div>
            <p>{text}</p>
        </div>
    );
}


function Pagination({ current, total, onPrevious, onNext }) {
    if (total <= 1) return null;

    return (
        <div className="pagination">
            <button
                className="pagination-btn"
                disabled={current <= 1}
                onClick={onPrevious}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Previous
            </button>

            <span className="pagination-info">
                Page <strong>{current}</strong> of <strong>{total}</strong>
            </span>

            <button
                className="pagination-btn"
                disabled={current >= total}
                onClick={onNext}
            >
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
        </div>
    );
}


function Modal({ title, children, onClose }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-heading">
                    <h2>{title}</h2>
                    <button onClick={onClose} className="modal-close" aria-label="Close modal">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}


function FormField({ label, required, children }) {
    return (
        <div className="form-field">
            <label>
                {label}
                {required && <span className="required-star">*</span>}
            </label>
            {children}
        </div>
    );
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function formatStatus(status) {
    if (!status) return "Unknown";
    return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date) {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getPageTitle(section) {
    switch (section) {
        case "projects": return "Projects";
        case "users": return "User Management";
        case "bugs": return "Bug Management";
        default: return "Dashboard";
    }
}

export default AdminDashboard;
