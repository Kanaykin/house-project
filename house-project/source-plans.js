/* Встроенные копии исходных описаний из ../input/*.json.
   Оригиналы (first-floor-layout.json, second-floor-layout.json) редактировать нельзя,
   поэтому редактор держит собственные встраиваемые копии в этом файле. */
window.SOURCE_PLANS = {
  F1: {
    "schemaVersion": "2.0-draft",
    "documentType": "floor_plan_description",
    "floor": 1,
    "language": "ru",
    "source": { "file": "first_floor.jpg", "type": "photograph_of_drawing", "dimensionsReadable": false },
    "coordinateSystem": {
      "type": "normalized_image", "origin": "top_left",
      "xRange": [0, 1000], "yRange": [0, 1000], "accuracy": "estimated"
    },
    "measurement": { "realWorldUnits": "mm", "scaleKnown": false },
    "footprint": {
      "id": "FP-F1", "shape": "main_rectangle_with_bottom_center_projection",
      "estimatedPolygon": [[45,90],[920,70],[940,745],[670,750],[670,970],[365,970],[365,750],[30,750]],
      "verified": false
    },
    "rooms": [
      { "id":"F1-R01","label":"Большая левая зона",
        "possibleUse":["гостиная","общая комната","кухня-гостиная"], "verifiedUse":null,
        "estimatedPolygon":[[55,105],[505,95],[505,630],[565,705],[40,735]],
        "boundaryWallIds":["F1-W01","F1-W02","F1-W03","F1-W04","F1-W05"], "confidence":"medium",
        "notes":["В верхней части имеется короткая внутренняя перегородка","Назначение не подписано"] },
      { "id":"F1-R02","label":"Верхняя правая зона с лестницей",
        "possibleUse":["холл","лестничный холл"], "verifiedUse":null,
        "estimatedPolygon":[[525,90],[915,75],[930,430],[680,430],[680,575],[520,630]],
        "boundaryWallIds":["F1-W06","F1-W07","F1-W08","F1-W09"], "confidence":"medium",
        "notes":["Двухмаршевая лестница расположена вдоль верхней стены"] },
      { "id":"F1-R03","label":"Средняя правая комната",
        "possibleUse":["комната","санузел","хозяйственное помещение"], "verifiedUse":null,
        "estimatedPolygon":[[680,390],[915,390],[925,575],[680,575]],
        "boundaryWallIds":["F1-W10","F1-W11","F1-W12","F1-W13"], "confidence":"low",
        "notes":["Вход предположительно сверху или из центральной зоны"] },
      { "id":"F1-R04","label":"Нижняя правая комната",
        "possibleUse":["комната","кухня","хозяйственное помещение"], "verifiedUse":null,
        "estimatedPolygon":[[680,575],[925,575],[930,735],[650,735],[650,665]],
        "boundaryWallIds":["F1-W12","F1-W14","F1-W15","F1-W16"], "confidence":"low",
        "notes":["Вход расположен со стороны центральной зоны"] },
      { "id":"F1-R05","label":"Нижний центральный выступ",
        "possibleUse":["тамбур","крыльцо","веранда"], "verifiedUse":null,
        "estimatedPolygon":[[365,750],[670,750],[670,970],[365,970]],
        "boundaryWallIds":["F1-W17","F1-W18","F1-W19","F1-W20"], "confidence":"medium",
        "notes":["Связан с основным этажом через центральный вход"] },
      { "id":"F1-R06","label":"Центральная проходная зона",
        "possibleUse":["коридор","холл"], "verifiedUse":null,
        "estimatedPolygon":[[505,95],[680,95],[680,735],[565,735],[505,630]],
        "boundaryWallIds":["F1-W05","F1-W06","F1-W09","F1-W16","F1-W17"], "confidence":"medium",
        "notes":["Связывает левую зону, правые комнаты, лестницу и нижний вход"] }
    ],
    "walls": [
      {"id":"F1-W01","kind":"exterior","from":[45,90],"to":[505,90],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W02","kind":"exterior","from":[45,90],"to":[30,750],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W03","kind":"exterior","from":[30,750],"to":[565,735],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W04","kind":"interior","from":[75,315],"to":[490,300],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W05","kind":"interior","from":[505,90],"to":[510,625],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W06","kind":"exterior","from":[505,90],"to":[920,70],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W07","kind":"exterior","from":[920,70],"to":[940,430],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W08","kind":"interior","from":[680,385],"to":[915,385],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W09","kind":"interior","from":[675,385],"to":[675,575],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W10","kind":"interior","from":[680,385],"to":[915,385],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W11","kind":"exterior","from":[930,430],"to":[930,575],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W12","kind":"interior","from":[680,575],"to":[925,575],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W13","kind":"interior","from":[680,430],"to":[680,575],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W14","kind":"exterior","from":[930,575],"to":[930,735],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W15","kind":"exterior","from":[930,735],"to":[650,735],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W16","kind":"interior","from":[680,575],"to":[680,680],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W17","kind":"exterior","from":[365,750],"to":[365,970],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W18","kind":"exterior","from":[365,970],"to":[670,970],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W19","kind":"exterior","from":[670,970],"to":[670,750],"lengthMm":null,"status":"estimated"},
      {"id":"F1-W20","kind":"interface","from":[365,750],"to":[670,750],"lengthMm":null,"status":"estimated"}
    ],
    "doors": [
      {"id":"F1-D01","between":["outside","F1-R01"],"nearWallId":"F1-W02","widthMm":null,"swing":"visible_unverified","status":"estimated"},
      {"id":"F1-D02","between":["F1-R02","F1-R03"],"nearWallId":"F1-W08","widthMm":null,"swing":"visible_unverified","status":"estimated"},
      {"id":"F1-D03","between":["F1-R06","F1-R04"],"nearWallId":"F1-W16","widthMm":null,"swing":"visible_unverified","status":"estimated"},
      {"id":"F1-D04","between":["outside","F1-R06"],"nearWallId":"F1-W17","widthMm":null,"swing":"visible_unverified","status":"estimated"},
      {"id":"F1-D05","between":["outside","F1-R02"],"nearWallId":"F1-W07","widthMm":null,"swing":"visible_unverified","status":"low_confidence"}
    ],
    "windows": [
      {"id":"F1-O01","wallId":"F1-W01","position":"upper_left","status":"estimated"},
      {"id":"F1-O02","wallId":"F1-W02","position":"upper","status":"estimated"},
      {"id":"F1-O03","wallId":"F1-W02","position":"lower","status":"estimated"},
      {"id":"F1-O04","wallId":"F1-W03","position":"bottom_left","status":"estimated"},
      {"id":"F1-O05","wallId":"F1-W06","position":"above_stairs","status":"estimated"},
      {"id":"F1-O06","wallId":"F1-W07","position":"middle","status":"low_confidence"},
      {"id":"F1-O07","wallId":"F1-W15","position":"bottom_right","status":"estimated"},
      {"id":"F1-O08","wallId":"F1-W18","position":"center","status":"estimated"}
    ],
    "stairs": [
      {"id":"F1-S01","roomId":"F1-R02","type":"two_flight_with_landing","position":"top_right",
       "direction":"arrows_visible_requires_verification","status":"estimated"}
    ],
    "furniture": []
  },

  F2: {
    "schemaVersion": "2.0-draft",
    "documentType": "floor_plan_description",
    "floor": 2,
    "language": "ru",
    "source": { "file": "second_floor.jpg", "type": "photograph_of_drawing", "dimensionsReadable": false },
    "coordinateSystem": {
      "type": "normalized_image", "origin": "top_left",
      "xRange": [0, 1000], "yRange": [0, 1000], "accuracy": "estimated"
    },
    "measurement": { "realWorldUnits": "mm", "scaleKnown": false },
    "footprint": {
      "id":"FP-F2", "shape":"main_rectangle_with_bottom_center_projection",
      "estimatedPolygon":[[60,125],[930,115],[930,750],[660,750],[660,970],[355,970],[355,750],[35,750]],
      "verified": false
    },
    "rooms": [
      { "id":"F2-R01","label":"Верхняя левая комната","possibleUse":["спальня","кабинет"],"verifiedUse":null,
        "estimatedPolygon":[[65,135],[500,130],[500,335],[70,335]],
        "boundaryWallIds":["F2-W01","F2-W02","F2-W03","F2-W04"], "confidence":"medium" },
      { "id":"F2-R02","label":"Средняя левая комната","possibleUse":["спальня"],"verifiedUse":null,
        "estimatedPolygon":[[70,335],[500,335],[500,550],[65,550]],
        "boundaryWallIds":["F2-W03","F2-W05","F2-W06","F2-W07"], "confidence":"medium" },
      { "id":"F2-R03","label":"Нижняя левая комната","possibleUse":["спальня","кабинет"],"verifiedUse":null,
        "estimatedPolygon":[[65,550],[500,550],[500,750],[40,750]],
        "boundaryWallIds":["F2-W06","F2-W08","F2-W09","F2-W10"], "confidence":"medium" },
      { "id":"F2-R04","label":"Лестничный холл","possibleUse":["холл","лестничная зона"],"verifiedUse":null,
        "estimatedPolygon":[[500,125],[925,120],[925,535],[655,535],[655,730],[500,730]],
        "boundaryWallIds":["F2-W11","F2-W12","F2-W13","F2-W14"], "confidence":"medium",
        "notes":["Двухмаршевая лестница расположена в верхней правой части"] },
      { "id":"F2-R05","label":"Средняя правая комната","possibleUse":["спальня","общая комната"],"verifiedUse":null,
        "estimatedPolygon":[[655,245],[925,245],[925,535],[655,535]],
        "boundaryWallIds":["F2-W13","F2-W15","F2-W16","F2-W17"], "confidence":"medium" },
      { "id":"F2-R06","label":"Нижняя правая комната","possibleUse":["спальня","кабинет"],"verifiedUse":null,
        "estimatedPolygon":[[655,535],[925,535],[925,745],[655,745]],
        "boundaryWallIds":["F2-W16","F2-W18","F2-W19","F2-W20"], "confidence":"medium" },
      { "id":"F2-R07","label":"Центральный коридор","possibleUse":["коридор","холл"],"verifiedUse":null,
        "estimatedPolygon":[[500,300],[655,245],[655,745],[500,745]],
        "boundaryWallIds":["F2-W04","F2-W07","F2-W10","F2-W14","F2-W17","F2-W20"], "confidence":"medium" },
      { "id":"F2-R08","label":"Нижний центральный выступ","possibleUse":["балкон","веранда","тамбур"],"verifiedUse":null,
        "estimatedPolygon":[[355,750],[660,750],[660,970],[355,970]],
        "boundaryWallIds":["F2-W21","F2-W22","F2-W23","F2-W24"], "confidence":"medium" }
    ],
    "walls": [
      {"id":"F2-W01","kind":"exterior","from":[60,125],"to":[500,125],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W02","kind":"exterior","from":[60,125],"to":[60,335],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W03","kind":"interior","from":[70,335],"to":[500,335],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W04","kind":"interior","from":[500,125],"to":[500,335],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W05","kind":"exterior","from":[60,335],"to":[60,550],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W06","kind":"interior","from":[65,550],"to":[500,550],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W07","kind":"interior","from":[500,335],"to":[500,550],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W08","kind":"exterior","from":[60,550],"to":[35,750],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W09","kind":"exterior","from":[35,750],"to":[500,750],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W10","kind":"interior","from":[500,550],"to":[500,750],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W11","kind":"exterior","from":[500,125],"to":[930,115],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W12","kind":"exterior","from":[930,115],"to":[930,535],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W13","kind":"interior","from":[655,245],"to":[655,405],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W14","kind":"interior","from":[500,125],"to":[500,285],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W15","kind":"exterior","from":[930,245],"to":[930,535],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W16","kind":"interior","from":[655,535],"to":[925,535],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W17","kind":"interior","from":[655,405],"to":[655,535],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W18","kind":"exterior","from":[930,535],"to":[930,745],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W19","kind":"exterior","from":[930,745],"to":[655,745],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W20","kind":"interior","from":[655,535],"to":[655,745],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W21","kind":"exterior","from":[355,750],"to":[355,970],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W22","kind":"exterior","from":[355,970],"to":[660,970],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W23","kind":"exterior","from":[660,970],"to":[660,750],"lengthMm":null,"status":"estimated"},
      {"id":"F2-W24","kind":"interface","from":[355,750],"to":[660,750],"lengthMm":null,"status":"estimated"}
    ],
    "doors": [
      {"id":"F2-D01","between":["F2-R01","F2-R07"],"nearWallId":"F2-W04","status":"estimated"},
      {"id":"F2-D02","between":["F2-R02","F2-R07"],"nearWallId":"F2-W07","status":"estimated"},
      {"id":"F2-D03","between":["F2-R03","F2-R07"],"nearWallId":"F2-W10","status":"estimated"},
      {"id":"F2-D04","between":["F2-R04","F2-R05"],"nearWallId":"F2-W17","status":"estimated"},
      {"id":"F2-D05","between":["F2-R07","F2-R06"],"nearWallId":"F2-W20","status":"estimated"},
      {"id":"F2-D06","between":["outside","F2-R07"],"nearWallId":"F2-W24","status":"estimated"}
    ],
    "windows": [
      {"id":"F2-O01","wallId":"F2-W01","position":"upper_left","status":"low_confidence"},
      {"id":"F2-O02","wallId":"F2-W02","position":"upper","status":"estimated"},
      {"id":"F2-O03","wallId":"F2-W05","position":"middle","status":"estimated"},
      {"id":"F2-O04","wallId":"F2-W08","position":"lower","status":"estimated"},
      {"id":"F2-O05","wallId":"F2-W09","position":"bottom_left","status":"estimated"},
      {"id":"F2-O06","wallId":"F2-W11","position":"above_stairs","status":"estimated"},
      {"id":"F2-O07","wallId":"F2-W12","position":"upper_right","status":"estimated"},
      {"id":"F2-O08","wallId":"F2-W19","position":"bottom_right","status":"estimated"},
      {"id":"F2-O09","wallId":"F2-W22","position":"center","status":"estimated"}
    ],
    "stairs": [
      {"id":"F2-S01","roomId":"F2-R04","type":"two_flight_with_landing","position":"top_right","status":"estimated"}
    ],
    "furniture": []
  }
};
