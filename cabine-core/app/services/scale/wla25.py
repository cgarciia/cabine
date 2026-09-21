"""WLA25 body-composition algorithm.

Ported from `ICBodyFatAlgorithmWLA25::calc` in `libICBodyFatAlgorithms.so`
(public reference: sacoma-lib). Water, muscle, BMR, score and segments come
from that library. Total fat for type=normal is not the WLA25 regression:
lean mass is held at standard FFM and excess weight becomes fat. Athlete
type still uses the impedance regression.

Slots 0 e 5 são os líderes (~15–25 Ω) de cada banda; os outros oito são
membros (~100–700 Ω). Ordem WLA25: líder + RA + LA + RL + LL, × 2 bandas.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field

BFR_MIN = 3.0
BFR_MAX = 60.0
SEX_MALE = 1
SEX_FEMALE = 2
PEOPLE_NORMAL = 0
PEOPLE_SPORTMAN = 1

# Fração de massa magra / gordura no peso-padrão (índice = sexo == masculino).
FFM_FACTOR = (0.77, 0.85)
BFM_FACTOR = (0.23, 0.15)
SCORE_CORR = (-0.958, 0.983)
# IMC-alvo do reference display (peso alvo na tela). getScore da lib continua em 22/21.
# Homem 178 cm: 22.0 → 69,7 kg; o app mostra 70,9 kg = trunc1(22.4 × 1,78²).
TARGET_BMI = (21.0, 22.4)

# Líder (slots 0 e 5) nesta hardware frequentemente vem ~3/70 Ω — a firmware
# aceita e fecha o A7. Membros precisam de ≥100 Ω. O reference display *exibe* tronco
# ~15–25 Ω; isso não é o mesmo número cru do fio.
_IMP_MIN = (1.0, 100.0, 100.0, 100.0, 100.0, 1.0, 100.0, 100.0, 100.0, 100.0)
# Quando 100 kHz > 20 kHz, scaled5 = scaled0 - 3. Precisa scaled0 ≥ 3.
_LEADER_20_FLOOR = 3.0 / 0.826 + 0.05
_LEADER_DROPOUT = 1.0
# Leituras boas desta Relaxmedic: tronco 20 kHz ~24 Ω com 100 kHz ~66 Ω.
_LEADER_20_FROM_100 = 24.1 / 65.7

# Depois de to_wla25_order: índice 1..4 = RA, LA, RL, LL.
LIMB_KEYS = ("braco_dir", "braco_esq", "perna_dir", "perna_esq")


def f32(value: float) -> float:
    """IEEE-754 binary32, como a lib do fabricante."""
    return struct.unpack("<f", struct.pack("<f", float(value)))[0]


def ceil(value: float) -> float:
    """ICAlgCommon::ceil — 1 casa, half-up, em float32."""
    x = float(value)
    ip = math.trunc(x)
    fr = f32(math.fmod(f32(x), 1.0))
    fr = f32(fr * 10.0)
    fr2 = f32(math.fmod(fr, 1.0))
    up = f32(fr + 1.0)
    if fr2 <= 0.5:
        up = fr
    up = f32(f32(math.trunc(up)) / 10.0)
    if up == 0.0 and (x - float(ip)) > 0.99:
        up = 1.0
    return float(f32(up + f32(ip)))


def q1(value: float) -> float:
    """1 casa decimal estável para JSON/UI (remove lixo de float32)."""
    return round(float(value), 1)


def trunc1(value: float) -> float:
    """1 casa decimal truncada, como o peso-alvo 70,9 kg (22,4 × 1,78² = 70,97)."""
    return math.floor(float(value) * 10.0 + 1e-4) / 10.0


round1 = ceil


def bmi(height_cm: int, weight_kg: float) -> float:
    return weight_kg * 10000.0 / (height_cm * height_cm)


def impedances_valid(imps: list[float]) -> bool:
    if len(imps) != 10:
        return False
    return all(z >= lo for z, lo in zip(imps, _IMP_MIN, strict=False))


def repair_wla_order(ordered: list[float]) -> list[float]:
    """Recupera o líder 20 kHz quando o A7 manda 0 Ω e o 100 kHz veio preenchido.

    Sem isso o WLA25 recusa a medição inteira e o relatório cai no IMC, mesmo
    com os 8 canais de membros válidos.
    """
    if len(ordered) < 10:
        return list(ordered)
    out = [float(z) for z in ordered]
    z20, z100 = out[0], out[5]
    if z20 < _LEADER_DROPOUT and z100 < _LEADER_DROPOUT:
        return out
    if z20 < _LEADER_DROPOUT and z100 >= _LEADER_DROPOUT:
        out[0] = max(_LEADER_20_FLOOR, z100 * _LEADER_20_FROM_100)
    elif z20 < _LEADER_20_FLOOR:
        out[0] = _LEADER_20_FLOOR
    if out[5] < _LEADER_DROPOUT and out[0] >= _LEADER_20_FLOOR:
        out[5] = max(_LEADER_DROPOUT, out[0] - (3.0 / 0.826))
    return out


def leader_display_ohm(z20: float, z100: float) -> tuple[float, float]:
    """Tronco como o reference display exibe: líder × 0.826; 100 kHz não pode passar o 20 kHz."""
    scaled0 = z20 * 0.826
    scaled5 = z100 * 0.826 if z100 <= z20 else scaled0 - 3.0
    return q1(scaled0), q1(scaled5)


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
    i0 = min(range(5), key=lambda i: a[i])
    i1 = min(range(5), key=lambda i: b[i])
    ra = [a[i0]] + [a[i] for i in range(5) if i != i0]
    rb = [b[i1]] + [b[i] for i in range(5) if i != i1]
    return ra + rb


def standard_bmi(age: int, sex: int) -> float:
    """IMC de referência da lib (adultos: 22 masculino / 21 feminino). Só o getScore usa."""
    del age
    return 22.0 if sex == SEX_MALE else 21.0


def target_bmi(sex: int) -> float:
    """IMC do peso-alvo reference display (22,4 homem / 21 mulher)."""
    return TARGET_BMI[sex == SEX_MALE]


def _std_weight(height_cm: int, age: int, sex: int) -> float:
    ref = f32(standard_bmi(age, sex))
    hm = f32(f32(height_cm) / 100.0)
    return f32(hm * hm * ref)


def _target_weight(height_cm: int, sex: int) -> float:
    ref = f32(target_bmi(sex))
    hm = f32(f32(height_cm) / 100.0)
    return f32(hm * hm * ref)


def standard_ffm(height_cm: int, age: int, sex: int) -> float:
    return f32(FFM_FACTOR[sex == SEX_MALE] * _std_weight(height_cm, age, sex))


def standard_bfm(height_cm: int, age: int, sex: int) -> float:
    return f32(BFM_FACTOR[sex == SEX_MALE] * _std_weight(height_cm, age, sex))


def body_score(height_cm: int, weight_kg: float, age: int, sex: int, fat_pct: float) -> int:
    """ICAlgCommon::getScore."""
    ref_bmi = f32(standard_bmi(age, sex))
    fat_kg = f32(f32(fat_pct / 100.0) * weight_kg)
    hm = f32(f32(height_cm) / 100.0)
    std_w = f32(hm * hm * ref_bmi)
    resid = f32(fat_kg - f32(BFM_FACTOR[sex == SEX_MALE] * std_w))
    score = int(
        (weight_kg - fat_kg)
        - f32(FFM_FACTOR[sex == SEX_MALE] * std_w)
        + 80.0
        + SCORE_CORR[resid < 0.0] * resid
    )
    return max(20, min(100, score))


def body_age(age: int, fat_percent: float, sex: int) -> int | None:
    """Idade metabólica (lib do fabricante)."""
    if age < 10:
        return age
    if sex == SEX_MALE:
        bands = [(14.0, -3), (19.0, -2), (24.0, -1), (27.0, 1), (30.0, 2), (33.0, 3), (36.0, 4)]
    else:
        bands = [(24.0, -3), (28.0, -2), (32.0, -1), (35.0, 1), (38.0, 2), (42.0, 3), (45.0, 4), (46.0, 0)]
    delta = 5
    for upper, step in bands:
        if fat_percent < upper:
            delta = step
            break
    value = age + delta
    if 10 <= value <= 99:
        return value
    return None


@dataclass(frozen=True)
class Wla25Segment:
    key: str
    fat_kg: float
    fat_vs_std_pct: float
    muscle_kg: float
    muscle_vs_std_pct: float


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
    water_kg: float
    protein_kg: float
    skeletal_muscle_kg: float
    metabolic_age: int | None
    body_score: int
    std_weight_kg: float
    control_weight_kg: float
    control_fat_kg: float
    control_muscle_kg: float
    segments: tuple[Wla25Segment, ...] = field(default_factory=tuple)


def _fat_mass_raw(height_cm: int, weight_kg: float, bmi_rounded: float, imps: list[float]) -> float:
    scaled0 = imps[0] * 0.826
    scaled5 = imps[5] * 0.826 if imps[5] <= imps[0] else scaled0 - 3.0
    return (
        weight_kg * -0.138
        + height_cm * 0.164
        + bmi_rounded * 2.657
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


def _segments(
    imps: list[float],
    weight: float,
    height_cm: int,
    fat_kg: float,
    lean_kg: float,
    std_bfm: float,
    std_ffm: float,
) -> tuple[Wla25Segment, ...]:
    """Regressões segmentares da lib (massa em kg e % do padrão da região)."""
    z0, z1, z2, z3, z4, z5, z6, z7, z8, z9 = imps
    scaled0 = z0 * 0.826
    scaled5 = z5 * 0.826 if z5 <= z0 else scaled0 - 3.0

    arm_fat_ra = z6 * 0.007476 + (fat_kg * 0.081201 - z1 * 0.005752) - 0.662152
    arm_fat_la = z7 * 0.007476 + (fat_kg * 0.081201 - z2 * 0.005752) - 0.662152
    leg_fat_ll = z9 * 0.008645 + (fat_kg * 0.135438 - z4 * 0.00801) + 0.492479
    leg_fat_rl = z8 * 0.008645 + (fat_kg * 0.135438 - z3 * 0.00801) + 0.492479

    if 0.3 < abs(arm_fat_la - arm_fat_ra):
        if arm_fat_la <= arm_fat_ra:
            t = (z2 + z7) / 20213.0
            arm_fat_la = (t if z2 <= z1 else -t) + arm_fat_ra
        else:
            t = (z1 + z6) / 20213.0
            arm_fat_ra = (t if z1 <= z2 else -t) + arm_fat_la
    if 0.5 < abs(leg_fat_ll - leg_fat_rl):
        if leg_fat_ll <= leg_fat_rl:
            t = (z4 + z9) / 20213.0
            leg_fat_ll = (t if z4 <= z3 else -t) + leg_fat_rl
        else:
            t = (z3 + z8) / 20213.0
            leg_fat_rl = (t if z3 <= z4 else -t) + leg_fat_ll

    if arm_fat_la < 0.1:
        arm_fat_la = (z2 + z7) / 20213.0 + 0.1
    trunk_fat = scaled0 * 0.068621 + fat_kg * 0.552545 + scaled5 * -0.131612 + 0.322704
    if arm_fat_ra < 0.1:
        arm_fat_ra = (z1 + z6) / 20113.0 + 0.1
    if trunk_fat < 0.1:
        trunk_fat = (scaled5 + scaled0) / 20203.0 + 0.1
    if leg_fat_ll < 0.1:
        leg_fat_ll = (z4 + z9) / 20213.0 + 0.1
    arm_mus_la = ((z2 * 0.002847 + lean_kg * 0.058707) - z7 * 0.005857) + 0.561911
    if leg_fat_rl < 0.1:
        leg_fat_rl = (z3 + z8) / 20113.0 + 0.1
    trunk_mus = scaled0 * 0.005246 + lean_kg * 0.440922 + scaled5 * -0.010469 - 0.275461
    if arm_mus_la < 0.2:
        # A lib reutiliza o registrador do canal 2: o piso usa músculo de tronco, não Z2.
        arm_mus_la = (trunk_mus + z7) / 20213.0 + 0.2
    arm_mus_ra = ((z1 * 0.002847 + lean_kg * 0.058707) - z6 * 0.005857) + 0.561911
    leg_mus_ll = z9 * 0.008157 + (lean_kg * 0.176554 - z4 * 0.007381) - 0.688932
    if trunk_mus < 0.7:
        trunk_mus = (scaled5 + scaled0) / 20203.0 + 0.7
    leg_mus_rl = z8 * 0.008157 + (lean_kg * 0.176554 - z3 * 0.007381) - 0.688932
    if arm_mus_ra < 0.2:
        arm_mus_ra = (z1 + z6) / 20113.0 + 0.2
    if leg_mus_ll < 0.2:
        leg_mus_ll = (z4 + z9) / 20213.0 + 0.2
    if leg_mus_rl < 0.2:
        leg_mus_rl = (z3 + z8) / 20113.0 + 0.2

    std_arm_mus = weight * 0.02 + std_ffm * 0.102 + height_cm * -0.045 + 3.752
    std_leg_mus = weight * 0.059 + std_ffm * 0.168 + height_cm * -0.056 + 4.775
    std_arm_fat = std_bfm * 0.101 + height_cm * -0.004 + 0.331
    std_leg_fat = std_bfm * 0.215 + height_cm * -0.005 + 0.391
    std_trunk_fat = height_cm * 0.006 + std_bfm * 0.389 - 0.683
    std_trunk_mus = weight * 0.166 + std_ffm * 0.485 + height_cm * -0.16 + 13.595

    def pct(value: float, standard: float) -> float:
        if standard <= 0:
            return 100.0
        return q1(ceil((value / standard) * 100.0))

    rows = (
        (LIMB_KEYS[0], arm_fat_ra, std_arm_fat, arm_mus_ra, std_arm_mus),
        (LIMB_KEYS[1], arm_fat_la, std_arm_fat, arm_mus_la, std_arm_mus),
        ("tronco", trunk_fat, std_trunk_fat, trunk_mus, std_trunk_mus),
        (LIMB_KEYS[2], leg_fat_rl, std_leg_fat, leg_mus_rl, std_leg_mus),
        (LIMB_KEYS[3], leg_fat_ll, std_leg_fat, leg_mus_ll, std_leg_mus),
    )
    return tuple(
        Wla25Segment(
            key=key,
            fat_kg=q1(ceil(fat)),
            fat_vs_std_pct=pct(fat, std_f),
            muscle_kg=q1(ceil(mus)),
            muscle_vs_std_pct=pct(mus, std_m),
        )
        for key, fat, std_f, mus, std_m in rows
    )


def compute(
    height_cm: int,
    raw_weight_kg: float,
    imps: list[float],
    *,
    sex: int = SEX_MALE,
    age: int = 30,
    people: int = PEOPLE_NORMAL,
) -> Wla25Result | None:
    ordered = repair_wla_order(to_wla25_order(imps))
    if not impedances_valid(ordered):
        return None
    if not (100 <= height_cm <= 220):
        return None
    if raw_weight_kg < 20.0 or raw_weight_kg > 200.0:
        return None

    scaled0 = ordered[0] * 0.826
    scaled5 = ordered[5] * 0.826 if ordered[5] <= ordered[0] else scaled0 - 3.0
    if scaled0 < 0.0 or scaled5 < 0.0:
        return None

    weight = float(raw_weight_kg)
    bmi_rounded = ceil(bmi(height_cm, weight))
    target_w = _target_weight(height_cm, sex)
    male = sex == SEX_MALE
    std_bfm = ceil(f32(BFM_FACTOR[male] * target_w))
    std_ffm = ceil(f32(FFM_FACTOR[male] * target_w))
    std_weight = trunc1(target_w)

    z_fat = _fat_mass_raw(height_cm, weight, bmi_rounded, ordered)
    if people == PEOPLE_SPORTMAN:
        fat_raw = z_fat
    else:
        # reference display tipo normal: magra ≈ FFM-padrão (22,4 × altura² × 0,85 no homem).
        # A regressão WLA25 sozinha dá ~35% neste corpo; o app coloca ~46% porque
        # trata o excesso de peso como gordura. Impedância ainda entra nos segmentos.
        fat_raw = weight - float(std_ffm)
    fat_pct_raw = (fat_raw / weight) * 100.0
    if fat_pct_raw < BFR_MIN:
        fat_raw = weight * 0.03
        fat_pct_raw = BFR_MIN
    elif fat_pct_raw > BFR_MAX:
        fat_raw = weight * 0.6
        fat_pct_raw = BFR_MAX
    fat_kg = ceil(fat_raw)
    fat_pct = ceil(fat_pct_raw)
    lean = weight - fat_kg

    visceral = int(fat_kg * 0.502 + lean * -0.029 - 0.477)
    visceral = max(1, min(20, visceral))

    water_mass = lean * 0.733
    muscle_pct = ceil(((water_mass + lean * 0.2) / weight) * 100.0)
    water_pct = ceil((water_mass / weight) * 100.0)
    protein_pct = ceil(((lean * 0.2) / weight) * 100.0)
    skeletal_pct = ceil(((water_mass * 0.834 - 2.627) / weight) * 100.0)
    bone_kg = ceil(lean * 0.067)
    sub_pct = ceil((fat_pct * -0.0002 + 0.72) * fat_pct)

    control_fat = ceil(std_bfm - fat_kg)
    control_muscle = ceil(std_ffm - lean)
    if control_muscle < 0.0:
        control_muscle = 0.0
    control_weight = ceil(control_muscle + control_fat)

    return Wla25Result(
        weight_kg=q1(weight),
        bmi=q1(bmi_rounded),
        fat_pct=q1(fat_pct),
        water_pct=q1(water_pct),
        muscle_pct=q1(muscle_pct),
        muscle_kg=q1(ceil(muscle_pct / 100.0 * weight)),
        bone_kg=q1(bone_kg),
        subcutaneous_fat_pct=q1(sub_pct),
        visceral_fat=visceral,
        protein_pct=q1(protein_pct),
        skeletal_muscle_pct=q1(skeletal_pct),
        bmr_kcal=int(lean * 21.6 + 370.0),
        lbm_kg=q1(lean),
        fat_kg=q1(fat_kg),
        water_kg=q1(ceil(water_mass)),
        protein_kg=q1(ceil(lean * 0.2)),
        skeletal_muscle_kg=q1(ceil(skeletal_pct / 100.0 * weight)),
        metabolic_age=body_age(age, float(fat_pct), sex),
        body_score=body_score(height_cm, weight, age, sex, float(fat_pct)),
        std_weight_kg=q1(std_weight),
        control_weight_kg=q1(control_weight),
        control_fat_kg=q1(control_fat),
        control_muscle_kg=q1(control_muscle),
        segments=_segments(ordered, weight, height_cm, fat_kg, lean, std_bfm, std_ffm),
    )


def debug_pipeline(
    height_cm: int,
    raw_weight_kg: float,
    imps: list[float],
    *,
    sex: int = SEX_MALE,
    age: int = 30,
    people: int = PEOPLE_NORMAL,
) -> dict:
    """Snapshot do que entra e sai do WLA25 — para comparar com o reference display."""
    raw = [float(z) for z in (imps or [])]
    ordered_only = to_wla25_order(raw) if len(raw) >= 10 else list(raw)
    repaired = repair_wla_order(ordered_only) if len(ordered_only) >= 10 else list(ordered_only)
    valid = impedances_valid(repaired) if len(repaired) == 10 else False
    scaled0 = repaired[0] * 0.826 if len(repaired) > 0 else None
    scaled5 = None
    if len(repaired) > 5 and scaled0 is not None:
        scaled5 = repaired[5] * 0.826 if repaired[5] <= repaired[0] else scaled0 - 3.0
    shown20, shown100 = (None, None)
    if len(repaired) >= 6:
        shown20, shown100 = leader_display_ohm(repaired[0], repaired[5])
    result = compute(
        height_cm, raw_weight_kg, raw, sex=sex, age=age, people=people,
    )
    fat_raw = None
    if valid and len(repaired) == 10:
        bmi_rounded = ceil(bmi(height_cm, float(raw_weight_kg)))
        fat_raw = round(_fat_mass_raw(height_cm, float(raw_weight_kg), bmi_rounded, repaired), 4)
    labels_fio = (
        "RA20", "LA20", "RL20", "LL20", "TR20",
        "RA100", "LA100", "RL100", "LL100", "TR100",
    )
    labels_wla = (
        "lider20", "RA20", "LA20", "RL20", "LL20",
        "lider100", "RA100", "LA100", "RL100", "LL100",
    )
    out: dict = {
        "entrada": {
            "altura_cm": height_cm,
            "peso_kg": raw_weight_kg,
            "sexo_codigo": sex,
            "idade": age,
            "tipo_people": people,
        },
        "z_fio_a7": {labels_fio[i]: raw[i] for i in range(min(10, len(raw)))},
        "z_fio_lista": raw[:10],
        "z_wla25_ordenado": {labels_wla[i]: ordered_only[i] for i in range(min(10, len(ordered_only)))},
        "z_wla25_reparado": {labels_wla[i]: repaired[i] for i in range(min(10, len(repaired)))},
        "reordenou": ordered_only != raw[: len(ordered_only)],
        "reparou_lider": repaired != ordered_only,
        "impedancias_validas": valid,
        "lider_scaled_0_826": {"20khz": scaled0, "100khz": scaled5},
        "lider_exibicao_relaxfit": {"20khz": shown20, "100khz": shown100},
        "gordura_kg_regressao_wla25": fat_raw,
        "gordura_kg_bruta_antes_teto": None if result is None else result.fat_kg,
        "modo_gordura": "atleta_wla25" if people == PEOPLE_SPORTMAN else "relaxfit_ffm_padrao",
        "recusou": result is None,
    }
    if result is None:
        return out
    out["saida"] = {
        "imc": result.bmi,
        "gordura_pct": result.fat_pct,
        "gordura_kg": result.fat_kg,
        "massa_magra_kg": result.lbm_kg,
        "agua_pct": result.water_pct,
        "agua_kg": result.water_kg,
        "musculo_pct": result.muscle_pct,
        "musculo_kg": result.muscle_kg,
        "musculo_esqueletico_pct": result.skeletal_muscle_pct,
        "musculo_esqueletico_kg": result.skeletal_muscle_kg,
        "proteina_pct": result.protein_pct,
        "proteina_kg": result.protein_kg,
        "osso_kg": result.bone_kg,
        "gordura_visceral": result.visceral_fat,
        "gordura_subcutanea_pct": result.subcutaneous_fat_pct,
        "tmb_kcal": result.bmr_kcal,
        "idade_corporal": result.metabolic_age,
        "score": result.body_score,
        "peso_ideal_kg": result.std_weight_kg,
        "controle_peso_kg": result.control_weight_kg,
        "controle_gordura_kg": result.control_fat_kg,
        "controle_musculo_kg": result.control_muscle_kg,
        "segmentos": [
            {
                "key": item.key,
                "fat_kg": item.fat_kg,
                "fat_vs_std_pct": item.fat_vs_std_pct,
                "muscle_kg": item.muscle_kg,
                "muscle_vs_std_pct": item.muscle_vs_std_pct,
            }
            for item in result.segments
        ],
    }
    return out
