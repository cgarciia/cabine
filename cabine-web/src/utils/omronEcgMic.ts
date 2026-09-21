import { useCallback, useEffect, useRef, useState } from 'react';

import { OMRON_ECG_WORKLET } from './omronEcgWorklet';

const TRACE_MAX = 3600;
const RECORD_MAX = 12000;

const AUDIO_CONSTRAINTS = {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: false,
} as MediaTrackConstraints;

/** Faixa do Complete: 19 kHz ± ~1 kHz. Corta voz, ar e toque, sem Q alto que ringa o QRS. */
function wireUltrasonic(ctx: AudioContext, source: AudioNode, dest: AudioNode): () => void {
    const nyquist = ctx.sampleRate / 2 - 300;
    const filters: BiquadFilterNode[] = [];
    const add = (type: BiquadFilterType, hz: number, q: number) => {
        const node = ctx.createBiquadFilter();
        node.type = type;
        node.frequency.value = Math.min(hz, nyquist);
        node.Q.value = q;
        filters.push(node);
        return node;
    };
    const hp1 = add('highpass', 17500, 0.707);
    const hp2 = add('highpass', 17500, 0.707);
    const lp1 = add('lowpass', 20500, 0.707);
    const lp2 = add('lowpass', 20500, 0.707);
    source.connect(hp1);
    hp1.connect(hp2);
    hp2.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(dest);
    return () => {
        source.disconnect();
        for (const node of filters) node.disconnect();
    };
}

function httpsHint(): string {
    const host = window.location.host;
    const path = window.location.pathname;
    return `https://${host}${path}`;
}

function micBlockedReason(): string | null {
    const canAsk = Boolean(navigator.mediaDevices?.getUserMedia);
    if (window.isSecureContext && canAsk) return null;
    return (
        'O Chrome no tablet não liga o microfone em http://. '
        + `Feche esta aba e abra ${httpsHint()} — toque em Avançado e Continuar (certificado).`
    );
}

/** Pede o mic no toque do menu para o Chrome autorizar antes da tela de pressão. */
export async function requestOmronMicPermission(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS,
            video: false,
        });
        stream.getTracks().forEach((track) => track.stop());
    } catch {
        /* a tela de pressão mostra o erro */
    }
}

export function useOmronEcgMic(enabled: boolean) {
    const [samples, setSamples] = useState<number[]>([]);
    const [toneLocked, setToneLocked] = useState(false);
    const [toneLevel, setToneLevel] = useState(0);
    const [error, setError] = useState<string | null>(() => (enabled ? micBlockedReason() : null));
    const [armed, setArmed] = useState(false);
    const samplesRef = useRef<number[]>([]);
    const recordingRef = useRef(false);
    const recordedRef = useRef<number[]>([]);
    const stopRef = useRef<() => void>(() => undefined);

    const stop = useCallback(() => {
        stopRef.current();
        stopRef.current = () => undefined;
        recordingRef.current = false;
        recordedRef.current = [];
        setArmed(false);
        setToneLocked(false);
        setToneLevel(0);
        samplesRef.current = [];
        setSamples([]);
    }, []);

    const beginRecord = useCallback(() => {
        recordedRef.current = [];
        recordingRef.current = true;
    }, []);

    const takeRecord = useCallback(() => {
        recordingRef.current = false;
        return recordedRef.current.slice();
    }, []);

    const unlock = useCallback(async () => {
        if (!enabled) return;
        const blocked = micBlockedReason();
        if (blocked) {
            setError(blocked);
            return;
        }
        stop();
        let stream: MediaStream | null = null;
        let ctx: AudioContext | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let node: AudioWorkletNode | null = null;
        let workletUrl = '';
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: AUDIO_CONSTRAINTS,
                video: false,
            });
            ctx = new AudioContext({ latencyHint: 'interactive' });
            if (ctx.state === 'suspended') await ctx.resume();
            if (ctx.sampleRate < 40000) {
                stream.getTracks().forEach((track) => track.stop());
                void ctx.close();
                setError('Este tablet baixou o áudio demais para ouvir o ultrassom de 19 kHz. Use o Chrome atualizado.');
                return;
            }
            workletUrl = URL.createObjectURL(new Blob([OMRON_ECG_WORKLET], { type: 'text/javascript' }));
            await ctx.audioWorklet.addModule(workletUrl);
            source = ctx.createMediaStreamSource(stream);
            node = new AudioWorkletNode(ctx, 'omron-ecg');
            node.port.onmessage = (event: MessageEvent<{ samples: number[]; locked: boolean; snr: number }>) => {
                setToneLevel(event.data.snr);
                setToneLocked(event.data.locked);
                const chunk = event.data.samples;
                if (!chunk.length) return;
                if (recordingRef.current) {
                    const rec = recordedRef.current.concat(chunk);
                    recordedRef.current = rec.length > RECORD_MAX ? rec.slice(rec.length - RECORD_MAX) : rec;
                }
                const next = samplesRef.current.concat(chunk);
                samplesRef.current = next.length > TRACE_MAX ? next.slice(next.length - TRACE_MAX) : next;
                setSamples(samplesRef.current);
            };
            const mute = ctx.createGain();
            mute.gain.value = 0;
            const unwire = wireUltrasonic(ctx, source, node);
            node.connect(mute);
            mute.connect(ctx.destination);
            stopRef.current = () => {
                node?.port.close();
                node?.disconnect();
                unwire();
                mute.disconnect();
                void ctx?.close();
                stream?.getTracks().forEach((track) => track.stop());
                if (workletUrl) URL.revokeObjectURL(workletUrl);
            };
            setArmed(true);
            setError(null);
        } catch (caught) {
            stream?.getTracks().forEach((track) => track.stop());
            const name = caught instanceof DOMException ? caught.name : '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setError('Toque em Permitir quando o tablet pedir o microfone.');
            } else if (name === 'NotFoundError') {
                setError('Nenhum microfone encontrado neste tablet.');
            } else if (name === 'NotSupportedError' || name === 'TypeError') {
                setError(micBlockedReason() ?? 'Este navegador bloqueou o microfone.');
            } else {
                setError('Não deu para abrir o microfone. Abra a Cabine em https:// e tente de novo.');
            }
        }
    }, [enabled, stop]);

    useEffect(() => {
        if (!enabled) {
            stop();
            setError(null);
            return;
        }
        void unlock();
        return () => stop();
    }, [enabled, stop, unlock]);

    return { samples, toneLocked, toneLevel, error, armed, unlock, beginRecord, takeRecord };
}
