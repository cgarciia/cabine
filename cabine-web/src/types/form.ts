export interface FormSubmission {
    id: string;
    person_id: string;
    module: 'health' | 'mental' | string;
    status: string;
    payload: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
