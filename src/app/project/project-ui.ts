/** Small view helpers shared by all project screens (status colours, initials, dates). */
export class ProjectUi {
  static statusOptions = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
  static priorityOptions = ['Low', 'Medium', 'High', 'Critical'];
  static milestoneStatusOptions = ['Pending', 'In Progress', 'Completed', 'Delayed'];

  static statusClass(status: string): string {
    switch (status) {
      case 'In Progress': return 'st-progress';
      case 'On Hold': return 'st-hold';
      case 'Completed': return 'st-completed';
      case 'Cancelled': return 'st-cancelled';
      case 'Delayed': return 'st-delayed';
      case 'Pending': return 'st-pending';
      default: return 'st-notstarted';
    }
  }

  static priorityClass(priority: string): string {
    return 'pr-' + (priority || 'medium').toLowerCase();
  }

  static healthClass(health: string): string {
    return health === 'Off Track' ? 'hl-offtrack' : health === 'At Risk' ? 'hl-atrisk' : 'hl-ontrack';
  }

  static progressClass(progress: number, health?: string): string {
    if (progress >= 100) return 'green';
    if (health === 'Off Track') return 'red';
    if (health === 'At Risk') return 'orange';
    return '';
  }

  static initials(name: string): string {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  }

  static avatarClass(seed: string | number): string {
    const s = String(seed);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % 6;
    return 'av-' + h;
  }

  static daysBetween(from: string, to: string): number {
    return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000);
  }

  static today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  static daysLeft(endDate: string): number {
    return ProjectUi.daysBetween(ProjectUi.today(), endDate);
  }
}
