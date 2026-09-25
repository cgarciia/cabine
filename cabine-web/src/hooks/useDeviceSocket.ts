import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { deviceSocket, type WsPath } from '../api';

export type DeviceSocketHandlers<T> = {
    onOpen?: (socket: WebSocket) => void;
    onMessage: (payload: T) => void;
    onError?: () => void;
    /** Server or network closed the socket (not `close()` nor a newer `connect()`). */
    onDrop?: () => void;
    /** After a drop, `run` is called once `delayMs` elapses, unless the page unmounted or reconnected. */
    reconnect?: { delayMs: number; run: () => void };
};

export function useDeviceSocket<T>(path: WsPath, handlers: DeviceSocketHandlers<T>) {
    const socketRef = useRef<WebSocket | null>(null);
    const genRef = useRef(0);
    const timerRef = useRef(0);
    const mountedRef = useRef(true);
    const handlersRef = useRef(handlers);
    useLayoutEffect(() => {
        handlersRef.current = handlers;
    });

    const close = useCallback(() => {
        genRef.current += 1;
        window.clearTimeout(timerRef.current);
        const socket = socketRef.current;
        socketRef.current = null;
        if (!socket) return;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
        } catch {
            /* já fechado */
        }
    }, []);

    const isActive = useCallback(() => {
        const socket = socketRef.current;
        return Boolean(
            socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING),
        );
    }, []);

    /** Returns false when an active socket was kept (`force` not set). */
    const connect = useCallback((params: URLSearchParams, force = false): boolean => {
        if (!force && isActive()) return false;
        close();
        const gen = genRef.current;
        const socket = deviceSocket(path, params);
        socketRef.current = socket;

        socket.onopen = () => handlersRef.current.onOpen?.(socket);
        socket.onmessage = (event) => {
            let payload: T;
            try {
                payload = JSON.parse(event.data) as T;
            } catch {
                return;
            }
            handlersRef.current.onMessage(payload);
        };
        socket.onerror = () => handlersRef.current.onError?.();
        socket.onclose = () => {
            if (!mountedRef.current || gen !== genRef.current || socketRef.current !== socket) return;
            socketRef.current = null;
            const { onDrop, reconnect } = handlersRef.current;
            onDrop?.();
            if (!reconnect) return;
            timerRef.current = window.setTimeout(() => {
                if (mountedRef.current && genRef.current === gen) handlersRef.current.reconnect?.run();
            }, reconnect.delayMs);
        };
        return true;
    }, [close, isActive, path]);

    const send = useCallback((message: unknown): boolean => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(message));
        return true;
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            close();
        };
    }, [close]);

    return { connect, close, send, isActive };
}
