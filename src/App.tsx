import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';
import DashboardScreen from './screens/dashboard/DashboardScreen';
import { Onboarding } from './screens/onboarding/Onboarding';
import { CheckIn } from './screens/checkIn/CheckIn';
import { FoodDetail } from './screens/foodDetail/FoodDetail';
import { RecipeBuilder } from './screens/recipeBuilder/RecipeBuilder';
import HabitTracker from './screens/HabitTracker';
import PeriodTracker from './screens/PeriodTracker';
import ProgressPhotos from './screens/ProgressPhotos';
import SettingsScreen from './screens/settings/SettingsScreen';
import MoreScreen from './screens/placeholders/MoreScreen';

// History & Trends pulls in Recharts, which (per PART5_PROGRESS_REPORT.md's bundle-size
// note) is the single biggest contributor to bundle size of anything in the app —
// code-split so the other three tabs (and both single-task flows) never pay for it.
const HistoryTrends = lazy(() => import('./screens/HistoryTrends'));

// Part 3's navigation shell, since extended to wire in Part 4 and Part 5's real
// screens in place of the placeholders it originally pointed at, plus two routes that
// didn't exist before integration: Food/Recipe Detail and Recipe Builder (§9.4/§9.5)
// had no navigation path to them anywhere — Search Results used an inline expand
// instead (see SearchResultRow.tsx's own comment on why, and on the "Details" link
// added there once this route existed).
//
// HashRouter, not BrowserRouter: this app deploys as a static GitHub Pages site with no
// server-side rewrite rule (see the routing rationale this file originally shipped
// with, preserved in git history / PROGRESS_REPORT_PART3.md).
//
// Onboarding, Check-in, Food/Recipe Detail, and Recipe Builder render outside
// RootLayout (no bottom nav) — focused, single-task flows a person steps into and back
// out of, each with its own explicit back/close affordance. Trends, Habits, Period
// Tracker, and Progress Photos render inside it: all four are self-contained,
// zero-required-prop screens that were explicitly built with "no nav chrome" of their
// own (see e.g. PeriodTracker/index.tsx's header comment), on the assumption that
// whatever embeds them supplies navigation — the bottom nav does that job directly for
// Trends/Habits, and indirectly for Period Tracker/Progress Photos (reached via More,
// with the tab bar still visible to jump elsewhere from there).
export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route
            path="/trends"
            element={
              <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading…</div>}>
                <HistoryTrends />
              </Suspense>
            }
          />
          <Route path="/habits" element={<HabitTracker />} />
          <Route path="/more" element={<MoreScreen />} />
          <Route path="/period-tracker" element={<PeriodTracker />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/progress-photos" element={<ProgressPhotos />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/check-in" element={<CheckInRoute />} />
        <Route path="/food/:foodItemId" element={<FoodDetailRoute />} />
        <Route path="/recipe-builder" element={<RecipeBuilderRoute />} />
      </Routes>
    </HashRouter>
  );
}

// --- Thin route wrappers ---------------------------------------------------------
// Each real screen takes plain props (onComplete/onDone/onBack/etc.), by design, with
// no assumption baked in about react-router — see PART4_PROGRESS_REPORT.md's "Suggested
// next steps" §3. These wrappers are the "thin integration layer" that report
// anticipated: they read whatever the router provides (URL params) and translate the
// screen's own callback contract into navigation.

function OnboardingRoute() {
  const navigate = useNavigate();
  // Onboarding persists profile/weigh-in/first check-in itself before calling
  // onComplete (PART4_PROGRESS_REPORT.md, "On submit:") — this only needs to navigate.
  return <Onboarding onComplete={() => navigate('/', { replace: true })} />;
}

function CheckInRoute() {
  const navigate = useNavigate();
  return (
    <CheckIn
      onDone={() => navigate('/', { replace: true })}
      onClose={() => navigate('/', { replace: true })}
    />
  );
}

function FoodDetailRoute() {
  const { foodItemId } = useParams<{ foodItemId: string }>();
  const navigate = useNavigate();
  if (!foodItemId) return <Navigate to="/" replace />;
  return (
    <FoodDetail
      foodItemId={foodItemId}
      onBack={() => navigate(-1)}
      onLogged={() => navigate(-1)}
    />
  );
}

function RecipeBuilderRoute() {
  const navigate = useNavigate();
  return <RecipeBuilder onSaved={() => navigate(-1)} onCancel={() => navigate(-1)} />;
}
