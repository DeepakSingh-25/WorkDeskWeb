import { TaskPriority } from './task';

// ---------------- Global search ----------------
export type SearchResultType = 'Project' | 'Task' | 'Person' | 'Document' | 'Help';

export interface SearchResult {
    Type: SearchResultType;
    ID: number;
    Title: string;
    Subtitle: string;
    Meta: string;
    Link: string;                               // router path
    QueryParams: { [k: string]: any } | null;
}

export interface TextSegment {
    Text: string;
    Match: boolean;
}

// ---------------- Saved views ----------------
export type ViewEntity = 'Tasks' | 'Projects';
export type ViewLayout = 'List' | 'Board' | 'Calendar';
export type ViewVisibility = 'Private' | 'Team' | 'Everyone';

export interface FilterCondition {
    Field: string;
    Operator: string;
    Value: string;
}

export interface SavedView {
    ID: number;
    Name: string;
    Description: string;
    Entity: ViewEntity;
    Layout: ViewLayout;
    Visibility: ViewVisibility;
    OwnerID: number;
    OwnerName: string;
    Pinned: boolean;
    IsDefault: boolean;
    Match: 'AND' | 'OR';
    Conditions: FilterCondition[];
    CreatedOn: string;     // ISO
    UpdatedOn: string;     // ISO
}

// ---------------- Documents ----------------
export interface DocFolder {
    ID: number;
    Name: string;
    ParentID: number | null;
    ProjectID: number | null;
    CreatedOn: string;
}

export interface DocVersion {
    Version: number;
    FileSize: number;
    UploadedBy: string;
    UploadedOn: string;    // ISO
    Note: string;
    Url?: string;          // object URL for files uploaded in this session
    FileType?: string;
}

export interface DocFile {
    ID: number;
    FolderID: number;
    Name: string;
    FileType: string;      // mime type
    FileSize: number;      // bytes (current version)
    OwnerName: string;
    CreatedOn: string;     // ISO
    ModifiedOn: string;    // ISO
    Starred: boolean;
    ProjectID: number | null;
    ProjectName: string;
    Tags: string[];
    Description: string;
    Versions: DocVersion[];
    Url?: string;          // object URL of current version (uploaded in this session)
}

// ---------------- Recurring tasks ----------------
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Custom';
export type RecurrenceEnd = 'Never' | 'OnDate' | 'After';

export interface RecurrenceSpec {
    Frequency: RecurrenceFrequency;
    Time: string;              // HH:mm
    Weekdays: number[];        // 0 = Sunday
    MonthlyMode: 'Day' | 'Weekday';
    MonthDay: number;          // 1 - 31
    MonthWeek: number;         // 1 - 4, 5 = last
    MonthWeekday: number;      // 0 = Sunday
    IntervalDays: number;
    StartDate: string;         // yyyy-MM-dd
    EndMode: RecurrenceEnd;
    EndDate: string;
    EndAfter: number;
}

export interface RecurringRule extends RecurrenceSpec {
    ID: number;
    Title: string;
    Description: string;
    ProjectID: number;
    ProjectName: string;
    AssigneeID: number | null;
    AssigneeName: string;
    Priority: TaskPriority;
    EstimateHours: number;
    Labels: string[];
    DueOffsetDays: number;
    Active: boolean;
    LastRun: string | null;    // ISO
    LastTaskID: number | null;
    RunCount: number;
    CreatedBy: string;
    CreatedOn: string;
}

// ---------------- Automation ----------------
export type AutomationTrigger = 'TaskCreated' | 'StatusChanged' | 'DueApproaching' | 'TaskOverdue' | 'CommentMention' | 'FieldChanged';
export type AutomationActionType = 'AssignTo' | 'ChangeStatus' | 'SetPriority' | 'AddLabel' | 'NotifyUser' | 'NotifyRole' | 'CreateSubtask' | 'MoveToSprint';
export type AutomationRunResult = 'Success' | 'Failed' | 'Skipped';

export interface AutomationCondition {
    Field: string;
    Operator: string;
    Value: string;
}

export interface AutomationAction {
    Type: AutomationActionType;
    Value: string;
}

export interface AutomationRule {
    ID: number;
    Name: string;
    Description: string;
    ProjectID: number | null;        // null = all projects
    Trigger: AutomationTrigger;
    TriggerValue: string;            // status name, days, field name ...
    Conditions: AutomationCondition[];
    Actions: AutomationAction[];
    Enabled: boolean;
    CreatedBy: string;
    CreatedOn: string;
    Runs7d: number;
    LastRunOn: string | null;
    LastRunStatus: AutomationRunResult | '';
}

export interface AutomationRun {
    ID: number;
    RuleID: number;
    RuleName: string;
    RunOn: string;          // ISO
    Item: string;           // e.g. CRM-12 Login rate limiting
    Result: AutomationRunResult;
    DurationMs: number;
    Message: string;
}

export interface AutomationTemplate {
    Key: string;
    Name: string;
    Description: string;
    Category: string;
    Trigger: AutomationTrigger;
    TriggerValue: string;
    Conditions: AutomationCondition[];
    Actions: AutomationAction[];
}

// ---------------- Recycle bin ----------------
export type DeletedItemType = 'Project' | 'Task' | 'Document' | 'Comment' | 'View';

export interface DeletedItem {
    ID: number;
    Type: DeletedItemType;
    Name: string;
    Location: string;
    DeletedBy: string;
    DeletedOn: string;       // ISO
    RefID: number | null;    // original record id
    IsRealProject?: boolean; // archived project coming from ProjectService
}

// ---------------- Help center ----------------
export interface HelpCategory {
    Key: string;
    Name: string;
    Description: string;
    Icon: string;            // emoji-free short glyph key used by the view
}

export interface HelpSection {
    Heading: string;
    Body: string[];
}

export interface HelpArticle {
    ID: number;
    CategoryKey: string;
    Title: string;
    Summary: string;
    Sections: HelpSection[];
    Tags: string[];
    Views: number;
    Popular: boolean;
    UpdatedOn: string;       // yyyy-MM-dd
    ReadMinutes: number;
    HelpfulYes: number;
    HelpfulNo: number;
}

export interface FaqItem {
    ID: number;
    Question: string;
    Answer: string;
}

export interface ChangelogEntry {
    Version: string;
    Date: string;            // yyyy-MM-dd
    Tag: 'New' | 'Improved' | 'Fixed';
    Title: string;
    Items: string[];
}

export interface ShortcutItem {
    Group: string;
    Keys: string[];
    Description: string;
}

export interface SystemStatusItem {
    Name: string;
    Status: 'Operational' | 'Degraded' | 'Outage';
    Uptime: number;          // %
}
