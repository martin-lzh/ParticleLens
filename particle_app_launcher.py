from __future__ import annotations

import os
import socket
import sys
import threading
import tkinter as tk
import webbrowser
from http.server import ThreadingHTTPServer
from pathlib import Path

from particle_web_app import ParticleHandler


HOST = "127.0.0.1"


def resource_path(*parts: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return root.joinpath(*parts)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def start_server() -> tuple[ThreadingHTTPServer, str]:
    port = find_free_port()
    server = ThreadingHTTPServer((HOST, port), ParticleHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://{HOST}:{port}/"


def main() -> None:
    server, url = start_server()
    if os.environ.get("PARTICLE_APP_NO_BROWSER") != "1":
        webbrowser.open(url)

    root = tk.Tk()
    root.title("ParticleLens")
    root.geometry("420x170")
    root.resizable(False, False)
    try:
        root.iconbitmap(str(resource_path("static", "favicon.ico")))
    except tk.TclError:
        pass

    tk.Label(root, text="ParticleLens is running.", font=("Segoe UI", 11, "bold")).pack(pady=(18, 4))
    tk.Label(root, text="Use the browser window to analyze and export particle sizes.").pack()
    tk.Label(root, text=url, fg="#1f5fbf").pack(pady=(8, 10))

    buttons = tk.Frame(root)
    buttons.pack()

    tk.Button(buttons, text="Open App", width=14, command=lambda: webbrowser.open(url)).pack(side=tk.LEFT, padx=6)

    def quit_app() -> None:
        server.shutdown()
        server.server_close()
        root.destroy()

    tk.Button(buttons, text="Quit", width=14, command=quit_app).pack(side=tk.LEFT, padx=6)
    root.protocol("WM_DELETE_WINDOW", quit_app)
    root.mainloop()


if __name__ == "__main__":
    main()
