import { Component, ChangeDetectionStrategy } from '@angular/core';

/** Shell for all settings screens: page wrapper (#settings), left settings menu and the routed content. */
@Component({
    selector: 'app-settings-layout',
    templateUrl: './settings-layout.component.html',
    styleUrl: './settings-layout.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsLayoutComponent { }
