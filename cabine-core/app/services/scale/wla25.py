"""WLA25 — algoritmo Fitdays/ICOMON de composição corporal.

Portado de openScale `Wla25BodyComposition.kt` (GPL-3.0), por sua vez extraído
de `ICBodyFatAlgorithmWLA25::calc` em `libICBodyFatAlgorithms.so`.

A balança envia só peso + 10 impedâncias; gordura/água/músculo são calculados aqui.
Slots 0 e 5 são os líderes “pequenos” (~15–25 Ω) de cada banda; os outros oito
são membros (~100–700 Ω).
"""

from __future__ import annotations

from dataclasses import dataclass


BFR_MIN = 3.0
BFR_MAX = 60.0
SEX_MALE = 1
SEX_FEMALE = 2


@dataclass(frozen=True)
class Wla25Result:
    weight_kg: float
    bmi: float
    fat_pct: float
    water_pct: float
    muscle_pct: float
    muscle_kg: float
    bone_kg: float
    subcutaneous_fat_pct: float
    visceral_fat: int
    protein_pct: float
    skeletal_muscle_pct: float
    bmr_kcal: int
    lbm_kg: float
    fat_kg: float


def round1(value: float) -> float:
    """Arredondamento half-up em float32, como a lib do fabricante."""
    v = float(value)
    # Emular float32 estreito o suficiente para o caso 1.95 → 1.9.
    v32 = float(f"{v:.8g}")
    whole = int(v32) if v32 >= 0 else -int(-v32)
    frac = v32 - whole
    tenths = frac * 10.0
    carried = tenths + 1.0 if (tenths % 1.0) > 0.5 else tenths
    return int(carried) / 10.0 + whole


def bmi(height_cm: int, weight_kg: float) -> float:
    return weight_kg * 10000.0 / (height_cm * height_cm)


def impedances_valid(imps: list[float]) -> bool:
    if len(imps) != 10:
        return False
    if imps[0] < 1.0 or imps[5] < 1.0:
        return False
    for i in (1, 2, 3, 4, 6, 7, 8, 9):
        if imps[i] < 100.0:
            return False
    return True


def to_wla25_order(zs: list[float]) -> list[float]:
    """Converte ordem do fio A7 (4 membros + líder) para ordem WLA25 (líder + 4 membros)."""
    if len(zs) < 10:
        return list(zs)
    vals = [float(z) for z in zs[:10]]
    if vals[0] < 80 and vals[5] < 80 and min(vals[1:5]) >= 80 and min(vals[6:10]) >= 80:
        return vals
    a, b = vals[:5], vals[5:]
    if a[4] < 80 and b[4] < 120:
        return [a[4], a[0], a[1], a[2], a[3], b[4], b[0], b[1], b[2], b[3]]
    # Tenta achar o menor de cada metade como líder.
    i0 = min(range(5), key=lambda i: a[i])
    i1 = min(range(5), key=lambda i: b[i])
    ra = [a[i0]] + [a[i] for i in range(5) if i != i0]
    rb = [b[i1]] + [b[i] for i in range(5) if i != i1]
    return ra + rb


def _fat_mass(height_cm: int, weight_kg: float, imps: list[float]) -> float:
    scaled0 = imps[0] * 0.826
    scaled5 = imps[5] * 0.826 if imps[5] <= imps[0] else scaled0 - 3.0
    return (
        weight_kg * -0.138
        + height_cm * 0.164
        + round1(bmi(height_cm, weight_kg)) * 2.657
        + imps[2] * -0.053
        + imps[1] * -0.000491
        + scaled0 * -0.03
        + imps[4] * -0.127
        + imps[3] * -0.052
        + imps[7] * 0.07
        + imps[6] * 0.019
        + scaled5 * 0.439
        + imps[9] * 0.153
        + imps[8] * 0.07
        - 88.052
    )


def compute(height_cm: int, raw_weight_kg: float, imps: list[float]) -> Wla25Result | None:
    ordered = to_wla25_order(imps)
    if not impedances_valid(ordered):
        return None

    weight = round1(raw_weight_kg)
    fat = _fat_mass(height_cm, weight, ordered)
    percent = max(BFR_MIN, min(BFR_MAX, fat / weight * 100.0))
    rounded_fat = round1(percent / 100.0 * weight)
    ffm = weight - rounded_fat
    water_mass = ffm * 0.733
    muscle_percent = round1((ffm * 0.733 + ffm * 0.2) / weight * 100.0)
    bfr = round1(percent)
    visceral = int(ffm * -0.029 + rounded_fat * 0.502 - 0.477)
    visceral = max(1, min(20, visceral))

    return Wla25Result(
        weight_kg=float(weight),
        bmi=float(round1(bmi(height_cm, weight))),
        fat_pct=float(bfr),
        water_pct=float(round1(water_mass / weight * 100.0)),
        muscle_pct=float(muscle_percent),
        muscle_kg=float(round1(muscle_percent / 100.0 * weight)),
        bone_kg=float(round1(ffm * 0.067)),
        subcutaneous_fat_pct=float(round1((bfr * -0.0002 + 0.72) * bfr)),
        visceral_fat=visceral,
        protein_pct=float(round1(ffm * 0.2 / weight * 100.0)),
        skeletal_muscle_pct=float(round1((water_mass * 0.834 - 2.627) / weight * 100.0)),
        bmr_kcal=int(ffm * 21.6 + 370.0),
        lbm_kg=float(ffm),
        fat_kg=float(rounded_fat),
    )


def body_age(age: int, fat_percent: float, sex: int) -> int | None:
    """Idade metabólica (openScale / vendor lib)."""
    if age < 10:
        return age
    if sex == SEX_MALE:
        bands = [(14.0, -3), (19.0, -2), (24.0, -1), (27.0, 1), (30.0, 2), (33.0, 3), (36.0, 4)]
    else:
        bands = [(24.0, -3), (28.0, -2), (32.0, -1), (35.0, 1), (38.0, 2), (42.0, 3), (45.0, 4), (46.0, 0)]
    for upper, delta in bands:
        if fat_percent < upper:
            value = age + delta
            return value if 10 <= value <= 99 else None
    value = age + 5
    return value if 10 <= value <= 99 else None
