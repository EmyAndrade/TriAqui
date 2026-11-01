"""API HTTP local da IA Python. Sem dependências externas e sem acesso ao MySQL."""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from triage_model import MODEL, classify


class TriageHandler(BaseHTTPRequestHandler):
    server_version = "TriAquiPython/2"

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def reply(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path != "/health":
            return self.reply(404, {"mensagem": "Rota não encontrada."})
        self.reply(200, {"status": "online", "servico": "triaqui-python-ia", **MODEL.metadata})

    def do_POST(self):
        if urlsplit(self.path).path != "/predict":
            return self.reply(404, {"mensagem": "Rota não encontrada."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 65536:
                return self.reply(413, {"mensagem": "Corpo de requisição inválido ou muito grande."})
            if self.headers.get("Content-Type", "").split(";", 1)[0].strip() != "application/json":
                return self.reply(415, {"mensagem": "Envie application/json."})
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result = classify(payload)
        except (ValueError, UnicodeError):
            return self.reply(422, {"mensagem": "Informe sintomas e descrição válidos."})
        except TimeoutError:
            return self.reply(408, {"mensagem": "Tempo de leitura esgotado."})
        self.reply(200, result)

    def log_message(self, *_args):
        # Não registrar sintomas, respostas ou identificadores de pacientes.
        pass


def create_server(port: int = 8001):
    return ThreadingHTTPServer(("127.0.0.1", port), TriageHandler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serviço local da IA de triagem TriAqui")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("A porta deve estar entre 1 e 65535.")
    server = create_server(args.port)
    print(f"IA Python pronta em http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
