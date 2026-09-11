import { type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { HealthDonePage, HealthPage } from './pages/HealthPage';
import { ClinicianHomePage, ClinicianSessionPage } from './pages/ClinicianHomePage';
import { HubPage } from './pages/HubPage';
import { MentalHealthPage } from './pages/MentalHealthPage';
import { OximeterPage } from './pages/OximeterPage';
import { PeoplePage } from './pages/PeoplePage';
import { RoleEntryPage } from './pages/RoleEntryPage';
import { ScalePage } from './pages/ScalePage';
import { ScalesPage } from './pages/ScalesPage';
import { SettingsPage } from './pages/SettingsPage';
import { RequireRole } from './role/RequireRole';
import { RoleProvider, useRole } from './role/RoleContext';

function Gate({ children }: { children: ReactNode }) {
    const { role } = useRole();
    if (!role) return <Navigate to="/entrar" replace />;
    return children;
}

function Home() {
    const { role } = useRole();
    if (!role) return <Navigate to="/entrar" replace />;
    if (role === 'clinician') return <Navigate to="/clinico" replace />;
    return <HubPage />;
}

function App() {
    return (
        <RoleProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/entrar" element={<RoleEntryPage />} />
                    <Route path="/" element={<Home />} />
                    <Route path="/configuracoes" element={<Gate><SettingsPage /></Gate>} />

                    <Route path="/saude" element={<RequireRole allow="patient"><HealthPage /></RequireRole>} />
                    <Route path="/saude/fim" element={<RequireRole allow="patient"><HealthDonePage /></RequireRole>} />
                    <Route path="/saude-mental" element={<RequireRole allow="patient"><MentalHealthPage /></RequireRole>} />
                    <Route path="/avaliacao" element={<RequireRole allow="patient"><ScalePage /></RequireRole>} />
                    <Route path="/oximetria" element={<RequireRole allow="patient"><OximeterPage /></RequireRole>} />
                    <Route path="/clinico/oximetria" element={<RequireRole allow="clinician"><OximeterPage /></RequireRole>} />

                    <Route path="/clinico" element={<RequireRole allow="clinician"><ClinicianHomePage /></RequireRole>} />
                    <Route path="/clinico/sessao" element={<RequireRole allow="clinician"><ClinicianSessionPage /></RequireRole>} />
                    <Route path="/pessoas" element={<RequireRole allow="clinician"><PeoplePage /></RequireRole>} />
                    <Route path="/balancas" element={<RequireRole allow="clinician"><ScalesPage /></RequireRole>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </RoleProvider>
    );
}

export default App;
