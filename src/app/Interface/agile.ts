/** Sprint & Agile management (Scrum) models. */

export type IssueType = 'Story' | 'Bug' | 'Task';
export type IssueStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';
export type IssuePriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type SprintState = 'Planned' | 'Active' | 'Completed';
export type EpicStatus = 'To Do' | 'In Progress' | 'Done';
export type RetroColumn = 'Well' | 'Improve' | 'Action';

export interface AcceptanceItem {
    Text: string;
    Done: boolean;
}

export interface Issue {
    ID: number;
    ProjectID: number;
    Key: string;                     // e.g. CRM-101
    Type: IssueType;
    Title: string;
    Description: string;
    AsA?: string;                    // user story template parts
    IWant?: string;
    SoThat?: string;
    StoryPoints: number | null;      // fibonacci
    Priority: IssuePriority;
    AssigneeID: number | null;
    AssigneeName: string;
    Status: IssueStatus;
    EpicID: number | null;
    SprintID: number | null;         // null = product backlog
    Rank: number;                    // lower = higher in the list
    AcceptanceCriteria: AcceptanceItem[];
    CreatedOn: string;               // yyyy-MM-dd
    CompletedOn: string | null;
}

export interface IssueAddEdit {
    AddEdit: 'A' | 'E';
    ID?: number;
    ProjectID: number;
    Type: IssueType;
    Title: string;
    Description?: string;
    AsA?: string;
    IWant?: string;
    SoThat?: string;
    StoryPoints?: number | null;
    Priority?: IssuePriority;
    AssigneeID?: number | null;
    EpicID?: number | null;
    SprintID?: number | null;
    AcceptanceCriteria?: AcceptanceItem[];
}

export interface IssueFilter {
    Type?: string;
    EpicID?: number | null;
    AssigneeID?: number | null;
    Search?: string;
}

export interface Epic {
    ID: number;
    ProjectID: number;
    Key: string;
    Name: string;
    Description: string;
    Color: string;
    Status: EpicStatus;
    OwnerID: number | null;
    StartDate: string;
    TargetDate: string;
}

export interface EpicSummary extends Epic {
    OwnerName: string;
    StoryCount: number;
    DoneCount: number;
    TotalPoints: number;
    DonePoints: number;
    Progress: number;                // 0..100 by points
}

export interface SprintCapacity {
    UserID: number;
    AvailableHours: number;          // for the whole sprint
    FocusFactor: number;             // hours per story point
}

/** One day of sprint history (points per status), drives burndown / burnup / CFD. */
export interface SprintDay {
    Date: string;
    Scope: number;
    ToDo: number;
    InProgress: number;
    InReview: number;
    Done: number;
}

export interface Sprint {
    ID: number;
    ProjectID: number;
    Name: string;
    Goal: string;
    StartDate: string;
    EndDate: string;
    State: SprintState;
    CommittedPoints: number;         // points when the sprint was started
    CompletedPoints: number;         // filled when completed
    CarriedOverPoints: number;       // filled when completed
    Capacity: SprintCapacity[];
    History: SprintDay[];
}

export interface SprintSummary {
    Committed: number;
    Completed: number;
    CarriedOver: number;
    ScopeChange: number;
    IssueCount: number;
    DoneCount: number;
}

export interface RetroCard {
    ID: number;
    SprintID: number;
    Column: RetroColumn;
    Text: string;
    AuthorID: number;
    Votes: number[];                 // user IDs that voted
    OwnerID: number | null;          // action items
    DueDate: string | null;          // action items
    Done: boolean;                   // action items
    CreatedOn: string;
}
