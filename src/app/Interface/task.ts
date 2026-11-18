export type TaskStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Task {
    ID: number;
    Key: string;            // e.g. CRM-12
    ProjectID: number;
    ProjectName: string;
    Title: string;
    Description: string;
    Status: TaskStatus;
    Priority: TaskPriority;
    AssigneeID: number | null;
    AssigneeName: string;
    ReporterName: string;
    StartDate: string;      // yyyy-MM-dd
    DueDate: string;        // yyyy-MM-dd
    EstimateHours: number;
    Labels: string[];
    CreatedOn: string;      // ISO date-time
    UpdatedOn: string;      // ISO date-time
    // computed by service
    LoggedMinutes?: number;
    SubtaskTotal?: number;
    SubtaskDone?: number;
    CommentCount?: number;
    AttachmentCount?: number;
    IsBlocked?: boolean;
}

export interface Subtask {
    ID: number;
    TaskID: number;
    Title: string;
    Done: boolean;
    AssigneeName: string;
}

export interface TaskDependency {
    ID: number;
    TaskID: number;         // this task ...
    DependsOnID: number;    // ... is blocked by this task
}

export interface TaskComment {
    ID: number;
    TaskID: number;
    UserName: string;
    Text: string;
    Mentions: string[];
    CreatedOn: string;
    EditedOn?: string;
}

export interface TaskAttachment {
    ID: number;
    TaskID: number;
    FileName: string;
    FileSize: number;       // bytes
    FileType: string;       // mime type
    UploadedBy: string;
    UploadedOn: string;
    Url?: string;           // object URL for files uploaded in this session
}

export interface Worklog {
    ID: number;
    TaskID: number;
    UserName: string;
    WorkDate: string;       // yyyy-MM-dd
    Minutes: number;
    Note: string;
    CreatedOn: string;
}

export type ActivityType = 'created' | 'updated' | 'status' | 'assignee' | 'comment' | 'attachment' | 'subtask' | 'dependency' | 'worklog';

export interface TaskActivity {
    ID: number;
    TaskID: number;
    UserName: string;
    Type: ActivityType;
    Text: string;
    CreatedOn: string;
}
