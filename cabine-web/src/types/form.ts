export interface FormSubmission {
    id: string;
    person_id: string;
    module: 'health' | 'mental' | string;
    status: string;
    payload: Record<string, unknown>;
    visit_id?: string | null;
    created_at: string;
    updated_at: string;
}
