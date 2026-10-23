import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("garment_core", ROOT / "core.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class GarmentModifierTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.catalog["allow_nsfw"] = False
        self.settings = {**core.defaults(self.catalog), "age": 30, "wardrobe_mode": "separates", "framing": "full_body"}

    def render(self, clothing, **settings):
        return core.render_prompt({**self.settings, **settings, "clothing": clothing}, self.catalog)

    def test_each_supported_modifier_renders_and_survives_character_codes(self):
        self.catalog["allow_nsfw"] = True
        for field in core.CLOTHING_FIELDS:
            for option in self.catalog["fields"].get(field, self.catalog["extra_fields"].get(field, {}))["options"]:
                metadata = self.catalog["fields"].get(field, self.catalog["extra_fields"].get(field, {})).get("option_details", {}).get(option["id"], {})
                for kind, ids in metadata.get("modifiers", {}).items():
                    for value in ids:
                        with self.subTest(field=field, option=option["id"], kind=kind, value=value):
                            settings = {**self.settings, field: option["id"], "wardrobe_mode": "dress" if field == "dress" else "separates",
                                        "clothing": {field: {kind: value}}}
                            restored = core.decode_character(core.encode_character(settings))
                            prompt = core.render_prompt(restored, self.catalog)
                            self.assertIn(self.catalog["clothing"]["modifiers"][kind]["options"][value]["phrase"], prompt)

    def test_restricted_options_and_lengths_cannot_be_enabled_by_a_shared_code(self):
        for field, spec in {**self.catalog["fields"], **self.catalog["extra_fields"]}.items():
            for option in spec["options"]:
                if not option.get("nsfw"):
                    continue
                settings = {**self.settings, field: option["id"]}
                with self.subTest(field=field, option=option["id"]), self.assertRaisesRegex(ValueError, "allow_nsfw"):
                    core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog)
        with self.assertRaisesRegex(ValueError, "allow_nsfw"):
            self.render({"lower_garment": {"hem_length": "mini"}}, lower_garment="skirt")
        for closure in ["open", "half_open"]:
            with self.subTest(closure=closure), self.assertRaises(ValueError):
                self.render({"upper_garment": {"closure": closure}}, upper_garment="shirt")

    def test_lingerie_and_sheer_materials_render_only_with_local_permission(self):
        for field in ['upper_garment', 'lower_garment', 'dress']:
            for option in self.catalog['fields'][field]['options']:
                if not option.get('nsfw'):
                    continue
                settings = {**self.settings, field: option['id'], 'wardrobe_mode': 'dress' if field == 'dress' else 'separates'}
                for model in core.ADAPTERS:
                    with self.subTest(field=field, option=option['id'], model=model):
                        settings['model'] = model
                        self.catalog['allow_nsfw'] = True
                        self.assertIn(option['phrase'], core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog))
                        self.catalog['allow_nsfw'] = False
                        with self.assertRaisesRegex(ValueError, 'allow_nsfw'):
                            core.render_prompt(settings, self.catalog)
        for fabric in ['lace', 'sheer_mesh', 'sheer_organza']:
            for opacity in [0, 50, 100]:
                with self.subTest(fabric=fabric, opacity=opacity), self.assertRaisesRegex(ValueError, 'allow_nsfw'):
                    self.render({'upper_garment': {'fabric': fabric, 'opacity': opacity}})
        with self.assertRaises(ValueError):
            core.render_prompt(core.decode_character(core.encode_character({**self.settings, 'allow_nsfw': True})), self.catalog)

    def test_all_sfw_options_produce_positive_prompts_without_lingerie_or_transparency(self):
        for field, spec in {**self.catalog['fields'], **self.catalog['extra_fields']}.items():
            for option in spec['options']:
                if option.get('nsfw'):
                    continue
                settings = {**self.settings, field: option['id']}
                if field == 'dress': settings['wardrobe_mode'] = 'dress' if option['id'] != 'none' else 'separates'
                if field in ['upper_garment', 'lower_garment'] and option['id'] == 'none': settings['wardrobe_mode'] = 'dress'
                for model in core.ADAPTERS:
                    settings['model'] = model
                    with self.subTest(field=field, option=option['id'], model=model):
                        prompt = core.render_prompt(settings, self.catalog).lower()
                        for forbidden in ['lingerie', 'breasts', 'transparent', 'uncovered', 'thong', 'bralette']:
                            self.assertNotIn(forbidden, prompt)

    def test_opacity_is_gated_validated_and_has_no_opaque_coverage_claim(self):
        with self.assertRaisesRegex(ValueError, "allow_nsfw"):
            self.render({"upper_garment": {"fabric": "plastic", "opacity": 25}})
        self.assertIn("fully opaque", self.render({"upper_garment": {"fabric": "plastic", "opacity": 100}}))
        self.catalog["allow_nsfw"] = True
        for opacity, phrase in [(0, "clear and transparent"), (25, "mostly transparent"), (50, "semi-transparent"), (90, "slightly translucent")]:
            prompt = self.render({"upper_garment": {"fabric": "plastic", "opacity": opacity}})
            self.assertIn(phrase, prompt)
            self.assertNotIn("opaque fabric fully covering", prompt)
        for opacity in [-1, 101, True, 0.5, "30"]:
            with self.subTest(opacity=opacity), self.assertRaisesRegex(ValueError, "opacity"):
                self.render({"upper_garment": {"fabric": "plastic", "opacity": opacity}})
        with self.assertRaisesRegex(ValueError, "transparency"):
            self.render({"upper_garment": {"fabric": "cotton", "opacity": 50}})

    def test_modifiers_do_not_leave_conflicting_original_descriptions(self):
        prompt = self.render({"outerwear": {"closure": "buttoned"}}, outerwear="coat")
        self.assertIn("fully buttoned", prompt)
        self.assertNotIn("worn open", prompt)
        prompt = self.render({"upper_garment": {"sleeve_length": "short"}}, upper_garment="long_sleeve")
        self.assertIn("short sleeves", prompt)
        self.assertNotIn("long-sleeved", prompt)
        prompt = self.render({"lower_garment": {"hem_length": "ankle"}}, lower_garment="skirt")
        self.assertIn("ending at the ankles", prompt)
        self.assertNotIn("knee-length", prompt)
        with self.assertRaisesRegex(ValueError, "Rolled sleeves"):
            self.render({"upper_garment": {"sleeve_length": "sleeveless", "sleeve_roll": "elbow"}}, upper_garment="shirt")
        with self.assertRaisesRegex(ValueError, "does not support"):
            self.render({"shoes": {"closure": "buttoned"}})

    def test_chest_wording_is_explicit_policy_sensitive_and_female_only(self):
        for family in core.ADAPTERS:
            for nsfw in [False, True]:
                self.catalog["allow_nsfw"] = nsfw
                for size, word in [("small", "small"), ("medium", "medium-sized"), ("full", "large")]:
                    prompt = self.render({}, model=family, gender="woman", bust_size=size)
                    self.assertIn(f"{word} {'breasts' if nsfw else 'chest'}", prompt)
                    self.assertNotIn("bust fit", prompt)
                    if not nsfw:
                        self.assertNotIn("breasts", prompt)
                    male = self.render({}, model=family, gender="man", bust_size=size)
                    self.assertNotIn("breasts", male)
                    portrait = self.render({}, model=family, bust_size=size, framing="portrait")
                    self.assertNotIn("upper-body contour", portrait)
        uncovered = self.render({}, gender="woman", bust_size="full", upper_garment="none")
        self.assertIn("large breasts", uncovered)

    def test_new_poses_respect_crop_and_all_new_builds_are_adult_descriptions(self):
        self.catalog["allow_nsfw"] = True
        for option in self.catalog["fields"]["pose"]["options"]:
            if not option["id"].startswith(("ballet_", "runway_", "editorial_", "glamour_")):
                continue
            prompt = self.render({}, pose=option["id"], framing="waist_up")
            self.assertIn(self.catalog["fields"]["pose"]["option_details"][option["id"]]["cropped_phrase"], prompt)
            self.assertNotIn("balancing on one leg", prompt)
        for option in self.catalog["fields"]["body_shape"]["options"]:
            prompt = self.render({}, body_shape=option["id"], age=10)
            self.assertIn("adult", prompt)
            self.assertIn("aged 18 years", prompt)

    def test_neckwear_jewelry_and_goth_outfits_share_and_render_in_each_family(self):
        fields = {**self.catalog['fields'], **self.catalog['extra_fields']}
        for family in core.ADAPTERS:
            for option in fields['neckwear']['options'][1:]:
                settings = {**self.settings, 'model': family, 'neckwear': option['id'], 'necklace': 'locket',
                            'colors': {'neckwear': '#ff0000'}, 'clothing': {'neckwear': {'fabric': 'velvet', 'details': {'piping': '#ffb300'}}}}
                restored = core.decode_character(core.encode_character(settings))
                prompt = core.render_prompt(restored, self.catalog)
                self.assertIn('velvet', prompt)
                self.assertIn('piping', prompt)
                self.assertIn('locket', prompt)
                self.assertIn(option['id'], restored['neckwear'])
            for outfit in ['goth_ensemble', 'goth_suit']:
                settings = {**self.settings, 'model': family, 'wardrobe_mode': 'dress', 'dress': outfit,
                            'clothing': {'dress': {'closure': 'front_laced', 'fit': 'tailored', 'details': {'chains': '#ffb300', 'gothic_motif': '#ff0000'}}}}
                prompt = core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog)
                for phrase in ['gothic', 'lacing at the front', 'tailored fit', 'decorative chains', 'gothic embroidery']:
                    self.assertIn(phrase, prompt)
        portrait = self.render({'neckwear': {'neck_width': 'wide', 'neck_fastening': 'buckle'}}, neckwear='choker', framing='portrait')
        self.assertIn('wide band around the neck', portrait)
        self.assertIn('small buckle', portrait)
        self.assertNotIn('neckline and shoulders of a black leather choker', portrait)
        legacy = self.render({}, necklace='choker', neckwear='choker')
        self.assertEqual(legacy.count('choker'), 1)

    def test_intimate_outfits_are_named_in_the_opening_without_generic_opaque_coverage(self):
        self.catalog['allow_nsfw'] = True
        for family in core.ADAPTERS:
            for template in self.catalog['templates']:
                for field, option, mode, role in [('upper_garment', 'bralette', 'separates', 'underwear'),
                                                 ('dress', 'lace_up_bodysuit', 'dress', 'lingerie')]:
                    settings = {**self.settings, 'model': family, 'template': template, field: option, 'wardrobe_mode': mode, 'bust_size': 'full'}
                    prompt = core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog)
                    self.assertIn('wearing visible ' + role, prompt[:350])
                    self.assertNotIn('fully covered by opaque clothing', prompt)
                    self.assertNotIn('opaque fabric fully covering', prompt)
                    self.assertIn('large breasts', prompt)
                    garment = next(item for item in self.catalog['fields'][field]['options'] if item['id'] == option)
                    self.assertIn(garment['phrase'], prompt)
        # Inactive saved underwear and cropped-out lower clothing must not change the opening.
        prompt = self.render({}, dress='lace_teddy', wardrobe_mode='separates')
        self.assertNotIn('wearing visible lingerie', prompt)
        prompt = self.render({}, lower_garment='lace_up_briefs', framing='waist_up')
        self.assertNotIn('wearing visible lingerie', prompt)
        prompt = self.render({'dress': {'closure': 'back_laced'}}, dress='lace_up_bodysuit', wardrobe_mode='dress')
        self.assertIn('lacing at the back', prompt)
        self.assertNotIn('with front lacing', prompt)
        self.catalog['allow_nsfw'] = False
        with self.assertRaisesRegex(ValueError, 'allow_nsfw'):
            self.render({}, dress='lace_up_bodysuit', wardrobe_mode='dress')

    def test_clothing_dropdowns_and_supported_values_follow_ordered_scales(self):
        modifiers = self.catalog['clothing']['modifiers']
        for kind, expected in {
            'hem_length': ['default', 'micro', 'mini', 'knee', 'midi', 'ankle', 'floor'],
            'sleeve_length': ['default', 'sleeveless', 'cap', 'short', 'elbow', 'three_quarter', 'long'],
            'fit': ['default', 'compression', 'fitted', 'tailored', 'relaxed', 'oversized'],
            'neck_width': ['default', 'thin', 'standard', 'wide'],
        }.items():
            self.assertEqual(list(modifiers[kind]['options']), expected)
        for spec in [*self.catalog['fields'].values(), *self.catalog['extra_fields'].values()]:
            for metadata in spec.get('option_details', {}).values():
                for kind, values in metadata.get('modifiers', {}).items():
                    order = list(modifiers[kind]['options'])
                    self.assertEqual(values, sorted(values, key=order.index))
        for kind in ['fabric', 'texture']:
            values = self.catalog['clothing'][kind]
            self.assertEqual(next(iter(values)), 'default')
            labels = [value['label'].casefold() for key, value in values.items() if key != 'default']
            self.assertEqual(labels, sorted(labels))
