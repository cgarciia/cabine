# 07 — Hardware e BLE

Três tipos de periférico, **um rádio**. No Windows, scan/connect simultâneos geram erro de rádio: tudo passa por `ble_radio_lock`. Uma cabine não conversa com outra; cada PC tem o próprio rádio.

## 1. Aparelhos no produto

| Tipo (`device_types.slug`) | Modelo | Código |
|---|---|---|
| `scale` | Balança BIA **RM-RD2504A** (adapter `ble_rm_rd2504a`, parser `rm_rd2504a_ffb2`) | `services/scale/` |
| `oximeter` | **PC-60NW** e **Yonker YK-81C** (anuncia como "Incoterm OX500 BLE") | `services/oximeter/` |
| `blood_pressure_ecg` | **OMRON HEM-7530T** (PA via BLE; ECG ultrassônico opcional no front) | `services/blood_pressure/` |
| `blood_pressure_wrist` | **OMRON HEM-6161T2** | `services/blood_pressure/hem6161.py`, `wrist_stream.py` |

A UI usa o **nome do modelo** onde fizer sentido para o usuário; no totem o oxímetro aparece como "Oxímetro" (decisão de commit `35505a9`).

## 2. Camadas

```
services/ble/            # compartilhado; o patch WinRT é aplicado uma vez no import do pacote
  common.py              # lock, MAC, watch_websocket_closed
  ids.py                 # parse_uuid
  winrt_patch.py         # descritores GATT quebrados no WinRT
  scanner.py             # scan_devices, wait_for_device, as_ble_devices
  connect.py             # connect_with_fallback (WinRT cached/uncached, pareamento opcional)
  ws_session.py          # DeviceWsSession, consume_queue, cancel_and_wait

schemas/ble.py           # BleDevice/BleScanResponse e DeviceReadingResponseBase

services/scale/          # só balança
  adapters/              # ble_gatt, ble_broadcast, ble_rm_rd2504a
  registry.py            # chave do adapter → implementação; resolve_transport
  parsers.py             # bytes → ScaleReading
  stream.py              # WebSocket da pesagem
  persist.py             # grava ScaleMeasurement
  metrics.py + wla25.py + rm_rd2504a.py + reading.py + measurement.py + spec.py

services/oximeter/       # ble.py, parsers.py, stream.py, persist.py
services/blood_pressure/ # ble.py, gatt_bp.py (0x2A35), stream.py, persist.py,
                         # protocol.py / hem7530.py (EEPROM), hem6161.py, wrist_stream.py
services/devices/        # pareamento (pairing.py)
```

## 3. Regras

1. Lógica BLE **nunca** dentro de `api/routes`.
2. Todo scan/connect passa por `ble_radio_lock`.
3. Reutilizar `services/ble/` para novo periférico (`scan_devices`/`wait_for_device`, `connect_with_fallback`, `DeviceWsSession`). Pasta própria em `services/<dispositivo>/`.
4. Persistência disparada pelo stream usa `session.spawn(...)` para ser aguardada no fechamento do WS.
5. Fechar o WebSocket encerra o adapter BLE (`watch_websocket_closed`), para não travar o uvicorn.
6. Sessão do banco **curta** no WS: carrega a entidade, libera o pool, só então inicia o stream BLE longo.
7. `services/scale/measurement.py::sanitize_measurement` descarta BIA de balança só-peso. Validação adapter/parser/endereço: `registry.resolve_transport`.
8. Não gravar MAC de laboratório em `Settings` nem em `.env.example`. Sondas de laboratório ficam em `cabine-core/scripts/` e não sobem no servidor.
9. Monitor de pulso HEM-6161T2: só aceita leitura desta sessão (ignora histórico antigo da memória do aparelho). HEM-7530T: fallback de EEPROM só para medições desta sessão.

## 4. Como adicionar

- **Nova balança:** adapter em `services/scale/adapters/`, registrar em `registry.py`, parser em `parsers.py`, enum em `schemas/scale.py`. Rota não muda.
- **Novo oxímetro:** parser/hints em `services/oximeter/`, não dentro de `scale/`.
- **Novo tipo de periférico:** `device_types` (migration + seed), pasta `services/<x>/`, stream WS em `routes/`, tipo/página no front, entrada de proxy no Vite, atualizar estas specs.

## 5. Protocolos das balanças (resumo)

Detalhe e comparativo em `anexos/relatorio-protocolos-balancas.md`.

- **GATT (`ble_gatt`)**: notify em `FFF0/FFF1` (OEM) ou `181D/2A9D` (fallback); parser AC27 (Yolanda/QN), peso ≈ ADC/1000 com correção de overflow 16-bit.
- **Broadcast (`ble_broadcast`)**: `manufacturer_data`, remove 6 bytes finais, 2 primeiros bytes big-endian / 100 → kg. Passivo, sem pareamento, estável.
- **RM-RD2504A (`ble_rm_rd2504a`)**: BIA de 8 sensores; cálculo de composição em `wla25.py` / `metrics.py`.

## 6. Problemas conhecidos

- WinRT devolve descritores GATT quebrados (patch aplicado) e a conexão pode precisar de várias tentativas (cache ligado/desligado) — centralizado em `connect.py`.
- Se balança, oxímetro e pressão falharem juntos, o problema é o rádio/lock no **core**, não no front.
- ECG do HEM-7530T: captura existe (demodulação FM a 19 kHz, gráfico varre e alisa), mas a leitura ainda tem muito ruído.
- Refatorações de BLE precisam de teste com os aparelhos reais no totem (pendência).
- O front em dev roda em **HTTPS** (certificado autoassinado) por causa do microfone (ECG).
