"""A bounded, named local client. Input JSON arrives on stdin; no credentials in argv."""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def send(config):
    base = config["base"]
    url = urllib.parse.urlsplit(base)
    if url.scheme != "http" or url.hostname not in ("127.0.0.1", "localhost", "::1") or url.username or url.password:
        raise ValueError("The reference client requires a local OMNI gateway")
    body = json.dumps({"model": "omni-synthetic", "stream": False, "messages": [{"role": "user", "content": config.get("message", "Prepare a synthetic project budget.")}]}).encode()
    headers = {"Authorization": "Bearer " + config["token"], "Content-Type": "application/json"}
    if config.get("grant"):
        headers["X-Omni-Grant"] = config["grant"]
    request = urllib.request.Request(base + "/v1/chat/completions", body, headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        content = response.read(1024 * 1024 + 1)
        if len(content) > 1024 * 1024:
            raise ValueError("Response limit exceeded")
        return {"status": response.code, "receipt": response.headers.get("x-omni-receipt"), "body": json.loads(content)}

if __name__ == "__main__":
    config = json.loads(sys.stdin.buffer.read(8193))
    print(json.dumps(send(config)))
