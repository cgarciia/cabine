import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiErrorMessage, fetchPeople } from '../api';
import { AppShell } from '../components/AppShell';
import type { ScalePerson } from '../types';

const PAGE_SIZE = 20;

export function PatientsPage() {
  const [items, setItems] = useState<ScalePerson[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPeople({ q: q || undefined, limit: PAGE_SIZE, offset })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Não foi possível carregar os pacientes.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, offset]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setQ(draft.trim());
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <div className="toolbar">
        <h1>Pacientes</h1>
        <form className="search" onSubmit={onSearch}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Buscar por nome ou matrícula"
            aria-label="Buscar pacientes"
          />
          <button className="btn btn-ghost" type="submit">
            <Search size={16} strokeWidth={2} aria-hidden />
            Buscar
          </button>
        </form>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="empty">Carregando…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="empty">Nenhum paciente encontrado.</p>
      ) : (
        <div className="list">
          {items.map((person) => (
            <Link key={person.id} className="patient-row" to={`/pacientes/${person.id}`}>
              <div>
                <strong>{person.name}</strong>
                <small>
                  Matrícula {person.registration || '—'} · {person.age} anos · {person.height_cm} cm
                </small>
              </div>
              <ChevronRight className="row-chevron" size={18} strokeWidth={2} aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <div className="pager">
        <span>
          {total} paciente{total === 1 ? '' : 's'} · página {page} de {pages}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={offset <= 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            Próxima
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </AppShell>
  );
}
