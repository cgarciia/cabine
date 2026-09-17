import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from './components/RequireAuth';
import { SAUDE_GERAL } from './modules/health/questionnaires';
import { KioskProvider } from './kiosk/KioskContext';
import { OximeterPage } from './pages/admin/OximeterPage';
import { PeoplePage } from './pages/admin/PeoplePage';
import { ScalePage } from './pages/admin/ScalePage';
import { ScalesPage } from './pages/admin/ScalesPage';
import { CadastroPage } from './pages/kiosk/CadastroPage';
import { ConclusaoPage } from './pages/kiosk/ConclusaoPage';
import { KioskScalePage } from './pages/kiosk/KioskScalePage';
import { MatriculaPage } from './pages/kiosk/MatriculaPage';
import { MenuPage } from './pages/kiosk/MenuPage';
import { KioskMentalHealthPage } from './pages/kiosk/MentalHealthPage';
import { OximetroPage } from './pages/kiosk/OximetroPage';
import { QuestionnairePage } from './pages/kiosk/QuestionnairePage';
import { RegistrosPage } from './pages/kiosk/RegistrosPage';
import { RelatorioPage } from './pages/kiosk/RelatorioPage';
import { WelcomePage } from './pages/kiosk/WelcomePage';

export function App() {
    return (
        <KioskProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<WelcomePage />} />
                    <Route path="/matricula" element={<MatriculaPage />} />
                    <Route path="/cadastro" element={<CadastroPage />} />
                    <Route element={<RequireAuth />}>
                        <Route path="/menu" element={<MenuPage />} />
                        <Route
                            path="/saude-geral"
                            element={<QuestionnairePage def={SAUDE_GERAL} />}
                        />
                        <Route path="/saude-mental" element={<KioskMentalHealthPage />} />
                        <Route path="/bioimpedancia" element={<KioskScalePage />} />
                        <Route path="/oximetro" element={<OximetroPage />} />
                        <Route path="/conclusao" element={<ConclusaoPage />} />
                        <Route path="/relatorio" element={<RelatorioPage />} />
                        <Route path="/registros" element={<RegistrosPage />} />
                        <Route path="/admin/avaliacao" element={<ScalePage />} />
                        <Route path="/admin/oximetria" element={<OximeterPage />} />
                        <Route path="/admin/pessoas" element={<PeoplePage />} />
                        <Route path="/admin/balancas" element={<ScalesPage />} />
                        <Route path="/pessoas" element={<Navigate to="/admin/pessoas" replace />} />
                        <Route path="/balancas" element={<Navigate to="/admin/balancas" replace />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </KioskProvider>
    );
}
