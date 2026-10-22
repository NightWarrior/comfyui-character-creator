import base64
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("character_core", ROOT / "core.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class CharacterTests(unittest.TestCase):
    def setUp(self):
        self.catalog = core.load_catalog()
        self.settings = core.defaults(self.catalog)

    def test_three_starters_use_only_valid_options_and_round_trip_as_adults(self):
        starters = core.starter_characters(self.catalog)
        self.assertEqual(len(starters), 3)
        self.assertEqual([row["settings"]["age"] for row in starters], [24, 52, 78])
        self.assertEqual({key: starters[0]["settings"][key] for key in ("art_style", "background", "lighting", "composition")},
                         {"art_style": "fashion", "background": "mountains", "lighting": "neon", "composition": "dynamic"})
        for row in starters:
            with self.subTest(character=row["name"]):
                settings = row["settings"]
                self.assertEqual(core.decode_character(core.encode_character(settings)), settings)
                prompt = core.render_prompt(settings, self.catalog)
                self.assertIn(f'aged {settings["age"]} years', prompt)
                self.assertNotIn("uncovered", prompt)
                self.assertNotIn("prompt", settings)
        self.assertIn("bright red silk qipao", core.render_prompt(starters[0]["settings"], self.catalog))
        self.assertIn("metallic gold piping", core.render_prompt(starters[0]["settings"], self.catalog))

    def test_default_qwen_prompt_is_observational_paragraph(self):
        prompt = core.render_prompt(self.settings, self.catalog)
        self.assertTrue(prompt.startswith("The image is a realistic editorial photograph of an adult woman"))
        for fragment in ("warm medium skin", "cotton T-shirt", "denim jeans", "The lighting is", "The overall composition uses"):
            self.assertIn(fragment, prompt)
        for forbidden in ("\n", "masterpiece", "8K", "qwen", "2:3", "None", "{", "}"):
            self.assertNotIn(forbidden, prompt)
        self.assertLess(prompt.index("The hair"), prompt.index("The subject wears"))

    def test_negative_prompts_follow_family_style_crop_and_local_policy(self):
        self.assertEqual(core.render_negative_prompt(self.settings, self.catalog), '')
        for model in ('sd', 'sdxl'):
            settings = {**self.settings, 'model': model, 'art_style': 'comic', 'framing': 'waist_up'}
            negative = core.render_negative_prompt(settings, self.catalog)
            for term in ('watermark', 'malformed hands', 'photorealistic', 'full body', 'exposed breasts'):
                self.assertIn(term, negative)
            self.assertNotIn('cartoon', negative)
            self.assertEqual('low resolution' in negative, model == 'sd')
            photo = core.render_negative_prompt({**settings, 'art_style': 'photo', 'framing': 'full_body'}, self.catalog)
            self.assertIn('cartoon', photo)
            self.assertNotIn('photorealistic', photo)
            self.assertNotIn('full body', photo)
            clay = core.render_negative_prompt({**settings, 'art_style': 'clay'}, self.catalog)
            self.assertNotIn('photorealistic', clay)
            adult = core.render_negative_prompt(settings, {**self.catalog, 'allow_nsfw': True})
            self.assertNotIn('exposed breasts', adult)

    def test_study_templates_reorder_details_without_losing_character_choices(self):
        settings = {**self.settings, 'hair_color': 'red', 'eye_color': 'blue', 'gloves': 'leather'}
        for template in ('character', 'outfit', 'face', 'build', 'scene'):
            chosen = {**settings, 'template': template}
            prompt = core.render_prompt(chosen, self.catalog)
            self.assertEqual(core.decode_character(core.encode_character(chosen)), chosen)
            for text in ('rich auburn', 'irises are blue', 'cotton T-shirt', 'denim jeans', 'leather gloves',
                         'full-body framing', 'standing upright', 'The lighting is'):
                self.assertIn(text, prompt)
            self.assertEqual(prompt.count('The subject wears'), 1)
        outfit = core.render_prompt({**settings, 'template': 'outfit'}, self.catalog)
        self.assertLess(outfit.index('The subject wears'), outfit.index('The hair is'))
        face = core.render_prompt({**settings, 'template': 'face'}, self.catalog)
        self.assertLess(face.index('The face has'), face.index('The subject wears'))
        build = core.render_prompt({**settings, 'template': 'build'}, self.catalog)
        self.assertLess(build.index('The subject has'), build.index('The hair is'))
        scene = core.render_prompt({**settings, 'template': 'scene'}, self.catalog)
        self.assertLess(scene.index('The lighting is'), scene.index('The hair is'))

    def test_gender_catalog_contains_only_female_and_male(self):
        options = self.catalog["fields"]["gender"]["options"]
        self.assertEqual([(option["id"], option["label"]) for option in options],
                         [("woman", "Female"), ("man", "Male")])

    def test_comic_outfit_prompt_specifies_drawn_surfaces_and_preserves_character_choices(self):
        settings = {**self.settings, 'age': 18, 'art_style': 'comic', 'template': 'outfit',
                    'wardrobe_mode': 'dress', 'dress': 'qipao', 'framing': 'waist_up',
                    'body_shape': 'slender', 'bust_size': 'small', 'muscle_tone': 'soft',
                    'skin_tone': 'porcelain', 'hair_color': 'red', 'hair_style': 'long_waves',
                    'ethnicity': 'european', 'expression': 'smile', 'pose': 'contrapposto',
                    'lighting': 'window', 'composition': 'dramatic', 'colors': {'dress': '#fa0000'},
                    'clothing': {'dress': {'fabric': 'silk', 'texture': 'smooth',
                                          'details': {'belt': '#ffb300', 'piping': '#ffb300'}}}}
        imported = core.decode_character(core.encode_character(settings))
        prompt = core.render_prompt(imported, self.catalog)
        self.assertTrue(prompt.startswith('The image is a flat 2D comic-book illustration'))
        for phrase in ('bold black ink outlines', 'solid color fills', 'cel-shaded shadow shapes',
                       'halftone dots', 'simplified drawn facial features', 'graphic fabric folds',
                       'bright red silk qipao', 'golden yellow piping', 'golden yellow waist belt',
                       'waist-up framing', 'opaque fabric fully covering the chest', 'The subject is European.'):
            self.assertIn(phrase, prompt)
        photo = core.render_prompt({**settings, 'art_style': 'photo'}, self.catalog)
        self.assertTrue(photo.startswith('The image is a realistic editorial photograph'))
        self.assertNotIn('halftone', photo)
        self.assertEqual(imported, settings)

    def test_every_bundled_option_renders_when_outfit_has_coverage(self):
        for field, definition in self.catalog["fields"].items():
            for option in definition["options"]:
                settings = {**self.settings, field: option["id"]}
                if field == "wardrobe_mode":
                    pass
                elif field == "dress":
                    settings["wardrobe_mode"] = "separates" if option["id"] == "none" else "dress"
                elif field in {"upper_garment", "lower_garment"} and option["id"] == "none":
                    settings["wardrobe_mode"] = "dress"
                with self.subTest(field=field, option=option["id"]):
                    self.assertIsInstance(core.render_prompt(settings, self.catalog), str)

    def test_missing_coverage_is_gated_in_both_outfit_modes(self):
        for changes in ({"upper_garment": "none"}, {"lower_garment": "none"}, {"wardrobe_mode": "dress", "dress": "none"}):
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, "uncovered"):
                core.render_prompt({**self.settings, **changes}, self.catalog)

    def test_outerwear_does_not_claim_coverage_when_worn_open(self):
        with self.assertRaisesRegex(ValueError, "uncovered"):
            core.render_prompt({**self.settings, "upper_garment": "none", "outerwear": "coat"}, self.catalog)

    def test_dress_ignores_unused_separates(self):
        settings = {**self.settings, "wardrobe_mode": "dress", "upper_garment": "none", "lower_garment": "none"}
        prompt = core.render_prompt(settings, self.catalog)
        self.assertIn("cotton day dress", prompt)
        self.assertNotIn("uncovered", prompt)
        self.assertNotIn("T-shirt", prompt)
        self.assertNotIn("jeans", prompt)

    def test_shoes_and_headwear_can_be_absent(self):
        prompt = core.render_prompt({**self.settings, "shoes": "none", "headwear": "none"}, self.catalog)
        self.assertNotIn("uncovered", prompt)
        self.assertNotIn("sneakers", prompt)

    def test_explicit_local_policy_can_enable_missing_coverage(self):
        self.catalog["allow_nsfw"] = True
        prompt = core.render_prompt({**self.settings, "upper_garment": "none"}, self.catalog)
        self.assertIn("The torso is uncovered.", prompt)
        self.assertNotIn("T-shirt", prompt)

    def test_bald_does_not_emit_hair_color(self):
        prompt = core.render_prompt({**self.settings, "hair_style": "bald"}, self.catalog)
        self.assertIn("The head is bald.", prompt)
        self.assertNotIn("chestnut", prompt)

    def test_share_round_trip_is_canonical(self):
        code = core.encode_character(self.settings)
        decoded = core.decode_character(code)
        self.assertEqual(decoded, self.settings)
        self.assertEqual(code, core.encode_character(dict(reversed(list(decoded.items())))))
        self.assertNotIn("=", code)

    def test_codec_preserves_unicode(self):
        settings = {"custom": "蓝色 café 🌿"}
        self.assertEqual(core.decode_character(core.encode_character(settings)), settings)

    def test_import_cannot_enable_policy(self):
        settings = {**self.settings, "allow_nsfw": True, "upper_garment": "none"}
        with self.assertRaisesRegex(ValueError, "exactly"):
            core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog)
        settings.pop("allow_nsfw")
        with self.assertRaisesRegex(ValueError, "uncovered"):
            core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog)

    def test_bad_codes_fail_cleanly(self):
        payloads = [[], {}, {"version": True, "settings": {}}, {"version": 2, "settings": {}},
                    {"version": 1, "settings": {}, "allow_nsfw": True}, {"version": 1, "settings": []}]
        codes = ["", "CC2.abc", "CC1.??", "CC1.A", "CC1." + "A" * 32768, "CC1.W10=", None]
        codes += ["CC1." + base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=") for value in payloads]
        for code in codes:
            with self.subTest(code=str(code)[:45]), self.assertRaises(ValueError):
                core.decode_character(code)

    def test_unknown_model_option_and_type_fail(self):
        for changes in ({"model": "unsupported"}, {"template": "../file"}, {"hair_style": "missing"}, {"skin_tone": []}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                core.render_prompt({**self.settings, **changes}, self.catalog)

    def test_sd_families_use_compact_crop_aware_prompts_and_preserve_character_codes(self):
        for family in ('sd', 'sdxl'):
            settings = {**core.starter_characters(self.catalog)[0]['settings'], 'model': family}
            prompt = core.render_prompt(settings, self.catalog)
            self.assertTrue(prompt.startswith('fashion illustration'))
            self.assertNotIn('The image is', prompt)
            self.assertNotIn('shoes', prompt)
            self.assertIn('bright red silk qipao', prompt)
            self.assertIn('metallic gold piping', prompt)
            self.assertIn('dynamic mood', prompt)
            self.assertEqual(core.decode_character(core.encode_character(settings)), settings)
            self.assertLess(len(prompt), len(core.render_prompt({**settings, 'model': 'qwen_image_2_1'}, self.catalog)))
            with self.assertRaisesRegex(ValueError, 'uncovered'):
                core.render_prompt({**settings, 'dress': 'none'}, self.catalog)

    def test_fashion_illustration_does_not_duplicate_its_article(self):
        self.assertTrue(core.render_prompt({**self.settings, 'art_style': 'fashion'}, self.catalog).startswith('The image is a fashion illustration'))

    def test_compact_character_binds_face_and_hair_colors_and_separates_garment_sentences(self):
        settings = {**core.starter_characters(self.catalog)[0]['settings'], 'model': 'sdxl'}
        prompt = core.render_prompt(settings, self.catalog)
        for phrase in ('rich auburn hair', 'green eyes', 'metallic gold stud earrings', 'head to waist visible'):
            self.assertIn(phrase, prompt)
        self.assertNotIn('belt The torso', prompt)
        self.assertNotIn('The irises are', prompt)
        qwen = core.render_prompt({**settings, 'model': 'qwen_image_2_1'}, self.catalog)
        self.assertLess(qwen.index('mountain overlook'), qwen.index('bright red silk qipao'))


    def test_head_portraits_omit_belt_details_that_pull_the_crop_down_to_the_waist(self):
        original = core.starter_characters(self.catalog)[0]['settings']
        for model in core.ADAPTERS:
            settings = {**original, 'model': model, 'framing': 'portrait'}
            prompt = core.render_prompt(settings, self.catalog)
            self.assertNotIn('waist belt', prompt)
            self.assertIn('metallic gold piping', prompt)
            self.assertIn('belt', settings['clothing']['dress']['details'])

    def test_templates_reorder_fragments(self):
        prompt = core.render_prompt({**self.settings, "template": "outfit"}, self.catalog)
        self.assertLess(prompt.index("The subject wears"), prompt.index("The hair"))

    def test_anime_uses_correct_article(self):
        self.assertTrue(core.render_prompt({**self.settings, "art_style": "anime"}, self.catalog).startswith("The image is an anime"))

    def test_breast_size_affects_only_female_prompt(self):
        for size, phrase in (("small", "small bust fit"), ("medium", "medium bust fit"), ("full", "full bust fit")):
            settings = {**self.settings, "bust_size": size, "age": 30}
            self.assertIn(phrase, core.render_prompt(settings, self.catalog))
            self.assertNotIn("breasts", core.render_prompt({**settings, "gender": "man"}, self.catalog))
        self.assertNotIn("Her chest", core.render_prompt(self.settings, self.catalog))

    def test_age_bounds_apply_to_rendering_and_shared_codes_even_with_nsfw(self):
        for allow_nsfw in (False, True):
            self.catalog["allow_nsfw"] = allow_nsfw
            for age, expected in ((0, 18), (17, 18), (18, 18), (79, 79), (100, 100), (120, 100)):
                settings = {**self.settings, "age": age}
                self.assertIn(f"aged {expected} years", core.render_prompt(settings, self.catalog))
                self.assertEqual(core.decode_character(core.encode_character(settings))["age"], expected)
        for age in (True, "17", 20.5, None):
            with self.assertRaises(ValueError):
                core.render_prompt({**self.settings, "age": age}, self.catalog)

    def test_custom_colors_replace_old_colors_without_losing_material(self):
        settings = {**self.settings, "colors": {"upper_garment": "#ff0000", "hair_color": "#0000ff", "skin_tone": "#875335"}}
        prompt = core.render_prompt(settings, self.catalog)
        self.assertIn("a bright red cotton T-shirt", prompt)
        self.assertIn("The hair is bright blue", prompt)
        self.assertIn("deep warm brown skin", prompt)
        self.assertNotIn("pale cream", prompt)
        self.assertNotIn("chestnut", prompt)
        self.assertEqual(core.decode_character(core.encode_character(settings)), settings)

    def test_every_colorable_bundled_item_has_a_color_template(self):
        for field in core.COLOR_FIELDS:
            for option in {**self.catalog["fields"], **self.catalog["extra_fields"]}[field]["options"]:
                if option["phrase"]:
                    self.assertEqual(option["color_phrase"].count("{color}"), 1, option["id"])

    def test_color_name_exact_and_nearest_and_article(self):
        names = self.catalog["color_names"]
        self.assertEqual(core.color_name("#FF0000", names), "bright red")
        self.assertEqual(core.color_name("#fe0100", names), "bright red")
        self.assertEqual(core.colored_phrase("a {color} shirt", "off-white"), "an off-white shirt")

    def test_colors_cannot_change_policy_or_inject_prompt_text(self):
        for colors in ([], None, {"allow_nsfw": "#ff0000"}, {"upper_garment": "red; uncovered"}, {"hair_color": "#fff"}, {"shoes": 123}):
            with self.subTest(colors=colors), self.assertRaises(ValueError):
                core.render_prompt({**self.settings, "colors": colors}, self.catalog)
        with self.assertRaisesRegex(ValueError, "uncovered"):
            core.render_prompt({**self.settings, "upper_garment": "none", "colors": {"upper_garment": "#ff0000"}}, self.catalog)

    def test_absent_or_inactive_garments_do_not_emit_override_colors(self):
        settings = {**self.settings, "shoes": "none", "colors": {"dress": "#ff0000", "shoes": "#0000ff"}}
        self.assertEqual(core.render_prompt(settings, self.catalog), core.render_prompt({**self.settings, "shoes": "none"}, self.catalog))


    def test_crop_overrides_lower_body_pose_and_clothing_cues(self):
        for pose in ('walking', 'seated', 'contrapposto', 'profile'):
            settings = {**self.settings, 'framing': 'waist_up', 'pose': pose}
            prompt = core.render_prompt(settings, self.catalog)
            self.assertLess(prompt.index('waist-up'), prompt.index('At the centre'))
            for hidden in ('mid-stride', 'feet on the floor', 'weight on one leg', 'denim jeans', 'shoes', 'sneakers'):
                self.assertNotIn(hidden, prompt)
            self.assertIn('crop ends at the waist', prompt)
        full = core.render_prompt({**self.settings, 'pose': 'walking'}, self.catalog)
        self.assertIn('mid-stride', full)
        self.assertIn('denim jeans', full)
        close = core.render_prompt({**self.settings, 'framing': 'portrait', 'pose': 'seated', 'bust_size': 'full'}, self.catalog)
        self.assertIn('visible neckline and shoulders', close)
        self.assertNotIn('bust fit', close)
        self.assertNotIn('feet on the floor', close)
        three_quarter = core.render_prompt({**self.settings, 'framing': 'three_quarter', 'pose': 'seated'}, self.catalog)
        self.assertNotIn('shoes', three_quarter)
        self.assertNotIn('feet on the floor', three_quarter)
        # Crop changes never bypass coverage policy.
        with self.assertRaisesRegex(ValueError, 'uncovered'):
            core.render_prompt({**self.settings, 'framing': 'portrait', 'lower_garment': 'none'}, self.catalog)

    def test_reported_evening_dress_character_keeps_covered_bodice_and_crop(self):
        settings = {**self.settings, 'age': 18, 'art_style': 'photo', 'background': 'fantasy',
                    'body_shape': 'slender', 'bust_size': 'small', 'composition': 'dramatic',
                    'dress': 'evening_dress', 'expression': 'smile', 'framing': 'waist_up',
                    'hair_color': 'red', 'hair_style': 'bob', 'lighting': 'golden', 'pose': 'profile',
                    'skin_tone': 'porcelain', 'wardrobe_mode': 'dress', 'shoes': 'heels',
                    'colors': {'dress': '#ea5dc4', 'hair_color': '#ff0000'}}
        prompt = core.render_prompt(core.decode_character(core.encode_character(settings)), self.catalog)
        self.assertIn('bright pink satin evening dress', prompt)
        self.assertIn('dress bodice has a small bust fit', prompt)
        self.assertIn('opaque fabric fully covering the chest', prompt)
        self.assertNotIn('breasts', prompt)
        self.assertNotIn('shoes', prompt)

    def test_clothing_refinements_replace_material_and_share_all_accent_colors(self):
        settings = {**self.settings, 'upper_garment': 'shirt', 'clothing': {'upper_garment': {
            'fabric': 'velvet', 'texture': 'ribbed', 'details': {'piping': '#ff0000', 'buttons': '#0000ff'}}}}
        prompt = core.render_prompt(settings, self.catalog)
        self.assertIn('velvet', prompt)
        self.assertIn('ribbed-knit', prompt)
        self.assertIn('bright red piping', prompt)
        self.assertIn('bright blue buttons', prompt)
        self.assertNotIn('cotton button', prompt)
        self.assertEqual(core.decode_character(core.encode_character(settings)), settings)
        # Details absent from the current garment do not leak in after item changes.
        prompt = core.render_prompt({**settings, 'upper_garment': 'tank'}, self.catalog)
        self.assertNotIn('buttons', prompt)
        for clothing in (None, [], {'hair_color': {}}, {'dress': {'unknown': 'x'}},
                         {'dress': {'fabric': 'unknown'}}, {'dress': {'texture': []}},
                         {'dress': {'details': {'piping': 'red'}}}, {'dress': {'details': {'unknown': '#ff0000'}}}):
            with self.subTest(clothing=clothing), self.assertRaises(ValueError):
                core.render_prompt({**self.settings, 'clothing': clothing}, self.catalog)

    def test_face_hair_and_glove_choices_render_without_changing_legacy_defaults(self):
        for name, field in self.catalog['extra_fields'].items():
            self.assertEqual(field['options'][0]['id'], 'none')
            self.assertEqual(core.render_prompt({**self.settings, name: 'none'}, self.catalog), core.render_prompt(self.settings, self.catalog))
            for option in field['options']:
                settings = {**self.settings, name: option['id']}
                prompt = core.render_prompt(settings, self.catalog)
                self.assertEqual(core.decode_character(core.encode_character(settings)), settings)
                if option['phrase']:
                    self.assertIn(option['phrase'], prompt)
        settings = {**self.settings, 'hair_style': 'bald', 'hair_finish': 'messy', 'hair_volume': 'voluminous'}
        prompt = core.render_prompt(settings, self.catalog)
        self.assertNotIn('messy', prompt)
        self.assertNotIn('generous volume', prompt)
        prompt = core.render_prompt({**self.settings, 'gloves': 'long', 'framing': 'portrait'}, self.catalog)
        self.assertNotIn('gloves', prompt)
        for settings in ({'gloves': 'unknown'}, {'eye_color': 'unknown'}, {'hair_finish': []}):
            with self.assertRaises(ValueError):
                core.render_prompt({**self.settings, **settings}, self.catalog)
        settings = {**self.settings, 'eye_color': 'blue', 'earrings': 'hoops', 'gloves': 'leather',
            'colors': {'eye_color': '#00ff00', 'earrings': '#ff0000', 'gloves': '#0000ff'}}
        prompt = core.render_prompt(settings, self.catalog)
        self.assertIn('irises are bright lime green', prompt)
        self.assertIn('bright red hoop earrings', prompt)
        self.assertIn('bright blue fitted leather gloves', prompt)
        self.assertNotIn('blue irises', prompt)

    def test_ethnicity_is_optional_and_preserves_independent_appearance_choices(self):
        baseline = core.render_prompt(self.settings, self.catalog)
        self.assertEqual(baseline, core.render_prompt({**self.settings, 'ethnicity': 'unspecified'}, self.catalog))
        for option in self.catalog['ethnicity']['options']:
            settings = {**self.settings, 'ethnicity': option['id'], 'skin_tone': 'porcelain', 'hair_style': 'cornrows'}
            prompt = core.render_prompt(settings, self.catalog)
            if option['phrase']:
                self.assertIn('The subject is ' + option['phrase'], prompt)
            self.assertIn('porcelain', prompt)
            self.assertIn('cornrows', prompt)
            self.assertEqual(core.decode_character(core.encode_character(settings)), settings)
        for value in ('unknown', None, [], 123):
            with self.subTest(value=value), self.assertRaises(ValueError):
                core.render_prompt({**self.settings, 'ethnicity': value}, self.catalog)

    def test_none_first_and_unique_catalog_options_keep_explicit_defaults(self):
        for name, field in self.catalog['fields'].items():
            ids = [option['id'] for option in field['options']]
            self.assertEqual(len(ids), len(set(ids)), name)
            if 'none' in ids:
                self.assertEqual(ids[0], 'none', name)
            self.assertEqual(self.settings[name], field['default'])

    def test_all_garment_material_texture_and_detail_choices_render(self):
        for field in core.CLOTHING_FIELDS:
            for option in {**self.catalog['fields'], **self.catalog['extra_fields']}[field]['options']:
                if not option['phrase']:
                    continue
                settings = {**self.settings, field: option['id'], 'wardrobe_mode': 'dress' if field == 'dress' else 'separates'}
                for kind in ('fabric', 'texture'):
                    for value in self.catalog['clothing'][kind]:
                        core.render_prompt({**settings, 'clothing': {field: {kind: value}}}, self.catalog)
                details = {**self.catalog['fields'], **self.catalog['extra_fields']}[field]['option_details'][option['id']]['details']
                core.render_prompt({**settings, 'clothing': {field: {'details': {key: '#ff0000' for key in details}}}}, self.catalog)


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "tests", prefix="test-config-")
        self.root = Path(self.temp.name)
        assert self.root.resolve().is_relative_to((ROOT / "tests").resolve())
        shutil.copyfile(ROOT / "catalog.json", self.root / "catalog.json")
        self.addCleanup(self.temp.cleanup)

    def write(self, config):
        (self.root / "config.json").write_text(json.dumps(config), encoding="utf-8")

    def test_default_has_no_policy_key_and_is_safe(self):
        self.assertFalse((ROOT / "config.json").exists())
        self.assertFalse(core.load_catalog(self.root)["allow_nsfw"])

    def test_local_config_is_reloaded_and_changes_fingerprint(self):
        old = core.config_fingerprint(self.root)
        self.write({"allow_nsfw": True})
        self.assertTrue(core.load_catalog(self.root)["allow_nsfw"])
        self.assertNotEqual(old, core.config_fingerprint(self.root))

    def test_extend_options_and_templates_without_changing_bundled_defaults(self):
        self.write({"options": {"hair_style": [{"id": "custom_cut", "label": "My cut", "phrase": "cut in a layered bob", "icon": "bob"}]},
                    "templates": {"custom": {"label": "My template", "format": "{opening} {wardrobe} {lighting} {composition}"}}})
        catalog = core.load_catalog(self.root)
        settings = {**core.defaults(catalog), "hair_style": "custom_cut", "template": "custom"}
        self.assertIn("The subject wears", core.render_prompt(settings, catalog))

    def test_restricted_custom_options_and_templates_are_gated(self):
        self.write({"options": {"pose": [{"id": "restricted", "label": "Restricted", "phrase": "standing", "icon": "standing", "nsfw": True}]},
                    "templates": {"restricted": {"label": "Restricted", "format": "{opening}", "nsfw": True}}})
        catalog = core.load_catalog(self.root)
        for changes in ({"pose": "restricted"}, {"template": "restricted"}):
            with self.assertRaisesRegex(ValueError, "Restricted"):
                core.render_prompt({**core.defaults(catalog), **changes}, catalog)
        self.assertNotIn("restricted", core.public_catalog(catalog)["templates"])

    def test_invalid_configs_fail_with_value_error(self):
        invalid = [[], {"allow_nsfw": "true"}, {"enable": True}, {"options": {"unknown": []}},
                   {"options": {"wardrobe_mode": []}}, {"color_names": []}, {"color_names": {"#fff": "white"}},
                   {"options": {"pose": "standing"}}, {"options": {"pose": [{"id": "standing"}]}},
                   {"templates": {"bad": {"label": "Bad", "format": "{opening.__class__}"}}},
                   {"templates": {"bad": {"label": "Bad", "format": "{opening!r}"}}},
                   {"templates": {"bad": {"label": "Bad", "format": "{opening:20}"}}}]
        for config in invalid:
            self.write(config)
            with self.subTest(config=config), self.assertRaises(ValueError):
                core.load_catalog(self.root)

    def test_local_color_dictionary_is_used_in_prompt(self):
        self.write({"color_names": {"#536878": "storm blue"}})
        catalog = core.load_catalog(self.root)
        prompt = core.render_prompt({**core.defaults(catalog), "colors": {"upper_garment": "#536878"}}, catalog)
        self.assertIn("a storm blue cotton T-shirt", prompt)


if __name__ == "__main__":
    unittest.main()
