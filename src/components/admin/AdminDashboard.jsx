import { useEffect, useMemo, useRef, useState } from "react";
import { formatAssignedTeam, getAssignedTeam } from "../../utils/bugTeam";
import "./AdminDashboard.css";

const API_URL = "http://localhost:8000/api";

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

    const [showProjectModal, setShowProjectModal] =
        useState(false);

    const [showUserModal, setShowUserModal] =
        useState(false);

    const [showBugModal, setShowBugModal] =
        useState(false);

    const bugDetailsRequestId = useRef(0);

    const [editingProject, setEditingProject] =
        useState(null);

    const [editingUser, setEditingUser] =
        useState(null);

    const [search, setSearch] = useState("");

    const [projectStatusFilter, setProjectStatusFilter] =
        useState("all");

    const [bugStatusFilter, setBugStatusFilter] =
        useState("all");

    const [bugPriorityFilter, setBugPriorityFilter] =
        useState("all");

    const [userRoleFilter, setUserRoleFilter] =
        useState("all");

    const [toast, setToast] = useState(null);

    const [confirmAction, setConfirmAction] =
        useState(null);

    const [currentProjectPage, setCurrentProjectPage] =
        useState(1);

    const [projectPerPage] = useState(8);

    const [currentUserPage, setCurrentUserPage] =
        useState(1);

    const [userPerPage] = useState(8);

    const [currentBugPage, setCurrentBugPage] =
        useState(1);

    const [bugPerPage] = useState(10);

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
    });

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
        setToast({
            message,
            type,
        });

        setTimeout(() => {
            setToast(null);
        }, 3000);
    }

    /*
    |--------------------------------------------------------------------------
    | Initial Data
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        loadAllData();
    }, []);

    async function loadAllData() {
        try {
            setLoading(true);

            await Promise.all([
                loadProjects(),
                loadUsers(),
                loadDevelopers(),
            ]);
        } catch (error) {
            console.error(error);

            showToast(
                "Unable to load admin data.",
                "error"
            );
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
        const response = await fetch(
            `${API_URL}/projects`,
            {
                headers: headers(),
            }
        );

        if (!response.ok) {
            throw new Error("Failed to load projects");
        }

        const data = await response.json();

        setProjects(
            data.projects ||
            data.data ||
            []
        );
    }

    async function saveProject(e) {
        e.preventDefault();

        try {
            const isEditing =
                Boolean(editingProject);

            const url = isEditing
                ? `${API_URL}/projects/${editingProject.id}`
                : `${API_URL}/create-project`;

            const method = isEditing
                ? "PUT"
                : "POST";

            const response = await fetch(
                url,
                {
                    method,
                    headers: headers(),
                    body: JSON.stringify(
                        projectForm
                    ),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Unable to save project"
                );
            }

            await loadProjects();

            closeProjectModal();

            showToast(
                isEditing
                    ? "Project updated successfully."
                    : "Project created successfully."
            );
        } catch (error) {
            console.error(error);

            showToast(
                error.message ||
                    "Unable to save project.",
                "error"
            );
        }
    }

    function openCreateProject() {
        setEditingProject(null);

        setProjectForm({
            name: "",
            description: "",
            status: "active",
        });

        setShowProjectModal(true);
    }

    function openEditProject(project) {
        setEditingProject(project);

        setProjectForm({
            name: project.name || "",
            description:
                project.description || "",
            status:
                project.status || "active",
        });

        setShowProjectModal(true);
    }

    function closeProjectModal() {
        setShowProjectModal(false);
        setEditingProject(null);
    }

    async function updateProjectStatus(
        project,
        status
    ) {
        try {
            const response = await fetch(
                `${API_URL}/projects/${project.id}/status`,
                {
                    method: "PATCH",
                    headers: headers(),
                    body: JSON.stringify({
                        status,
                    }),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Unable to update project status"
                );
            }

            setProjects((previous) =>
                previous.map((item) =>
                    item.id === project.id
                        ? {
                              ...item,
                              status,
                          }
                        : item
                )
            );

            showToast(
                `Project status changed to ${formatStatus(
                    status
                )}.`
            );
        } catch (error) {
            console.error(error);

            showToast(
                error.message ||
                    "Unable to update status.",
                "error"
            );
        }
    }

    async function deleteProject(project) {
        try {
            const response = await fetch(
                `${API_URL}/projects/${project.id}`,
                {
                    method: "DELETE",
                    headers: headers(),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Unable to delete project"
                );
            }

            setProjects((previous) =>
                previous.filter(
                    (item) =>
                        item.id !== project.id
                )
            );

            setConfirmAction(null);

            showToast(
                "Project deleted successfully."
            );
        } catch (error) {
            console.error(error);

            showToast(
                error.message ||
                    "Unable to delete project.",
                "error"
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Project Bugs
    |--------------------------------------------------------------------------
    */

    async function viewProjectBugs(project) {
        try {
            setSelectedProject(project);
            setBugsLoading(true);
            setShowBugModal(false);

            const response = await fetch(
                `${API_URL}/projects/${project.id}/bugs`,
                {
                    headers: headers(),
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Unable to load project bugs"
                );
            }

            const data =
                await response.json();

            setBugs(
                data.bugs ||
                data.data ||
                []
            );

            setActiveSection("bugs");
            setCurrentBugPage(1);
        } catch (error) {
            console.error(error);

            showToast(
                "Unable to load project bugs.",
                "error"
            );
        } finally {
            setBugsLoading(false);
        }
    }

    async function viewBugDetails(bug) {
        const requestId = ++bugDetailsRequestId.current;
        setSelectedBug(bug);
        setShowBugModal(true);

        try {
            const response = await fetch(`${API_URL}/bugs/${bug.id}`, {
                headers: headers(),
            });

            if (!response.ok) {
                throw new Error("Unable to load bug details");
            }

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
        const response = await fetch(
            `${API_URL}/admin/users`,
            {
                headers: headers(),
            }
        );

        if (!response.ok) {
            throw new Error("Failed to load users");
        }

        const data =
            await response.json();

        setUsers(
            data.users ||
            data.data ||
            []
        );
    }

    async function loadDevelopers() {
        const response = await fetch(
            `${API_URL}/admin/developers`,
            {
                headers: headers(),
            }
        );

        if (!response.ok) {
            return;
        }

        const data =
            await response.json();

        setDevelopers(
            data.developers ||
            data.data ||
            []
        );
    }

    async function saveUser(e) {
        e.preventDefault();

        try {
            const isEditing =
                Boolean(editingUser);

            /*
             * Your current API has POST /admin/users.
             *
             * If your backend later adds:
             * PUT /admin/users/{id}
             * use that route here.
             */

            if (isEditing) {
                showToast(
                    "User editing requires a PUT /admin/users/{id} endpoint.",
                    "error"
                );

                return;
            }

            const response = await fetch(
                `${API_URL}/admin/users`,
                {
                    method: "POST",
                    headers: headers(),
                    body: JSON.stringify(
                        userForm
                    ),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Unable to create user"
                );
            }

            await loadUsers();
            await loadDevelopers();

            closeUserModal();

            showToast(
                "User created successfully."
            );
        } catch (error) {
            console.error(error);

            showToast(
                error.message ||
                    "Unable to create user.",
                "error"
            );
        }
    }

    function openCreateUser() {
        setEditingUser(null);

        setUserForm({
            name: "",
            email: "",
            password: "",
            role: "developer",
        });

        setShowUserModal(true);
    }

    function openEditUser(user) {
        setEditingUser(user);

        setUserForm({
            name: user.name || "",
            email: user.email || "",
            password: "",
            role: user.role || "developer",
        });

        setShowUserModal(true);
    }

    function closeUserModal() {
        setShowUserModal(false);
        setEditingUser(null);
    }

    async function deleteUser(user) {
        try {
            const response = await fetch(
                `${API_URL}/admin/users/${user.id}`,
                {
                    method: "DELETE",
                    headers: headers(),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Unable to delete user"
                );
            }

            setUsers((previous) =>
                previous.filter(
                    (item) =>
                        item.id !== user.id
                )
            );

            setConfirmAction(null);

            showToast(
                "User deleted successfully."
            );
        } catch (error) {
            console.error(error);

            showToast(
                error.message ||
                    "Unable to delete user.",
                "error"
            );
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
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
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
            const matchesSearch =
                `${project.name || ""} ${
                    project.description || ""
                }`
                    .toLowerCase()
                    .includes(
                        search.toLowerCase()
                    );

            const matchesStatus =
                projectStatusFilter ===
                    "all" ||
                project.status ===
                    projectStatusFilter;

            return (
                matchesSearch &&
                matchesStatus
            );
        });
    }, [
        projects,
        search,
        projectStatusFilter,
    ]);

    const filteredUsers = useMemo(() => {
        return users.filter((user) => {
            const matchesSearch =
                `${user.name || ""} ${
                    user.email || ""
                }`
                    .toLowerCase()
                    .includes(
                        search.toLowerCase()
                    );

            const matchesRole =
                userRoleFilter ===
                    "all" ||
                user.role ===
                    userRoleFilter;

            return (
                matchesSearch &&
                matchesRole
            );
        });
    }, [
        users,
        search,
        userRoleFilter,
    ]);

    const filteredBugs = useMemo(() => {
        return bugs.filter((bug) => {
            const text = `
                ${bug.title || ""}
                ${bug.description || ""}
                ${bug.id || ""}
            `.toLowerCase();

            const matchesSearch =
                text.includes(
                    search.toLowerCase()
                );

            const matchesStatus =
                bugStatusFilter ===
                    "all" ||
                bug.status ===
                    bugStatusFilter;

            const matchesPriority =
                bugPriorityFilter ===
                    "all" ||
                bug.priority ===
                    bugPriorityFilter;

            return (
                matchesSearch &&
                matchesStatus &&
                matchesPriority
            );
        });
    }, [
        bugs,
        search,
        bugStatusFilter,
        bugPriorityFilter,
    ]);

    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    */

    const projectPages = Math.ceil(
        filteredProjects.length /
            projectPerPage
    );

    const visibleProjects =
        filteredProjects.slice(
            (currentProjectPage - 1) *
                projectPerPage,
            currentProjectPage *
                projectPerPage
        );

    const userPages = Math.ceil(
        filteredUsers.length /
            userPerPage
    );

    const visibleUsers =
        filteredUsers.slice(
            (currentUserPage - 1) *
                userPerPage,
            currentUserPage *
                userPerPage
        );

    const bugPages = Math.ceil(
        filteredBugs.length /
            bugPerPage
    );

    const visibleBugs =
        filteredBugs.slice(
            (currentBugPage - 1) *
                bugPerPage,
            currentBugPage *
                bugPerPage
        );

    /*
    |--------------------------------------------------------------------------
    | Dashboard Statistics
    |--------------------------------------------------------------------------
    */

    const activeProjects =
        projects.filter(
            (project) =>
                project.status === "active"
        ).length;

    const finishedProjects =
        projects.filter(
            (project) =>
                project.status === "finished"
        ).length;

    const archivedProjects =
        projects.filter(
            (project) =>
                project.status === "archived"
        ).length;

    const adminCount =
        users.filter(
            (user) =>
                user.role === "admin"
        ).length;

    const developerCount =
        users.filter(
            (user) =>
                user.role === "developer"
        ).length;

    const testerCount =
        users.filter(
            (user) =>
                user.role === "tester"
        ).length;

    /*
    |--------------------------------------------------------------------------
    | Navigation
    |--------------------------------------------------------------------------
    */

    function changeSection(section) {
        setActiveSection(section);
        setSearch("");
        setSelectedProject(null);

        if (section === "projects") {
            loadProjects();
        }

        if (section === "users") {
            loadUsers();
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Loading Screen
    |--------------------------------------------------------------------------
    */

    if (loading) {
        return (
            <div className="admin-loading">
                <div className="admin-spinner"></div>
                <p>
                    Loading Admin Dashboard...
                </p>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">

            {/* =====================================================
                SIDEBAR
            ===================================================== */}

            <aside className="admin-sidebar">

                <div className="admin-logo">
                    <div className="logo-mark">
                        BT
                    </div>

                    <div>
                        <strong>
                            Bug Tracker
                        </strong>

                        <span>
                            Admin Panel
                        </span>
                    </div>
                </div>


                <nav className="admin-navigation">

                    <button
                        className={
                            activeSection ===
                            "dashboard"
                                ? "nav-item active"
                                : "nav-item"
                        }
                        onClick={() =>
                            changeSection(
                                "dashboard"
                            )
                        }
                    >
                        <span>⌂</span>
                        Dashboard
                    </button>


                    <button
                        className={
                            activeSection ===
                            "projects"
                                ? "nav-item active"
                                : "nav-item"
                        }
                        onClick={() =>
                            changeSection(
                                "projects"
                            )
                        }
                    >
                        <span>▦</span>
                        Projects
                        <b>
                            {projects.length}
                        </b>
                    </button>


                    <button
                        className={
                            activeSection ===
                            "users"
                                ? "nav-item active"
                                : "nav-item"
                        }
                        onClick={() =>
                            changeSection(
                                "users"
                            )
                        }
                    >
                        <span>♙</span>
                        Users
                        <b>
                            {users.length}
                        </b>
                    </button>


                </nav>


                <div className="sidebar-bottom">

                    <button
                        className="logout-nav"
                        onClick={logout}
                    >
                        <span>↪</span>
                        Logout
                    </button>

                </div>

            </aside>


            {/* =====================================================
                CONTENT
            ===================================================== */}

            <main className="admin-content">

                <header className="admin-topbar">

                    <div>
                        <span className="page-label">
                            ADMINISTRATION
                        </span>

                        <h1>
                            {getPageTitle(
                                activeSection
                            )}
                        </h1>
                    </div>


                    <div className="admin-profile">

                        <div className="admin-avatar">
                            A
                        </div>

                        <div>
                            <strong>
                                Administrator
                            </strong>

                            <span>
                                Admin
                            </span>
                        </div>

                    </div>

                </header>


                {/* =================================================
                    DASHBOARD
                ================================================= */}

                {activeSection ===
                    "dashboard" && (

                    <section className="section-content">

                        <div className="welcome-card">

                            <div>
                                <span>
                                    Welcome back
                                </span>

                                <h2>
                                    Manage your
                                    Bug Tracker
                                </h2>

                                <p>
                                    Manage projects,
                                    users and bugs
                                    from one place.
                                </p>
                            </div>

                            <div className="welcome-decoration">
                                ⚙
                            </div>

                        </div>


                        <div className="statistics-grid">

                            <StatCard
                                title="Total Projects"
                                value={
                                    projects.length
                                }
                                icon="▦"
                            />

                            <StatCard
                                title="Active Projects"
                                value={
                                    activeProjects
                                }
                                icon="●"
                            />

                            <StatCard
                                title="Total Users"
                                value={
                                    users.length
                                }
                                icon="♙"
                            />

                            <StatCard
                                title="Developers"
                                value={
                                    developerCount
                                }
                                icon="◆"
                            />

                            <StatCard
                                title="Testers"
                                value={
                                    testerCount
                                }
                                icon="✓"
                            />

                            <StatCard
                                title="Finished Projects"
                                value={
                                    finishedProjects
                                }
                                icon="✓"
                            />

                        </div>


                        <div className="dashboard-columns">

                            <div className="dashboard-panel">

                                <div className="panel-heading">

                                    <div>
                                        <h2>
                                            Recent Projects
                                        </h2>

                                        <p>
                                            Latest projects
                                        </p>
                                    </div>

                                    <button
                                        onClick={() =>
                                            changeSection(
                                                "projects"
                                            )
                                        }
                                    >
                                        View All
                                    </button>

                                </div>


                                <div className="mini-project-list">

                                    {projects
                                        .slice(
                                            0,
                                            5
                                        )
                                        .map(
                                            (
                                                project
                                            ) => (
                                                <div
                                                    className="mini-project"
                                                    key={
                                                        project.id
                                                    }
                                                >

                                                    <div className="mini-project-icon">
                                                        {project.name
                                                            ?.charAt(
                                                                0
                                                            )
                                                            .toUpperCase()}
                                                    </div>

                                                    <div className="mini-project-info">
                                                        <strong>
                                                            {
                                                                project.name
                                                            }
                                                        </strong>

                                                        <span>
                                                            {
                                                                project.description ||
                                                                "No description"
                                                            }
                                                        </span>
                                                    </div>

                                                    <StatusBadge
                                                        status={
                                                            project.status
                                                        }
                                                    />

                                                </div>
                                            )
                                        )}

                                    {projects.length ===
                                        0 && (
                                        <EmptyState text="No projects created yet." />
                                    )}

                                </div>

                            </div>


                            <div className="dashboard-panel">

                                <div className="panel-heading">

                                    <div>
                                        <h2>
                                            User Overview
                                        </h2>

                                        <p>
                                            Users by role
                                        </p>
                                    </div>

                                    <button
                                        onClick={() =>
                                            changeSection(
                                                "users"
                                            )
                                        }
                                    >
                                        Manage
                                    </button>

                                </div>


                                <div className="role-overview">

                                    <RoleBar
                                        label="Administrators"
                                        value={
                                            adminCount
                                        }
                                        total={
                                            users.length
                                        }
                                    />

                                    <RoleBar
                                        label="Developers"
                                        value={
                                            developerCount
                                        }
                                        total={
                                            users.length
                                        }
                                    />

                                    <RoleBar
                                        label="Testers"
                                        value={
                                            testerCount
                                        }
                                        total={
                                            users.length
                                        }
                                    />

                                </div>

                            </div>

                        </div>

                    </section>
                )}


                {/* =================================================
                    PROJECTS
                ================================================= */}

                {activeSection ===
                    "projects" && (

                    <section className="section-content">

                        <div className="section-toolbar">

                            <div className="search-wrapper">

                                <span>⌕</span>

                                <input
                                    type="text"
                                    placeholder="Search projects..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(
                                            e.target
                                                .value
                                        );
                                        setCurrentProjectPage(
                                            1
                                        );
                                    }}
                                />

                            </div>


                            <div className="toolbar-actions">

                                <select
                                    value={
                                        projectStatusFilter
                                    }
                                    onChange={(e) => {
                                        setProjectStatusFilter(
                                            e.target
                                                .value
                                        );
                                        setCurrentProjectPage(
                                            1
                                        );
                                    }}
                                >

                                    <option value="all">
                                        All Status
                                    </option>

                                    <option value="active">
                                        Active
                                    </option>

                                    <option value="on_hold">
                                        On Hold
                                    </option>

                                    <option value="finished">
                                        Finished
                                    </option>

                                    <option value="archived">
                                        Archived
                                    </option>

                                </select>


                                <button
                                    className="primary-button"
                                    onClick={
                                        openCreateProject
                                    }
                                >
                                    + New Project
                                </button>

                            </div>

                        </div>


                        <div className="data-card">

                            <div className="table-header">

                                <div>
                                    <h2>
                                        Projects
                                    </h2>

                                    <span>
                                        {
                                            filteredProjects.length
                                        }{" "}
                                        projects
                                    </span>
                                </div>

                            </div>


                            <div className="table-scroll">

                                <table className="admin-table">

                                    <thead>
                                        <tr>
                                            <th>
                                                PROJECT
                                            </th>

                                            <th>
                                                STATUS
                                            </th>

                                            <th>
                                                CREATED
                                            </th>

                                            <th>
                                                BUGS
                                            </th>

                                            <th>
                                                ACTIONS
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {visibleProjects.map(
                                            (
                                                project
                                            ) => (
                                                <tr
                                                    key={
                                                        project.id
                                                    }
                                                >

                                                    <td>

                                                        <div className="table-project">

                                                            <div className="table-project-icon">
                                                                {project.name
                                                                    ?.charAt(
                                                                        0
                                                                    )
                                                                    .toUpperCase()}
                                                            </div>

                                                            <div>
                                                                <strong>
                                                                    {
                                                                        project.name
                                                                    }
                                                                </strong>

                                                                <span>
                                                                    {
                                                                        project.description ||
                                                                        "No description"
                                                                    }
                                                                </span>
                                                            </div>

                                                        </div>

                                                    </td>


                                                    <td>

                                                        <select
                                                            className={`status-select ${project.status}`}
                                                            value={
                                                                project.status ||
                                                                "active"
                                                            }
                                                            onChange={(
                                                                e
                                                            ) =>
                                                                updateProjectStatus(
                                                                    project,
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                        >

                                                            <option value="active">
                                                                Active
                                                            </option>

                                                            <option value="on_hold">
                                                                On Hold
                                                            </option>

                                                            <option value="finished">
                                                                Finished
                                                            </option>

                                                            <option value="archived">
                                                                Archived
                                                            </option>

                                                        </select>

                                                    </td>


                                                    <td>
                                                        {formatDate(
                                                            project.created_at
                                                        )}
                                                    </td>


                                                    <td>
                                                        <span className="number-badge">
                                                            {project.bugs_count ??
                                                                project.bugs
                                                                    ?.length ??
                                                                0}
                                                        </span>
                                                    </td>


                                                    <td>

                                                        <div className="action-buttons">

                                                            <button
                                                                className="action-view"
                                                                onClick={() =>
                                                                    viewProjectBugs(
                                                                        project
                                                                    )
                                                                }
                                                            >
                                                                View Bugs
                                                            </button>

                                                            <button
                                                                className="action-edit"
                                                                onClick={() =>
                                                                    openEditProject(
                                                                        project
                                                                    )
                                                                }
                                                            >
                                                                Edit
                                                            </button>

                                                            <button
                                                                className="action-delete"
                                                                onClick={() =>
                                                                    setConfirmAction(
                                                                        {
                                                                            type: "project",
                                                                            item: project,
                                                                        }
                                                                    )
                                                                }
                                                            >
                                                                Delete
                                                            </button>

                                                        </div>

                                                    </td>

                                                </tr>
                                            )
                                        )}

                                    </tbody>

                                </table>

                            </div>


                            {visibleProjects.length ===
                                0 && (
                                <EmptyState text="No projects found." />
                            )}


                            <Pagination
                                current={
                                    currentProjectPage
                                }
                                total={
                                    projectPages
                                }
                                onPrevious={() =>
                                    setCurrentProjectPage(
                                        (page) =>
                                            Math.max(
                                                1,
                                                page -
                                                    1
                                            )
                                    )
                                }
                                onNext={() =>
                                    setCurrentProjectPage(
                                        (page) =>
                                            Math.min(
                                                projectPages,
                                                page +
                                                    1
                                            )
                                    )
                                }
                            />

                        </div>

                    </section>
                )}


                {/* =================================================
                    USERS
                ================================================= */}

                {activeSection ===
                    "users" && (

                    <section className="section-content">

                        <div className="section-toolbar">

                            <div className="search-wrapper">

                                <span>⌕</span>

                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(
                                            e.target
                                                .value
                                        );
                                        setCurrentUserPage(
                                            1
                                        );
                                    }}
                                />

                            </div>


                            <div className="toolbar-actions">

                                <select
                                    value={
                                        userRoleFilter
                                    }
                                    onChange={(e) => {
                                        setUserRoleFilter(
                                            e.target
                                                .value
                                        );
                                        setCurrentUserPage(
                                            1
                                        );
                                    }}
                                >

                                    <option value="all">
                                        All Roles
                                    </option>

                                    <option value="admin">
                                        Admin
                                    </option>

                                    <option value="developer">
                                        Developer
                                    </option>

                                    <option value="tester">
                                        Tester
                                    </option>

                                </select>


                                <button
                                    className="primary-button"
                                    onClick={
                                        openCreateUser
                                    }
                                >
                                    + Create User
                                </button>

                            </div>

                        </div>


                        <div className="data-card">

                            <div className="table-header">

                                <div>
                                    <h2>
                                        Users
                                    </h2>

                                    <span>
                                        {
                                            filteredUsers.length
                                        }{" "}
                                        users
                                    </span>
                                </div>

                            </div>


                            <div className="table-scroll">

                                <table className="admin-table">

                                    <thead>
                                        <tr>
                                            <th>
                                                USER
                                            </th>

                                            <th>
                                                EMAIL
                                            </th>

                                            <th>
                                                ROLE
                                            </th>

                                            <th>
                                                CREATED
                                            </th>

                                            <th>
                                                ACTIONS
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {visibleUsers.map(
                                            (
                                                user
                                            ) => (
                                                <tr
                                                    key={
                                                        user.id
                                                    }
                                                >

                                                    <td>

                                                        <div className="table-user">

                                                            <div className="user-avatar">
                                                                {user.name
                                                                    ?.charAt(
                                                                        0
                                                                    )
                                                                    .toUpperCase()}
                                                            </div>

                                                            <strong>
                                                                {
                                                                    user.name
                                                                }
                                                            </strong>

                                                        </div>

                                                    </td>


                                                    <td>
                                                        {
                                                            user.email
                                                        }
                                                    </td>


                                                    <td>
                                                        <span
                                                            className={`role-badge ${user.role}`}
                                                        >
                                                            {formatStatus(
                                                                user.role
                                                            )}
                                                        </span>
                                                    </td>


                                                    <td>
                                                        {formatDate(
                                                            user.created_at
                                                        )}
                                                    </td>


                                                    <td>

                                                        <div className="action-buttons">

                                                            <button
                                                                className="action-edit"
                                                                onClick={() =>
                                                                    openEditUser(
                                                                        user
                                                                    )
                                                                }
                                                            >
                                                                Edit
                                                            </button>

                                                            <button
                                                                className="action-delete"
                                                                onClick={() =>
                                                                    setConfirmAction(
                                                                        {
                                                                            type: "user",
                                                                            item: user,
                                                                        }
                                                                    )
                                                                }
                                                            >
                                                                Delete
                                                            </button>

                                                        </div>

                                                    </td>

                                                </tr>
                                            )
                                        )}

                                    </tbody>

                                </table>

                            </div>


                            {visibleUsers.length ===
                                0 && (
                                <EmptyState text="No users found." />
                            )}


                            <Pagination
                                current={
                                    currentUserPage
                                }
                                total={
                                    userPages
                                }
                                onPrevious={() =>
                                    setCurrentUserPage(
                                        (page) =>
                                            Math.max(
                                                1,
                                                page -
                                                    1
                                            )
                                    )
                                }
                                onNext={() =>
                                    setCurrentUserPage(
                                        (page) =>
                                            Math.min(
                                                userPages,
                                                page +
                                                    1
                                            )
                                    )
                                }
                            />

                        </div>

                    </section>
                )}


                {/* =================================================
                    BUGS
                ================================================= */}

                {activeSection ===
                    "bugs" && (

                    <section className="section-content">

                        <div className="selected-project-banner">

                            <div>

                                <span>
                                    PROJECT
                                </span>

                                <h2>
                                    {selectedProject
                                        ?.name ||
                                        "Project Bugs"}
                                </h2>

                            </div>

                            {selectedProject && (
                                <button
                                    onClick={() =>
                                        changeSection(
                                            "projects"
                                        )
                                    }
                                >
                                    ← Back to Projects
                                </button>
                            )}

                        </div>


                        <div className="section-toolbar">

                            <div className="search-wrapper">

                                <span>⌕</span>

                                <input
                                    type="text"
                                    placeholder="Search bugs..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(
                                            e.target
                                                .value
                                        );
                                        setCurrentBugPage(
                                            1
                                        );
                                    }}
                                />

                            </div>


                            <div className="toolbar-actions">

                                <select
                                    value={
                                        bugStatusFilter
                                    }
                                    onChange={(e) => {
                                        setBugStatusFilter(
                                            e.target
                                                .value
                                        );
                                        setCurrentBugPage(
                                            1
                                        );
                                    }}
                                >

                                    <option value="all">
                                        All Status
                                    </option>

                                    <option value="pending">
                                        Pending
                                    </option>

                                    <option value="in_progress">
                                        In Progress
                                    </option>

                                    <option value="resolved">
                                        Resolved
                                    </option>

                                </select>


                                <select
                                    value={
                                        bugPriorityFilter
                                    }
                                    onChange={(e) => {
                                        setBugPriorityFilter(
                                            e.target
                                                .value
                                        );
                                        setCurrentBugPage(
                                            1
                                        );
                                    }}
                                >

                                    <option value="all">
                                        All Priority
                                    </option>

                                    <option value="low">
                                        Low
                                    </option>

                                    <option value="medium">
                                        Medium
                                    </option>

                                    <option value="high">
                                        High
                                    </option>

                                    <option value="critical">
                                        Critical
                                    </option>

                                </select>

                            </div>

                        </div>


                        <div className="data-card">

                            {bugsLoading ? (

                                <div className="inside-loading">
                                    <div className="admin-spinner"></div>
                                    <p>
                                        Loading bugs...
                                    </p>
                                </div>

                            ) : (

                                <div className="table-scroll">

                                    <table className="admin-table">

                                        <thead>
                                            <tr>
                                                <th>
                                                    BUG
                                                </th>

                                                <th>
                                                    PROJECT
                                                </th>

                                                <th>
                                                    TEAM
                                                </th>

                                                <th>
                                                    PRIORITY
                                                </th>

                                                <th>
                                                    STATUS
                                                </th>

                                                <th>
                                                    ASSIGNED TO
                                                </th>

                                                <th>
                                                    ACTION
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {visibleBugs.map(
                                                (
                                                    bug
                                                ) => (
                                                    <tr
                                                        key={
                                                            bug.id
                                                        }
                                                    >

                                                        <td>

                                                            <div className="bug-table-cell">

                                                                <span className="bug-number">
                                                                    #
                                                                    {
                                                                        bug.id
                                                                    }
                                                                </span>

                                                                <div>
                                                                    <strong>
                                                                        {
                                                                            bug.title ||
                                                                            bug.name ||
                                                                            "Untitled Bug"
                                                                        }
                                                                    </strong>

                                                                    <span>
                                                                        {
                                                                            bug.description ||
                                                                            "No description"
                                                                        }
                                                                    </span>
                                                                </div>

                                                            </div>

                                                        </td>


                                                        <td>
                                                            {
                                                                bug
                                                                    .project
                                                                    ?.name ||
                                                                selectedProject
                                                                    ?.name ||
                                                                "—"
                                                            }
                                                        </td>


                                                        <td>
                                                            <span className="team-badge">
                                                                {formatAssignedTeam(getAssignedTeam(bug, developers))}
                                                            </span>
                                                        </td>


                                                        <td>
                                                            <PriorityBadge
                                                                priority={
                                                                    bug.priority
                                                                }
                                                            />
                                                        </td>


                                                        <td>
                                                            <StatusBadge
                                                                status={
                                                                    bug.status
                                                                }
                                                            />
                                                        </td>


                                                        <td>
                                                            {
                                                                bug.assigned_to ||
                                                                bug
                                                                    .developer
                                                                    ?.name ||
                                                                "Unassigned"
                                                            }
                                                        </td>


                                                        <td>

                                                            <button
                                                                type="button"
                                                                className="action-view"
                                                                onClick={() => {
                                                                    viewBugDetails(bug);
                                                                }}
                                                            >
                                                                View
                                                            </button>

                                                        </td>

                                                    </tr>
                                                )
                                            )}

                                        </tbody>

                                    </table>

                                </div>

                            )}


                            {!bugsLoading &&
                                visibleBugs.length ===
                                    0 && (
                                    <EmptyState text="No bugs found." />
                                )}


                            <Pagination
                                current={
                                    currentBugPage
                                }
                                total={
                                    bugPages
                                }
                                onPrevious={() =>
                                    setCurrentBugPage(
                                        (page) =>
                                            Math.max(
                                                1,
                                                page -
                                                    1
                                            )
                                    )
                                }
                                onNext={() =>
                                    setCurrentBugPage(
                                        (page) =>
                                            Math.min(
                                                bugPages,
                                                page +
                                                    1
                                            )
                                    )
                                }
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
                    title={
                        editingProject
                            ? "Edit Project"
                            : "Create Project"
                    }
                    onClose={
                        closeProjectModal
                    }
                >

                    <form
                        className="modal-form"
                        onSubmit={saveProject}
                    >

                        <FormField
                            label="Project Name"
                            required
                        >
                            <input
                                type="text"
                                value={
                                    projectForm.name
                                }
                                onChange={(e) =>
                                    setProjectForm(
                                        {
                                            ...projectForm,
                                            name: e
                                                .target
                                                .value,
                                        }
                                    )
                                }
                                placeholder="Enter project name"
                                required
                            />
                        </FormField>


                        <FormField label="Description">

                            <textarea
                                value={
                                    projectForm.description
                                }
                                onChange={(e) =>
                                    setProjectForm(
                                        {
                                            ...projectForm,
                                            description:
                                                e
                                                    .target
                                                    .value,
                                        }
                                    )
                                }
                                placeholder="Describe the project..."
                                rows="4"
                            />

                        </FormField>


                        <FormField label="Status">

                            <select
                                value={
                                    projectForm.status
                                }
                                onChange={(e) =>
                                    setProjectForm(
                                        {
                                            ...projectForm,
                                            status: e
                                                .target
                                                .value,
                                        }
                                    )
                                }
                            >

                                <option value="active">
                                    Active
                                </option>

                                <option value="on_hold">
                                    On Hold
                                </option>

                                <option value="finished">
                                    Finished
                                </option>

                                <option value="archived">
                                    Archived
                                </option>

                            </select>

                        </FormField>


                        <div className="modal-actions">

                            <button
                                type="button"
                                className="secondary-button"
                                onClick={
                                    closeProjectModal
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                className="primary-button"
                            >
                                {editingProject
                                    ? "Save Changes"
                                    : "Create Project"}
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
                    title={
                        editingUser
                            ? "Edit User"
                            : "Create User"
                    }
                    onClose={
                        closeUserModal
                    }
                >

                    <form
                        className="modal-form"
                        onSubmit={saveUser}
                    >

                        <FormField
                            label="Full Name"
                            required
                        >
                            <input
                                type="text"
                                value={
                                    userForm.name
                                }
                                onChange={(e) =>
                                    setUserForm(
                                        {
                                            ...userForm,
                                            name: e
                                                .target
                                                .value,
                                        }
                                    )
                                }
                                placeholder="Enter full name"
                                required
                            />
                        </FormField>


                        <FormField
                            label="Email"
                            required
                        >
                            <input
                                type="email"
                                value={
                                    userForm.email
                                }
                                onChange={(e) =>
                                    setUserForm(
                                        {
                                            ...userForm,
                                            email: e
                                                .target
                                                .value,
                                        }
                                    )
                                }
                                placeholder="Enter email"
                                required
                            />
                        </FormField>


                        {!editingUser && (
                            <FormField
                                label="Password"
                                required
                            >
                                <input
                                    type="password"
                                    value={
                                        userForm.password
                                    }
                                    onChange={(e) =>
                                        setUserForm(
                                            {
                                                ...userForm,
                                                password:
                                                    e
                                                        .target
                                                        .value,
                                            }
                                        )
                                    }
                                    placeholder="Enter password"
                                    required
                                />
                            </FormField>
                        )}


                        <FormField
                            label="Role"
                            required
                        >

                            <select
                                value={
                                    userForm.role
                                }
                                onChange={(e) =>
                                    setUserForm(
                                        {
                                            ...userForm,
                                            role: e
                                                .target
                                                .value,
                                        }
                                    )
                                }
                            >

                                <option value="admin">
                                    Admin
                                </option>

                                <option value="developer">
                                    Developer
                                </option>

                                <option value="tester">
                                    Tester
                                </option>

                            </select>

                        </FormField>


                        <div className="modal-actions">

                            <button
                                type="button"
                                className="secondary-button"
                                onClick={
                                    closeUserModal
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                className="primary-button"
                            >
                                {editingUser
                                    ? "Save Changes"
                                    : "Create User"}
                            </button>

                        </div>

                    </form>

                </Modal>
            )}


            {/* =====================================================
                BUG MODAL
            ===================================================== */}

            {showBugModal &&
                selectedBug && (

                    <Modal
                        title={`Bug #${selectedBug.id}`}
                        onClose={() => {
                            bugDetailsRequestId.current++;
                            setShowBugModal(false);
                        }}
                    >

                        <div className="bug-modal-content">

                            <h2>
                                {
                                    selectedBug.title ||
                                    selectedBug.name ||
                                    "Bug Details"
                                }
                            </h2>


                            <div className="bug-meta-grid">

                                <div>
                                    <span>
                                        Project
                                    </span>

                                    <strong>
                                        {
                                            selectedBug
                                                .project
                                                ?.name ||
                                            selectedProject
                                                ?.name ||
                                            "—"
                                        }
                                    </strong>
                                </div>


                                <div>
                                    <span>
                                        Status
                                    </span>

                                    <StatusBadge
                                        status={
                                            selectedBug.status
                                        }
                                    />
                                </div>


                                <div>
                                    <span>
                                        Priority
                                    </span>

                                    <PriorityBadge
                                        priority={
                                            selectedBug.priority
                                        }
                                    />
                                </div>


                                <div>
                                    <span>
                                        Assigned To
                                    </span>

                                    <strong>
                                        {
                                            selectedBug.assigned_to ||
                                            selectedBug
                                                .developer
                                                ?.name ||
                                            "Unassigned"
                                        }
                                    </strong>
                                </div>


                                <div>
                                    <span>
                                        Assigned Team
                                    </span>

                                    <strong>
                                        {formatAssignedTeam(getAssignedTeam(selectedBug, developers))}
                                    </strong>
                                </div>

                            </div>


                            <div className="bug-description-full">

                                <label>
                                    Description
                                </label>

                                <p>
                                    {
                                        selectedBug.description ||
                                        "No description available."
                                    }
                                </p>

                            </div>


                            {selectedBug.bug_url && (

                                <a
                                    href={
                                        selectedBug.bug_url
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bug-external-link"
                                >
                                    Open Bug URL ↗
                                </a>

                            )}


                            {selectedBug.image_url && (

                                <div className="bug-image-container">

                                    <label>
                                        Screenshot
                                    </label>

                                    <img
                                        src={
                                            selectedBug.image_url
                                        }
                                        alt="Bug"
                                    />

                                </div>

                            )}

                        </div>

                    </Modal>
                )}


            {/* =====================================================
                CONFIRMATION
            ===================================================== */}

            {confirmAction && (

                <div className="confirm-overlay">

                    <div className="confirm-box">

                        <div className="confirm-icon">
                            !
                        </div>

                        <h2>
                            Confirm Delete
                        </h2>

                        <p>
                            Are you sure you want
                            to delete{" "}
                            <strong>
                                {confirmAction.item.name}
                            </strong>
                            ?
                        </p>

                        <span>
                            This action cannot be
                            undone.
                        </span>


                        <div className="confirm-actions">

                            <button
                                className="secondary-button"
                                onClick={() =>
                                    setConfirmAction(
                                        null
                                    )
                                }
                            >
                                Cancel
                            </button>

                            <button
                                className="danger-button"
                                onClick={() => {
                                    if (
                                        confirmAction.type ===
                                        "project"
                                    ) {
                                        deleteProject(
                                            confirmAction.item
                                        );
                                    } else {
                                        deleteUser(
                                            confirmAction.item
                                        );
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

                <div
                    className={`admin-toast ${
                        toast.type ===
                        "error"
                            ? "toast-error"
                            : "toast-success"
                    }`}
                >

                    <div className="toast-symbol">
                        {toast.type ===
                        "error"
                            ? "!"
                            : "✓"}
                    </div>

                    <span>
                        {toast.message}
                    </span>

                    <button
                        onClick={() =>
                            setToast(null)
                        }
                    >
                        ×
                    </button>

                </div>
            )}

        </div>
    );
}


/*
|--------------------------------------------------------------------------
| Components
|--------------------------------------------------------------------------
*/

function StatCard({
    title,
    value,
    icon,
}) {
    return (
        <div className="stat-card">

            <div className="stat-card-icon">
                {icon}
            </div>

            <div>
                <span>
                    {title}
                </span>

                <strong>
                    {value}
                </strong>
            </div>

        </div>
    );
}


function RoleBar({
    label,
    value,
    total,
}) {
    const percentage =
        total > 0
            ? (value / total) * 100
            : 0;

    return (
        <div className="role-bar">

            <div className="role-bar-header">

                <span>
                    {label}
                </span>

                <strong>
                    {value}
                </strong>

            </div>

            <div className="progress-track">

                <div
                    className="progress-fill"
                    style={{
                        width: `${percentage}%`,
                    }}
                ></div>

            </div>

        </div>
    );
}


function StatusBadge({
    status,
}) {
    return (
        <span
            className={`status-badge ${
                status || ""
            }`}
        >
            {formatStatus(status)}
        </span>
    );
}


function PriorityBadge({
    priority,
}) {
    return (
        <span
            className={`priority-badge ${
                priority || ""
            }`}
        >
            {formatStatus(
                priority || "normal"
            )}
        </span>
    );
}


function EmptyState({
    text,
}) {
    return (
        <div className="empty-state">
            <div>○</div>
            <p>{text}</p>
        </div>
    );
}


function Pagination({
    current,
    total,
    onPrevious,
    onNext,
}) {
    if (total <= 1) {
        return null;
    }

    return (
        <div className="pagination">

            <button
                disabled={current <= 1}
                onClick={
                    onPrevious
                }
            >
                ← Previous
            </button>

            <span>
                Page{" "}
                <strong>
                    {current}
                </strong>{" "}
                of{" "}
                <strong>
                    {total}
                </strong>
            </span>

            <button
                disabled={
                    current >= total
                }
                onClick={onNext}
            >
                Next →
            </button>

        </div>
    );
}


function Modal({
    title,
    children,
    onClose,
}) {
    return (
        <div
            className="modal-overlay"
            onClick={onClose}
        >

            <div
                className="admin-modal"
                onClick={(e) =>
                    e.stopPropagation()
                }
            >

                <div className="modal-heading">

                    <h2>
                        {title}
                    </h2>

                    <button
                        onClick={onClose}
                        className="modal-close"
                    >
                        ×
                    </button>

                </div>

                {children}

            </div>

        </div>
    );
}


function FormField({
    label,
    required,
    children,
}) {
    return (
        <div className="form-field">

            <label>
                {label}

                {required && (
                    <span>
                        *
                    </span>
                )}
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
    if (!status) {
        return "Unknown";
    }

    return status
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) =>
            letter.toUpperCase()
        );
}


function formatDate(date) {
    if (!date) {
        return "—";
    }

    return new Date(date).toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }
    );
}


function getPageTitle(section) {
    switch (section) {
        case "projects":
            return "Projects";

        case "users":
            return "User Management";

        case "bugs":
            return "Bug Management";

        default:
            return "Dashboard";
    }
}

export default AdminDashboard;
