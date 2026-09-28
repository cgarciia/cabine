import { useCallback, useEffect, useRef, useState } from 'react';

import { HEM7530_ECG_WORKLET } from './hem7530EcgWorklet';

const TRACE_MAX = 3600;
const RECORD_MAX = 12000;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.assign(
    {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 },
    },
    { voiceIsolation: false },
);

type WorkletMsg = {
    samples: number[];
    locked: boolean;
    snr: number;
};

/** The worklet owns the 17–21 kHz FIR. A biquad in front bends the FM and breaks the trace. */
function wireUltrasonic(source: AudioNode, dest: AudioNode): () => void {
    source.connect(dest);
    return () => {
        source.disconnect();
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

/** Request the mic on the menu tap so Chrome authorizes before the BP screen. */
export async function requestHem7530MicPermission(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS,
            video: false,
        });
        stream.getTracks().forEach((track) => track.stop());
    } catch {
        /* the blood-pressure screen shows the error */
    }
}

export function useHem7530EcgMic(enabled: boolean) {
    const [samples, setSamples] = useState<number[]>([]);
    const [sampleCount, setSampleCount] = useState(0);
    const sampleCountRef = useRef(0);
    const [toneLocked, setToneLocked] = useState(false);
    const [toneLevel, setToneLevel] = useState(0);
    const [error, setError] = useState<string | null>(() => (enabled ? micBlockedReason() : null));
    const [armed, setArmed] = useState(false);
    const samplesRef = useRef<number[]>([]);
    const recordingRef = useRef(false);
    const recordedRef = useRef<number[]>([]);
    const genRef = useRef(0);
    const stopRef = useRef<() => void>(() => undefined);
    const toneAtRef = useRef(0);

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
        sampleCountRef.current = 0;
        setSampleCount(0);
    }, []);

    const beginRecord = useCallback(() => {
        recordedRef.current = [];
        samplesRef.current = [];
        setSamples([]);
        sampleCountRef.current = 0;
        setSampleCount(0);
        recordingRef.current = true;
    }, []);

    const takeRecord = useCallback(() => {
        recordingRef.current = false;
        return recordedRef.current.slice();
    }, []);

    const unlock = useCallback(async () => {
        if (!enabled) return;
        const gen = genRef.current + 1;
        genRef.current = gen;
        const blocked = micBlockedReason();
        if (blocked) {
            setError(blocked);
            return;
        }
        stop();
        const stale = () => gen !== genRef.current;
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
            if (stale()) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            try {
                ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
            } catch {
                ctx = new AudioContext({ latencyHint: 'interactive' });
            }
            if (ctx.state === 'suspended') await ctx.resume();
            if (stale()) {
                stream.getTracks().forEach((track) => track.stop());
                void ctx.close();
                return;
            }
            if (ctx.sampleRate < 40000) {
                stream.getTracks().forEach((track) => track.stop());
                void ctx.close();
                setError('Este tablet não consegue captar o sinal do aparelho. Use o Chrome atualizado.');
                return;
            }
            const track = stream.getAudioTracks()[0];
            if (track) {
                try {
                    await track.applyConstraints(AUDIO_CONSTRAINTS);
                } catch {
                    /* the browser kept its own processing */
                }
            }
            workletUrl = URL.createObjectURL(new Blob([HEM7530_ECG_WORKLET], { type: 'text/javascript' }));
            await ctx.audioWorklet.addModule(workletUrl);
            if (stale()) {
                stream.getTracks().forEach((track) => track.stop());
                void ctx.close();
                URL.revokeObjectURL(workletUrl);
                return;
            }
            source = ctx.createMediaStreamSource(stream);
            node = new AudioWorkletNode(ctx, 'hem7530-ecg');
            node.port.onmessage = (event: MessageEvent<WorkletMsg>) => {
                if (gen !== genRef.current) return;
                const data = event.data;
                if (performance.now() - toneAtRef.current > 100) {
                    toneAtRef.current = performance.now();
                    setToneLevel(data.snr);
                    setToneLocked(data.locked);
                }
                const chunk = data.samples;
                if (!chunk.length) return;
                if (recordingRef.current) {
                    const rec = recordedRef.current.concat(chunk);
                    recordedRef.current = rec.length > RECORD_MAX ? rec.slice(rec.length - RECORD_MAX) : rec;
                }
                const next = samplesRef.current.concat(chunk);
                samplesRef.current = next.length > TRACE_MAX ? next.slice(next.length - TRACE_MAX) : next;
                sampleCountRef.current += chunk.length;
                setSamples(samplesRef.current);
                setSampleCount(sampleCountRef.current);
            };
            const mute = ctx.createGain();
            mute.gain.value = 0;
            const unwire = wireUltrasonic(source, node);
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
            if (stale()) {
                stopRef.current();
                return;
            }
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
            genRef.current += 1;
            stop();
            setError(null);
            return;
        }
        void unlock();
        return () => {
            genRef.current += 1;
            stop();
        };
    }, [enabled, stop, unlock]);

    return { samples, sampleCount, toneLocked, toneLevel, error, armed, unlock, beginRecord, takeRecord };
}
