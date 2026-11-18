import { IconDefinition, faBookmark, faBug, faCheck } from '@fortawesome/free-solid-svg-icons';
import { TaskUi } from '../task/task-ui';
import { IssueType, SprintState } from '../Interface/agile';

/** View helpers for the agile screens (builds on TaskUi: avatars, initials, status colours, dates). */
export class AgileUi extends TaskUi {
  static issueTypes: IssueType[] = ['Story', 'Bug', 'Task'];
  static fibonacci = [1, 2, 3, 5, 8, 13, 21];

  static typeIcon(type: string): IconDefinition {
    return type === 'Bug' ? faBug : type === 'Task' ? faCheck : faBookmark;
  }

  static typeColor(type: string): string {
    return type === 'Bug' ? '#E0401C' : type === 'Task' ? '#0043E0' : '#029848';
  }

  static sprintStateClass(state: SprintState | string): string {
    return state === 'Active' ? 'st-progress' : state === 'Completed' ? 'st-completed' : 'st-notstarted';
  }

  static epicStatusClass(status: string): string {
    return status === 'Done' ? 'st-completed' : status === 'In Progress' ? 'st-progress' : 'st-todo';
  }

  /** translucent background for an epic chip */
  static tint(color: string, alpha = 0.12): string {
    const c = (color || '#0043E0').replace('#', '');
    const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  static sprintDays(start: string, end: string): number {
    return TaskUi.daysBetween(start, end) + 1;
  }
}
