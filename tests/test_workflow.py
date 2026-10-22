import ast
import importlib.util
import hashlib
import json
import struct
import unittest
from graphlib import TopologicalSorter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("workflow_character_core", ROOT / "core.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = json.loads((ROOT / "examples" / "Qwen Image 2.1 - Character Creator.json").read_text(encoding="utf-8"))
        cls.nodes = {node["id"]: node for node in cls.workflow["nodes"]}

    def test_links_are_reciprocal_and_have_matching_socket_types(self):
        self.assertEqual(len(self.nodes), len(self.workflow["nodes"]))
        self.assertEqual(len({link[0] for link in self.workflow["links"]}), len(self.workflow["links"]))
        for link_id, source, source_slot, target, target_slot, socket_type in self.workflow["links"]:
            output = self.nodes[source]["outputs"][source_slot]
            input = self.nodes[target]["inputs"][target_slot]
            self.assertIn(link_id, output["links"])
            self.assertEqual(input["link"], link_id)
            self.assertEqual(output["type"], socket_type)
            self.assertEqual(input["type"], socket_type)

    def test_graph_is_acyclic_and_save_receives_decoded_sampler_output(self):
        graph = {node_id: set() for node_id in self.nodes}
        for _, source, _, target, _, _ in self.workflow["links"]:
            graph[target].add(source)
        self.assertEqual(len(list(TopologicalSorter(graph).static_order())), len(self.nodes))
        save = next(node for node in self.nodes.values() if node["type"] == "SaveImage")
        source = next(link[1] for link in self.workflow["links"] if link[0] == save["inputs"][0]["link"])
        self.assertEqual(self.nodes[source]["type"], "VAEDecode")
        ancestors = set()
        def visit(node_id):
            for dependency in graph[node_id]:
                if dependency not in ancestors:
                    ancestors.add(dependency)
                    visit(dependency)
        visit(save["id"])
        types = {self.nodes[node_id]["type"] for node_id in ancestors}
        self.assertTrue({"CharacterCreator", "TextEncodeQwenImage21", "ApplyCharacterControlNets", "KSampler", "UNETLoader", "CLIPLoader", "VAELoader"}.issubset(types))

    def test_creator_widgets_use_current_catalog_order_and_safe_settings(self):
        creator = next(node for node in self.nodes.values() if node["type"] == "CharacterCreator")
        defaults = core.defaults(core.load_catalog())
        initial = core.starter_characters(core.load_catalog())[0]["settings"]
        values = creator["widgets_values"]
        self.assertEqual(values, [initial[key] for key in defaults] + ["disabled", "", json.dumps(initial["colors"]), initial["age"], json.dumps(initial["clothing"]), "unspecified"] + [initial.get(name, field["default"]) for name, field in core.load_catalog()["extra_fields"].items()])
        self.assertIn("The image is", core.render_prompt(dict(zip(defaults, values)), core.load_catalog()))

    def test_model_loaders_and_sampler_use_local_qwen_configuration(self):
        by_type = {node["type"]: node for node in self.nodes.values()}
        self.assertEqual(by_type["UNETLoader"]["widgets_values"], ["qwen_image_2.1_int8_convrot.safetensors", "default"])
        self.assertEqual(by_type["CLIPLoader"]["widgets_values"], ["qwen3vl_8b_int8_convrot.safetensors", "qwen_image", "default"])
        self.assertEqual(by_type["VAELoader"]["widgets_values"], ["qwen_image_2.1_vae_bf16.safetensors"])
        self.assertEqual(by_type["KSampler"]["widgets_values"][2:], [25, 1, "euler", "simple", 1])
        self.assertEqual(by_type["EmptyLatentImage"]["widgets_values"], [1024, 1024, 1])

    def test_no_extra_custom_node_dependencies_or_dangling_links(self):
        allowed = {"CharacterCreator", "ApplyCharacterControlNets", "UNETLoader", "CLIPLoader", "VAELoader",
                   "TextEncodeQwenImage21", "QwenImage21Cache", "EmptyLatentImage", "KSampler", "VAEDecode", "SaveImage", "Note"}
        self.assertEqual({node["type"] for node in self.nodes.values()}, allowed)
        link_ids = {link[0] for link in self.workflow["links"]}
        for node in self.nodes.values():
            for input in node["inputs"]:
                if input["link"] is not None:
                    self.assertIn(input["link"], link_ids)
            for output in node["outputs"]:
                self.assertTrue(set(output["links"] or []).issubset(link_ids))


class ControlWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = json.loads((ROOT / "examples/Qwen Image 2.1 - Character Creator ControlNet Test.json").read_text(encoding="utf-8"))
        cls.nodes = {node["id"]: node for node in cls.workflow["nodes"]}

    def test_control_graph_links_and_dependency_order(self):
        WorkflowTests.test_links_are_reciprocal_and_have_matching_socket_types(self)
        WorkflowTests.test_graph_is_acyclic_and_save_receives_decoded_sampler_output(self)
        by_type = {node["type"]: node for node in self.nodes.values()}
        self.assertEqual(by_type["CharacterCreator"]["widgets_values_named"]["controlnets"], "enabled")
        patch = by_type["ApplyCharacterModelControls"]
        sampler = by_type["KSampler"]
        self.assertTrue(any(link[1] == patch["id"] and link[3] == sampler["id"] and link[5] == "MODEL" for link in self.workflow["links"]))
        entry = by_type["CharacterQwenControlEntry"]
        self.assertEqual(entry["widgets_values"], [1.0, 0.0, 1.0])
        self.assertTrue(all(sock["link"] is not None for sock in entry["inputs"]))
        self.assertEqual(by_type["EmptyLatentImage"]["widgets_values"], [1024, 1024, 1])
        self.assertEqual(by_type["KSampler"]["widgets_values"][2:], [40, 1, "euler", "simple", 1])

    def test_models_and_hint_are_installed_in_their_loader_directories(self):
        comfy_root = ROOT.parents[1]
        by_type = {node["type"]: node for node in self.nodes.values()}
        for kind, folder in (("UNETLoader", "diffusion_models"), ("CLIPLoader", "text_encoders"), ("VAELoader", "vae"), ("ModelPatchLoader", "model_patches")):
            path = comfy_root / "models" / folder / by_type[kind]["widgets_values"][0]
            self.assertTrue(path.is_file(), str(path))
        assets = json.loads((ROOT / "examples/controlnet-assets.json").read_text(encoding="utf-8"))
        model = comfy_root / assets["model"]["path"]
        self.assertEqual(model.stat().st_size, assets["model"]["size"])
        with model.open("rb") as stream:
            header = json.loads(stream.read(struct.unpack("<Q", stream.read(8))[0]))
        self.assertEqual(header["control_img_in.weight"]["shape"], [4096, 129])
        self.assertIn("control_blocks.15.img_mlp.out.weight", header)
        image = comfy_root / "input" / by_type["LoadImage"]["widgets_values"][0]
        self.assertEqual(image, comfy_root / assets["source_image"]["path"])
        self.assertEqual(hashlib.sha256(image.read_bytes()).hexdigest(), assets["source_image"]["sha256"])

    def test_all_union_guide_examples_are_available_and_match_manifest(self):
        assets = json.loads((ROOT / "examples/controlnet-assets.json").read_text(encoding="utf-8"))
        self.assertEqual(set(assets["control_examples"]), {"canny", "depth", "grayscale", "hed", "lineart", "mlsd", "pose", "scribble"})
        for kind, asset in assets["control_examples"].items():
            with self.subTest(kind=kind):
                image = ROOT.parents[1] / asset["path"]
                data = image.read_bytes()
                self.assertTrue(data.startswith(b"\x89PNG\r\n\x1a\n"))
                self.assertEqual(hashlib.sha256(data).hexdigest(), asset["sha256"])
                self.assertEqual(data, (ROOT / "examples" / image.name).read_bytes())

    def test_preview_receives_same_guide_as_control_entry_and_installed_copy_matches(self):
        by_type = {node["type"]: node for node in self.nodes.values()}
        def image_source(node_type):
            node = by_type[node_type]
            image_input = next(sock for sock in node["inputs"] if sock["type"] == "IMAGE")
            link = next(link for link in self.workflow["links"] if link[0] == image_input["link"])
            return link[1:3]
        self.assertEqual(image_source("PreviewImage"), image_source("CharacterQwenControlEntry"))
        converter = by_type["AIO_Preprocessor"]
        canvas = by_type["ImageScaleToTotalPixels"]
        dimensions = by_type["GetImageSize"]
        self.assertEqual(image_source("PreviewImage"), [canvas["id"], 0])
        self.assertEqual(image_source("GetImageSize"), [canvas["id"], 0])
        self.assertEqual(image_source("ImageScaleToTotalPixels"), [converter["id"], 0])
        self.assertEqual(canvas["widgets_values"], ["bicubic", 1.0, 16])
        latent = by_type["EmptyLatentImage"]
        for slot, name in enumerate(["width", "height"]):
            input = next(sock for sock in latent["inputs"] if sock["name"] == name)
            link = next(link for link in self.workflow["links"] if link[0] == input["link"])
            self.assertEqual(link[1:5], [dimensions["id"], slot, latent["id"], slot])
        self.assertEqual(image_source("AIO_Preprocessor"), [by_type["LoadImage"]["id"], 0])
        self.assertEqual(converter["widgets_values"], ["CannyEdgePreprocessor", 768])
        installed = ROOT.parents[1] / "user/default/workflows/qwen 2.1/Qwen Image 2.1 - Character Creator ControlNet Test.json"
        self.assertEqual(json.loads(installed.read_text(encoding="utf-8")), self.workflow)

    def test_saved_converter_dispatches_selected_preprocessor_with_its_defaults(self):
        # Isolate installed dispatch logic without importing the GPU/detector package.
        aux = ROOT.parent / "comfyui_controlnet_aux"
        tree = ast.parse((aux / "__init__.py").read_text(encoding="utf-8"))
        aio = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "AIO_Preprocessor")
        calls = []
        source, converted = object(), object()
        class Detector:
            FUNCTION = "convert"
            @classmethod
            def INPUT_TYPES(cls):
                return {"required": {"image": ("IMAGE",)}, "optional": {
                    "resolution": ("INT", {"default": 512}),
                    "low_threshold": ("INT", {"default": 100}),
                    "high_threshold": ("INT", {"default": 200}),
                }}
            def convert(self, **kwargs):
                calls.append(kwargs)
                return (converted,)
        namespace = {"AUX_NODE_MAPPINGS": {"CannyEdgePreprocessor": Detector}}
        exec(compile(ast.Module(body=[aio], type_ignores=[]), str(aux / "__init__.py"), "exec"), namespace)
        name, resolution = next(node for node in self.nodes.values() if node["type"] == "AIO_Preprocessor")["widgets_values"]
        converter = namespace["AIO_Preprocessor"]()
        self.assertEqual(converter.execute(name, source, resolution), (converted,))
        self.assertEqual(calls, [{"image": source, "resolution": 768, "low_threshold": 100, "high_threshold": 200}])
        self.assertEqual(converter.execute("none", source, resolution), (source,))

    def test_recommended_converter_names_exist_in_installed_aux_wrappers(self):
        aux = ROOT.parent / "comfyui_controlnet_aux/node_wrappers"
        expected = {
            "canny.py": "CannyEdgePreprocessor", "dwpose.py": "DWPreprocessor",
            "depth_anything_v2.py": "DepthAnythingV2Preprocessor", "hed.py": "HEDPreprocessor",
            "lineart.py": "LineArtPreprocessor", "mlsd.py": "M-LSDPreprocessor",
            "scribble.py": "Scribble_XDoG_Preprocessor",
        }
        for filename, node_id in expected.items():
            with self.subTest(node_id=node_id):
                tree = ast.parse((aux / filename).read_text(encoding="utf-8"))
                mapping = next(node.value for node in tree.body if isinstance(node, ast.Assign)
                               and any(isinstance(target, ast.Name) and target.id == "NODE_CLASS_MAPPINGS" for target in node.targets))
                self.assertIn(node_id, [ast.literal_eval(key) for key in mapping.keys])
