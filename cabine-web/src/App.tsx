import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ScalePage } from './pages/ScalePage';
import { ScalesPage } from './pages/ScalesPage';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<ScalePage />} />
                <Route path="/balancas" element={<ScalesPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
