#!/usr/bin/env python3
"""Private SOCKS5 TCP relay. Does not decrypt provider TLS or inspect LLM content."""
import argparse
import asyncio
import ipaddress
import socket
import struct


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="10.77.0.1")
    parser.add_argument("--port", type=int, default=1080)
    parser.add_argument("--allow", default="api.anthropic.com,api.openai.com")
    args = parser.parse_args()
    if not ipaddress.ip_address(args.bind).is_private:
        parser.error("relay must bind a private WireGuard address")
    allowed = frozenset(args.allow.lower().split(","))
    semaphore = asyncio.Semaphore(64)
    active = {}

    async def pipe(reader, writer):
        while True:
            data = await asyncio.wait_for(reader.read(32768), timeout=120)
            if not data:
                if writer.can_write_eof():
                    writer.write_eof()
                return
            writer.write(data)
            await writer.drain()

    async def handle(reader, writer):
        upstream = None
        acquired = False
        counted = False
        established = False
        peer = writer.get_extra_info("peername")[0]
        try:
            if ipaddress.ip_address(peer) not in ipaddress.ip_network("10.77.0.0/16") or active.get(peer, 0) >= 8:
                return
            active[peer] = active.get(peer, 0) + 1
            counted = True
            await asyncio.wait_for(semaphore.acquire(), timeout=1)
            acquired = True
            version, length = await asyncio.wait_for(reader.readexactly(2), 5)
            methods = await asyncio.wait_for(reader.readexactly(length), 5)
            if version != 5 or 0 not in methods:
                writer.write(b"\x05\xff")
                await writer.drain()
                return
            writer.write(b"\x05\x00")
            await writer.drain()
            version, operation, reserved, kind = await asyncio.wait_for(reader.readexactly(4), 5)
            if (version, operation, reserved, kind) != (5, 1, 0, 3):
                raise ValueError("only domain-based SOCKS CONNECT is allowed")
            length = (await asyncio.wait_for(reader.readexactly(1), 5))[0]
            hostname = (await asyncio.wait_for(reader.readexactly(length), 5)).decode("ascii").lower()
            port = struct.unpack("!H", await asyncio.wait_for(reader.readexactly(2), 5))[0]
            if hostname not in allowed or port != 443:
                raise ValueError("destination not permitted")
            answers = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(hostname, port,
                                              family=socket.AF_INET, type=socket.SOCK_STREAM), 5)
            addresses = [entry[4][0] for entry in answers]
            if not addresses or not all(ipaddress.ip_address(address).is_global for address in addresses):
                raise ValueError("provider DNS returned a non-public address")
            upstream_reader, upstream = await asyncio.wait_for(asyncio.open_connection(addresses[0], port), 10)
            writer.write(b"\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
            await writer.drain()
            established = True
            outgoing = asyncio.create_task(pipe(reader, upstream))
            incoming = asyncio.create_task(pipe(upstream_reader, writer))
            try:
                await asyncio.wait_for(asyncio.gather(outgoing, incoming), 3600)
            finally:
                outgoing.cancel()
                incoming.cancel()
                await asyncio.gather(outgoing, incoming, return_exceptions=True)
        except (ValueError, UnicodeError, OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
            # No request content or hostnames in logs. Client gets a generic SOCKS failure.
            try:
                if not established:
                    writer.write(b"\x05\x02\x00\x01\x00\x00\x00\x00\x00\x00")
                    await writer.drain()
            except OSError:
                pass
        finally:
            if acquired:
                semaphore.release()
            if counted:
                active[peer] -= 1
                if active[peer] <= 0:
                    del active[peer]
            if upstream:
                upstream.close()
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass

    server = await asyncio.start_server(handle, args.bind, args.port, limit=65536)
    print("OMNI private TLS-opaque SOCKS relay ready", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
