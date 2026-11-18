import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBell, faCodeBranch, faFlagCheckered, faListCheck, faPlay, faUserCheck } from '@fortawesome/free-solid-svg-icons';
import { TaskUi } from '../task/task-ui';
import { ROLES, USERS, PROJECTS } from '../services/Shared/mock-directory';
import { WfNodeType, WorkflowEntity } from '../Interface/workflow';

/** View helpers shared by the Workflow & Approval screens (extends TaskUi for avatars, initials, priority ...). */
export class WorkflowUi extends TaskUi {
  static entities: WorkflowEntity[] = ['Task', 'Bug', 'Leave request', 'Expense', 'Change request'];
  static users = USERS.map(u => ({ ID: u.ID, Name: u.Name }));
  static roles = ROLES.map(r => ({ ID: r.ID, Name: r.Name }));
  static projects = PROJECTS.map(p => ({ ID: p.ID, Name: p.Name, Prefix: p.Prefix }));

  static nodeIcon(t: WfNodeType): IconDefinition {
    switch (t) {
      case 'Start': return faPlay;
      case 'End': return faFlagCheckered;
      case 'Approval': return faUserCheck;
      case 'Condition': return faCodeBranch;
      case 'Notification': return faBell;
      default: return faListCheck;
    }
  }

  static wfStateClass(s: string): string {
    return s === 'Active' ? 'st-completed' : s === 'Draft' ? 'st-pending' : 'st-cancelled';
  }

  static userName(ID: number | null | undefined): string {
    return USERS.find(u => u.ID === ID)?.Name || '';
  }

  static roleName(ID: number | null | undefined): string {
    return ROLES.find(r => r.ID === ID)?.Name || '';
  }

  /** Plain words for a length of time in ms: "45 min", "1 hour", "5 hours", "2 days". */
  static inWords(ms: number): string {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return `${Math.max(1, m)} min`;
    const h = Math.round(m / 60);
    if (h < 48) return h === 1 ? '1 hour' : `${h} hours`;
    const d = Math.round(h / 24);
    return `${d} days`;
  }

  static slugify(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  }
}
