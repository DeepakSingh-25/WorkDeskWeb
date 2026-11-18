import { Department, DirectoryUser, Team } from '../services/Shared/mock-directory';

/** Directory user + capacity settings that can be edited from the profile screen. */
export interface TeamMember extends DirectoryUser {
    WorkingDays: number[];          // 0 = Sunday ... 6 = Saturday
}

export type DepartmentItem = Department;
export type TeamItem = Team;

export type InviteStatus = 'Pending' | 'Expired' | 'Revoked' | 'Accepted';

export interface TeamInvite {
    ID: number;
    Email: string;
    RoleID: number;
    TeamID: number | null;
    Message: string;
    InvitedBy: string;
    InvitedOn: string;              // yyyy-MM-dd
    ExpiresOn: string;              // yyyy-MM-dd
    Status: InviteStatus;
    ResentCount: number;
}

export interface InviteRow {
    Email: string;
    RoleID: number;
    TeamID: number | null;
}

export type LeaveType = 'Casual' | 'Sick' | 'Earned' | 'WFH';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
    ID: number;
    UserID: number;
    UserName: string;
    Type: LeaveType;
    FromDate: string;               // yyyy-MM-dd
    ToDate: string;                 // yyyy-MM-dd
    HalfDay: boolean;
    Reason: string;
    Status: LeaveStatus;
    AppliedOn: string;              // yyyy-MM-dd
    ActionBy?: string;
}

export interface Holiday {
    Date: string;                   // yyyy-MM-dd
    Name: string;
}

/** One cell of the workload heat-grid. */
export interface WorkloadDay {
    Date: string;
    Hours: number;
    Capacity: number;
    Off: '' | 'Leave' | 'Holiday' | 'Non-working';
}

export interface WorkloadTask {
    ID: number;
    Key: string;
    Title: string;
    ProjectName: string;
    Priority: string;
    Status: string;
    DueDate: string;
    EstimateHours: number;
    RemainingHours: number;
}

export interface WorkloadRow {
    Member: TeamMember;
    OpenTasks: WorkloadTask[];
    WeekHours: number;              // planned hours in the current week (Mon-Fri)
    WeekCapacity: number;           // capacity this week after leave / holidays
    Utilization: number;            // %
    Days: WorkloadDay[];            // next 2 weeks, Mon-Fri
}
