import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { CabinGate } from './components/CabinGate';
import { AuthGuard } from './components/AuthGuard';
import { adminHomePath, hasModule } from './config/mvp';
import { KioskProvider } from './kiosk/KioskContext';
import { GENERAL_HEALTH } from './modules/health/questionnaires';

// Admin pages
import { BloodPressurePage } from './pages/admin/BloodPressurePage';
import { EquipmentPage } from './pages/admin/EquipmentPage';
import { WristBloodPressurePage } from './pages/admin/WristBloodPressurePage';
import { OperatorLoginPage } from './pages/admin/OperatorLoginPage';
import { OximeterPage } from './pages/admin/OximeterPage';
import { PeoplePage } from './pages/admin/PeoplePage';
import { ScalePage } from './pages/admin/ScalePage';
import { ScalesPage } from './pages/admin/ScalesPage';

// Kiosk pages
import { CompletionPage } from './pages/kiosk/CompletionPage';
import { KioskBloodPressurePage } from './pages/kiosk/KioskBloodPressurePage';
import { KioskWristBloodPressurePage } from './pages/kiosk/KioskWristBloodPressurePage';
import { KioskOximeterPage } from './pages/kiosk/KioskOximeterPage';
import { KioskScalePage } from './pages/kiosk/KioskScalePage';
import { MenuPage } from './pages/kiosk/MenuPage';
import { MentalHealthPage } from './pages/kiosk/MentalHealthPage';
import { QuestionnairePage } from './pages/kiosk/QuestionnairePage';
import { RecordsPage } from './pages/kiosk/RecordsPage';
import { RegistrationLoginPage } from './pages/kiosk/RegistrationLoginPage';
import { RegistrationPage } from './pages/kiosk/RegistrationPage';
import { ReportPage } from './pages/kiosk/ReportPage';
import { WelcomePage } from './pages/kiosk/WelcomePage';

/** Rota padrão do painel: a primeira etapa que esta porta oferece. */
const ADMIN_DEFAULT = adminHomePath();

export function App() {
    return (
        <KioskProvider>
            <BrowserRouter>
            <CabinGate>
                <Routes>
                    <Route path="/" element={<WelcomePage />} />
                    <Route path="/matricula" element={<RegistrationLoginPage />} />
                    <Route path="/cadastro" element={<RegistrationPage />} />
                    <Route path="/admin/login" element={<OperatorLoginPage />} />

                    {/* ── Kiosk (paciente autenticado) ──────────────────────── */}
                    <Route element={<AuthGuard typ="person" redirectTo="/matricula" />}>
                        <Route path="/menu" element={<MenuPage />} />

                        {hasModule('questionario') && (
                            <Route
                                path="/saude-geral"
                                element={<QuestionnairePage def={GENERAL_HEALTH} />}
                            />
                        )}
                        {hasModule('questionario') && (
                            <Route path="/saude-mental" element={<MentalHealthPage />} />
                        )}
                        {hasModule('bioimpedancia') && (
                            <Route path="/bioimpedancia" element={<KioskScalePage />} />
                        )}
                        {hasModule('oximetria') && <Route path="/oximetro" element={<KioskOximeterPage />} />}
                        {hasModule('pressao') && <Route path="/pressao" element={<KioskBloodPressurePage />} />}
                        {hasModule('pressao') && (
                            <Route path="/pressao-pulso" element={<KioskWristBloodPressurePage />} />
                        )}

                        <Route path="/conclusao" element={<CompletionPage />} />
                        <Route path="/relatorio" element={<ReportPage />} />
                        <Route path="/registros" element={<RecordsPage />} />
                    </Route>

                    {/* ── Admin (operador autenticado) ──────────────────────── */}
                    <Route element={<AuthGuard typ="user" redirectTo="/admin/login" />}>
                        <Route path="/admin" element={<Navigate to={ADMIN_DEFAULT} replace />} />

                        {hasModule('bioimpedancia') && <Route path="/admin/avaliacao" element={<ScalePage />} />}
                        {hasModule('bioimpedancia') && <Route path="/admin/balancas" element={<ScalesPage />} />}
                        {hasModule('bioimpedancia') && (
                            <Route path="/balancas" element={<Navigate to="/admin/balancas" replace />} />
                        )}
                        {hasModule('oximetria') && <Route path="/admin/oximetria" element={<OximeterPage />} />}
                        {hasModule('pressao') && <Route path="/admin/pressao" element={<BloodPressurePage />} />}
                        {hasModule('pressao') && (
                            <Route path="/admin/pressao-pulso" element={<WristBloodPressurePage />} />
                        )}

                        {/* Sempre — Pessoas e pareamento */}
                        <Route path="/admin/pessoas" element={<PeoplePage />} />
                        <Route path="/admin/equipamentos" element={<EquipmentPage />} />
                        <Route path="/pessoas" element={<Navigate to="/admin/pessoas" replace />} />

                        {/* Fallback admin */}
                        <Route path="/admin/*" element={<Navigate to={ADMIN_DEFAULT} replace />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/menu" replace />} />
                </Routes>
            </CabinGate>
            </BrowserRouter>
        </KioskProvider>
    );
}
