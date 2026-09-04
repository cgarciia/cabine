import asyncio
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from bleak import BleakClient, BleakScanner

router = APIRouter()


# =======================================================
# 1. PARSERS DE DADOS (Estratégias de Decodificação)
# =======================================================

def parser_gatt_16bit_overflow(data: bytearray):
    """
    Decodifica pacotes de dispositivos GATT que sofrem overflow de 16-bits.
    Padrão comum em chips Yolanda (iniciados com AC27).
    """
    hex_data = data.hex()
    if len(hex_data) >= 40 and hex_data.startswith("ac27"):
        raw_adc = int(hex_data[8:12], 16)
        if raw_adc == 0:
            return 0.0

        peso_kg = raw_adc / 1000.0
        flag_byte = int(hex_data[6:8], 16)

        # Correção do overflow (limite de 65.5kg)
        if flag_byte > 0x50 or peso_kg < 50.0:
            if 10.0 < peso_kg < 50.0:
                peso_kg += 65.536

        return round(peso_kg, 2)
    return None


def parser_broadcast_big_endian(manufacturer_data):
    """
    Decodifica pacotes de dispositivos Broadcast (Advertising).
    Extrai o peso diretamente dos 2 primeiros bytes em formato Big-Endian.
    """
    for empresa, dados in manufacturer_data.items():
        # Remove os últimos 6 bytes (geralmente o MAC repetido)
        dados_balanca = dados[:-6]
        if len(dados_balanca) >= 2:
            peso_raw = int.from_bytes(dados_balanca[0:2], byteorder="big")
            return round(peso_raw / 100.0, 2)
    return None


# =======================================================
# 2. REGISTRO DE DISPOSITIVOS (Mapeamento de Protocolos)
# =======================================================

DISPOSITIVOS_REGISTRADOS = {
    # Antiga Relaxmedic
    "A8:0B:6B:95:EC:79": {
        "nome_exibicao": "Balança Tipo A (Conexão Ativa)",
        "protocolo_requisicao": "GATT_NOTIFY",
        "parser": parser_gatt_16bit_overflow
    },
    # Antiga TRCO260
    "78:66:A5:57:8E:B7": {
        "nome_exibicao": "Balança Tipo B (Transmissão Passiva)",
        "protocolo_requisicao": "BROADCAST_SCAN",
        "parser": parser_broadcast_big_endian
    }
}

# 🟢 DEFINE QUAL MAC ESTÁ EM USO NO MOMENTO 🟢
MAC_ATIVO = "78:66:A5:57:8E:B7"


# =======================================================
# 3. WEBSOCKET SERVICE GENÉRICO
# =======================================================

@router.websocket("/ws/scale")
async def scale_endpoint(websocket: WebSocket):
    await websocket.accept()

    config_dispositivo = DISPOSITIVOS_REGISTRADOS.get(MAC_ATIVO.upper())
    if not config_dispositivo:
        await websocket.send_json({"type": "STATUS", "msg": f"Erro: MAC {MAC_ATIVO} não possui protocolo mapeado."})
        return

    queue = asyncio.Queue()
    last_weight = None

    def despachar_pacote(peso_kg):
        nonlocal last_weight
        if peso_kg is not None and peso_kg != last_weight:
            last_weight = peso_kg
            queue.put_nowait({
                "type": "PESO_RECEBIDO",
                "balanca_nome": config_dispositivo["nome_exibicao"],
                "peso_kg": peso_kg,
                "timestamp": datetime.now().strftime("%H:%M:%S")
            })

    try:
        protocolo = config_dispositivo["protocolo_requisicao"]
        await websocket.send_json({"type": "STATUS", "msg": f"Iniciando protocolo {protocolo}..."})

        # ---------------------------------------------------
        # REQUISIÇÃO TIPO 1: Escuta de pacotes públicos (SCAN)
        # ---------------------------------------------------
        if protocolo == "BROADCAST_SCAN":
            def scan_callback(device, adv):
                if device.address.upper() == MAC_ATIVO.upper():
                    peso = config_dispositivo["parser"](adv.manufacturer_data)
                    despachar_pacote(peso)

            scanner = BleakScanner(detection_callback=scan_callback)
            await scanner.start()

            await websocket.send_json({"type": "STATUS", "msg": "Modo Broadcast ativo. Procurando sinal..."})

            while True:
                data = await queue.get()
                await websocket.send_json(data)


        # ---------------------------------------------------
        # REQUISIÇÃO TIPO 2: Conexão e subscrição (NOTIFY)
        # ---------------------------------------------------
        elif protocolo == "GATT_NOTIFY":
            async def notify_handler(sender, data):
                peso = config_dispositivo["parser"](data)
                despachar_pacote(peso)

            async with BleakClient(MAC_ATIVO) as client:
                await websocket.send_json({"type": "STATUS", "msg": "Conexão GATT estabelecida! Mapeando serviços..."})

                for service in client.services:
                    for char in service.characteristics:
                        if "notify" in char.properties or "indicate" in char.properties:
                            try:
                                await client.start_notify(char.uuid, notify_handler)
                            except:
                                pass  # Ignora canais protegidos/bloqueados

                await websocket.send_json({"type": "STATUS", "msg": "Subscrição concluída. Aguardando peso."})

                async def consume_queue():
                    while True:
                        data = await queue.get()
                        await websocket.send_json(data)

                consumer_task = asyncio.create_task(consume_queue())

                while client.is_connected:
                    await asyncio.sleep(1)

                consumer_task.cancel()

    except WebSocketDisconnect:
        print("Frontend desconectou da sessão WebSocket.")
    except Exception as e:
        print(f"Erro no serviço Bluetooth: {e}")
        try:
            await websocket.send_json({"type": "STATUS", "msg": f"Falha no protocolo: {str(e)}"})
        except:
            pass