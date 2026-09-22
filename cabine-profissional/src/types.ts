export type ProfessionalUser = {
  id: string;
  email: string;
  is_active: boolean;
  role: string;
  full_name: string | null;
  crm: string | null;
};

export type ScalePerson = {
  id: string;
  name: string;
  registration: string | null;
  height_cm: number;
  age: number;
  birth_date: string | null;
  sex: string;
  people_type: string;
  expected_weight_kg: number | null;
  created_at: string;
  updated_at: string;
};

export type PersonListResponse = {
  items: ScalePerson[];
  total: number;
  limit: number;
  offset: number;
};

export type MeasurementRecord = {
  id: string;
  person_id: string;
  weight_kg: number;
  height_cm: number;
  metrics: Record<string, unknown> | null;
  complete: boolean;
  visit_id?: string | null;
  created_at: string;
};

export type OximeterReading = {
  id: string;
  spo2_pct: number;
  pulse_bpm: number;
  pi_pct: number | null;
  visit_id?: string | null;
  created_at: string;
};

export type BloodPressureReading = {
  id: string;
  sys_mmhg: number;
  dia_mmhg: number;
  pulse_bpm: number;
  measured_at: string;
  visit_id?: string | null;
  created_at: string;
};

export type FormSubmission = {
  id: string;
  module: string;
  status: string;
  payload: Record<string, unknown>;
  visit_id?: string | null;
  created_at: string;
};

export type VisitBundle = {
  id: string;
  visit_id: string | null;
  at: string;
  measurement: MeasurementRecord | null;
  oximeter: OximeterReading | null;
  blood_pressure: BloodPressureReading | null;
  health: FormSubmission | null;
  mental: FormSubmission | null;
};

export type VisitListResponse = {
  items: VisitBundle[];
  total: number;
  limit: number;
  offset: number;
};
