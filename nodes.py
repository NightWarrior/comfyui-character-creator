import json

import nodes as comfy_nodes
from comfy_api.latest import io

from .core import ADAPTERS, clamp_age, config_fingerprint, decode_character, defaults, encode_character, load_catalog, render_negative_prompt, render_prompt, starter_characters

ControlEntry = io.Custom("CHARACTER_CONTROL_ENTRY")
ControlStack = io.Custom("CHARACTER_CONTROL_STACK")


class CharacterCreator(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        catalog = load_catalog()
        initial = starter_characters(catalog)[0]["settings"]
        inputs = [
            io.Combo.Input("model", options=list(ADAPTERS), default="qwen_image_2_1", advanced=True),
            io.Combo.Input("template", options=[key for key, value in catalog["templates"].items()
                           if catalog["allow_nsfw"] or not value.get("nsfw", False)], default=initial["template"], advanced=True),
        ]
        for name, field in catalog["fields"].items():
            options = [option["id"] for option in field["options"]
                       if catalog["allow_nsfw"] or not option.get("nsfw", False)]
            inputs.append(io.Combo.Input(name, options=options, default=initial[name],
                                         display_name=field["label"], advanced=True))
        inputs += [
            io.DynamicCombo.Input("controlnets", options=[
                io.DynamicCombo.Option("disabled", []),
                io.DynamicCombo.Option("enabled", [
                    io.Autogrow.Input("entries", template=io.Autogrow.TemplatePrefix(
                        ControlEntry.Input("entry"), prefix="entry_", min=0, max=100,
                    ), tooltip="Connect ControlNet Entry nodes in application order. A new socket appears as entries are connected."),
                ]),
            ]),
            io.String.Input("character_code", default="", multiline=True, optional=True, advanced=True,
                            tooltip="A nonempty CC1 code replaces all character settings for this execution."),
            io.String.Input("colors", default=json.dumps(initial["colors"]), optional=True, advanced=True,
                            tooltip="Optional JSON mapping of colorable fields to hex colors; managed by the visual color pickers."),
            io.Int.Input("age", default=initial["age"], min=18, max=100, optional=True, advanced=True),
            io.String.Input("clothing", default=json.dumps(initial["clothing"]), optional=True, advanced=True,
                            tooltip="Garment fabric, texture and colored details; managed by the visual editor."),
            io.Combo.Input("ethnicity", options=[option["id"] for option in catalog["ethnicity"]["options"]],
                           default="unspecified", optional=True, advanced=True, display_name="Ethnicity / heritage"),
        ]
        for name, field in catalog["extra_fields"].items():
            inputs.append(io.Combo.Input(name, options=[option["id"] for option in field["options"]
                                                       if catalog["allow_nsfw"] or not option.get("nsfw", False)],
                                         default=initial.get(name, field["default"]), optional=True, advanced=True, display_name=field["label"]))
        return io.Schema(
            node_id="CharacterCreator", display_name="Character Creator",
            category="Character Creator", inputs=inputs,
            outputs=[io.String.Output(display_name="prompt"), io.String.Output(display_name="character_code"),
                     ControlStack.Output(display_name="controlnet_stack"), io.String.Output(display_name="negative_prompt")],
            description="Build an adult character prompt and an ordered control stack. Qwen 2.1 Fun Union uses Apply Character Model Controls; classic CONTROL_NET entries use Apply Character ControlNets.",
        )

    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return config_fingerprint()

    @classmethod
    def execute(cls, model, template, controlnets, character_code="", colors="{}", age=None, clothing="{}", ethnicity="unspecified", **options):
        catalog = load_catalog()
        settings = decode_character(character_code) if character_code.strip() else {
            **defaults(catalog), **{key: value for key, value in options.items()
                                   if key not in catalog["extra_fields"] or value != catalog["extra_fields"][key]["default"]},
            "model": model, "template": template,
        }
        if not character_code.strip():
            if ethnicity != "unspecified":
                settings["ethnicity"] = ethnicity
            if age is not None:
                settings["age"] = clamp_age(age)
            color_values = json.loads(colors)
            if color_values != {}:
                settings["colors"] = color_values
            clothing_values = json.loads(clothing)
            if clothing_values != {}:
                settings["clothing"] = clothing_values
        prompt = render_prompt(settings, catalog)
        stack = []
        if controlnets["controlnets"] == "enabled":
            entries = controlnets.get("entries", {})
            stack = [entries[key] for key in sorted(entries, key=lambda key: int(key.rsplit("_", 1)[1]))
                     if entries[key] is not None]
        return io.NodeOutput(prompt, encode_character(settings), stack, render_negative_prompt(settings, catalog))


class CharacterControlNetEntry(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="CharacterControlNetEntry", display_name="Character ControlNet Entry", category="Character Creator",
            inputs=[io.ControlNet.Input("control_net"), io.Image.Input("image"),
                    io.Float.Input("strength", default=1.0, min=0.0, max=10.0, step=0.01),
                    io.Float.Input("start_percent", default=0.0, min=0.0, max=1.0, step=0.01),
                    io.Float.Input("end_percent", default=1.0, min=0.0, max=1.0, step=0.01),
                    io.Vae.Input("vae", optional=True)],
            outputs=[ControlEntry.Output(display_name="entry")],
            description="Pair a loaded compatible ControlNet with its preprocessed hint and application settings.",
        )

    @classmethod
    def execute(cls, control_net, image, strength, start_percent, end_percent, vae=None):
        return io.NodeOutput({"control_net": control_net, "image": image, "strength": strength,
                              "start_percent": start_percent, "end_percent": end_percent, "vae": vae})


class ApplyCharacterControlNets(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ApplyCharacterControlNets", display_name="Apply Character ControlNets", category="Character Creator",
            inputs=[io.Conditioning.Input("positive"), io.Conditioning.Input("negative"), ControlStack.Input("stack")],
            outputs=[io.Conditioning.Output(display_name="positive"), io.Conditioning.Output(display_name="negative")],
            description="Apply the creator's ControlNet entries in socket order using ComfyUI's existing Apply ControlNet implementation.",
        )

    @classmethod
    def execute(cls, positive, negative, stack):
        apply = comfy_nodes.ControlNetApplyAdvanced()
        for entry in stack:
            if entry.get("kind") == "model_patch":
                continue
            positive, negative = apply.apply_controlnet(positive, negative, **entry)
        return io.NodeOutput(positive, negative)


class CharacterQwenControlEntry(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="CharacterQwenControlEntry", display_name="Character Qwen 2.1 Control Entry", category="Character Creator",
            inputs=[io.ModelPatch.Input("model_patch"), io.Image.Input("image"), io.Vae.Input("vae"),
                    io.Float.Input("strength", default=1.0, min=0.0, max=10.0, step=0.01),
                    io.Float.Input("start_percent", default=0.0, min=0.0, max=1.0, step=0.01),
                    io.Float.Input("end_percent", default=1.0, min=0.0, max=1.0, step=0.01)],
            outputs=[ControlEntry.Output(display_name="entry")],
            description="Pair a Qwen Image 2.1 Fun Union model patch with a prepared control map and Qwen VAE.",
        )

    @classmethod
    def execute(cls, model_patch, image, vae, strength, start_percent, end_percent):
        return io.NodeOutput({"kind": "model_patch", "model_patch": model_patch, "image": image, "vae": vae,
                              "strength": strength, "start_percent": start_percent, "end_percent": end_percent})


class ApplyCharacterModelControls(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ApplyCharacterModelControls", display_name="Apply Character Model Controls", category="Character Creator",
            inputs=[io.Model.Input("model"), ControlStack.Input("stack")], outputs=[io.Model.Output()],
            description="Apply model-patch entries in stack order through ComfyUI's native Qwen/Fun ControlNet node. Conditioning entries use Apply Character ControlNets.",
        )

    @classmethod
    def execute(cls, model, stack):
        apply = comfy_nodes.NODE_CLASS_MAPPINGS["QwenImageDiffsynthControlnet"]()
        for entry in stack:
            if entry.get("kind") == "model_patch":
                model = apply.diffsynth_controlnet(model=model, **{key: value for key, value in entry.items() if key != "kind"})[0]
        return io.NodeOutput(model)
