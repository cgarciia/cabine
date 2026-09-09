import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { PeoplePage } from './pages/PeoplePage';
import { ScalePage } from './pages/ScalePage';
import { ScalesPage } from './pages/ScalesPage';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<ScalePage />} />
                <Route path="/pessoas" element={<PeoplePage />} />
                <Route path="/balancas" element={<ScalesPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
