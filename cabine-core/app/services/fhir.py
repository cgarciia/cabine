from fhir.resources.patient import Patient


def parse_fhir_patient(payload: dict) -> Patient:
    return Patient.model_validate(payload)


def dump_fhir_resource(patient: Patient) -> dict:
    return patient.model_dump(mode="json")
