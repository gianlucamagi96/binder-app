"""Scarica le immagini ufficiali delle carte da TCGdex in data/refs/{lang}/.

Incrementale: le immagini già presenti non si riscaricano, quindi per un set
nuovo basta rilanciarlo. Accanto alle immagini scrive data/refs/cards.json con
set e numero di ogni carta, che build_index.py usa come metadati.

    python scripts/download_refs.py --sets base1 base4 sv03.5
    python scripts/download_refs.py            # tutti i set, en + it
"""

import argparse
import asyncio
import json
import re
from pathlib import Path

import httpx

API = "https://api.tcgdex.net/v2"
LANGS = ("en", "it")
# Stessa regola di apps/backend/src/catalog/excluded-cards.ts: le carte di
# Pokémon TCG Pocket sono solo digitali e non finiscono in un binder.
EXCLUDED_SERIES = ("tcgp",)
CONCURRENCY = 8
RETRIES = 3


def safe_name(card_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", card_id)


async def get_json(client: httpx.AsyncClient, path: str):
    for attempt in range(RETRIES):
        try:
            response = await client.get(f"{API}/{path}")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            if attempt == RETRIES - 1:
                raise
            await asyncio.sleep(1.5 * (attempt + 1))
    return None


async def download(client: httpx.AsyncClient, url: str, target: Path, gate: asyncio.Semaphore) -> bool:
    async with gate:
        for attempt in range(RETRIES):
            try:
                response = await client.get(url)
                if response.status_code == 404:
                    return False
                response.raise_for_status()
                target.parent.mkdir(parents=True, exist_ok=True)
                partial = target.with_suffix(".part")
                partial.write_bytes(response.content)
                partial.replace(target)
                return True
            except httpx.HTTPError:
                if attempt == RETRIES - 1:
                    print(f"  ! {url} non scaricata")
                    return False
                await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def excluded_set_ids(client: httpx.AsyncClient) -> set[str]:
    ids: set[str] = set()
    for serie in EXCLUDED_SERIES:
        data = await get_json(client, f"en/series/{serie}") or {}
        ids.update(item["id"] for item in data.get("sets", []))
    return ids


async def run(refs_dir: Path, langs: list[str], only_sets: list[str] | None) -> None:
    catalog_path = refs_dir / "cards.json"
    catalog: dict[str, dict] = json.loads(catalog_path.read_text("utf-8")) if catalog_path.exists() else {}
    gate = asyncio.Semaphore(CONCURRENCY)

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        excluded = await excluded_set_ids(client)
        for lang in langs:
            if only_sets:
                set_ids = only_sets
            else:
                listed = await get_json(client, f"{lang}/sets") or []
                set_ids = [item["id"] for item in listed]
            set_ids = [set_id for set_id in set_ids if set_id not in excluded]

            for set_id in set_ids:
                detail = await get_json(client, f"{lang}/sets/{set_id}")
                if not detail:
                    print(f"[{lang}] {set_id}: set non presente")
                    continue
                jobs = []
                for card in detail.get("cards", []):
                    entry = catalog.setdefault(
                        card["id"],
                        {"set_id": set_id, "local_id": card.get("localId", ""), "names": {}, "files": {}},
                    )
                    entry["names"][lang] = card.get("name", "")
                    if not card.get("image"):
                        continue
                    relative = f"{lang}/{safe_name(card['id'])}.webp"
                    target = refs_dir / relative
                    if target.exists():
                        entry["files"][lang] = relative
                        continue
                    jobs.append(
                        (entry, relative, download(client, f"{card['image']}/high.webp", target, gate))
                    )

                results = await asyncio.gather(*(job for _, _, job in jobs))
                for (entry, relative, _), ok in zip(jobs, results, strict=True):
                    if ok:
                        entry["files"][lang] = relative
                with_image = sum(1 for card in detail.get("cards", []) if card.get("image"))
                print(
                    f"[{lang}] {set_id}: {len(detail.get('cards', []))} carte, "
                    f"{with_image} con immagine, {sum(results)} nuove"
                )
                # Salva a ogni set: se lo script si interrompe non si perde il lavoro fatto.
                refs_dir.mkdir(parents=True, exist_ok=True)
                catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), "utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--refs-dir", type=Path, default=Path("data/refs"))
    parser.add_argument("--langs", nargs="+", default=list(LANGS), choices=LANGS)
    parser.add_argument("--sets", nargs="+", help="solo questi set (id TCGdex)")
    args = parser.parse_args()
    asyncio.run(run(args.refs_dir, args.langs, args.sets))


if __name__ == "__main__":
    main()
