import json
import struct
import unittest
from graphlib import TopologicalSorter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMFY = ROOT.parents[1]



def check_links(test, nodes, links, inputs=(), outputs=()):
    by_id = {node['id']: node for node in nodes}
    graph = {node['id']: set() for node in nodes}
    graph[-10] = set()
    graph[-20] = set()
    test.assertEqual(len({link['id'] for link in links}), len(links))
    for link in links:
        source, target = link['origin_id'], link['target_id']
        if source == -10:
            socket = inputs[link['origin_slot']]
            test.assertIn(link['id'], socket['linkIds'])
        else:
            socket = by_id[source]['outputs'][link['origin_slot']]
            test.assertIn(link['id'], socket['links'])
        test.assertEqual(socket['type'], link['type'])
        if target == -20:
            socket = outputs[link['target_slot']]
            test.assertIn(link['id'], socket['linkIds'])
        else:
            socket = by_id[target]['inputs'][link['target_slot']]
            test.assertEqual(socket['link'], link['id'])
        test.assertEqual(socket['type'], link['type'])
        graph[target].add(source)
    test.assertEqual(len(list(TopologicalSorter(graph).static_order())), len(graph))


def link_objects(links):
    return [dict(zip(['id', 'origin_id', 'origin_slot', 'target_id', 'target_slot', 'type'], link)) for link in links]


def expand_subgraph(workflow):
    definition = workflow['definitions']['subgraphs'][0]
    host = next(node for node in workflow['nodes'] if node['type'] == definition['id'])
    links = {link['id']: link for link in definition['links']}
    outer = {link[0]: link for link in workflow['links']}
    widget_names = {
        'CheckpointLoaderSimple': ['ckpt_name'], 'CLIPTextEncode': ['text'],
        'EmptyLatentImage': ['width', 'height', 'batch_size'],
        'KSampler': ['seed', None, 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
        'TextEncodeQwenImage21': ['prompt', 'negative_prompt', 'resolution'],
        'UNETLoader': ['unet_name', 'weight_dtype'], 'CLIPLoader': ['clip_name', 'type', 'device'],
        'VAELoader': ['vae_name'], 'QwenImage21Cache': ['mode', 'cache_type'],
    }
    result = {}
    for node in definition['nodes']:
        values = {name: value for name, value in zip(widget_names.get(node['type'], []), node.get('widgets_values', [])) if name}
        for socket in node['inputs']:
            if socket['link'] is None:
                continue
            link = links[socket['link']]
            if link['origin_id'] == -10:
                interface = definition['inputs'][link['origin_slot']]
                parent_input = host['inputs'][link['origin_slot']]
                if parent_input['link'] is not None:
                    source = outer[parent_input['link']]
                    value = [str(source[1]), source[2]]
                else:
                    value = host['widgets_values_named'][interface['name']]
            else:
                value = [f"{host['id']}:{link['origin_id']}", link['origin_slot']]
            values[socket['name']] = value
        result[f"{host['id']}:{node['id']}"] = {'class_type': node['type'], 'inputs': values}
    output_link = links[definition['outputs'][0]['linkIds'][0]]
    return result, [f"{host['id']}:{output_link['origin_id']}", output_link['origin_slot']]


class FamilyWorkflowTests(unittest.TestCase):

    def test_every_example_routes_the_appended_negative_output_to_its_negative_encoder(self):
        for path in (ROOT / 'examples').glob('*Character Creator*.json'):
            with self.subTest(workflow=path.name):
                workflow = json.loads(path.read_text(encoding='utf-8'))
                creator = next(node for node in workflow['nodes'] if node['type'] == 'CharacterCreator')
                self.assertEqual([slot['name'] for slot in creator['outputs']], ['prompt', 'character_code', 'controlnet_stack', 'negative_prompt'])
                check_links(self, workflow['nodes'], link_objects(workflow['links']))
                link = next(link for link in workflow['links'] if link[1:3] == [creator['id'], 3])
                target = next(node for node in workflow['nodes'] if node['id'] == link[3])
                socket = target['inputs'][link[4]]
                self.assertIn(socket['name'], ('text', 'negative_prompt'))
                if 'definitions' in workflow:
                    expanded, _ = expand_subgraph(workflow)
                    target = next(node for node in expanded.values() if node['inputs'].get('text', node['inputs'].get('negative_prompt')) == ['1', 3])
                    self.assertIn(target['class_type'], ('CLIPTextEncode', 'TextEncodeQwenImage21'))
                elif target['type'] == 'CLIPTextEncode':
                    outgoing = target['outputs'][0]['links'][0]
                    condition_link = next(link for link in workflow['links'] if link[0] == outgoing)
                    apply = next(node for node in workflow['nodes'] if node['id'] == condition_link[3])
                    self.assertEqual(apply['inputs'][condition_link[4]]['name'], 'negative')

    def test_installed_checkpoints_match_their_actual_text_encoder_architectures(self):
        expected = {
            'dreamshaper_8.safetensors': {'cond_stage_model.transformer.text_model.embeddings.token_embedding.weight': 768},
            'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors': {
                'conditioner.embedders.0.transformer.text_model.embeddings.token_embedding.weight': 768,
                'conditioner.embedders.1.model.token_embedding.weight': 1280,
            },
        }
        for name, signatures in expected.items():
            with self.subTest(checkpoint=name), (COMFY / 'models/checkpoints' / name).open('rb') as stream:
                header = json.loads(stream.read(struct.unpack('<Q', stream.read(8))[0]))
                for key, channels in signatures.items():
                    self.assertEqual(header[key]['shape'], [49408, channels])

    def test_sd_workflows_have_complete_native_generation_paths_and_matching_families(self):
        for path in (ROOT / 'examples').glob('SD*Character Creator.json'):
            with self.subTest(workflow=path.name):
                workflow = json.loads(path.read_text(encoding='utf-8'))
                check_links(self, workflow['nodes'], link_objects(workflow['links']))
                nodes = {node['type']: node for node in workflow['nodes']}
                family = 'sdxl' if path.name.startswith('SDXL') else 'sd'
                self.assertEqual(nodes['CharacterCreator']['widgets_values_named']['model'], family)
                self.assertEqual(len([node for node in workflow['nodes'] if node['type'] == 'CLIPTextEncode']), 2)
                self.assertTrue((COMFY / 'models/checkpoints' / nodes['CheckpointLoaderSimple']['widgets_values'][0]).is_file())
                self.assertEqual(nodes['KSampler']['widgets_values'][4:6], ['dpmpp_2m', 'karras'])
                self.assertEqual(nodes['EmptyLatentImage']['widgets_values'][:2], [832, 1216] if family == 'sdxl' else [512, 768])
                self.assertEqual(json.loads((COMFY / 'user/default/workflows/Character Creator' / path.name).read_text(encoding='utf-8')), workflow)

    def test_compact_workflows_have_valid_native_boundaries_and_only_practical_parent_controls(self):
        paths = list((ROOT / 'examples').glob('*Character Creator Compact.json'))
        self.assertEqual(len(paths), 3)
        for path in paths:
            with self.subTest(workflow=path.name):
                workflow = json.loads(path.read_text(encoding='utf-8'))
                check_links(self, workflow['nodes'], link_objects(workflow['links']))
                definition = workflow['definitions']['subgraphs'][0]
                check_links(self, definition['nodes'], definition['links'], definition['inputs'], definition['outputs'])
                host = next(node for node in workflow['nodes'] if node['type'] == definition['id'])
                creator = next(node for node in workflow['nodes'] if node['type'] == 'CharacterCreator')
                self.assertEqual(creator['size'], [690, 680])
                self.assertEqual([slot['type'] for slot in host['outputs']], ['IMAGE'])
                self.assertTrue({'prompt', 'controlnet_stack', 'width', 'height', 'seed', 'steps', 'cfg', 'negative_prompt'}.issubset({slot['name'] for slot in host['inputs']}))
                self.assertNotIn('proxyWidgets', host['properties'])
                expanded, output = expand_subgraph(workflow)
                self.assertEqual(expanded[output[0]]['class_type'], 'VAEDecode')
                sampler = next(node for node in expanded.values() if node['class_type'] == 'KSampler')
                self.assertEqual(expanded[sampler['inputs']['positive'][0]]['class_type'], 'ApplyCharacterControlNets')
                self.assertTrue(any(node['inputs'].get('text', node['inputs'].get('prompt')) == ['1', 0] for node in expanded.values()))
                host['widgets_values_named']['seed'] = 123456
                host['widgets_values_named']['width'] = 768
                changed, _ = expand_subgraph(workflow)
                self.assertEqual(next(node for node in changed.values() if node['class_type'] == 'KSampler')['inputs']['seed'], 123456)
                self.assertEqual(next(node for node in changed.values() if node['class_type'] == 'EmptyLatentImage')['inputs']['width'], 768)
                self.assertEqual(json.loads((COMFY / 'user/default/workflows/Character Creator' / path.name).read_text(encoding='utf-8')), json.loads(path.read_text(encoding='utf-8')))
