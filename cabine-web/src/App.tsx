import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from './components/RequireAuth';
import { GENERAL_HEALTH } from './modules/health/questionnaires';
import { KioskProvider } from './kiosk/KioskContext';
import { BloodPressurePage } from './pages/admin/BloodPressurePage';
import { OximeterPage } from './pages/admin/OximeterPage';
import { PeoplePage } from './pages/admin/PeoplePage';
import { ScalePage } from './pages/admin/ScalePage';
import { ScalesPage } from './pages/admin/ScalesPage';
import { CompletionPage } from './pages/kiosk/CompletionPage';
import { KioskBloodPressurePage } from './pages/kiosk/KioskBloodPressurePage';
import { KioskOximeterPage } from './pages/kiosk/KioskOximeterPage';
import { KioskScalePage } from './pages/kiosk/KioskScalePage';
import { MenuPage } from './pages/kiosk/MenuPage';
import { KioskMentalHealthPage } from './pages/kiosk/MentalHealthPage';
import { QuestionnairePage } from './pages/kiosk/QuestionnairePage';
import { RecordsPage } from './pages/kiosk/RecordsPage';
import { RegistrationLoginPage } from './pages/kiosk/RegistrationLoginPage';
import { RegistrationPage } from './pages/kiosk/RegistrationPage';
import { ReportPage } from './pages/kiosk/ReportPage';
import { WelcomePage } from './pages/kiosk/WelcomePage';

export function App() {
    return (
        <KioskProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<WelcomePage />} />
                    <Route path="/matricula" element={<RegistrationLoginPage />} />
                    <Route path="/cadastro" element={<RegistrationPage />} />
                    <Route element={<RequireAuth />}>
                        <Route path="/menu" element={<MenuPage />} />
                        <Route
                            path="/saude-geral"
                            element={<QuestionnairePage def={GENERAL_HEALTH} />}
                        />
                        <Route path="/saude-mental" element={<KioskMentalHealthPage />} />
                        <Route path="/bioimpedancia" element={<KioskScalePage />} />
                        <Route path="/oximetro" element={<KioskOximeterPage />} />
                        <Route path="/pressao" element={<KioskBloodPressurePage />} />
                        <Route path="/conclusao" element={<CompletionPage />} />
                        <Route path="/relatorio" element={<ReportPage />} />
                        <Route path="/registros" element={<RecordsPage />} />
                        <Route path="/admin/avaliacao" element={<ScalePage />} />
                        <Route path="/admin/oximetria" element={<OximeterPage />} />
                        <Route path="/admin/pressao" element={<BloodPressurePage />} />
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
