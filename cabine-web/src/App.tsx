import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { SAUDE_GERAL, SAUDE_MENTAL } from './data/questionnaires';
import { KioskProvider } from './kiosk/KioskContext';
import { PeoplePage } from './pages/PeoplePage';
import { ScalePage } from './pages/ScalePage';
import { ScalesPage } from './pages/ScalesPage';
import { CadastroPage } from './pages/kiosk/CadastroPage';
import { ConclusaoPage } from './pages/kiosk/ConclusaoPage';
import { KioskScalePage } from './pages/kiosk/KioskScalePage';
import { MatriculaPage } from './pages/kiosk/MatriculaPage';
import { MenuPage } from './pages/kiosk/MenuPage';
import { OximetroPage } from './pages/kiosk/OximetroPage';
import { QuestionnairePage } from './pages/kiosk/QuestionnairePage';
import { RegistrosPage } from './pages/kiosk/RegistrosPage';
import { RelatorioPage } from './pages/kiosk/RelatorioPage';
import { WelcomePage } from './pages/kiosk/WelcomePage';

function App() {
    return (
        <KioskProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<WelcomePage />} />
                    <Route path="/matricula" element={<MatriculaPage />} />
                    <Route path="/cadastro" element={<CadastroPage />} />
                    <Route path="/menu" element={<MenuPage />} />
                    <Route
                        path="/saude-geral"
                        element={<QuestionnairePage def={SAUDE_GERAL} mode="saude_geral" />}
                    />
                    <Route
                        path="/saude-mental"
                        element={<QuestionnairePage def={SAUDE_MENTAL} mode="saude_mental" />}
                    />
                    <Route path="/bioimpedancia" element={<KioskScalePage />} />
                    <Route path="/oximetro" element={<OximetroPage />} />
                    <Route path="/conclusao" element={<ConclusaoPage />} />
                    <Route path="/relatorio" element={<RelatorioPage />} />
                    <Route path="/registros" element={<RegistrosPage />} />

                    {/* Admin / hardware (fluxo legado) */}
                    <Route path="/admin/avaliacao" element={<ScalePage />} />
                    <Route path="/pessoas" element={<PeoplePage />} />
                    <Route path="/balancas" element={<ScalesPage />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </KioskProvider>
    );
}

export default App;
