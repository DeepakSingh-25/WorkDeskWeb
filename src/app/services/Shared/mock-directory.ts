/**
 * Shared demo master data used by every mock service (projects, tasks, team, agile,
 * workflow, reports, settings, workspace) so names and IDs match across screens.
 *
 * NOTE: OM-API me abhi in modules ke endpoints nahi hain. Jab API aaye, services is
 * file ki jagah http calls use karengi.
 */

export interface DirectoryUser {
  ID: number;
  Name: string;
  Email: string;
  Phone: string;
  Designation: string;
  DepartmentID: number;
  TeamID: number;
  ManagerID: number | null;
  Location: string;
  JoinedOn: string;            // yyyy-MM-dd
  Status: 'Active' | 'Invited' | 'Inactive';
  RoleID: number;              // see ROLES
  WeeklyCapacityHours: number;
  Skills: string[];
}

export interface Department {
  ID: number;
  Name: string;
  HeadID: number;
  Description: string;
}

export interface Team {
  ID: number;
  Name: string;
  DepartmentID: number;
  LeadID: number;
  Description: string;
}

export interface DirectoryProject {
  ID: number;
  Name: string;
  Prefix: string;
}

export const DEPARTMENTS: Department[] = [
  { ID: 1, Name: 'Engineering', HeadID: 1, Description: 'Product development, QA and DevOps' },
  { ID: 2, Name: 'Product & Design', HeadID: 4, Description: 'Product management, UX and UI design' },
  { ID: 3, Name: 'Data & Analytics', HeadID: 8, Description: 'Data engineering and BI' },
  { ID: 4, Name: 'Operations', HeadID: 7, Description: 'Infrastructure, support and delivery' },
];

export const TEAMS: Team[] = [
  { ID: 1, Name: 'Web Platform', DepartmentID: 1, LeadID: 1, Description: 'CRM portal and web apps' },
  { ID: 2, Name: 'Mobile', DepartmentID: 1, LeadID: 2, Description: 'HRMS and field mobile apps' },
  { ID: 3, Name: 'QA & Automation', DepartmentID: 1, LeadID: 5, Description: 'Testing and test automation' },
  { ID: 4, Name: 'UX Studio', DepartmentID: 2, LeadID: 4, Description: 'Research, UX and visual design' },
  { ID: 5, Name: 'Data Engineering', DepartmentID: 3, LeadID: 8, Description: 'ETL, warehouse and reporting' },
  { ID: 6, Name: 'Infra & Support', DepartmentID: 4, LeadID: 7, Description: 'Network, cloud and L2 support' },
];

export const ROLES = [
  { ID: 1, Name: 'Super Admin' },
  { ID: 2, Name: 'Admin' },
  { ID: 3, Name: 'Project Manager' },
  { ID: 4, Name: 'Member' },
  { ID: 5, Name: 'Viewer' },
];

/** Same 8 people as ProjectService / TaskService (IDs and names must stay in sync). */
export const USERS: DirectoryUser[] = [
  { ID: 1, Name: 'Aarav Sharma', Email: 'aarav.sharma@example.com', Phone: '+91 98200 11001', Designation: 'Engineering Manager', DepartmentID: 1, TeamID: 1, ManagerID: null, Location: 'Mumbai', JoinedOn: '2021-04-12', Status: 'Active', RoleID: 1, WeeklyCapacityHours: 40, Skills: ['Angular', '.NET', 'Architecture'] },
  { ID: 2, Name: 'Priya Verma', Email: 'priya.verma@example.com', Phone: '+91 98200 11002', Designation: 'Mobile Lead', DepartmentID: 1, TeamID: 2, ManagerID: 1, Location: 'Pune', JoinedOn: '2022-01-03', Status: 'Active', RoleID: 3, WeeklyCapacityHours: 40, Skills: ['Flutter', 'Kotlin', 'Firebase'] },
  { ID: 3, Name: 'Rohit Mehta', Email: 'rohit.mehta@example.com', Phone: '+91 98200 11003', Designation: 'Senior Developer', DepartmentID: 1, TeamID: 1, ManagerID: 1, Location: 'Mumbai', JoinedOn: '2020-08-17', Status: 'Active', RoleID: 4, WeeklyCapacityHours: 40, Skills: ['.NET', 'SQL Server', 'Payments'] },
  { ID: 4, Name: 'Sneha Iyer', Email: 'sneha.iyer@example.com', Phone: '+91 98200 11004', Designation: 'Head of Design', DepartmentID: 2, TeamID: 4, ManagerID: null, Location: 'Bengaluru', JoinedOn: '2021-11-22', Status: 'Active', RoleID: 2, WeeklyCapacityHours: 40, Skills: ['Figma', 'UX Research', 'Design Systems'] },
  { ID: 5, Name: 'Karan Patel', Email: 'karan.patel@example.com', Phone: '+91 98200 11005', Designation: 'QA Lead', DepartmentID: 1, TeamID: 3, ManagerID: 1, Location: 'Ahmedabad', JoinedOn: '2022-06-06', Status: 'Active', RoleID: 4, WeeklyCapacityHours: 40, Skills: ['Selenium', 'Playwright', 'API Testing'] },
  { ID: 6, Name: 'Neha Gupta', Email: 'neha.gupta@example.com', Phone: '+91 98200 11006', Designation: 'Product Manager', DepartmentID: 2, TeamID: 4, ManagerID: 4, Location: 'Delhi', JoinedOn: '2023-02-14', Status: 'Active', RoleID: 3, WeeklyCapacityHours: 40, Skills: ['Roadmaps', 'Analytics', 'Scrum'] },
  { ID: 7, Name: 'Vikram Singh', Email: 'vikram.singh@example.com', Phone: '+91 98200 11007', Designation: 'Infra Lead', DepartmentID: 4, TeamID: 6, ManagerID: null, Location: 'Jaipur', JoinedOn: '2019-09-30', Status: 'Active', RoleID: 3, WeeklyCapacityHours: 32, Skills: ['Azure', 'Networking', 'Kubernetes'] },
  { ID: 8, Name: 'Ananya Rao', Email: 'ananya.rao@example.com', Phone: '+91 98200 11008', Designation: 'Data Engineer', DepartmentID: 3, TeamID: 5, ManagerID: null, Location: 'Hyderabad', JoinedOn: '2023-07-10', Status: 'Active', RoleID: 4, WeeklyCapacityHours: 40, Skills: ['Python', 'Spark', 'Power BI'] },
];

/** Same active projects as TaskService. */
export const PROJECTS: DirectoryProject[] = [
  { ID: 1, Name: 'CRM Portal Revamp', Prefix: 'CRM' },
  { ID: 2, Name: 'HRMS Mobile App', Prefix: 'HRM' },
  { ID: 4, Name: 'Data Warehouse Setup', Prefix: 'DWH' },
  { ID: 6, Name: 'Network Monitoring (NMS)', Prefix: 'NMS' },
  { ID: 7, Name: 'Sales Desk Automation', Prefix: 'SDA' },
];

/** Logged-in user for demo purposes (same as TaskService.currentUser). */
export const CURRENT_USER_ID = 1;

export function userName(ID: number | null | undefined): string {
  return USERS.find(u => u.ID === ID)?.Name || '';
}

export function deptName(ID: number | null | undefined): string {
  return DEPARTMENTS.find(d => d.ID === ID)?.Name || '';
}

export function teamName(ID: number | null | undefined): string {
  return TEAMS.find(t => t.ID === ID)?.Name || '';
}

/** yyyy-MM-dd for a Date (local time) */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** yyyy-MM-dd for today + n days */
export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}
