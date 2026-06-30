def ensure_https(url: str) -> str:
    if url and url.startswith("http://"):
        return "https://" + url[7:]
    return url or ""
