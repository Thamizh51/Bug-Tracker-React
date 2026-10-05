const readTeam = (value) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
        return readTeam(value.name || value.label || value.team || value.department);
    }
    return null;
};

const readPersonTeam = (person) =>
    readTeam(person?.team) ||
    readTeam(person?.assigned_team) ||
    readTeam(person?.team_name) ||
    readTeam(person?.department) ||
    readTeam(person?.developer_team);

export const getAssignedTeam = (bug, people = []) => {
    const directTeam =
        readTeam(bug?.team) ||
        readTeam(bug?.assigned_team) ||
        readTeam(bug?.assignedTeam) ||
        readTeam(bug?.assigned_to_team) ||
        readTeam(bug?.team_name);

    if (directTeam) return directTeam;

    const assignee =
        bug?.developer ||
        bug?.assignee ||
        bug?.assigned_developer ||
        (typeof bug?.assigned_to === "object" ? bug.assigned_to : null);
    const relationTeam = readPersonTeam(assignee);

    if (relationTeam) return relationTeam;

    const assignedId =
        bug?.assigned_to_id ||
        bug?.developer_id ||
        bug?.assignee_id ||
        assignee?.id ||
        bug?.assigned_to;
    const assignedName =
        bug?.assigned_to_name ||
        (typeof bug?.assigned_to === "string" && Number.isNaN(Number(bug.assigned_to))
            ? bug.assigned_to
            : null);
    const person = people.find(
        (candidate) =>
            (assignedId != null && String(candidate?.id) === String(assignedId)) ||
            (assignedName && candidate?.name?.toLowerCase() === assignedName.toLowerCase())
    );

    return readPersonTeam(person);
};

export const formatAssignedTeam = (team) => {
    if (!team) return "Unassigned";
    return String(team)
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
};