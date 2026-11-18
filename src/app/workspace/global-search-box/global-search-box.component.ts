import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Small reusable search input: press Enter to open /workspace/search?q=…
 * Exported from WorkspaceModule so it can be placed in the header.
 */
@Component({
    selector: 'app-global-search-box',
    templateUrl: './global-search-box.component.html',
    styleUrl: './global-search-box.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GlobalSearchBoxComponent {
  @Input() placeholder = 'Search projects, tasks, people…';
  value = '';

  constructor(private router: Router) { }

  onInput(event: Event) {
    this.value = (event.target as HTMLInputElement).value;
  }

  submit() {
    const q = this.value.trim();
    this.router.navigate(['/workspace/search'], { queryParams: { q: q || null } });
  }
}
