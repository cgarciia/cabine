"""Estimativas a partir de peso + perfil, e BIA pública quando há impedância."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.scale.reading import SegmentImpedance


@dataclass(frozen=True)
class PersonProfile:
    """Perfil enviado à balança (igual offline/RelaxFit: idade, sexo, altura, peso, tipo)."""

    height_cm: float
    age: int
    sex: str  # "male" | "female"
    expected_weight_kg: float | None = None  # peso gravado no P-1 antes de subir
    people_type: str = "normal"  # "normal" | "athlete"
    birth_date: date | None = None
    display_name: str | None = None  # nome no comando C0 do RelaxFit

    @property
    def is_athlete(self) -> bool:
        return self.people_type in {"athlete", "sportman", "atleta"}

    @classmethod
    def from_params(
        cls,
        height_cm: float | None,
        age: int | None,
        sex: str | None,
        *,
        expected_weight_kg: float | None = None,
        people_type: str | None = None,
        birth_date: str | date | None = None,
        display_name: str | None = None,
    ) -> PersonProfile | None:
        if height_cm is None or not sex:
            return None

        birth: date | None = None
        if isinstance(birth_date, date):
            birth = birth_date
        elif isinstance(birth_date, str) and birth_date.strip():
            try:
                birth = date.fromisoformat(birth_date.strip()[:10])
            except ValueError:
                birth = None

        resolved_age = int(age) if age is not None else None
        if birth is not None:
            today = date.today()
            resolved_age = today.year - birth.year - (
                (today.month, today.day) < (birth.month, birth.day)
            )

        if resolved_age is None:
            return None

        normalized = sex.strip().lower()
        if normalized in {"m", "male", "masculino", "h", "homem"}:
            sex_key = "male"
        elif normalized in {"f", "female", "feminino", "mulher"}:
            sex_key = "female"
        else:
            return None

        if height_cm <= 0 or resolved_age <= 0:
            return None

        ptype = (people_type or "normal").strip().lower()
        if ptype in {"athlete", "sportman", "atleta", "fit"}:
            ptype = "athlete"
        else:
            ptype = "normal"

        weight: float | None = None
        if expected_weight_kg is not None:
            try:
                weight = float(expected_weight_kg)
            except (TypeError, ValueError):
                weight = None
            if weight is not None and weight <= 0:
                weight = None

        name = (display_name or "").strip() or None
        return cls(
            height_cm=float(height_cm),
            age=int(resolved_age),
            sex=sex_key,
            expected_weight_kg=weight,
            display_name=name,
            people_type=ptype,
            birth_date=birth,
        )


def _band(value: float, low: float, high: float) -> str:
    if value < low:
        return "baixo"
    if value > high:
        return "alto"
    return "saudavel"


def compute_basic_metrics(peso_kg: float, profile: PersonProfile) -> dict:
    height_m = profile.height_cm / 100.0
    imc = peso_kg / (height_m**2)

    if profile.sex == "male":
        gordura_pct = 1.20 * imc + 0.23 * profile.age - 16.2
        tmb = 10 * peso_kg + 6.25 * profile.height_cm - 5 * profile.age + 5
        peso_ideal = 22.0 * (height_m**2)
        fat_lo, fat_hi = 8.0, 20.0
    else:
        gordura_pct = 1.20 * imc + 0.23 * profile.age - 5.4
        tmb = 10 * peso_kg + 6.25 * profile.height_cm - 5 * profile.age - 161
        peso_ideal = 21.0 * (height_m**2)
        fat_lo, fat_hi = 18.0, 28.0

    gordura_pct = max(3.0, min(60.0, gordura_pct))
    gordura_kg = peso_kg * gordura_pct / 100.0
    massa_magra_kg = max(0.0, peso_kg - gordura_kg)

    return {
        "imc": round(imc, 1),
        "imc_status": _band(imc, 18.5, 24.9),
        "gordura_pct": round(gordura_pct, 1),
        "gordura_pct_status": _band(gordura_pct, fat_lo, fat_hi),
        "gordura_kg": round(gordura_kg, 1),
        "massa_magra_kg": round(massa_magra_kg, 1),
        "tmb_kcal": round(tmb),
        "peso_ideal_kg": round(peso_ideal, 1),
        "controle_peso_kg": round(peso_ideal - peso_kg, 1),
        "metodo": "imc_deurenberg",
        "aviso": "Estimativas por IMC/perfil. Diferem do relatório RelaxFit (algoritmo proprietário).",
    }


def _segment_payload(segmentos: list[SegmentImpedance]) -> list[dict]:
    return [
        {
            "nome": item.nome,
            "lado": item.lado,
            "freq_khz": item.freq_khz,
            "ohm": item.ohm,
        }
        for item in segmentos
    ]


def compute_report(
    peso_kg: float,
    profile: PersonProfile,
    impedancias_ohm: list[float] | None = None,
    segmentos: list[SegmentImpedance] | None = None,
) -> dict:
    from app.services.scale.wla25 import SEX_FEMALE, SEX_MALE, body_age, compute as wla25_compute

    result = compute_basic_metrics(peso_kg, profile)
    zs = list(impedancias_ohm or [])
    segs = list(segmentos or [])
    if segs:
        result["segmentos"] = _segment_payload(segs)
    if not zs:
        return result

    # Ordem no fio: RA, LA, RL, LL, TR × 2 bandas.
    z20 = zs[:5] if len(zs) >= 5 else zs
    z100 = zs[5:10] if len(zs) >= 10 else []
    result["z_20khz"] = z20
    result["z_100khz"] = z100

    wla = wla25_compute(int(profile.height_cm), peso_kg, zs)
    if wla is None:
        result["aviso"] = (
            "Impedâncias recebidas, mas inválidas para o algoritmo WLA25 (RelaxFit). "
            "Segure a barra com contato firme — o tronco deve medir ~15–25 Ω."
        )
        return result

    if profile.sex == "male":
        fat_lo, fat_hi = 8.0, 20.0
        water_lo, water_hi = 50.0, 65.0
        sex_code = SEX_MALE
    else:
        fat_lo, fat_hi = 18.0, 28.0
        water_lo, water_hi = 45.0, 60.0
        sex_code = SEX_FEMALE

    score = 100
    if wla.bmi < 18.5 or wla.bmi > 24.9:
        score -= min(35, int(abs(wla.bmi - 22) * 3))
    if wla.fat_pct < fat_lo or wla.fat_pct > fat_hi:
        score -= min(35, int(abs(wla.fat_pct - (fat_lo + fat_hi) / 2) * 1.5))
    score = max(15, min(99, score))

    balance = None
    if len(z20) >= 5:
        arms = (
            round(abs(z20[0] - z20[1]) / max(z20[0] + z20[1], 1) * 200, 1)
            if z20[0] >= 40 and z20[1] >= 40
            else None
        )
        legs = (
            round(abs(z20[2] - z20[3]) / max(z20[2] + z20[3], 1) * 200, 1)
            if z20[2] >= 40 and z20[3] >= 40
            else None
        )
        if arms is not None or legs is not None:
            balance = {"bracos_diff_pct": arms, "pernas_diff_pct": legs}

    idade = body_age(profile.age, wla.fat_pct, sex_code)
    result.update(
        {
            "imc": wla.bmi,
            "imc_status": _band(wla.bmi, 18.5, 24.9),
            "gordura_pct": wla.fat_pct,
            "gordura_pct_status": _band(wla.fat_pct, fat_lo, fat_hi),
            "gordura_kg": wla.fat_kg,
            "massa_magra_kg": round(wla.lbm_kg, 1),
            "agua_kg": round(wla.lbm_kg * 0.733, 1),
            "agua_pct": wla.water_pct,
            "agua_status": _band(wla.water_pct, water_lo, water_hi),
            "musculo_esqueletico_kg": round(wla.skeletal_muscle_pct / 100.0 * wla.weight_kg, 1),
            "musculo_pct": wla.muscle_pct,
            "gordura_visceral": wla.visceral_fat,
            "gordura_subcutanea_pct": wla.subcutaneous_fat_pct,
            "proteina_pct": wla.protein_pct,
            "osso_kg": wla.bone_kg,
            "tmb_kcal": wla.bmr_kcal,
            "idade_corporal": idade,
            "score": score,
            "equilibrio": balance,
            "metodo": "wla25",
            "aviso": (
                "Composição via algoritmo WLA25 (mesmo do app Fitdays/RelaxFit / openScale). "
                "Valores de osso podem diferir 0,1 kg do visor."
            ),
        }
    )
    return result
