export interface ScaleParserOption {
    key: string;
    label: string;
}

export interface ScaleAdapterOption {
    key: string;
    label: string;
    address_kind: string;
    address_label: string;
    supports_bia?: boolean;
    parsers: ScaleParserOption[];
}

export interface ScaleCatalog {
    adapters: ScaleAdapterOption[];
}

export interface Scale {
    id: string;
    name: string;
    adapter: string;
    address: string;
    parser: string;
    is_active: boolean;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface ScalePayload {
    name: string;
    adapter: string;
    address: string;
    parser: string;
    is_active: boolean;
    is_default: boolean;
}
