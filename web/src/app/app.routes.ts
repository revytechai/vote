import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'e/hackathon-2026' },
  {
    path: 'results',
    title: 'Results — OpenZFS Hackathon',
    loadComponent: () => import('./pages/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'e/:slug',
    title: 'Event — OpenZFS Hackathon',
    loadComponent: () => import('./pages/event-page').then((m) => m.EventPage),
  },
  {
    path: 'e/:slug/submissions',
    title: 'Submissions — OpenZFS Hackathon',
    loadComponent: () => import('./pages/submissions-page').then((m) => m.SubmissionsPage),
  },
  {
    path: 'e/:slug/vote',
    title: 'Vote — OpenZFS Hackathon',
    loadComponent: () => import('./pages/vote-page').then((m) => m.VotePage),
  },
  {
    path: 'e/:slug/results',
    title: 'Results — OpenZFS Hackathon',
    loadComponent: () => import('./pages/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'e/:slug/prizes',
    title: 'Prizes — OpenZFS Hackathon',
    loadComponent: () => import('./pages/prizes-page').then((m) => m.PrizesPage),
  },
  {
    path: 'e/:slug/register',
    title: 'Register — OpenZFS Hackathon',
    loadComponent: () => import('./pages/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'e/:slug/submit',
    title: 'Submit a project — OpenZFS Hackathon',
    loadComponent: () => import('./pages/submit-page').then((m) => m.SubmitPage),
  },
  {
    path: 's/:id',
    title: 'Submission — OpenZFS Hackathon',
    loadComponent: () => import('./pages/submission-detail-page').then((m) => m.SubmissionDetailPage),
  },
  { path: '**', redirectTo: '' },
];
