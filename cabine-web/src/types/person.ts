export interface ScalePerson {
    id: string;
    name: string;
    matricula: string | null;
    height_cm: number;
    age: number;
    birth_date: string | null;
    sex: string;
    people_type: string;
    expected_weight_kg: number | null;
    created_at: string;
    updated_at: string;
}

export interface PersonPayload {
    name: string;
    matricula?: string | null;
    height_cm: number;
    age?: number;
    birth_date?: string | null;
    sex: string;
    people_type: string;
    expected_weight_kg?: number | null;
}
