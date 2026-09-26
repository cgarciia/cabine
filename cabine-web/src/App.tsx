import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthGuard } from './components/AuthGuard';
import { isMVP1, isMVP2 } from './config/mvp';
import { KioskProvider } from './kiosk/KioskContext';
import { GENERAL_HEALTH } from './modules/health/questionnaires';

// Admin pages
import { BloodPressurePage } from './pages/admin/BloodPressurePage';
import { OperatorLoginPage } from './pages/admin/OperatorLoginPage';
import { OximeterPage } from './pages/admin/OximeterPage';
import { PeoplePage } from './pages/admin/PeoplePage';
import { ScalePage } from './pages/admin/ScalePage';
import { ScalesPage } from './pages/admin/ScalesPage';

// Kiosk pages
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

/** Rota padrão do painel admin varia por MVP. */
const ADMIN_DEFAULT = isMVP1 ? '/admin/avaliacao' : '/admin/pressao';

export function App() {
    return (
        <KioskProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<WelcomePage />} />
                    <Route path="/matricula" element={<RegistrationLoginPage />} />
                    <Route path="/cadastro" element={<RegistrationPage />} />
                    <Route path="/admin/login" element={<OperatorLoginPage />} />

                    {/* ── Kiosk (paciente autenticado) ──────────────────────── */}
                    <Route element={<AuthGuard typ="person" redirectTo="/matricula" />}>
                        <Route path="/menu" element={<MenuPage />} />

                        {/* MVP 1 — Questionários */}
                        {isMVP1 && (
                            <Route
                                path="/saude-geral"
                                element={<QuestionnairePage def={GENERAL_HEALTH} />}
                            />
                        )}
                        {isMVP1 && <Route path="/saude-mental" element={<KioskMentalHealthPage />} />}

                        {/* MVP 1 — Bioimpedância */}
                        {isMVP1 && <Route path="/bioimpedancia" element={<KioskScalePage />} />}

                        {/* Compartilhado — Oximetria */}
                        <Route path="/oximetro" element={<KioskOximeterPage />} />

                        {/* MVP 2 — Pressão arterial */}
                        {isMVP2 && <Route path="/pressao" element={<KioskBloodPressurePage />} />}

                        <Route path="/conclusao" element={<CompletionPage />} />
                        <Route path="/relatorio" element={<ReportPage />} />
                        <Route path="/registros" element={<RecordsPage />} />
                    </Route>

                    {/* ── Admin (operador autenticado) ──────────────────────── */}
                    <Route element={<AuthGuard typ="user" redirectTo="/admin/login" />}>
                        <Route path="/admin" element={<Navigate to={ADMIN_DEFAULT} replace />} />

                        {/* MVP 1 — Bioimpedância admin */}
                        {isMVP1 && <Route path="/admin/avaliacao" element={<ScalePage />} />}
                        {isMVP1 && <Route path="/admin/balancas" element={<ScalesPage />} />}
                        {isMVP1 && (
                            <Route path="/balancas" element={<Navigate to="/admin/balancas" replace />} />
                        )}

                        {/* Compartilhado — Oximetria admin */}
                        <Route path="/admin/oximetria" element={<OximeterPage />} />

                        {/* MVP 2 — Pressão admin */}
                        {isMVP2 && <Route path="/admin/pressao" element={<BloodPressurePage />} />}

                        {/* Sempre — Pessoas */}
                        <Route path="/admin/pessoas" element={<PeoplePage />} />
                        <Route path="/pessoas" element={<Navigate to="/admin/pessoas" replace />} />

                        {/* Fallback admin */}
                        <Route path="/admin/*" element={<Navigate to={ADMIN_DEFAULT} replace />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/menu" replace />} />
                </Routes>
            </BrowserRouter>
        </KioskProvider>
    );
}
