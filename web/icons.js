const paths = {
    female: '<circle cx="32" cy="12" r="8"/><path d="M24 26h16l8 22H16Zm3 23v12m10-12v12M24 26l-9 17m25-17 9 17"/>',
    male: '<circle cx="32" cy="12" r="8"/><path d="M21 39V29q11-9 22 0v10M25 32v28m14-28v28M25 43h14"/>',
    hair: '<circle cx="16" cy="44" r="8"/><circle cx="40" cy="44" r="8"/><path d="m21 38 30-28M35 38 13 9m15 21 8 8"/>',
    settings: '<path d="m26 6-2 9-8 4-8-2-5 10 7 6v8l-5 6 7 9 8-3 8 4 3 7h11l3-8 7-4 8 2 5-10-7-6v-8l5-6-7-9-8 3-8-4-3-9Z"/><circle cx="32" cy="33" r="11"/>',
    connections: '<circle cx="16" cy="11" r="6"/><circle cx="15" cy="51" r="6"/><circle cx="49" cy="40" r="6"/><path d="M16 17v28m5 4 22-7M16 25h18q15 0 15 9"/>',
    none: '<circle cx="32" cy="32" r="22"/><path d="M16 48 48 16"/>',
    person: '<circle cx="32" cy="18" r="9"/><path d="M14 56V44a18 18 0 0 1 36 0v12"/>',
    body: '<path d="M24 7h16l-2 12 9 15-5 23H22l-5-23 9-15Z"/>',
    muscle: '<path d="m12 48 6-23 9-9 8 7-7 8 2 9q13-16 23-1v12q-20 12-41-3Z"/>',
    face: '<ellipse cx="32" cy="30" rx="18" ry="24"/><path d="M23 27h2m14 0h2M25 41q7 6 14 0"/>',
    shirt: '<path d="m22 11-15 9 8 14 8-4v25h18V30l8 4 8-14-15-9q-10 13-20 0Z"/>',
    polo: '<path d="m22 11-15 9 8 14 8-4v25h18V30l8 4 8-14-15-9-10 8Z"/><path d="m22 11 6 14 4-6 4 6 6-14M32 20v12"/>',
    henley: '<path d="m22 11-15 9 8 14 8-4v25h18V30l8 4 8-14-15-9q-10 13-20 0Z"/><path d="M32 20v16m-2-9h4m-4 6h4"/>',
    cargo_shorts: '<path d="M18 13h28l4 34H35l-3-19-3 19H14Z"/><path d="M18 20h28M16 29h9v10H16Zm23 0h9v10H39Z"/>',
    loafers: '<path d="M10 27h17l8 12 19 5 2 10H8V38Z"/><path d="M9 48h46M22 30l12 12H17Z"/>',
    overalls: '<path d="M22 7h5v16h10V7h5v18l4 8 2 24H35l-3-19-3 19H16l2-24 4-8Z"/><path d="M27 27h10v9H27Z"/>',
    button_shirt: '<path d="m22 10-13 9 6 35h12V23l5-8 5 8v31h12l6-35-13-9-10 5Z"/><path d="M32 25v28m-2-22h4m-4 8h4m-4 8h4"/>',
    blouse: '<path d="m22 11-13 8-3 27 10 2 5-20-3 27h28l-3-27 5 20 10-2-3-27-13-8-10 9Z"/>',
    sweater: '<path d="m23 10-12 8-6 31 11 3 7-23v26h18V29l7 23 11-3-6-31-12-8Z"/><path d="M23 12q9 12 18 0M24 48h16"/>',
    hoodie: '<path d="M22 19q-1-18 10-16 11-2 10 16l10 7 7 27-12 3-6-23v23H23V33l-6 23-12-3 7-27Z"/><path d="m23 19 9 7 9-7M26 44h12v8H26Z"/>',
    tank: '<path d="M23 10h5q4 14 8 0h5v11l6 9-5 25H22l-5-25 6-9Z"/>',
    dress: '<path d="M24 6h5v11h6V6h5l4 16-7 9 15 25H12l15-25-7-9Z"/><path d="M27 31h10"/>',
    gown: '<path d="m24 5 8 10 8-10 2 18-7 9 20 27H9l20-27-7-9Z"/>',
    jumpsuit: '<path d="M22 6h7l3 9 3-9h7l3 19-7 6 5 27H32l-2-20-2 20H17l7-27-7-6Z"/>',
    trousers: '<path d="M20 8h24l4 49H35l-3-31-3 31H16Z"/><path d="M20 16h24M32 9v12"/>',
    shorts: '<path d="M18 13h28l4 34H35l-3-19-3 19H14Z"/><path d="M18 20h28"/>',
    skirt: '<path d="M23 11h18l12 41H11Z"/><path d="M22 18h20M26 24l-5 23m17-23 5 23"/>',
    long_skirt: '<path d="M23 6h18l13 51H10Z"/><path d="M22 14h20M27 20l-6 31m16-31 6 31"/>',
    jacket: '<path d="m23 11-11 9-6 32 11 3 6-24v24h18V31l6 24 11-3-6-32-11-9-9 10Z"/><path d="m24 13 8 10-6 8 6 7v17m8-42-8 10 6 8"/>',
    blazer: '<path d="m23 9-11 11-5 35 11 1 5-26v26h18V30l5 26 11-1-5-35-11-11-9 12Z"/><path d="m23 10 9 28 9-28m-9 28v18m-8-12h5m7 0h5"/>',
    coat: '<path d="m24 6-12 10-6 36 11 3 7-28-6 32h28l-6-32 7 28 11-3-6-36-12-10-8 11Z"/><path d="M32 17v42m-8-15h16"/>',
    cardigan: '<path d="m23 10-11 10-6 32 11 3 6-27v28h18V28l6 27 11-3-6-32-11-10-9 15Z"/><path d="M32 25v31m-2-20h4m-4 9h4"/>',
    sneakers: '<path d="m10 23 17 3 9 12 18 5 2 10H8V37Z"/><path d="M8 48h47M26 30l-7 5m13 0-7 5"/>',
    boots: '<path d="M17 7h22l-2 29 17 9v10H11V40l6-6Z"/><path d="M11 50h43M18 15h20"/>',
    heels: '<path d="m9 25 15 9 8-6 9 15 14 5v7H29L17 40l-1 15h-6Z"/>',
    sandals: '<path d="M10 29q10-16 20-3l21 16q10 14-5 15H16q-10-1-6-28Z"/><path d="m14 28 25 22m-17-29-6 25m14-16-7 22"/>',
    barefoot: '<path d="M26 9q13-7 14 9l-3 18 10 10q8 11-4 12H20q-9-6-5-17l8-18Z"/>',
    cap: '<path d="M12 35q-1-26 20-26t20 26Z"/><path d="M13 35q19 17 42 0H13Zm19-25v24"/>',
    beanie: '<path d="M13 39q0-30 19-30t19 30Z"/><path d="M10 39h44v12H10Zm12-24v22m10-25v25m10-22v22"/>',
    hat: '<path d="m19 35 6-23h14l6 23q25 4 12 13-25 12-50 0-13-9 12-13Z"/><path d="M20 30h24"/>',
    headscarf: '<path d="M32 6Q8 7 10 37L5 57h54l-5-20Q56 7 32 6Z"/><ellipse cx="32" cy="28" rx="13" ry="16"/><path d="m20 41 25 16M44 41 22 57"/>',
    studio: '<path d="M9 8h46v48H9Z"/><path d="M9 40q23-12 46 0M17 17h30"/>',
    garden: '<path d="M6 54h52M18 54V27m28 27V23"/><circle cx="18" cy="19" r="12"/><circle cx="46" cy="16" r="10"/><path d="m25 54 7-19 7 19"/>',
    city: '<path d="M8 56V19h16V8h18v20h14v28Zm7-30h3m-3 8h3m13-16h4m-4 8h4m-4 8h4m13 2h3M25 56V43h12v13"/>',
    beach: '<path d="M5 44q14-13 27 0t27 0M5 54q14-13 27 0t27 0M10 33 24 11l14 22Z"/><path d="M24 11v30"/><circle cx="48" cy="14" r="7"/>',
    forest: '<path d="M5 45 18 8l13 37Zm27-4L44 6l14 35ZM18 45v12m26-16v16"/>',
    room: '<path d="M7 8h50v48H7Zm8 8h15v16H15Z"/><path d="M7 44h50M39 56V37h12v19"/>',
    castle: '<path d="M8 56V16h7V8h8v8h7v16h6V16h7V8h8v8h6v40ZM26 56V44a6 6 0 0 1 12 0v12"/>',
    camera: '<path d="M7 19h13l5-8h14l5 8h13v35H7Z"/><circle cx="32" cy="36" r="12"/>',
    anime: '<path d="m11 28 3-15 10-7 22 4 8 20-9-9-13 7-12-9-9 9Z"/><path d="M15 27q0 29 17 30 17-1 17-30M21 34h7m8 0h7M28 46h8"/>',
    brush: '<path d="m26 38 20-31 10 7-24 28Z"/><path d="M26 38q-16-3-15 12l-6 7q29 4 27-15Z"/>',
    palette: '<path d="M32 6C-3 6-2 54 29 57q18 0 8-13-4-8 8-8 21 0 14-16Q51 6 32 6Z"/><circle cx="20" cy="20" r="3"/><circle cx="38" cy="17" r="3"/><circle cx="49" cy="27" r="3"/><circle cx="15" cy="36" r="3"/>',
    game: '<path d="m10 19 16 3h12l16-3 7 29q-2 12-14-1l-7-7H24l-7 7Q5 60 3 48Z"/><path d="M14 28v14m-7-7h14m23-4h2m3 9h2"/>',
    comic: '<path d="M6 8h52v40H31L17 58V48H6Z"/><path d="m17 19 6 8-6 8m14-16 6 8-6 8m14-16 6 8-6 8"/>',
    depth: '<path d="M8 8h48v48H8Z"/><circle cx="32" cy="30" r="13"/><path d="M8 48h48M14 14h6m24 0h6"/>',
    frame: '<path d="M8 21V8h13m22 0h13v13M8 43v13h13m22 0h13V43"/><circle cx="32" cy="24" r="7"/><path d="M21 48V39a11 11 0 0 1 22 0v9"/>',
    light: '<circle cx="32" cy="32" r="13"/><path d="M32 3v9m0 40v9M3 32h9m40 0h9M11 11l7 7m28 28 7 7m0-42-7 7M18 46l-7 7"/>',
    composition: '<path d="M7 10h50v44H7ZM24 10v44m16-44v44M7 25h50M7 40h50"/>',
    swatch: '<rect x="10" y="10" width="44" height="44" rx="14" fill="currentColor"/>',
};

const hair = {
    long_waves: '<path d="M16 25Q7 49 15 58l9-9m24-24q9 24 1 33l-9-9M15 25Q13 4 32 5q19-1 17 20L37 14 18 29"/>',
    straight: '<path d="M14 55V24Q14 5 32 5t18 19v31L40 45V24L32 15 23 24v21Z"/>',
    bob: '<path d="M13 45V24Q13 5 32 5t19 19v21H41V24L32 15 23 24v21Z"/>',
    pixie: '<path d="m13 30 2-17L31 5l17 6 5 18-12-9-10 5-8-9Z"/>',
    ponytail: '<path d="M14 29Q8 4 29 5q16-2 20 15 12 0 9 24l-10-4-2-18-12-8-10 14Z"/>',
    bun: '<circle cx="33" cy="8" r="7"/><path d="M14 29Q9 12 22 9h20q14 4 8 20L36 16 22 27Z"/>',
    braids: '<path d="M14 27Q10 5 32 5t18 22L36 16 23 28Z"/><path d="m16 29 4 5-6 5 6 5-6 5 4 8m30-28-4 5 6 5-6 5 6 5-4 8"/>',
    curls: '<path d="M14 35Q3 29 10 20q-4-12 8-13 6-11 15-4 10-5 15 4 12 1 9 13 9 8-1 17 6 14-7 17l-6-14M18 54Q4 49 14 35M16 27l14-12 18 13"/>',
    afro: '<path d="M15 36Q1 32 8 21 2 9 17 8 22-4 32 4 44-4 48 8q16 1 9 13 7 12-8 15L42 24H23Z"/>',
    buzz: '<path d="M14 28Q13 5 32 5t18 23l-9-9H23Z"/><path d="m21 13 2 2m7-5 2 2m7 1 2 2"/>',
    bald: '',
    crew_cut: '<path d="M14 27V18Q14 5 32 5t18 13v9l-9-11H23Z"/>',
    side_part: '<path d="M14 28V19Q14 5 32 5t18 14v9L35 13 16 25Z"/><path d="m35 7-5 13"/>',
    undercut: '<path d="M14 28V19L20 8 38 4 50 15v13L39 14 21 19Z"/><path d="M15 24h6m22 0h6"/>',
    slicked_back: '<path d="M14 29V19Q14 3 32 3t18 16v10l-8-14H22Z"/><path d="M24 15 22 7m10 7V5m8 10 2-8"/>',
};
Object.assign(hair, {
    french_bob: '<path d="M13 46V23Q13 5 32 5t19 18v23H42V22H22v24Z"/>',
    lob: '<path d="M12 56V25Q12 5 32 5t20 20v31H42V24L32 16 22 24v32Z"/>',
    bixie: '<path d="M13 33 11 22 18 9 33 5 49 13 53 34 40 20 26 26 22 17Z"/>',
    shag: '<path d="m15 22-5 28 8-5-3 13 12-11V26l5-11 6 11v21l12 11-3-13 8 5-5-28Q48 5 32 5T15 22Z"/>',
    curtain_bangs: hair.long_waves + '<path d="M32 10 22 29m10-19 10 19"/>',
    low_bun: '<circle cx="49" cy="44" r="10"/>' + hair.bob,
    fishtail: '<path d="M14 29Q10 5 32 5t18 24L34 15 22 27M47 27l7 6-9 5 9 5-9 5 7 5-7 7M45 27v28"/>',
    twin_braids: hair.braids + '<path d="M32 6v10m-17 18 4 3m-3 8 3 3m30-14-4 3m3 8-3 3"/>',
    coils: hair.curls + '<path d="M10 28q8-9 4-15m39 15q-8-9-4-15"/>',
    fade: hair.undercut,
    caesar: '<path d="M14 28V18Q14 5 32 5t18 13v10l-6-9H20Z"/><path d="M21 19h22"/>',
    pompadour: '<path d="M14 28V17Q10-1 35 3q22 2 15 25L40 15H23Z"/>',
    quiff: '<path d="M14 28V18L24 5 41 2 51 13 50 28 40 15 23 19Z"/>',
    faux_hawk: '<path d="M14 28 20 14 28 9 32 1 37 9 44 14 50 28 40 20H24Z"/>',
    curtains: '<path d="M13 35V24Q13 5 32 5t19 19v11L39 25 32 12 25 25Z"/>',
    man_bun: hair.bun,
    short_curls: hair.afro,
    locs: hair.straight + '<path d="M16 22v32m5-35v35m24-34v34m4-31v31"/>',
    cornrows: hair.buzz + '<path d="M20 23 25 9m2 13 3-15m5 15V8m6 16-2-15"/>',
});
const poses = {
    standing: 'M26 29 18 44m20-15 8 15M27 42l-5 17m15-17 5 17',
    contrapposto: 'M27 29 16 43m22-14 8 13M27 42l-3 17m13-17 9 17',
    hands_hips: 'M26 29 14 35l12 8m12-14 12 6-12 8M27 43l-5 16m15-16 5 16',
    walking: 'M26 29 16 38m22-9 10 7M27 42l-12 15m22-15 12 12',
    seated: 'M26 29 18 39m20-10 8 10M27 41l16 2v16m-6-18-17 4v14',
    arms_crossed: 'M26 29 17 36l21 2m0-9 9 7-21 2M27 42l-5 17m15-17 5 17',
    profile: 'M31 28 25 42m10-14 7 14M30 42l-2 17m7-17 4 17',
};

const garmentIcons = {
    shirt_dress: 'dress', wrap_dress: 'dress', a_line_dress: 'dress', pleated_dress: 'gown',
    turtleneck_dress: 'dress', ball_gown: 'gown', qipao: 'gown', pinafore: 'dress',
    coveralls: 'jumpsuit', flight_suit: 'jumpsuit', long_sleeve: 'sweater', turtleneck: 'sweater',
    sweatshirt: 'sweater', rugby_shirt: 'polo', athletic_top: 'shirt', tunic: 'button_shirt',
    vest_shirt: 'button_shirt', overshirt: 'button_shirt', peasant_blouse: 'blouse', bow_blouse: 'blouse', puff_sleeve: 'blouse',
    chinos: 'trousers', wide_leg: 'trousers', joggers: 'trousers', cargo_pants: 'trousers', track_pants: 'trousers',
    bermuda: 'shorts', pleated_skirt: 'long_skirt', pencil_skirt: 'skirt', a_line_skirt: 'long_skirt', culottes: 'shorts', leggings: 'trousers',
    bomber: 'jacket', denim_jacket: 'jacket', biker: 'jacket', trench: 'coat', parka: 'coat', puffer: 'jacket',
    cape: 'coat', robe: 'coat', varsity: 'jacket', suit_jacket: 'blazer', oxfords: 'loafers', chelsea: 'boots', combat: 'boots',
    running: 'sneakers', high_tops: 'sneakers', hiking: 'boots', ballet_flats: 'loafers', ankle_heels: 'heels',
    beret: 'cap', bucket: 'hat', fedora: 'hat', hood: 'headscarf', headband: 'cap',
};
const garmentFeatures = {
    shirt_dress: 'M32 21v32m-3-23h6m-6 9h6M25 31h14', wrap_dress: 'M23 16 39 32 25 49M26 31h13',
    a_line_dress: 'M27 31 19 51m18-20 8 20', pleated_dress: 'M27 32 18 54m13-22-2 23m7-23 10 22',
    turtleneck_dress: 'M27 6V2h10v4M24 22h16', ball_gown: 'M29 33Q16 39 12 56m23-23q13 6 17 23M27 30h10',
    qipao: 'M28 6V2h8v4m-2 9 6 8m-4-4 5-1M35 45l9 13', pinafore: 'M24 7v22h16V7M28 32h8v7h-8Z',
    coveralls: 'M32 15v18M24 20h5v6h-5Zm12 0h5v6h-5ZM24 32h16', flight_suit: 'M31 17v17m-8-13h6v6h-6Zm13 16h5v8h-5Z',
    long_sleeve: 'M12 46h7m26 0h7M25 17q7 4 14 0', turtleneck: 'M26 11V3h12v8',
    sweatshirt: 'M22 17h20M24 50h16M10 47h9m26 0h9', rugby_shirt: 'M20 32h24M22 42h20',
    athletic_top: 'M25 26 32 36 39 26M23 46h18', tunic: 'M23 47v12h18V47M28 20l4 9 4-9',
    vest_shirt: 'M23 17 32 34 41 17M32 34v17M23 43h5m8 0h5', overshirt: 'M19 25h8v9h-8Zm18 0h8v9h-8Z',
    peasant_blouse: 'M21 16q11 9 22 0M21 46h22m-22-26-4 19m26-19 4 19',
    bow_blouse: 'M32 20q-15-10-10 0l10 2q15-12 10-2l-10 2-5 14m5-14 6 14',
    puff_sleeve: 'M12 20q-9 4-5 17l11 1m34-18q9 4 5 17l-11 1', chinos: 'M21 20 27 26m16-6-6 6M27 30l-2 22m12-22 3 22',
    wide_leg: 'M24 22 17 57m16-31 14 31', joggers: 'M18 53h11m6 0h12M30 16l-3 8m7-8 3 8',
    cargo_pants: 'M18 29h9v12h-9Zm19 0h9v12h-9Z', track_pants: 'M22 17 20 53m22-36 3 36',
    bermuda: 'M15 43h14m6 0h14', pleated_skirt: 'M25 19 18 52m12-33-3 33m8-33 4 33m0-33 9 33',
    pencil_skirt: 'M23 12 20 51h24l-3-39M34 42v9', a_line_skirt: 'M24 19 16 53m24-34 8 34',
    culottes: 'M18 19 12 48h17l3-20 3 20h17l-6-29', leggings: 'M24 18 22 55m16-37 4 37',
    bomber: 'M22 48h20M11 49h7m28 0h7M28 11h8', denim_jacket: 'M18 24h10v9H18Zm18 0h10v9H36ZM22 49h20',
    biker: 'M40 15 25 53M20 38l7 2m10-12 8 2', trench: 'M22 37h20M29 34h6v6h-6ZM25 23h2m10 0h2',
    parka: 'M21 13Q19 1 32 2t11 11M20 41h8v10h-8Zm16 0h8v10h-8Z',
    puffer: 'M16 22h32M13 31h38M11 40h42M22 49h20', cape: 'M24 8 7 54h50L40 8M32 18v36',
    robe: 'M24 13 32 31 40 13M23 37h18M30 36l-7 17m11-17 6 17', varsity: 'M21 15v37m22-37v37M37 25l3 10 4-10',
    suit_jacket: 'M24 40h5m7 0h5M32 39h1m-1 8h1',
    oxfords: 'M20 32 30 36m-7 0 10 4M40 44l-3 9', chelsea: 'M21 19h11v17H21Z',
    combat: 'M22 17 31 23m-9 0 9 6m-9 0 9 6', running: 'M13 36 26 41 37 38M39 47l7-3',
    high_tops: 'M12 23V9h15v17M16 15h8m-8 5h8', hiking: 'M19 19 32 23m-13 0 13 4m-13 0 13 4M14 51l4 4h5l4-4h6l4 4h6l4-4',
    ballet_flats: 'M10 31q10 15 23 6M22 37l-5-5m5 5 6-5', ankle_heels: 'M16 28V12h17v20',
    beret: 'M11 31q-6-18 16-23 24-5 28 15L41 35H13Zm22-23 4-5',
    bucket: 'M19 30h26M17 35l-7 12m37-12 7 12', fedora: 'M24 13q8 6 16 0M20 31h24',
    hood: 'M17 23q15-22 30 0M24 46l8 12 8-12', headband: 'M15 21q17-12 34 0M16 27q16-12 32 0',
};
for (const [name, base] of Object.entries(garmentIcons)) paths[name] = paths[base] + `<path d="${garmentFeatures[name]}"/>`;
Object.assign(paths, {
    heritage: '<circle cx="32" cy="32" r="23"/><path d="M9 32h46M32 9q-20 23 0 46 20-23 0-46ZM14 19h36M14 45h36"/>',
    smile: '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="M22 25h3m14 0h3M22 37q10 13 20 0"/>',
    neutral: '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="M22 25h3m14 0h3M24 41h16"/>',
    thoughtful: '<ellipse cx="32" cy="28" rx="20" ry="23"/><path d="m20 21 7-2m11 0 7 2M24 28h2m12 0h2M26 39h12M40 55 30 43l-8 3"/>',
    determined: '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="m20 21 8 3m8 0 8-3M22 29h4m12 0h4M25 42h14"/>',
    laughing: '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="M20 26q4-6 8 0m8 0q4-6 8 0M22 37h20q-10 21-20 0Z"/>',
    surprised: '<ellipse cx="32" cy="30" rx="20" ry="24"/><circle cx="24" cy="26" r="3"/><circle cx="40" cy="26" r="3"/><ellipse cx="32" cy="41" rx="5" ry="7"/>',
    cafe: '<path d="M7 51h50M14 51V36h26v15M17 16h23v13H17Zm23 2q14 0 0 9M22 5v6m8-6v6"/>',
    library: '<path d="M7 7h50v50H7Zm0 23h50M7 41h50M15 10v11m7-11v11m8-11 4 11m9-11v11M15 27v11m7-11v11m8-11v11m10-11 4 11"/>',
    mountains: '<path d="m4 54 20-40 13 23 8-16 15 33ZM17 28l7 5 6-9M39 33l6 3 5-4"/>',
    desert: '<circle cx="45" cy="15" r="8"/><path d="M4 45q22-28 43 0m-43 7q29-20 56-4M4 59h56"/>',
    snow: '<path d="M32 7v50M10 19l44 26M10 45l44-26M26 12l6 7 6-7m-12 40 6-7 6 7M12 27l9-1-3-9m28 30-3-9 9-1M12 37l9 1-3 9m28-30-3 9 9 1"/>',
    rooftop: '<path d="M7 41h50v16H7ZM10 41V16h12v25m5 0V7h15v34m6 0V24h8v17M8 47h48"/>',
    workshop: '<path d="M7 40h50M12 40v17m40-17v17M17 8v22m-7-16h14M40 7l-8 8 13 17 7-7-13-17Z"/>',
    palace: '<path d="M7 56h50M11 52V21h8v31m26 0V21h8v31M7 21 32 6l25 15ZM25 52V36q7-13 14 0v16"/>',
    scifi: '<path d="M6 6h52v52H6ZM6 6l16 13h20L58 6M6 58l16-13h20l16 13M22 19v26m20-26v26M10 24h7m-7 8h7m30-8h7m-7 8h7"/>',
    market: '<path d="M8 27 14 9h36l6 18ZM11 27v29h42V27M17 9v18m10-18v18m10-18v18m10-18v18M9 42h46M20 56V45h11v11"/>',
    ink: '<path d="m12 47 27-36 15-5-3 16-27 34Z"/><path d="m25 39 13-17 6 5-13 17Zm14-28 12 11M8 58h48"/>',
    pencil: '<path d="m9 44 31-34 13 13-31 34-15 3Zm31-34 5-5 13 13-5 5M9 44l13 13M15 51l31-34"/>',
    pixel: '<path d="M16 8h32v8h8v32h-8v8H16v-8H8V16h8Zm8 16v8h8v-8Zm16 0v8h8v-8ZM24 40v8h16v-8Z"/>',
    clay: '<path d="m32 7 23 13v26L32 59 9 46V20Zm0 26L9 20m23 13 23-13M32 33v26"/>',
    fashion: '<path d="M27 6h10l-3 12 7 13 13 26H10l13-26 7-13ZM23 31h18M7 9l10 10m-10 0L17 9"/>',
});

Object.assign(paths, {
    expression_serious: '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="M20 22h9m6 0h9M23 28h3m12 0h3M25 42q7-4 14 0"/>',
    expression_joyful: '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="M20 27q4-5 8 0m8 0q4-5 8 0M23 37q9 14 18 0ZM16 34h3m26 0h3"/>',
    body_average: '<path d="M25 7h14v11l8 12-5 27H22l-5-27 8-12Z"/>',
    body_slender: '<path d="M27 7h10v12l7 10-7 28H27l-7-28 7-10Z"/>',
    body_athletic: '<path d="M25 7h14v11l12 8-11 31H24L13 26l12-8Z"/><path d="M23 32h18M25 43h14"/>',
    body_broad: '<path d="M24 7h16v11l16 10-10 29H18L8 28l16-10Z"/>',
    body_curvy: '<path d="M25 7h14v11l8 8-7 12q14 9 8 19H16q-6-10 8-19l-7-12 8-8Z"/>',
    body_full: '<path d="M24 7h16v12q20 13 11 38H13q-9-25 11-38Z"/>',
    muscle_natural: paths.muscle,
    muscle_soft: '<path d="m12 48 7-24 8-7 8 7-7 9 2 8q13-10 23 1v10q-20 8-41-4Z"/>',
    muscle_toned: paths.muscle + '<path d="M33 44q7-7 14-2"/>',
    muscle_defined: paths.muscle + '<path d="M32 46q7-12 17-6M19 39l6 2"/>',
    muscle_muscular: '<path d="m7 48 8-25 11-11 13 10-8 12 1 7q18-23 27-1v14Q30 66 7 48Z"/><path d="M32 46q10-12 20-5M17 37l8 5"/>',
    scene_soft: '<rect x="8" y="8" width="48" height="48" rx="5" stroke-dasharray="3 6"/><circle cx="32" cy="30" r="11"/><path d="M21 48q11-12 22 0"/>',
    scene_sharp: '<path d="M8 8h48v48H8ZM12 42l9-14 9 14 10-20 12 20M12 49h40"/>',
    scene_minimal: '<path d="M8 8h48v48H8Z"/><circle cx="32" cy="29" r="7"/><path d="M24 45q8-10 16 0"/>',
    lighting_softbox: '<path d="m19 7 25 7-7 28-25-7ZM25 39v18m-10 0h20M44 24l12 7m-15 4 10 9"/>',
    lighting_daylight: paths.light,
    lighting_golden: '<path d="M7 47h50M18 43a14 14 0 0 1 28 0M32 7v12M8 23l10 8m28 0 10-8M11 55h42"/>',
    lighting_overcast: '<path d="M15 37Q1 29 13 20q1-12 13-10 12-9 20 5 17-1 13 14-1 8-12 8ZM15 46h2m13 0h2m13 0h2M22 54h2m13 0h2"/>',
    lighting_rim: '<path d="M35 7q20 0 20 23T35 55M28 13q-13 0-13 17t13 17M36 15v30"/>',
    lighting_window: '<path d="M8 6h30v36H8Zm15 0v36M8 24h30M38 24l19 12M38 42l17 15M23 42l18 15"/>',
    lighting_neon: '<path d="M9 8h9v48H9Zm37 0h9v48h-9ZM23 22l8 10-8 10m18-20-8 10 8 10"/>',
    lighting_candle: '<path d="M24 28h16v29H24Zm8-23q16 17 0 21-13-5 0-21ZM17 57h30M32 28v7M8 18l7 3m34 0 7-3"/>',
    framing_full_body: '<path d="M9 5h46v54H9Z"/><circle cx="32" cy="16" r="5"/><path d="M24 26h16l-2 13h-4v15m-4-15v15M24 26l-5 12m21-12 5 12"/>',
    framing_three_quarter: '<path d="M9 5h46v48H9ZM9 58h46" stroke-dasharray="3 3"/><circle cx="32" cy="16" r="5"/><path d="M24 26h16l-2 13h-4v14m-4-14v14M24 26l-5 12m21-12 5 12"/>',
    framing_waist_up: '<path d="M7 7h50v47H7Z"/><circle cx="32" cy="22" r="8"/><path d="M18 53V42q14-16 28 0v11M7 54h50"/>',
    framing_portrait: '<path d="M7 7h50v47H7Z"/><ellipse cx="32" cy="28" rx="12" ry="16"/><path d="M16 54v-6q16-11 32 0v6"/>',
    composition_balanced: '<path d="M7 10h50v44H7ZM32 10v44M7 32h50"/><circle cx="32" cy="32" r="8"/>',
    composition_editorial: '<path d="M7 10h50v44H7ZM39 10v44M7 40h50"/><circle cx="39" cy="26" r="7"/><path d="M12 17h14m-14 7h10"/>',
    composition_dramatic: '<path d="M7 10h50v44H7ZM7 54 57 10M34 10l23 23"/><circle cx="24" cy="29" r="7"/>',
    composition_dynamic: '<path d="M7 10h50v44H7ZM12 46l38-28m-12 0h12v12M12 20h12m-12 6h7"/><circle cx="25" cy="38" r="6"/>',
    bust_small: '<path d="M21 9h22l7 19-7 27H21l-7-27Z"/><path d="M22 29q5 3 10 0 5 3 10 0"/>',
    bust_medium: '<path d="M21 9h22l7 19-7 27H21l-7-27Z"/><path d="M21 28q5 9 11 0 6 9 11 0"/>',
    bust_full: '<path d="M21 9h22l7 19-7 27H21l-7-27Z"/><path d="M18 27q7 15 14 0 7 15 14 0"/>',
});

Object.assign(hair, {
    hair_tidy: hair.side_part + '<path d="M20 14h6m10-1h7"/>',
    hair_messy: '<path d="m13 29 3-13-6-3 15-3 2-7 9 6 15-3-5 9 9 7-11-1-4 7-10-8-7 9Z"/>',
    hair_tousled: hair.pixie + '<path d="m20 8-5-3m23 3 6-5M24 18l7-7"/>',
    hair_windblown: '<path d="M13 30Q12 8 32 6L56 2 45 13 60 12 47 21 53 27 38 25 31 17 20 29Z"/>',
    hair_sleek: hair.slicked_back + '<path d="M18 21q14-12 28 0"/>',
    hair_wet: hair.slicked_back + '<path d="m20 16 3 9m8-11 1 9m10-7-2 10M55 36q-6 9 0 9 6 0 0-9Z"/>',
    hair_flyaways: hair.bob + '<path d="M14 13 7 9m10 0-3-6m35 11 8-5m-9 0 3-6"/>',
    hair_flat: hair.buzz,
    hair_airy: hair.long_waves + '<path d="M4 40h6m44 0h6M7 49h4m42 0h4"/>',
    hair_volume: hair.curls + '<path d="M5 14 2 7m56 7 4-7M32 2V0"/>',
});
const gloveIcon = '<path d="M20 56V35L11 25q-4-7 2-8l9 9V11q0-7 6-4v20V6q3-6 6-1v22V9q3-6 6-1v21V17q6-4 6 3v24l-8 12Z"/>';
Object.assign(paths, {
    eyes: '<path d="M5 32q12-20 24 0-12 20-24 0Zm30 0q12-20 24 0-12 20-24 0Z"/><circle cx="17" cy="32" r="5"/><circle cx="47" cy="32" r="5"/>',
    eye_almond: '<path d="M7 32q25-28 50 0-25 28-50 0Z"/><circle cx="32" cy="32" r="10"/>',
    eye_round: '<ellipse cx="32" cy="32" rx="25" ry="19"/><circle cx="32" cy="32" r="12"/>',
    eye_hooded: '<path d="M6 33q26-23 52 0-26 27-52 0Zm0-9q26-22 52 0"/><path d="M22 28a11 11 0 1 0 20 0"/>',
    eye_monolid: '<path d="M7 33q25-25 50 0-25 22-50 0Z"/><circle cx="32" cy="32" r="9"/>',
    eye_upturned: '<path d="M7 39q20-28 50-20-18 37-50 20Z"/><circle cx="32" cy="30" r="10"/>',
    eye_downturned: '<path d="M7 20q29-9 50 20-32 13-50-20Z"/><circle cx="32" cy="30" r="10"/>',
    brows_natural: '<path d="M7 26q11-9 21-1m8 0q10-8 21 1M9 38q10-8 19 0m8 0q9-8 19 0"/>',
    brows_straight: '<path d="M7 25h21m8 0h21M9 38q10-8 19 0m8 0q9-8 19 0"/>',
    brows_arched: '<path d="m7 28 13-9 8 6m8 0 8-6 13 9M9 39q10-8 19 0m8 0q9-8 19 0"/>',
    brows_thick: '<path d="m7 28 3-7 18 1v7Zm29 1v-7l18-1 3 7ZM9 40q10-8 19 0m8 0q9-8 19 0"/>',
    brows_fine: '<path d="M7 26q11-5 21 0m8 0q10-5 21 0M9 38q10-8 19 0m8 0q9-8 19 0"/>',
    lips_balanced: '<path d="m7 32 16-9 9 3 9-3 16 9q-25 25-50 0ZM7 32q25 5 50 0"/>',
    lips_full: '<path d="m7 31 15-15 10 5 10-5 15 15q-25 35-50 0ZM7 31q25 6 50 0"/>',
    lips_thin: '<path d="m7 32 17-4 8 2 8-2 17 4q-25 12-50 0ZM7 32h50"/>',
    lips_cupid: '<path d="M7 32 23 19l9 9 9-9 16 13q-25 23-50 0ZM7 32q25 4 50 0"/>',
    lips_wide: '<path d="m3 32 20-8 9 3 9-3 20 8q-29 22-58 0ZM3 32q29 5 58 0"/>',
    lipstick: '<path d="M19 59V30h25v29ZM23 30V12l17-8v26M19 47h25"/>',
    lip_gloss: '<path d="M12 59V31h18v28Zm35-30V8h5v21m-8 0h11v9H44ZM15 39h12"/>',
    lip_stain: '<path d="M22 59V27h20v32ZM25 27V10h14v17M22 42h20M48 10l7 7m0-7-7 7"/>',
    lip_ombre: '<path d="m7 32 16-9 9 3 9-3 16 9q-25 25-50 0ZM7 32q25 5 50 0M22 36h20m-15 5h10"/>',
    makeup_natural: '<ellipse cx="29" cy="29" rx="17" ry="23"/><path d="M20 27h3m12 0h3m-14 13q5 3 10 0M50 31l7-7m-7 0 7 7"/>',
    makeup_soft_glam: '<ellipse cx="29" cy="29" rx="17" ry="23"/><path d="M18 25q5-4 10 0m3 0q5-4 10 0M21 34h4m9 0h4M24 41h11M51 8v12m-6-6h12"/>',
    makeup_glam: '<ellipse cx="29" cy="29" rx="17" ry="23"/><path d="m17 23 10 3m5 0 10-3M20 33l5 3m13-3-5 3m-9 7h11M50 7l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
    makeup_smoky: '<ellipse cx="29" cy="29" rx="17" ry="23"/><ellipse cx="22" cy="26" rx="7" ry="5"/><ellipse cx="36" cy="26" rx="7" ry="5"/><path d="M24 41h10"/>',
    makeup_editorial: '<ellipse cx="29" cy="29" rx="17" ry="23"/><path d="m14 19 13 9-8-1m25-8-13 9 8-1M24 41l10 3M51 10v15m-7-7h14"/>',
    liner_fine: '<path d="M7 33q25-24 50 0M13 36q19 17 38 0"/>',
    liner_winged: '<path d="M7 33q22-25 44-4l9-13-3 19M13 36q19 17 38 0"/>',
    liner_bold: '<path d="M7 33q25-24 50 0-25-35-50 0ZM13 36q19 17 38 0"/>',
    liner_graphic: '<path d="M7 35q25-24 50 0M10 22q22-21 44 0l6-10M13 39q19 17 38 0"/>',
    ear_studs: '<path d="M22 45Q2 20 24 9q24-4 19 18l-11 19q-6 15-15 4M22 21q15-9 11 7l-8 9"/><circle cx="25" cy="46" r="4"/>',
    ear_hoops: '<circle cx="21" cy="35" r="15"/><circle cx="44" cy="35" r="15"/><path d="M21 20v-7m23 7v-7"/>',
    ear_drops: '<circle cx="20" cy="14" r="4"/><circle cx="44" cy="14" r="4"/><path d="M20 18v15m24-15v15M20 33q-17 23 0 23 17 0 0-23Zm24 0q-17 23 0 23 17 0 0-23Z"/>',
    ear_cuffs: '<path d="M22 45Q2 20 24 9q24-4 19 18l-11 19q-6 15-15 4M12 22l11-4m-9 14 11-4m-7 14 10-4"/>',
    ear_pearls: '<circle cx="20" cy="32" r="10"/><circle cx="45" cy="32" r="10"/><path d="M16 28h2m23 0h2"/>',
    neck_chain: '<path d="M10 10v12q22 35 44 0V10M15 26l4-2m4 11 4-3m10 3 3-4m5-6 4 2"/>',
    neck_pendant: '<path d="M10 10q0 27 22 31 22-4 22-31M32 41l-8 8 8 10 8-10Z"/>',
    neck_choker: '<path d="M9 20q23 14 46 0v12q-23 14-46 0Z"/>',
    neck_pearls: '<path d="M9 10q0 38 23 42 23-4 23-42"/><circle cx="12" cy="28" r="4"/><circle cx="20" cy="43" r="4"/><circle cx="32" cy="51" r="4"/><circle cx="44" cy="43" r="4"/><circle cx="52" cy="28" r="4"/>',
    neck_layered: '<path d="M9 9q0 29 23 35 23-6 23-35M9 19q0 29 23 35 23-6 23-35"/>',
    piercing_nostril: '<path d="m29 9-6 27 15 3M16 49q16 8 32 0"/><circle cx="36" cy="35" r="3"/>',
    piercing_ring: '<path d="m29 9-6 27 15 3M16 49q16 8 32 0"/><circle cx="39" cy="38" r="6"/>',
    piercing_septum: '<path d="m29 9-6 27h18M16 52q16 8 32 0"/><path d="M27 36v8q5 7 10 0v-8"/>',
    piercing_brow: '<path d="M9 24q23-18 46 0M12 40q20-20 40 0M44 11l4 12"/><circle cx="44" cy="11" r="3"/><circle cx="48" cy="23" r="3"/>',
    piercing_lip: '<path d="m7 28 16-9 9 3 9-3 16 9q-25 25-50 0ZM7 28h50"/><circle cx="32" cy="50" r="3"/>',
    piercing_paired: '<path d="m7 28 16-9 9 3 9-3 16 9q-25 25-50 0ZM7 28h50"/><circle cx="22" cy="49" r="3"/><circle cx="42" cy="49" r="3"/>',
    mole_left_cheek: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M23 27h2m14 0h2M27 41h10"/><circle cx="42" cy="36" r="2.5" fill="currentColor"/>',
    mole_right_cheek: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M23 27h2m14 0h2M27 41h10"/><circle cx="22" cy="36" r="2.5" fill="currentColor"/>',
    mole_upper_lip: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M23 27h2m14 0h2M27 41h10"/><circle cx="38" cy="37" r="2.5" fill="currentColor"/>',
    mole_under_eye: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M23 27h2m14 0h2M27 41h10"/><circle cx="40" cy="32" r="2.5" fill="currentColor"/>',
    freckles_sparse: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M25 32h1m5 1h1m4-2h1M27 42h10"/>',
    freckles_light: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M21 32h1m5 2h1m4-3h1m4 3h1m4-3h1M27 42h10"/>',
    freckles_dense: '<ellipse cx="32" cy="30" rx="19" ry="24"/><path d="M19 32h1m4 3h1m2-6h1m4 4h1m3-4h1m2 6h1m4-3h1m-23 5h1m7 0h1m8 0h1M27 44h10"/>',
    glasses_round: '<circle cx="17" cy="32" r="12"/><circle cx="47" cy="32" r="12"/><path d="M29 31h6M5 27 2 22m57 5 3-5"/>',
    glasses_rect: '<path d="M5 21h24v20H5Zm30 0h24v20H35ZM29 29h6M5 24 2 19m57 5 3-5"/>',
    glasses_cat: '<path d="m4 18 25 8v14H10Zm56 0-25 8v14h19ZM29 29h6"/>',
    glasses_aviator: '<path d="M5 23q25-10 24 8-2 24-18 12L5 23Zm54 0q-25-10-24 8 2 24 18 12l6-20ZM29 25h6m-8-7h10"/>',
    glasses_sun: '<path d="M5 21h24v20H5Zm30 0h24v20H35ZM29 29h6M10 26l14 10m16-10 14 10"/>',
    glasses_monocle: '<circle cx="25" cy="27" r="17"/><path d="M39 38q18 2 12 22"/>',
    gloves_leather: gloveIcon + '<path d="M20 49h20M26 32v10m7-10v10m7-10v10"/>',
    gloves_knit: gloveIcon + '<path d="M20 48h21m-21 5h19M25 33l5 5-5 5m8-10 5 5-5 5"/>',
    gloves_fingerless: '<path d="M20 56V35L11 25l5-5 10 13V24h20v20l-8 12Z"/><path d="M27 27v-8m7 8v-8m6 8v-8"/>',
    gloves_long: gloveIcon + '<path d="M20 54v8h18v-8M21 48h19"/>',
    gloves_lace: gloveIcon + '<path d="m23 34 4 4-4 4 4 4m7-12 4 4-4 4 4 4M21 50h20"/>',
    gloves_work: gloveIcon + '<path d="M27 34h13v11H27ZM20 50h21"/>',
    gloves_sport: gloveIcon + '<path d="M24 33h17v9H24ZM21 49h18v7H21Z"/>',
    gloves_gauntlets: gloveIcon + '<path d="M17 47h26l3 14H14Z"/><path d="M22 50v8m7-8v8m7-8v8"/>',
});

export const iconNames = Object.freeze([...Object.keys(paths), ...Object.keys(hair), ...Object.keys(poses)]);

export function icon(name, color = '#bca9e8') {
    const ink = /^#[0-9a-f]{6}$/i.test(color) ? color : '#bca9e8';
    let drawing = paths[name] ?? paths.person;
    if (poses[name]) drawing = `<circle cx="32" cy="13" r="7"/><path d="M26 25h12v18H26Z${poses[name]}"/>`;
    const strokes = (shape) => `<g data-icon-outline="true" stroke="#eee8f7" stroke-width="5">${shape}</g><g data-icon-ink="true" stroke="currentColor" stroke-width="2.5">${shape}</g>`;
    let contents = strokes(drawing);
    if (Object.hasOwn(hair, name)) {
        contents = '<ellipse data-icon-face="true" cx="32" cy="31" rx="17" ry="23" fill="#d6d9df" stroke="#777180" stroke-width="2"/><path d="M25 32h1m12 0h1M28 43q4 3 8 0" stroke="#444151" stroke-width="2"/>' + strokes(hair[name]);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" style="color:${ink}" fill="none" stroke-linecap="round" stroke-linejoin="round">${contents}</svg>`;
}

const previewShirt = '<path d="M68 77 58 80 51 103 62 108 64 97 62 142H98L96 97 98 108 109 103 102 80 92 77Q80 91 68 77Z"/>';
const previewSleeves = '<path d="M68 77 58 80 43 139 51 143 64 97 62 142H98L96 97 109 143 117 139 102 80 92 77Q80 91 68 77Z"/>';
const previewTrousers = '<path d="M62 138H98L96 176 93 252H81L80 180 79 252H67L64 176Z"/><path d="M63 146H97M80 146V175" fill="none"/>';
const previewSkirt = '<path d="M62 138H98L109 187H51Z"/><path d="M62 146H98M66 153 59 181M94 153 101 181" fill="none"/>';
const previewJacket = '<path d="M68 77 58 80 43 139 51 143 64 97 61 150H76L75 95ZM92 77 102 80 117 139 109 143 96 97 99 150H84L85 95Z"/><path d="M68 79 77 98 70 108M92 79 83 98 90 108" fill="none"/>';
const previewGarments = {
    shirt: previewShirt,
    polo: previewShirt + '<path d="M68 77 75 94 80 86 85 94 92 77M80 86V105" fill="none"/>',
    henley: previewShirt + '<path d="M80 85V111M77 94H83M77 104H83" fill="none"/>',
    cargo_shorts: '<path d="M62 138H98L99 185H83L80 162 77 185H61Z"/><path d="M63 146H97M61 158H72V174H61ZM88 158H99V174H88Z" fill="none"/>',
    loafers: '<path d="M65 251H78V257L84 261V266H62V258Z"/><path d="M65 256H78M63 263H83" fill="none"/>',
    overalls: previewTrousers + previewShirt + '<path d="M68 78H73V111H87V78H92V138H68Z"/><path d="M73 115H87V129H73Z" fill="none"/>',
    button_shirt: previewSleeves + '<path d="M68 77 80 93 92 77M80 93V142M77 105H83M77 118H83M77 131H83" fill="none"/>',
    blouse: previewSleeves + '<path d="M68 77 80 103 92 77M63 136H97" fill="none"/>',
    sweater: previewSleeves + '<path d="M68 78Q80 99 92 78M63 136H97" fill="none"/>',
    hoodie: '<path d="M64 80Q57 65 68 63H92Q103 65 96 80Z"/>' + previewSleeves + '<path d="M69 122H91V135H69Z" fill="none"/>',
    tank: '<path d="M68 77H73Q80 92 87 77H92L91 89 97 100 96 142H64L63 100 69 89Z"/>',
    trousers: previewTrousers,
    shorts: '<path d="M62 138H98L99 180H83L80 162 77 180H61Z"/><path d="M63 146H97" fill="none"/>',
    skirt: previewSkirt,
    long_skirt: '<path d="M62 138H98L112 250H48Z"/><path d="M63 146H97M68 157 60 243M92 157 100 243" fill="none"/>',
    dress: '<path d="M68 77H73Q80 90 87 77H92L97 100 94 138 111 218H49L66 138 63 100Z"/><path d="M66 140H94" fill="none"/>',
    gown: '<path d="M66 80 80 93 94 80 97 105 94 138 119 252H41L66 138 63 105Z"/><path d="M66 140H94" fill="none"/>',
    jumpsuit: previewTrousers + previewShirt + '<path d="M63 140H97" fill="none"/>',
    jacket: previewJacket,
    blazer: previewJacket + '<path d="M65 130H73M87 130H95" fill="none"/>',
    cardigan: previewJacket,
    coat: '<path d="M68 77 58 80 43 139 51 143 64 97 54 215H73L76 95ZM92 77 102 80 117 139 109 143 96 97 106 215H87L84 95Z"/>',
    sneakers: '<path d="M65 249H78V256L84 261V266H62V258Z"/><path d="M63 263H83" fill="none"/>',
    boots: '<path d="M65 229H78V255L84 261V266H62V258Z"/><path d="M65 237H78" fill="none"/>',
    heels: '<path d="M65 250 76 257 78 251 84 261V266H74L67 258 66 266H62V257Z"/>',
    sandals: '<path d="M65 253H78L84 260V265H62V259Z"/><path d="M66 254 77 263M74 255 68 263" fill="none"/>',
    cap: '<path d="M55 33Q55 8 80 8T105 33Z"/><path d="M55 33Q79 45 109 33Z"/>',
    beanie: '<path d="M55 35Q55 5 80 5T105 35Z"/><path d="M54 29H106V39H54Z"/>',
    hat: '<path d="M58 27 65 6H95L102 27Q130 32 111 39H49Q30 32 58 27Z"/>',
    gloves_leather: '<path d="M44 133 52 135 52 148 47 152 41 146Z"/>',
    gloves_knit: '<path d="M44 133 52 135 52 148 47 152 41 146Z"/><path d="m43 138 8 2m-9 2 8 2" fill="none"/>',
    gloves_fingerless: '<path d="M44 133 52 135 51 145 43 144Z"/>',
    gloves_long: '<path d="M48 115 56 117 52 148 47 152 41 146Z"/>',
    gloves_lace: '<path d="M44 133 52 135 52 148 47 152 41 146Z"/><path d="m44 138 4 3-5 3m5-6 3 3-3 4" fill="none"/>',
    gloves_work: '<path d="M43 132 53 135 53 148 47 153 40 146Z"/><path d="M43 136h7v9h-7Z" fill="none"/>',
    gloves_sport: '<path d="M43 132 53 135 53 148 47 153 40 146Z"/><path d="m43 136 8 2m-9 3 8 2" fill="none"/>',
    gloves_gauntlets: '<path d="M43 131 54 134 52 148 47 153 40 146Z"/><path d="M43 123 55 127 53 138 40 134Z"/>',
    headscarf: '<path d="M80 6Q47 6 49 49L43 86H64L69 71Q47 57 58 28L80 17 102 28Q113 57 91 71L96 86H117L111 49Q113 6 80 6Z"/>',
};

export function characterPreview(settings, fields) {
    const selected = (key) => ({ ...fields[key]?.options.find((option) => option.id === settings[key]), ...fields[key]?.option_details?.[settings[key]] });
    const skin = settings.colors?.skin_tone ?? selected('skin_tone')?.color ?? '#bd8663';
    const hairColor = settings.colors?.hair_color ?? selected('hair_color')?.color ?? '#65432b';
    const safeSkin = /^#[0-9a-f]{6}$/i.test(skin) ? skin : '#bd8663';
    const safeHair = /^#[0-9a-f]{6}$/i.test(hairColor) ? hairColor : '#65432b';
    const outfit = settings.wardrobe_mode === 'dress' ? ['dress'] : ['upper_garment', 'lower_garment'];
    const layers = [...outfit, 'outerwear', 'shoes', 'headwear', 'gloves'].map((key) => {
        if (settings[key] === 'none') return '';
        const shape = previewGarments[selected(key)?.icon] ?? previewGarments[garmentIcons[selected(key)?.icon]];
        const color = settings.colors?.[key] ?? selected(key)?.color;
        const fill = /^#[0-9a-f]{6}$/i.test(color) ? color : '#333746';
        if (!shape) return '';
        const drawing = key === 'shoes'
            ? `<g data-foot="left" transform="translate(144 0) scale(-1 1)">${shape}</g><g data-foot="right" transform="translate(18 0)">${shape}</g>` : key === 'gloves' ? `<g data-hand="left">${shape}</g><g data-hand="right" transform="translate(160 0) scale(-1 1)">${shape}</g>` : shape;
        const depth = settings.gender === 'woman' && ['upper_garment', 'dress'].includes(key)
            ? { small: 2, medium: 5, full: 9 }[settings.bust_size] : 0;
        const chest = depth ? `<path data-breast-size="${settings.bust_size}" d="M66 109q7 ${depth} 14 0q7 ${depth} 14 0" fill="none" stroke-opacity=".65"/>` : '';
        const accents = Object.entries(settings.clothing?.[key]?.details ?? {}).filter(([id, value]) =>
            selected(key)?.details?.includes(id) && /^#[0-9a-f]{6}$/i.test(value));
        const detailPaths = {
            piping: 'M65 82 65 137H95L95 82', embroidery: 'M72 104q8-16 16 0-16 8-16 0m8-8v18',
            buttons: 'M80 100h1m-1 13h1m-1 13h1', stitching: 'M64 141H96M67 151V174M93 151V174',
            trim: 'M64 136H96M68 80Q80 92 92 80', belt: 'M64 143H96M77 140H83V146H77Z',
            pockets: 'M65 113H74V127H65ZM86 113H95V127H86Z', stripes: 'M69 90V134M77 94V134M85 94V134M93 90V134',
            checks: 'M68 92H92M65 107H95M65 122H95M71 86V134M86 89V134',
            laces: 'M65 256 77 259m-12 0 12-3M83 256 95 259m-12 0 12-3',
            buckle: 'M65 255H74V261H65ZM85 255H94V261H85Z', ribbon: 'M57 30H103',
            applique: 'M80 100 87 110 80 120 73 110Z',
        };
        const clip = `garment-${key}`;
        const details = accents.map(([id, value]) => `<path data-detail="${id}" d="${detailPaths[id]}" fill="none" stroke="${value}" stroke-width="2.5" clip-path="url(#${clip})"/>`).join('');
        return `<g data-garment="${key}" fill="${fill}" stroke="#c8c1e1" stroke-width="1.5" stroke-linejoin="round">${drawing}${chest}<defs><clipPath id="${clip}">${drawing.replace(/ data-(?:foot|hand)="[^"]*"/g, '')}</clipPath></defs>${details}</g>`;
    }).join('');
    const style = settings.hair_style;
    const hairShape = hair[style] ?? hair[selected('hair_style')?.icon] ?? hair.long_waves;
    const short = ['bald', 'buzz', 'crew_cut', 'side_part', 'undercut', 'slicked_back', 'pixie', 'bixie', 'fade', 'caesar', 'pompadour', 'quiff', 'faux_hawk', 'cornrows'].includes(style);
    const fringe = ['curls', 'coils', 'afro', 'short_curls'].includes(style)
        ? '<path d="M14 27q-5-8 2-12-1-8 9-8 5-7 12-1 11-3 13 8 7 6 0 13L43 19q-6 5-11-1-5 5-10 1Z"/>'
        : ['french_bob', 'caesar'].includes(style)
            ? '<path d="M14 27V19Q14 5 32 5T50 19v8L44 19H20Z"/>'
            : short ? hairShape
                : '<path d="M14 28V23Q13 5 32 5T50 23v5L43 21 33 12 22 24Z"/>';
    const hairGroup = (layer, drawing) => `<g data-hair-layer="${layer}" transform="translate(35 3) scale(1.4)" fill="${safeHair}" stroke="${safeHair}" stroke-width="2">${drawing}</g>`;
    const backHair = hairGroup('back', short ? '' : hairShape);
    const frontHair = hairGroup('front', style === 'bald' ? '' : fringe);
    const ink = (key, fallback) => {
        const value = settings.colors?.[key] ?? selected(key).color;
        return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    };
    const faceLayers = [];
    if (settings.eye_color && settings.eye_color !== 'none') faceLayers.push(`<g data-face-detail="eye_color" fill="${ink('eye_color', '#65432b')}"><circle cx="71" cy="48" r="2"/><circle cx="89" cy="48" r="2"/></g>`);
    if (settings.lip_makeup && settings.lip_makeup !== 'none') faceLayers.push(`<path data-face-detail="lip_makeup" d="M74 59q6-3 12 0-6 6-12 0Z" fill="${ink('lip_makeup', '#b34e62')}"/>`);
    if (settings.eyebrows && settings.eyebrows !== 'none') faceLayers.push(`<path data-face-detail="eyebrows" d="M67 43q4-3 8-1m10 0q4-2 8 1" stroke="${safeHair}" stroke-width="${settings.eyebrows === 'thick' ? 2.5 : 1}" fill="none"/>`);
    if (settings.moles && settings.moles !== 'none') {
        const point = { left_cheek: [91, 56], right_cheek: [69, 56], upper_lip: [85, 57], under_eye: [90, 52] }[settings.moles];
        if (point) faceLayers.push(`<circle data-face-detail="moles" cx="${point[0]}" cy="${point[1]}" r="1" fill="#5d3f35"/>`);
    }
    if (settings.freckles && settings.freckles !== 'none') {
        const spots = { sparse: 'M77 53h.1m5 0h.1', light: 'M70 53h.1m6 2h.1m5-2h.1m6 2h.1', dense: 'M67 52h.1m4 3h.1m4-3h.1m3 4h.1m3-4h.1m3 3h.1m5-3h.1m3 4h.1' }[settings.freckles];
        if (spots) faceLayers.push(`<path data-face-detail="freckles" d="${spots}" stroke="#93674e" stroke-width="1.3" stroke-linecap="round"/>`);
    }
    if (settings.earrings && settings.earrings !== 'none') {
        const shape = settings.earrings === 'hoops' ? '<circle cx="57" cy="58" r="4"/><circle cx="103" cy="58" r="4"/>'
            : settings.earrings === 'drops' ? '<path d="M57 54v10m46-10v10"/><circle cx="57" cy="65" r="2"/><circle cx="103" cy="65" r="2"/>'
                : '<circle cx="57" cy="55" r="2"/><circle cx="103" cy="55" r="2"/>';
        faceLayers.push(`<g data-face-detail="earrings" fill="none" stroke="${ink('earrings', '#d6b85a')}" stroke-width="1.5">${shape}</g>`);
    }
    if (settings.necklace && settings.necklace !== 'none') faceLayers.push(`<g data-face-detail="necklace" fill="none" stroke="${ink('necklace', '#d6b85a')}" stroke-width="1.5"><path d="M69 79q11 17 22 0"/>${settings.necklace === 'pendant' ? '<path d="m80 87-3 4 3 4 3-4Z"/>' : ''}</g>`);
    if (settings.piercings && settings.piercings !== 'none') {
        const shape = { nostril: '<circle cx="84" cy="54" r="1"/>', nose_ring: '<circle cx="84" cy="55" r="2"/>', septum: '<path d="M78 54v2q2 3 4 0v-2"/>', brow: '<path d="m88 41 2 4"/>', lip: '<circle cx="80" cy="64" r="1"/>', paired: '<circle cx="76" cy="64" r="1"/><circle cx="84" cy="64" r="1"/>' }[settings.piercings];
        if (shape) faceLayers.push(`<g data-face-detail="piercings" fill="none" stroke="${ink('piercings', '#c3c6ce')}" stroke-width="1.2">${shape}</g>`);
    }
    if (settings.eyewear && settings.eyewear !== 'none') {
        const shape = settings.eyewear === 'round' ? '<circle cx="70" cy="49" r="7"/><circle cx="90" cy="49" r="7"/><path d="M77 48h6"/>'
            : settings.eyewear === 'monocle' ? '<circle cx="90" cy="49" r="7"/><path d="M97 50q7 7 2 15"/>'
                : '<path d="M62 44h15v11H62Zm21 0h15v11H83ZM77 48h6"/>';
        faceLayers.push(`<g data-face-detail="eyewear" fill="${settings.eyewear === 'sunglasses' ? '#333746' : 'none'}" stroke="${ink('eyewear', '#c3c6ce')}" stroke-width="1.5">${shape}</g>`);
    }
    const modifier = { messy: 'M55 21 48 17m11-7-4-6m48 17 8-5m-9-4 4-7', tousled: 'M55 22q-8-5-5-10m52 10q8-5 5-10', windblown: 'M99 19l13-7m-10 16 14-6', flyaways: 'M55 21q-10-4-7-10m55 10q10-4 7-10', sleek: 'M60 26q20-18 40 0' }[settings.hair_finish];
    const flyaways = settings.hair_style !== 'bald' && modifier ? `<path data-hair-modifier="true" d="${modifier}" fill="none" stroke="${safeHair}" stroke-width="2"/>` : '';
    const male = settings.gender === 'man';
    const torso = male
        ? 'M70 68H90V80L100 84 98 142 95 176 93 252H81L80 180 79 252H67L65 176 62 142 60 84 70 80Z'
        : 'M72 68H88V81L98 83 98 138 96 176 93 252H81L80 180 79 252H67L64 176 62 138 62 83 72 81Z';
    const head = male
        ? '<path d="M57 31Q56 15 80 15T103 31L101 58 92 70 80 75 68 70 59 58Z"/>'
        : '<ellipse cx="80" cy="46" rx="24" ry="31"/>';
    const frame = male ? ' transform="translate(-8 0) scale(1.1 1)"' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 290" role="img" aria-label="Schematic outfit preview"><ellipse cx="80" cy="271" rx="35" ry="6" fill="#161822"/><g data-avatar="${male ? 'male' : 'female'}"${frame}>${backHair}<g data-avatar-skin="true" fill="${safeSkin}" stroke="#222433" stroke-width="1.5"><path d="${torso}"/><path d="M62 80 56 79 43 143 50 146 66 86M98 80 104 79 117 143 110 146 94 86"/><path d="M65 249H78V257L83 262V266H63V257ZM83 249H96V257L101 262V266H81V257Z"/>${head}</g>${frontHair}${flyaways}${layers}<path d="M69 48h3m16 0h3m-17 12q6 4 12 0" stroke="#302931" stroke-width="2" fill="none"/>${faceLayers.join('')}</g></svg>`;
}
