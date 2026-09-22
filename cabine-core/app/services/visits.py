from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.schemas.blood_pressure import BloodPressureReadingResponse
from app.schemas.form_submission import FormSubmissionResponse
from app.schemas.measurement import MeasurementResponse, as_measurement_response
from app.schemas.oximeter import OximeterReadingResponse

WINDOW_MS = 45 * 60 * 1000


@dataclass
class _VisitBundle:
    id: str
    at: str
    seed_t: float
    visit_id: UUID | None
    measurement: MeasurementResponse | None = None
    oximeter: OximeterReadingResponse | None = None
    blood_pressure: BloodPressureReadingResponse | None = None
    health: FormSubmissionResponse | None = None
    mental: FormSubmissionResponse | None = None


@dataclass
class _Piece:
    t: float
    at: str
    visit_id: UUID | None
    kind: str
    measurement: MeasurementResponse | None = None
    oximeter: OximeterReadingResponse | None = None
    blood_pressure: BloodPressureReadingResponse | None = None
    form: FormSubmissionResponse | None = None


def group_saved_visits(
    measurements: list[Any],
    forms: list[Any],
    oximeter: list[Any],
    blood_pressure: list[Any],
) -> list[_VisitBundle]:
    pieces: list[_Piece] = []

    for item in measurements:
        response = as_measurement_response(item)
        at = _iso(item.created_at)
        pieces.append(
            _Piece(
                t=_time_of(at),
                at=at,
                visit_id=item.visit_id,
                kind="measurement",
                measurement=response,
            )
        )

    for item in oximeter:
        response = OximeterReadingResponse.model_validate(item)
        at = _iso(item.created_at)
        pieces.append(
            _Piece(
                t=_time_of(at),
                at=at,
                visit_id=item.visit_id,
                kind="oximeter",
                oximeter=response,
            )
        )

    for item in blood_pressure:
        response = BloodPressureReadingResponse.model_validate(item)
        at = _iso(getattr(item, "measured_at", None) or item.created_at)
        pieces.append(
            _Piece(
                t=_time_of(at),
                at=at,
                visit_id=item.visit_id,
                kind="blood_pressure",
                blood_pressure=response,
            )
        )

    for item in forms:
        if item.module not in {"health", "mental"}:
            continue
        response = FormSubmissionResponse.model_validate(item)
        at = _iso(item.created_at)
        pieces.append(
            _Piece(
                t=_time_of(at),
                at=at,
                visit_id=item.visit_id,
                kind=item.module,
                form=response,
            )
        )

    pieces.sort(key=lambda p: p.t, reverse=True)

    visits: list[_VisitBundle] = []
    by_visit_id: dict[UUID, _VisitBundle] = {}

    for piece in pieces:
        if piece.visit_id is not None:
            match = by_visit_id.get(piece.visit_id)
            if match is None:
                match = _empty_visit(piece)
                by_visit_id[piece.visit_id] = match
                visits.append(match)
            _assign_piece(match, piece)
            continue

        match = next(
            (
                visit
                for visit in visits
                if visit.visit_id is None and abs(visit.seed_t - piece.t) <= WINDOW_MS
            ),
            None,
        )
        if match is not None:
            _assign_piece(match, piece)
        else:
            visit = _empty_visit(piece)
            _assign_piece(visit, piece)
            visits.append(visit)

    visits.sort(key=lambda v: _time_of(v.at), reverse=True)
    return visits


def _empty_visit(piece: _Piece) -> _VisitBundle:
    if piece.visit_id is not None:
        synthetic = str(piece.visit_id)
    elif piece.measurement is not None:
        synthetic = str(piece.measurement.id)
    elif piece.oximeter is not None:
        synthetic = str(piece.oximeter.id)
    elif piece.blood_pressure is not None:
        synthetic = str(piece.blood_pressure.id)
    elif piece.form is not None:
        synthetic = str(piece.form.id)
    else:
        synthetic = str(int(piece.t))
    return _VisitBundle(
        id=synthetic,
        at=piece.at,
        seed_t=piece.t,
        visit_id=piece.visit_id,
    )


def _assign_piece(visit: _VisitBundle, piece: _Piece) -> None:
    if piece.kind == "measurement" and piece.measurement is not None:
        visit.measurement = _prefer_measurement(visit.measurement, piece.measurement)
    elif piece.kind == "oximeter" and piece.oximeter is not None and visit.oximeter is None:
        visit.oximeter = piece.oximeter
    elif piece.kind == "blood_pressure" and piece.blood_pressure is not None and visit.blood_pressure is None:
        visit.blood_pressure = piece.blood_pressure
    elif piece.kind == "health" and piece.form is not None and visit.health is None:
        visit.health = piece.form
    elif piece.kind == "mental" and piece.form is not None and visit.mental is None:
        visit.mental = piece.form
    if _time_of(piece.at) > _time_of(visit.at):
        visit.at = piece.at


def _prefer_measurement(
    current: MeasurementResponse | None,
    incoming: MeasurementResponse,
) -> MeasurementResponse:
    if current is None:
        return incoming
    current_bia = current.complete or _has_bia(current.impedances_ohm)
    incoming_bia = incoming.complete or _has_bia(incoming.impedances_ohm)
    if incoming_bia and not current_bia:
        return incoming
    return current


def _has_bia(impedances: Any) -> bool:
    if not isinstance(impedances, list):
        return False
    return any(isinstance(v, (int, float)) and float(v) > 0 for v in impedances)


def _iso(value: datetime | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _time_of(value: str) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return 0.0
