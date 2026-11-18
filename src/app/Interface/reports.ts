import { HealthStatus, Milestone, Project, ProjectStatus } from './project';
import { TaskPriority, TaskStatus } from './task';

export type DatePreset = 'week' | 'month' | 'last30' | 'quarter' | 'custom';

/** Shared filter of every report page (kept in ReportsService so it survives navigation). */
export interface ReportFilter {
    Preset: DatePreset;
    From: string;            // yyyy-MM-dd
    To: string;              // yyyy-MM-dd
    ProjectIDs: number[];
    TeamID: number | null;
}

/** Task enriched for reporting (real tasks from TaskService + synthesized history). */
export interface ReportTask {
    ID: number;
    Key: string;
    ProjectID: number;
    ProjectName: string;
    Title: string;
    Status: TaskStatus;
    Priority: TaskPriority;
    AssigneeID: number | null;
    AssigneeName: string;
    TeamID: number | null;
    CreatedOn: string;       // yyyy-MM-dd
    StartDate: string;
    DueDate: string;
    CompletedOn: string | null;
    EstimateHours: number;
    LoggedHours: number;
    StoryPoints: number;
    CycleDays: number | null;
    OnTime: boolean | null;
    IsHistory: boolean;
}

export interface ReportWorklog {
    ID: number;
    TaskID: number;
    TaskKey: string;
    TaskTitle: string;
    ProjectID: number;
    ProjectName: string;
    UserID: number;
    UserName: string;
    TeamID: number | null;
    WorkDate: string;        // yyyy-MM-dd
    Hours: number;
    Note: string;
    Billable: boolean;
}

export interface ReportBase {
    Projects: Project[];
    Milestones: Milestone[];
    Tasks: ReportTask[];
    Worklogs: ReportWorklog[];
}

/** Base data narrowed by the current ReportFilter. */
export interface ReportScope {
    Filter: ReportFilter;
    Projects: Project[];
    Milestones: Milestone[];
    Tasks: ReportTask[];           // project + team filter, any date
    Worklogs: ReportWorklog[];     // project + team + date range
    AllWorklogs: ReportWorklog[];  // project + team, any date
    UserIDs: number[];             // users in the selected team (all when no team)
}

export interface ProjectPerformance {
    ID: number;
    Code: string;
    Name: string;
    ManagerName: string;
    Status: ProjectStatus;
    Health: HealthStatus;
    Currency: string;
    Progress: number;
    Planned: number;
    ScheduleVariance: number;
    Budget: number;
    Spent: number;
    BudgetUsed: number;
    EarnedValue: number;
    CostVariance: number;
    CPI: number;
    OpenTasks: number;
    OverdueTasks: number;
    Milestones: Milestone[];
}

export interface MemberProductivity {
    UserID: number;
    Name: string;
    Designation: string;
    TeamID: number;
    TeamName: string;
    Completed: number;
    Throughput: number;
    OnTimePct: number;
    AvgCycleDays: number;
    Hours: number;
    CapacityHours: number;
    Utilization: number;
    Weekly: number[];
}

export interface TeamProductivity {
    TeamID: number;
    Name: string;
    Members: number;
    Completed: number;
    Throughput: number;
    OnTimePct: number;
    AvgCycleDays: number;
    Hours: number;
    Utilization: number;
    Weekly: number[];
}

export type ExportDataset = 'Projects' | 'Tasks' | 'Worklogs' | 'Members' | 'Milestones';
export type ExportFormat = 'Excel' | 'CSV' | 'PDF';
export type ExportFrequency = 'Daily' | 'Weekly' | 'Monthly';

export interface ExportFilter {
    From: string;
    To: string;
    ProjectID: number | null;
    Status: string;
}

export interface ScheduledExport {
    ID: number;
    Name: string;
    Dataset: ExportDataset;
    Format: ExportFormat;
    Frequency: ExportFrequency;
    Recipients: string[];
    NextRun: string;          // ISO date-time
    Active: boolean;
    CreatedBy: string;
}

export interface ExportHistory {
    ID: number;
    FileName: string;
    Title: string;
    Source: string;           // page that produced it
    Dataset: ExportDataset | null;
    Format: ExportFormat;
    Rows: number;
    ColumnKeys: string[];
    Filter: ExportFilter | null;
    ExportedOn: string;       // ISO date-time
    ExportedBy: string;
    /** In-memory snapshot for report-page exports (re-download without a dataset). */
    Snapshot?: { rows: any[]; columns: { key: string; label: string; format?: (v: any, row: any) => string }[]; subtitle?: string };
}
