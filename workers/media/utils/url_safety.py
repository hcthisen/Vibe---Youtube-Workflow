import ipaddress
import socket
from typing import Optional, Tuple
from urllib.parse import urlparse

BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
}

BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home")


def _is_public_ip(ip: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip)
    except ValueError:
        return False

    return not (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    )


def _is_public_host(hostname: str) -> bool:
    if not hostname:
        return False

    normalized = hostname.rstrip(".").lower()
    if normalized in BLOCKED_HOSTS:
        return False

    if normalized.endswith(BLOCKED_SUFFIXES):
        return False

    try:
        # If hostname is already an IP
        ipaddress.ip_address(normalized)
        return _is_public_ip(normalized)
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(normalized, None)
    except OSError:
        return False

    if not infos:
        return False

    for info in infos:
        ip = info[4][0]
        if not _is_public_ip(ip):
            return False

    return True


def validate_external_url(url: str, allowed_ports: Tuple[int, ...] = (80, 443)) -> Tuple[bool, Optional[str], Optional[str]]:
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid URL", None

    if parsed.scheme not in ("http", "https"):
        return False, "Only http/https URLs are allowed", None

    if parsed.username or parsed.password:
        return False, "Credentials in URL are not allowed", None

    if parsed.port and parsed.port not in allowed_ports:
        return False, "Only ports 80 and 443 are allowed", None

    if not _is_public_host(parsed.hostname or ""):
        return False, "URL resolves to a private or invalid address", None

    return True, None, parsed.geturl()
