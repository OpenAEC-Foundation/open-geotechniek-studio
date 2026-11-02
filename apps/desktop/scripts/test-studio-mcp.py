"""Exercise the Studio stdio proxy against an isolated authenticated loopback bridge.

Usage: python test-studio-mcp.py --executable /absolute/path/to/open-geo-studio.exe
The endpoint override keeps this test independent of any running Studio session.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", required=True, type=Path)
    args = parser.parse_args()
    token = str(uuid4())
    calls = []
    connected = set()
    failures = []

    class Bridge(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            if self.headers.get("Authorization") != f"Bearer {token}":
                failures.append("Missing bearer authentication")
                self.send_error(401)
                return
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if self.path == "/connect":
                if payload.get("name") != "stdio-contract-test":
                    failures.append("initialize clientInfo.name was not forwarded")
                connected.add("test-session")
                response = {"session": "test-session"}
            elif payload.get("session") != "test-session":
                self.send_error(401)
                return
            elif self.path == "/call":
                calls.append(payload)
                if payload["arguments"].get("title") == "simulate-io-error":
                    self.send_error(503)
                    return
                response = {"result": {"observedTool": payload["tool"], "observedArguments": payload["arguments"]}}
            elif self.path == "/disconnect":
                connected.discard("test-session")
                response = {"ok": True}
            elif self.path == "/heartbeat":
                response = {"ok": True}
            else:
                self.send_error(404)
                return
            body = json.dumps(response).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Bridge)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        with tempfile.TemporaryDirectory(prefix="studio-mcp-test-") as folder:
            endpoint = Path(folder) / "studio-mcp.json"
            endpoint.write_text(json.dumps({"url": f"http://127.0.0.1:{server.server_port}", "token": token}), encoding="utf-8")
            environment = dict(os.environ, OGS_MCP_ENDPOINT_FILE=str(endpoint))
            requests = [
                {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"clientInfo": {"name": "stdio-contract-test"}}},
                {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "studio_new_project"}},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "studio_get_calculation", "arguments": {"id": "sample-calculation"}}},
                {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "studio_new_project", "arguments": {"title": "simulate-io-error"}}},
            ]
            process = subprocess.run([str(args.executable.resolve()), "--mcp-studio"], input="".join(json.dumps(request) + "\n" for request in requests), capture_output=True, text=True, env=environment, timeout=20)
            assert process.returncode == 0, f"Proxy exit code {process.returncode}: {process.stderr}"
            responses = [json.loads(line) for line in process.stdout.splitlines()]
            assert [response["id"] for response in responses] == [1, 2, 3, 4], "Unexpected notification response or stdout diagnostics"
            tools = responses[1]["result"]["tools"]
            assert len(tools) == 11 and all(tool["name"].startswith("studio_") for tool in tools)
            assert len(calls) == 2, "A notification executed a tool or an ambiguous failed tool was replayed"
            result = responses[2]["result"]
            assert result["isError"] is False
            observed = json.loads(result["content"][0]["text"])
            assert observed == {"observedTool": "studio_get_calculation", "observedArguments": {"id": "sample-calculation"}}
            assert responses[3]["result"]["isError"] is True, "Operational failures must be MCP tool errors"
            assert "error" not in responses[3], "An operational tool failure was reported as an unknown MCP method"
            assert not connected, "EOF did not disconnect the Studio session"
            assert not failures, failures
        print("Studio MCP stdio contract: PASS (initialize, auth, notifications, tools, roundtrip, no replay, EOF)")
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)


if __name__ == "__main__":
    main()
