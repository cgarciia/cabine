/** Converte avisos técnicos da balança em texto curto para o totem. */
export function friendlyScaleStatus(raw: string): string | null {
    const text = raw.trim();
    if (!text) return null;

    const lower = text.toLowerCase();

    if (/tipo\s*=|perfil na cabine|perfil ativo|people_type|peso esperado/.test(lower)) {
        return 'Tudo certo. Pode subir na balança.';
    }
    if (/ffb|gatt|rm-rd|icomon|adapter|rádio caiu|anúncio/.test(lower)) {
        return 'Conectando à balança…';
    }
    if (/\ba7\b|impedân/.test(lower)) {
        return 'Mantenha as mãos na barra e fique parado.';
    }
    if (/há alguém no prato|não reenvio/.test(lower)) {
        return 'Desça da balança antes de continuar.';
    }
    if (/falha ao assinar|exception|traceback|bleakerror|oserror/.test(lower)) {
        return 'Não foi possível conectar. Aguarde e tente de novo.';
    }
    if (/mac|uuid|0x[0-9a-f]+/.test(lower)) {
        return 'Procurando a balança…';
    }

    return text;
}
