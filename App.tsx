/**
 * App.tsx — application entry point.
 *
 * Phase 1 renders a single screen directly. Navigation (Splash → Menu → Level
 * Select → Game) arrives in Phase 4; wiring a router around one screen now would
 * be structure without a purpose.
 */

import GameScreen from '@screens/GameScreen';

export default function App() {
  return <GameScreen />;
}
