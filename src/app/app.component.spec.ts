import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

// AppComponent is an NgModule component (standalone: false) → declarations, not imports.
// Child components (header, sidebar, loader …) are not under test here.
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      providers: [provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('starts with the blank screen until the content is shown', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.showContent).toBeFalse();
  });
});
