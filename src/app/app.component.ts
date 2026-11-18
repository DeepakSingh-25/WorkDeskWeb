import { Component, HostListener, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from './services/Theme/theme.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {

  showContent = false;

  // ThemeService is injected here so it also follows navigation on pages without a header
  constructor(private router: Router, private theme: ThemeService){
    this.router.events
    .pipe(filter((event:any) => event instanceof NavigationEnd))
    .subscribe(() => {
      window.scrollTo(0, 0);
      this.defaultSidebarOpen();
    });
  }

  
  ngOnInit(){
    setTimeout(() => {
      this.showContent = true; // Show content after 1 second
    }, 1000);
  }

  defaultSidebarOpen(){
    let sidebar:any = document.getElementById('sidebar');

    sidebar?.classList.remove("hoverActive")
    sidebar?.addEventListener('mouseover', () => {
        sidebar.classList.add("hoverActive");
    })
    sidebar?.addEventListener("mouseleave", () => {
        sidebar.classList.remove("hoverActive");
    })
    let myScreen = screen.width;
    if (myScreen <= 670) {
      sidebar?.classList.remove('active');
    }
  }
  // Show or hide the button based on scroll position
  @HostListener('window:scroll', [])
  onWindowScroll() {
    const button = document.querySelector('#button') as HTMLElement;
    if (window.scrollY > 300) { // Adjust scroll threshold as needed
      button.classList.add('show');
    } else {
      button.classList.remove('show');
    }
  }

  // Scroll to top function
  scrollToTop() {
    this.scrollTop(300);
  }



   scrollTop(duration: number) {
    const start = window.pageYOffset;
    const startTime = performance.now();
    const documentHeight = document.body.scrollHeight;
    const windowHeight = window.innerHeight;
    const maxScroll = documentHeight - windowHeight;
    const scrollTarget = Math.max(0, Math.min(maxScroll, 0));

    const scrollAnimation = (currentTime: number) => {
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      const ease = this.easeInOutCubic(progress);
      const scrollY = start + (scrollTarget - start) * ease;

      window.scrollTo(0, scrollY);

      if (timeElapsed < duration) {
        requestAnimationFrame(scrollAnimation);
      }
    };

    requestAnimationFrame(scrollAnimation);
  }

  // Easing function for smooth scrolling
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  get getPageUrl(){
    return window.location.pathname
  }
  
}
