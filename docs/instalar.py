"""Instalador de StremTV para una Samsung desde un iPhone (app a-Shell), un Mac o un PC, sin Tizen Studio.
Lo usa docs/instalar.html: el iPhone tiene que estar en el mismo Wi-Fi que la tele.
  1. Busca la tele en la red.
  2. Si no acepta aún este aparato, abre en ella la ventana del modo desarrollador (mando por red, puerto 8002)
     y dice qué IP escribir; la tele solo la aplica al reiniciarse.
  3. Espera a que la tele acepte la conexión de desarrollador (puerto 26101), copia StremTV.wgt y lo instala.
Solo biblioteca estándar y sin hilos (a-Shell). `python3 instalar.py --probar` solo busca la tele y no toca nada."""
import base64, json, os, select, socket, ssl, struct, sys, time, urllib.request

PKG = "StrmTV2026"
APP_ID = "StrmTV2026.StremTV"
WGT_URL = "https://victorarandab.github.io/stremtv/StremTV.wgt"
REMOTE_PKG = "/home/owner/share/tmp/sdk_tools/package.wgt"
SDB_PORT = 26101
WAIT_MIN = 20  # minutos esperando a que la tele se reinicie con la IP nueva


def say(*lines):
    print()
    for l in lines:
        print(l)
    sys.stdout.flush()


def fail(*lines):
    say("❌ " + lines[0], *lines[1:], "", "Haz una captura de esta pantalla y mándasela a quien te pasó la app.")
    sys.exit(1)


# ---------- red ----------

def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 53))  # UDP: no envía nada, solo elige la interfaz (el Wi-Fi)
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def private(ip):
    a, b = (int(x) for x in ip.split(".")[:2])
    return a == 192 and b == 168 or a == 10 or a == 172 and 16 <= b <= 31


def scan(base, ports, timeout=2.5):
    """Conexiones no bloqueantes a base.1-254 en los puertos dados; devuelve {ip: set(puertos abiertos)}."""
    pend, found = {}, {}
    for h in range(1, 255):
        for p in ports:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setblocking(False)
            try:
                s.connect_ex((f"{base}.{h}", p))
            except OSError:
                s.close()
                continue
            pend[s] = (f"{base}.{h}", p)
    end = time.time() + timeout
    while pend and time.time() < end:
        try:
            _, w, _ = select.select([], list(pend), [], max(0, end - time.time()))
        except (OSError, ValueError):
            break
        for s in w:
            ip, p = pend.pop(s)
            if s.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR) == 0:
                found.setdefault(ip, set()).add(p)
            s.close()
    for s in pend:
        s.close()
    return found


def is_open(ip, port, timeout=1.5):
    try:
        socket.create_connection((ip, port), timeout).close()
        return True
    except OSError:
        return False


# ---------- conexión de desarrollador (protocolo tipo ADB), como ../sdb.py ----------

def msg(cmd, a0, a1, data=b""):
    c = struct.unpack("<I", cmd)[0]
    return struct.pack("<6I", c, a0, a1, len(data), sum(data) & 0xFFFFFFFF, c ^ 0xFFFFFFFF) + data


def recv_exact(s, n):
    b = b""
    while len(b) < n:
        c = s.recv(n - len(b))
        if not c:
            raise ConnectionError("cerrado")
        b += c
    return b


def recv_msg(s):
    c, a0, a1, ln, _, _ = struct.unpack("<6I", recv_exact(s, 24))
    return struct.pack("<I", c), a0, a1, recv_exact(s, ln) if ln else b""


def sdb_connect(tv, timeout=20):
    s = socket.create_connection((tv, SDB_PORT), timeout)
    s.sendall(msg(b"CNXN", 0x01000000, 256 * 1024, b"host::\0"))
    c, *_ = recv_msg(s)
    if c != b"CNXN":
        s.close()
        raise ConnectionError(c)
    return s


def sdb_ok(tv):
    try:
        sdb_connect(tv, 5).close()
        return True
    except Exception:
        return False


def shell(tv, cmd, timeout=120):
    s = sdb_connect(tv, timeout)
    s.sendall(msg(b"OPEN", 1, 0, f"shell:{cmd}\0".encode()))
    out = b""
    try:
        while True:
            c, a0, _, data = recv_msg(s)
            if c == b"WRTE":
                out += data
                s.sendall(msg(b"OKAY", 1, a0))
            elif c == b"CLSE":
                break
    except (socket.timeout, ConnectionError):
        pass
    s.close()
    return out.decode(errors="replace")


def push(tv, data, remote_path, mode=0o100755):
    s = sdb_connect(tv, 60)
    s.sendall(msg(b"OPEN", 1, 0, b"sync:\0"))
    c, remote_id, _, _ = recv_msg(s)
    if c != b"OKAY":
        fail("La tele no deja copiar el archivo.")

    def write(payload):
        s.sendall(msg(b"WRTE", 1, remote_id, payload))
        while True:
            c, _, _, d = recv_msg(s)
            if c == b"OKAY":
                return
            if c == b"WRTE":
                s.sendall(msg(b"OKAY", 1, remote_id))
                if d[:4] == b"FAIL":
                    fail("La tele rechazó el archivo: " + d[8:].decode(errors="replace"))
            if c == b"CLSE":
                fail("La tele cortó la conexión mientras se copiaba la app.")

    target = f"{remote_path},{mode}".encode()
    write(b"SEND" + struct.pack("<I", len(target)) + target)
    for i in range(0, len(data), 60000):
        chunk = data[i:i + 60000]
        write(b"DATA" + struct.pack("<I", len(chunk)) + chunk)
    write(b"DONE" + struct.pack("<I", int(time.time())))
    c, _, _, d = recv_msg(s)
    s.sendall(msg(b"OKAY", 1, remote_id))
    if c != b"WRTE" or d[:4] != b"OKAY":
        fail("No se pudo copiar la app a la tele: " + d.decode(errors="replace"))
    write(b"QUIT" + struct.pack("<I", 0))
    s.close()


# ---------- mando por red: abre la ventana del modo desarrollador (como ../tvremote.py) ----------

def ws_frame(text):
    data = text.encode()
    mask = os.urandom(4)
    n = len(data)
    hdr = bytes([0x81, 0x80 | n]) if n < 126 else bytes([0x81, 0x80 | 126]) + struct.pack(">H", n)
    return hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data))


def ws_recv(s):
    h = recv_exact(s, 2)
    ln = h[1] & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", recv_exact(s, 2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", recv_exact(s, 8))[0]
    return json.loads(recv_exact(s, ln).decode(errors="replace"))


def remote(tv, port):
    name = base64.b64encode(b"Instalador StremTV").decode()
    raw = socket.create_connection((tv, port), 10)
    raw.settimeout(60)  # tiempo para pulsar «Permitir» en la tele
    if port == 8002:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        s = ctx.wrap_socket(raw)
    else:
        s = raw
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET /api/v2/channels/samsung.remote.control?name={name} HTTP/1.1\r\nHost: {tv}:{port}\r\n"
               f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n").encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        c = s.recv(1)
        if not c:
            raise ConnectionError("cerrado")
        resp += c
    if b" 101 " not in resp.split(b"\r\n")[0]:
        raise ConnectionError("handshake")
    m = ws_recv(s)
    while m.get("event", "").startswith("ms.remote."):
        m = ws_recv(s)
    if m.get("event") != "ms.channel.connect":
        raise ConnectionError(m.get("event"))
    return s


def open_dev_dialog(tv, ports):
    for port in (8002, 8001):
        if port not in ports:
            continue
        try:
            say("📺 Mira la tele: si sale un aviso para dejar conectar un aparato, pulsa «Permitir» con el mando.")
            s = remote(tv, port)
            s.sendall(ws_frame(json.dumps({"method": "ms.channel.emit", "params": {
                "event": "ed.apps.launch", "to": "host",
                "data": {"appId": "org.volt.apps", "action_type": "NATIVE_LAUNCH"}}})))
            time.sleep(6)
            for d in "12345":
                s.sendall(ws_frame(json.dumps({"method": "ms.remote.control", "params": {
                    "Cmd": "Click", "DataOfCmd": f"KEY_{d}", "Option": "false", "TypeOfRemote": "SendRemoteKey"}})))
                time.sleep(0.7)
            s.close()
            return True
        except Exception:
            continue
    return False


# ---------- pasos ----------

def get_wgt():
    here = os.path.dirname(os.path.abspath(__file__))
    for p in (os.path.join(here, "StremTV.wgt"), "StremTV.wgt"):
        if os.path.exists(p) and os.path.getsize(p) > 10000:
            return open(p, "rb").read()
    say("Descargando StremTV…")
    try:
        return urllib.request.urlopen(WGT_URL, timeout=60).read()
    except Exception as e:
        fail("No se pudo descargar la app.", str(e))


def find_tv(base):
    found = scan(base, [SDB_PORT, 8001, 8002])
    tvs = {ip: p for ip, p in found.items() if p & {8001, 8002, SDB_PORT}}
    # el puerto de desarrollador solo lo tiene una Samsung en modo desarrollador: va primero
    return sorted(tvs.items(), key=lambda kv: SDB_PORT not in kv[1])


def install(tv, wgt):
    say("✅ La tele acepta el iPhone. Instalando StremTV (tarda un minuto, no cierres esta app)…")
    push(tv, wgt, REMOTE_PKG)
    out = shell(tv, f"0 vd_appinstall {PKG} {REMOTE_PKG}")
    if "install completed" not in out:
        fail("La tele no ha aceptado la instalación.", out.strip()[-600:])
    try:
        shell(tv, f"0 was_execute {APP_ID}", timeout=20)
    except Exception:
        pass
    say("🎉 ¡LISTO! StremTV está instalada.",
        "",
        "La tienes en la lista de aplicaciones de la tele (icono morado).",
        "Se actualiza sola: no hace falta volver a hacer esto.")


def main():
    probe = "--probar" in sys.argv
    say("=== Instalador de StremTV ===")
    me = my_ip()
    if not me or not private(me):
        fail("El iPhone no está en un Wi-Fi de casa.",
             "Conéctalo al mismo Wi-Fi que la tele y vuelve a pegar el comando.")
    base = me.rsplit(".", 1)[0]
    say("Buscando la tele en el Wi-Fi…",
        "(si el iPhone pregunta si a-Shell puede buscar dispositivos en la red local, pulsa «Permitir»)")
    tvs = []
    for attempt in range(4):
        tvs = find_tv(base)
        if tvs:
            break
        time.sleep(3)  # la primera vez iOS puede bloquear las conexiones hasta que se pulsa «Permitir»
    if probe:
        say(f"IP de este aparato: {me}", f"Teles encontradas: {[(ip, sorted(p)) for ip, p in tvs] or 'ninguna'}",
            "Con todo esto bien, sin --probar la instalaría.")
        return
    if not tvs:
        fail("No encuentro la tele.",
             "Comprueba que está encendida y en el mismo Wi-Fi que el iPhone,",
             "y que en Ajustes del iPhone > a-Shell está activada «Red local».")

    for ip, _ in tvs:
        if sdb_ok(ip):  # ya en modo desarrollador con la IP de este iPhone
            install(ip, get_wgt())
            return

    tv, ports = tvs[0]
    opened = open_dev_dialog(tv, ports)
    say("────────────────────────────────",
        "📺 AHORA EN LA TELE:",
        "",
        ("Se ha abierto la ventana «Developer mode» (modo desarrollador)." if opened else
         "1. Ve a «Aplicaciones» con el mando y, ahí dentro, teclea 1 2 3 4 5 con los números del mando."
         "\n   Se abre la ventana «Developer mode» (modo desarrollador)."),
        "• Pon «Developer mode» en «On» (activado).",
        "• En «Host PC IP» escribe estos números (pasa de casilla con la flecha →):",
        "",
        f"        {me}",
        "",
        "• Baja a «OK» y pulsa el botón central del mando.",
        "• REINICIA LA TELE: desenchúfala de la pared, espera 30 segundos y vuelve a enchufarla.",
        "",
        "Después vuelve aquí y espera: el iPhone sigue solo.",
        "(si la pantalla del iPhone se apaga, desbloquéalo y vuelve a a-Shell)",
        "────────────────────────────────")

    wgt = get_wgt()
    end = time.time() + WAIT_MIN * 60
    last_scan = time.time()
    shown = time.time()
    while time.time() < end:
        try:
            if sdb_ok(tv):
                install(tv, wgt)
                return
            if time.time() - last_scan > 30:  # tras reiniciar, la tele puede cambiar de IP
                last_scan = time.time()
                for ip, p in find_tv(base):
                    if SDB_PORT in p and sdb_ok(ip):
                        install(ip, wgt)
                        return
                    if ip != tv and not is_open(tv, 8002) and not is_open(tv, SDB_PORT):
                        tv = ip
            if time.time() - shown > 45:
                shown = time.time()
                print(f"… esperando a la tele (¿has puesto {me}, OK y la has reiniciado?)")
                sys.stdout.flush()
        except Exception:
            pass  # el iPhone se ha bloqueado o la tele se está reiniciando: se reintenta
        time.sleep(3)
    fail("La tele no ha aceptado el iPhone en 20 minutos.",
         f"Revisa que en «Host PC IP» pone {me}, que «Developer mode» está en «On»,",
         "reinicia otra vez la tele (desenchufándola) y vuelve a pegar el comando.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelado.")
