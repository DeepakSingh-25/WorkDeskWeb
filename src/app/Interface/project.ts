export type ProjectStatus = 'Not Started' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
export type ProjectPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type HealthStatus = 'On Track' | 'At Risk' | 'Off Track';
export type MilestoneStatus = 'Pending' | 'In Progress' | 'Completed' | 'Delayed';
/** Users.Status (Active / Invited / Suspended) or 'Deleted' — API ProjectModels.cs ProjectMemberItem. */
export type ProjectUserStatus = 'Active' | 'Invited' | 'Suspended' | 'Deleted';

/** `ProjectActionResponse.Code` values (API spec 007). 403 bodies use the spec 005 codes instead. */
export type ProjectErrorCode =
    'PROJECT_CODE_EXISTS' | 'PROJECT_ARCHIVED' | 'CONCURRENCY' | 'PROJECT_LIMIT_REACHED' |
    'MEMBER_EXISTS' | 'NOT_ARCHIVED' | 'MANAGER_REQUIRED';

/** ProjectItem (P1 rows, P3, all). Health / Progress / task counts are computed by the server. */
export interface Project {
    ID: number;
    Code: string;
    Name: string;
    Description: string;
    ClientName: string;
    CategoryID: number | null;
    Category: string;    // display name
    ManagerID: string;   // Users.Id (Guid)
    ManagerName: string;
    StartDate: string;   // yyyy-MM-dd
    EndDate: string;     // yyyy-MM-dd
    Budget: number;
    Spent: number;
    Currency: string;
    Priority: ProjectPriority;
    Status: ProjectStatus;
    Health: HealthStatus;
    Progress: number;    // 0 - 100
    MemberIDs: string[];
    TotalTasks: number;
    CompletedTasks: number;
    IsArchived: boolean;
    ArchivedOn?: string | null;
    ArchivedBy?: string | null;
    CreatedOn: string;
    RowVersion: string;
    CanEdit: boolean;    // Projects.Edit AND not archived
    CanManage: boolean;  // Projects.Manage (archive / restore / settings)
    CanDelete: boolean;  // Projects.Delete (P8 still needs IsArchived)
}

export interface ProjectMember {
    ID: number;
    ProjectID: number;
    UserID: string;
    Name: string;
    Email: string;
    Role: string;
    Allocation: number;  // % of time
    JoinedOn: string;
    UserStatus: ProjectUserStatus;
}

export interface Milestone {
    ID: number;
    ProjectID: number;
    Title: string;
    Description: string;
    StartDate: string;
    DueDate: string;
    Status: MilestoneStatus;
    Progress: number;
    OwnerUserID: string | null;
    OwnerName: string;
    TotalTasks: number;
    CompletedTasks: number;
    OutsideProjectDates?: boolean;
    RowVersion: string;
}

export interface ProjectTask {
    ID: number;
    ProjectID: number;
    MilestoneID: number;
    Title: string;
    AssigneeName: string;
    StartDate: string;
    EndDate: string;
    Progress: number;
}

export interface ProjectSettings {
    ProjectID: number;
    Visibility: 'Private' | 'Team' | 'Organization';
    DefaultView: 'List' | 'Board' | 'Timeline';
    WorkingDays: string[];
    TimeTracking: boolean;
    ClientAccess: boolean;
    NotifyOnTaskAssign: boolean;
    NotifyOnStatusChange: boolean;
    NotifyOnMilestoneDue: boolean;
    WeeklyReport: boolean;
}

export interface ProjectUser {
    ID: string;
    Name: string;
    Email: string;
}

export interface ProjectCategory {
    ID: number;
    Name: string;
}

/** P9 `GET Projects/lookups`. */
export interface ProjectLookups {
    Users: ProjectUser[];
    Categories: ProjectCategory[];
    MemberRoles: string[];
    Currencies: string[];
    DefaultCurrency: string | null;
}

/** P2 — the first five count non-archived projects only. */
export interface ProjectSummary {
    Total: number;
    InProgress: number;
    Completed: number;
    OnHold: number;
    Overdue: number;
    Archived: number;
}

/** P4 / P5 body. RowVersion only on P5; Spent is used on P5 only (Q3). */
export interface SaveProjectRequest {
    Code: string;
    Name: string;
    Description: string;
    ClientName: string;
    CategoryID: number | null;
    StartDate: string;
    EndDate: string;
    Budget: number;
    Spent: number;
    Currency: string;
    Priority: ProjectPriority;
    Status: ProjectStatus;
    ManagerUserID: string;
    MemberUserIDs: string[];
    RowVersion: string | null;
}

export interface SaveMemberRequest {
    UserID: string;
    Role: string;
    Allocation: number;
}

export interface SaveMilestoneRequest {
    Title: string;
    Description: string;
    StartDate: string;
    DueDate: string;
    Status: MilestoneStatus;
    Progress: number;
    OwnerUserID: string | null;
    RowVersion: string | null;
}

/** S2 body — General + Preferences saved in one transaction. */
export interface SaveProjectSettingsRequest {
    General: {
        Name: string;
        Status: ProjectStatus;
        Priority: ProjectPriority;
        ManagerUserID: string;
        RowVersion: string;
    };
    Preferences: Omit<ProjectSettings, 'ProjectID'>;
}

/** Every write answer — also the body of 400 / 404 / 409 errors. */
export interface ProjectActionResponse {
    Success: boolean;
    Message: string;
    Code?: ProjectErrorCode | string | null;
    ID?: number | null;
    Errors?: Record<string, string[]> | null;
    OutsideProjectDates?: boolean | null;
}

/** A1 `GET Projects/{id}/activity`. Timestamp is UTC ISO. */
export interface ProjectActivity {
    ID: number;
    ActorName: string;
    Action: string;
    Detail: string | null;
    Timestamp: string;
}

export interface PagedResult<T> {
    Result: T[];
    FilterRecords: number;
}
