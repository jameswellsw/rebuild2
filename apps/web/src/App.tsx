import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { SoloPage } from './pages/SoloPage';
import { RoomPage } from './pages/RoomPage';
import { BuilderPage } from './pages/BuilderPage';
import { FieldEditorPage } from './pages/FieldEditorPage';
import { RulesPage } from './pages/RulesPage';
import { HistoryPage } from './pages/HistoryPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="solo" element={<SoloPage />} />
        <Route path="room/:code" element={<RoomPage />} />
        <Route path="builder" element={<BuilderPage />} />
        <Route path="builder/:id" element={<BuilderPage />} />
        <Route path="fields" element={<FieldEditorPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="matches" element={<HistoryPage />} />
        <Route path="play" element={<Navigate to="/solo?quick=1" replace />} />
        <Route
          path="*"
          element={
            <section className="container narrow-page empty-page">
              <span className="eyebrow">404 // Out of bounds</span>
              <h1>That page is outside the field.</h1>
              <p>The arena is this way.</p>
              <Link className="btn btn-primary" to="/">
                Return to the arena
              </Link>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
