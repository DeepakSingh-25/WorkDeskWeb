import { Holiday, LeaveRequest } from './team';
import { Issue, Sprint } from './agile';
import { Milestone, Project } from './project';
import { Task, TaskActivity } from './task';
import { ApprovalRequest } from './workflow';

/** Link target for any dashboard item (routerLink + optional query params). */
export interface HomeLink {
    Link: string;
    QueryParams?: { [key: string]: any };
}

export interface MyProject extends Project {
    Role: 'Manager' | 'Member';
    MyOpenTasks: number;
    NextMilestone: Milestone | null;
    DaysLeft: number;
    Favourite: boolean;
}

export interface HomeMilestone extends Milestone {
    ProjectName: string;
}

export interface HomeSprint extends Sprint {
    ProjectName: string;
}

/** Everything the dashboard screens need, aggregated from the module services. */
export interface HomeContext {
    Tasks: Task[];                 // all tasks
    MyTasks: Task[];               // assigned to the current user
    Projects: MyProject[];         // projects where I am manager or member
    Milestones: HomeMilestone[];   // milestones of my projects
    Approvals: ApprovalRequest[];  // pending approvals waiting for me
    Leaves: LeaveRequest[];        // my leaves (not rejected)
    Holidays: Holiday[];
    Sprints: HomeSprint[];         // sprints of my projects
    SprintIssues: Issue[];         // active sprint issues assigned to me
}

export interface HomeMention {
    ID: number;
    TaskID: number;
    TaskKey: string;
    TaskTitle: string;
    ProjectName: string;
    UserName: string;
    Text: string;
    CreatedOn: string;
}

export type NotificationType = 'assignment' | 'mention' | 'approval' | 'due' | 'overdue' | 'milestone' | 'sprint';

export interface HomeNotification extends HomeLink {
    ID: number;
    Type: NotificationType;
    Title: string;
    Text: string;
    ActorName: string;
    ProjectName: string;
    CreatedOn: string;             // ISO
    Read: boolean;
}

export type InboxType = 'task' | 'approval' | 'mention' | 'review';

export interface InboxItem extends HomeLink {
    Key: string;                   // unique: type-id
    Type: InboxType;
    RefID: number;                 // task / approval ID
    Ref: string;                   // task key / approval key
    Title: string;
    Snippet: string;
    FromName: string;
    ProjectName: string;
    ReceivedOn: string;            // ISO
    DueOn: string;                 // yyyy-MM-dd or ''
    Priority: string;
    TaskStatus: string;
    Unread: boolean;
    Archived: boolean;
    SnoozedUntil: string;          // ISO or ''
}

export type CalendarItemType = 'task' | 'milestone' | 'leave' | 'holiday' | 'sprint';

export interface CalendarItem extends HomeLink {
    ID: string;
    Type: CalendarItemType;
    Title: string;
    Date: string;                  // yyyy-MM-dd
    Meta: string;
    Done: boolean;
    Late: boolean;
}

export type FeedType = TaskActivity['Type'] | 'milestone' | 'sprint';

export interface FeedItem extends HomeLink {
    ID: string;
    Type: FeedType;
    UserName: string;
    Text: string;
    Target: string;                // e.g. "CRM-3 Ticket SLA timer"
    ProjectID: number;
    ProjectName: string;
    CreatedOn: string;             // ISO
}
