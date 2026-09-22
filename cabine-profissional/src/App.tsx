import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireProfessional } from './components/RequireProfessional';
import { LoginPage } from './pages/LoginPage';
import { PatientProfilePage } from './pages/PatientProfilePage';
import { PatientsPage } from './pages/PatientsPage';
import { RegisterPage } from './pages/RegisterPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
        <Route
          path="/pacientes"
          element={
            <RequireProfessional>
              <PatientsPage />
            </RequireProfessional>
          }
        />
        <Route
          path="/pacientes/:personId"
          element={
            <RequireProfessional>
              <PatientProfilePage />
            </RequireProfessional>
          }
        />
        <Route path="*" element={<Navigate to="/pacientes" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
