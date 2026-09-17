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


def _visceral_status(level: int) -> str:
    if level >= 10:
        return "alto"
    return "saudavel"


def _body_type(imc: float, fat_pct: float, sex: str, people_type: str) -> str:
    # Cortes alinhados à matriz RelaxFit (IMC × gordura %).
    fat_lo, fat_hi = (10.0, 20.0) if sex == "male" else (18.0, 28.0)
    high_fat = fat_pct > fat_hi
    low_fat = fat_pct < fat_lo
    if imc >= 25:
        if low_fat:
            return "atletas"
        if not high_fat:
            return "ligeiramente_obeso"
        return "obesidade"
    if imc >= 18.5:
        if high_fat:
            return "obesidade_invisivel" if imc < 22 else "sobrepeso"
        if low_fat:
            return "muscular_magro" if imc < 20.5 else "musculo"
        return "magro" if imc < 20.5 else "saudavel"
    if high_fat:
        return "obesidade_invisivel"
    if low_fat:
        return "baixo_peso_severo"
    if people_type == "athlete":
        return "atletas"
    return "abaixo_do_peso"


def _highlights(result: dict) -> list[dict]:
    items: list[dict] = []
    if result.get("gordura_pct_status") == "alto":
        items.append({
            "codigo": "gordura_alta",
            "gravidade": "alta",
            "titulo": "Gordura corporal acima",
            "texto": "O percentual de gordura ficou fora da faixa para o perfil.",
        })
    if result.get("gordura_visceral") is not None and int(result["gordura_visceral"]) >= 10:
        items.append({
            "codigo": "visceral_alta",
            "gravidade": "alta",
            "titulo": "Gordura visceral elevada",
            "texto": "O nível de gordura na região do tronco está alto.",
        })
    if result.get("agua_status") == "baixo":
        items.append({
            "codigo": "agua_baixa",
            "gravidade": "media",
            "titulo": "Água corporal abaixo",
            "texto": "A fração de água ficou abaixo da faixa usual.",
        })
    if result.get("imc_status") == "alto" and result.get("gordura_pct_status") != "alto":
        items.append({
            "codigo": "imc_alto",
            "gravidade": "media",
            "titulo": "IMC acima",
            "texto": "O peso está acima da faixa de referência para a altura.",
        })
    if result.get("imc_status") == "baixo":
        items.append({
            "codigo": "imc_baixo",
            "gravidade": "media",
            "titulo": "IMC abaixo",
            "texto": "O peso ficou abaixo da faixa de referência para a altura.",
        })
    balance = result.get("equilibrio") or {}
    arms = balance.get("bracos_diff_pct") if isinstance(balance, dict) else None
    legs = balance.get("pernas_diff_pct") if isinstance(balance, dict) else None
    if (arms is not None and arms >= 10) or (legs is not None and legs >= 10):
        items.append({
            "codigo": "assimetria",
            "gravidade": "media",
            "titulo": "Assimetria entre os lados",
            "texto": "A impedância esquerda/direita divergiu mais de 10%.",
        })
    if not items:
        items.append({
            "codigo": "ok",
            "gravidade": "baixa",
            "titulo": "Composição na faixa",
            "texto": "Os indicadores principais ficaram dentro das referências usadas neste relatório.",
        })
    return items[:3]


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

    payload = {
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
        "versao": 1,
        "tipo_corporal": _body_type(imc, gordura_pct, profile.sex, profile.people_type),
        "aviso": "Estimativas por IMC/perfil. Diferem do relatório RelaxFit (algoritmo proprietário).",
    }
    payload["destaques"] = _highlights(payload)
    return payload


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


def _fat_pct_range(sex: str) -> tuple[float, float]:
    return (10.0, 20.0) if sex == "male" else (18.0, 28.0)


def _kg_faixas(std_weight_kg: float, sex: str) -> dict[str, list[float]]:
    """Faixas RelaxFit: kg em relação ao padrão (IMC 22/21), não % do peso atual.

    Água/músculo/proteína ~85–105% da massa magra padrão; gordura 80–160% da
    gordura padrão. Por isso 39% de água num corpo obeso ainda pode ser 'saudável'.
    """
    male = sex == "male"
    std_ffm = (0.85 if male else 0.77) * std_weight_kg
    std_bfm = (0.15 if male else 0.23) * std_weight_kg
    std_water = std_ffm * 0.733
    std_prot = std_ffm * 0.2
    std_mus = std_water + std_prot
    std_skel = std_water * 0.834 - 2.627

    def band(std: float, lo: float = 0.85, hi: float = 1.05) -> list[float]:
        return [round(std * lo, 1), round(std * hi, 1)]

    return {
        "gordura": [round(std_bfm * 0.8, 1), round(std_bfm * 1.6, 1)],
        "agua": band(std_water),
        "musculo": band(std_mus),
        "esqueletico": band(std_skel),
        "proteina": band(std_prot),
        "magra": band(std_ffm),
    }


def _appendicular_smi(segments: tuple, height_cm: float) -> float | None:
    """SMI RelaxFit: músculo de braços + pernas / altura² (não o esquelético total)."""
    height_m = height_cm / 100.0
    if height_m <= 0:
        return None
    kg = sum(item.muscle_kg for item in segments if item.key != "tronco")
    return round(kg / (height_m**2), 1)


def compute_report(
    peso_kg: float,
    profile: PersonProfile,
    impedancias_ohm: list[float] | None = None,
    segmentos: list[SegmentImpedance] | None = None,
) -> dict:
    from app.services.scale.wla25 import (
        PEOPLE_SPORTMAN,
        SEX_FEMALE,
        SEX_MALE,
        compute as wla25_compute,
        leader_display_ohm,
        repair_wla_order,
        to_wla25_order,
    )

    result = compute_basic_metrics(peso_kg, profile)
    zs = list(impedancias_ohm or [])
    segs = list(segmentos or [])
    if segs:
        result["segmentos"] = _segment_payload(segs)
    if not zs:
        return result

    # Ordem no fio: RA, LA, RL, LL, TR × 2 bandas. O RelaxFit mostra o tronco
    # já escalado (líder × 0.826); o cru do 100 kHz costuma ser ~65 Ω.
    z20 = list(zs[:5]) if len(zs) >= 5 else list(zs)
    z100 = list(zs[5:10]) if len(zs) >= 10 else []
    if len(zs) >= 10:
        ordered = repair_wla_order(to_wla25_order(zs))
        shown20, shown100 = leader_display_ohm(ordered[0], ordered[5])
        z20[4] = shown20
        z100[4] = shown100
        for item in result.get("segmentos") or []:
            if not isinstance(item, dict) or item.get("lado") != "tronco":
                continue
            if item.get("freq_khz") == 20:
                item["ohm"] = shown20
            elif item.get("freq_khz") == 100:
                item["ohm"] = shown100
    result["z_20khz"] = z20
    result["z_100khz"] = z100

    sex_code = SEX_MALE if profile.sex == "male" else SEX_FEMALE
    people_code = PEOPLE_SPORTMAN if profile.is_athlete else 0
    wla = wla25_compute(
        int(profile.height_cm),
        peso_kg,
        zs,
        sex=sex_code,
        age=int(profile.age),
        people=people_code,
    )
    if wla is None:
        result["aviso"] = (
            "Impedâncias recebidas, mas inválidas para o algoritmo WLA25 (RelaxFit). "
            "Segure a barra com contato firme — o tronco deve medir ~15–25 Ω."
        )
        return result

    fat_lo, fat_hi = _fat_pct_range(profile.sex)
    faixas = _kg_faixas(wla.std_weight_kg, profile.sex)

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

    result.update(
        {
            "imc": wla.bmi,
            "imc_status": _band(wla.bmi, 18.5, 24.9),
            "gordura_pct": wla.fat_pct,
            "gordura_pct_status": _band(wla.fat_pct, fat_lo, fat_hi),
            "gordura_kg": wla.fat_kg,
            "massa_magra_kg": wla.lbm_kg,
            "massa_magra_status": _band(wla.lbm_kg, *faixas["magra"]),
            "agua_kg": wla.water_kg,
            "agua_pct": wla.water_pct,
            "agua_status": _band(wla.water_kg, *faixas["agua"]),
            "musculo_esqueletico_kg": wla.skeletal_muscle_kg,
            "musculo_esqueletico_pct": wla.skeletal_muscle_pct,
            "musculo_esqueletico_status": _band(wla.skeletal_muscle_kg, *faixas["esqueletico"]),
            "musculo_kg": wla.muscle_kg,
            "musculo_pct": wla.muscle_pct,
            "musculo_status": _band(wla.muscle_kg, *faixas["musculo"]),
            "gordura_visceral": wla.visceral_fat,
            "gordura_visceral_status": _visceral_status(wla.visceral_fat),
            "gordura_subcutanea_pct": wla.subcutaneous_fat_pct,
            "proteina_pct": wla.protein_pct,
            "proteina_kg": wla.protein_kg,
            "proteina_status": _band(wla.protein_kg, *faixas["proteina"]),
            "osso_kg": wla.bone_kg,
            "tmb_kcal": wla.bmr_kcal,
            "idade_corporal": wla.metabolic_age,
            "smi": _appendicular_smi(wla.segments, profile.height_cm),
            "score": wla.body_score,
            "score_wla25": wla.body_score,
            "equilibrio": balance,
            "peso_ideal_kg": wla.std_weight_kg,
            "controle_peso_kg": wla.control_weight_kg,
            "controle_gordura_kg": wla.control_fat_kg,
            "controle_musculo_kg": wla.control_muscle_kg,
            "faixas_kg": faixas,
            "segmentos_wla": [
                {
                    "key": item.key,
                    "fat_kg": item.fat_kg,
                    "fat_vs_std_pct": item.fat_vs_std_pct,
                    "muscle_kg": item.muscle_kg,
                    "muscle_vs_std_pct": item.muscle_vs_std_pct,
                }
                for item in wla.segments
            ],
            "tipo_corporal": _body_type(wla.bmi, wla.fat_pct, profile.sex, profile.people_type),
            "metodo": "wla25",
            "versao": 5,
            "aviso": (
                "Composição alinhada ao RelaxFit: gordura pelo FFM-padrão (tipo normal) "
                "e água/músculo/segmentos WLA25. Atleta usa a regressão de impedância. "
                "Altura, idade e sexo do cadastro precisam ser os mesmos do app da balança."
            ),
        }
    )
    result["destaques"] = _highlights(result)
    return result


def metrics_from_stored(
    peso_kg: float,
    height_cm: float,
    age: int,
    sex: str,
    people_type: str | None,
    impedancias_ohm: list[float] | None,
    segmentos: list | None = None,
    stored_metrics: dict | None = None,
) -> dict | None:
    """Recalcula WLA25 a partir da medição persistida (histórico antigo incluso)."""
    profile = PersonProfile.from_params(
        height_cm,
        age,
        sex,
        people_type=people_type,
    )
    if profile is None:
        return stored_metrics
    segs: list[SegmentImpedance] = []
    for item in segmentos or []:
        if isinstance(item, SegmentImpedance):
            segs.append(item)
            continue
        if not isinstance(item, dict):
            continue
        try:
            segs.append(
                SegmentImpedance(
                    nome=str(item.get("nome") or ""),
                    lado=str(item.get("lado") or ""),
                    freq_khz=int(item.get("freq_khz") or 0),
                    ohm=float(item.get("ohm") or 0),
                )
            )
        except (TypeError, ValueError):
            continue
    zs = list(impedancias_ohm or [])
    if not zs:
        return stored_metrics
    return compute_report(peso_kg, profile, zs, segs or None)
