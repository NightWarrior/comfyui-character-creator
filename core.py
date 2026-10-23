import base64
import binascii
import hashlib
import json
import re
from pathlib import Path
from string import Formatter

ROOT = Path(__file__).parent
PREFIX = "CC1."
MAX_CODE_LENGTH = 32768
ADAPTERS = {"qwen_image_2_1": "Qwen Image 2.1", "sdxl": "SDXL", "sd": "Stable Diffusion 1.5"}
FRAGMENTS = {"opening", "scene", "pose", "appearance", "hair", "expression", "wardrobe", "lighting", "composition"}
ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
COLOR_FIELDS = ("skin_tone", "hair_color", "dress", "upper_garment", "lower_garment", "outerwear", "shoes", "headwear", "gloves", "eye_color", "lip_makeup", "earrings", "necklace", "piercings", "eyewear", "neckwear")
CLOTHING_FIELDS = ("dress", "upper_garment", "lower_garment", "outerwear", "shoes", "headwear", "gloves", "neckwear")
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def clamp_age(age):
    if type(age) is not int:
        raise ValueError("Age must be a whole number.")
    return max(18, min(100, age))


def validate_colors(colors):
    if not isinstance(colors, dict) or set(colors) - set(COLOR_FIELDS):
        raise ValueError("Colors must map colorable character fields to six-digit hex values.")
    if any(not isinstance(value, str) or not HEX_COLOR.fullmatch(value) for value in colors.values()):
        raise ValueError("Colors must be six-digit hex values such as #336699.")


def color_name(value, names):
    rgb = tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))
    def distance(swatch):
        other = tuple(int(swatch[index:index + 2], 16) for index in (1, 3, 5))
        return sum(weight * (a - b) ** 2 for weight, a, b in zip((2, 4, 3), rgb, other))
    return names[min(names, key=distance)]


def colored_phrase(template, name):
    phrase = template.replace("{color}", name)
    return re.sub(r"\b(?:a|an) " + re.escape(name) + r"\b",
                  ("an " if name[:1].lower() in "aeiou" else "a ") + name, phrase)


def read_json(path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def load_catalog(root=ROOT):
    catalog = read_json(root / "catalog.json")
    config_path = root / "config.json"
    config = read_json(config_path) if config_path.exists() else {}
    if not isinstance(config, dict) or set(config) - {"allow_nsfw", "options", "templates", "color_names"}:
        raise ValueError("config.json accepts only allow_nsfw, options, templates and color_names.")
    color_names = config.get("color_names", {})
    if not isinstance(color_names, dict):
        raise ValueError("color_names must map hex colors to descriptive names.")
    for value, name in color_names.items():
        if not HEX_COLOR.fullmatch(value) or not isinstance(name, str) or not name.strip():
            raise ValueError("color_names must map six-digit hex colors to nonempty names.")
        catalog["color_names"][value.lower()] = name.strip()
    if "allow_nsfw" in config and type(config["allow_nsfw"]) is not bool:
        raise ValueError("allow_nsfw must be a JSON boolean.")
    catalog["allow_nsfw"] = config.get("allow_nsfw", False)
    fields = {**catalog["fields"], **catalog["extra_fields"]}
    extensions = config.get("options", {})
    if not isinstance(extensions, dict) or set(extensions) - (set(fields) - {"wardrobe_mode"}):
        raise ValueError("Custom options must belong to an existing catalog field; wardrobe_mode is fixed.")
    for field, options in extensions.items():
        if not isinstance(options, list):
            raise ValueError(f"Custom options for {field} must be a list.")
        existing = {option["id"] for option in fields[field]["options"]}
        for option in options:
            if (not isinstance(option, dict) or not isinstance(option.get("id"), str)
                    or option["id"] in existing):
                raise ValueError(f"Custom options need unique IDs in {field}.")
            fields[field]["options"].append(option)
            existing.add(option.get("id"))
    templates = config.get("templates", {})
    if not isinstance(templates, dict):
        raise ValueError("templates must be an object keyed by template ID.")
    catalog["templates"].update(templates)
    for field, spec in fields.items():
        spec["options"].sort(key=lambda option: option.get("id") != "none")
        for option in spec["options"]:
            if (not isinstance(option.get("id"), str) or not ID_PATTERN.fullmatch(option["id"])
                    or set(option) - {"id", "label", "phrase", "icon", "color", "covers", "nsfw", "color_phrase", "fabric", "details", "cropped_phrase", "modifiers", "wardrobe_role"}
                    or any(not isinstance(option.get(key), str) for key in ("label", "phrase", "icon"))):
                raise ValueError(f"Invalid catalog option in {field}.")
            if "color_phrase" in option and (not isinstance(option["color_phrase"], str)
                    or option["color_phrase"].count("{color}") != 1
                    or any(char in option["color_phrase"].replace("{color}", "") for char in "{}")):
                raise ValueError(f"color_phrase must contain exactly one {{color}} placeholder in {field}.")
            if "nsfw" in option and type(option["nsfw"]) is not bool:
                raise ValueError(f"nsfw must be a boolean in {field}.")
            if "covers" in option and (not isinstance(option["covers"], list)
                    or any(part not in {"upper", "lower"} for part in option["covers"])):
                raise ValueError(f"Invalid clothing coverage in {field}.")
            if "color" in option and (not isinstance(option["color"], str)
                    or not re.fullmatch(r"#[0-9a-fA-F]{6}", option["color"])):
                raise ValueError(f"Colors must be six-digit hex values in {field}.")
            metadata = {**option, **spec.get("option_details", {}).get(option["id"], {})}
            if any(key in metadata and not isinstance(metadata[key], str) for key in ("fabric", "cropped_phrase")):
                raise ValueError(f"Garment material and cropped pose phrases must be text in {field}.")
            if "details" in metadata and (not isinstance(metadata["details"], list)
                    or any(not isinstance(key, str) or key not in catalog["clothing"]["details"] for key in metadata["details"])):
                raise ValueError(f"Unknown garment details in {field}.")
            if not isinstance(metadata.get("modifiers", {}), dict):
                raise ValueError(f"Garment modifiers must be an object in {field}.")
            if "wardrobe_role" in metadata and (metadata["wardrobe_role"] not in {"underwear", "lingerie"} or not option.get("nsfw")):
                raise ValueError(f"Intimate wardrobe roles require an NSFW option in {field}.")
            for kind, values in metadata.get("modifiers", {}).items():
                if kind not in catalog["clothing"]["modifiers"] or not isinstance(values, list) or any(value not in catalog["clothing"]["modifiers"][kind]["options"] for value in values):
                    raise ValueError(f"Unknown garment modifiers in {field}.")
        if spec["default"] not in {option["id"] for option in spec["options"]}:
            raise ValueError(f"Missing default option for {field}.")
    for template_id, template in catalog["templates"].items():
        if (not ID_PATTERN.fullmatch(template_id) or not isinstance(template, dict)
                or set(template) - {"label", "format", "nsfw"}
                or not isinstance(template.get("label"), str) or not isinstance(template.get("format"), str)):
            raise ValueError("Invalid prompt template.")
        if "nsfw" in template and type(template["nsfw"]) is not bool:
            raise ValueError("Template nsfw must be a boolean.")
        for _, name, spec, conversion in Formatter().parse(template["format"]):
            if name is not None and (name not in FRAGMENTS or spec or conversion):
                raise ValueError(f"Unsupported placeholder in template {template_id}.")
    return catalog


def defaults(catalog):
    return {"model": "qwen_image_2_1", "template": "character", **{
        name: spec["default"] for name, spec in catalog["fields"].items()
    }}


def starter_characters(catalog):
    characters = read_json(ROOT / "web" / "characters.json")
    for character in characters:
        render_prompt(character["settings"], catalog)
    return characters


def resolve_character(settings, catalog):
    expected = set(defaults(catalog))
    optional = {"colors", "age", "clothing", "ethnicity"} | set(catalog["extra_fields"])
    if not isinstance(settings, dict) or set(settings) - optional != expected:
        raise ValueError("Character settings must contain exactly the current catalog fields, model and template.")
    if any(not isinstance(value, str) for key, value in settings.items() if key not in {"colors", "age", "clothing"}):
        raise ValueError("Character settings must be option IDs expressed as strings.")
    validate_colors(settings.get("colors", {}))
    if settings.get("ethnicity", "unspecified") not in {option["id"] for option in catalog["ethnicity"]["options"]}:
        raise ValueError("Unknown ethnicity / heritage option.")
    if "age" in settings:
        clamp_age(settings["age"])
    if settings["model"] not in ADAPTERS:
        raise ValueError("Unsupported model family. Choose Qwen Image 2.1, SDXL or Stable Diffusion 1.5.")
    template = catalog["templates"].get(settings["template"])
    if template is None:
        raise ValueError("Unknown prompt template; install the matching local configuration.")
    selected = {}
    for field, spec in {**catalog["fields"], **catalog["extra_fields"]}.items():
        options = {option["id"]: option for option in spec["options"]}
        value = settings.get(field, spec["default"])
        if value not in options:
            raise ValueError(f"Unknown option {settings[field]!r} for {field}; install the matching local catalog.")
        selected[field] = {**options[value], **spec.get("option_details", {}).get(value, {})}
    clothing = settings.get("clothing", {})
    if not isinstance(clothing, dict) or set(clothing) - set(CLOTHING_FIELDS):
        raise ValueError("Clothing refinements must map garment fields to fabric, texture and details.")
    for field, refinements in clothing.items():
        if not isinstance(refinements, dict) or set(refinements) - {"fabric", "texture", "details", "opacity", *catalog["clothing"]["modifiers"]}:
            raise ValueError(f"Invalid clothing refinements for {field}.")
        for key in ("fabric", "texture"):
            value = refinements.get(key, "default")
            if not isinstance(value, str) or value not in catalog["clothing"][key]:
                raise ValueError(f"Unknown clothing {key} for {field}.")
            if catalog["clothing"][key][value].get("nsfw") and not catalog["allow_nsfw"]:
                raise ValueError("Restricted materials require allow_nsfw: true in local config.json.")
        for kind, spec in catalog["clothing"]["modifiers"].items():
            value = refinements.get(kind, "default")
            if not isinstance(value, str) or value not in spec["options"]:
                raise ValueError(f"Unknown clothing {kind} for {field}.")
            if value == "default":
                continue
            if value not in selected[field].get("modifiers", {}).get(kind, []):
                raise ValueError(f"The selected {field} does not support {kind}={value}.")
            if spec["options"][value].get("nsfw") and not catalog["allow_nsfw"]:
                raise ValueError("Restricted garment modifications require allow_nsfw: true in local config.json.")
        sleeve = refinements.get("sleeve_length", "default")
        if refinements.get("sleeve_roll", "default") != "default" and sleeve in {"sleeveless", "cap", "short", "elbow", "three_quarter"}:
            raise ValueError("Rolled sleeves need original or full-length sleeves.")
        if "opacity" in refinements:
            opacity = refinements["opacity"]
            if type(opacity) is not int or not 0 <= opacity <= 100:
                raise ValueError("Garment opacity must be a whole number between 0 and 100.")
            if not catalog["clothing"]["fabric"][refinements.get("fabric", "default")].get("transparency"):
                raise ValueError("Opacity is available only for materials that support transparency.")
            if opacity < 100 and not catalog["allow_nsfw"]:
                raise ValueError("Transparent garments require allow_nsfw: true in local config.json.")
        details = refinements.get("details", {})
        if not isinstance(details, dict) or set(details) - set(catalog["clothing"]["details"]):
            raise ValueError(f"Unknown clothing detail for {field}.")
        if any(not isinstance(value, str) or not HEX_COLOR.fullmatch(value) for value in details.values()):
            raise ValueError("Clothing detail colors must be six-digit hex values.")
    if not catalog["allow_nsfw"]:
        if template.get("nsfw", False) or any(option.get("nsfw", False) for option in selected.values()):
            raise ValueError("Restricted options require allow_nsfw: true in local config.json.")
        coverage = garment_coverage(settings, selected)
        if not {"upper", "lower"}.issubset(coverage):
            raise ValueError("This outfit leaves the torso or lower body uncovered. Select covering garments or explicitly enable allow_nsfw in local config.json.")
    return selected


def garment_coverage(settings, selected):
    garments = ["dress"] if settings["wardrobe_mode"] == "dress" else ["upper_garment", "lower_garment"]
    coverage = set()
    for field in garments:
        refinements = settings.get("clothing", {}).get(field, {})
        if refinements.get("opacity", 100) < 100 or refinements.get("closure") in {"open", "unzipped", "half_open"}:
            continue
        coverage.update(selected[field].get("covers", []))
    return coverage


def encode_character(settings):
    if "age" in settings:
        settings = {**settings, "age": clamp_age(settings["age"])}
    payload = json.dumps({"version": 1, "settings": settings}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    code = PREFIX + base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    if len(code) > MAX_CODE_LENGTH:
        raise ValueError("Character code exceeds the 32 KiB limit.")
    return code


def decode_character(code):
    if not isinstance(code, str):
        raise ValueError("Character code must be text.")
    code = code.strip()
    if len(code) > MAX_CODE_LENGTH or not code.startswith(PREFIX):
        raise ValueError("Expected a CC1 character code of at most 32 KiB.")
    body = code[len(PREFIX):]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", body):
        raise ValueError("Invalid URL-safe base64 character code.")
    try:
        payload = json.loads(base64.b64decode(body + "=" * (-len(body) % 4), altchars=b"-_", validate=True).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, binascii.Error, RecursionError) as error:
        raise ValueError("Invalid character code payload.") from error
    if (not isinstance(payload, dict) or set(payload) != {"version", "settings"}
            or type(payload["version"]) is not int or payload["version"] != 1
            or not isinstance(payload["settings"], dict)):
        raise ValueError("Unsupported character document; expected version 1 and settings only.")
    settings = payload["settings"]
    if "age" in settings:
        settings["age"] = clamp_age(settings["age"])
    return settings


def config_fingerprint(root=ROOT):
    digest = hashlib.sha256((root / "catalog.json").read_bytes())
    config_path = root / "config.json"
    if config_path.exists():
        digest.update(config_path.read_bytes())
    return digest.hexdigest()


def public_catalog(catalog):
    return {"fields": catalog["fields"], "templates": {
        key: value for key, value in catalog["templates"].items()
        if catalog["allow_nsfw"] or not value.get("nsfw", False)
    }, "models": ADAPTERS, "allow_nsfw": catalog["allow_nsfw"],
        "color_fields": list(COLOR_FIELDS), "color_names": catalog["color_names"], "clothing": catalog["clothing"],
        "ethnicity": catalog["ethnicity"], "extra_fields": catalog["extra_fields"], "clothing_fields": list(CLOTHING_FIELDS)}


def render_prompt(settings, catalog):
    selected = resolve_character(settings, catalog)
    return RENDERERS[settings["model"]](settings, selected, catalog["templates"][settings["template"]], catalog)


def character_fragments(settings, selected, catalog):
    color_names = catalog["color_names"]
    phrase = {key: option["phrase"] for key, option in selected.items()}
    if settings.get("necklace") == "choker" and settings.get("neckwear", "none") != "none":
        phrase["necklace"] = ""
    phrase['art_style'] = re.sub(r'^(?:a|an) ', '', phrase['art_style'])
    for field, value in settings.get("colors", {}).items():
        if not phrase[field]:
            continue
        color_template = selected[field].get("color_phrase")
        if color_template is None:
            raise ValueError(f"The selected {field} option needs a color_phrase template to customize its color.")
        phrase[field] = colored_phrase(color_template, color_name(value, color_names))
    subject = f"an adult {phrase['gender']} {phrase['life_stage']}"
    if "age" in settings:
        subject = f"an adult {phrase['gender']} aged {clamp_age(settings['age'])} years"
    main_garments = ["dress"] if settings["wardrobe_mode"] == "dress" else ["upper_garment", "lower_garment"]
    visible_garments = [] if settings["framing"] == "portrait" else [field for field in main_garments if settings["framing"] != "waist_up" or field != "lower_garment"]
    roles = {selected[field].get("wardrobe_role") for field in visible_garments} - {None}
    intimate = ("lingerie" if "lingerie" in roles else "underwear") if roles and catalog["allow_nsfw"] else ""
    if intimate:
        subject += f", wearing visible {intimate}"
    features = [phrase[key] for key in ("skin_tone", "body_shape", "muscle_tone") if phrase[key]]
    heritage = next(option["phrase"] for option in catalog["ethnicity"]["options"] if option["id"] == settings.get("ethnicity", "unspecified"))
    cropped = settings["framing"] in {"waist_up", "portrait"}
    portrait = settings["framing"] == "portrait"
    if cropped:
        phrase["pose"] = selected["pose"].get("cropped_phrase", phrase["pose"])
    if portrait:
        phrase["framing"] = "a tight head-and-shoulders close-up with the face filling most of the image"
        features = [phrase["skin_tone"]]
        phrase["pose"] = {
            "profile": "in side profile and looking ahead", "looking_back": "looking back over one shoulder",
            "reading": "looking down with a focused gaze", "hand_chin": "resting one hand beneath the chin",
        }.get(settings["pose"], "holding the head naturally above relaxed shoulders")
    hair = ""
    if settings["hair_style"] == "bald":
        hair = "The head is bald."
    elif phrase["hair_style"]:
        hair = f"The hair is {phrase['hair_color']}, {phrase['hair_style']}."
        modifiers = [phrase[key] for key in ("hair_finish", "hair_volume") if phrase[key]]
        if modifiers:
            hair += " The hair is " + ", ".join(modifiers) + "."
    garments = ["dress"] if settings["wardrobe_mode"] == "dress" else ["upper_garment", "lower_garment"]
    garments += ["outerwear", "shoes", "headwear", "gloves", "neckwear"]
    coverage = garment_coverage(settings, selected)
    if cropped:
        garments = [key for key in garments if key not in {"shoes", "lower_garment"}]
    elif settings["framing"] == "three_quarter":
        garments.remove("shoes")
        if settings["pose"] == "seated":
            phrase["pose"] = selected["pose"].get("cropped_phrase", phrase["pose"])
    for field in garments:
        refinements = settings.get("clothing", {}).get(field, {})
        if not phrase[field]:
            continue
        fabric = refinements.get("fabric", "default")
        if fabric != "default":
            material = selected[field].get("fabric")
            if material:
                phrase[field] = phrase[field].replace(material, catalog["clothing"]["fabric"][fabric]["phrase"], 1)
            else:
                phrase[field] += " made from " + catalog["clothing"]["fabric"][fabric]["phrase"]
        for kind, spec in catalog["clothing"]["modifiers"].items():
            value = refinements.get(kind, "default")
            if value == "default":
                continue
            if kind == "hem_length":
                phrase[field] = re.sub(r"\b(?:knee-length|ankle-length|floor-length|full-length|mid-thigh|midi|mini|long)\s+", "", phrase[field])
            elif kind == "sleeve_length":
                phrase[field] = re.sub(r"\b(?:long-sleeved|short-sleeved|sleeveless)\s+", "", phrase[field])
                phrase[field] = phrase[field].replace("with puffed sleeves", "with a gathered shoulder design")
            elif kind == "closure":
                phrase[field] = re.sub(r"\bopen-front\s+|\bopen\s+(?=(?:leather|wool|woven|knitted|cotton))", "", phrase[field])
                phrase[field] = phrase[field].replace(" worn open", "").replace("with a buttoned bodice", "").rstrip()
                phrase[field] = re.sub(r" with (?:an adjustable front-laced band|adjustable side lacing|front lacing)", "", phrase[field])
            elif kind == "fit":
                phrase[field] = re.sub(r"\b(?:fitted|loose|tailored|oversized)\s+", "", phrase[field])
            elif kind == "waist_rise":
                phrase[field] = re.sub(r"\b(?:high-waisted|bikini-cut)\s+", "", phrase[field])
            phrase[field] += ", " + spec["options"][value]["phrase"]
        if catalog["clothing"]["fabric"][fabric].get("transparency"):
            opacity = refinements.get("opacity", 100)
            phrase[field] = re.sub(r"\bopaque\s+", "", phrase[field])
            if opacity == 100:
                phrase[field] += ", fully opaque with no visibility through the material"
            elif opacity == 0:
                phrase[field] += ", clear and transparent with the body visible through the material"
            else:
                visibility = "mostly transparent" if opacity < 35 else "semi-transparent" if opacity < 70 else "slightly translucent"
                phrase[field] += f", {visibility} material at approximately {opacity}% opacity"
        texture = refinements.get("texture", "default")
        if texture != "default":
            phrase[field] += " with " + catalog["clothing"]["texture"][texture]["phrase"]
        details = [colored_phrase(catalog["clothing"]["details"][key]["phrase"], color_name(value, color_names))
                   for key, value in refinements.get("details", {}).items()
                   if key in selected[field].get("details", []) and not (portrait and key in {"belt", "pockets", "laces", "buckle"})]
        if details:
            phrase[field] += " featuring " + ", ".join(details)
        if cropped:
            phrase[field] = phrase[field].replace("full-length ", "").replace("floor-length ", "")
    if portrait:
        garments = [key for key in garments if key in {"headwear", "outerwear", "neckwear"} or "upper" in selected[key].get("covers", [])]
        worn = [("the visible neckline and shoulders of " if key not in {"headwear", "neckwear"} else "") + phrase[key] for key in garments if phrase[key]]
    else:
        worn = [phrase[key] for key in garments if phrase[key]]
    chest = " The torso is fully covered by opaque clothing." if "upper" in coverage and not portrait and not intimate else ""
    if settings["gender"] == "woman" and phrase["bust_size"] and not portrait:
        size = {"small": "small", "medium": "medium-sized", "full": "large"}.get(settings["bust_size"], "natural-sized")
        contour = {"small": "a subtle upper-body contour", "medium": "a moderately rounded upper-body contour", "full": "a prominent rounded upper-body contour"}.get(settings["bust_size"], "a natural upper-body contour")
        noun = "breasts" if catalog["allow_nsfw"] else "chest"
        chest = f" She has {size if noun == 'breasts' else 'a ' + size} {noun} and {contour}."
        if "upper" in coverage and not intimate:
            chest += " The clothing has opaque fabric fully covering the chest and follows this shape."
    missing = []
    if settings["wardrobe_mode"] == "separates":
        if settings["upper_garment"] == "none":
            missing.append("The torso is uncovered.")
        if settings["lower_garment"] == "none" and not cropped:
            missing.append("The lower body is uncovered.")
    elif settings["dress"] == "none":
        missing.append("The torso and lower body are uncovered.")
    face = " ".join(phrase[key].rstrip(".") + "." for key, spec in catalog["extra_fields"].items()
                    if spec["group"] == "Face & accessories" and phrase[key])
    fragments = {
        "opening": f"The image is {'an' if phrase['art_style'][:1].lower() in 'aeiou' else 'a'} {phrase['art_style']} of {subject}, using {phrase['framing']}, {phrase['background']}.",
        "scene": f"Behind the subject, {phrase['scene_detail']}",
        "pose": f"At the centre of the frame, the subject is {phrase['pose']}.",
        "appearance": ("The subject has " + ", ".join(features) + "." if features else "") + (f" The subject is {heritage}." if heritage else ""),
        "hair": hair,
        "expression": f"The face has {phrase['expression']}." + (" " + face if face else ""),
        "wardrobe": ((f"The visible clothing includes {intimate}: " if intimate else "The subject wears ") + ", ".join(worn) + ". " if worn else "") + chest + " ".join(missing),
        "lighting": f"The lighting is {phrase['lighting']}.",
        "composition": f"The overall composition uses {phrase['framing']}, {phrase['composition']}." + (" The crop ends at the waist; the legs and feet remain outside the image." if settings["framing"] == "waist_up" else " The bottom edge cuts across the shoulders; the chest, torso and waist remain outside the image." if portrait else ""),
    }
    framing = {"waist_up": "waist-up view, head to waist visible", "portrait": "head-and-shoulders portrait",
               "full_body": "full-body view, head and feet in frame", "three_quarter": "three-quarter body view"}.get(settings["framing"], phrase["framing"])
    compact_face = []
    for key, spec in catalog["extra_fields"].items():
        if spec["group"] != "Face & accessories" or not phrase[key]:
            continue
        value = phrase[key].rstrip('.')
        if key == "eye_color" and value.startswith("The irises are "):
            value = value.replace("The irises are ", "") + " eyes"
        elif key == "eyebrows" and value.startswith("The eyebrows are "):
            value = value.replace("The eyebrows are ", "") + " eyebrows"
        elif key == "makeup":
            value = "makeup: " + re.sub(r"^The makeup (?:has|is) ", "", value)
        elif key == "eye_shape" and value.startswith("The eyes have "):
            value = "eyes with " + value.replace("The eyes have ", "")
        else:
            value = re.sub(r"^The (?:lips wear|makeup has|makeup is|eyes have|ears wear|face has) ", "", value)
        compact_face.append(value)
    compact = {
        "opening": f"{phrase['art_style']}, {subject}, {framing}",
        "scene": f"{phrase['background']}, {phrase['scene_detail']}",
        "pose": phrase["pose"],
        "appearance": ", ".join(features + ([heritage] if heritage else [])),
        "hair": ", ".join([phrase['hair_color'] + ' hair', phrase['hair_style']] + [phrase[key] for key in ('hair_finish', 'hair_volume') if phrase[key]]) if settings['hair_style'] != 'bald' else 'bald head',
        "expression": ", ".join(filter(None, [phrase['expression'], *compact_face])),
        "wardrobe": ", ".join(filter(None, [(f"visible {intimate}: " if intimate else "wearing ") + ", ".join(worn) if worn else "", chest.strip(), *missing])),
        "lighting": phrase['lighting'],
        "composition": phrase['composition'],
    }
    return fragments, compact


def qwen_image_2_1(settings, selected, template, catalog):
    fragments, _ = character_fragments(settings, selected, catalog)
    return " ".join(template["format"].format_map(fragments).split())


def stable_diffusion(settings, selected, template, catalog):
    _, fragments = character_fragments(settings, selected, catalog)
    fragments = {key: value.rstrip('. ') + ',' if value else '' for key, value in fragments.items()}
    return " ".join(template["format"].format_map(fragments).split()).strip(', ')


RENDERERS = {"qwen_image_2_1": qwen_image_2_1, "sdxl": stable_diffusion, "sd": stable_diffusion}


def render_negative_prompt(settings, catalog):
    resolve_character(settings, catalog)
    if settings["model"] == "qwen_image_2_1":
        return ""
    terms = ["watermark", "signature", "duplicate person", "extra limbs", "malformed hands"]
    if settings["model"] == "sd":
        terms += ["extra fingers", "fused fingers", "distorted face", "low resolution"]
    if settings["art_style"] == "photo":
        terms += ["cartoon", "illustration"]
    elif settings["art_style"] in {"anime", "watercolor", "oil", "comic", "ink", "gouache", "pencil", "pixel", "fashion"}:
        terms += ["photograph", "photorealistic"]
    if settings["framing"] in {"waist_up", "portrait"}:
        terms.append("full body")
    if not catalog["allow_nsfw"]:
        terms += ["exposed breasts", "exposed genitals"]
    return ", ".join(terms)
