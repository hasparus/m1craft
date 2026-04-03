#!/usr/bin/env python3
"""Minecraft Microsoft OAuth — device code flow with token caching.

Uses the official Minecraft launcher's Azure client ID (00000000402b5328)
for the login.live.com device code flow. This is the same approach used by
most third-party launchers (Prism, HMCL, etc).

Tokens are cached at ~/.m1craft-auth.json (chmod 600). The Minecraft access
token is valid for ~24h; the refresh token renews it without opening a browser.
"""
import json, os, sys, time, webbrowser
from urllib.request import Request, urlopen
from urllib.parse import urlencode

DEFAULT_CACHE = os.path.expanduser("~/.m1craft-auth.json")
LEGACY_CACHE = os.path.expanduser("~/.mc-auth-cache.json")
CACHE = os.environ.get("M1CRAFT_AUTH_CACHE_PATH") or os.environ.get("MC_ARM64_AUTH_CACHE_PATH") or DEFAULT_CACHE
CLIENT_ID = "00000000402b5328"
TIMEOUT = 15

def post_form(url, data):
    r = urlopen(Request(url, urlencode(data).encode(), {"Content-Type": "application/x-www-form-urlencoded"}), timeout=TIMEOUT)
    return json.loads(r.read())

def post_json(url, data):
    r = urlopen(Request(url, json.dumps(data).encode(), {"Content-Type": "application/json", "Accept": "application/json"}), timeout=TIMEOUT)
    return json.loads(r.read())

def get_json(url, headers):
    r = urlopen(Request(url, headers=headers), timeout=TIMEOUT)
    return json.loads(r.read())

def ms_device_code_flow():
    """Full device code flow via live.com — user approves in browser."""
    d = post_form("https://login.live.com/oauth20_connect.srf", {
        "client_id": CLIENT_ID,
        "scope": "service::user.auth.xboxlive.com::MBI_SSL",
        "response_type": "device_code",
    })
    print(f"\n  Open: {d['verification_uri']}", file=sys.stderr)
    print(f"  Code: {d['user_code']}\n", file=sys.stderr)
    webbrowser.open(f"{d['verification_uri']}?otc={d['user_code']}")

    while True:
        time.sleep(d["interval"])
        try:
            t = post_form("https://login.live.com/oauth20_token.srf", {
                "client_id": CLIENT_ID,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": d["device_code"],
            })
            if "access_token" in t:
                return t["access_token"], t.get("refresh_token", "")
        except Exception as e:
            body = e.read().decode() if hasattr(e, "read") else str(e)
            try:
                err = json.loads(body)
            except Exception:
                err = {"error": body}
            if err.get("error") == "authorization_pending":
                continue
            if err.get("error") == "slow_down":
                time.sleep(5)
                continue
            if err.get("error") == "expired_token":
                print("Code expired. Please try again.", file=sys.stderr)
                sys.exit(1)
            print(f"Auth failed: {err.get('error_description', err)}", file=sys.stderr)
            sys.exit(1)

def ms_refresh(refresh_token):
    """Use refresh token to get new MS access token."""
    t = post_form("https://login.live.com/oauth20_token.srf", {
        "client_id": CLIENT_ID,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": "service::user.auth.xboxlive.com::MBI_SSL",
    })
    return t["access_token"], t.get("refresh_token", refresh_token)

def ms_to_minecraft(ms_token):
    """MS access token → Xbox Live → XSTS → Minecraft token + profile."""
    xbl = post_json("https://user.auth.xboxlive.com/user/authenticate", {
        "Properties": {"AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": ms_token},
        "RelyingParty": "http://auth.xboxlive.com", "TokenType": "JWT",
    })
    xbl_token = xbl["Token"]

    xsts = post_json("https://xsts.auth.xboxlive.com/xsts/authorize", {
        "Properties": {"SandboxId": "RETAIL", "UserTokens": [xbl_token]},
        "RelyingParty": "rp://api.minecraftservices.com/", "TokenType": "JWT",
    })
    xsts_token = xsts["Token"]
    uhs = xsts["DisplayClaims"]["xui"][0]["uhs"]

    mc = post_json("https://api.minecraftservices.com/authentication/login_with_xbox", {
        "identityToken": f"XBL3.0 x={uhs};{xsts_token}",
    })
    mc_token = mc["access_token"]
    expires_at = int(time.time()) + mc.get("expires_in", 86400)

    prof = get_json("https://api.minecraftservices.com/minecraft/profile",
                     {"Authorization": f"Bearer {mc_token}"})

    return mc_token, prof["id"], prof["name"], expires_at

def load_cache():
    paths = [CACHE]
    if CACHE == DEFAULT_CACHE and LEGACY_CACHE != DEFAULT_CACHE:
        paths.append(LEGACY_CACHE)
    for path in paths:
        try:
            with open(path) as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            continue
    return {}

def save_cache(data):
    with open(CACHE, "w") as f:
        json.dump(data, f)
    os.chmod(CACHE, 0o600)

def main():
    cache = load_cache()

    # Try cached MC token
    if cache.get("access_token") and cache.get("expires_at", 0) > time.time() + 60:
        json.dump({"accessToken": cache["access_token"], "uuid": cache["uuid"], "username": cache["username"]}, sys.stdout)
        return

    # Try refresh token
    if cache.get("refresh_token"):
        print("Refreshing token...", file=sys.stderr)
        try:
            ms_token, refresh_token = ms_refresh(cache["refresh_token"])
        except Exception as e:
            print(f"Refresh failed ({e}), need new login.", file=sys.stderr)
            ms_token, refresh_token = ms_device_code_flow()
    else:
        ms_token, refresh_token = ms_device_code_flow()

    mc_token, uuid, username, expires_at = ms_to_minecraft(ms_token)
    save_cache({"refresh_token": refresh_token, "access_token": mc_token,
                "uuid": uuid, "username": username, "expires_at": expires_at})

    json.dump({"accessToken": mc_token, "uuid": uuid, "username": username}, sys.stdout)

if __name__ == "__main__":
    main()
