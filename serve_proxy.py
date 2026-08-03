import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ProxyStaticHandler(SimpleHTTPRequestHandler):
    geoserver_base = os.getenv("GEOSERVER_BASE", "http://localhost:8080").rstrip("/")

    def do_GET(self):
        if self.path.startswith("/geoserver/"):
            self._proxy_request("GET")
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/geoserver/"):
            self._proxy_request("HEAD")
            return
        super().do_HEAD()

    def _proxy_request(self, method):
        target = f"{self.geoserver_base}{self.path}"
        request = Request(target, method=method)

        try:
            with urlopen(request, timeout=30) as response:
                body = response.read()
                self.send_response(response.status)

                content_type = response.headers.get("Content-Type")
                if content_type:
                    self.send_header("Content-Type", content_type)

                cache_control = response.headers.get("Cache-Control")
                if cache_control:
                    self.send_header("Cache-Control", cache_control)

                self.send_header("Content-Length", str(len(body)))
                self.end_headers()

                if method != "HEAD":
                    self.wfile.write(body)
        except HTTPError as error:
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get_content_type())
            self.end_headers()
            if method != "HEAD":
                self.wfile.write(error.read())
        except URLError as error:
            message = f"Proxy error hacia GeoServer: {error.reason}\n".encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            if method != "HEAD":
                self.wfile.write(message)


def main():
    server = ThreadingHTTPServer(("0.0.0.0", 5500), ProxyStaticHandler)
    print("Servidor visor + proxy activo en http://localhost:5500")
    print(f"Proxy GeoServer: /geoserver/* -> {ProxyStaticHandler.geoserver_base}/geoserver/*")
    server.serve_forever()


if __name__ == "__main__":
    main()
