import json

from aiohttp import web
from comfy_api.latest import ComfyExtension
from server import PromptServer

from .core import clamp_age, color_name, decode_character, encode_character, load_catalog, public_catalog, render_prompt
from .nodes import ApplyCharacterControlNets, ApplyCharacterModelControls, CharacterControlNetEntry, CharacterCreator, CharacterQwenControlEntry

WEB_DIRECTORY = "./web"


@PromptServer.instance.routes.get("/character-creator/catalog")
async def character_creator_catalog(request):
    try:
        return web.json_response(public_catalog(load_catalog()), headers={"Cache-Control": "no-store"})
    except (OSError, ValueError) as error:
        return web.json_response({"error": str(error)}, status=400)


@PromptServer.instance.routes.post("/character-creator/resolve")
async def character_creator_resolve(request):
    body = bytearray()
    async for chunk in request.content.iter_chunked(8192):
        body.extend(chunk)
        if len(body) > 65536:
            return web.json_response({"error": "Character request exceeds 64 KiB."}, status=400)
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict) or set(payload) not in ({"code"}, {"settings"}):
            raise ValueError("Send either code or settings.")
        settings = decode_character(payload["code"]) if "code" in payload else payload["settings"]
        if isinstance(settings, dict) and "age" in settings:
            settings = {**settings, "age": clamp_age(settings["age"])}
        catalog = load_catalog()
        prompt = render_prompt(settings, catalog)
        return web.json_response({"settings": settings, "prompt": prompt, "code": encode_character(settings),
                                  "color_labels": {field: color_name(value, catalog["color_names"])
                                                   for field, value in settings.get("colors", {}).items()}},
                                 headers={"Cache-Control": "no-store"})
    except (OSError, ValueError, RecursionError) as error:
        return web.json_response({"error": str(error)}, status=400)


class CharacterCreatorExtension(ComfyExtension):
    async def get_node_list(self):
        return [CharacterCreator, CharacterControlNetEntry, ApplyCharacterControlNets, CharacterQwenControlEntry, ApplyCharacterModelControls]


async def comfy_entrypoint():
    return CharacterCreatorExtension()
