import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { HeaderResponsiveComponent } from './header-responsive.component';

describe('HeaderResponsiveComponent', () => {
  let component: HeaderResponsiveComponent;
  let fixture: ComponentFixture<HeaderResponsiveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HeaderResponsiveComponent],
      imports: [FontAwesomeModule],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderResponsiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
