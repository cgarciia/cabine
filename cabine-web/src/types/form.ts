export interface FormSubmission {
    id: string;
    user_id: string;
    module: 'health' | 'mental' | string;
    status: string;
    payload: Record<string, unknown>;
    session_id?: string | null;
    created_at: string;
    updated_at: string;
}
