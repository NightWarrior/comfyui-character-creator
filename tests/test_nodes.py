import importlib
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
COMFY_ROOT = ROOT.parents[1]
sys.path.insert(0, str(COMFY_ROOT))
package = types.ModuleType("character_creator_test_package")
package.__path__ = [str(ROOT)]
sys.modules[package.__name__] = package
comfy_nodes = types.ModuleType("nodes")
comfy_nodes.ControlNetApplyAdvanced = Mock()
original_nodes = sys.modules.get("nodes")
sys.modules["nodes"] = comfy_nodes
try:
    addon_nodes = importlib.import_module(package.__name__ + ".nodes")
finally:
    if original_nodes is None:
        sys.modules.pop("nodes", None)
    else:
        sys.modules["nodes"] = original_nodes
core = importlib.import_module(package.__name__ + ".core")
from comfy_api.latest._io import build_nested_inputs, get_finalized_class_inputs


class NodeTests(unittest.TestCase):
    def setUp(self):
        self.settings = core.defaults(core.load_catalog())
        comfy_nodes.ControlNetApplyAdvanced.reset_mock()

    def test_all_node_schemas_validate_against_installed_comfy_api(self):
        for node in (addon_nodes.CharacterCreator, addon_nodes.CharacterControlNetEntry, addon_nodes.ApplyCharacterControlNets, addon_nodes.CharacterQwenControlEntry, addon_nodes.ApplyCharacterModelControls):
            schema = node.define_schema()
            schema.finalize()
            schema.validate()
            json_info = schema.get_v1_info(node)
            self.assertEqual(json_info.name, schema.node_id)

    def test_new_node_defaults_use_the_red_qipao_character_in_every_widget(self):
        schema = addon_nodes.CharacterCreator.define_schema()
        schema.finalize()
        info = schema.get_v1_info(addon_nodes.CharacterCreator)
        initial = core.starter_characters(core.load_catalog())[0]["settings"]
        inputs = {**info.input["required"], **info.input["optional"]}
        for key, value in initial.items():
            with self.subTest(widget=key):
                actual = inputs[key][1]["default"]
                self.assertEqual(json.loads(actual) if key in {"colors", "clothing"} else actual, value)

    def test_controlnet_dynamic_schema_has_disabled_and_zero_entry_paths(self):
        schema = addon_nodes.CharacterCreator.define_schema()
        controls = next(item for item in schema.inputs if item.id == "controlnets")
        self.assertEqual(controls.options[0].key, "disabled")
        self.assertEqual(controls.options[0].inputs, [])
        entries = controls.options[1].inputs[0]
        self.assertEqual(entries.template.min, 0)
        self.assertEqual(entries.template.input.io_type, "CHARACTER_CONTROL_ENTRY")

    def test_creator_disables_stack_and_preserves_prompt_output(self):
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "disabled"})
        self.assertEqual(result[0], core.render_prompt(self.settings, core.load_catalog()))
        self.assertEqual(core.decode_character(result[1]), self.settings)
        self.assertEqual(result[2], [])

    def test_workflow_widgets_reconstruct_executable_inputs_in_comfy_schema_order(self):
        schema = addon_nodes.CharacterCreator.define_schema()
        schema.finalize()
        info = schema.get_v1_info(addon_nodes.CharacterCreator)
        names = info.input_order["required"] + info.input_order["optional"]
        paths = [ROOT / "examples" / "Qwen Image 2.1 - Character Creator.json",
                 COMFY_ROOT / "user" / "default" / "workflows" / "qwen 2.1" / "Qwen Image 2.1 - Character Creator.json"]
        for path in paths:
            with self.subTest(path=path):
                workflow = json.loads(path.read_text(encoding="utf-8"))
                creator = next(node for node in workflow["nodes"] if node["type"] == "CharacterCreator")
                self.assertEqual(len(creator["widgets_values"]), len(names))
                flat = dict(zip(names, creator["widgets_values"]))
                self.assertEqual(flat["controlnets"], "disabled")
                self.assertEqual(flat["character_code"], "")
                self.assertEqual(flat, creator["widgets_values_named"])
                _, _, v3_data = get_finalized_class_inputs(info.input, flat)
                inputs = build_nested_inputs(flat, v3_data)
                self.assertEqual(inputs["controlnets"], {"controlnets": "disabled"})
                result = addon_nodes.CharacterCreator.execute(**inputs)
                self.assertEqual(result[2], [])
                self.assertEqual(core.decode_character(result[1]), core.starter_characters(core.load_catalog())[0]["settings"])

    def test_qwen_control_workflow_growing_socket_reconstructs_a_real_entry(self):
        schema = addon_nodes.CharacterCreator.define_schema()
        schema.finalize()
        info = schema.get_v1_info(addon_nodes.CharacterCreator)
        paths = [ROOT / 'examples' / 'Qwen Image 2.1 - Character Creator ControlNet Test.json',
            COMFY_ROOT / 'user/default/workflows/qwen 2.1/Qwen Image 2.1 - Character Creator ControlNet Test.json']
        entry = addon_nodes.CharacterQwenControlEntry.execute('patch', 'hint', 'vae', 1, 0, 1)[0]
        for path in paths:
            workflow = json.loads(path.read_text(encoding='utf-8'))
            creator = next(node for node in workflow['nodes'] if node['type'] == 'CharacterCreator')
            names = info.input_order['required'] + info.input_order['optional']
            self.assertEqual(dict(zip(names, creator['widgets_values'])), creator['widgets_values_named'])
            socket = next(sock for sock in creator['inputs'] if sock['link'] is not None)
            flat = {**creator['widgets_values_named'], socket['name']: entry}
            finalized, _, data = get_finalized_class_inputs(info.input, flat)
            self.assertIn(socket['name'], finalized['optional'])
            inputs = build_nested_inputs(flat, data)
            self.assertEqual(inputs['controlnets']['entries']['entry_0'], entry)
            result = addon_nodes.CharacterCreator.execute(**inputs)
            self.assertEqual(result[2], [entry])
            self.assertIn('tousled', result[0])
            self.assertIn('bright red silk qipao', result[0])

    def test_numeric_age_is_clamped_in_prompt_and_export(self):
        for age, expected in ((12, 18), (67, 67), (120, 100)):
            result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "disabled"}, age=age)
            self.assertIn(f"aged {expected} years", result[0])
            self.assertEqual(core.decode_character(result[1])["age"], expected)

    def test_stack_uses_numeric_slot_order_without_mutating_entries(self):
        entries = {"entry_10": {"id": 10}, "entry_2": {"id": 2}, "entry_0": {"id": 0}}
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "enabled", "entries": entries})
        self.assertEqual([entry["id"] for entry in result[2]], [0, 2, 10])
        self.assertEqual(list(entries), ["entry_10", "entry_2", "entry_0"])

    def test_enabled_empty_stack_is_valid(self):
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "enabled", "entries": {}})
        self.assertEqual(result[2], [])

    def test_negative_output_is_appended_and_uses_the_authoritative_character_code(self):
        schema = addon_nodes.CharacterCreator.define_schema()
        self.assertEqual([output.display_name for output in schema.outputs], ['prompt', 'character_code', 'controlnet_stack', 'negative_prompt'])
        imported = {**self.settings, 'model': 'sdxl', 'art_style': 'comic'}
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={'controlnets': 'disabled'},
            character_code=core.encode_character(imported))
        self.assertEqual(result[2], [])
        self.assertEqual(result[3], core.render_negative_prompt(imported, core.load_catalog()))
        self.assertIn('photorealistic', result[3])
        qwen = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={'controlnets': 'disabled'})
        self.assertEqual(qwen[3], '')

    def test_color_widget_changes_prompt_and_export_but_import_remains_authoritative(self):
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "disabled"},
                                                     colors='{"upper_garment":"#ff0000"}')
        self.assertIn("bright red cotton T-shirt", result[0])
        self.assertEqual(core.decode_character(result[1])["colors"], {"upper_garment": "#ff0000"})
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "disabled"},
                                                     character_code=core.encode_character(self.settings), colors='{"upper_garment":"#ff0000"}')
        self.assertNotIn("bright red", result[0])

    def test_clothing_widget_round_trips_and_code_override_remains_authoritative(self):
        clothing = {'upper_garment': {'fabric': 'velvet', 'texture': 'ribbed', 'details': {'piping': '#ff0000'}}}
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={'controlnets': 'disabled'}, clothing=json.dumps(clothing))
        self.assertEqual(core.decode_character(result[1])['clothing'], clothing)
        self.assertIn('velvet', result[0])
        imported = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={'controlnets': 'disabled'},
            clothing=json.dumps(clothing), character_code=core.encode_character(self.settings))
        self.assertNotIn('velvet', imported[0])
        self.assertNotIn('clothing', core.decode_character(imported[1]))

    def test_optional_ethnicity_round_trip_and_authoritative_import(self):
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={'controlnets': 'disabled'}, ethnicity='pakistani')
        self.assertIn('The subject is Pakistani.', result[0])
        self.assertEqual(core.decode_character(result[1])['ethnicity'], 'pakistani')
        imported = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={'controlnets': 'disabled'},
            ethnicity='pakistani', character_code=core.encode_character(self.settings))
        self.assertNotIn('heritage', imported[0])
        self.assertEqual(core.decode_character(imported[1]), self.settings)

    def test_import_is_authoritative_and_still_checks_local_policy(self):
        imported = {**self.settings, "hair_style": "bob"}
        result = addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "disabled"}, character_code=core.encode_character(imported))
        self.assertIn("chin-length bob", result[0])
        with self.assertRaisesRegex(ValueError, "uncovered"):
            addon_nodes.CharacterCreator.execute(**self.settings, controlnets={"controlnets": "disabled"},
                                                 character_code=core.encode_character({**imported, "upper_garment": "none"}))

    def test_qwen_model_patch_entries_delegate_to_native_node_in_stack_order(self):
        native = Mock()
        native.diffsynth_controlnet.side_effect = [('patched_once',), ('patched_twice',)]
        factory = Mock(return_value=native)
        comfy_nodes.NODE_CLASS_MAPPINGS = {'QwenImageDiffsynthControlnet': factory}
        first = addon_nodes.CharacterQwenControlEntry.execute('patch1', 'hint1', 'vae', 0.8, 0.0, 0.7)[0]
        second = addon_nodes.CharacterQwenControlEntry.execute('patch2', 'hint2', 'vae', 0.5, 0.2, 1.0)[0]
        classic = addon_nodes.CharacterControlNetEntry.execute('classic', 'hint3', 1, 0, 1)[0]
        self.assertEqual(addon_nodes.ApplyCharacterModelControls.execute('base', [first, classic, second])[0], 'patched_twice')
        self.assertEqual(native.diffsynth_controlnet.call_count, 2)
        self.assertEqual(native.diffsynth_controlnet.call_args_list[0].kwargs,
            dict(model='base', model_patch='patch1', image='hint1', vae='vae', strength=0.8, start_percent=0.0, end_percent=0.7))
        self.assertEqual(native.diffsynth_controlnet.call_args_list[1].kwargs['model'], 'patched_once')
        self.assertEqual(addon_nodes.ApplyCharacterModelControls.execute('base', [classic])[0], 'base')
        apply = comfy_nodes.ControlNetApplyAdvanced.return_value
        apply.apply_controlnet.side_effect = None
        apply.apply_controlnet.return_value = ('positive2', 'negative2')
        self.assertEqual(tuple(addon_nodes.ApplyCharacterControlNets.execute('p', 'n', [first, classic])), ('positive2', 'negative2'))
        self.assertEqual(apply.apply_controlnet.call_count, 1)
        self.assertEqual(first['kind'], 'model_patch')

    def test_new_optional_character_choices_are_executable_and_shared(self):
        settings = dict(hair_finish='messy', hair_volume='voluminous', eye_color='blue', eye_shape='almond',
            lip_makeup='matte', makeup='natural', earrings='hoops', necklace='pendant', piercings='septum',
            moles='left_cheek', freckles='light', eyewear='round', gloves='leather')
        result = addon_nodes.CharacterCreator.execute(**self.settings, **settings, controlnets={'controlnets': 'disabled'})
        decoded = core.decode_character(result[1])
        self.assertTrue(all(decoded[key] == value for key, value in settings.items()))
        defaults = {key: field['default'] for key, field in core.load_catalog()['extra_fields'].items()}
        result = addon_nodes.CharacterCreator.execute(**self.settings, **defaults, controlnets={'controlnets': 'disabled'})
        self.assertEqual(core.decode_character(result[1]), self.settings)

    def test_entry_retains_model_hint_and_parameters(self):
        model, image, vae = object(), object(), object()
        entry = addon_nodes.CharacterControlNetEntry.execute(model, image, 0.7, 0.1, 0.8, vae)[0]
        self.assertIs(entry["control_net"], model)
        self.assertIs(entry["image"], image)
        self.assertIs(entry["vae"], vae)
        self.assertEqual(entry["strength"], 0.7)

    def test_apply_delegates_in_order_and_preserves_both_conditioning_branches(self):
        apply = comfy_nodes.ControlNetApplyAdvanced.return_value.apply_controlnet
        apply.reset_mock()
        apply.side_effect = [("p1", "n1"), ("p2", "n2")]
        first = {"control_net": "pose", "image": "pose_hint", "strength": 0.6, "start_percent": 0.0, "end_percent": 0.5, "vae": None}
        second = {**first, "control_net": "depth", "image": "depth_hint", "strength": 0.3}
        result = addon_nodes.ApplyCharacterControlNets.execute("p0", "n0", [first, second])
        self.assertEqual(result.result, ("p2", "n2"))
        self.assertEqual(apply.call_args_list[0].args, ("p0", "n0"))
        self.assertEqual(apply.call_args_list[0].kwargs, first)
        self.assertEqual(apply.call_args_list[1].args, ("p1", "n1"))
        self.assertEqual(apply.call_args_list[1].kwargs, second)

    def test_empty_stack_leaves_conditioning_unchanged(self):
        positive, negative = object(), object()
        result = addon_nodes.ApplyCharacterControlNets.execute(positive, negative, [])
        self.assertIs(result[0], positive)
        self.assertIs(result[1], negative)


def complete(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    else:
        raise AssertionError("Mock route unexpectedly waited for external I/O.")
    finally:
        coroutine.close()


class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        routes = types.SimpleNamespace(get=lambda path: lambda func: func, post=lambda path: lambda func: func)
        server_stub = types.ModuleType("server")
        server_stub.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes))
        original_server = sys.modules.get("server")
        original_nodes = sys.modules.get("nodes")
        sys.modules["server"] = server_stub
        sys.modules["nodes"] = comfy_nodes
        name = "character_creator_routes_test"
        spec = importlib.util.spec_from_file_location(name, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
        cls.addon = importlib.util.module_from_spec(spec)
        sys.modules[name] = cls.addon
        try:
            spec.loader.exec_module(cls.addon)
        finally:
            for key, original in (("server", original_server), ("nodes", original_nodes)):
                if original is None:
                    sys.modules.pop(key, None)
                else:
                    sys.modules[key] = original

    def request(self, payload, raw=False):
        body = payload if raw else json.dumps(payload).encode("utf-8")

        class Content:
            async def iter_chunked(self, size):
                for start in range(0, len(body), 17):
                    yield body[start:start + 17]

        return types.SimpleNamespace(content=Content())

    def test_catalog_and_extension_registration(self):
        response = complete(self.addon.character_creator_catalog(None))
        self.assertEqual(response.status, 200)
        self.assertFalse(json.loads(response.text)["allow_nsfw"])
        extension = complete(self.addon.comfy_entrypoint())
        self.assertEqual(len(complete(extension.get_node_list())), 5)

    def test_chunked_request_resolves_prompt_and_share_string(self):
        settings = core.defaults(core.load_catalog())
        response = complete(self.addon.character_creator_resolve(self.request({"settings": settings})))
        self.assertEqual(response.status, 200)
        data = json.loads(response.text)
        self.assertEqual(data["settings"], settings)
        self.assertEqual(core.decode_character(data["code"]), settings)
        imported = complete(self.addon.character_creator_resolve(self.request({"code": data["code"]})))
        self.assertEqual(json.loads(imported.text)["prompt"], data["prompt"])

    def test_resolve_cannot_bypass_wardrobe_gate(self):
        settings = {**core.defaults(core.load_catalog()), "upper_garment": "none"}
        response = complete(self.addon.character_creator_resolve(self.request({"code": core.encode_character(settings)})))
        self.assertEqual(response.status, 400)
        self.assertIn("uncovered", json.loads(response.text)["error"])

    def test_resolve_returns_same_color_name_used_in_prompt(self):
        settings = {**core.defaults(core.load_catalog()), "colors": {"upper_garment": "#ff0000"}}
        response = complete(self.addon.character_creator_resolve(self.request({"settings": settings})))
        data = json.loads(response.text)
        self.assertEqual(data["color_labels"]["upper_garment"], "bright red")
        self.assertIn("bright red cotton T-shirt", data["prompt"])

    def test_malformed_and_oversized_requests_fail(self):
        for payload in (b"invalid", b"[]", b'{"settings":{},"code":"CC1.abc"}', b"x" * 65537,
                        b'{"code":{}}', b'{"settings":null}', b'\xff',
                        b'{"settings":' + b'[' * 1200 + b'0' + b']' * 1200 + b'}'):
            with self.subTest(payload=payload[:40]):
                response = complete(self.addon.character_creator_resolve(self.request(payload, raw=True)))
                self.assertEqual(response.status, 400)


if __name__ == "__main__":
    unittest.main()
