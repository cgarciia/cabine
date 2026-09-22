import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { apiErrorMessage, fetchPerson, fetchPersonVisits } from '../api';
import { AppShell } from '../components/AppShell';
import type { ScalePerson, VisitBundle } from '../types';

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function sexLabel(sex: string) {
  if (sex === 'male') return 'Masculino';
  if (sex === 'female') return 'Feminino';
  return sex;
}

function metricNumber(metrics: Record<string, unknown> | null | undefined, key: string): string {
  const value = metrics?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(1);
  return '—';
}

function visitChips(visit: VisitBundle): string[] {
  const chips: string[] = [];
  if (visit.measurement) chips.push(`BIA ${visit.measurement.weight_kg.toFixed(1)} kg`);
  if (visit.blood_pressure) {
    chips.push(`${visit.blood_pressure.sys_mmhg}/${visit.blood_pressure.dia_mmhg} mmHg`);
  }
  if (visit.oximeter) chips.push(`SpO₂ ${visit.oximeter.spo2_pct}%`);
  if (visit.health) chips.push('Saúde geral');
  if (visit.mental) chips.push('Saúde mental');
  return chips;
}

export function PatientProfilePage() {
  const { personId = '' } = useParams();
  const [person, setPerson] = useState<ScalePerson | null>(null);
  const [visits, setVisits] = useState<VisitBundle[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPerson(personId), fetchPersonVisits(personId, { limit: 100 })])
      .then(([profile, visitPage]) => {
        if (cancelled) return;
        setPerson(profile);
        setVisits(visitPage.items);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Não foi possível carregar o perfil.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const compareVisits = useMemo(
    () => visits.filter((visit) => compareIds.includes(visit.id)),
    [visits, compareIds],
  );

  function toggleCompare(id: string) {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  return (
    <AppShell>
      <p style={{ margin: '0 0 1rem' }}>
        <Link className="btn-link back-link" to="/pacientes">
          <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          Pacientes
        </Link>
      </p>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="empty">Carregando…</p> : null}

      {person ? (
        <>
          <section className="profile-head">
            <h1>{person.name}</h1>
            <div className="meta-grid">
              <span>Matrícula {person.registration || '—'}</span>
              <span>
                Nascimento{' '}
                {person.birth_date
                  ? new Date(`${person.birth_date}T00:00:00`).toLocaleDateString('pt-BR')
                  : '—'}
              </span>
              <span>{person.age} anos</span>
              <span>{person.height_cm} cm</span>
              <span>{sexLabel(person.sex)}</span>
            </div>
          </section>

          <div className="compare-bar">
            <strong>Histórico de avaliações</strong>
            <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Selecione até 4 visitas para comparar
            </span>
          </div>

          {visits.length === 0 ? (
            <p className="empty">Este paciente ainda não possui avaliações registradas.</p>
          ) : (
            <div className="visits">
              {visits.map((visit) => {
                const open = openId === visit.id;
                const selected = compareIds.includes(visit.id);
                return (
                  <article key={visit.id} className="visit-card">
                    <button
                      type="button"
                      className="visit-summary"
                      onClick={() => setOpenId(open ? null : visit.id)}
                    >
                      <div className="visit-summary-top">
                        <strong>{formatWhen(visit.at)}</strong>
                        <div className="visit-summary-actions">
                          <label
                            onClick={(event) => event.stopPropagation()}
                            className="compare-toggle"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleCompare(visit.id)}
                            />
                            Comparar
                          </label>
                          <ChevronDown
                            className={open ? 'chevron open' : 'chevron'}
                            size={18}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </div>
                      </div>
                      <div className="chips">
                        {visitChips(visit).map((chip) => (
                          <span key={chip} className="chip">
                            {chip}
                          </span>
                        ))}
                        {visitChips(visit).length === 0 ? (
                          <span className="chip">Sem dados</span>
                        ) : null}
                      </div>
                    </button>

                    {open ? <VisitDetail visit={visit} /> : null}
                  </article>
                );
              })}
            </div>
          )}

          {compareVisits.length >= 2 ? <CompareTable visits={compareVisits} /> : null}
        </>
      ) : null}
    </AppShell>
  );
}

function VisitDetail({ visit }: { visit: VisitBundle }) {
  const metrics = visit.measurement?.metrics ?? null;
  const healthFindings = Array.isArray(visit.health?.payload?.findings)
    ? (visit.health?.payload?.findings as Array<{ title?: string; detail?: string }>)
    : [];
  const mentalResults = Array.isArray(visit.mental?.payload?.results)
    ? (visit.mental?.payload?.results as Array<{
        instrument?: string;
        score?: number;
        band?: string;
      }>)
    : [];

  return (
    <div className="visit-detail">
      {visit.measurement ? (
        <section className="section">
          <h3>Bioimpedância</h3>
          <p>
            Peso {visit.measurement.weight_kg.toFixed(1)} kg · IMC {metricNumber(metrics, 'imc')} ·
            Gordura {metricNumber(metrics, 'gordura_pct')}% · Músculo{' '}
            {metricNumber(metrics, 'musculo_esqueletico_kg')} kg · Água{' '}
            {metricNumber(metrics, 'agua_pct')}%
          </p>
        </section>
      ) : null}

      {visit.blood_pressure ? (
        <section className="section">
          <h3>Pressão arterial</h3>
          <p>
            {visit.blood_pressure.sys_mmhg}/{visit.blood_pressure.dia_mmhg} mmHg · Pulso{' '}
            {visit.blood_pressure.pulse_bpm} bpm
          </p>
        </section>
      ) : null}

      {visit.oximeter ? (
        <section className="section">
          <h3>Oximetria</h3>
          <p>
            SpO₂ {visit.oximeter.spo2_pct}% · Pulso {visit.oximeter.pulse_bpm} bpm
            {visit.oximeter.pi_pct != null ? ` · PI ${visit.oximeter.pi_pct}%` : ''}
          </p>
        </section>
      ) : null}

      {visit.health ? (
        <section className="section">
          <h3>Questionário de saúde geral</h3>
          <p>
            {String(visit.health.payload.label ?? visit.health.status)}
            {typeof visit.health.payload.percent === 'number'
              ? ` · ${visit.health.payload.percent}%`
              : ''}
          </p>
          {healthFindings.length > 0 ? (
            <ul>
              {healthFindings.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  {item.title}
                  {item.detail ? ` — ${item.detail}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {visit.mental ? (
        <section className="section">
          <h3>Saúde mental</h3>
          <p>Status: {visit.mental.status}</p>
          {mentalResults.length > 0 ? (
            <ul>
              {mentalResults.map((item, index) => (
                <li key={`${item.instrument}-${index}`}>
                  {item.instrument}: {item.score} ({item.band})
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CompareTable({ visits }: { visits: VisitBundle[] }) {
  const ordered = [...visits].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  return (
    <section style={{ marginTop: '1.75rem' }}>
      <h2 style={{ fontFamily: 'var(--heading)', color: 'var(--brand)', margin: '0 0 0.75rem' }}>
        Comparação
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Indicador</th>
              {ordered.map((visit) => (
                <th key={visit.id}>{formatWhen(visit.at)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Peso (kg)</td>
              {ordered.map((visit) => (
                <td key={visit.id}>
                  {visit.measurement ? visit.measurement.weight_kg.toFixed(1) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td>IMC</td>
              {ordered.map((visit) => (
                <td key={visit.id}>{metricNumber(visit.measurement?.metrics, 'imc')}</td>
              ))}
            </tr>
            <tr>
              <td>Gordura (%)</td>
              {ordered.map((visit) => (
                <td key={visit.id}>{metricNumber(visit.measurement?.metrics, 'gordura_pct')}</td>
              ))}
            </tr>
            <tr>
              <td>Pressão (mmHg)</td>
              {ordered.map((visit) => (
                <td key={visit.id}>
                  {visit.blood_pressure
                    ? `${visit.blood_pressure.sys_mmhg}/${visit.blood_pressure.dia_mmhg}`
                    : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td>SpO₂ (%)</td>
              {ordered.map((visit) => (
                <td key={visit.id}>{visit.oximeter ? visit.oximeter.spo2_pct : '—'}</td>
              ))}
            </tr>
            <tr>
              <td>Saúde geral</td>
              {ordered.map((visit) => (
                <td key={visit.id}>
                  {visit.health
                    ? String(visit.health.payload.label ?? visit.health.status)
                    : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
