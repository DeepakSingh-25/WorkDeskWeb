/** Workflow & Approval module models (mock data, see WorkflowService). */

export type WorkflowEntity = 'Task' | 'Bug' | 'Leave request' | 'Expense' | 'Change request';
export type WorkflowState = 'Active' | 'Draft' | 'Archived';
export type WfNodeType = 'Start' | 'Step' | 'Approval' | 'Condition' | 'Notification' | 'End';
export type StatusCategory = 'To Do' | 'In Progress' | 'Done';
export type ApproverType = 'User' | 'Role' | 'Manager';

export interface WfNode {
  ID: string;
  Type: WfNodeType;
  Name: string;
  X: number;
  Y: number;
  /** Step */
  Category?: StatusCategory;
  SlaHours?: number | null;
  /** Approval */
  ApproverType?: ApproverType;
  ApproverID?: number | null;          // user ID or role ID (depending on ApproverType)
  ApprovalRule?: 'Any' | 'All';
  /** Condition */
  Field?: string;
  Operator?: string;
  Value?: string;
  /** Notification */
  NotifyTarget?: 'Requester' | 'Assignee' | 'Manager' | 'User' | 'Role';
  NotifyID?: number | null;
  Channel?: 'Email' | 'In-app' | 'Email + In-app';
  Message?: string;
  /** End */
  Outcome?: 'Completed' | 'Approved' | 'Rejected' | 'Cancelled';
}

export interface WfEdge {
  ID: string;
  From: string;
  To: string;
  Label: string;
  Branch?: 'Yes' | 'No' | '';
}

export interface Workflow {
  ID: number;
  Name: string;
  Description: string;
  AppliesTo: WorkflowEntity;
  ProjectIDs: number[];
  Status: WorkflowState;
  Version: number;
  UpdatedByID: number;
  UpdatedOn: string;                    // ISO date-time
  Nodes: WfNode[];
  Edges: WfEdge[];
}

export interface WorkflowStatusDef {
  ID: number;
  Name: string;
  Category: StatusCategory;
  Color: string;
  Description: string;
  SortOrder: number;
  UsedBy?: number;                      // computed: number of workflows using it
}

export interface TransitionRule {
  FromID: number;
  ToID: number;
  RequiredFields: string[];
  RoleIDs: number[];                    // empty = everyone
}

export type ApprovalState = 'Pending' | 'Approved' | 'Rejected';

export interface ApprovalStep {
  Step: number;
  Name: string;
  ApproverID: number | null;
  ApproverLabel: string;
  Status: 'Approved' | 'Rejected' | 'Pending' | 'Waiting' | 'Delegated' | 'Submitted';
  On: string | null;                    // ISO
  Comment: string;
}

export interface ApprovalComment {
  UserID: number;
  Text: string;
  On: string;
}

export interface ApprovalRequest {
  ID: number;
  Key: string;
  Type: WorkflowEntity;
  Title: string;
  RequesterID: number;
  ApproverID: number | null;            // current approver
  SubmittedOn: string;                  // ISO
  DueOn: string;                        // ISO (SLA due)
  DecidedOn: string | null;
  Priority: 'Low' | 'Medium' | 'High' | 'Critical';
  WorkflowID: number;
  WorkflowName: string;
  CurrentStep: number;
  TotalSteps: number;
  Status: ApprovalState;
  Fields: { Label: string; Value: string }[];
  Attachments: { Name: string; Size: number }[];
  Timeline: ApprovalStep[];
  Comments: ApprovalComment[];
  RejectReason?: string;
}

export interface EscalationLevel {
  AfterHours: number;
  Action: 'Notify' | 'Reassign' | 'Raise priority';
  TargetType: ApproverType;
  TargetID: number | null;
}

export interface SlaPolicy {
  ID: number;
  Name: string;
  AppliesTo: WorkflowEntity;
  Priorities: string[];
  ResponseHours: number;
  ResolutionHours: number;
  BusinessHoursOnly: boolean;
  Active: boolean;
  Escalations: EscalationLevel[];
}

export interface BusinessHours {
  WorkingDays: string[];
  Start: string;                        // HH:mm
  End: string;
  Timezone: string;
  Holidays: { Date: string; Name: string }[];
}

export interface SlaKpis {
  AtRisk: number;
  BreachedThisWeek: number;
  Compliance: number;                   // %
  ActivePolicies: number;
}

export type CustomFieldType = 'Text' | 'Number' | 'Date' | 'Dropdown' | 'Multi-select' | 'Checkbox' | 'User' | 'URL';

export interface CustomField {
  ID: number;
  Name: string;
  Key: string;
  Type: CustomFieldType;
  Required: boolean;
  HelpText: string;
  Options: string[];
  AppliesTo: WorkflowEntity[];
}

export interface FormCell {
  FieldID: number;
  Required: boolean;
}

export interface FormRow {
  ID: string;
  Columns: 1 | 2;
  Cells: (FormCell | null)[];
}

export interface FormLayout {
  Entity: WorkflowEntity;
  Rows: FormRow[];
  UpdatedOn: string | null;
}
